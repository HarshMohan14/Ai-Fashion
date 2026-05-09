import { supabase, WardrobeItem } from './supabase';
import {
  generateGeminiContentWithRetry,
  renderLook,
  referenceToPart,
  RUNWAY_CARD_FORMAT_PROMPT,
  toGeminiImagePart,
  type GeminiApiImagePart,
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
  theme: string;
  modelFilter?: string; // legacy: 'all' or a specific model id
  modelFilterIds?: string[];
};

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
    out.push({ model, topwear: top, bottomwear: bottom, outerwear: outr, footwear: shoe, accessory: acc, bag: bag, headwear: hw, theme: opts.theme });
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
  const styleContext = p.theme.trim();
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
  if (styleContext) {
    parts.push(`User style context: ${styleContext}. Use this only to clarify garment coordination or outfit intent; never use it to change the person's identity, body, pose, or white studio background.`);
  }
  parts.push(RUNWAY_CARD_FORMAT_PROMPT);
  if (feedback) parts.push(`Revision: ${feedback}.`);
  return parts.join(' ');
}

export function compileRagKnowledge(model: StylistModel) {
  return formatRagKnowledgeForPrompt(model.rag_feedback ?? []);
}

export async function generateLook(
  p: Permutation,
  _age?: number,
  feedback?: string,
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
  ].filter(Boolean);

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

  const styleContext = p.theme.trim();

  const ragKnowledgeText = compileRagKnowledge(p.model);

  const parts: Array<{ text: string } | GeminiApiImagePart> = [];
  parts.push({
    text:
      'You are an identity-preservation prompt writer for a fashion lab. Translate references into a precise photorealistic prompt that keeps the exact same model and selected garments.',
  });

  for (const { index, part } of referenceParts) {
    let label = '';
    if (index < modelUrls.length) {
      label = `reference_image_${index + 1} (${modelLabels[index]})`;
    } else {
      label = `reference_image_${index + 1} (wardrobe garment): dress the same subject in this garment exactly as shown.`;
    }
    parts.push({ text: label }, toGeminiImagePart(part));
  }

  parts.push({
    text: `Write a continuous, photorealistic image generation prompt describing this exact person wearing these exact clothes.
    Crucial Directives:
    1. Identity: The person must remain exactly the same as the model references. Preserve face, jaw, eyes, nose, hair, skin tone, body mass, height impression, posture, proportions, and shoulder-to-waist structure.
    2. Compulsory body description: ${physicalDescription ? `${physicalDescription}. This body description is mandatory and higher priority than beauty/fashion assumptions. Match the same body mass, shoulder width, waist, torso, legs, posture, and proportions. Do not slim, bulk up, reshape, beautify, age-shift, or idealize the model.` : 'Use the visual model references as the mandatory body source. Do not slim, bulk up, reshape, beautify, age-shift, or idealize the model.'}
    3. Canvas and setting: ${RUNWAY_CARD_FORMAT_PROMPT}
    4. Setting: Use a seamless clean white photo studio with a white round pedestal under the model's feet, soft diffused studio lighting, and a subtle floor shadow. No editorial scene, no props, no stylized environment, and no mood-driven transformation.
    5. Pose: Use a stylish outfit-aware full-body fashion pose on the pedestal that shows the complete outfit. The pose should match the garment mood and feel visually interesting, such as relaxed weight shift, one hand in pocket, subtle lean, confident shoulder angle, or natural accessory interaction. Avoid boring stiff straight standing, but do not distort body proportions or hide garments.
    6. Garment Details: The final image generation model will NOT see the reference images. Describe the clothing references in exact visual detail: colors, patterns, fabric textures, cuts, lengths, and how they sit naturally on the same model.
    7. Photography: Raw realistic studio photograph, DSLR clarity, natural skin texture, visible pores, normal human imperfections, accurate hands and limbs, no 3D render, no CGI, no airbrushed plastic look.
    8. Style context: ${styleContext ? `${styleContext}. Use this only to clarify garment coordination or outfit intent; do not change identity, body, pose, pedestal, or background.` : 'No additional styling. Keep the output neutral and identity-first.'}
    ${ragKnowledgeText ? `9. rag_knowledge_base feedback for this model, grouped by Face, Body, Style, Hair, and Complexion:\n${ragKnowledgeText}\nApply these corrections for consistency.` : ''}
    Do not use markdown formatting, bullet points, or introductory text. Just output the final image generation prompt.`
  });

  const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { temperature: 0.35 } });
  const aiResult = await generateGeminiContentWithRetry(
    () => geminiModel.generateContent(parts),
    'Runway prompt synthesis',
  );
  let synthesizedPrompt = aiResult.response.text().trim();
  synthesizedPrompt = synthesizedPrompt.slice(0, 800);
  synthesizedPrompt = `${synthesizedPrompt}

MANDATORY MODEL BODY: ${physicalDescription ? `${physicalDescription}. This is compulsory. Keep this exact body type, body mass, proportions, posture, shoulder-to-waist structure, limbs, and height impression. Do not slim, bulk up, reshape, beautify, age-shift, or idealize the model.` : 'Use the model reference images as the compulsory body source. Do not slim, bulk up, reshape, beautify, age-shift, or idealize the model.'}

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
      theme: p.theme,
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
      theme: p.theme,
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
  return { ...(data as GeneratedLook), item_snapshot: snapshot };
}
