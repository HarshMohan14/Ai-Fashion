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
import { removeBackground } from '@imgly/background-removal';

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

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode runway image canvas.'));
    }, type, quality);
  });
}

function loadBlobImage(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not load foreground runway image.'));
    };
    img.src = objectUrl;
  });
}

function detectAlphaBounds(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const sample = 2;
  const xs: number[] = [];
  const ys: number[] = [];
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let y = 0; y < height; y += sample) {
    for (let x = 0; x < width; x += sample) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 18) {
        xs.push(x);
        ys.push(y);
      }
    }
  }

  if (xs.length < 40 || ys.length < 40) return { x: 0, y: 0, width, height };
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const percentile = (values: number[], ratio: number) => values[Math.min(values.length - 1, Math.max(0, Math.floor(values.length * ratio)))] ?? 0;
  const minX = percentile(xs, 0.005);
  const maxX = percentile(xs, 0.995);
  const minY = percentile(ys, 0.002);
  const maxY = percentile(ys, 0.998);
  const subjectWidth = Math.max(1, maxX - minX);
  const subjectHeight = Math.max(1, maxY - minY);
  const marginX = Math.floor(subjectWidth * 0.08);
  const marginTop = Math.floor(subjectHeight * 0.035);
  const marginBottom = Math.floor(subjectHeight * 0.08);
  const x = Math.max(0, minX - marginX);
  const y = Math.max(0, minY - marginTop);
  return {
    x,
    y,
    width: Math.min(width - x, subjectWidth + marginX * 2),
    height: Math.min(height - y, subjectHeight + marginTop + marginBottom),
  };
}

async function extractRunwayForeground(sourceCanvas: HTMLCanvasElement) {
  const sourceBlob = await canvasToBlob(sourceCanvas, 'image/png');
  const foregroundBlob = await removeBackground(sourceBlob);
  const foregroundImg = await loadBlobImage(foregroundBlob);
  const foregroundCanvas = document.createElement('canvas');
  foregroundCanvas.width = foregroundImg.naturalWidth;
  foregroundCanvas.height = foregroundImg.naturalHeight;
  const foregroundCtx = foregroundCanvas.getContext('2d', { willReadFrequently: true });
  if (!foregroundCtx) throw new Error('Could not create runway foreground canvas.');
  foregroundCtx.drawImage(foregroundImg, 0, 0);
  return {
    canvas: foregroundCanvas,
    bounds: detectAlphaBounds(foregroundCtx, foregroundCanvas.width, foregroundCanvas.height),
  };
}

function detectSubjectBounds(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const sample = 3;
  const xs: number[] = [];
  const ys: number[] = [];

  const data = ctx.getImageData(0, 0, width, height).data;
  for (let y = 0; y < height; y += sample) {
    for (let x = 0; x < width; x += sample) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const maxChannel = Math.max(r, g, b);
      const minChannel = Math.min(r, g, b);
      const brightness = (r + g + b) / 3;
      const saturation = maxChannel - minChannel;
      const isNeutralStudioBackdrop = brightness > 185 && saturation < 30;
      const isLikelyBodyOrGarment = !isNeutralStudioBackdrop && (brightness < 190 || saturation > 46);
      if (isLikelyBodyOrGarment) {
        xs.push(x);
        ys.push(y);
      }
    }
  }

  if (xs.length < 40 || ys.length < 40) return { x: 0, y: 0, width, height };

  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const percentile = (values: number[], ratio: number) => values[Math.min(values.length - 1, Math.max(0, Math.floor(values.length * ratio)))] ?? 0;
  const minX = percentile(xs, 0.01);
  const maxX = percentile(xs, 0.99);
  const minY = percentile(ys, 0.005);
  const maxY = percentile(ys, 0.995);

  if (minX >= maxX || minY >= maxY) return { x: 0, y: 0, width, height };
  const subjectWidth = maxX - minX;
  const subjectHeight = maxY - minY;
  const marginX = Math.floor(Math.max(subjectWidth * 0.24, width * 0.035));
  const marginTop = Math.floor(Math.max(subjectHeight * 0.1, height * 0.025));
  const marginBottom = Math.floor(Math.max(subjectHeight * 0.18, height * 0.045));
  return {
    x: Math.max(0, minX - marginX),
    y: Math.max(0, minY - marginTop),
    width: Math.min(width - Math.max(0, minX - marginX), subjectWidth + marginX * 2),
    height: Math.min(height - Math.max(0, minY - marginTop), subjectHeight + marginTop + marginBottom),
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

  let subjectCanvas = sourceCanvas;
  let bounds = detectSubjectBounds(sourceCtx, sourceCanvas.width, sourceCanvas.height);
  try {
    const foreground = await extractRunwayForeground(sourceCanvas);
    subjectCanvas = foreground.canvas;
    bounds = foreground.bounds;
  } catch (error) {
    console.warn('[Dr. Stylist] Foreground extraction failed during runway normalization; using heuristic crop.', error);
  }

  const canvas = document.createElement('canvas');
  canvas.width = RUNWAY_CARD_WIDTH;
  canvas.height = RUNWAY_CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#FFFFFF');
  gradient.addColorStop(0.58, '#FFFFFF');
  gradient.addColorStop(1, '#F5F5F5');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.filter = 'blur(18px)';
  ctx.beginPath();
  ctx.ellipse(canvas.width / 2, canvas.height * 0.905, canvas.width * 0.28, canvas.height * 0.035, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(canvas.width / 2, canvas.height * 0.885, canvas.width * 0.31, canvas.height * 0.045, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const maxWidth = canvas.width * 0.84;
  const maxHeight = canvas.height * 0.82;
  const scale = Math.min(maxWidth / bounds.width, maxHeight / bounds.height);
  const drawWidth = bounds.width * scale;
  const drawHeight = bounds.height * scale;
  const drawX = (canvas.width - drawWidth) / 2;
  const targetBottomY = canvas.height * 0.905;
  const drawY = targetBottomY - drawHeight;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    subjectCanvas,
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
  parts.push('Output one vertical 9:16 full-length neutral studio fashion photograph. The model must be centered head-to-toe, feet visible, occupying about 85-90% of the image height with narrow side margins so the image fits portrait game cards consistently. The model must stand on a clean white round pedestal in a seamless white photo studio with soft diffused studio lighting and a subtle floor shadow. Do not create a smaller photo, inset rectangle, border, frame, poster, or image-within-image inside the 9:16 canvas.');
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
    2. Compulsory body description: ${physicalDescription ? `${physicalDescription}. This body description is mandatory and higher priority than beauty/fashion assumptions. Match the same body mass, shoulder width, waist, torso, legs, posture, and proportions. Do not slim, bulk up, reshape, beautify, age-shift, or idealize the model.` : 'Use the visual model references as the mandatory body source. Do not slim, bulk up, reshape, beautify, age-shift, or idealize the model.'}
    3. Canvas: Generate a vertical 9:16 portrait image, not square and not landscape. The model must be centered head-to-toe with the full body visible, feet visible, and narrow side margins. The model should occupy about 85-90% of the image height. The final image must fill the whole 9:16 canvas directly; do not place a smaller rectangular photo, inset frame, border, poster, print, or screenshot inside the canvas.
    4. Setting: Use a seamless clean white photo studio with a white round pedestal under the model's feet, soft diffused studio lighting, and a subtle floor shadow. No editorial scene, no props, no stylized environment, and no mood-driven transformation.
    5. Pose: Use a simple natural standing full-body pose on the pedestal that shows the complete outfit. Do not invent dramatic fashion poses.
    6. Garment Details: The final image generation model will NOT see the reference images. Describe the clothing references in exact visual detail: colors, patterns, fabric textures, cuts, lengths, and how they sit naturally on the same model.
    7. Photography: Raw realistic studio photograph, DSLR clarity, natural skin texture, visible pores, normal human imperfections, accurate hands and limbs, no 3D render, no CGI, no airbrushed plastic look.
    8. Style context: ${styleContext ? `${styleContext}. Use this only to clarify garment coordination or outfit intent; do not change identity, body, pose, pedestal, or background.` : 'No additional styling. Keep the output neutral and identity-first.'}
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

MANDATORY MODEL BODY: ${physicalDescription ? `${physicalDescription}. This is compulsory. Keep this exact body type, body mass, proportions, posture, shoulder-to-waist structure, limbs, and height impression. Do not slim, bulk up, reshape, beautify, age-shift, or idealize the model.` : 'Use the model reference images as the compulsory body source. Do not slim, bulk up, reshape, beautify, age-shift, or idealize the model.'}

MANDATORY RUNWAY CARD FORMAT: vertical 9:16 portrait, seamless white photo studio, soft diffused studio lighting, subtle floor shadow, one centered full-body model visible from head to toe with feet visible, standing on a clean white round pedestal, model occupying 85-90% of image height, narrow side margins, no square canvas, no landscape canvas, no wide empty whitespace, no inset photo, no inner rectangle, no border, no frame, no screenshot-within-image.`;
  
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
