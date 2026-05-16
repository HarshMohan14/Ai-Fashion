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

const SCOUT_TEXT_MODEL = import.meta.env.VITE_GEMINI_SCOUT_MODEL || 'gemini-2.5-flash';
const MIN_SCOUT_SCORE = 65;

export function hasScoutGeminiKey() {
  return Boolean(import.meta.env.VITE_GEMINI_API_KEY);
}

export async function searchScoutCandidates(theme: string, imageCount: number): Promise<ScoutCandidate[]> {
  const cleanTheme = theme.trim();
  if (!cleanTheme) throw new Error('Tell Dr. Scout what theme to source.');
  if (!hasScoutGeminiKey()) throw new Error('Missing VITE_GEMINI_API_KEY. Dr. Scout needs Gemini to search and critique images.');

  const targetCount = clamp(Math.round(imageCount || 1), 1, 30);
  const plan = await createScoutSearchPlan(cleanTheme, targetCount);
  const rawCandidates = await findScoutImagesWithGemini(cleanTheme, targetCount, plan);
  const critiqued = await critiqueScoutCandidates(cleanTheme, targetCount, rawCandidates);

  return critiqued
    .filter((candidate) => candidate.confidence >= MIN_SCOUT_SCORE && isUsableImageUrl(candidate.imageUrl))
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
    const text = await generateGeminiText(prompt);
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
  };
}

async function findScoutImagesWithGemini(theme: string, imageCount: number, plan: ScoutSearchQuery[]) {
  const prompt = `You are Dr. Scout. Use Google Search to find direct image URLs for fashion sourcing.

Theme: ${theme}
Images needed: ${imageCount}
Search plan:
${JSON.stringify(plan, null, 2)}

Find ${Math.min(imageCount * 2, 40)} candidate clothing/accessory reference images from the public web.
Rules:
- Return direct image URLs when possible. imageUrl must be a downloadable image file URL, not only a page URL.
- Prefer product/catalog/reference photos where a single garment or accessory is clearly visible.
- Avoid collages, screenshots, watermarked images, runway crowds, tiny thumbnails, and heavily cluttered backgrounds.
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

  const text = await generateGeminiTextWithGoogleSearch(prompt);
  const parsed = parseJson<{ candidates?: GeminiCandidate[] }>(text);
  const collection = slugify(theme);
  const collectionTitle = titleize(theme);

  return (parsed.candidates ?? [])
    .map((candidate, index) => normalizeGeminiCandidate(candidate, theme, collection, collectionTitle, plan[index % Math.max(plan.length, 1)], index))
    .filter((candidate): candidate is ScoutCandidate => Boolean(candidate));
}

async function critiqueScoutCandidates(theme: string, imageCount: number, candidates: ScoutCandidate[]) {
  const unique = dedupeCandidates(candidates).slice(0, Math.min(Math.max(imageCount * 2, imageCount), 40));
  const critiqued: ScoutCandidate[] = [];

  for (const candidate of unique) {
    try {
      const critique = await critiqueScoutCandidate(theme, candidate);
      if (!critique.reject) {
        critiqued.push({
          ...candidate,
          confidence: critique.score,
          category: critique.category || candidate.category,
          subcategory: critique.subcategory || candidate.subcategory,
          reason: critique.critique || candidate.reason,
        });
      }
    } catch (error) {
      console.warn('[Dr. Scout] Candidate critique failed; keeping Gemini search score.', error);
      critiqued.push(candidate);
    }
  }

  return critiqued;
}

async function critiqueScoutCandidate(theme: string, candidate: ScoutCandidate): Promise<Required<GeminiCritique>> {
  const imagePart = await imageUrlToGeminiPart(candidate.imageUrl).catch(() => null);
  const prompt = `You are Dr. Scout. Critique this candidate image for a fashion extraction workflow.

Theme: ${theme}
Candidate title: ${candidate.title}
Image URL: ${candidate.imageUrl}
Source URL: ${candidate.sourceUrl}
Current category: ${candidate.category} / ${candidate.subcategory}

Score 0-100 for:
- theme match
- visible clothing/accessory relevance
- product/reference photo clarity
- extraction suitability
- no collage, no heavy background, no tiny thumbnail

Reject anything that is not clearly fashion/clothing/accessory, is a logo-only image, collage, blocked image, or has no visible extractable item.

Return ONLY JSON:
{ "score": 87, "category": "Indian Wear", "subcategory": "Kurtas", "critique": "Strong summer Indian menswear match with visible garment.", "reject": false }`;

  const text = imagePart
    ? await generateGeminiText([imagePart, { text: prompt }])
    : await generateGeminiText(prompt);
  const parsed = parseJson<GeminiCritique>(text);
  const score = clamp(Math.round(Number(parsed.score ?? candidate.confidence)), 0, 100);

  return {
    score,
    category: String(parsed.category || candidate.category),
    subcategory: String(parsed.subcategory || candidate.subcategory),
    critique: String(parsed.critique || candidate.reason),
    reject: Boolean(parsed.reject) || score < MIN_SCOUT_SCORE,
  };
}

async function generateGeminiText(prompt: string | Part[]) {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) throw new Error('Missing VITE_GEMINI_API_KEY.');
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: SCOUT_TEXT_MODEL });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function generateGeminiTextWithGoogleSearch(prompt: string) {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) throw new Error('Missing VITE_GEMINI_API_KEY.');

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${SCOUT_TEXT_MODEL}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.35,
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Gemini Scout search failed (${response.status}). ${details.slice(0, 180)}`);
  }

  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('\n') ?? '';
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

  const sourceUrl = String(candidate.sourceUrl || imageUrl).trim();
  const title = String(candidate.title || query?.subcategory || `Scout image ${index + 1}`).trim();

  return {
    id: `scout-${stableHash(`${theme}-${imageUrl}-${index}`)}`,
    title,
    imageUrl,
    thumbnailUrl: String(candidate.thumbnailUrl || imageUrl).trim(),
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

async function imageUrlToGeminiPart(imageUrl: string): Promise<Part> {
  const response = await fetch(imageUrl, { mode: 'cors' });
  if (!response.ok) throw new Error('Could not fetch image for critique.');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Critique URL is not an image.');
  const data = await blobToBase64(blob);
  return { inlineData: { data, mimeType: blob.type || 'image/jpeg' } };
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
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Gemini did not return JSON.');
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

function dedupeCandidates(candidates: ScoutCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.imageUrl.toLowerCase().replace(/\?.*$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isUsableImageUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\.(svg|gif)(\?|$)/i.test(url)) return false;
  return true;
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
