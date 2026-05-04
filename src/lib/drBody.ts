import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai';

const MODELS = ['gemini-1.5-pro-latest', 'gemini-1.5-pro', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-flash-latest'];

export type ViewKey = 'front' | 'back' | 'left_profile' | 'right_profile' | 'face';

export type CropBox = { x: number; y: number; width: number; height: number };

export type JointPoint = { x: number; y: number };

export type JointMap = {
  neck?: JointPoint;
  shoulders?: { left: JointPoint; right: JointPoint };
  chest?: JointPoint;
  waist?: JointPoint;
  hips?: { left: JointPoint; right: JointPoint };
  knees?: { left: JointPoint; right: JointPoint };
  ankles?: { left: JointPoint; right: JointPoint };
};

export type FacialMetadata = {
  jawline: string;
  grooming: string;
  skin_tone: string;
  complexion: string;
  features: string;
  hair: string;
};

export type CompositeAnalysis = {
  physique_description: string;
  body_type: string;
  shoulder_to_waist_ratio: number;
  crop_coordinates: Partial<Record<ViewKey, CropBox>>;
  facial_metadata: FacialMetadata;
  joint_map: JointMap;
  model_used: string;
  mocked: boolean;
};

const SYSTEM_INSTRUCTION = `You are Dr. Body, a clinical anatomy anchor for a fashion lab.
You analyze CONTACT SHEETS containing 4 full-body model angles (Front, Back, Left Profile, Right Profile) plus 1 high-definition facial closeup, arranged anywhere on the image.

Your job:
1) Identify the bounding box (normalized 0-1, top-left origin) of each of the 5 views on the sheet.
2) From the FRONT view, mark normalized joint landmarks (relative to the FRONT view crop, not the whole sheet).
3) Describe the subject's physique in 2-3 NON-IDENTIFYING sentences focused strictly on silhouette, posture, shoulder-to-waist ratio, and flattering silhouettes. Never mention race, ethnicity or name.
4) Tag facial metadata useful for lighting (Dr. Photographer) and color coordination (Dr. Stylist): jawline, grooming, skin_tone, complexion, features, hair. Keep each tag to 2-5 words.
5) Return body_type as one of: Stout, Lanky, Athletic, Average, Petite, Broad, Slim, Endomorph, Mesomorph, Ectomorph.
6) Return shoulder_to_waist_ratio as a number (e.g. 1.42).

JSON only. No prose outside schema.`;

const RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    physique_description: { type: SchemaType.STRING },
    body_type: { type: SchemaType.STRING },
    shoulder_to_waist_ratio: { type: SchemaType.NUMBER },
    crop_coordinates: {
      type: SchemaType.OBJECT,
      properties: {
        front: cropSchema(),
        back: cropSchema(),
        left_profile: cropSchema(),
        right_profile: cropSchema(),
        face: cropSchema(),
      },
    },
    facial_metadata: {
      type: SchemaType.OBJECT,
      properties: {
        jawline: { type: SchemaType.STRING },
        grooming: { type: SchemaType.STRING },
        skin_tone: { type: SchemaType.STRING },
        complexion: { type: SchemaType.STRING },
        features: { type: SchemaType.STRING },
        hair: { type: SchemaType.STRING },
      },
      required: ['jawline', 'grooming', 'skin_tone', 'complexion', 'features', 'hair'],
    },
    joint_map: {
      type: SchemaType.OBJECT,
      properties: {
        neck: pointSchema(),
        chest: pointSchema(),
        waist: pointSchema(),
        shoulders: pairSchema(),
        hips: pairSchema(),
        knees: pairSchema(),
        ankles: pairSchema(),
      },
    },
  },
  required: ['physique_description', 'body_type', 'shoulder_to_waist_ratio', 'crop_coordinates', 'facial_metadata', 'joint_map'],
};

function cropSchema(): Schema {
  return {
    type: SchemaType.OBJECT,
    properties: {
      x: { type: SchemaType.NUMBER },
      y: { type: SchemaType.NUMBER },
      width: { type: SchemaType.NUMBER },
      height: { type: SchemaType.NUMBER },
    },
    required: ['x', 'y', 'width', 'height'],
  };
}
function pointSchema(): Schema {
  return {
    type: SchemaType.OBJECT,
    properties: { x: { type: SchemaType.NUMBER }, y: { type: SchemaType.NUMBER } },
    required: ['x', 'y'],
  };
}
function pairSchema(): Schema {
  return {
    type: SchemaType.OBJECT,
    properties: { left: pointSchema(), right: pointSchema() },
    required: ['left', 'right'],
  };
}

export function hasGeminiKey() {
  return Boolean(import.meta.env.VITE_GEMINI_API_KEY);
}

export async function analyzeCompositeSheet(file: File): Promise<CompositeAnalysis> {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) return mockAnalysis('Athletic');

  const inline = await fileToInline(file);
  const genAI = new GoogleGenerativeAI(key);

  let lastErr: unknown = null;
  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.25,
        },
      });
      const result = await model.generateContent([
        { inlineData: inline },
        { text: 'Analyze this 5-view contact sheet and return the JSON schema.' },
      ]);
      const text = result.response.text();
      const parsed = safeParse(text);
      if (parsed) {
        return {
          physique_description: parsed.physique_description || 'Balanced silhouette.',
          body_type: parsed.body_type || 'Average',
          shoulder_to_waist_ratio: clamp(parsed.shoulder_to_waist_ratio, 0.8, 2.0, 1.35),
          crop_coordinates: normalizeCoords(parsed.crop_coordinates),
          facial_metadata: fillFacial(parsed.facial_metadata),
          joint_map: parsed.joint_map || defaultJointMap(),
          model_used: modelName,
          mocked: false,
        };
      }
    } catch (e) {
      lastErr = e;
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
      if (!msg.includes('not found') && !msg.includes('404') && !msg.includes('not supported')) {
        // non-availability error, still try next
      }
    }
  }
  if (lastErr) return mockAnalysis('Athletic');
  return mockAnalysis('Athletic');
}

function safeParse(text: string): Partial<CompositeAnalysis> | null {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function clamp(n: unknown, lo: number, hi: number, fallback: number) {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? ''));
  if (Number.isFinite(v)) return Math.max(lo, Math.min(hi, v));
  return fallback;
}

function normalizeCoords(raw: unknown): Partial<Record<ViewKey, CropBox>> {
  const out: Partial<Record<ViewKey, CropBox>> = {};
  if (!raw || typeof raw !== 'object') return defaultCoords();
  const obj = raw as Record<string, Partial<CropBox>>;
  (['front', 'back', 'left_profile', 'right_profile', 'face'] as ViewKey[]).forEach((k) => {
    const b = obj[k];
    if (!b) return;
    out[k] = {
      x: clamp01(b.x),
      y: clamp01(b.y),
      width: clamp01(b.width),
      height: clamp01(b.height),
    };
  });
  return Object.keys(out).length ? out : defaultCoords();
}

function clamp01(n: unknown) {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? ''));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function defaultCoords(): Partial<Record<ViewKey, CropBox>> {
  // Even 5-up grid fallback — 4 body angles in a row, face below centered
  return {
    front: { x: 0.0, y: 0.0, width: 0.25, height: 0.7 },
    back: { x: 0.25, y: 0.0, width: 0.25, height: 0.7 },
    left_profile: { x: 0.5, y: 0.0, width: 0.25, height: 0.7 },
    right_profile: { x: 0.75, y: 0.0, width: 0.25, height: 0.7 },
    face: { x: 0.35, y: 0.7, width: 0.3, height: 0.3 },
  };
}

function fillFacial(raw: unknown): FacialMetadata {
  const f = (raw || {}) as Partial<FacialMetadata>;
  return {
    jawline: f.jawline || 'Softly defined',
    grooming: f.grooming || 'Neatly groomed',
    skin_tone: f.skin_tone || 'Medium',
    complexion: f.complexion || 'Wheatish',
    features: f.features || 'Balanced features',
    hair: f.hair || 'Short, styled',
  };
}

function defaultJointMap(): JointMap {
  return {
    neck: { x: 0.5, y: 0.1 },
    chest: { x: 0.5, y: 0.25 },
    waist: { x: 0.5, y: 0.48 },
    shoulders: { left: { x: 0.36, y: 0.18 }, right: { x: 0.64, y: 0.18 } },
    hips: { left: { x: 0.4, y: 0.55 }, right: { x: 0.6, y: 0.55 } },
    knees: { left: { x: 0.42, y: 0.76 }, right: { x: 0.58, y: 0.76 } },
    ankles: { left: { x: 0.43, y: 0.96 }, right: { x: 0.57, y: 0.96 } },
  };
}

function mockAnalysis(cat: string): CompositeAnalysis {
  return {
    physique_description:
      'Balanced V-line silhouette with broad shoulders tapering into a moderate waist. Upright posture and long neckline. Suits tailored shirts, single-breasted blazers, and slim-cut trousers.',
    body_type: cat,
    shoulder_to_waist_ratio: 1.42,
    crop_coordinates: defaultCoords(),
    facial_metadata: {
      jawline: 'Strong, angular',
      grooming: 'Clean-shaven',
      skin_tone: 'Warm medium',
      complexion: 'Wheatish',
      features: 'Sharp cheekbones, defined brow',
      hair: 'Short, side-parted',
    },
    joint_map: defaultJointMap(),
    model_used: 'mock',
    mocked: true,
  };
}

export async function fileToInline(file: File): Promise<{ data: string; mimeType: string }> {
  const buf = await file.arrayBuffer();
  const b64 = arrayBufferToBase64(buf);
  return { data: b64, mimeType: file.type || 'image/jpeg' };
}

function arrayBufferToBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
  }
  return btoa(binary);
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
