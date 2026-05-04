import { supabase } from './supabase';

export type RagKnowledgeBaseEntryType = 'reference' | 'feedback';
export type FeedbackMetric = 'face' | 'body' | 'style' | 'hair' | 'complexion';

export type MetricFeedback = {
  score: number;
  note: string;
};

export type RagFeedbackInput = Record<FeedbackMetric, MetricFeedback>;

export type ModelReferenceImage = {
  id: string;
  model_id: string;
  look_id: string | null;
  image_url: string;
  is_active: boolean;
  created_at: string;
};

export type RagKnowledgeBaseFeedback = {
  id: string;
  model_id: string;
  look_id: string | null;
  face_score: number;
  face_note: string;
  body_score: number;
  body_note: string;
  style_score: number;
  style_note: string;
  hair_score: number;
  hair_note: string;
  complexion_score: number;
  complexion_note: string;
  created_at: string;
};

export type RagKnowledgeBaseRow = Partial<ModelReferenceImage & RagKnowledgeBaseFeedback> & {
  id: string;
  model_id: string;
  look_id: string | null;
  entry_type: RagKnowledgeBaseEntryType;
  image_url: string;
  is_active: boolean;
  created_at: string;
};

const METRICS: Array<{ key: FeedbackMetric; label: string }> = [
  { key: 'face', label: 'Face' },
  { key: 'body', label: 'Body' },
  { key: 'style', label: 'Style' },
  { key: 'hair', label: 'Hair' },
  { key: 'complexion', label: 'Complexion' },
];

const RAG_KNOWLEDGE_BASE_SELECT =
  'id, model_id, look_id, entry_type, image_url, is_active, face_score, face_note, body_score, body_note, style_score, style_note, hair_score, hair_note, complexion_score, complexion_note, created_at';
const RAG_KNOWLEDGE_BASE_MISSING_UNTIL = 'dfb_rag_knowledge_base_missing_until';
const RAG_MISSING_COOLDOWN_MS = 60_000;

export function clampScore(score: number) {
  return Math.max(1, Math.min(5, Math.round(score || 3)));
}

export function normalizeRagFeedback(input: RagFeedbackInput): RagFeedbackInput {
  return METRICS.reduce((acc, metric) => {
    const value = input[metric.key] ?? { score: 3, note: '' };
    acc[metric.key] = {
      score: clampScore(value.score),
      note: value.note.trim().replace(/\s+/g, ' ').slice(0, 500),
    };
    return acc;
  }, {} as RagFeedbackInput);
}

export async function fetchRagKnowledgeBaseRows(limit = 300) {
  if (shouldSkipRagKnowledgeBaseRequest()) return [] as RagKnowledgeBaseRow[];

  const { data, error } = await supabase
    .from('rag_knowledge_base')
    .select(RAG_KNOWLEDGE_BASE_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingRagKnowledgeBaseError(error)) {
      pauseRagKnowledgeBaseRequests();
      return [] as RagKnowledgeBaseRow[];
    }
    throw error;
  }

  return (data ?? []) as RagKnowledgeBaseRow[];
}

export async function saveModelReferenceImage(modelId: string, lookId: string, imageUrl: string) {
  if (!modelId || !lookId || !imageUrl) return null;
  assertRagKnowledgeBaseAvailable();

  await supabase
    .from('rag_knowledge_base')
    .update({ is_active: false })
    .eq('model_id', modelId)
    .eq('entry_type', 'reference')
    .eq('is_active', true);

  const { data, error } = await supabase
    .from('rag_knowledge_base')
    .insert({
      model_id: modelId,
      look_id: lookId,
      entry_type: 'reference',
      image_url: imageUrl,
      is_active: true,
    })
    .select('id, model_id, look_id, image_url, is_active, created_at')
    .maybeSingle();

  if (error) {
    handleWriteError(error);
  }
  return data as ModelReferenceImage | null;
}

export async function saveRagKnowledgeFeedback(
  modelId: string,
  lookId: string | null | undefined,
  feedback: RagFeedbackInput,
) {
  assertRagKnowledgeBaseAvailable();
  const normalized = normalizeRagFeedback(feedback);
  const { data, error } = await supabase
    .from('rag_knowledge_base')
    .insert({
      model_id: modelId,
      look_id: lookId || null,
      entry_type: 'feedback',
      face_score: normalized.face.score,
      face_note: normalized.face.note,
      body_score: normalized.body.score,
      body_note: normalized.body.note,
      style_score: normalized.style.score,
      style_note: normalized.style.note,
      hair_score: normalized.hair.score,
      hair_note: normalized.hair.note,
      complexion_score: normalized.complexion.score,
      complexion_note: normalized.complexion.note,
    })
    .select(
      'id, model_id, look_id, face_score, face_note, body_score, body_note, style_score, style_note, hair_score, hair_note, complexion_score, complexion_note, created_at',
    )
    .maybeSingle();

  if (error) {
    handleWriteError(error);
  }
  return data as RagKnowledgeBaseFeedback | null;
}

export function referenceFromRow(row: RagKnowledgeBaseRow): ModelReferenceImage {
  return {
    id: row.id,
    model_id: row.model_id,
    look_id: row.look_id,
    image_url: row.image_url,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

export function feedbackFromRow(row: RagKnowledgeBaseRow): RagKnowledgeBaseFeedback {
  return {
    id: row.id,
    model_id: row.model_id,
    look_id: row.look_id,
    face_score: row.face_score ?? 3,
    face_note: row.face_note ?? '',
    body_score: row.body_score ?? 3,
    body_note: row.body_note ?? '',
    style_score: row.style_score ?? 3,
    style_note: row.style_note ?? '',
    hair_score: row.hair_score ?? 3,
    hair_note: row.hair_note ?? '',
    complexion_score: row.complexion_score ?? 3,
    complexion_note: row.complexion_note ?? '',
    created_at: row.created_at,
  };
}

export function formatRagKnowledgeForPrompt(feedbackRows: RagKnowledgeBaseFeedback[] = []) {
  const rows = feedbackRows.slice(0, 6);
  const lines: string[] = [];

  for (const metric of METRICS) {
    const notes = rows
      .map((row) => ({
        score: row[`${metric.key}_score` as keyof RagKnowledgeBaseFeedback],
        note: String(row[`${metric.key}_note` as keyof RagKnowledgeBaseFeedback] ?? '').trim(),
      }))
      .filter((item) => item.note)
      .slice(0, 4);

    if (notes.length > 0) {
      lines.push(`${metric.label}: ${notes.map((item) => `score ${item.score}/5 - ${item.note}`).join('; ')}`);
    }
  }

  return lines.join('\n');
}

export function summarizeRagFeedback(feedback: RagFeedbackInput) {
  const normalized = normalizeRagFeedback(feedback);
  return METRICS
    .map((metric) => {
      const value = normalized[metric.key];
      const suffix = value.note ? `: ${value.note}` : '';
      return `${metric.label} ${value.score}/5${suffix}`;
    })
    .join(' | ');
}

export const feedbackMetrics = METRICS;

export function isMissingRagKnowledgeBaseError(error: unknown) {
  const err = error as { code?: string; message?: string };
  const message = err?.message ?? String(error);
  return err?.code === 'PGRST205' || /rag_knowledge_base.*schema cache|Could not find the table/i.test(message);
}

function assertRagKnowledgeBaseAvailable() {
  if (!shouldSkipRagKnowledgeBaseRequest()) return;
  throw new Error(
    'rag_knowledge_base is not available yet. Run supabase/migrations/20260502200000_create_rag_knowledge_base.sql in the Supabase SQL Editor, then refresh the app.',
  );
}

function handleWriteError(error: unknown): never {
  if (isMissingRagKnowledgeBaseError(error)) {
    pauseRagKnowledgeBaseRequests();
    throw new Error(
      'rag_knowledge_base is missing in Supabase. Run supabase/migrations/20260502200000_create_rag_knowledge_base.sql in the SQL Editor, then refresh the app.',
    );
  }
  throw error;
}

function shouldSkipRagKnowledgeBaseRequest() {
  if (typeof window === 'undefined') return false;
  const until = Number(window.sessionStorage.getItem(RAG_KNOWLEDGE_BASE_MISSING_UNTIL) ?? 0);
  return Number.isFinite(until) && until > Date.now();
}

function pauseRagKnowledgeBaseRequests() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(RAG_KNOWLEDGE_BASE_MISSING_UNTIL, String(Date.now() + RAG_MISSING_COOLDOWN_MS));
}
