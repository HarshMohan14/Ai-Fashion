import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai';
import { removeBackground } from '@imgly/background-removal';

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExtractedItem = {
  id: string;
  name: string;
  category: string;
  color: string;
  fabric: string;
  fit: string;
  confidence: number;
  box: BoundingBox;
  cropDataUrl?: string;
  cutoutDataUrl?: string;
  cutoutStatus?: 'pending' | 'ready' | 'failed';
};

export type ExtractionResult = {
  items: ExtractedItem[];
  mocked: boolean;
  imageWidth: number;
  imageHeight: number;
  model?: string;
};

const MODEL_FALLBACKS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash-image',
];

let lastWorkingModel: string | null = null;

export function getLastWorkingModel() {
  return lastWorkingModel;
}

const SYSTEM_INSTRUCTION = `You are Dr. Scientist, a high-precision Fashion Vision Expert. You deconstruct human outfits into individual digital assets.

Deconstruct the outfit in the image. Identify EVERY fashion item visible — including:
- Top layers: t-shirts, shirts, kurtas, sweaters, hoodies, blazers, jackets, coats
- Bottom layers: jeans, trousers, chinos, shorts, skirts, leggings, dhotis
- Footwear: sneakers, loafers, boots, sandals, heels, flats
- Accessories: watches, bracelets, rings, necklaces, sunglasses, belts, hats/caps, scarves, bags, ties
- Inner or layered garments that are partially visible (e.g. shirt under a blazer)

Rules:
- Produce ONE bounding box per item. Boxes MUST tightly wrap the item.
- normalized_vertices use the TOP-LEFT origin, values in [0, 1] relative to image width and height.
- Do NOT merge multiple items into one box. Separate each garment even if adjacent.
- Return confidence as a number 0-1.
- If the image does not contain a person or fashion items, return { "items": [] }.`;

const RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          category: { type: SchemaType.STRING },
          color_hex: { type: SchemaType.STRING },
          fabric: { type: SchemaType.STRING },
          fit: { type: SchemaType.STRING },
          confidence: { type: SchemaType.NUMBER },
          normalized_vertices: {
            type: SchemaType.OBJECT,
            properties: {
              x: { type: SchemaType.NUMBER },
              y: { type: SchemaType.NUMBER },
              width: { type: SchemaType.NUMBER },
              height: { type: SchemaType.NUMBER },
            },
            required: ['x', 'y', 'width', 'height'],
          },
        },
        required: ['name', 'category', 'color_hex', 'fabric', 'fit', 'confidence', 'normalized_vertices'],
      },
    },
  },
  required: ['items'],
};

export function hasGeminiKey() {
  return Boolean(import.meta.env.VITE_GEMINI_API_KEY);
}

export async function analyzeOutfit(file: File): Promise<ExtractionResult> {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  const objectUrl = URL.createObjectURL(file);
  const img = await loadImage(objectUrl);
  const imageWidth = img.naturalWidth;
  const imageHeight = img.naturalHeight;

  if (!key) {
    await new Promise((r) => setTimeout(r, 1400));
    URL.revokeObjectURL(objectUrl);
    return { items: adaptiveMock(imageWidth, imageHeight), mocked: true, imageWidth, imageHeight };
  }

  const { base64, mimeType } = await downscaleToBase64(img, 1536, file.type || 'image/jpeg');
  URL.revokeObjectURL(objectUrl);

  const genAI = new GoogleGenerativeAI(key);
  const orderedModels = lastWorkingModel
    ? [lastWorkingModel, ...MODEL_FALLBACKS.filter((m) => m !== lastWorkingModel)]
    : MODEL_FALLBACKS;

  let lastErr: unknown = null;
  for (const modelName of orderedModels) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2,
      },
    });

    let modelFailed = false;
    for (let attempt = 0; attempt < 2 && !modelFailed; attempt++) {
      try {
        const result = await model.generateContent([
          { inlineData: { data: base64, mimeType } },
          {
            text:
              attempt === 0
                ? 'Deconstruct this outfit. List every garment, footwear, and accessory. JSON only.'
                : 'You missed items. Re-scan carefully. Include inner layers, watches, belts, bags, and every accessory. JSON only.',
          },
        ]);
        const text = result.response.text();
        const items = parseItems(text);
        if (items.length > 0 || attempt === 1) {
          lastWorkingModel = modelName;
          return { items, mocked: false, imageWidth, imageHeight, model: modelName };
        }
      } catch (e) {
        lastErr = e;
        const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
        if (msg.includes('not found') || msg.includes('404') || msg.includes('not supported') || msg.includes('unsupported')) {
          modelFailed = true;
          break;
        }
      }
    }
  }
  if (lastErr) throw lastErr;
  return { items: [], mocked: false, imageWidth, imageHeight };
}

type RawItem = {
  name?: string;
  category?: string;
  color_hex?: string;
  fabric?: string;
  fit?: string;
  confidence?: number;
  normalized_vertices?: { x?: number; y?: number; width?: number; height?: number };
};

function parseItems(text: string): ExtractedItem[] {
  let parsed: { items?: RawItem[] } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = {};
      }
    }
  }
  const list = parsed.items || [];
  return list
    .map((raw, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      name: raw.name || 'Unnamed item',
      category: raw.category || 'Uncategorized',
      color: raw.color_hex || '#999999',
      fabric: raw.fabric || 'Unknown',
      fit: raw.fit || 'Regular',
      confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.8,
      box: {
        x: clamp01(raw.normalized_vertices?.x),
        y: clamp01(raw.normalized_vertices?.y),
        width: clamp01(raw.normalized_vertices?.width),
        height: clamp01(raw.normalized_vertices?.height),
      },
      cutoutStatus: 'pending' as const,
    }))
    .filter((i) => i.box.width > 0.02 && i.box.height > 0.02);
}

function clamp01(n: number | undefined) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function adaptiveMock(w: number, h: number): ExtractedItem[] {
  const aspect = w / h;
  const isPortrait = aspect < 1;
  const base: Array<Omit<ExtractedItem, 'id' | 'cutoutStatus'>> = isPortrait
    ? [
        { name: 'Top Layer', category: 'Topwear > Shirts', color: '#E8DFCF', fabric: 'Cotton', fit: 'Regular', confidence: 0.9, box: { x: 0.22, y: 0.1, width: 0.56, height: 0.34 } },
        { name: 'Bottom Layer', category: 'Bottomwear > Trousers', color: '#2F3A52', fabric: 'Denim', fit: 'Slim', confidence: 0.88, box: { x: 0.28, y: 0.46, width: 0.44, height: 0.42 } },
        { name: 'Footwear', category: 'Footwear > Sneakers', color: '#FFFFFF', fabric: 'Canvas', fit: 'Regular', confidence: 0.82, box: { x: 0.3, y: 0.89, width: 0.4, height: 0.1 } },
        { name: 'Wrist Accessory', category: 'Accessories > Watches', color: '#C0C0C0', fabric: 'Steel', fit: 'Regular', confidence: 0.7, box: { x: 0.16, y: 0.44, width: 0.08, height: 0.05 } },
      ]
    : [
        { name: 'Jacket', category: 'Topwear > Jackets', color: '#4A4A4A', fabric: 'Wool', fit: 'Tailored', confidence: 0.9, box: { x: 0.2, y: 0.15, width: 0.6, height: 0.5 } },
        { name: 'Trousers', category: 'Bottomwear > Trousers', color: '#1B2030', fabric: 'Wool', fit: 'Tailored', confidence: 0.85, box: { x: 0.3, y: 0.6, width: 0.4, height: 0.32 } },
        { name: 'Shoes', category: 'Footwear > Loafers', color: '#3B2418', fabric: 'Leather', fit: 'Regular', confidence: 0.8, box: { x: 0.35, y: 0.9, width: 0.3, height: 0.08 } },
      ];
  return base.map((b, i) => ({
    ...b,
    id: `mock-${Date.now()}-${i}`,
    cutoutStatus: 'pending' as const,
  }));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function downscaleToBase64(img: HTMLImageElement, maxSide: number, mimeType: string) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const outMime = mimeType.includes('png') ? 'image/png' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(outMime, 0.92);
  return { base64: dataUrl.split(',')[1] || '', mimeType: outMime };
}

export async function cropItems(imageSrc: string, items: ExtractedItem[]): Promise<ExtractedItem[]> {
  const img = await loadImage(imageSrc);
  const pad = 0.03;
  return items.map((item) => {
    const px = Math.max(0, item.box.x - pad);
    const py = Math.max(0, item.box.y - pad);
    const pw = Math.min(1 - px, item.box.width + pad * 2);
    const ph = Math.min(1 - py, item.box.height + pad * 2);

    const sx = Math.round(px * img.naturalWidth);
    const sy = Math.round(py * img.naturalHeight);
    const sw = Math.max(4, Math.round(pw * img.naturalWidth));
    const sh = Math.max(4, Math.round(ph * img.naturalHeight));

    const canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = sw * dpr;
    canvas.height = sh * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.scale(dpr, dpr);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    }
    return { ...item, cropDataUrl: canvas.toDataURL('image/png'), cutoutStatus: 'pending' as const };
  });
}

export async function removeItemBackground(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const resultBlob = await removeBackground(blob);
  return await blobToDataUrl(resultBlob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
