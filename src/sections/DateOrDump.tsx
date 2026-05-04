import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Heart,
  Hourglass,
  Loader2,
  Music,
  RotateCcw,
  Share2,
  Sparkles,
  Star,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { useDirector } from '../context/DirectorContext';
import {
  applyDuelToLooks,
  buildDateOrDumpDeck,
  completeDateOrDumpSession,
  createDateOrDumpSession,
  fetchDateOrDumpGameData,
  GAME_SCENARIOS,
  generateDateOrDumpResult,
  getDateOrDumpAnonymousPlayerId,
  recordDateOrDumpDuel,
  type DateOrDumpAnswer,
  type DateOrDumpDuel,
  type DateOrDumpGameLook,
  type DateOrDumpModel,
  type DateOrDumpResult,
  type DateOrDumpSide,
} from '../lib/dateOrDump';

const MAX_DUELS = 10;
const REVEAL_DELAY_MS = 720;
const ROUND_TIME_SECONDS = 10;

type Phase = 'loading' | 'landing' | 'playing' | 'result';

export function DateOrDump() {
  const anonymousPlayerId = useMemo(() => getDateOrDumpAnonymousPlayerId(), []);
  const [phase, setPhase] = useState<Phase>('loading');
  const [looks, setLooks] = useState<DateOrDumpGameLook[]>([]);
  const [models, setModels] = useState<DateOrDumpModel[]>([]);
  const [deck, setDeck] = useState<DateOrDumpDuel[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<DateOrDumpAnswer[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedSide, setSelectedSide] = useState<DateOrDumpSide | null>(null);
  const [result, setResult] = useState<DateOrDumpResult | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [brokenLookIds, setBrokenLookIds] = useState<Set<string>>(() => new Set());
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME_SECONDS);
  const [timedOutCount, setTimedOutCount] = useState(0);
  const [timedOutRoundId, setTimedOutRoundId] = useState<string | null>(null);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const startedAtRef = useRef(Date.now());
  const answerLockRef = useRef(false);
  const audioRef = useRef<ReturnType<typeof createDateOrDumpAudio> | null>(null);
  const lastTickRef = useRef(ROUND_TIME_SECONDS);
  const playSoundRef = useRef<(sound: DateOrDumpSound) => void>(() => undefined);
  const handleTimeoutRef = useRef<() => void>(() => undefined);
  const { push } = useDirector();

  const getAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = createDateOrDumpAudio();
    return audioRef.current;
  }, []);

  const playSound = useCallback((sound: DateOrDumpSound) => {
    if (!soundEnabled) return;
    getAudio().play(sound);
  }, [getAudio, soundEnabled]);

  useEffect(() => {
    playSoundRef.current = playSound;
  }, [playSound]);

  const loadData = useCallback(async () => {
    setPhase('loading');
    setLoadError(null);
    try {
      const data = await fetchDateOrDumpGameData();
      setLooks(data.looks);
      setModels(data.models);
      setBrokenLookIds(new Set());
      setPhase('landing');
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Could not load Date or Dump.';
      setLoadError(message);
      setPhase('landing');
      push('Date or Dump', message);
    }
  }, [push]);

  useEffect(() => { loadData(); }, [loadData]);

  const playableLooks = useMemo(
    () => looks.filter((look) => !brokenLookIds.has(look.id)),
    [brokenLookIds, looks],
  );

  const playableModels = useMemo(() => {
    const counts = new Map<string, number>();
    playableLooks.forEach((look) => counts.set(look.model_id, (counts.get(look.model_id) ?? 0) + 1));
    return models
      .map((model) => ({ ...model, runway_count: counts.get(model.id) ?? 0 }))
      .filter((model) => model.runway_count >= 2);
  }, [models, playableLooks]);

  const leaderboard = useMemo(
    () => playableLooks
      .filter((look) => look.date_count + look.dump_count > 0)
      .slice()
      .sort((a, b) => (
        b.style_quotient_score - a.style_quotient_score
        || (b.date_count + b.dump_count) - (a.date_count + a.dump_count)
      ))
      .slice(0, 5),
    [playableLooks],
  );

  const current = deck[index];
  const progress = deck.length > 0 ? Math.round(((index + 1) / deck.length) * 100) : 0;

  const markLookImageBroken = useCallback((lookId: string) => {
    setBrokenLookIds((currentIds) => {
      if (currentIds.has(lookId)) return currentIds;
      const next = new Set(currentIds);
      next.add(lookId);
      return next;
    });
  }, []);

  const startGame = async () => {
    if (starting) return;
    void getAudio().resume();
    playSound('start');
    const nextDeck = buildDateOrDumpDeck(playableLooks, playableModels, MAX_DUELS);
    if (nextDeck.length === 0) {
      push('Date or Dump', 'Need at least one model with two DFB-approved Runway looks.');
      return;
    }

    setStarting(true);
    try {
      const nextSessionId = await createDateOrDumpSession({
        anonymousPlayerId,
        totalDuels: nextDeck.length,
      });
      setSessionId(nextSessionId);
      setDeck(nextDeck);
      setIndex(0);
      setAnswers([]);
      setTimedOutCount(0);
      setTimedOutRoundId(null);
      setResult(null);
      setSelectedSide(null);
      setTimeLeft(ROUND_TIME_SECONDS);
      startedAtRef.current = Date.now();
      answerLockRef.current = false;
      setPhase('playing');
    } catch (error) {
      console.error(error);
      push('Date or Dump', error instanceof Error ? error.message : 'Could not start the game.');
    } finally {
      setStarting(false);
    }
  };

  const finishGame = useCallback(async (finalAnswers: DateOrDumpAnswer[], finalTimedOutCount: number) => {
    setPhase('result');
    setResultLoading(true);
    playSound('result');
    try {
      const generated = await generateDateOrDumpResult(finalAnswers, finalTimedOutCount);
      setResult(generated);
      if (sessionId) {
        await completeDateOrDumpSession({
          sessionId,
          completedDuels: finalAnswers.length,
          result: generated,
        });
      }
    } catch (error) {
      console.error(error);
      push('Date or Dump', error instanceof Error ? error.message : 'Could not save the result.');
    } finally {
      setResultLoading(false);
    }
  }, [playSound, push, sessionId]);

  const moveToNextRound = useCallback((
    nextAnswers: DateOrDumpAnswer[],
    nextTimedOutCount: number,
  ) => {
    window.setTimeout(() => {
      if (index >= deck.length - 1) {
        void finishGame(nextAnswers, nextTimedOutCount);
      } else {
        setIndex((currentIndex) => currentIndex + 1);
        setSelectedSide(null);
        setTimedOutRoundId(null);
        setTimeLeft(ROUND_TIME_SECONDS);
        answerLockRef.current = false;
        startedAtRef.current = Date.now();
      }
    }, REVEAL_DELAY_MS);
  }, [deck.length, finishGame, index]);

  const handleTimeout = useCallback(() => {
    if (!current || selectedSide || timedOutRoundId === current.client_id || answerLockRef.current) return;
    answerLockRef.current = true;
    const nextTimedOutCount = timedOutCount + 1;
    setTimedOutCount(nextTimedOutCount);
    setTimedOutRoundId(current.client_id);
    setTimeLeft(0);
    playSound('timeout');
    moveToNextRound(answers, nextTimedOutCount);
  }, [answers, current, moveToNextRound, playSound, selectedSide, timedOutCount, timedOutRoundId]);

  useEffect(() => {
    handleTimeoutRef.current = handleTimeout;
  }, [handleTimeout]);

  const chooseSide = useCallback((side: DateOrDumpSide) => {
    if (!current || !sessionId || selectedSide || answerLockRef.current) return;
    answerLockRef.current = true;
    void getAudio().resume();
    playSound('tap');
    const responseMs = Date.now() - startedAtRef.current;
    const winner = side === 'left' ? current.left : current.right;
    const loser = side === 'left' ? current.right : current.left;
    const answer: DateOrDumpAnswer = {
      duel: current,
      winnerSide: side,
      winner,
      loser,
      responseMs,
    };
    const nextAnswers = [...answers, answer];

    setSelectedSide(side);
    setAnswers(nextAnswers);
    setLooks((currentLooks) => applyDuelToLooks(currentLooks, winner.id, loser.id));
    playSound('pick');

    void recordDateOrDumpDuel({
      sessionId,
      anonymousPlayerId,
      duel: current,
      winnerSide: side,
      responseMs,
    }).catch((error) => {
      console.error(error);
      push('Date or Dump', error instanceof Error ? error.message : 'Could not save that duel.');
    });

    moveToNextRound(nextAnswers, timedOutCount);
  }, [
    anonymousPlayerId,
    answers,
    current,
    getAudio,
    moveToNextRound,
    playSound,
    push,
    selectedSide,
    sessionId,
    timedOutCount,
  ]);

  useEffect(() => {
    if (phase !== 'playing' || !current || selectedSide || timedOutRoundId === current.client_id) return undefined;
    setTimeLeft(ROUND_TIME_SECONDS);
    lastTickRef.current = ROUND_TIME_SECONDS;
    const roundStartedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - roundStartedAt) / 1000);
      const nextTimeLeft = Math.max(0, ROUND_TIME_SECONDS - elapsedSeconds);
      setTimeLeft(nextTimeLeft);
      if (nextTimeLeft > 0 && nextTimeLeft <= 3 && nextTimeLeft !== lastTickRef.current) {
        playSoundRef.current('tick');
      }
      lastTickRef.current = nextTimeLeft;
      if (nextTimeLeft <= 0) {
        window.clearInterval(interval);
        handleTimeoutRef.current();
      }
    }, 200);

    return () => window.clearInterval(interval);
  }, [current, phase, selectedSide, timedOutRoundId]);

  const playAgain = () => {
    setPhase('landing');
    setDeck([]);
    setIndex(0);
    setAnswers([]);
    setTimedOutCount(0);
    setTimedOutRoundId(null);
    setResult(null);
    setSelectedSide(null);
    setTimeLeft(ROUND_TIME_SECONDS);
    answerLockRef.current = false;
  };

  const toggleMusic = () => {
    const audio = getAudio();
    void audio.resume();
    setMusicEnabled((enabled) => {
      const next = !enabled;
      if (next) audio.startMusic();
      else audio.stopMusic();
      return next;
    });
  };

  const toggleSound = () => {
    setSoundEnabled((enabled) => !enabled);
  };

  useEffect(() => () => {
    audioRef.current?.stopMusic();
  }, []);

  const shareResult = async () => {
    if (!result) return;
    const text = `My Date or Dump type: ${result.archetype || result.title}. ${result.summary} #DateOrDump #DFB`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Date or Dump', text });
      } else {
        await navigator.clipboard.writeText(text);
        push('Date or Dump', 'Result copied.');
      }
    } catch {
      await navigator.clipboard.writeText(text);
      push('Date or Dump', 'Result copied.');
    }
  };

  return (
    <div className="min-h-[100dvh] overflow-hidden bg-black text-white">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_12%,rgba(255,0,128,0.42),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(57,255,20,0.24),transparent_25%),linear-gradient(145deg,#050006_0%,#111_42%,#250018_100%)]" />
      <div className="fixed inset-0 pointer-events-none opacity-35 bg-[linear-gradient(90deg,rgba(57,255,20,0.16)_1px,transparent_1px),linear-gradient(180deg,rgba(255,0,128,0.14)_1px,transparent_1px)] bg-[size:34px_34px]" />
      <div className="fixed inset-x-0 bottom-0 pointer-events-none h-44 bg-[linear-gradient(0deg,rgba(57,255,20,0.2),transparent)]" />
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col px-4 py-4 sm:py-6">
        {phase === 'loading' && <LoadingScreen />}
        {phase === 'landing' && (
          <LandingScreen
            loadError={loadError}
            models={playableModels}
            looks={playableLooks}
            onStart={startGame}
            onRetry={loadData}
            starting={starting}
            musicEnabled={musicEnabled}
            soundEnabled={soundEnabled}
            onToggleMusic={toggleMusic}
            onToggleSound={toggleSound}
          />
        )}
        {phase === 'playing' && current && (
          <PlayingScreen
            duel={current}
            currentRound={index + 1}
            totalRounds={deck.length}
            progress={progress}
            selectedSide={selectedSide}
            timedOut={timedOutRoundId === current.client_id}
            timeLeft={timeLeft}
            musicEnabled={musicEnabled}
            soundEnabled={soundEnabled}
            onChoose={chooseSide}
            onBrokenLook={markLookImageBroken}
            onToggleMusic={toggleMusic}
            onToggleSound={toggleSound}
          />
        )}
        {phase === 'result' && (
          <ResultScreen
            result={result}
            loading={resultLoading}
            answers={answers}
            leaderboard={leaderboard}
            onPlayAgain={playAgain}
            onShare={shareResult}
            onBrokenLook={markLookImageBroken}
            timedOutCount={timedOutCount}
            musicEnabled={musicEnabled}
            soundEnabled={soundEnabled}
            onToggleMusic={toggleMusic}
            onToggleSound={toggleSound}
          />
        )}
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="grid flex-1 place-items-center text-center">
      <div>
        <Loader2 className="mx-auto mb-4 h-11 w-11 animate-spin text-[#80ffdb]" />
        <div className="font-display text-4xl">Loading looks</div>
        <p className="mt-2 text-sm text-white/70">Finding same-model fashion duels.</p>
      </div>
    </div>
  );
}

function LandingScreen({
  loadError,
  models,
  looks,
  starting,
  onStart,
  onRetry,
  musicEnabled,
  soundEnabled,
  onToggleMusic,
  onToggleSound,
}: {
  loadError: string | null;
  models: DateOrDumpModel[];
  looks: DateOrDumpGameLook[];
  starting: boolean;
  onStart: () => void;
  onRetry: () => void;
  musicEnabled: boolean;
  soundEnabled: boolean;
  onToggleMusic: () => void;
  onToggleSound: () => void;
}) {
  const teaserScenarios = useMemo(() => GAME_SCENARIOS.slice(0, 5), []);

  return (
    <div className="flex flex-1 flex-col">
      <TopBrand />
      <AudioControls
        musicEnabled={musicEnabled}
        soundEnabled={soundEnabled}
        onToggleMusic={onToggleMusic}
        onToggleSound={onToggleSound}
      />

      <main className="flex flex-1 flex-col justify-center py-7">
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 140, damping: 18 }}
          className="rounded-[2rem] border border-[#39ff14]/35 bg-black/60 p-5 shadow-[0_0_55px_rgba(255,0,128,0.22),inset_0_0_30px_rgba(57,255,20,0.05)] backdrop-blur-2xl"
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-[#ff0080] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-white shadow-[0_0_24px_rgba(255,0,128,0.7)]">
            <Sparkles className="h-3.5 w-3.5" /> 10 Duels
          </div>
          <h1 className="mt-4 font-display text-6xl leading-[0.9] tracking-normal">
            Date
            <span className="block text-[#39ff14] drop-shadow-[0_0_18px_rgba(57,255,20,0.55)]">or Dump</span>
          </h1>
          <p className="mt-4 text-base font-medium text-white/82">
            Two looks. Same man. Ten seconds. Pick the fit with better fashion chemistry before the timer blasts.
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <CandyStat label="Men" value={`${models.length}`} />
            <CandyStat label="Looks" value={`${looks.length}`} />
            <CandyStat label="Timer" value="10s" />
          </div>

          {loadError ? (
            <div className="mt-5 rounded-2xl border border-[#ff0080]/50 bg-[#ff0080]/15 p-4 text-sm text-pink-50">
              <div className="font-bold">Setup needed</div>
              <div className="mt-1 text-pink-50/80">{loadError}</div>
              <button
                onClick={onRetry}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#39ff14] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-black"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Retry
              </button>
            </div>
          ) : models.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-[#39ff14]/25 bg-black/35 p-4 text-sm text-white/75">
              Approve at least two Runway images for DFB for the same model, then this game can build a fair duel.
            </div>
          ) : (
            <button
              onClick={onStart}
              disabled={starting}
              className="mt-6 flex h-16 w-full items-center justify-center gap-3 rounded-[1.4rem] bg-[#39ff14] text-lg font-black uppercase tracking-[0.12em] text-black shadow-[0_12px_0_#129c00,0_0_38px_rgba(57,255,20,0.45)] transition active:translate-y-1 active:shadow-[0_7px_0_#129c00,0_0_22px_rgba(57,255,20,0.35)] disabled:opacity-60"
            >
              {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5 fill-current" />}
              Start Game
            </button>
          )}
        </motion.div>

        <div className="mt-5 rounded-[1.5rem] border border-[#ff0080]/35 bg-black/45 p-4 shadow-[0_0_35px_rgba(255,0,128,0.16)] backdrop-blur-xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#39ff14]">
            <Hourglass className="h-4 w-4" /> Situation bank
          </div>
          <div className="space-y-2">
            {teaserScenarios.map((scenario, index) => (
              <motion.div
                key={scenario}
                className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2 text-xs font-semibold text-white/78"
                animate={{ x: index % 2 === 0 ? [0, 3, 0] : [0, -3, 0] }}
                transition={{ duration: 3 + index * 0.35, repeat: Infinity, ease: 'easeInOut' }}
              >
                {scenario}
              </motion.div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function PlayingScreen({
  duel,
  currentRound,
  totalRounds,
  progress,
  selectedSide,
  timedOut,
  timeLeft,
  musicEnabled,
  soundEnabled,
  onChoose,
  onBrokenLook,
  onToggleMusic,
  onToggleSound,
}: {
  duel: DateOrDumpDuel;
  currentRound: number;
  totalRounds: number;
  progress: number;
  selectedSide: DateOrDumpSide | null;
  timedOut: boolean;
  timeLeft: number;
  musicEnabled: boolean;
  soundEnabled: boolean;
  onChoose: (side: DateOrDumpSide) => void;
  onBrokenLook: (lookId: string) => void;
  onToggleMusic: () => void;
  onToggleSound: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <TopBrand compact />
      <AudioControls
        musicEnabled={musicEnabled}
        soundEnabled={soundEnabled}
        onToggleMusic={onToggleMusic}
        onToggleSound={onToggleSound}
      />

      <div className="mt-2 rounded-[1.4rem] border border-[#39ff14]/25 bg-black/50 p-3 shadow-[0_0_28px_rgba(57,255,20,0.12)] backdrop-blur-xl">
        <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.18em] text-white/70">
          <span>Round {currentRound}/{totalRounds}</span>
          <span className="text-[#39ff14]">{progress}%</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {Array.from({ length: totalRounds }).map((_, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full ${i < currentRound ? 'bg-[#39ff14] shadow-[0_0_10px_rgba(57,255,20,0.75)]' : 'bg-white/18'}`}
            />
          ))}
        </div>
        <TimerBomb timeLeft={timeLeft} />
      </div>

      <motion.div
        key={duel.client_id}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 140, damping: 18 }}
        className="mt-4 text-center"
      >
        <div className="text-xs font-black uppercase tracking-[0.2em] text-[#39ff14]">{duel.model_name}</div>
        <div className="mt-1 text-sm font-semibold text-white/82">{duel.scenario}</div>
      </motion.div>

      <div className="relative mt-5 grid flex-1 grid-cols-2 gap-3 pb-4">
        <ChoiceCard
          side="left"
          look={duel.left}
          selectedSide={selectedSide}
          timedOut={timedOut}
          onChoose={onChoose}
          onBroken={() => onBrokenLook(duel.left.id)}
        />
        <ChoiceCard
          side="right"
          look={duel.right}
          selectedSide={selectedSide}
          timedOut={timedOut}
          onChoose={onChoose}
          onBroken={() => onBrokenLook(duel.right.id)}
        />

        <motion.div
          className="pointer-events-none absolute left-1/2 top-1/2 z-20 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-white bg-[#ff0080] font-display text-2xl shadow-[0_0_36px_rgba(255,0,128,0.8)]"
          animate={{ rotate: selectedSide ? 360 : [0, -8, 8, 0], scale: selectedSide ? 1.18 : 1 }}
          transition={{ duration: selectedSide ? 0.55 : 2, repeat: selectedSide ? 0 : Infinity }}
        >
          VS
        </motion.div>
        <AnimatePresence>
          {timedOut && (
            <motion.div
              className="absolute inset-0 z-30 grid place-items-center rounded-[1.6rem] bg-black/60 text-center backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="rounded-[1.5rem] border border-[#ff0080]/60 bg-black px-5 py-4 shadow-[0_0_35px_rgba(255,0,128,0.45)]">
                <div className="font-display text-4xl text-[#ff0080]">Time out</div>
                <div className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-[#39ff14]">
                  Bomb phat gaya
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="pb-2 text-center text-xs font-semibold text-white/65">
        Tap the look with better fashion chemistry
      </div>
    </div>
  );
}

function TimerBomb({ timeLeft }: { timeLeft: number }) {
  const danger = timeLeft <= 3;
  const width = `${Math.max(0, Math.min(100, (timeLeft / ROUND_TIME_SECONDS) * 100))}%`;

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/50 p-2">
      <div className="mb-2 flex items-center justify-between">
        <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] ${danger ? 'text-[#ff0080]' : 'text-[#39ff14]'}`}>
          <motion.span
            animate={danger ? { scale: [1, 1.18, 1], rotate: [-6, 6, -6] } : { scale: 1 }}
            transition={{ duration: 0.45, repeat: danger ? Infinity : 0 }}
            className="grid h-7 w-7 place-items-center rounded-full bg-black"
          >
            <Hourglass className="h-4 w-4" />
          </motion.span>
          Timer bomb
        </div>
        <div className={`font-display text-2xl leading-none ${danger ? 'text-[#ff0080]' : 'text-white'}`}>
          {timeLeft}s
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/12">
        <motion.div
          className={`h-full rounded-full ${danger ? 'bg-[#ff0080] shadow-[0_0_16px_rgba(255,0,128,0.8)]' : 'bg-[#39ff14] shadow-[0_0_16px_rgba(57,255,20,0.7)]'}`}
          animate={{ width }}
          transition={{ duration: 0.18 }}
        />
      </div>
    </div>
  );
}

function ChoiceCard({
  side,
  look,
  selectedSide,
  timedOut,
  onChoose,
  onBroken,
}: {
  side: DateOrDumpSide;
  look: DateOrDumpGameLook;
  selectedSide: DateOrDumpSide | null;
  timedOut: boolean;
  onChoose: (side: DateOrDumpSide) => void;
  onBroken: () => void;
}) {
  const selected = selectedSide === side;
  const rejected = Boolean((selectedSide && selectedSide !== side) || timedOut);

  return (
    <motion.button
      type="button"
      onClick={() => onChoose(side)}
      disabled={Boolean(selectedSide) || timedOut}
      className="relative min-h-[58dvh] overflow-hidden rounded-[1.6rem] border border-[#ff0080]/35 bg-black/55 text-left shadow-[0_0_42px_rgba(255,0,128,0.18),0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      animate={{
        scale: selected ? 1.07 : rejected ? 0.88 : 1,
        opacity: rejected ? 0.42 : 1,
        rotate: selected ? (side === 'left' ? -1.5 : 1.5) : 0,
        y: selected ? -12 : rejected ? 18 : 0,
      }}
      transition={{ type: 'spring', stiffness: 240, damping: 20 }}
      whileTap={!selectedSide ? { scale: 0.96 } : undefined}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(57,255,20,0.13),rgba(255,255,255,0)_35%,rgba(0,0,0,0.58))]" />
      <SmartFullBodyImage
        src={look.image_url}
        alt={`${look.model_name} ${side} look`}
        onBroken={onBroken}
      />
      <div className="absolute inset-x-0 bottom-0 z-10 p-3">
        <div className="rounded-2xl border border-white/10 bg-black/54 p-3 backdrop-blur-md">
          <div className="truncate text-xs font-black uppercase tracking-[0.18em] text-white/70">{side} look</div>
          <div className="mt-1 truncate text-sm font-bold">{lookTitleFromItems(look)}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-[#39ff14] shadow-[0_0_10px_rgba(57,255,20,0.8)]" style={{ width: `${look.style_quotient_score}%` }} />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              initial={{ scale: 0, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-full bg-[#39ff14] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-black shadow-[0_0_35px_rgba(57,255,20,0.62)]"
            >
              <Heart className="h-3.5 w-3.5 fill-current" />
              Picked
            </motion.div>
            <SparkleBurst />
          </>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

function ResultScreen({
  result,
  loading,
  answers,
  leaderboard,
  onPlayAgain,
  onShare,
  onBrokenLook,
  timedOutCount,
  musicEnabled,
  soundEnabled,
  onToggleMusic,
  onToggleSound,
}: {
  result: DateOrDumpResult | null;
  loading: boolean;
  answers: DateOrDumpAnswer[];
  leaderboard: DateOrDumpGameLook[];
  onPlayAgain: () => void;
  onShare: () => void;
  onBrokenLook: (lookId: string) => void;
  timedOutCount: number;
  musicEnabled: boolean;
  soundEnabled: boolean;
  onToggleMusic: () => void;
  onToggleSound: () => void;
}) {
  const avgMs = answers.length
    ? Math.round(answers.reduce((sum, answer) => sum + answer.responseMs, 0) / answers.length)
    : 0;
  const shareCard = result ? buildInstagramShareCard(result, answers, avgMs) : null;

  if (loading || !result) {
    return (
      <div className="grid flex-1 place-items-center text-center">
        <div className="rounded-[2rem] border border-white/20 bg-white/14 p-8 backdrop-blur-2xl">
          <Loader2 className="mx-auto mb-4 h-11 w-11 animate-spin text-[#80ffdb]" />
          <div className="font-display text-4xl">Reading your taste</div>
          <p className="mt-2 text-sm text-white/70">Turning your picks into a crush report.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col py-2">
      <TopBrand compact />
      <AudioControls
        musicEnabled={musicEnabled}
        soundEnabled={soundEnabled}
        onToggleMusic={onToggleMusic}
        onToggleSound={onToggleSound}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 150, damping: 18 }}
        className="mt-4 overflow-hidden rounded-[2rem] border border-white/20 bg-white/12 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl"
      >
        <InstagramResultCard
          result={result}
          answers={answers}
          avgMs={avgMs}
          shareCard={shareCard}
          timedOutCount={timedOutCount}
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={onPlayAgain}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white/16 px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-white ring-1 ring-white/20"
          >
            <RotateCcw className="h-4 w-4" /> Again
          </button>
          <button
            onClick={onShare}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#80ffdb] px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-[#24051f] shadow-[0_5px_0_#1cb995]"
          >
            <Share2 className="h-4 w-4" /> Share to Instagram
          </button>
        </div>
      </motion.div>

      <div className="mt-5 rounded-[1.5rem] border border-white/15 bg-black/20 p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#ffd166]">
          <Star className="h-4 w-4 fill-current" /> Your winning picks
        </div>
        <div className="grid grid-cols-5 gap-2">
          {answers.map((answer) => (
            <div key={answer.duel.client_id} className="overflow-hidden rounded-xl bg-white/10">
              <PreviewImage
                src={answer.winner.image_url}
                alt={answer.winner.theme}
                className="aspect-[3/4] h-full w-full bg-white object-contain"
                onBroken={() => onBrokenLook(answer.winner.id)}
              />
            </div>
          ))}
        </div>
      </div>

      {leaderboard.length > 0 && (
        <div className="mt-4 rounded-[1.5rem] border border-white/15 bg-black/20 p-4 backdrop-blur-xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#39ff14]">
            <Trophy className="h-4 w-4" /> Live leaderboard
          </div>
          <div className="space-y-2">
            {leaderboard.slice(0, 4).map((look, rank) => (
              <LeaderboardMini key={look.id} look={look} rank={rank + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TopBrand({ compact = false }: { compact?: boolean }) {
  return (
    <header className={`flex items-center justify-between ${compact ? 'py-1' : 'py-2'}`}>
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.28em] text-[#39ff14]/80">Fashion Lab Game</div>
        <div className="font-display text-2xl leading-none">Date or Dump</div>
      </div>
      <div className="grid h-9 w-9 place-items-center rounded-full border border-[#39ff14]/50 bg-black text-[#ff0080] shadow-[0_0_22px_rgba(255,0,128,0.45)]">
        <Heart className="h-4 w-4 fill-current" />
      </div>
    </header>
  );
}

function AudioControls({
  musicEnabled,
  soundEnabled,
  onToggleMusic,
  onToggleSound,
}: {
  musicEnabled: boolean;
  soundEnabled: boolean;
  onToggleMusic: () => void;
  onToggleSound: () => void;
}) {
  return (
    <div className="mt-3 flex justify-end gap-2">
      <button
        type="button"
        onClick={onToggleMusic}
        className={`grid h-9 w-9 place-items-center rounded-full border text-xs transition ${
          musicEnabled
            ? 'border-[#39ff14] bg-[#39ff14] text-black shadow-[0_0_18px_rgba(57,255,20,0.55)]'
            : 'border-white/15 bg-black/35 text-white/70'
        }`}
        title={musicEnabled ? 'Music on' : 'Music off'}
      >
        <Music className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onToggleSound}
        className={`grid h-9 w-9 place-items-center rounded-full border text-xs transition ${
          soundEnabled
            ? 'border-[#ff0080] bg-[#ff0080] text-white shadow-[0_0_18px_rgba(255,0,128,0.55)]'
            : 'border-white/15 bg-black/35 text-white/70'
        }`}
        title={soundEnabled ? 'Sound effects on' : 'Sound effects off'}
      >
        {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      </button>
    </div>
  );
}

function CandyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#39ff14]/20 bg-black/45 p-3 text-center shadow-[inset_0_0_20px_rgba(57,255,20,0.05)]">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/55">{label}</div>
      <div className="mt-1 font-display text-2xl leading-none text-[#39ff14]">{value}</div>
    </div>
  );
}

function LeaderboardMini({ look, rank }: { look: DateOrDumpGameLook; rank: number }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-2">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#39ff14] text-sm font-black text-black">
        {rank}
      </div>
      <PreviewImage
        src={look.image_url}
        alt={look.theme}
        className="h-12 w-10 shrink-0 rounded-xl object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{look.model_name}</div>
        <div className="truncate text-[11px] text-white/55">{lookTitleFromItems(look)}</div>
      </div>
      <div className="text-right font-display text-xl">{look.style_quotient_score}%</div>
    </div>
  );
}

function PreviewImage({
  src,
  alt,
  className,
  onBroken,
}: {
  src: string;
  alt: string;
  className: string;
  onBroken?: () => void;
}) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  if (!src || broken) {
    return (
      <div className={`${className} grid place-items-center bg-white/10 text-white/50`}>
        <Activity className="h-5 w-5" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => {
        setBroken(true);
        onBroken?.();
      }}
      className={className}
    />
  );
}

function SmartFullBodyImage({
  src,
  alt,
  onBroken,
}: {
  src: string;
  alt: string;
  onBroken?: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const [fitMode, setFitMode] = useState<'portrait' | 'wide'>('portrait');

  useEffect(() => {
    setBroken(false);
    setFitMode('portrait');
  }, [src]);

  if (!src || broken) {
    return (
      <div className="absolute inset-x-3 top-4 bottom-24 grid place-items-center rounded-[1.25rem] bg-white/10 text-white/50">
        <Activity className="h-5 w-5" />
      </div>
    );
  }

  return (
    <div className="absolute inset-x-3 top-4 bottom-24 overflow-hidden rounded-[1.25rem] border border-white/70 bg-[radial-gradient(circle_at_50%_12%,#ffffff_0%,#ffffff_58%,#f2eef2_100%)] shadow-[inset_0_-28px_55px_rgba(255,45,114,0.08)]">
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        loading="eager"
        decoding="async"
        onLoad={(event) => {
          const image = event.currentTarget;
          const ratio = image.naturalWidth / Math.max(image.naturalHeight, 1);
          setFitMode(ratio > 0.82 ? 'wide' : 'portrait');
        }}
        onError={() => {
          setBroken(true);
          onBroken?.();
        }}
        className={`h-full w-full ${fitMode === 'wide' ? 'object-cover' : 'object-contain p-1.5'} object-center`}
      />
      <div className="pointer-events-none absolute inset-x-5 bottom-3 h-4 rounded-full bg-[#35142f]/10 blur-sm" />
    </div>
  );
}

function InstagramResultCard({
  result,
  answers,
  avgMs,
  shareCard,
  timedOutCount,
}: {
  result: DateOrDumpResult;
  answers: DateOrDumpAnswer[];
  avgMs: number;
  shareCard: ReturnType<typeof buildInstagramShareCard> | null;
  timedOutCount: number;
}) {
  const winners = answers.slice(0, 3).map((answer) => answer.winner);
  const handle = shareCard?.handle ?? '@dfb.dateordump';
  const verdict = shareCard?.verdict ?? (result.archetype || result.title);

  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-[1.65rem] bg-black text-white shadow-[inset_0_0_0_1px_rgba(57,255,20,0.22)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(57,255,20,0.65),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(255,0,128,0.55),transparent_24%),linear-gradient(145deg,#080008_0%,#161616_48%,#280019_100%)]" />
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-[#39ff14]/20 bg-black/62 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-[linear-gradient(145deg,#ff2d72,#ffd166)] text-xs font-black text-white">
            DFB
          </div>
          <div>
            <div className="text-sm font-black leading-none text-white">{handle}</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#39ff14]">Taste drop</div>
          </div>
        </div>
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-black/35" />
          <span className="h-1.5 w-1.5 rounded-full bg-black/35" />
          <span className="h-1.5 w-1.5 rounded-full bg-black/35" />
        </div>
      </div>

      <div className="relative z-10 flex h-full flex-col px-4 pb-4 pt-16">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff2d72]">My Date or Dump type</div>
            <h1 className="mt-1 font-display text-4xl leading-[0.88] text-white drop-shadow-[0_0_18px_rgba(255,0,128,0.45)]">{verdict}</h1>
          </div>
          <MiniBobbleHead archetype={result.archetype || result.title} />
        </div>

        <p className="mt-3 rounded-2xl border border-[#39ff14]/20 bg-black/55 p-3 text-sm font-bold leading-snug text-white shadow-[0_0_26px_rgba(57,255,20,0.12)]">
          {shareCard?.caption ?? result.summary}
        </p>

        <div className="mt-3 grid flex-1 grid-cols-3 gap-2">
          {winners.map((look, index) => (
            <div key={look.id} className="relative overflow-hidden rounded-2xl border border-[#ff0080]/25 bg-white shadow-[0_0_18px_rgba(255,0,128,0.18)]">
              <PreviewImage
                src={look.image_url}
                alt={look.theme || look.model_name}
                className="h-full w-full object-contain"
              />
              <div className="absolute left-1.5 top-1.5 rounded-full bg-[#ff2d72] px-2 py-0.5 text-[10px] font-black text-white">
                #{index + 1}
              </div>
            </div>
          ))}
          {winners.length === 0 && (
            <div className="col-span-3 grid h-full place-items-center rounded-2xl bg-white/70 text-sm font-black text-black/45">
              Picks loading
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <InstaMetric label="Picked" value={`${answers.length}`} />
          <InstaMetric label="Speed" value={`${(avgMs / 1000).toFixed(1)}s`} />
          <InstaMetric label="Bombs" value={`${timedOutCount}`} />
        </div>

        <div className="mt-3 rounded-2xl bg-[#39ff14] px-3 py-2 text-center text-xs font-black uppercase tracking-[0.12em] text-black shadow-[0_0_22px_rgba(57,255,20,0.45)]">
          Final verdict: {shareCard?.slangLine ?? verdict}
        </div>
      </div>
    </div>
  );
}

function InstaMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-2 py-2 text-center shadow-sm">
      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-white/45">{label}</div>
      <div className="mt-0.5 truncate text-sm font-black text-[#39ff14]">{value}</div>
    </div>
  );
}

function MiniBobbleHead({ archetype }: { archetype: string }) {
  const spark = /spark|instant|street/i.test(archetype);
  const calm = /soft|quiet|slow/i.test(archetype);
  return (
    <motion.div
      className="relative shrink-0"
      animate={{ rotate: [-4, 4, -3, 3, -4], y: [-2, 2, -1, 1, -2] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div className="relative grid h-20 w-20 place-items-center rounded-full border-[3px] border-[#35142f] bg-[#ffd166] shadow-[0_7px_0_#35142f,0_14px_30px_rgba(0,0,0,0.22)]">
        <div className="absolute -top-2 left-5 h-6 w-10 rounded-t-full bg-[#35142f]" />
        <div className="absolute top-7 flex gap-4">
          <span className={`block h-2.5 w-2.5 rounded-full ${spark ? 'bg-[#ff2d72]' : 'bg-[#35142f]'}`} />
          <span className={`block h-2.5 w-2.5 rounded-full ${spark ? 'bg-[#ff2d72]' : 'bg-[#35142f]'}`} />
        </div>
        <div className={`absolute bottom-6 h-2.5 ${calm ? 'w-7 rounded-b-full border-b-[3px] border-[#35142f]' : 'w-6 rounded-full bg-[#35142f]'}`} />
        <div className="absolute -right-3 top-3 rotate-6 rounded-full bg-[#80ffdb] px-2 py-1 text-[9px] font-black text-[#35142f]">
          {spark ? 'Filmy' : calm ? 'Green flag' : 'Sorted'}
        </div>
      </div>
    </motion.div>
  );
}

function buildInstagramShareCard(result: DateOrDumpResult, answers: DateOrDumpAnswer[], avgMs: number) {
  const winnerCategory = mostCommon(
    answers.flatMap((answer) => answer.winner.item_snapshot.map((item) => item.category)),
    result.tags[0] ?? 'Clean fits',
  );
  const favoriteModel = mostCommon(
    answers.map((answer) => answer.winner.model_name),
    'green-flag boys',
  );
  const favoriteLook = mostCommon(
    answers.map((answer) => lookTitleFromItems(answer.winner)).filter(Boolean),
    result.tags[0] ?? 'clean-boy aura',
  );
  const vibe = avgMs < 1800 ? 'Fast' : avgMs < 3200 ? 'Sorted' : 'Slow';
  const verdict = funnyVerdict(result.title || result.archetype, winnerCategory, avgMs);

  return {
    handle: '@dfb.dateordump',
    verdict,
    vibe,
    caption: `${favoriteModel} in ${favoriteLook} got your attention. Tumhara type: ${winnerCategory.toLowerCase()} wala boy, thoda filmy, thoda sorted, aur outfit mein bilkul "main character entry".`,
    slangLine: `${verdict} energy, confirm hai.`,
  };
}

function funnyVerdict(title: string, category: string, avgMs: number) {
  if (/ktm|street|sneaker|denim|jacket/i.test(`${title} ${category}`)) return 'KTM Lover';
  if (/mumma|shirt|formal|linen|tailor/i.test(`${title} ${category}`)) return "Mumma's Boy Magnet";
  if (/rajma|slow|comfort|soft|casual/i.test(`${title} ${category}`)) return randomLabel(['Rajma Chawal Boy', 'Soft Launch Raja', 'Chai Tapri Charmer']);
  if (/majnu|spark|instant|filmy/i.test(`${title} ${category}`) || avgMs < 1700) return 'Majnu Boy Radar';
  if (/wannabe|watch|accessory|chain/i.test(`${title} ${category}`)) return 'Wannabe Boy Filter';
  if (/red|bold|party/i.test(`${title} ${category}`)) return 'Red Flag Romeo';
  if (/shaadi|kurta|festive|ethnic/i.test(`${title} ${category}`)) return 'Shaadi Ready Prince';
  return title || randomLabel(['Clean Boy Collector', 'Metro Crush', 'Green Flag Launda']);
}

function randomLabel(labels: string[]) {
  return labels[Math.floor(Math.random() * labels.length)] ?? labels[0];
}

function lookTitleFromItems(look: DateOrDumpGameLook) {
  const names = look.item_snapshot
    .map((item) => item.name?.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (names.length) return names.join(' + ');
  return look.theme || 'Runway fit';
}

function mostCommon(values: string[], fallback: string) {
  const counts = new Map<string, number>();
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return top?.[0] ?? fallback;
}

function SparkleBurst() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {Array.from({ length: 18 }).map((_, i) => {
        const angle = (i / 18) * Math.PI * 2;
        const x = Math.cos(angle) * (70 + (i % 3) * 28);
        const y = Math.sin(angle) * (70 + (i % 4) * 18);
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 h-3 w-3 rounded-full bg-[#ffd166] shadow-[0_0_18px_rgba(255,209,102,0.8)]"
            initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
            animate={{ x, y, scale: [0, 1.2, 0.2], opacity: [1, 1, 0] }}
            transition={{ duration: 0.68, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}

type DateOrDumpSound = 'start' | 'tap' | 'pick' | 'tick' | 'timeout' | 'result';

function createDateOrDumpAudio() {
  const AudioContextCtor = window.AudioContext
    || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioContextCtor();
  const master = context.createGain();
  master.gain.value = 0.16;
  master.connect(context.destination);
  let musicNodes: { oscillators: OscillatorNode[]; gain: GainNode; timer: number } | null = null;

  const resume = async () => {
    if (context.state === 'suspended') await context.resume();
  };

  const play = (sound: DateOrDumpSound) => {
    void resume();
    const now = context.currentTime;
    const patterns: Record<DateOrDumpSound, Array<[number, number, number]>> = {
      start: [[220, 0, 0.08], [440, 0.08, 0.1], [660, 0.18, 0.12]],
      tap: [[360, 0, 0.045]],
      pick: [[520, 0, 0.06], [780, 0.07, 0.08], [1040, 0.15, 0.09]],
      tick: [[880, 0, 0.045]],
      timeout: [[140, 0, 0.14], [90, 0.13, 0.24]],
      result: [[392, 0, 0.08], [523.25, 0.09, 0.1], [783.99, 0.2, 0.18]],
    };

    patterns[sound].forEach(([frequency, delay, duration]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = sound === 'timeout' ? 'sawtooth' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, now + delay);
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(sound === 'timeout' ? 0.22 : 0.18, now + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + duration + 0.03);
    });
  };

  const startMusic = () => {
    void resume();
    if (musicNodes) return;
    const gain = context.createGain();
    gain.gain.value = 0.045;
    gain.connect(master);
    const bass = context.createOscillator();
    const lead = context.createOscillator();
    bass.type = 'square';
    lead.type = 'sawtooth';
    bass.frequency.value = 55;
    lead.frequency.value = 220;
    bass.connect(gain);
    lead.connect(gain);
    bass.start();
    lead.start();
    const notes = [220, 277.18, 329.63, 440, 329.63, 277.18];
    let step = 0;
    const timer = window.setInterval(() => {
      const t = context.currentTime;
      bass.frequency.setTargetAtTime(step % 2 === 0 ? 55 : 82.41, t, 0.03);
      lead.frequency.setTargetAtTime(notes[step % notes.length], t, 0.025);
      step += 1;
    }, 220);
    musicNodes = { oscillators: [bass, lead], gain, timer };
  };

  const stopMusic = () => {
    if (!musicNodes) return;
    const nodes = musicNodes;
    musicNodes = null;
    window.clearInterval(nodes.timer);
    const t = context.currentTime;
    nodes.gain.gain.setTargetAtTime(0.0001, t, 0.04);
    window.setTimeout(() => {
      nodes.oscillators.forEach((oscillator) => oscillator.stop());
      nodes.gain.disconnect();
    }, 160);
  };

  return { play, resume, startMusic, stopMusic };
}
