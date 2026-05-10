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
  'You catch him walking into a rooftop party. Which look makes you pause?',
  'He is across the cafe counter. Which outfit gets the second glance?',
  'You see him at a wedding lawn. Which fit has the better aura?',
  'He steps into an airport lounge. Which version looks more magnetic?',
  'He is waiting near the DJ console. Which one owns the room?',
  'You spot him outside the movie screen. Which look feels date-worthy?',
  'He walks into the office lobby. Which styling feels sharper?',
  'You see him at a bookstore. Which outfit has the softer charm?',
  'He is at a brunch table nearby. Which look feels more effortless?',
  'You notice him at an art opening. Which version has better taste?',
  'He is standing near the valet. Which look feels more premium?',
  'You spot him at a cricket screening. Which fit has more personality?',
  'He enters a Bandra house party. Which look feels like main character entry?',
  'You see him outside a Delhi club. Which outfit gets the group chat approval?',
  'He is ordering momos at midnight. Which fit still looks date-worthy?',
  'He walks into a salon waiting area. Which version has better first-look energy?',
  'You see him at a Sunday flea market. Which look feels more stylishly chill?',
  'He is at a college fest. Which outfit gives the cleaner crush vibe?',
  'You notice him at a beach cafe in Goa. Which look owns the sunset?',
  'He is waiting at a metro platform. Which fit makes you look twice?',
  'He walks into a luxury store. Which version does not look try-hard?',
  'You see him at a friend engagement. Which outfit feels more green flag?',
  'He is beside you at a dessert counter. Which look has sweeter charm?',
  'He appears at a co-working space. Which outfit says sorted but fun?',
  'You spot him near the DJ booth. Which version has better party chemistry?',
  'He is at a bookstore with coffee. Which look feels quietly attractive?',
  'You see him at a Sunday farmers market. Which fit feels warm and effortless?',
  'He enters your office lobby. Which outfit looks sharper without doing too much?',
  'He is standing outside the same movie screen. Which look feels more dateable?',
  'You notice him at an airport gate. Which travel fit has better aura?',
  'He is at a rooftop bar alone. Which version feels mysterious in a good way?',
  'He walks past your brunch table. Which outfit has better soft-launch potential?',
  'You see him at an art gallery opening. Which look feels more tasteful?',
  'He is at a cricket screening with friends. Which fit has better personality?',
  'You spot him at Starbucks ahead of you. Which look gets the second glance?',
  'He is waiting at the valet. Which version gives premium without flexing?',
  'He walks into a wedding sangeet. Which outfit has better shaadi season energy?',
  'You see him at a gym cafe, not in gym clothes. Which look feels more put-together?',
  'He is at a music concert entrance. Which outfit has better crowd energy?',
  'You notice him at a hotel lobby. Which look feels more grown-up?',
  'He is at a terrace game night. Which version gives better boyfriend material?',
  'You see him at a street food lane. Which fit survives the chaos stylishly?',
  'He walks into a Diwali card party. Which look gets auntie approval and your approval?',
  'He is at a friend birthday dinner. Which outfit feels most effortless?',
  'You spot him near a sneaker wall. Which look feels cool, not wannabe?',
  'He is standing at a pani puri counter. Which version has better charm?',
  'You see him at a mall atrium. Which outfit makes him stand out cleanly?',
  'He enters a comedy show late. Which look still makes a good entrance?',
  'You notice him at a rainy chai tapri. Which fit has comfort-crush energy?',
  'He is at a boutique launch. Which version feels fashion-aware but normal?',
  'You see him walking into a resort breakfast. Which look feels vacation green flag?',
  'He is outside a music studio. Which outfit feels more creative?',
  'You catch him at a family function buffet. Which look has better sanskaar plus style?',
  'He walks into a late-night bowling alley. Which fit feels more fun?',
  'You see him at a campus canteen. Which outfit has cleaner crush potential?',
  'He is buying flowers at a market. Which version feels less performative?',
  'You notice him near the elevator mirror. Which look wins the quick scan?',
  'He is at a friend house party balcony. Which outfit has better slow-burn energy?',
  'You see him during a shopping trial-room wait. Which fit feels more confident?',
  'You spot him entering Comic Con in full cosplay confidence. Which look makes you stop scrolling IRL?',
  'He is fixing his cosplay cape near the entrance gate. Which outfit has main-character pull?',
  'You see him walking through the Comic Con crowd. Which version feels more photo-worthy?',
  'He is standing under the big anime banner. Which look wins the first glance?',
  'You catch him posing near the convention backdrop. Which fit has better fan-favorite energy?',
  'He is adjusting his wrist armor before a cosplay contest. Which version looks more legendary?',
  'He walks past with a prop sword on his shoulder. Which outfit feels more hero-coded?',
  'You see him in the badge pickup line. Which look already feels like the protagonist?',
  'He enters the convention hall with dramatic timing. Which fit gives better opening-scene aura?',
  'You spot him near the Comic Con welcome arch. Which version makes the cleaner entrance?',
  'He is browsing the manga stall quietly. Which look gives better soft anime-boy charm?',
  'You see him holding a limited-edition manga volume. Which outfit feels more crush-worthy?',
  'He is explaining anime lore to his friend. Which fit makes the nerdy vibe attractive?',
  'You catch him near the shonen poster wall. Which version has better rival-turned-love-interest energy?',
  'He is standing beside a giant anime cutout. Which look feels more fan-service but classy?',
  'You see him checking out collectible manga covers. Which outfit gives smarter otaku charm?',
  'He is waiting for an anime screening panel. Which fit feels more watch-party dateable?',
  'You spot him laughing at a manga meme booth. Which version has better wholesome chaos?',
  'He is carrying a tote full of manga buys. Which outfit still looks stylish after the haul?',
  'You see him near the anime merch wall. Which fit gets the bigger notice-me-senpai moment?',
  'He walks past the superhero statue zone. Which look feels more secret-identity hot?',
  'You see him near the Marvel/DC merch stall. Which outfit has better comic-book boyfriend energy?',
  'He is holding a superhero poster tube. Which version looks more collector but cool?',
  'You catch him comparing villain figurines. Which fit has better bad-boy-but-safe energy?',
  'He is standing near a Batmobile-style display. Which look feels more billionaire vigilante?',
  'You see him posing with a superhero shield prop. Which outfit feels more save-the-day coded?',
  'He walks into the fan zone like a post-credit scene. Which fit has better surprise cameo aura?',
  'He is choosing between hero and villain merch. Which version feels more dangerous in a fun way?',
  'You spot him under neon comic panels. Which look has better graphic-novel energy?',
  'He is at a superhero trivia booth. Which outfit makes geek knowledge look attractive?',
  'He is waiting for his turn at the gaming booth. Which look feels more player-one material?',
  'You see him holding a controller with full focus. Which outfit has better gamer crush energy?',
  'He wins a mini tournament round. Which fit makes the victory look cooler?',
  'He is standing near the arcade machines. Which version feels more retro-cool?',
  'You spot him at the VR demo station. Which look feels more futuristic boyfriend?',
  'He is laughing after losing a game badly. Which outfit makes the L look charming?',
  'You see him checking out gaming keyboards. Which fit says gamer but still dateable?',
  'He is explaining game strategy to a stranger. Which version feels more confident, not try-hard?',
  'You catch him near the e-sports stage lights. Which look has better champion aura?',
  'He is choosing a game-themed collectible. Which outfit feels more side-quest crush?',
  'He is browsing prints at Artist Alley. Which look feels more tasteful and creative?',
  'You see him buying fan art from a small artist. Which outfit gives better green-flag energy?',
  "He is complimenting an illustrator's sketchbook. Which fit feels more emotionally intelligent?",
  'You catch him holding a rolled art poster. Which version has better artsy-boy charm?',
  'He is standing near a live sketch booth. Which outfit feels more muse-worthy?',
  'You see him reading indie comic panels. Which look says creative without performing?',
  'He is talking to an artist about character design. Which fit has better thoughtful-nerd aura?',
  'You spot him at the sticker wall. Which version feels more cute-chaotic?',
  'He is carrying too many art prints carefully. Which outfit makes the carefulness attractive?',
  'You see him choosing a tiny enamel pin. Which look has better detail-oriented charm?',
  'He asks you where the cosplay stage is. Which look makes you want to answer slowly?',
  'He accidentally bumps into your tote bag and apologizes. Which fit makes the moment cinematic?',
  'You both reach for the same comic at a stall. Which version turns it into a rom-com scene?',
  'He asks if you can click his cosplay photo. Which outfit makes you take three extra shots?',
  'He smiles while asking about the merch queue. Which look gives better instant spark?',
  'He helps you pick up dropped convention badges. Which fit feels more green flag?',
  'You catch him laughing at the same weird booth sign. Which version has better meet-cute energy?',
  'He asks for your opinion on a collectible. Which outfit makes the conversation continue?',
  'He compliments your fandom tee respectfully. Which look feels more genuine, less creepy?',
  'You both get stuck in the same panel queue. Which fit makes the wait more interesting?',
  'He is seated in the front row of a fan panel. Which outfit feels more serious-fan attractive?',
  'You see him cheering during a voice actor session. Which look has better wholesome fandom energy?',
  'He is asking a smart question at the mic. Which fit makes him sound even cooler?',
  'He walks out of a creator panel inspired. Which version feels more ambitious?',
  'You spot him near the celebrity signing booth. Which outfit gives better calm confidence?',
  'He is holding an autograph like treasure. Which look makes fanboy energy cute?',
  'He is waiting for the next trailer reveal. Which fit feels more premiere-night ready?',
  'You see him react to a surprise announcement. Which version has better excited-boy charm?',
  'He is debating theories after a panel. Which outfit makes overthinking look attractive?',
  'He walks out of the auditorium lights. Which look gives better post-panel glow?',
  'He is eating fries while holding a cosplay prop. Which look survives Comic Con chaos better?',
  'You see him balancing nachos and merch bags. Which outfit still feels date-worthy?',
  'He is sitting alone at the food court scrolling fan updates. Which fit makes him approachable?',
  'You spot him sipping iced coffee between panels. Which version has better recharge energy?',
  'He is sharing snacks with his group. Which look gives better generous-boy vibe?',
  'He is standing in a ridiculous food queue. Which outfit makes patience look attractive?',
  'You see him laughing with sauce on his sleeve. Which fit still keeps the charm?',
  'He is taking a break on the convention floor. Which version looks more effortlessly cool?',
  "He is guarding everyone's bags at the table. Which look screams reliable green flag?",
  'You catch him reviewing his merch haul over lunch. Which outfit feels more adorable than messy?',
  'He walks into the Comic Con afterparty. Which look owns the neon lights?',
  'You see him under purple stage lighting. Which outfit feels more electric?',
  'He is dancing awkwardly but confidently. Which fit makes awkward look cute?',
  'He is near the DJ booth in cosplay pieces. Which version has better party chemistry?',
  'You spot him outside the venue after dark. Which look feels more mysterious but safe?',
  'He is walking through neon merch stalls at closing time. Which outfit has better final-scene aura?',
  'He is waiting for a cab with convention bags. Which fit feels more end-of-day crush?',
  'You see him at the after-hours gaming lounge. Which version gives better late-night player energy?',
  'He is glowing under LED booth lights. Which look feels more cyberpunk boyfriend?',
  'He exits the convention hall like the credits just rolled. Which outfit has better finale energy?',
  'He enters Comic Con like full anime ka hero. Which fit gets the arre-waah reaction?',
  'You see him bargaining for merch politely. Which look gives better sanskaar plus fandom?',
  'He is explaining anime to his non-anime friend. Which outfit makes the lecture cute?',
  'He is posing with a prop sword like full filmy entry. Which version has better hero material?',
  'You spot him saying bas last merch buy for the third time. Which fit makes the delusion charming?',
  "He is carrying everyone's Comic Con shopping bags. Which look gives better boyfriend duty energy?",
  'He is sweating in costume but still smiling. Which outfit keeps the charm alive?',
  'You see him at a desi superhero fan booth. Which version feels more local legend?',
  'He walks past with anime hair and full confidence. Which fit says cringe nahi, commitment?',
  'He is leaving Comic Con tired but glowing. Which look makes you wish for a sequel?',
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
    const result = await model.generateContent(`
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
