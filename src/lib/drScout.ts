export type ScoutCategory =
  | 'Topwear'
  | 'Bottomwear'
  | 'Outerwear'
  | 'Footwear'
  | 'Accessories'
  | 'Eyewear'
  | 'Jewelry'
  | 'Bags'
  | 'Headwear'
  | 'Indian Wear';

export type ScoutCandidateStatus = 'suggested' | 'shortlisted' | 'approved' | 'rejected' | 'imported' | 'failed';

export type ScoutBrief = {
  raw: string;
  title: string;
  collectionKey: string;
  season: string;
  region: string;
  mood: string[];
  categories: Array<{ category: ScoutCategory; subcategory: string }>;
  colors: string[];
  fabrics: string[];
  avoid: string[];
};

export type ScoutSearchIntent = {
  id: string;
  query: string;
  category: ScoutCategory;
  subcategory: string;
  priority: number;
  collection: string;
  notes: string;
};

export type ScoutCandidate = {
  id: string;
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
  sourceName: string;
  licenseLabel: string;
  category: ScoutCategory;
  subcategory: string;
  confidence: number;
  reason: string;
  query: string;
  collection: string;
  brief: string;
  status: ScoutCandidateStatus;
  qualityFlags: string[];
};

export type ScoutPack = {
  id: string;
  name: string;
  description: string;
  candidateIds: string[];
  categoryCoverage: ScoutCategory[];
  estimatedWardrobeValue: number;
};

type BriefPreset = {
  match: RegExp;
  region: string;
  mood: string[];
  colors: string[];
  fabrics: string[];
  avoid: string[];
  categories: ScoutBrief['categories'];
};

const PRESETS: BriefPreset[] = [
  {
    match: /indian|desi|ethnic|kurta|saree|lehenga/i,
    region: 'Indian',
    mood: ['airy', 'festive', 'daywear', 'heritage-modern'],
    colors: ['ivory', 'pastel yellow', 'mint', 'coral', 'sky blue', 'rose pink'],
    fabrics: ['cotton', 'linen', 'mulmul', 'chikankari', 'light silk'],
    avoid: ['heavy velvet', 'dark wool', 'winter layering', 'overly bridal weight'],
    categories: [
      { category: 'Indian Wear', subcategory: 'Kurtas' },
      { category: 'Bottomwear', subcategory: 'Palazzos' },
      { category: 'Indian Wear', subcategory: 'Nehru Jackets' },
      { category: 'Footwear', subcategory: 'Juttis' },
      { category: 'Jewelry', subcategory: 'Earrings' },
      { category: 'Jewelry', subcategory: 'Bracelets' },
      { category: 'Bags', subcategory: 'Tote Bags' },
      { category: 'Accessories', subcategory: 'Scarves' },
    ],
  },
  {
    match: /street|y2k|urban|oversized|sneaker/i,
    region: 'Streetwear',
    mood: ['graphic', 'layered', 'youthful', 'high-contrast'],
    colors: ['black', 'washed denim', 'chrome', 'acid green', 'white'],
    fabrics: ['denim', 'jersey', 'nylon', 'fleece'],
    avoid: ['formal tailoring', 'delicate jewelry'],
    categories: [
      { category: 'Topwear', subcategory: 'Graphic Tees' },
      { category: 'Bottomwear', subcategory: 'Cargo Pants' },
      { category: 'Outerwear', subcategory: 'Bomber Jackets' },
      { category: 'Footwear', subcategory: 'Sneakers' },
      { category: 'Bags', subcategory: 'Messenger Bags' },
      { category: 'Headwear', subcategory: 'Caps' },
    ],
  },
  {
    match: /office|formal|boardroom|workwear|minimal/i,
    region: 'Minimal workwear',
    mood: ['polished', 'modular', 'premium basics', 'sharp'],
    colors: ['charcoal', 'cream', 'navy', 'taupe', 'white'],
    fabrics: ['cotton poplin', 'wool blend', 'crepe', 'leather'],
    avoid: ['loud graphics', 'costume styling'],
    categories: [
      { category: 'Topwear', subcategory: 'Formal Shirts' },
      { category: 'Bottomwear', subcategory: 'Formal Trousers' },
      { category: 'Outerwear', subcategory: 'Blazers' },
      { category: 'Footwear', subcategory: 'Loafers' },
      { category: 'Bags', subcategory: 'Handbags' },
      { category: 'Accessories', subcategory: 'Belts' },
    ],
  },
];

const FALLBACK_CATEGORIES: ScoutBrief['categories'] = [
  { category: 'Topwear', subcategory: 'Statement Tops' },
  { category: 'Bottomwear', subcategory: 'Coordinated Bottoms' },
  { category: 'Footwear', subcategory: 'Hero Shoes' },
  { category: 'Bags', subcategory: 'Carry Bags' },
  { category: 'Accessories', subcategory: 'Styling Accessories' },
];

const MOCK_IMAGE_POOL = [
  'https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=900',
  'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=900',
  'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=900',
  'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=900',
  'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?w=900',
  'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=900',
  'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=900',
  'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=900',
  'https://images.unsplash.com/photo-1575428652377-a2d80e2277fc?w=900',
  'https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=900',
  'https://images.unsplash.com/photo-1523398002811-999ca8dec234?w=900',
  'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=900',
];

export function parseScoutBrief(input: string): ScoutBrief {
  const raw = input.trim() || 'Fresh wardrobe capsule';
  const season = detectSeason(raw);
  const preset = PRESETS.find((item) => item.match.test(raw));
  const title = titleize(raw.replace(/\b(collection|capsule|drop|wardrobe)\b/gi, '').trim() || raw);

  return {
    raw,
    title: `${title} Collection`,
    collectionKey: slugify(title),
    season,
    region: preset?.region ?? 'Global fashion',
    mood: mergeUnique([seasonMood(season), ...(preset?.mood ?? ['curated', 'editorial', 'wardrobe-ready'])]).filter(Boolean),
    categories: preset?.categories ?? FALLBACK_CATEGORIES,
    colors: preset?.colors ?? ['black', 'white', 'sand', 'cobalt', 'silver'],
    fabrics: preset?.fabrics ?? ['cotton', 'linen', 'denim', 'leather'],
    avoid: preset?.avoid ?? ['busy collage images', 'unclear product photos', 'low-resolution references'],
  };
}

export function buildScoutSearchIntents(brief: ScoutBrief): ScoutSearchIntent[] {
  return brief.categories.map((entry, index) => {
    const queryParts = [
      brief.season !== 'all-season' ? brief.season : '',
      brief.region,
      entry.subcategory,
      entry.category,
      'clean product photo',
      'fashion reference',
      brief.colors.slice(0, 2).join(' '),
    ].filter(Boolean);

    return {
      id: `${brief.collectionKey}-${slugify(entry.subcategory)}-${index}`,
      query: queryParts.join(' '),
      category: entry.category,
      subcategory: entry.subcategory,
      priority: 100 - index * 7,
      collection: brief.collectionKey,
      notes: `Scout for ${entry.subcategory.toLowerCase()} that feels ${brief.mood.slice(0, 3).join(', ')}.`,
    };
  });
}

export async function searchScoutImages(intents: ScoutSearchIntent[], brief: ScoutBrief): Promise<ScoutCandidate[]> {
  const candidates = intents.flatMap((intent, intentIndex) =>
    [0, 1].map((variant) => createMockCandidate(intent, brief, intentIndex, variant)),
  );
  return Promise.resolve(candidates.sort((a, b) => b.confidence - a.confidence));
}

export function candidateFromManualUrl(url: string, brief: ScoutBrief, intent: ScoutSearchIntent): ScoutCandidate {
  const base = createMockCandidate(intent, brief, 0, 0);
  return {
    ...base,
    id: `manual-${stableHash(url)}-${Date.now()}`,
    title: `${intent.subcategory} manual reference`,
    imageUrl: url.trim(),
    thumbnailUrl: url.trim(),
    sourceUrl: url.trim(),
    sourceName: sourceNameFromUrl(url),
    licenseLabel: 'User-confirmed rights required',
    confidence: 78,
    reason: 'Manual URL added by Director. Confirm usage rights before importing.',
    qualityFlags: ['manual-source', 'rights-confirmation-needed'],
  };
}

export function buildScoutPacks(candidates: ScoutCandidate[]): ScoutPack[] {
  const strong = candidates.filter((candidate) => candidate.confidence >= 80).slice(0, 8);
  const accessory = candidates.filter((candidate) => ['Jewelry', 'Bags', 'Accessories', 'Footwear'].includes(candidate.category));

  return [
    {
      id: 'runway-ready-capsule',
      name: 'Runway-ready capsule',
      description: 'Highest-confidence garments and accessories with broad category coverage.',
      candidateIds: strong.map((candidate) => candidate.id),
      categoryCoverage: uniqueCategories(strong),
      estimatedWardrobeValue: strong.length,
    },
    {
      id: 'accessory-finisher-pack',
      name: 'Accessory finisher pack',
      description: 'Footwear, bags, jewelry, and finishing details that make generated looks feel complete.',
      candidateIds: accessory.slice(0, 6).map((candidate) => candidate.id),
      categoryCoverage: uniqueCategories(accessory),
      estimatedWardrobeValue: accessory.slice(0, 6).length,
    },
  ].filter((pack) => pack.candidateIds.length > 0);
}

export function scoutCandidateToMetadata(candidate: ScoutCandidate) {
  return {
    scout_source_url: candidate.sourceUrl,
    scout_source_name: candidate.sourceName,
    scout_query: candidate.query,
    scout_brief: candidate.brief,
    scout_license_label: candidate.licenseLabel,
    scout_confidence: candidate.confidence,
    scout_collection_key: candidate.collection,
    scout_collection_title: titleize(candidate.collection.replace(/-/g, ' ')),
    scout_category_hint: candidate.category,
    scout_subcategory_hint: candidate.subcategory,
  };
}

function createMockCandidate(intent: ScoutSearchIntent, brief: ScoutBrief, intentIndex: number, variant: number): ScoutCandidate {
  const seed = `${intent.id}-${variant}`;
  const imageUrl = MOCK_IMAGE_POOL[Math.abs(stableHash(seed)) % MOCK_IMAGE_POOL.length];
  const title = `${brief.title}: ${intent.subcategory} ${variant === 0 ? 'hero reference' : 'alternate texture'}`;
  const base: ScoutCandidate = {
    id: `${intent.id}-${variant}`,
    title,
    imageUrl,
    thumbnailUrl: imageUrl,
    sourceUrl: imageUrl.replace(/\?.*$/, ''),
    sourceName: 'Mock Scout Board',
    licenseLabel: 'Demo reference — replace with licensed source before production',
    category: intent.category,
    subcategory: intent.subcategory,
    confidence: 0,
    reason: '',
    query: intent.query,
    collection: intent.collection,
    brief: brief.raw,
    status: 'suggested',
    qualityFlags: [],
  };
  const scored = scoreScoutCandidate(base, intent, intentIndex, variant);
  return { ...base, ...scored };
}

function scoreScoutCandidate(candidate: ScoutCandidate, intent: ScoutSearchIntent, intentIndex = 0, variant = 0) {
  const haystack = `${candidate.title} ${candidate.sourceName} ${candidate.query}`.toLowerCase();
  const qualityFlags: string[] = [];
  let confidence = 68;

  if (haystack.includes(intent.subcategory.toLowerCase().split(' ')[0])) {
    confidence += 12;
    qualityFlags.push('category-match');
  }
  if (/product|reference|clean|catalog/.test(haystack)) {
    confidence += 8;
    qualityFlags.push('extractable-framing');
  }
  if (/collage|moodboard|runway crowd|blurry/.test(haystack)) {
    confidence -= 18;
    qualityFlags.push('review-for-clutter');
  }
  confidence += Math.max(0, 8 - intentIndex);
  confidence -= variant * 5;

  return {
    confidence: Math.max(35, Math.min(96, confidence)),
    qualityFlags,
    reason: qualityFlags.includes('extractable-framing')
      ? `Strong ${intent.subcategory.toLowerCase()} match with extraction-friendly framing cues.`
      : `Relevant ${intent.subcategory.toLowerCase()} source; review image clarity before import.`,
  };
}

function detectSeason(input: string) {
  if (/summer|resort|vacation|beach|heat/i.test(input)) return 'summer';
  if (/winter|cold|snow|wool/i.test(input)) return 'winter';
  if (/monsoon|rain/i.test(input)) return 'monsoon';
  if (/festive|diwali|eid|wedding|party/i.test(input)) return 'festive';
  return 'all-season';
}

function seasonMood(season: string) {
  const moods: Record<string, string> = {
    summer: 'breathable',
    winter: 'layered',
    monsoon: 'weather-smart',
    festive: 'celebratory',
    'all-season': 'versatile',
  };
  return moods[season] ?? 'versatile';
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

function mergeUnique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueCategories(candidates: ScoutCandidate[]) {
  return Array.from(new Set(candidates.map((candidate) => candidate.category)));
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
    return 'Manual source';
  }
}
