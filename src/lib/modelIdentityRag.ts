import {
  formatRagKnowledgeForPrompt,
  saveRagKnowledgeFeedback,
  type FeedbackMetric,
  type RagKnowledgeBaseFeedback,
  type RagFeedbackInput,
} from './ragKnowledgeBase';

export type ModelIdentityRagSource = 'manual_runway' | 'ai_identity_critic';

export type ModelIdentityRagLesson = {
  id: string;
  model_id: string;
  look_id: string | null;
  source: ModelIdentityRagSource;
  lesson: string;
  created_at: string;
};

const fallbackScores: Record<FeedbackMetric, { score: number; note: string }> = {
  face: { score: 3, note: '' },
  body: { score: 3, note: '' },
  style: { score: 3, note: '' },
  hair: { score: 3, note: '' },
  complexion: { score: 3, note: '' },
};

export function formatIdentityLessonsForPrompt(lessons: ModelIdentityRagLesson[] = []) {
  return lessons.map((lesson) => lesson.lesson).filter(Boolean).join('\n');
}

export async function saveModelIdentityLesson(
  modelId: string,
  lesson: string,
  _source: ModelIdentityRagSource,
  lookId?: string,
) {
  const feedback: RagFeedbackInput = {
    ...fallbackScores,
    body: { score: 2, note: lesson },
  };
  const saved = await saveRagKnowledgeFeedback(modelId, lookId ?? '', feedback);
  return saved ? legacyLessonFromFeedback(saved, lesson, 'manual_runway') : null;
}

export function compileIdentityLessons(feedbackRows: RagKnowledgeBaseFeedback[] = []) {
  return formatRagKnowledgeForPrompt(feedbackRows);
}

function legacyLessonFromFeedback(
  feedback: RagKnowledgeBaseFeedback,
  lesson: string,
  source: ModelIdentityRagSource,
): ModelIdentityRagLesson {
  return {
    id: feedback.id,
    model_id: feedback.model_id,
    look_id: feedback.look_id,
    source,
    lesson,
    created_at: feedback.created_at,
  };
}
