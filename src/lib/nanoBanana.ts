import { GoogleGenerativeAI } from '@google/generative-ai';

const IMAGE_MODEL_FALLBACKS = [
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-image-preview',
  'gemini-2.0-flash-exp-image-generation',
];

export type ReRenderInput = {
  cropDataUrl: string;
  category: string;
  colorHex: string;
  fabric: string;
  extraInstructions?: string;
};

export type ReRenderResult = {
  dataUrl: string;
  model: string;
};

export function hasBananaKey() {
  return Boolean(import.meta.env.VITE_GEMINI_API_KEY);
}

function buildPrompt({ category, colorHex, fabric, extraInstructions }: ReRenderInput) {
  const base = `Generate a high-resolution, professional product shot of this exact ${category}. The item should be perfectly flat-laid or on a ghost mannequin, clean of wrinkles, centered on a pure #FFFFFF white background. Maintain the exact color: ${colorHex} and texture: ${fabric}. Do NOT invent patterns, logos, or details that aren't visible in the source. Output a single clean studio image.`;
  return extraInstructions ? `${base}\n\nAdditional: ${extraInstructions}` : base;
}

function dataUrlToInline(dataUrl: string) {
  const [meta, data] = dataUrl.split(',');
  const mimeMatch = meta.match(/data:([^;]+)/);
  return { data: data || '', mimeType: mimeMatch?.[1] || 'image/png' };
}

export async function reRenderItem(input: ReRenderInput): Promise<ReRenderResult> {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) {
    return simulateReRender(input);
  }

  const genAI = new GoogleGenerativeAI(key);
  const inline = dataUrlToInline(input.cropDataUrl);
  const prompt = buildPrompt(input);

  let lastErr: unknown = null;
  for (const modelName of IMAGE_MODEL_FALLBACKS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          // @ts-expect-error — responseModalities is supported by image-generation models
          responseModalities: ['Image'],
          temperature: 0.4,
        },
      });
      const result = await model.generateContent([
        { inlineData: inline },
        { text: prompt },
      ]);
      const parts = result.response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const img = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
        if (img?.data) {
          const mime = img.mimeType || 'image/png';
          return { dataUrl: `data:${mime};base64,${img.data}`, model: modelName };
        }
      }
    } catch (e) {
      lastErr = e;
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
      if (
        !msg.includes('not found') &&
        !msg.includes('404') &&
        !msg.includes('not supported') &&
        !msg.includes('unsupported')
      ) {
        break;
      }
    }
  }

  if (lastErr) {
    // Fall back to a deterministic "studio" recomposition so the UX never dead-ends.
    return simulateReRender(input);
  }
  return simulateReRender(input);
}

async function simulateReRender(input: ReRenderInput): Promise<ReRenderResult> {
  await new Promise((r) => setTimeout(r, 1200));
  const img = await loadImage(input.cropDataUrl);
  const size = 768;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: input.cropDataUrl, model: 'simulated' };

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);

  const scale = Math.min((size * 0.82) / img.naturalWidth, (size * 0.82) / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const x = (size - w) / 2;
  const y = (size - h) / 2;

  ctx.shadowColor = 'rgba(0,0,0,0.12)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  ctx.drawImage(img, x, y, w, h);

  return { dataUrl: canvas.toDataURL('image/png'), model: 'simulated' };
}

export type LookRenderInput = {
  prompt: string;
  referenceUrls: string[];
};

export type LookRenderResult = {
  dataUrl: string;
  model: string;
  mocked: boolean;
};

type GeminiImagePart = { inlineData: { data: string; mimeType: string } };

function isHostedUrl(url: string) {
  return /^https?:\/\//i.test(url.trim());
}

function mimeTypeFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith('.png')) return 'image/png';
    if (pathname.endsWith('.webp')) return 'image/webp';
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
  } catch {
    // Fall through to the common photosheet format.
  }
  return 'image/jpeg';
}

async function referenceToPart(url: string): Promise<GeminiImagePart> {
  const sourceUrl = url.trim();
  if (sourceUrl.startsWith('data:')) return { inlineData: dataUrlToInline(sourceUrl) };
  if (!isHostedUrl(sourceUrl)) throw new Error('Image reference is not a hosted URL or data URL.');

  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Could not fetch image reference (${res.status}).`);
  const blob = await res.blob();
  const contentType = res.headers.get('content-type')?.split(';')[0]?.trim();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const inline = dataUrlToInline(dataUrl);
  return {
    inlineData: {
      data: inline.data,
      mimeType: contentType && contentType.startsWith('image/')
        ? contentType
        : inline.mimeType || mimeTypeFromUrl(sourceUrl),
    },
  };
}

export async function renderLook(input: LookRenderInput): Promise<LookRenderResult> {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) {
    throw new Error('Missing VITE_GEMINI_API_KEY. Runway needs Gemini to compose the model wearing wardrobe items.');
  }

  const genAI = new GoogleGenerativeAI(key);
  const referenceParts = await Promise.all(
    input.referenceUrls.map(async (url, index) => ({
      index,
      sourceUrl: url,
      part: await referenceToPart(url),
    })),
  );

  const parts: Array<{ text: string } | GeminiImagePart> = [];
  for (const { index, sourceUrl, part } of referenceParts) {
    const label = index === 0
      ? `reference_image_1 (model photosheet, sourced from Supabase at ${sourceUrl}): this is the ONLY identity source — keep the exact face, skin tone, hair, height, and body proportions.`
      : `reference_image_${index + 1} (wardrobe garment): dress the same subject in this garment exactly as shown. Do not describe it in the output, just render it worn.`;
    parts.push({ text: label }, part);
  }
  parts.push({ text: input.prompt });

  if (import.meta.env.DEV) {
    console.debug(
      '[Dr. Stylist] Gemini reference payload',
      referenceParts.map(({ index, sourceUrl, part }) => ({
        reference: `reference_image_${index + 1}`,
        transport: 'inlineData.base64',
        sourceUrl,
        mimeType: part.inlineData.mimeType,
      })),
    );
  }

  let lastErr: unknown = null;
  for (const modelName of IMAGE_MODEL_FALLBACKS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          // @ts-expect-error — responseModalities is supported by image-generation models
          responseModalities: ['Image'],
          temperature: 0.55,
        },
      });
      const result = await model.generateContent(parts);
      const parts = result.response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const img = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
        if (img?.data) {
          const mime = img.mimeType || 'image/png';
          return { dataUrl: `data:${mime};base64,${img.data}`, model: modelName, mocked: false };
        }
      }
      lastErr = new Error(`${modelName} returned no composed image.`);
    } catch (e) {
      lastErr = e;
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
      if (!msg.includes('not found') && !msg.includes('404') && !msg.includes('not supported') && !msg.includes('unsupported')) {
        break;
      }
    }
  }
  throw (lastErr instanceof Error ? lastErr : new Error('Gemini did not return a composed runway image.'));
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
