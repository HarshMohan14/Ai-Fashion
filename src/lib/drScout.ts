import { GoogleGenerativeAI, type Part } from '@google/generative-ai';

export type ScoutCandidateStatus = 'suggested' | 'approved' | 'rejected' | 'imported' | 'failed';

export type ScoutSearchQuery = {
  query: string;
  category: string;
  subcategory: string;
  priority: number;
};

export type ScoutCandidate = {
  id: string;
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  verifiedImageUrl: string;
  sourceUrl: string;
  sourceName: string;
  licenseLabel: string;
  category: string;
  subcategory: string;
  confidence: number;
  reason: string;
  query: string;
  collection: string;
  collectionTitle: string;
  brief: string;
  status: ScoutCandidateStatus;
  imageWidth?: number;
  imageHeight?: number;
  availabilityStatus: 'verified' | 'unverified' | 'unavailable';
  availabilityMessage?: string;
};

type GeminiCandidate = Partial<{
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
  sourceName: string;
  licenseLabel: string;
  category: string;
  subcategory: string;
  score: number;
  critique: string;
  query: string;
}>;

type GeminiPlan = Partial<{ queries: ScoutSearchQuery[] }>;

type GeminiCritique = Partial<{
  score: number;
  category: string;
  subcategory: string;
  critique: string;
  reject: boolean;
}>;

type ImageValidation = {
  ok: boolean;
  url: string;
  width?: number;
  height?: number;
  message?: string;
  corsFetchable?: boolean;
};

const SCOUT_TEXT_MODEL = import.meta.env.VITE_GEMINI_SCOUT_MODEL || 'gemini-2.5-flash';
const MIN_SCOUT_SCORE = 65;
const MIN_IMAGE_EDGE = 300;
const SCOUT_MAX_ATTEMPTS = 3;
const IMAGE_TIMEOUT_MS = 10_000;
const GEMINI_RETRY_COUNT = 2;

export function hasScoutGeminiKey() {
  return Boolean(import.meta.env.VITE_GEMINI_API_KEY);
}

export async function searchScoutCandidates(theme: string, imageCount: number): Promise<ScoutCandidate[]> {
  const cleanTheme = theme.trim();
  if (!cleanTheme) throw new Error('Tell Dr. Scout what theme to source.');
  if (!hasScoutGeminiKey()) throw new Error('Missing VITE_GEMINI_API_KEY. Dr. Scout needs Gemini to search and critique images.');

  const targetCount = clamp(Math.round(imageCount || 1), 1, 30);
  const basePlan = await createScoutSearchPlan(cleanTheme, targetCount);
  const accepted: ScoutCandidate[] = [];
  const seen = new Set<string>();

  for (let attempt = 1; attempt <= SCOUT_MAX_ATTEMPTS && accepted.length < targetCount; attempt += 1) {
    const plan = attempt === 1 ? basePlan : expandSearchPlan(cleanTheme, targetCount, basePlan, attempt);
    const rawCandidates = await findScoutImagesWithGemini(cleanTheme, targetCount, plan, attempt);
    const unseen = rawCandidates.filter((candidate) => {
      const key = candidateIdentity(candidate);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const verified = await verifyScoutCandidates(unseen);
    const critiqued = await critiqueScoutCandidates(cleanTheme, targetCount, verified);
    accepted.push(
      ...critiqued.filter(
        (candidate) =>
          candidate.confidence >= MIN_SCOUT_SCORE &&
          candidate.availabilityStatus === 'verified' &&
          isUsableImageUrl(candidate.verifiedImageUrl),
      ),
    );
  }

  return dedupeCandidates(accepted)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, targetCount);
}

export async function createScoutSearchPlan(theme: string, imageCount: number): Promise<ScoutSearchQuery[]> {
  const prompt = `You are Dr. Scout for an AI fashion wardrobe app.

Theme: ${theme}
Images needed: ${imageCount}

Create focused web image sourcing queries for clear clothing/accessory reference images. Prefer product photos, catalog photos, flat lays, ghost mannequin images, or clean single-item photos. Include a balanced mix of garments and accessories when the theme suggests it.

Return ONLY JSON:
{
  "queries": [
    { "query": "men summer cotton kurta product photo", "category": "Indian Wear", "subcategory": "Kurtas", "priority": 100 }
  ]
}`;

  try {
    const text = await generateGeminiText(prompt, true);
    const parsed = parseJson<GeminiPlan>(text);
    const queries = (parsed.queries ?? [])
      .filter((item) => item.query && item.category && item.subcategory)
      .map((item, index) => ({
        query: item.query.trim(),
        category: item.category.trim(),
        subcategory: item.subcategory.trim(),
        priority: Number.isFinite(item.priority) ? item.priority : 100 - index * 5,
      }));

    if (queries.length) return queries.slice(0, Math.max(6, Math.min(16, imageCount + 4)));
  } catch (error) {
    console.warn('[Dr. Scout] Gemini search plan failed; using fallback queries.', error);
  }

  return fallbackSearchPlan(theme, imageCount);
}

export function scoutCandidateToMetadata(candidate: ScoutCandidate) {
  return {
    scout_source_url: candidate.sourceUrl || candidate.imageUrl,
    scout_source_name: candidate.sourceName,
    scout_query: candidate.query,
    scout_brief: candidate.brief,
    scout_license_label: candidate.licenseLabel,
    scout_confidence: candidate.confidence,
    scout_collection_key: candidate.collection,
    scout_collection_title: candidate.collectionTitle,
    scout_category_hint: candidate.category,
    scout_subcategory_hint: candidate.subcategory,
    scout_verified_image_url: candidate.verifiedImageUrl,
    scout_image_width: candidate.imageWidth ?? null,
    scout_image_height: candidate.imageHeight ?? null,
  };
}

async function findScoutImagesWithGemini(theme: string, imageCount: number, plan: ScoutSearchQuery[], attempt: number) {
  const prompt = `You are Dr. Scout. Use Google Search to find direct, currently available image URLs for fashion sourcing.

Theme: ${theme}
Images needed: ${imageCount}
Attempt: ${attempt}
Search plan:
${JSON.stringify(plan, null, 2)}

Find ${Math.min(imageCount * 3, 60)} candidate clothing/accessory reference images from the public web.
Rules:
- imageUrl must be a direct downloadable image URL, not only a product/page URL.
- Prefer product/catalog/reference photos where a single garment or accessory is clearly visible.
- Prefer image URLs ending in jpg, jpeg, png, webp, or avif and avoid SVG/GIF.
- Avoid expired CDN links, search-result thumbnails, collages, screenshots, watermarked images, runway crowds, tiny thumbnails, and cluttered backgrounds.
- Match the theme exactly.
- Include sourceUrl for attribution/audit.
- If unsure about license, use "Rights confirmation required".

Return ONLY compact JSON:
{
  "candidates": [
    {
      "title": "Men cotton kurta product photo",
      "imageUrl": "https://...jpg",
      "thumbnailUrl": "https://...jpg",
      "sourceUrl": "https://source-page...",
      "sourceName": "brand or domain",
      "licenseLabel": "Rights confirmation required",
      "category": "Indian Wear",
      "subcategory": "Kurtas",
      "score": 80,
      "critique": "Clean visible kurta, strong theme match.",
      "query": "men summer cotton kurta product photo"
    }
  ]
}`;

  let text = '';
  try {
    text = await generateGeminiTextWithGoogleSearch(prompt);
    const parsed = parseGeminiCandidates(text);
    return normalizeGeminiCandidates(parsed, theme, plan);
  } catch (error) {
    console.warn('[Dr. Scout] Gemini search response was not usable; attempting JSON repair.', error);
  }

  try {
    const repaired = await repairGeminiJson(text, 'candidates');
    return normalizeGeminiCandidates(parseGeminiCandidates(repaired), theme, plan);
  } catch (error) {
    console.warn('[Dr. Scout] Gemini search JSON repair failed; continuing with no candidates for this attempt.', error);
    return [];
  }
}

function normalizeGeminiCandidates(candidates: GeminiCandidate[], theme: string, plan: ScoutSearchQuery[]) {
  const collection = slugify(theme);
  const collectionTitle = titleize(theme);

  return candidates
    .map((candidate, index) => normalizeGeminiCandidate(candidate, theme, collection, collectionTitle, plan[index % Math.max(plan.length, 1)], index))
    .filter((candidate): candidate is ScoutCandidate => Boolean(candidate));
}

function parseGeminiCandidates(text: string) {
  const parsed = parseJson<{ candidates?: GeminiCandidate[] } | GeminiCandidate[]>(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.candidates)) return parsed.candidates;
  throw new Error('Gemini did not return a candidates array.');
}

async function verifyScoutCandidates(candidates: ScoutCandidate[]) {
  const verified = await mapWithConcurrency<ScoutCandidate, ScoutCandidate | null>(candidates, 5, async (candidate) => {
    const validation = await validateCandidateImage(candidate);
    if (!validation.ok) {
      console.warn('[Dr. Scout] Candidate image unavailable; rejecting.', { title: candidate.title, url: validation.url, reason: validation.message });
      return null;
    }

    return {
      ...candidate,
      verifiedImageUrl: validation.url,
      imageWidth: validation.width,
      imageHeight: validation.height,
      availabilityStatus: 'verified' as const,
      availabilityMessage: validation.message,
    };
  });

  return verified.filter((candidate): candidate is ScoutCandidate => Boolean(candidate));
}

async function validateCandidateImage(candidate: ScoutCandidate): Promise<ImageValidation> {
  const urls = uniqueUrls([
    candidate.imageUrl,
    candidate.thumbnailUrl,
    ...uniqueUrls([candidate.imageUrl, candidate.thumbnailUrl]).map(toImageProxyUrl),
  ]);
  let lastMessage = 'No usable image URL found.';

  for (const url of urls) {
    if (!isUsableImageUrl(url)) {
      lastMessage = 'URL is not a supported direct image candidate.';
      continue;
    }

    try {
      const dimensions = await loadRemoteImageDimensions(url);
      if (dimensions.width < MIN_IMAGE_EDGE || dimensions.height < MIN_IMAGE_EDGE) {
        lastMessage = `Image is too small (${dimensions.width}×${dimensions.height}).`;
        continue;
      }

      const fetchable = await canFetchImageBlob(url);
      return {
        ok: true,
        url,
        width: dimensions.width,
        height: dimensions.height,
        corsFetchable: fetchable,
        message: fetchable
          ? `Verified ${dimensions.width}×${dimensions.height} and fetchable.`
          : `Verified ${dimensions.width}×${dimensions.height} by browser render; import will retry through proxy if needed.`,
      };
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : 'Image could not be loaded.';
    }
  }

  return { ok: false, url: urls[0] || candidate.imageUrl, message: lastMessage };
}

async function critiqueScoutCandidates(theme: string, imageCount: number, candidates: ScoutCandidate[]) {
  const unique = dedupeCandidates(candidates).slice(0, Math.min(Math.max(imageCount * 3, imageCount), 60));
  const critiqued = await mapWithConcurrency<ScoutCandidate, ScoutCandidate | null>(unique, 3, async (candidate) => {
    try {
      const critique = await critiqueScoutCandidate(theme, candidate);
      if (critique.reject) return null;

      return {
        ...candidate,
        confidence: critique.score,
        category: critique.category || candidate.category,
        subcategory: critique.subcategory || candidate.subcategory,
        reason: critique.critique || candidate.reason,
      };
    } catch (error) {
      console.warn('[Dr. Scout] Candidate critique failed; keeping browser-verified candidate with Gemini search score.', error);
      return {
        ...candidate,
        confidence: clamp(Math.round(Number(candidate.confidence || MIN_SCOUT_SCORE + 5)), MIN_SCOUT_SCORE + 1, 100),
        reason: `${candidate.reason} Browser verified this photo is live; critique fallback kept it available.`,
      };
    }
  });

  return critiqued.filter((candidate): candidate is ScoutCandidate => Boolean(candidate));
}

async function critiqueScoutCandidate(theme: string, candidate: ScoutCandidate): Promise<Required<GeminiCritique>> {
  const imagePart = await imageUrlToGeminiPart(candidate.verifiedImageUrl).catch((error) => {
    console.warn('[Dr. Scout] Visual critique fetch failed; falling back to URL/title critique for a browser-verified image.', error);
    return null;
  });
  if (!imagePart) {
    const score = clamp(Math.round(Number(candidate.confidence || MIN_SCOUT_SCORE + 5)), MIN_SCOUT_SCORE + 1, 100);
    return {
      score,
      category: candidate.category,
      subcategory: candidate.subcategory,
      critique: `${candidate.reason} Browser verified this photo is live; visual Gemini critique was skipped because the source blocked fetch access.`,
      reject: false,
    };
  }

  const prompt = `You are Dr. Scout. Critique this candidate image for a fashion extraction workflow.

Theme: ${theme}
Candidate title: ${candidate.title}
Image URL: ${candidate.verifiedImageUrl}
Source URL: ${candidate.sourceUrl}
Current category: ${candidate.category} / ${candidate.subcategory}
Image availability: ${candidate.availabilityMessage || 'verified'}

Score 0-100 for:
- theme match
- visible clothing/accessory relevance
- product/reference photo clarity
- extraction suitability
- no collage, no heavy background, no tiny thumbnail

Reject anything that is not clearly fashion/clothing/accessory, is a logo-only image, collage, blocked image, or has no visible extractable item.

Return ONLY JSON:
{ "score": 87, "category": "Indian Wear", "subcategory": "Kurtas", "critique": "Strong summer Indian menswear match with visible garment.", "reject": false }`;

  let text = '';
  try {
    text = await generateGeminiText([imagePart, { text: prompt }], true);
    const parsed = parseJson<GeminiCritique>(text);
    const score = clamp(Math.round(Number(parsed.score ?? candidate.confidence)), 0, 100);

    return {
      score,
      category: String(parsed.category || candidate.category),
      subcategory: String(parsed.subcategory || candidate.subcategory),
      critique: String(parsed.critique || candidate.reason),
      reject: Boolean(parsed.reject) || score < MIN_SCOUT_SCORE,
    };
  } catch (error) {
    if (!text.trim()) throw error;
    console.warn('[Dr. Scout] Gemini critique JSON failed; attempting repair.', error);
    const repaired = await repairGeminiJson(text, 'critique');
    const parsed = parseJson<GeminiCritique>(repaired);
    const score = clamp(Math.round(Number(parsed.score ?? candidate.confidence)), 0, 100);

    return {
      score,
      category: String(parsed.category || candidate.category),
      subcategory: String(parsed.subcategory || candidate.subcategory),
      critique: String(parsed.critique || candidate.reason),
      reject: Boolean(parsed.reject) || score < MIN_SCOUT_SCORE,
    };
  }
}

async function generateGeminiText(prompt: string | Part[], preferJson = false) {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) throw new Error('Missing VITE_GEMINI_API_KEY.');
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: SCOUT_TEXT_MODEL,
    generationConfig: {
      temperature: 0.2,
      ...(preferJson ? { responseMimeType: 'application/json' } : {}),
    },
  });

  return retryAsync(async () => {
    const result = await model.generateContent(prompt);
    return result.response.text();
  }, GEMINI_RETRY_COUNT);
}

async function generateGeminiTextWithGoogleSearch(prompt: string) {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) throw new Error('Missing VITE_GEMINI_API_KEY.');

  return retryAsync(async () => {
    const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${SCOUT_TEXT_MODEL}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.25,
        },
      }),
    }, 30_000);

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`Gemini Scout search failed (${response.status}). ${details.slice(0, 180)}`);
    }

    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('\n') ?? '';
    if (!text.trim()) throw new Error('Gemini Scout search returned an empty response.');
    return text;
  }, GEMINI_RETRY_COUNT);
}

async function repairGeminiJson(text: string, shape: 'candidates' | 'critique') {
  const schema = shape === 'candidates'
    ? '{ "candidates": [{ "title": "", "imageUrl": "https://...jpg", "thumbnailUrl": "https://...jpg", "sourceUrl": "https://...", "sourceName": "", "licenseLabel": "Rights confirmation required", "category": "", "subcategory": "", "score": 80, "critique": "", "query": "" }] }'
    : '{ "score": 80, "category": "", "subcategory": "", "critique": "", "reject": false }';

  return generateGeminiText(`Convert this response into ONLY valid JSON matching this schema. Do not add markdown or commentary.\n\nSchema:\n${schema}\n\nResponse:\n${text || '(empty response)'}`, true);
}

function normalizeGeminiCandidate(
  candidate: GeminiCandidate,
  theme: string,
  collection: string,
  collectionTitle: string,
  query: ScoutSearchQuery | undefined,
  index: number,
): ScoutCandidate | null {
  const imageUrl = String(candidate.imageUrl || candidate.thumbnailUrl || '').trim();
  if (!isUsableImageUrl(imageUrl)) return null;

  const thumbnailUrl = String(candidate.thumbnailUrl || imageUrl).trim();
  const sourceUrl = String(candidate.sourceUrl || imageUrl).trim();
  const title = String(candidate.title || query?.subcategory || `Scout image ${index + 1}`).trim();

  return {
    id: `scout-${stableHash(`${theme}-${imageUrl}-${index}`)}`,
    title,
    imageUrl,
    thumbnailUrl,
    verifiedImageUrl: imageUrl,
    sourceUrl,
    sourceName: String(candidate.sourceName || sourceNameFromUrl(sourceUrl)).trim(),
    licenseLabel: String(candidate.licenseLabel || 'Rights confirmation required').trim(),
    category: String(candidate.category || query?.category || 'Accessories').trim(),
    subcategory: String(candidate.subcategory || query?.subcategory || 'Reference').trim(),
    confidence: clamp(Math.round(Number(candidate.score ?? 70)), 0, 100),
    reason: String(candidate.critique || 'Gemini found this as a potentially extractable fashion reference.').trim(),
    query: String(candidate.query || query?.query || theme).trim(),
    collection,
    collectionTitle,
    brief: theme,
    status: 'suggested',
    availabilityStatus: 'unverified',
  };
}

function fallbackSearchPlan(theme: string, imageCount: number): ScoutSearchQuery[] {
  const lower = theme.toLowerCase();
  const indian = /indian|desi|kurta|sherwani|nehru|jutti/.test(lower);
  const men = /men|mens|male|boy/.test(lower);
  const base = men ? 'men' : /women|female|girl/.test(lower) ? 'women' : 'fashion';
  const seed = indian
    ? [
        ['Indian Wear', 'Kurtas', `${base} ${theme} cotton kurta product photo`],
        ['Indian Wear', 'Nehru Jackets', `${base} ${theme} nehru jacket product photo`],
        ['Bottomwear', 'Trousers', `${base} ${theme} linen trousers product photo`],
        ['Footwear', 'Juttis', `${base} ${theme} jutti footwear product photo`],
        ['Accessories', 'Scarves', `${base} ${theme} lightweight stole scarf product photo`],
        ['Bags', 'Tote Bags', `${base} ${theme} tote bag product photo`],
      ]
    : [
        ['Topwear', 'Tops', `${theme} topwear product photo`],
        ['Bottomwear', 'Bottoms', `${theme} pants product photo`],
        ['Outerwear', 'Outerwear', `${theme} jacket product photo`],
        ['Footwear', 'Shoes', `${theme} shoes product photo`],
        ['Bags', 'Bags', `${theme} bag product photo`],
        ['Accessories', 'Accessories', `${theme} accessories product photo`],
      ];

  return seed.slice(0, Math.max(4, Math.min(seed.length, imageCount))).map(([category, subcategory, query], index) => ({
    category,
    subcategory,
    query,
    priority: 100 - index * 5,
  }));
}

function expandSearchPlan(theme: string, imageCount: number, basePlan: ScoutSearchQuery[], attempt: number) {
  const suffixes = attempt === 2
    ? ['catalog photo', 'official product image', 'plain background']
    : ['ecommerce product photo', 'single item photo', 'front view clothing'];
  const fallback = fallbackSearchPlan(theme, imageCount);
  const combined = [...basePlan, ...fallback];

  return combined.slice(0, Math.max(4, Math.min(12, imageCount + 4))).map((query, index) => ({
    ...query,
    query: `${query.query} ${suffixes[index % suffixes.length]}`,
    priority: query.priority - attempt * 3,
  }));
}

function loadRemoteImageDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.src = '';
      reject(new Error('Image render check timed out.'));
    }, IMAGE_TIMEOUT_MS);

    image.onload = () => {
      window.clearTimeout(timeout);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('Image could not be rendered in the browser.'));
    };
    image.referrerPolicy = 'no-referrer';
    image.src = url;
  });
}

async function canFetchImageBlob(imageUrl: string) {
  try {
    await fetchImageBlob(imageUrl);
    return true;
  } catch {
    return false;
  }
}

async function imageUrlToGeminiPart(imageUrl: string): Promise<Part> {
  const { blob, mimeType } = await fetchImageBlob(imageUrl);
  const data = await blobToBase64(blob);
  return { inlineData: { data, mimeType: mimeType || 'image/jpeg' } };
}

async function fetchImageBlob(imageUrl: string) {
  const response = await fetchWithTimeout(imageUrl, { mode: 'cors', cache: 'no-store' }, IMAGE_TIMEOUT_MS);
  if (!response.ok) throw new Error(`Image request failed (${response.status}).`);

  const blob = await response.blob();
  const mimeType = blob.type || response.headers.get('content-type') || '';
  if (!mimeType.startsWith('image/')) throw new Error('URL did not resolve to an image file.');
  if (/svg|gif/i.test(mimeType)) throw new Error('SVG and GIF images are not supported for extraction.');
  if (blob.size < 1024) throw new Error('Image file is too small or empty.');
  if (blob.size > 12 * 1024 * 1024) throw new Error('Image file is larger than Scout supports.');

  return { blob, mimeType };
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image.'));
    reader.readAsDataURL(blob);
  });
}

function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  if (!cleaned) throw new Error('Gemini did not return JSON.');

  const direct = tryParseJson<T>(cleaned);
  if (direct.ok) return direct.value;

  const objectText = extractJsonBlock(cleaned, '{', '}');
  if (objectText) {
    const parsed = tryParseJson<T>(objectText);
    if (parsed.ok) return parsed.value;
  }

  const arrayText = extractJsonBlock(cleaned, '[', ']');
  if (arrayText) {
    const parsed = tryParseJson<T>(arrayText);
    if (parsed.ok) return parsed.value;
  }

  throw new Error('Gemini did not return parseable JSON.');
}

function tryParseJson<T>(text: string): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false };
  }
}

function extractJsonBlock(text: string, open: '{' | '[', close: '}' | ']') {
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start === -1 || end === -1 || end <= start) return '';
  return text.slice(start, end + 1);
}

function dedupeCandidates(candidates: ScoutCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidateIdentity(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function candidateIdentity(candidate: ScoutCandidate) {
  return (candidate.verifiedImageUrl || candidate.imageUrl).toLowerCase().replace(/[?#].*$/, '');
}

function isUsableImageUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\.(svg|gif)(\?|#|$)/i.test(url)) return false;
  if (/\/search\?|google\.[^/]+\/imgres|bing\.com\/images|pinterest\.[^/]+\/pin\//i.test(url)) return false;
  return true;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = IMAGE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function retryAsync<T>(fn: () => Promise<T>, retries: number) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryableError(error)) break;
      await delay(450 * (attempt + 1));
    }
  }
  throw lastError;
}

function isRetryableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /429|5\d\d|timeout|timed out|network|failed to fetch/i.test(message);
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

function toImageProxyUrl(url: string) {
  const cleanUrl = url.trim();
  if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl) || /images\.weserv\.nl/i.test(cleanUrl)) return '';
  return `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrl.replace(/^https?:\/\//i, ''))}&output=webp`;
}

function uniqueUrls(urls: string[]) {
  const seen = new Set<string>();
  return urls
    .map((url) => url.trim())
    .filter(Boolean)
    .filter((url) => {
      const key = url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'scout-drop';
}

function titleize(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function stableHash(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sourceNameFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Web source';
  }
}
