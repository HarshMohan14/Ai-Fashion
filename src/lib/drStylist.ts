import { supabase, WardrobeItem } from './supabase';
import { renderLook, referenceToPart } from './nanoBanana';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
  rag_memory?: string;
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
  const [{ data: modelsData }, { data: itemsData }] = await Promise.all([
    supabase.from('models_public').select('id, nickname, primary_photo_url, composite_url, photos, physical_description, rag_memory'),
    supabase.from('wardrobe_items').select('*'),
  ]);
  return {
    models: (modelsData ?? []) as StylistModel[],
    items: (itemsData ?? []) as WardrobeItem[],
    ageMap: {} as Record<string, number>,
  };
}

export type BatchOptions = {
  count: number;
  theme: string;
  modelFilter: string; // 'all' or a specific model id
};

function isHostedPhotosheetUrl(url: string | null | undefined): url is string {
  return /^https?:\/\//i.test(url?.trim() ?? '');
}

export function buildPermutations(
  models: StylistModel[],
  items: WardrobeItem[],
  opts: BatchOptions,
  seed = Date.now(),
): Permutation[] {
  const rng = mulberry32(seed);
  const modelPool = opts.modelFilter === 'all'
    ? models.filter((m) => isHostedPhotosheetUrl(m.composite_url))
    : models.filter((m) => m.id === opts.modelFilter && isHostedPhotosheetUrl(m.composite_url));
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

const EDITORIAL_POSES = [
  'three-quarter turn with one hand relaxed in the pocket and a confident side glance',
  'mid-stride walking shot, slight motion in the fabric, looking off-frame',
  'contrapposto stance, weight on the back leg, shoulders angled toward the light',
  'arms loosely crossed, chin slightly lifted, direct editorial gaze',
  'leaning subtly forward, hands tucked into pockets, head tilted',
  'over-the-shoulder glance with the body turned away from the camera',
  'hands adjusting a cuff or collar, gaze downcast, candid editorial moment',
];

export function buildPrompt(
  p: Permutation,
  feedback?: string,
  seed: number = Date.now(),
): string {
  const pose = EDITORIAL_POSES[Math.floor(mulberry32(seed)() * EDITORIAL_POSES.length)];
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
    parts.push(`User style context: ${styleContext}. Apply this only to styling mood, pose, setting, lighting, and editorial direction; never use it to change the person's identity.`);
  }
  parts.push(`Pose direction: ${pose}.`);
  parts.push('Output one full-length editorial fashion composition with the complete outfit clearly visible on the model.');
  if (feedback) parts.push(`Revision: ${feedback}.`);
  return parts.join(' ');
}

export async function generateLook(
  p: Permutation,
  _age?: number,
  feedback?: string,
): Promise<GeneratedLook> {
  void _age;
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) {
    throw new Error('Missing VITE_GEMINI_API_KEY. Dr. Stylist needs Gemini to analyze the model and wardrobe.');
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

  // Step 1: Synthesize the prompt using Gemini Vision
  const genAI = new GoogleGenerativeAI(key);
  const referenceParts = await Promise.all(
    referenceUrls.map(async (url, index) => ({
      index,
      sourceUrl: url,
      part: await referenceToPart(url),
    }))
  );

  const pose = EDITORIAL_POSES[Math.floor(Math.random() * EDITORIAL_POSES.length)];
  const styleContext = p.theme.trim();

  const parts: any[] = [];
  parts.push({ text: "You are an Elite Fashion Director. Your job is to translate the provided reference images into a highly detailed, professional text-to-image generation prompt." });

  for (const { index, part } of referenceParts) {
    let label = '';
    if (index < modelUrls.length) {
      label = `reference_image_${index + 1} (${modelLabels[index]})`;
    } else {
      label = `reference_image_${index + 1} (wardrobe garment): dress the same subject in this garment exactly as shown.`;
    }
    parts.push({ text: label }, part);
  }

  parts.push({
    text: `Write a continuous, photorealistic image generation prompt describing this exact person wearing these exact clothes. 
    Crucial Directives:
    1. Setting: The final output must be set on a clean, white studio background.
    2. Garment Details (CRITICAL): The final image generation model will NOT see the reference images. You MUST describe the clothing references in excruciating visual detail. Describe the exact colors, patterns, fabric textures, cuts, lengths, and how they drape on the model.
    3. Photography Style: Must look like an unretouched, raw, high-end editorial photograph. Specify "Shot on DSLR, 85mm lens, natural skin texture, visible pores, subtle skin imperfections, raw photography, highly detailed."
    4. Negative constraints: Strictly avoid any 3D render, CGI, airbrushed, plastic, or "AI-generated" aesthetic. Skin should not look perfectly smooth.
    5. Styling: The styling should reflect a modern Indian fashion sense. Keep it accessible and culturally resonant; do NOT make it look like overly abstract or bizarre high-fashion avant-garde.
    6. Pose direction: ${pose}.
    7. Incorporate this specific user style context: ${styleContext}.
    ${p.model.physical_description ? `8. PHYSICAL AUTHENTICITY (CRITICAL): The subject's authentic physical description is: "${p.model.physical_description}". You MUST strictly adhere to this body type. Do NOT default to a slim or idealized fashion mannequin body. Preserve the authentic physical mass and structure.` : ''}
    ${p.model.rag_memory ? `9. IDENTITY RAG MEMORY (CRITICAL): Past generations of this specific model failed due to these flaws. You MUST enforce these rules to avoid repeating past mistakes: \n${p.model.rag_memory}` : ''}
    ${feedback ? `10. Revision feedback: ${feedback}` : ''}
    Do not use markdown formatting, bullet points, or introductory text. Just output the final image generation prompt.`
  });

  const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { temperature: 0.7 } });
  const aiResult = await geminiModel.generateContent(parts);
  let synthesizedPrompt = aiResult.response.text().trim();
  synthesizedPrompt = synthesizedPrompt.slice(0, 800); // Truncate to avoid URI Too Long errors
  
  if (import.meta.env.DEV) {
    console.debug('[Dr. Stylist] Final Synthesized Prompt:', synthesizedPrompt);
  }

  // Step 2: Render the image using Nano Banana
  const pureImageParts = referenceParts.map(r => r.part);
  const faceSwapTargetUrl = p.model.photos?.closeup || p.model.composite_url || p.model.primary_photo_url;
  
  const result = await renderLook({ 
    prompt: synthesizedPrompt, 
    referenceUrls,
    referenceParts: pureImageParts,
    faceSwapTargetUrl,
    physicalDescription: p.model.physical_description,
  });

  const snapshot = [
    { id: p.topwear.id, name: p.topwear.name, image: p.topwear.image_url, category: p.topwear.category },
    ...(p.bottomwear ? [{ id: p.bottomwear.id, name: p.bottomwear.name, image: p.bottomwear.image_url, category: p.bottomwear.category }] : []),
    ...(p.footwear ? [{ id: p.footwear.id, name: p.footwear.name, image: p.footwear.image_url, category: p.footwear.category }] : []),
    ...(p.accessory ? [{ id: p.accessory.id, name: p.accessory.name, image: p.accessory.image_url, category: p.accessory.category }] : []),
  ];
  const persistedSnapshot = snapshot.map(({ id, name, category }) => ({ id, name, image: '', category }));
  const itemIds = snapshot.map((s) => s.id);

  // Download the temporary Replicate image and upload it to Supabase Storage
  let finalImageUrl = result.dataUrl;
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
    } catch (err) {
      console.warn('[Dr. Stylist] Failed to fetch and upload runway look to Supabase, falling back to Replicate URL', err);
    }
  }

  const { data, error } = await supabase
    .from('runway_looks')
    .insert({
      model_id: p.model.id,
      theme: p.theme,
      item_ids: itemIds,
      item_snapshot: persistedSnapshot,
      prompt,
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
      prompt,
      created_at: new Date().toISOString(),
    };
  }
  return { ...(data as GeneratedLook), item_snapshot: snapshot };
}
