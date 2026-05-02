import { GoogleGenerativeAI } from '@google/generative-ai';

const IMAGE_MODEL_FALLBACKS = [
  'gemini-2.5-flash-image'
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

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });
    const result = await model.generateContent([
      { inlineData: inline },
      { text: prompt },
    ]);
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
  referenceParts?: any[];
  faceSwapTargetUrl?: string;
  physicalDescription?: string | null;
  modelId?: string;
};

export type LookRenderResult = {
  dataUrl: string;
  model: string;
  mocked: boolean;
};

type GeminiImagePart = { inlineData: { data: string; mimeType: string } };

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

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });
    
    let attempts = 0;
    const maxAttempts = 2; // Initial attempt + 1 redraw if flaws found
    let currentPrompt = input.prompt;

    while (attempts < maxAttempts) {
      attempts++;
      if (import.meta.env.DEV) console.log(`[Dr. Stylist] Generation attempt ${attempts}...`);
      
      const generatePayload = [
        ...(input.referenceParts || []),
        { text: currentPrompt }
      ];

      const result = await model.generateContent(generatePayload);
      
      const parts = result.response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const img = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
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

      // Critique Step
      if (attempts < maxAttempts && input.referenceParts && input.referenceParts.length > 0) {
        if (import.meta.env.DEV) console.log(`[Dr. Stylist] Critiquing attempt ${attempts}...`);
        const criticModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        
        const critiquePrompt = `You are an expert fashion and identity critic. I have provided the original reference images (both the person and the garments) earlier in this prompt, and the newly generated image right before this text.
Your job is to compare the generated image to the references.
1. GARMENTS: Did the generation change the color, hallucinate wrong clothing styles, or distort the fit of the clothing?
2. IDENTITY & BODY: Does the generated person look physically and facially identical to the person in the reference photos? ${input.physicalDescription ? `The true physical description is: "${input.physicalDescription}". If the generated body looks like an artificially slimmed-down, "beautified" runway mannequin instead of this authentic description, YOU MUST FLAG IT.` : ''}

If the generated image perfectly matches the clothes AND the identity/body type of the reference person, reply exactly with the word: "PERFECT".

If there are flaws, reply with a list of flaws starting with "FLAWS: ". Focus on garments, body build, and facial likeness. 
If the flaw is a persistent identity issue (e.g. skin tone is continually washed out, or body type is ignored), start that specific bullet point with "IDENTITY_RAG_LESSON: " so the system can memorize it for the future.`;

        const criticResult = await criticModel.generateContent([
          ...input.referenceParts,
          { text: "Here is the generated image to critique:" },
          { inlineData: dataUrlToInline(baseGeneratedImage) },
          { text: critiquePrompt }
        ]);

        const critiqueText = criticResult.response.text().trim();
        if (import.meta.env.DEV) console.log(`[Dr. Stylist] Critique Result: ${critiqueText}`);

        if (critiqueText.toUpperCase().includes('PERFECT') && !critiqueText.includes('FLAWS:')) {
          if (import.meta.env.DEV) console.log('[Dr. Stylist] Image passed critique. Proceeding.');
          break;
        } else {
          if (import.meta.env.DEV) console.log('[Dr. Stylist] Image failed critique. Redrawing...');
          const flaws = critiqueText.replace(/^FLAWS:\s*/i, '').trim();
          
          // Extract RAG lessons and save to database
          if (input.modelId && flaws.includes('IDENTITY_RAG_LESSON:')) {
            const lessons = flaws.split('\n')
              .filter(line => line.includes('IDENTITY_RAG_LESSON:'))
              .map(line => line.replace('IDENTITY_RAG_LESSON:', '').trim())
              .join('\n- ');
            
            if (lessons) {
              const lessonStr = `\n- Added on ${new Date().toISOString().split('T')[0]}: ${lessons}`;
              if (import.meta.env.DEV) console.log(`[Dr. Stylist] Saving Identity Lesson to RAG Memory: ${lessonStr}`);
              
              // Append to model's rag_memory
              const { data: currentModel } = await supabase.from('models_public').select('rag_memory').eq('id', input.modelId).single();
              const newMemory = (currentModel?.rag_memory || '') + lessonStr;
              await supabase.from('models_public').update({ rag_memory: newMemory }).eq('id', input.modelId);
            }
          }

          currentPrompt = `${input.prompt}\n\nCRITICAL CORRECTIONS BASED ON PREVIOUS FAILED ATTEMPT:\nThe previous image had these flaws: ${flaws}\nEnsure these flaws are completely fixed in this generation. Keep the garments and identity EXACTLY matching the references.`;
          baseGeneratedImage = ''; // Reset for next iteration
        }
      }
    }
  } catch (e) {
    console.error('[Nano Banana] Gemini Image Error:', e);
    throw e instanceof Error ? e : new Error('Failed to generate runway image with Gemini.');
  }

  // --- STEP 3: Automated Face-Swap (If Token Exists) ---
  const replicateToken = import.meta.env.VITE_REPLICATE_API_TOKEN as string | undefined;
  if (replicateToken && input.faceSwapTargetUrl) {
    console.log('[Dr. Stylist] Running Step 3 Face Swap with Replicate...');
    try {
      const repRes = await fetchWithRetry('/replicate-api/v1/predictions', {
        method: 'POST',
        headers: {
          Authorization: `Token ${replicateToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: '278a81e7ebb22db98bcba54de985d22cc1abeead2754eb1f2af717247be69b34', // codeplugtech/face-swap
          input: {
            input_image: baseGeneratedImage,
            swap_image: input.faceSwapTargetUrl, 
          }
        })
      });

      if (!repRes.ok) {
        const errorData = await repRes.json().catch(() => ({}));
        throw new Error(`Replicate API failed (${repRes.status}): ${errorData.title || errorData.detail || 'Unknown Error'}`);
      }

      let prediction = await repRes.json();
      
      while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
        await new Promise(r => setTimeout(r, 2000));
        const pollRes = await fetchWithRetry(`/replicate-api/v1/predictions/${prediction.id}`, {
          headers: { Authorization: `Token ${replicateToken}` }
        });
        prediction = await pollRes.json();
      }

      if (prediction.status === 'succeeded' && prediction.output) {
         console.log('[Dr. Stylist] Face Swap successful!');
         return { dataUrl: prediction.output, model: `${modelUsed} + replicate-faceswap`, mocked: false };
      } else {
         throw new Error(`Face Swap failed: ${prediction.error || 'Unknown Replicate Error'}`);
      }
    } catch (swapErr) {
      console.error('[Dr. Stylist] Face Swap API Error:', swapErr);
      throw swapErr; // Explicitly throw so the UI shows the billing error instead of silently returning a bad face
    }
  }

  return { dataUrl: baseGeneratedImage, model: modelUsed, mocked: false };
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
