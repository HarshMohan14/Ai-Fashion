import { supabase, WardrobeItem } from './supabase';
import { renderLook } from './nanoBanana';

export type StylistModel = {
  id: string;
  nickname: string;
  primary_photo_url: string;
  composite_url?: string | null;
};

export type Permutation = {
  model: StylistModel;
  topwear: WardrobeItem;
  bottomwear: WardrobeItem;
  footwear: WardrobeItem;
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
    supabase.from('models_public').select('id, nickname, primary_photo_url, composite_url'),
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

  const topwear = items.filter((i) => i.category === 'Topwear');
  const bottomwear = items.filter((i) => i.category === 'Bottomwear');
  const footwear = items.filter((i) => i.category === 'Footwear');
  const accessories = items.filter((i) => i.category === 'Accessories');

  const out: Permutation[] = [];
  for (let i = 0; i < opts.count; i++) {
    const model = modelPool[i % modelPool.length];
    if (!topwear.length || !bottomwear.length || !footwear.length) continue;
    const top = pick(topwear, rng);
    const bottom = pick(bottomwear, rng);
    const shoe = pick(footwear, rng);
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
    "The topwear must be worn on the upper body, bottomwear on the lower body, footwear on the feet, and accessories worn naturally as part of the outfit.",
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
  const prompt = buildPrompt(p, feedback, Math.floor(Math.random() * 1e9));
  const photosheetUrl = p.model.composite_url?.trim();

  if (!isHostedPhotosheetUrl(photosheetUrl)) {
    throw new Error(`Model "${p.model.nickname}" needs a hosted 5-angle photosheet URL before Runway generation.`);
  }

  const referenceUrls: string[] = [
    photosheetUrl,
    p.topwear.image_url,
    p.bottomwear.image_url,
    p.footwear.image_url,
    ...(p.accessory ? [p.accessory.image_url] : []),
  ].filter(Boolean);

  const result = await renderLook({ prompt, referenceUrls });

  const snapshot = [
    { id: p.topwear.id, name: p.topwear.name, image: p.topwear.image_url, category: 'Topwear' },
    { id: p.bottomwear.id, name: p.bottomwear.name, image: p.bottomwear.image_url, category: 'Bottomwear' },
    { id: p.footwear.id, name: p.footwear.name, image: p.footwear.image_url, category: 'Footwear' },
    ...(p.accessory ? [{ id: p.accessory.id, name: p.accessory.name, image: p.accessory.image_url, category: 'Accessories' }] : []),
  ];
  const persistedSnapshot = snapshot.map(({ id, name, category }) => ({ id, name, image: '', category }));
  const itemIds = snapshot.map((s) => s.id);

  const { data, error } = await supabase
    .from('runway_looks')
    .insert({
      model_id: p.model.id,
      theme: p.theme,
      item_ids: itemIds,
      item_snapshot: persistedSnapshot,
      prompt,
      image_url: result.dataUrl,
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
      image_url: result.dataUrl,
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
