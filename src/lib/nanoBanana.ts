import { GoogleGenerativeAI } from '@google/generative-ai';

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

const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

function buildPrompt({ category, colorHex, fabric, extraInstructions }: ReRenderInput) {
  const base = `Generate a high-resolution, professional product shot of this exact ${category}. The item should be perfectly flat-laid or on a ghost mannequin, clean of wrinkles, centered on a pure #FFFFFF white background. Maintain the exact color: ${colorHex} and texture: ${fabric}. Do NOT invent patterns, logos, or details that aren't visible in the source. Output a single clean studio image.`;
  return extraInstructions ? `${base}\n\nAdditional: ${extraInstructions}` : base;
}

function dataUrlToInline(dataUrl: string) {
  const [meta, data] = dataUrl.split(',');
  const mimeMatch = meta.match(/data:([^;]+)/);
  return { data: data || '', mimeType: mimeMatch?.[1] || 'image/png' };
}

function dataUrlToReferencePart(dataUrl: string, sourceUrl?: string): ImageReferencePart {
  const inlineData = dataUrlToInline(dataUrl);
  return {
    dataUrl,
    inlineData,
    mimeType: inlineData.mimeType,
    sourceUrl,
  };
}

export async function reRenderItem(input: ReRenderInput): Promise<ReRenderResult> {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) {
    return simulateReRender(input);
  }

  const genAI = new GoogleGenerativeAI(key);
  const inline = dataUrlToInline(input.cropDataUrl);
  const prompt = buildPrompt(input);

  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_IMAGE_MODEL });
    const result = await generateGeminiContentWithRetry(
      () => model.generateContent([
        { inlineData: inline },
        { text: prompt },
      ]),
      'Extraction rerender',
    );
    const responseParts = result.response.candidates?.[0]?.content?.parts ?? [];
    for (const part of responseParts) {
      const img = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
      if (img?.data) {
        const mime = img.mimeType || 'image/png';
        return { dataUrl: `data:${mime};base64,${img.data}`, model: GEMINI_IMAGE_MODEL };
      }
    }
  } catch (e) {
    console.error('[Nano Banana] Extraction Lab Re-render error:', e);
  }

  // Fall back to a deterministic "studio" recomposition so the UX never dead-ends.
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
  referenceParts?: GeminiImagePart[];
  faceSwapTargetUrl?: string;
  modelReferenceCount: number;
};

export type LookRenderResult = {
  dataUrl: string;
  model: string;
  mocked: boolean;
};

export type ImageReferencePart = {
  dataUrl: string;
  inlineData: { data: string; mimeType: string };
  mimeType: string;
  sourceUrl?: string;
};
export type GeminiImagePart = ImageReferencePart;
export type GeminiApiImagePart = { inlineData: { data: string; mimeType: string } };
type GeminiTextPart = { text: string };
type GeminiContentPart = GeminiApiImagePart | GeminiTextPart;
type GeminiResponsePart = { inlineData?: { data?: string; mimeType?: string } };
type FaceSwapProvider = 'replicate' | 'none';
type ReplicateFaceModel = 'flux-pulid' | 'codeplugtech';
type RunwayCardLayoutValidation = { ok: boolean; issues: string[] };

export const RUNWAY_CARD_FORMAT_PROMPT = `FIXED RUNWAY CARD OUTPUT FORMAT: Generate the final image as a true vertical 9:16 portrait bitmap. The entire returned image must be this 9:16 studio card directly, not a square or landscape image and not a 9:16 page containing a smaller rectangular photo. Show one centered full-body model from head to toe with feet visible, standing on a clean white round pedestal in a seamless white photo studio with soft diffused studio lighting and a subtle floor shadow. Keep narrow side margins and make the model plus pedestal fit naturally inside the 9:16 frame. Use a stylish outfit-aware fashion pose while preserving exact body proportions. No crop, no inset photo, no inner rectangle, no border, no frame, no poster, no screenshot-within-image.`;

const REPLICATE_FLUX_PULID_VERSION = '8baa7ef2255075b46f4d91cd238c21d31181b3e6a864463f967960bb0112525b';
const REPLICATE_CODEPLUGTECH_FACE_SWAP_VERSION = '278a81e7ebb22db98bcba54de985d22cc1abeead2754eb1f2af717247be69b34';

async function runWithRetry<T>(
  run: () => Promise<T>,
  label: string,
  maxRetries = 2,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !isRetryableProviderError(error)) break;
      const delay = Math.min(1200 * 2 ** attempt, 6000) + Math.floor(Math.random() * 250);
      console.warn(`[AI Provider] ${label} failed transiently. Retrying in ${delay}ms...`, error);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed.`);
}

export function generateGeminiContentWithRetry<T>(
  run: () => Promise<T>,
  label: string,
  maxRetries = 2,
) {
  return runWithRetry(run, label, maxRetries);
}

export function toGeminiImagePart(part: GeminiImagePart): GeminiApiImagePart {
  return { inlineData: part.inlineData };
}

function withRunwayCardFormat(prompt: string) {
  return `${prompt.trim()}\n\n${RUNWAY_CARD_FORMAT_PROMPT}`;
}

function isRetryableProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|err_network_changed|network|timeout|temporarily unavailable|rate limit|429|500|502|503|504/i.test(message);
}

export function isHostedUrl(url: string) {
  return /^https?:\/\//i.test(url.trim());
}

export function mimeTypeFromUrl(url: string) {
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

export async function referenceToPart(url: string): Promise<GeminiImagePart> {
  const sourceUrl = url.trim();
  if (sourceUrl.startsWith('data:')) return dataUrlToReferencePart(sourceUrl, sourceUrl);
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
    dataUrl,
    inlineData: {
      data: inline.data,
      mimeType: contentType && contentType.startsWith('image/')
        ? contentType
        : inline.mimeType || mimeTypeFromUrl(sourceUrl),
    },
    mimeType: contentType && contentType.startsWith('image/')
      ? contentType
      : inline.mimeType || mimeTypeFromUrl(sourceUrl),
    sourceUrl,
  };
}

export async function renderLook(input: LookRenderInput): Promise<LookRenderResult> {
  if (!input.prompt) {
    throw new Error('No prompt provided for image generation.');
  }

  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) {
    throw new Error('Missing VITE_GEMINI_API_KEY. Runway needs Gemini to compose the model wearing wardrobe items.');
  }

  const genAI = new GoogleGenerativeAI(key);
  let baseGeneratedImage = '';
  let modelUsed = '';
  const referenceParts = input.referenceParts ?? [];
  const modelReferenceCount = Math.max(0, Math.min(input.modelReferenceCount, referenceParts.length));
  const garmentReferenceParts = referenceParts.slice(modelReferenceCount);

  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_IMAGE_MODEL });
    let attempts = 0;
    const maxAttempts = 3; // Initial attempt + one layout redraw + one garment redraw.
    let layoutRedrawUsed = false;
    let garmentRedrawUsed = false;
    let currentPrompt = withRunwayCardFormat(input.prompt);

    while (attempts < maxAttempts) {
      attempts++;
      if (import.meta.env.DEV) console.log(`[Dr. Stylist] Generation attempt ${attempts}...`);

      const generatePayload: GeminiContentPart[] = [
        ...referenceParts.map(toGeminiImagePart),
        { text: currentPrompt },
      ];

      const result = await generateGeminiContentWithRetry(
        () => model.generateContent(generatePayload),
        `Runway image generation attempt ${attempts}`,
      );

      const parts = result.response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const img = (part as GeminiResponsePart).inlineData;
        if (img?.data) {
          const mime = img.mimeType || 'image/jpeg';
          baseGeneratedImage = `data:${mime};base64,${img.data}`;
          modelUsed = GEMINI_IMAGE_MODEL;
          break;
        }
      }

      if (!baseGeneratedImage) {
        throw new Error('Gemini model did not return inlineData.');
      }

      const layoutValidation = await validateRunwayCardLayout(baseGeneratedImage);
      if (!layoutValidation.ok) {
        if (!layoutRedrawUsed && attempts < maxAttempts) {
          layoutRedrawUsed = true;
          if (import.meta.env.DEV) {
            console.warn('[Dr. Stylist] Image failed fixed card layout validation. Redrawing...', layoutValidation.issues);
          }
          currentPrompt = withRunwayCardFormat(`${input.prompt}

CRITICAL LAYOUT CORRECTION BASED ON PREVIOUS FAILED ATTEMPT:
The previous image failed because: ${layoutValidation.issues.join('; ')}.
Regenerate as one direct 9:16 portrait studio image. Do not place the model inside a smaller rectangular photo, white page, poster, frame, border, or screenshot. The model and white round pedestal must fill the 9:16 card naturally with head and feet visible.`);
          baseGeneratedImage = '';
          continue;
        }
        throw new Error(`Generated runway image failed fixed 9:16 card validation: ${layoutValidation.issues.join('; ')}`);
      }

      if (attempts < maxAttempts && referenceParts.length > 0) {
        if (import.meta.env.DEV) console.log(`[Dr. Stylist] Critiquing attempt ${attempts}...`);
        const criticModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const generatedImagePart: GeminiImagePart = dataUrlToReferencePart(baseGeneratedImage, 'generated-runway');
        const garmentCritiqueText = await critiqueGarments(criticModel, garmentReferenceParts, generatedImagePart);

        if (import.meta.env.DEV) {
          console.log(`[Dr. Stylist] Garment Critique Result: ${garmentCritiqueText}`);
        }

        const garmentFlaws = parseCritiqueFlaws(garmentCritiqueText);

        if (critiqueIsPerfect(garmentCritiqueText)) {
          if (import.meta.env.DEV) console.log('[Dr. Stylist] Image passed critique. Proceeding.');
          break;
        } else if (!garmentRedrawUsed) {
          garmentRedrawUsed = true;
          if (import.meta.env.DEV) console.log('[Dr. Stylist] Image failed garment critique. Redrawing...');
          currentPrompt = withRunwayCardFormat(`${input.prompt}

CRITICAL CORRECTIONS BASED ON PREVIOUS FAILED ATTEMPT:
Garment flaws to fix: ${garmentFlaws || 'No garment flaws reported.'}
Keep the background neutral white, preserve every selected garment, and keep the model references available only for consistency.
Maintain the same fixed vertical 9:16 portrait card format exactly.`);
          baseGeneratedImage = ''; // Reset for next iteration
          continue;
        } else {
          if (import.meta.env.DEV) console.warn('[Dr. Stylist] Garment redraw already used. Proceeding with latest valid layout image.');
          break;
        }
      }
    }
  } catch (e) {
    console.error('[Nano Banana] Gemini Image Error:', e);
    throw e instanceof Error ? e : new Error('Failed to generate runway image with Gemini.');
  }

  // --- STEP 3: Automated Face-Swap ---
  if (input.faceSwapTargetUrl) {
    const faceSwapProvider = getFaceSwapProvider();
    if (faceSwapProvider === 'replicate') {
      const swapped = await runReplicateFaceSwap(baseGeneratedImage, input.faceSwapTargetUrl, input.prompt);
      return { dataUrl: swapped.imageUrl, model: `${modelUsed} + ${swapped.modelName}`, mocked: false };
    }
  }

  return { dataUrl: baseGeneratedImage, model: modelUsed, mocked: false };
}

function getFaceSwapProvider(): FaceSwapProvider {
  const configured = (import.meta.env.VITE_RUNWAY_FACE_SWAP_PROVIDER as string | undefined)?.toLowerCase().trim();
  if (configured === 'none') return configured;
  return 'replicate';
}

async function runReplicateFaceSwap(
  generatedImageDataUrl: string,
  faceReferenceUrl: string,
  runwayPrompt: string,
) {
  const replicateToken = import.meta.env.VITE_REPLICATE_API_TOKEN as string | undefined;
  if (!replicateToken) {
    throw new Error('VITE_REPLICATE_API_TOKEN is required when VITE_RUNWAY_FACE_SWAP_PROVIDER=replicate.');
  }

  const faceModel = getReplicateFaceModel();
  if (faceModel === 'flux-pulid') {
    return runReplicateFluxPulid(replicateToken, faceReferenceUrl, runwayPrompt);
  }

  return runReplicateCodeplugtechFaceSwap(replicateToken, generatedImageDataUrl, faceReferenceUrl);
}

function getReplicateFaceModel(): ReplicateFaceModel {
  const configured = (import.meta.env.VITE_REPLICATE_FACE_MODEL as string | undefined)?.toLowerCase().trim();
  if (configured === 'flux-pulid') return 'flux-pulid';
  return 'codeplugtech';
}

async function runReplicateFluxPulid(
  replicateToken: string,
  faceReferenceUrl: string,
  runwayPrompt: string,
) {
  console.log('[Dr. Stylist] Running Step 3 identity generation with Replicate bytedance/flux-pulid...');
  const repRes = await fetchWithRetry('/replicate-api/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${replicateToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: REPLICATE_FLUX_PULID_VERSION,
      input: {
        main_face_image: faceReferenceUrl,
        prompt: buildFluxPulidRunwayPrompt(runwayPrompt),
        negative_prompt:
          'wrong identity, different face, different person, changed face shape, changed hairstyle, changed skin tone, changed body type, wrong outfit, changed garment colors, changed garment pattern, missing garment, bad quality, worst quality, text, signature, watermark, extra limbs, deformed hands, deformed eyes, cross-eyed, blurry, low resolution',
        width: 864,
        height: 1536,
        num_steps: 20,
        start_step: 0,
        guidance_scale: 4,
        id_weight: 1.35,
        seed: -1,
        true_cfg: 1,
        max_sequence_length: 512,
        output_format: 'jpg',
        output_quality: 95,
        num_outputs: 1,
      },
    }),
  });

  const prediction = await waitForReplicatePrediction(repRes, replicateToken, 'Flux PuLID');
  const imageUrl = firstReplicateOutputUrl(prediction.output);
  if (imageUrl) {
    console.log('[Dr. Stylist] Flux PuLID identity generation successful!');
    return { imageUrl, modelName: 'replicate-flux-pulid' };
  }

  throw new Error('Flux PuLID did not return an output image.');
}

function buildFluxPulidRunwayPrompt(runwayPrompt: string) {
  return `${runwayPrompt}

${RUNWAY_CARD_FORMAT_PROMPT}

Use the provided main_face_image as the exact face identity reference. Generate one vertical 9:16 full-body neutral white studio runway photograph of the same person wearing the described outfit. The person must stand centered on a clean white round pedestal inside a seamless white photo studio with soft diffused studio lighting and a subtle floor shadow. Use a stylish outfit-aware fashion pose that suits the clothing, not a stiff passport-photo stance, while preserving exact body proportions and full garment visibility. Preserve the face identity, natural skin texture, body type, hair, complexion, full outfit visibility, garment colors, garment cuts, and garment patterns. Do not create a portrait crop; show the complete body and outfit from head to toe with feet visible. Do not create an inset photo, inner rectangle, border, frame, poster, print, or screenshot-within-image.`.slice(0, 2800);
}

async function runReplicateCodeplugtechFaceSwap(
  replicateToken: string,
  generatedImageDataUrl: string,
  faceReferenceUrl: string,
) {
  console.log('[Dr. Stylist] Running Step 3 Face Swap with Replicate...');
  try {
    const repRes = await fetchWithRetry('/replicate-api/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Token ${replicateToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: REPLICATE_CODEPLUGTECH_FACE_SWAP_VERSION,
        input: {
          input_image: generatedImageDataUrl,
          swap_image: faceReferenceUrl,
        },
      }),
    });

    const prediction = await waitForReplicatePrediction(repRes, replicateToken, 'Codeplugtech face swap');
    const imageUrl = firstReplicateOutputUrl(prediction.output);
    if (imageUrl) {
      console.log('[Dr. Stylist] Face Swap successful!');
      return { imageUrl, modelName: 'replicate-codeplugtech-faceswap' };
    }

    throw new Error('Face Swap did not return an output image.');
  } catch (swapErr) {
    console.error('[Dr. Stylist] Face Swap API Error:', swapErr);
    throw swapErr;
  }
}

async function waitForReplicatePrediction(repRes: Response, replicateToken: string, label: string) {
  if (!repRes.ok) {
    const errorData = await repRes.json().catch(() => ({}));
    throw new Error(`${label} Replicate API failed (${repRes.status}): ${errorData.title || errorData.detail || 'Unknown Error'}`);
  }

  let prediction = await repRes.json();
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
    await new Promise(r => setTimeout(r, 2000));
    const pollRes = await fetchWithRetry(`/replicate-api/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Token ${replicateToken}` },
    });
    prediction = await pollRes.json();
  }

  if (prediction.status === 'failed') {
    throw new Error(`${label} failed: ${prediction.error || 'Unknown Replicate Error'}`);
  }

  return prediction;
}

function firstReplicateOutputUrl(output: unknown) {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return output.find((item): item is string => typeof item === 'string') ?? '';
  return '';
}

async function critiqueGarments(
  criticModel: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  garmentReferenceParts: GeminiImagePart[],
  generatedImagePart: GeminiImagePart,
) {
  if (garmentReferenceParts.length === 0) return 'PERFECT';
  const result = await generateGeminiContentWithRetry(
    () => criticModel.generateContent([
      ...garmentReferenceParts.map(toGeminiImagePart),
      { text: 'Here is the generated final image to compare against the garment references:' },
      toGeminiImagePart(generatedImagePart),
      {
        text: `You are a garment accuracy critic. Compare only the clothing, footwear, and accessories in the generated image against the garment reference images.
Ignore model identity and background.
If every selected garment is preserved in color, cut, pattern, fabric, placement, and fit, reply exactly: PERFECT
If anything is wrong, reply:
FLAWS:
- concise garment flaw
- another garment flaw`,
      },
    ]),
    'Garment critique',
  );
  return result.response.text().trim();
}

function critiqueIsPerfect(text: string) {
  return text.trim().toUpperCase() === 'PERFECT';
}

function parseCritiqueFlaws(text: string) {
  if (critiqueIsPerfect(text)) return '';
  return text.replace(/^FLAWS:\s*/i, '').trim();
}

async function validateRunwayCardLayout(dataUrl: string): Promise<RunwayCardLayoutValidation> {
  if (typeof document === 'undefined') return { ok: true, issues: [] };

  const issues: string[] = [];
  const image = await loadImage(dataUrl);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (!naturalWidth || !naturalHeight) {
    return { ok: false, issues: ['image dimensions could not be read'] };
  }

  const aspect = naturalWidth / naturalHeight;
  const targetAspect = 9 / 16;
  if (Math.abs(aspect - targetAspect) > 0.055) {
    issues.push(`image is not close to 9:16 (${naturalWidth}x${naturalHeight})`);
  }

  const sampleHeight = 640;
  const sampleWidth = Math.max(1, Math.round(sampleHeight * aspect));
  const canvas = document.createElement('canvas');
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { ok: issues.length === 0, issues };

  ctx.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const pixels = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const subjectXs: number[] = [];
  const subjectYs: number[] = [];
  const contentXs: number[] = [];
  const contentYs: number[] = [];
  const stride = 2;

  for (let y = 0; y < sampleHeight; y += stride) {
    for (let x = 0; x < sampleWidth; x += stride) {
      const offset = (y * sampleWidth + x) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const a = pixels[offset + 3];
      if (a < 20) continue;

      const maxChannel = Math.max(r, g, b);
      const minChannel = Math.min(r, g, b);
      const saturation = maxChannel - minChannel;
      const brightness = (r + g + b) / 3;
      const isSubject = saturation > 28 || brightness < 215;
      const isContent = saturation > 8 || brightness < 248;

      if (isSubject) {
        subjectXs.push(x);
        subjectYs.push(y);
      }
      if (isContent) {
        contentXs.push(x);
        contentYs.push(y);
      }
    }
  }

  const percentile = (values: number[], ratio: number) => {
    if (values.length === 0) return 0;
    values.sort((a, b) => a - b);
    return values[Math.min(values.length - 1, Math.max(0, Math.floor(values.length * ratio)))] ?? 0;
  };

  if (subjectXs.length < 80 || subjectYs.length < 80) {
    issues.push('full-body model could not be detected clearly');
  } else {
    const subjectTop = percentile(subjectYs, 0.005);
    const subjectBottom = percentile(subjectYs, 0.995);
    const subjectHeightRatio = (subjectBottom - subjectTop) / sampleHeight;
    const subjectTopRatio = subjectTop / sampleHeight;
    const subjectBottomRatio = subjectBottom / sampleHeight;

    if (subjectHeightRatio < 0.5) issues.push('model appears too small inside the card');
    if (subjectTopRatio > 0.2) issues.push('too much empty space above the model');
    if (subjectBottomRatio < 0.78) issues.push('model/pedestal does not reach the lower studio area');

    if (contentXs.length >= 80 && contentYs.length >= 80) {
      const contentLeft = percentile(contentXs, 0.01);
      const contentRight = percentile(contentXs, 0.99);
      const contentTop = percentile(contentYs, 0.01);
      const contentBottom = percentile(contentYs, 0.99);
      const contentWidthRatio = (contentRight - contentLeft) / sampleWidth;
      const contentHeightRatio = (contentBottom - contentTop) / sampleHeight;
      const contentIsInset =
        contentLeft / sampleWidth > 0.055
        && contentRight / sampleWidth < 0.945
        && contentTop / sampleHeight > 0.055
        && contentBottom / sampleHeight < 0.965
        && contentWidthRatio > 0.42
        && contentHeightRatio > 0.45
        && contentHeightRatio > subjectHeightRatio * 1.15;

      if (contentIsInset) {
        issues.push('image appears to contain an inset photo or inner rectangular frame');
      }
    }
  }

  return { ok: issues.length === 0, issues };
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

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 6): Promise<Response> {
  let attempt = 0;
  while (attempt < maxRetries) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      attempt++;
      // Exponential backoff: 2s, 4s, 8s, 12s... cap at 12s.
      // Replicate usually resets in ~8s according to error message.
      const delay = Math.min(1000 * Math.pow(2, attempt), 12000); 
      console.warn(`[Replicate] 429 Too Many Requests. Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    return res;
  }
  return fetch(url, options);
}
