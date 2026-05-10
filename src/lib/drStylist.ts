import { supabase, WardrobeItem } from './supabase';
import {
  generateGeminiContentWithRetry,
  renderLook,
  referenceToPart,
  RUNWAY_CARD_FORMAT_PROMPT,
  toGeminiImagePart,
  type GeminiApiImagePart,
  type GeminiImagePart,
} from './nanoBanana';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  feedbackFromRow,
  fetchRagKnowledgeBaseRows,
  formatRagKnowledgeForPrompt,
  referenceFromRow,
  type ModelReferenceImage,
  type RagKnowledgeBaseFeedback,
} from './ragKnowledgeBase';

export type StylistModel = {
  id: string;
  nickname: string;
  primary_photo_url: string;
  composite_url?: string | null;
  photos?: {
    front?: string;
    side?: string;
    back?: string;
    closeup?: string;
    composite?: string;
    left?: string;
    right?: string;
  };
  physical_description?: string;
  active_reference_image?: string;
  active_reference_look_id?: string | null;
  model_reference?: ModelReferenceImage;
  rag_feedback?: RagKnowledgeBaseFeedback[];
};

export type Permutation = {
  model: StylistModel;
  topwear?: WardrobeItem | null;
  bottomwear?: WardrobeItem | null;
  outerwear?: WardrobeItem | null;
  footwear?: WardrobeItem | null;
  accessory?: WardrobeItem | null;
  bag?: WardrobeItem | null;
  headwear?: WardrobeItem | null;
  theme: string;
};

export type GeneratedLook = {
  id: string;
  image_url: string;
  status: string;
  theme: string;
  pose_family?: string;
  model_id: string;
  item_ids: string[];
  item_snapshot: Array<{ id: string; name: string; image: string; category: string }>;
  feedback: string;
  mocked: boolean;
  model_used: string;
  prompt: string;
  created_at: string;
};

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

export async function fetchStylistInputs() {
  const [{ data: modelsData }, { data: itemsData }, ragData] = await Promise.all([
    supabase.from('models_public').select('id, nickname, primary_photo_url, composite_url, photos, physical_description'),
    supabase.from('wardrobe_items').select('*').eq('status', 'verified'),
    fetchRagKnowledgeBaseRows(),
  ]);
  const referencesByModel = new Map<string, ModelReferenceImage>();
  const feedbackByModel = new Map<string, RagKnowledgeBaseFeedback[]>();

  (ragData ?? []).forEach((row) => {
    if (row.entry_type === 'reference' && row.is_active && !referencesByModel.has(row.model_id)) {
      referencesByModel.set(row.model_id, referenceFromRow(row));
    }

    if (row.entry_type === 'feedback') {
      const list = feedbackByModel.get(row.model_id) ?? [];
      if (list.length < 8) list.push(feedbackFromRow(row));
      feedbackByModel.set(row.model_id, list);
    }
  });
  const models = ((modelsData ?? []) as StylistModel[]).map((model) => ({
    ...model,
    active_reference_image: referencesByModel.get(model.id)?.image_url,
    active_reference_look_id: referencesByModel.get(model.id)?.look_id ?? null,
    model_reference: referencesByModel.get(model.id),
    rag_feedback: feedbackByModel.get(model.id) ?? [],
  }));
  return {
    models,
    items: (itemsData ?? []) as WardrobeItem[],
    ageMap: {} as Record<string, number>,
  };
}

export type BatchOptions = {
  count: number;
  theme?: string;
  modelFilter?: string; // legacy: 'all' or a specific model id
  modelFilterIds?: string[];
};

export type GenerateLookOptions = {
  previousPoseLabel?: string | null;
  previousPoseFamily?: string | null;
  continuityPoseLabel?: string | null;
};

type PoseSynthesis = {
  pose_label: string;
  pose_family: string;
  pose_directive: string;
  image_prompt: string;
};

const FALLBACK_POSE_LABEL = 'Dynamic stylist pose';
const FALLBACK_POSE_FAMILY = 'Anime-fashion power contrapposto';
const FALLBACK_POSE_DIRECTIVE =
  'Anime-fashion power contrapposto standing pose on the white pedestal: wide planted stance, visible S-line action through the body, tilted shoulders and hips, torso twist, one active arm with purposeful hand shape, head angled toward camera, and a focused expressive face.';

const DYNAMIC_POSE_MARKERS = [
  'curved or S-line action through the body',
  'non-parallel shoulder and hip angles',
  'clear weight shift',
  'one foot forward or wide planted stance',
  'torso twist or three-quarter body angle',
  'active arms or purposeful hands',
  'head angle',
  'intense gaze or matching facial expression',
];

function isHostedPhotosheetUrl(url: string | null | undefined): url is string {
  return /^https?:\/\//i.test(url?.trim() ?? '');
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, data] = dataUrl.split(',');
  const mime = meta.match(/data:([^;]+)/)?.[1] ?? 'image/png';
  const binary = atob(data ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function uploadRunwayDataUrl(dataUrl: string, modelId: string) {
  const blob = dataUrlToBlob(dataUrl);
  const fileName = `runway/${modelId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from('model-photosheets')
    .upload(fileName, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('model-photosheets').getPublicUrl(fileName);
  return data.publicUrl;
}

async function uploadRunwayHostedUrl(url: string, modelId: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch runway image (${response.status}).`);
  const blob = await response.blob();
  const fileExt = blob.type.split('/')[1] || 'jpg';
  const fileName = `runway/${modelId}/${Date.now()}.${fileExt}`;
  const { error } = await supabase.storage
    .from('model-photosheets')
    .upload(fileName, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('model-photosheets').getPublicUrl(fileName);
  return data.publicUrl;
}

export function buildPermutations(
  models: StylistModel[],
  items: WardrobeItem[],
  opts: BatchOptions,
  seed = Date.now(),
): Permutation[] {
  const rng = mulberry32(seed);
  const selectedIds = opts.modelFilterIds?.filter(Boolean) ?? [];
  const modelPool = selectedIds.length > 0
    ? models.filter((m) => selectedIds.includes(m.id) && isHostedPhotosheetUrl(m.composite_url))
    : opts.modelFilter && opts.modelFilter !== 'all'
      ? models.filter((m) => m.id === opts.modelFilter && isHostedPhotosheetUrl(m.composite_url))
      : models.filter((m) => isHostedPhotosheetUrl(m.composite_url));
  if (!modelPool.length) return [];

  const topwear = items.filter((i) => ['topwear', 'indian wear', 'activewear'].includes(i.category?.toLowerCase() || ''));
  const bottomwear = items.filter((i) => ['bottomwear', 'activewear'].includes(i.category?.toLowerCase() || ''));
  const outerwear = items.filter((i) => i.category?.toLowerCase() === 'outerwear');
  const footwear = items.filter((i) => i.category?.toLowerCase() === 'footwear');
  const accessories = items.filter((i) => ['accessories', 'eyewear', 'jewelry'].includes(i.category?.toLowerCase() || ''));
  const bags = items.filter((i) => i.category?.toLowerCase() === 'bags');
  const headwear = items.filter((i) => i.category?.toLowerCase() === 'headwear');

  const out: Permutation[] = [];
  for (let i = 0; i < opts.count; i++) {
    const model = modelPool[i % modelPool.length];
    const top = topwear.length ? pick(topwear, rng) : null;
    const bottom = bottomwear.length && rng() > 0.2 ? pick(bottomwear, rng) : null;
    const outr = outerwear.length && rng() > 0.5 ? pick(outerwear, rng) : null;
    const shoe = footwear.length && rng() > 0.1 ? pick(footwear, rng) : null;
    const acc = accessories.length && rng() > 0.3 ? pick(accessories, rng) : null;
    const bag = bags.length && rng() > 0.6 ? pick(bags, rng) : null;
    const hw = headwear.length && rng() > 0.5 ? pick(headwear, rng) : null;
    if (!top && !outr) continue;
    out.push({
      model,
      topwear: top,
      bottomwear: bottom,
      outerwear: outr,
      footwear: shoe,
      accessory: acc,
      bag,
      headwear: hw,
      theme: opts.theme ?? '',
    });
  }
  return out;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildPrompt(
  p: Permutation,
  feedback?: string,
  seed: number = Date.now(),
): string {
  void seed;
  const continuityPose = p.theme.trim();
  const physicalDescription = p.model.physical_description?.trim();
  const parts: string[] = [];
  parts.push(
    "reference_image_1 is the uploaded 5-angle model photosheet and is the strict sole source for the person. Use the photosheet directly as the identity reference: preserve the same face, hair, skin tone, body proportions, height impression, posture, and body structure across the final image.",
  );
  if (physicalDescription) {
    parts.push(`COMPULSORY BODY DESCRIPTION FOR THIS MODEL: ${physicalDescription}. The generated model must match this body description exactly. Do not slim, bulk up, reshape, beautify, age-shift, or idealize the body.`);
  }
  parts.push(
    "Dress the same subject in the garments shown in the remaining reference images exactly as they appear — preserve their design, color, pattern, and texture.",
  );
  parts.push(
    "Do not create a similar-looking model, do not use a textual description of the model, and do not invent identity details that are not visible in reference_image_1.",
  );
  parts.push(
    "Create exactly one final editorial fashion photograph of that same subject wearing the wardrobe items from the remaining reference images. Do not create a collage, moodboard, contact sheet, product listing, grid, side-by-side reference layout, or separate item display.",
  );
  parts.push(
    "The topwear must be worn on the upper body, bottomwear (if any) on the lower body, footwear (if any) on the feet, and accessories worn naturally as part of the outfit."
  );
  if (continuityPose) {
    parts.push(`Stored pose continuity hint: ${continuityPose}. Keep this standing pose direction only if the revision feedback does not ask for a different pose or expression.`);
  }
  parts.push(`Dr. Stylist must choose a dynamic anime-fashion standing pose and matching facial expression from broad fashion-pose knowledge, guided by the selected garments and model references. The pose must include at least four dynamic markers such as ${DYNAMIC_POSE_MARKERS.join(', ')}. Never use neutral passport stance, straight vertical posture, arms hanging symmetrically, mannequin pose, T-pose, or standing dead straight.`);
  parts.push(RUNWAY_CARD_FORMAT_PROMPT);
  if (feedback) parts.push(`Revision: ${feedback}.`);
  return parts.join(' ');
}

export function compileRagKnowledge(model: StylistModel) {
  return formatRagKnowledgeForPrompt(model.rag_feedback ?? []);
}

function selectedWardrobeItems(p: Permutation) {
  return [
    p.topwear,
    p.bottomwear,
    p.outerwear,
    p.footwear,
    p.accessory,
    p.bag,
    p.headwear,
  ].filter((item): item is WardrobeItem => Boolean(item));
}

function describeWardrobeForPrompt(p: Permutation) {
  const items = selectedWardrobeItems(p);
  if (!items.length) return 'No wardrobe item metadata is available; rely on garment reference images.';
  return items.map((item) => {
    const details = [
      item.category,
      item.subcategory,
      item.fabric,
      item.fit,
      item.color_hex ? `color ${item.color_hex}` : '',
    ].filter(Boolean).join(', ');
    return `${item.name}${details ? ` (${details})` : ''}`;
  }).join('; ');
}

function normalizePoseLabel(label: string | null | undefined) {
  return (label ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function samePoseLabel(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizePoseLabel(a);
  const right = normalizePoseLabel(b);
  return Boolean(left && right && left === right);
}

function cleanPoseLabel(value: unknown) {
  const label = typeof value === 'string' ? value.trim() : '';
  if (!label) return FALLBACK_POSE_LABEL;
  return label.replace(/^["']|["']$/g, '').slice(0, 64);
}

function cleanPoseFamily(value: unknown) {
  const family = typeof value === 'string' ? value.trim() : '';
  if (!family) return FALLBACK_POSE_FAMILY;
  return family.replace(/^["']|["']$/g, '').slice(0, 64);
}

function parsePoseSynthesis(rawText: string): PoseSynthesis | null {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = (fenced ?? rawText).trim();
  const candidates = [raw];
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<PoseSynthesis>;
      const imagePrompt = typeof parsed.image_prompt === 'string' ? parsed.image_prompt.trim() : '';
      if (!imagePrompt) continue;
      return {
        pose_label: cleanPoseLabel(parsed.pose_label),
        pose_family: cleanPoseFamily(parsed.pose_family),
        pose_directive: typeof parsed.pose_directive === 'string' && parsed.pose_directive.trim()
          ? parsed.pose_directive.trim()
          : FALLBACK_POSE_DIRECTIVE,
        image_prompt: imagePrompt,
      };
    } catch {
      // Try the next candidate shape.
    }
  }

  return null;
}

function fallbackPoseSynthesis(wardrobeSummary: string): PoseSynthesis {
  return {
    pose_label: FALLBACK_POSE_LABEL,
    pose_family: FALLBACK_POSE_FAMILY,
    pose_directive: FALLBACK_POSE_DIRECTIVE,
    image_prompt: `Create one photorealistic full-body fashion runway photograph of the exact same model wearing the selected wardrobe garments: ${wardrobeSummary}. Preserve every garment reference exactly in color, pattern, cut, texture, placement, and fit. Use an anime-fashion power contrapposto standing pose on the white round pedestal: wide planted stance, visible S-line action, shoulder and hip asymmetry, torso twist, one active arm, purposeful hand shape, head angle, and focused expressive face. Do not use a neutral straight standing posture.`,
  };
}

async function synthesizeRunwayPosePrompt({
  genAI,
  referenceParts,
  modelUrls,
  modelLabels,
  physicalDescription,
  wardrobeSummary,
  ragKnowledgeText,
  feedback,
  continuityPoseLabel,
  previousPoseLabel,
  previousPoseFamily,
}: {
  genAI: GoogleGenerativeAI;
  referenceParts: Array<{ index: number; sourceUrl: string; part: GeminiImagePart }>;
  modelUrls: string[];
  modelLabels: string[];
  physicalDescription?: string;
  wardrobeSummary: string;
  ragKnowledgeText: string;
  feedback?: string;
  continuityPoseLabel?: string | null;
  previousPoseLabel?: string | null;
  previousPoseFamily?: string | null;
}): Promise<PoseSynthesis> {
  const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { temperature: 0.45 } });

  const runSynthesis = async (forceDifferentPose: boolean) => {
    const parts: Array<{ text: string } | GeminiApiImagePart> = [];
    parts.push({
      text:
        'You are Dr. Stylist, an identity-preservation fashion runway prompt writer. Choose a standing fashion pose and matching facial expression from broad global fashion-pose knowledge, then write the final photorealistic image prompt.',
    });

    for (const { index, part } of referenceParts) {
      let label = '';
      if (index < modelUrls.length) {
        label = `reference_image_${index + 1} (${modelLabels[index]})`;
      } else {
        label = `reference_image_${index + 1} (wardrobe garment): this exact clothing, footwear, or accessory must be worn by the same model in the final image.`;
      }
      parts.push({ text: label }, toGeminiImagePart(part));
    }

    const continuityInstruction = continuityPoseLabel
      ? `Existing stored pose label for regeneration: "${continuityPoseLabel}". Keep this standing pose direction as a continuity hint unless the revision feedback explicitly asks for a different pose or facial expression.`
      : 'No existing stored pose label is provided; choose the best standing pose for these garments.';
    const previousPoseInstruction = previousPoseLabel
      ? `Previous generated pose label in this batch: "${previousPoseLabel}"${previousPoseFamily ? ` from pose family "${previousPoseFamily}"` : ''}. Choose a different adjacent standing pose family and a different display label.`
      : 'No previous batch pose label is provided.';
    const retryInstruction = forceDifferentPose
      ? 'The first response repeated the previous batch pose family or label. You must choose a clearly different dynamic standing pose family now.'
      : '';

    parts.push({
      text: `Return valid JSON only, with exactly these string keys: pose_label, pose_family, pose_directive, image_prompt.

Pose selection:
- Choose a dynamic anime-fashion standing pose automatically from broad pose knowledge. It must feel alive, like a character captured in motion, while still photorealistic and garment-first.
- The pose_directive must include at least four of these dynamic markers: ${DYNAMIC_POSE_MARKERS.join('; ')}.
- Prefer bold standing pose families such as anime-fashion power contrapposto, dynamic three-quarter runway stride, crossed-arm torso twist, hand-in-jacket power angle, wide stance with one arm extended, over-shoulder turn with active hand, jacket-sweep motion cue, watch-adjusting action line, or other dynamic standing editorial poses.
- Explicitly avoid neutral passport stance, front-facing straight vertical posture, arms hanging symmetrically, mannequin pose, T-pose, stiff catalog pose, and standing dead straight.
- Match the facial expression to the pose and garment mood. Facial expression is important: focused gaze, confident intensity, fierce calm, playful smirk, or determined expression depending on the pose.
- Do not choose seated, kneeling, crouched, lying down, jumping, or floor hero-landing poses.
- Anime character energy is allowed only as abstract body energy, silhouette, line of action, and facial intensity; do not copy characters, costumes, armor, logos, faces, powers, auras, glowing effects, weapons, props, or backgrounds.
- ${continuityInstruction}
- ${previousPoseInstruction}
- ${retryInstruction}

Image prompt rules:
- The person must remain exactly the same as the model references. Preserve face, jaw, eyes, nose, hair, skin tone, body mass, height impression, posture, proportions, and shoulder-to-waist structure.
- ${physicalDescription ? `Mandatory body description: ${physicalDescription}. Match it exactly; do not slim, bulk up, reshape, beautify, age-shift, or idealize the model.` : 'Use the visual model references as the mandatory body source; do not slim, bulk up, reshape, beautify, age-shift, or idealize the model.'}
- Selected wardrobe metadata: ${wardrobeSummary}
- Preserve the wardrobe garment reference images exactly: colors, patterns, fabric textures, cuts, lengths, placement, and fit. The final render model will not see the references, so describe garments precisely.
- Use a seamless clean white photo studio, a white round pedestal, soft diffused studio lighting, subtle floor shadow, and the fixed runway card format. The pose may use a wide stance, one foot forward, torso twist, arm foreshortening, jacket or hair motion cues, and expressive facial direction, but it must not hide major garments or crop limbs.
- ${feedback ? `Revision feedback to apply: ${feedback}` : 'No revision feedback.'}
- ${ragKnowledgeText ? `RAG knowledge base corrections for this model:\n${ragKnowledgeText}` : 'No saved RAG corrections for this model.'}

The JSON values must be:
- pose_label: 2-6 words for display.
- pose_family: 2-5 words grouping the pose mechanics for repeat avoidance.
- pose_directive: concise dynamic standing pose mechanics plus facial expression, including at least four dynamic markers.
- image_prompt: continuous photorealistic prompt for the final image.`
    });

    const aiResult = await generateGeminiContentWithRetry(
      () => geminiModel.generateContent(parts),
      forceDifferentPose ? 'Runway prompt synthesis pose retry' : 'Runway prompt synthesis',
    );
    return parsePoseSynthesis(aiResult.response.text().trim());
  };

  const first = await runSynthesis(false);
  const firstOrFallback = first ?? fallbackPoseSynthesis(wardrobeSummary);
  const repeatedLabel = previousPoseLabel && samePoseLabel(firstOrFallback.pose_label, previousPoseLabel);
  const repeatedFamily = previousPoseFamily && samePoseLabel(firstOrFallback.pose_family, previousPoseFamily);
  if (repeatedLabel || repeatedFamily) {
    const retry = await runSynthesis(true);
    if (retry) return retry;
  }
  return firstOrFallback;
}

export async function generateLook(
  p: Permutation,
  _age?: number,
  feedback?: string,
  options: GenerateLookOptions = {},
): Promise<GeneratedLook> {
  void _age;
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) {
    throw new Error('Missing VITE_GEMINI_API_KEY. Dr. Stylist needs Gemini to analyze references and generate runway images.');
  }
  const physicalDescription = p.model.physical_description?.trim();

  const modelUrls: string[] = [];
  const modelLabels: string[] = [];

  if (p.model.photos?.closeup) { modelUrls.push(p.model.photos.closeup); modelLabels.push("Face Closeup: This is the STRICT facial identity source. Preserve exact facial features, jawline, and eyes."); }
  if (p.model.photos?.front) { modelUrls.push(p.model.photos.front); modelLabels.push(`Front View: Use for core body structure and front proportions.${physicalDescription ? ` Compulsory body description: ${physicalDescription}.` : ''}`); }
  if (p.model.photos?.side) { modelUrls.push(p.model.photos.side); modelLabels.push(`Side View: Use for posture, depth, and body thickness.${physicalDescription ? ` Compulsory body description: ${physicalDescription}.` : ''}`); }
  if (p.model.photos?.back) { modelUrls.push(p.model.photos.back); modelLabels.push(`Back View: Use for back profile consistency.${physicalDescription ? ` Compulsory body description: ${physicalDescription}.` : ''}`); }
  
  if (modelUrls.length === 0 && p.model.composite_url) {
    modelUrls.push(p.model.composite_url);
    modelLabels.push(`Model Photosheet: This is the ONLY identity source - keep the exact face, skin tone, hair, height, and body proportions.${physicalDescription ? ` Compulsory body description: ${physicalDescription}.` : ''}`);
  }

  if (p.model.active_reference_image) {
    modelUrls.push(p.model.active_reference_image);
    modelLabels.push('Active Generated Reference: Use only for model consistency across face, body, hair, complexion, and overall presentation. Do not copy its outfit, background, pose, or styling.');
  }

  if (modelUrls.length === 0) {
    throw new Error(`Model "${p.model.nickname}" has no valid photos attached.`);
  }

  const garmentUrls = [
    p.topwear?.image_url,
    p.bottomwear?.image_url,
    p.outerwear?.image_url,
    p.footwear?.image_url,
    p.accessory?.image_url,
    p.bag?.image_url,
    p.headwear?.image_url,
  ].filter((url): url is string => Boolean(url));

  const referenceUrls = [...modelUrls, ...garmentUrls];

  // Step 1: Synthesize the prompt using Gemini Vision.
  const genAI = new GoogleGenerativeAI(key);
  const referenceParts = await Promise.all(
    referenceUrls.map(async (url, index) => ({
      index,
      sourceUrl: url,
      part: await referenceToPart(url),
    }))
  );

  const ragKnowledgeText = compileRagKnowledge(p.model);
  const wardrobeSummary = describeWardrobeForPrompt(p);
  const poseSynthesis = await synthesizeRunwayPosePrompt({
    genAI,
    referenceParts,
    modelUrls,
    modelLabels,
    physicalDescription,
    wardrobeSummary,
    ragKnowledgeText,
    feedback,
    continuityPoseLabel: options.continuityPoseLabel ?? (p.theme.trim() || null),
    previousPoseLabel: options.previousPoseLabel ?? null,
    previousPoseFamily: options.previousPoseFamily ?? null,
  });
  const poseLabel = poseSynthesis.pose_label;
  const poseFamily = poseSynthesis.pose_family;
  const poseDirective = poseSynthesis.pose_directive;
  let synthesizedPrompt = poseSynthesis.image_prompt.trim().slice(0, 1200);
  synthesizedPrompt = `${synthesizedPrompt}

MANDATORY MODEL BODY: ${physicalDescription ? `${physicalDescription}. This is compulsory. Keep this exact body type, body mass, proportions, posture, shoulder-to-waist structure, limbs, and height impression. Do not slim, bulk up, reshape, beautify, age-shift, or idealize the model.` : 'Use the model reference images as the compulsory body source. Do not slim, bulk up, reshape, beautify, age-shift, or idealize the model.'}

BACKEND-SELECTED STANDING POSE LABEL: ${poseLabel}

BACKEND-SELECTED POSE FAMILY: ${poseFamily}

MANDATORY BACKEND STYLIST POSE: ${poseDirective} This backend-selected pose must guide dynamic standing body positioning and facial expression only. It must include visible line of action, asymmetry, purposeful arms or hands, and expressive face. It must not change identity, body, clothing, white studio, pedestal, or 9:16 full-body framing. Never render neutral passport stance, straight vertical posture, arms hanging symmetrically, mannequin pose, T-pose, stiff catalog pose, or standing dead straight.

MANDATORY WARDROBE PRESERVATION: Use the selected wardrobe reference images as exact clothing sources. Preserve garment colors, cuts, fabric textures, patterns, placement, fit, footwear, and accessories from the wardrobe items.

MANDATORY RUNWAY CARD FORMAT: ${RUNWAY_CARD_FORMAT_PROMPT}`;
  
  if (import.meta.env.DEV) {
    console.debug('[Dr. Stylist] Final Synthesized Prompt:', synthesizedPrompt);
  }

  // Step 2: Render the image using Nano Banana.
  const pureImageParts = referenceParts.map(r => r.part);
  const faceSwapTargetUrl = p.model.photos?.closeup || p.model.active_reference_image || p.model.composite_url || p.model.primary_photo_url;
  
  const result = await renderLook({ 
    prompt: synthesizedPrompt, 
    referenceUrls,
    referenceParts: pureImageParts,
    faceSwapTargetUrl,
    modelReferenceCount: modelUrls.length,
  });

  const snapshot = [
    ...(p.topwear ? [{ id: p.topwear.id, name: p.topwear.name, image: p.topwear.image_url, category: p.topwear.category }] : []),
    ...(p.bottomwear ? [{ id: p.bottomwear.id, name: p.bottomwear.name, image: p.bottomwear.image_url, category: p.bottomwear.category }] : []),
    ...(p.outerwear ? [{ id: p.outerwear.id, name: p.outerwear.name, image: p.outerwear.image_url, category: p.outerwear.category }] : []),
    ...(p.footwear ? [{ id: p.footwear.id, name: p.footwear.name, image: p.footwear.image_url, category: p.footwear.category }] : []),
    ...(p.accessory ? [{ id: p.accessory.id, name: p.accessory.name, image: p.accessory.image_url, category: p.accessory.category }] : []),
    ...(p.bag ? [{ id: p.bag.id, name: p.bag.name, image: p.bag.image_url, category: p.bag.category }] : []),
    ...(p.headwear ? [{ id: p.headwear.id, name: p.headwear.name, image: p.headwear.image_url, category: p.headwear.category }] : []),
  ];
  const persistedSnapshot = snapshot.map(({ id, name, category }) => ({ id, name, image: '', category }));
  const itemIds = snapshot.map((s) => s.id);

  let finalImageUrl = result.dataUrl;
  try {
    if (finalImageUrl.startsWith('data:')) {
      finalImageUrl = await uploadRunwayDataUrl(finalImageUrl, p.model.id);
    } else if (finalImageUrl.startsWith('http')) {
      finalImageUrl = await uploadRunwayHostedUrl(finalImageUrl, p.model.id);
    }
  } catch (err) {
    console.warn('[Dr. Stylist] Failed to upload runway image to Supabase, falling back to provider output', err);
  }

  const { data, error } = await supabase
    .from('runway_looks')
    .insert({
      model_id: p.model.id,
      theme: poseLabel,
      item_ids: itemIds,
      item_snapshot: persistedSnapshot,
      prompt: synthesizedPrompt,
      image_url: finalImageUrl,
      status: 'draft',
      feedback: feedback ?? '',
      mocked: result.mocked,
      model_used: result.model,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    return {
      id: crypto.randomUUID(),
      image_url: finalImageUrl,
      status: 'draft',
      theme: poseLabel,
      pose_family: poseFamily,
      model_id: p.model.id,
      item_ids: itemIds,
      item_snapshot: snapshot,
      feedback: feedback ?? '',
      mocked: result.mocked,
      model_used: result.model,
      prompt: synthesizedPrompt,
      created_at: new Date().toISOString(),
    };
  }
  return { ...(data as GeneratedLook), item_snapshot: snapshot, pose_family: poseFamily };
}
