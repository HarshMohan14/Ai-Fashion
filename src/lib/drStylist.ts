import { supabase, WardrobeItem } from './supabase';
import {
  generateGeminiContentWithRetry,
  renderLook,
  referenceToPart,
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
  topwear: WardrobeItem;
  bottomwear?: WardrobeItem | null;
  footwear?: WardrobeItem | null;
  accessory?: WardrobeItem | null;
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
    supabase.from('wardrobe_items').select('*'),
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

const RUNWAY_CARD_WIDTH = 1080;
const RUNWAY_CARD_HEIGHT = 1920;

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, data] = dataUrl.split(',');
  const mime = meta.match(/data:([^;]+)/)?.[1] ?? 'image/png';
  const binary = atob(data ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function loadCanvasImage(source: string): Promise<HTMLImageElement> {
  let objectUrl = '';
  const imgSource = source.startsWith('data:')
    ? source
    : await fetch(source)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not fetch generated runway image (${response.status}).`);
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        return objectUrl;
      });

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not load generated runway image for card normalization.'));
    };
    img.src = imgSource;
  });
}

function detectSubjectBounds(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const sample = 4;
  const cornerSize = Math.max(12, Math.floor(Math.min(width, height) * 0.06));
  const cornerPixels = [
    ...Array.from({ length: cornerSize }, (_, y) => [0, y] as const),
    ...Array.from({ length: cornerSize }, (_, y) => [width - cornerSize, y] as const),
    ...Array.from({ length: cornerSize }, (_, y) => [0, height - cornerSize + y] as const),
    ...Array.from({ length: cornerSize }, (_, y) => [width - cornerSize, height - cornerSize + y] as const),
  ];

  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  cornerPixels.forEach(([x, y]) => {
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    bgR += pixel[0];
    bgG += pixel[1];
    bgB += pixel[2];
  });
  bgR /= cornerPixels.length;
  bgG /= cornerPixels.length;
  bgB /= cornerPixels.length;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  const data = ctx.getImageData(0, 0, width, height).data;
  for (let y = 0; y < height; y += sample) {
    for (let x = 0; x < width; x += sample) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const distance = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      const darkness = 255 - Math.max(r, g, b);
      if (distance > 42 || darkness > 36) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (minX >= maxX || minY >= maxY) return { x: 0, y: 0, width, height };
  const marginX = Math.floor((maxX - minX) * 0.16);
  const marginY = Math.floor((maxY - minY) * 0.09);
  return {
    x: Math.max(0, minX - marginX),
    y: Math.max(0, minY - marginY),
    width: Math.min(width, maxX - minX + marginX * 2),
    height: Math.min(height, maxY - minY + marginY * 2),
  };
}

async function normalizeRunwayImageForGameCard(source: string): Promise<string> {
  const img = await loadCanvasImage(source);
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = img.naturalWidth;
  sourceCanvas.height = img.naturalHeight;
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceCtx) return source;
  sourceCtx.drawImage(img, 0, 0);

  const bounds = detectSubjectBounds(sourceCtx, sourceCanvas.width, sourceCanvas.height);
  const canvas = document.createElement('canvas');
  canvas.width = RUNWAY_CARD_WIDTH;
  canvas.height = RUNWAY_CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const maxWidth = canvas.width * 0.88;
  const maxHeight = canvas.height * 0.9;
  const scale = Math.min(maxWidth / bounds.width, maxHeight / bounds.height);
  const drawWidth = bounds.width * scale;
  const drawHeight = bounds.height * scale;
  const drawX = (canvas.width - drawWidth) / 2;
  const drawY = canvas.height * 0.055 + (maxHeight - drawHeight) / 2;

  ctx.drawImage(
    sourceCanvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  );

  return canvas.toDataURL('image/jpeg', 0.92);
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

  const topwear = items.filter((i) => i.category?.toLowerCase() === 'topwear' || i.category?.toLowerCase() === 'indian wear');
  const bottomwear = items.filter((i) => i.category?.toLowerCase() === 'bottomwear');
  const footwear = items.filter((i) => i.category?.toLowerCase() === 'footwear');
  const accessories = items.filter((i) => i.category?.toLowerCase() === 'accessories');

  const out: Permutation[] = [];
  for (let i = 0; i < opts.count; i++) {
    const model = modelPool[i % modelPool.length];
    if (!topwear.length) continue;
    const top = pick(topwear, rng);
    const bottom = bottomwear.length ? pick(bottomwear, rng) : null;
    const shoe = footwear.length ? pick(footwear, rng) : null;
    const acc = accessories.length && rng() > 0.5 ? pick(accessories, rng) : null;
    out.push({ model, topwear: top, bottomwear: bottom, footwear: shoe, accessory: acc, theme: opts.theme });
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
  const parts: string[] = [];
  parts.push(
    "reference_image_1 is the uploaded 5-angle model photosheet and is the strict sole source for the person. Use the photosheet directly as the identity reference: preserve the same face, hair, skin tone, body proportions, height impression, posture, and body structure across the final image.",
  );
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
  parts.push('Output one vertical 9:16 full-length neutral studio fashion photograph. The model must be centered head-to-toe, feet visible, occupying about 85-90% of the image height with narrow side margins so the image fits portrait game cards consistently.');
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

  const modelUrls: string[] = [];
  const modelLabels: string[] = [];

  if (p.model.photos?.closeup) { modelUrls.push(p.model.photos.closeup); modelLabels.push("Face Closeup: This is the STRICT facial identity source. Preserve exact facial features, jawline, and eyes."); }
  if (p.model.photos?.front) { modelUrls.push(p.model.photos.front); modelLabels.push("Front View: Use for core body structure and front proportions."); }
  if (p.model.photos?.side) { modelUrls.push(p.model.photos.side); modelLabels.push("Side View: Use for posture and depth."); }
  if (p.model.photos?.back) { modelUrls.push(p.model.photos.back); modelLabels.push("Back View: Use for back profile consistency."); }
  
  if (modelUrls.length === 0 && p.model.composite_url) {
    modelUrls.push(p.model.composite_url);
    modelLabels.push("Model Photosheet: This is the ONLY identity source — keep the exact face, skin tone, hair, height, and body proportions.");
  }

  if (p.model.active_reference_image) {
    modelUrls.push(p.model.active_reference_image);
    modelLabels.push('Active Generated Reference: Use only for model consistency across face, body, hair, complexion, and overall presentation. Do not copy its outfit, background, pose, or styling.');
  }

  if (modelUrls.length === 0) {
    throw new Error(`Model "${p.model.nickname}" has no valid photos attached.`);
  }

  const garmentUrls = [
    p.topwear.image_url,
    ...(p.bottomwear ? [p.bottomwear.image_url] : []),
    ...(p.footwear ? [p.footwear.image_url] : []),
    ...(p.accessory ? [p.accessory.image_url] : []),
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
    2. Canvas: Generate a vertical 9:16 portrait image, not square and not landscape. The model must be centered head-to-toe with the full body visible, feet visible, and narrow side margins. The model should occupy about 85-90% of the image height.
    3. Setting: Use a clean white studio background with no editorial scene, no props, no stylized environment, and no mood-driven transformation.
    4. Pose: Use a simple natural standing full-body pose that shows the complete outfit. Do not invent dramatic fashion poses.
    5. Garment Details: The final image generation model will NOT see the reference images. Describe the clothing references in exact visual detail: colors, patterns, fabric textures, cuts, lengths, and how they sit naturally on the same model.
    6. Photography: Raw realistic studio photograph, DSLR clarity, natural skin texture, visible pores, normal human imperfections, accurate hands and limbs, no 3D render, no CGI, no airbrushed plastic look.
    7. Style context: ${styleContext ? `${styleContext}. Use this only to clarify garment coordination or outfit intent; do not change identity, body, pose, or background.` : 'No additional styling. Keep the output neutral and identity-first.'}
    ${p.model.physical_description ? `8. Physical authenticity: ${p.model.physical_description}. Do not slim, beautify, age-shift, reshape, or idealize the model.` : ''}
    ${ragKnowledgeText ? `9. rag_knowledge_base feedback for this model, grouped by Face, Body, Style, Hair, and Complexion:\n${ragKnowledgeText}\nApply these corrections for consistency.` : ''}
    Do not use markdown formatting, bullet points, or introductory text. Just output the final image generation prompt.`
  });

  const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { temperature: 0.7 } });
  const aiResult = await generateGeminiContentWithRetry(
    () => geminiModel.generateContent(parts),
    'Runway prompt synthesis',
  );
  let synthesizedPrompt = aiResult.response.text().trim();
  synthesizedPrompt = synthesizedPrompt.slice(0, 800);
  synthesizedPrompt = `${synthesizedPrompt}

MANDATORY RUNWAY CARD FORMAT: vertical 9:16 portrait, clean white studio background, one centered full-body model visible from head to toe with feet visible, narrow side margins, no square canvas, no landscape canvas, no wide empty whitespace.`;
  
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
    { id: p.topwear.id, name: p.topwear.name, image: p.topwear.image_url, category: p.topwear.category },
    ...(p.bottomwear ? [{ id: p.bottomwear.id, name: p.bottomwear.name, image: p.bottomwear.image_url, category: p.bottomwear.category }] : []),
    ...(p.footwear ? [{ id: p.footwear.id, name: p.footwear.name, image: p.footwear.image_url, category: p.footwear.category }] : []),
    ...(p.accessory ? [{ id: p.accessory.id, name: p.accessory.name, image: p.accessory.image_url, category: p.accessory.category }] : []),
  ];
  const persistedSnapshot = snapshot.map(({ id, name, category }) => ({ id, name, image: '', category }));
  const itemIds = snapshot.map((s) => s.id);

  // Normalize every Runway image into a game-card-friendly 9:16 full-body portrait
  // before it is stored. This keeps Date or Dump cards consistent without unsafe UI zooms.
  let finalImageUrl = result.dataUrl;
  try {
    const normalizedDataUrl = await normalizeRunwayImageForGameCard(finalImageUrl);
    finalImageUrl = await uploadRunwayDataUrl(normalizedDataUrl, p.model.id);
  } catch (err) {
    console.warn('[Dr. Stylist] Failed to normalize/upload runway image, falling back to original provider output', err);
    if (finalImageUrl.startsWith('http')) {
      try {
      const response = await fetch(finalImageUrl);
      if (response.ok) {
        const blob = await response.blob();
        const fileExt = blob.type.split('/')[1] || 'jpg';
        const fileName = `runway/${p.model.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('model-photosheets')
          .upload(fileName, blob, { contentType: blob.type, upsert: true });
        
        if (!uploadError) {
          const { data: publicData } = supabase.storage
            .from('model-photosheets')
            .getPublicUrl(fileName);
          finalImageUrl = publicData.publicUrl;
        } else {
          console.error('[Dr. Stylist] Supabase storage upload failed:', uploadError);
        }
      }
      } catch (uploadErr) {
        console.warn('[Dr. Stylist] Failed to fetch and upload runway look to Supabase, falling back to provider URL', uploadErr);
      }
    }
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
