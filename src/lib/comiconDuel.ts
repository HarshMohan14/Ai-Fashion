import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from './supabase';

export type DateOrDumpSide = 'left' | 'right';

export type DateOrDumpItemSnapshot = {
  id: string;
  name: string;
  image?: string;
  category: string;
};

export type DateOrDumpGameLook = {
  id: string;
  image_url: string;
  theme: string;
  status: string;
  model_id: string;
  model_name: string;
  model_photo: string;
  item_ids: string[];
  item_snapshot: DateOrDumpItemSnapshot[];
  prompt: string;
  created_at: string;
  date_count: number;
  dump_count: number;
  style_quotient_score: number;
};

export type DateOrDumpModel = {
  id: string;
  nickname: string;
  photo: string;
  runway_count: number;
};

export type DateOrDumpDuel = {
  client_id: string;
  round_index: number;
  model_id: string;
  model_name: string;
  scenario: string;
  left: DateOrDumpGameLook;
  right: DateOrDumpGameLook;
};

export type DateOrDumpAnswer = {
  duel: DateOrDumpDuel;
  winnerSide: DateOrDumpSide;
  winner: DateOrDumpGameLook;
  loser: DateOrDumpGameLook;
  responseMs: number;
  roseSide?: DateOrDumpSide | null;
  roseLook?: DateOrDumpGameLook | null;
};

export type DateOrDumpResult = {
  title: string;
  summary: string;
  tags: string[];
  archetype: string;
  geminiUsed: boolean;
};

type RawRunwayLook = {
  id: string;
  image_url: string;
  theme: string | null;
  status: string | null;
  model_id: string | null;
  item_ids: string[] | null;
  item_snapshot: DateOrDumpItemSnapshot[] | null;
  prompt: string | null;
  created_at: string;
  date_count?: number | null;
  dump_count?: number | null;
  style_quotient_score?: number | null;
};

type RawModel = {
  id: string;
  nickname: string;
  primary_photo_url?: string | null;
  composite_url?: string | null;
  photos?: {
    closeup?: string;
    front?: string;
    side?: string;
    composite?: string;
  } | null;
};

const DATE_OR_DUMP_ANON_KEY = 'dfb_date_or_dump_player_id';
const DATE_OR_DUMP_MISSING_MESSAGE =
  'Date or Dump storage is not ready. Run supabase/migrations/20260504120000_create_date_or_dump_pairwise_game.sql in the Supabase SQL Editor, then refresh.';

export const GAME_SCENARIOS = [
  'You spot him entering Comic Con in cosplay—which look is better?',
  'He is fixing his cape near the gate—which look is better?',
  'You see him walking through the crowd—which look is better?',
  'He stands below a giant anime banner—which look is better?',
  'You catch him posing at the photo wall—which look is better?',
  'He is getting ready for the cosplay contest—which look is better?',
  'He walks past with a prop sword—which look is better?',
  'You see him waiting in the badge line—which look is better?',
  'He enters the main hall like a hero—which look is better?',
  'You spot him near the Comic Con entrance—which look is better?',
  'You see him reading manga at a stall—which look is better?',
  'He is holding a rare manga volume—which look is better?',
  'He explains anime lore to a friend—which look is better?',
  'You catch him near the shonen poster wall—which look is better?',
  'He stands beside a giant anime cutout—which look is better?',
  'You see him choosing manga covers—which look is better?',
  'He waits for an anime screening—which look is better?',
  'He laughs at a manga meme booth—which look is better?',
  'He carries a bag full of manga—which look is better?',
  'You see him near the anime merch wall—which look is better?',
  'He walks past the superhero statue zone—which look is better?',
  'You see him at a comic merch stall—which look is better?',
  'He carries a rolled superhero poster—which look is better?',
  'He compares villain figurines at a booth—which look is better?',
  'He stands near a Batmobile display—which look is better?',
  'He poses with a superhero shield—which look is better?',
  'He enters the fan zone with confidence—which look is better?',
  'He chooses between hero and villain merch—which look is better?',
  'You spot him under neon comic panels—which look is better?',
  'He answers questions at superhero trivia—which look is better?',
  'He waits for his turn at a gaming booth—which look is better?',
  'You see him holding a game controller—which look is better?',
  'He wins a small gaming tournament—which look is better?',
  'He stands near the arcade machines—which look is better?',
  'You spot him trying a virtual reality demo—which look is better?',
  'He laughs after losing a game—which look is better?',
  'He checks out gaming keyboards at a stall—which look is better?',
  'He explains game strategy to a stranger—which look is better?',
  'You catch him near the e-sports stage—which look is better?',
  'He chooses a game-themed collectible—which look is better?',
  'He browses prints at Artist Alley—which look is better?',
  'He buys fan art from a small artist—which look is better?',
  "He compliments an illustrator's sketchbook—which look is better?",
  'He carries a rolled art poster—which look is better?',
  'He stands near a live sketch booth—which look is better?',
  'You see him reading an indie comic—which look is better?',
  'He talks about character design—which look is better?',
  'You spot him near a sticker wall—which look is better?',
  'He carefully carries several art prints—which look is better?',
  'He chooses a tiny enamel pin—which look is better?',
  'He asks you where the cosplay stage is—which look is better?',
  'He bumps your tote bag and apologizes—which look is better?',
  'You both reach for the same comic—which look is better?',
  'He asks you to click his cosplay photo—which look is better?',
  'He smiles while asking about the merch queue—which look is better?',
  'He helps you pick up dropped badges—which look is better?',
  'You laugh at the same booth sign—which look is better?',
  'He asks your opinion on a collectible—which look is better?',
  'He compliments your fandom shirt politely—which look is better?',
  'You wait together in the panel queue—which look is better?',
  'He sits in the front row of a fan panel—which look is better?',
  'He cheers during a voice actor session—which look is better?',
  'He asks a smart question at the mic—which look is better?',
  'He leaves a creator panel inspired—which look is better?',
  'You spot him near the celebrity signing booth—which look is better?',
  'He holds an autograph like treasure—which look is better?',
  'He waits for the next trailer reveal—which look is better?',
  'He reacts to a surprise announcement—which look is better?',
  'He debates fan theories after a panel—which look is better?',
  'He walks out of the auditorium lights—which look is better?',
  'He eats fries while holding a cosplay prop—which look is better?',
  'He balances nachos and merch bags—which look is better?',
  'He sits alone in the food court—which look is better?',
  'He sips iced coffee between panels—which look is better?',
  'He shares snacks with his group—which look is better?',
  'He waits calmly in a long food queue—which look is better?',
  'He laughs with sauce on his sleeve—which look is better?',
  'He takes a break on the convention floor—which look is better?',
  "He guards everyone's bags at the table—which look is better?",
  'He reviews his merch haul over lunch—which look is better?',
  'He walks into the Comic Con afterparty—which look is better?',
  'You see him under purple stage lights—which look is better?',
  'He dances awkwardly but confidently—which look is better?',
  'He stands near the DJ booth—which look is better?',
  'You spot him outside the venue at night—which look is better?',
  'He walks through neon merch stalls—which look is better?',
  'He waits for a cab with convention bags—which look is better?',
  'You see him at the late gaming lounge—which look is better?',
  'He glows under the LED booth lights—which look is better?',
  'He exits the hall like the credits rolled—which look is better?',
  'He enters Comic Con like an anime hero—which look is better?',
  'He bargains politely for merch—which look is better?',
  'He explains anime to a new fan—which look is better?',
  'He poses with a sword like a movie hero—which look is better?',
  'He says this is his last merch buy—which look is better?',
  "He carries everyone's Comic Con shopping bags—which look is better?",
  'He smiles through a sweaty cosplay moment—which look is better?',
  'You see him at a desi superhero booth—which look is better?',
  'He walks past with anime hair and confidence—which look is better?',
  'He leaves Comic Con tired but happy—which look is better?',
];

const SLANG_ARCHETYPES = [
  'KTM Lover',
  "Mumma's Boy Magnet",
  'Rajma Chawal Boy',
  'Red Flag Romeo',
  'Majnu Boy Radar',
  'Wannabe Boy Filter',
  'Shaadi Ready Prince',
  'Soft Launch Raja',
  'Gym Bro Dil',
  'Metro Crush',
  'Jugaadu Gentleman',
  'Green Flag Launda',
  'Clean Boy Collector',
  'Streetwear Shana',
  'Chai Tapri Charmer',
  'Sanskari Drip King',
  'Brunch Wala Banda',
  'Airport Crush Material',
];

export function getDateOrDumpAnonymousPlayerId() {
  if (typeof window === 'undefined') return crypto.randomUUID();
  const existing = window.localStorage.getItem(DATE_OR_DUMP_ANON_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(DATE_OR_DUMP_ANON_KEY, created);
  return created;
}

export async function fetchDateOrDumpGameData() {
  const [{ data: looksData, error: looksError }, { data: modelsData, error: modelsError }] = await Promise.all([
    supabase
      .from('runway_looks')
      .select('id,image_url,theme,status,model_id,item_ids,item_snapshot,prompt,created_at,date_count,dump_count,style_quotient_score')
      .eq('status', 'approved')
      .not('image_url', 'is', null)
      .neq('image_url', '')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('models_public')
      .select('id,nickname,primary_photo_url,composite_url,photos'),
  ]);

  if (looksError) {
    if (isMissingDateOrDumpStorageError(looksError)) throw new Error(DATE_OR_DUMP_MISSING_MESSAGE);
    throw looksError;
  }
  if (modelsError) throw modelsError;

  const modelsById = new Map((modelsData ?? []).map((model) => [model.id, model as RawModel]));
  const looks = ((looksData ?? []) as RawRunwayLook[])
    .map((look) => normalizeLook(look, modelsById))
    .filter((look): look is DateOrDumpGameLook => Boolean(look));

  const runwayCounts = new Map<string, number>();
  looks.forEach((look) => runwayCounts.set(look.model_id, (runwayCounts.get(look.model_id) ?? 0) + 1));

  const models = ((modelsData ?? []) as RawModel[])
    .map((model) => ({
      id: model.id,
      nickname: model.nickname,
      photo: normalizeImageUrl(modelPhoto(model)),
      runway_count: runwayCounts.get(model.id) ?? 0,
    }))
    .filter((model) => model.runway_count >= 2)
    .sort((a, b) => b.runway_count - a.runway_count || a.nickname.localeCompare(b.nickname));

  return { looks, models };
}

export function buildDateOrDumpDeck(
  looks: DateOrDumpGameLook[],
  models: DateOrDumpModel[],
  maxDuels = 10,
) {
  const modelIds = new Set(models.map((model) => model.id));
  const groups = new Map<string, DateOrDumpGameLook[]>();

  looks.forEach((look) => {
    if (!modelIds.has(look.model_id)) return;
    const current = groups.get(look.model_id) ?? [];
    current.push(look);
    groups.set(look.model_id, current);
  });

  const groupedPairs = shuffle([...groups.entries()])
    .map(([modelId, modelLooks]) => {
      const pairs: Array<[DateOrDumpGameLook, DateOrDumpGameLook]> = [];
      for (let i = 0; i < modelLooks.length; i += 1) {
        for (let j = i + 1; j < modelLooks.length; j += 1) {
          pairs.push(Math.random() > 0.5 ? [modelLooks[i], modelLooks[j]] : [modelLooks[j], modelLooks[i]]);
        }
      }
      return { modelId, pairs: shuffle(pairs) };
    })
    .filter((group) => group.pairs.length > 0);

  const deck: DateOrDumpDuel[] = [];
  while (deck.length < maxDuels) {
    let added = false;
    for (const group of groupedPairs) {
      if (deck.length >= maxDuels) break;
      const pair = group.pairs.shift();
      if (!pair) continue;
      const [left, right] = pair;
      const scenarios = shuffle(GAME_SCENARIOS);
      deck.push({
        client_id: crypto.randomUUID(),
        round_index: deck.length + 1,
        model_id: group.modelId,
        model_name: left.model_name,
        scenario: scenarios[deck.length % scenarios.length],
        left,
        right,
      });
      added = true;
    }
    if (!added) break;
  }

  return deck;
}

export async function createDateOrDumpSession(input: {
  anonymousPlayerId: string;
  totalDuels: number;
}) {
  const { data, error } = await supabase
    .from('date_or_dump_sessions')
    .insert({
      anonymous_player_id: input.anonymousPlayerId,
      total_duels: input.totalDuels,
      completed_duels: 0,
    })
    .select('id')
    .maybeSingle();

  if (error || !data) {
    if (error && isMissingDateOrDumpStorageError(error)) throw new Error(DATE_OR_DUMP_MISSING_MESSAGE);
    throw error ?? new Error('Could not start Date or Dump.');
  }

  return data.id as string;
}

export async function recordDateOrDumpDuel(input: {
  sessionId: string;
  anonymousPlayerId: string;
  duel: DateOrDumpDuel;
  winnerSide: DateOrDumpSide;
  responseMs: number;
}) {
  const winner = input.winnerSide === 'left' ? input.duel.left : input.duel.right;
  const loser = input.winnerSide === 'left' ? input.duel.right : input.duel.left;
  const { data, error } = await supabase.rpc('record_date_or_dump_duel', {
    p_session_id: input.sessionId,
    p_anonymous_player_id: input.anonymousPlayerId,
    p_round_index: input.duel.round_index,
    p_model_id: input.duel.model_id,
    p_left_look_id: input.duel.left.id,
    p_right_look_id: input.duel.right.id,
    p_winner_look_id: winner.id,
    p_loser_look_id: loser.id,
    p_winner_side: input.winnerSide,
    p_left_item_ids: input.duel.left.item_ids,
    p_right_item_ids: input.duel.right.item_ids,
    p_scenario: input.duel.scenario,
    p_response_ms: Math.max(0, Math.round(input.responseMs)),
  });

  if (error) {
    if (isMissingDateOrDumpStorageError(error)) throw new Error(DATE_OR_DUMP_MISSING_MESSAGE);
    throw error;
  }

  return data;
}

export async function completeDateOrDumpSession(input: {
  sessionId: string;
  completedDuels: number;
  result: DateOrDumpResult;
}) {
  const { error } = await supabase
    .from('date_or_dump_sessions')
    .update({
      completed_at: new Date().toISOString(),
      completed_duels: input.completedDuels,
      result_title: input.result.title,
      result_summary: input.result.summary,
      result_tags: input.result.tags,
      gemini_used: input.result.geminiUsed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.sessionId);

  if (error) {
    if (isMissingDateOrDumpStorageError(error)) throw new Error(DATE_OR_DUMP_MISSING_MESSAGE);
    throw error;
  }
}

export async function generateDateOrDumpResult(
  answers: DateOrDumpAnswer[],
  timeoutCount = 0,
): Promise<DateOrDumpResult> {
  const fallback = buildFallbackResult(answers, timeoutCount);
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key || answers.length === 0) return fallback;

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const signals = summarizeAnswers(answers, timeoutCount);
    const bannedLabel = fallback.title === 'Rajma Chawal Boy' ? 'Rajma Chawal Boy' : '';
    const resultPromise = model.generateContent(`
You are writing the final result card for a mobile fashion game called Date or Dump.
Audience: young women rating men's outfit taste.
Tone: Otaku / anime fan terminology, playful, premium, non-toxic. Do not insult the men.
Use clean anime community phrases like "Main Character Energy", "Senpai vibes",
"Final Boss Aura", "Slice of Life comfort fit", "Shonen Rival drip".
For title or archetype, prefer funny anime labels like "Isekai Protagonist", "Shonen Rival Energy",
"Slice of Life Charmer", "Mecha Pilot Chic", "Gamer Chair King", "Final Boss",
"Senpai Material", "Gacha Whale Energy", "Akatsuki Reject", "Convention Main Character",
or invent a similar catchy anime-related label.
Avoid repeating the same predictable label; use "Rajma Chawal Boy" only if the signals strongly say cozy slow-burn comfort.
${bannedLabel ? `Do NOT use this label in this run: ${bannedLabel}.` : ''}
Creativity seed: ${crypto.randomUUID()}
Keep it fun and fashion-focused, never mean or body-shaming.
Return ONLY compact JSON:
{
  "title": "max 6 words",
  "summary": "one punchy 25-45 word paragraph",
  "tags": ["3 short taste tags"],
  "archetype": "2-4 words"
}

Signals:
${JSON.stringify(signals, null, 2)}
    `.trim());
    const timeoutPromise = new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Gemini timeout')), 2500));
    const result = await Promise.race([resultPromise, timeoutPromise]);
    const text = result.response.text().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text) as Partial<DateOrDumpResult>;
    return {
      title: cleanText(parsed.title, fallback.title, 48),
      summary: cleanText(parsed.summary, fallback.summary, 240),
      tags: Array.isArray(parsed.tags) && parsed.tags.length > 0
        ? parsed.tags.map((tag) => cleanText(String(tag), '', 28)).filter(Boolean).slice(0, 3)
        : fallback.tags,
      archetype: cleanText(parsed.archetype, fallback.archetype, 40),
      geminiUsed: true,
    };
  } catch (error) {
    console.warn('[Date or Dump] Gemini result fallback used:', error);
    return fallback;
  }
}

export function applyDuelToLooks(
  looks: DateOrDumpGameLook[],
  winnerId: string,
  loserId: string,
) {
  return looks.map((look) => {
    if (look.id !== winnerId && look.id !== loserId) return look;
    const dateCount = look.date_count + (look.id === winnerId ? 1 : 0);
    const dumpCount = look.dump_count + (look.id === loserId ? 1 : 0);
    return {
      ...look,
      date_count: dateCount,
      dump_count: dumpCount,
      style_quotient_score: quotient(dateCount, dumpCount),
    };
  });
}

export function quotient(dateCount: number, dumpCount: number) {
  const total = dateCount + dumpCount;
  return total > 0 ? Math.round((dateCount / total) * 100) : 0;
}

function normalizeLook(
  look: RawRunwayLook,
  modelsById: Map<string, RawModel>,
): DateOrDumpGameLook | null {
  const imageUrl = normalizeImageUrl(look.image_url);
  const model = look.model_id ? modelsById.get(look.model_id) : undefined;
  if (look.status !== 'approved' || !look.id || !imageUrl || !look.model_id || !model) return null;
  const dateCount = Number(look.date_count ?? 0);
  const dumpCount = Number(look.dump_count ?? 0);
  return {
    id: look.id,
    image_url: imageUrl,
    theme: look.theme ?? '',
    status: look.status ?? 'draft',
    model_id: look.model_id,
    model_name: model.nickname || 'Model',
    model_photo: normalizeImageUrl(modelPhoto(model)),
    item_ids: look.item_ids ?? [],
    item_snapshot: normalizeSnapshot(look.item_snapshot),
    prompt: look.prompt ?? '',
    created_at: look.created_at,
    date_count: dateCount,
    dump_count: dumpCount,
    style_quotient_score: Number(look.style_quotient_score ?? quotient(dateCount, dumpCount)),
  };
}

function normalizeSnapshot(snapshot: DateOrDumpItemSnapshot[] | null | undefined) {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.map((item) => ({
    id: item.id,
    name: item.name || 'Outfit item',
    image: item.image || '',
    category: item.category || 'Unknown',
  }));
}

function modelPhoto(model: RawModel | undefined) {
  return model?.photos?.closeup
    || model?.photos?.front
    || model?.primary_photo_url
    || model?.composite_url
    || '';
}

function normalizeImageUrl(url: string | null | undefined) {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) return '';
  if (/^(https?:|data:image\/|blob:)/i.test(trimmed)) return trimmed;
  return '';
}

function summarizeAnswers(answers: DateOrDumpAnswer[], timeoutCount = 0) {
  const winnerModels = topValues(answers.map((answer) => answer.winner.model_name), 3);
  const winnerCategories = topValues(answers.flatMap((answer) => answer.winner.item_snapshot.map((item) => item.category)), 5);
  const loserCategories = topValues(answers.flatMap((answer) => answer.loser.item_snapshot.map((item) => item.category)), 5);
  const winnerThemes = topValues(answers.map((answer) => answer.winner.theme).filter(Boolean), 4);
  const roseModels = topValues(
    answers.map((answer) => answer.roseLook?.model_name ?? '').filter(Boolean),
    3,
  );
  const roseCategories = topValues(
    answers.flatMap((answer) => answer.roseLook?.item_snapshot.map((item) => item.category) ?? []),
    4,
  );
  const avgMs = answers.length
    ? Math.round(answers.reduce((sum, answer) => sum + answer.responseMs, 0) / answers.length)
    : 0;
  return {
    duels: answers.length,
    timeouts: timeoutCount,
    winnerModels,
    winnerCategories,
    loserCategories,
    winnerThemes,
    roseModels,
    roseCategories,
    averageDecisionMs: avgMs,
    sampleWinners: answers.slice(0, 6).map((answer) => ({
      model: answer.winner.model_name,
      theme: answer.winner.theme,
      categories: answer.winner.item_snapshot.map((item) => item.category).slice(0, 4),
    })),
  };
}

function buildFallbackResult(answers: DateOrDumpAnswer[], timeoutCount = 0): DateOrDumpResult {
  const signals = summarizeAnswers(answers, timeoutCount);
  const mainCategory = signals.winnerCategories[0] ?? 'anime drip';
  const topModel = signals.winnerModels[0] ?? 'the polished boys';
  const speed = signals.averageDecisionMs < 1800
    ? 'instant spark'
    : signals.averageDecisionMs < 3200
      ? 'calm confidence'
      : 'slow-burn charm';
  const title = fallbackTitle(mainCategory, speed);
  const timeoutLine = timeoutCount > 0
    ? ` ${timeoutCount} round${timeoutCount === 1 ? '' : 's'} mein timer ne thoda dimaag hila diya, but taste still clear hai.`
    : '';

  return {
    title,
    summary: `${topModel} ne clearly attention kheench liya. Your vibe is ${mainCategory.toLowerCase()} with ${speed}; matlab full green-flag dressing sense, thoda shana, thoda filmy, but outfit person se zyada loud nahi.${timeoutLine}`,
    tags: [mainCategory, slangSpeed(speed), signals.winnerThemes[0] ?? 'senpai aura'].map((tag) => cleanText(tag, 'style', 28)),
    archetype: title,
    geminiUsed: false,
  };
}

function fallbackTitle(category: string, speed: string) {
  if (/kurta|indian|ethnic|wedding|festive/i.test(category)) {
    return pickRandom(['Shaadi Ready Prince', 'Sanskari Drip King', 'Green Flag Launda']);
  }
  if (/shirt|linen|formal|tailor/i.test(category)) {
    return pickRandom(["Mumma's Boy Magnet", 'Clean Boy Collector', 'Soft Launch Raja']);
  }
  if (/sneaker|street|denim|jacket/i.test(category)) {
    return pickRandom(['KTM Lover', 'Streetwear Shana', 'Metro Crush']);
  }
  if (/watch|accessory|chain|bracelet/i.test(category)) {
    return pickRandom(['Wannabe Boy Filter', 'Red Flag Romeo', 'Jugaadu Gentleman']);
  }
  if (speed === 'instant spark') return pickRandom(['Majnu Boy Radar', 'Metro Crush', 'Airport Crush Material']);
  if (speed === 'slow-burn charm') return pickRandom(['Rajma Chawal Boy', 'Chai Tapri Charmer', 'Brunch Wala Banda']);
  return pickRandom(SLANG_ARCHETYPES.filter((label) => label !== 'Rajma Chawal Boy'));
}

function slangSpeed(speed: string) {
  if (speed === 'instant spark') return 'full filmy spark';
  if (speed === 'calm confidence') return 'sorted confidence';
  return 'slow-burn charm';
}

function topValues(values: string[], limit: number) {
  const counts = new Map<string, number>();
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

function cleanText(value: unknown, fallback: string, limit: number) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).replace(/\s+/g, ' ').slice(0, limit);
}

function pickRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isMissingDateOrDumpStorageError(error: unknown) {
  const err = error as { code?: string; message?: string };
  const message = err?.message ?? String(error);
  return err?.code === 'PGRST205'
    || err?.code === '42883'
    || err?.code === '42P01'
    || /date_or_dump_sessions|date_or_dump_duels|record_date_or_dump_duel|date_count|dump_count|style_quotient/i.test(message);
}
