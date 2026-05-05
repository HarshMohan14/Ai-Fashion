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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });
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
        return { dataUrl: `data:${mime};base64,${img.data}`, model: 'gemini-2.5-flash-image' };
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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });
    let attempts = 0;
    const maxAttempts = 2; // Initial attempt + 1 redraw if flaws found
    let currentPrompt = input.prompt;

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
          modelUsed = 'gemini-2.5-flash-image';
          break;
        }
      }

      if (!baseGeneratedImage) {
        throw new Error('Gemini model did not return inlineData.');
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
        } else {
          if (import.meta.env.DEV) console.log('[Dr. Stylist] Image failed critique. Redrawing...');
          currentPrompt = `${input.prompt}

CRITICAL CORRECTIONS BASED ON PREVIOUS FAILED ATTEMPT:
Garment flaws to fix: ${garmentFlaws || 'No garment flaws reported.'}
Keep the background neutral white, preserve every selected garment, and keep the model references available only for consistency.
Maintain the same vertical 9:16 portrait card format: one centered full-body model, head-to-toe visible, feet visible, narrow side margins, no square canvas, no landscape canvas, and no excessive empty whitespace.`;
          baseGeneratedImage = ''; // Reset for next iteration
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
        width: 896,
        height: 1152,
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

Use the provided main_face_image as the exact face identity reference. Generate one full-body neutral white studio runway photograph of the same person wearing the described outfit. Preserve the face identity, natural skin texture, body type, hair, complexion, full outfit visibility, garment colors, garment cuts, and garment patterns. Do not create a portrait crop; show the complete body and outfit.`.slice(0, 2800);
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
