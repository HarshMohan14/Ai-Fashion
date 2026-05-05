import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ChevronLeft,
  Gem,
  Heart,
  Loader2,
  Plus,
  Zap,
} from 'lucide-react';
import { useDirector } from '../context/DirectorContext';
import {
  applyDuelToLooks,
  buildDateOrDumpDeck,
  completeDateOrDumpSession,
  createDateOrDumpSession,
  fetchDateOrDumpGameData,
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
const REVEAL_DELAY_MS = 900;
const ROUND_TIME_SECONDS = 10;

type Phase = 'loading' | 'landing' | 'playing' | 'result';
type DateOrDumpResultCardId = 'papa' | 'gym' | 'soft';

type DateOrDumpResultCardConfig = {
  id: DateOrDumpResultCardId;
  src: string;
  alt: string;
};

const DATE_OR_DUMP_RESULT_CARD_LIST: DateOrDumpResultCardConfig[] = [
  { id: 'papa', src: '/date-or-dump/papa-ki-pari-picker.png', alt: 'Papa Ki Pari Picker result card' },
  { id: 'gym', src: '/date-or-dump/gym-bro-survivor.png', alt: 'Gym Bro Survivor result card' },
  { id: 'soft', src: '/date-or-dump/soft-boy-magnet.png', alt: 'Soft Boy Magnet result card' },
];

const DATE_OR_DUMP_RESULT_CARDS = DATE_OR_DUMP_RESULT_CARD_LIST.reduce(
  (cards, card) => ({ ...cards, [card.id]: card }),
  {} as Record<DateOrDumpResultCardId, DateOrDumpResultCardConfig>,
);

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
  const [roseSide, setRoseSide] = useState<DateOrDumpSide | null>(null);
  const [result, setResult] = useState<DateOrDumpResult | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [brokenLookIds, setBrokenLookIds] = useState<Set<string>>(() => new Set());
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME_SECONDS);
  const [timedOutCount, setTimedOutCount] = useState(0);
  const [timedOutRoundId, setTimedOutRoundId] = useState<string | null>(null);

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
    getAudio().play(sound);
  }, [getAudio]);

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

  const current = deck[index];

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
      setRoseSide(null);
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
        setRoseSide(null);
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

  const chooseSide = useCallback((side: DateOrDumpSide, roseOverride?: DateOrDumpSide | null) => {
    if (!current || !sessionId || selectedSide || answerLockRef.current) return;
    answerLockRef.current = true;
    void getAudio().resume();
    playSound('tap');
    const selectedRoseSide = roseOverride === undefined ? roseSide : roseOverride;
    const responseMs = Date.now() - startedAtRef.current;
    const winner = side === 'left' ? current.left : current.right;
    const loser = side === 'left' ? current.right : current.left;
    const answer: DateOrDumpAnswer = {
      duel: current,
      winnerSide: side,
      winner,
      loser,
      responseMs,
      roseSide: selectedRoseSide,
      roseLook: selectedRoseSide === 'left' ? current.left : selectedRoseSide === 'right' ? current.right : null,
    };
    const nextAnswers = [...answers, answer];

    setSelectedSide(side);
    setAnswers(nextAnswers);
    if (selectedRoseSide) {
      setRoseSide(selectedRoseSide);
      recordRosePreferenceLocal(anonymousPlayerId, current, selectedRoseSide);
    }
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
    roseSide,
    selectedSide,
    sessionId,
    timedOutCount,
  ]);

  const chooseRose = useCallback((side: DateOrDumpSide) => {
    if (!current || selectedSide || timedOutRoundId === current.client_id || answerLockRef.current) return;
    setRoseSide(side);
    chooseSide(side, side);
  }, [chooseSide, current, selectedSide, timedOutRoundId]);

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
    setRoseSide(null);
    setTimeLeft(ROUND_TIME_SECONDS);
    answerLockRef.current = false;
  };

  useEffect(() => () => {
    audioRef.current?.close();
  }, []);

  const shareResult = async () => {
    if (!result) return;
    const card = DATE_OR_DUMP_RESULT_CARDS[pickDateOrDumpResultCard(result, answers)];
    const text = buildDateOrDumpShareCaption(result, answers);
    try {
      const file = await posterImageFile(card);
      await navigator.clipboard.writeText(text).catch(() => undefined);
      const gameUrl = `${window.location.origin}/game`;
      if (file && navigator.canShare?.({ files: [file], text, url: gameUrl })) {
        await navigator.share({
          title: 'Date or Dump',
          text,
          url: gameUrl,
          files: [file],
        });
      } else if (navigator.share) {
        await navigator.share({
          title: 'Date or Dump',
          text,
          url: gameUrl,
        });
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      }
    } catch {
      await navigator.clipboard.writeText(text);
      push('Date or Dump', 'Caption copied. Long-press the card to save/share it.');
    }
  };

  return (
    <div className="min-h-[100dvh] overflow-hidden bg-[#050005] text-white">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_18%,rgba(255,20,147,0.25),transparent_35%),radial-gradient(circle_at_50%_85%,rgba(255,20,147,0.18),transparent_45%),#050005]" />
      <div className="fixed inset-0 pointer-events-none opacity-[0.07] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.9)_1px,transparent_0)] bg-[size:18px_18px]" />
      <motion.div
        className="pointer-events-none fixed -left-1/2 top-0 h-full w-2/3 rotate-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)] blur-2xl"
        animate={{ x: ['-12%', '280%'], opacity: [0, 0.58, 0] }}
        transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-[#050005] px-5 py-5">
        {phase === 'loading' && <LoadingScreen />}
        {phase === 'landing' && (
          <LandingScreen
            loadError={loadError}
            onStart={startGame}
            onRetry={loadData}
            starting={starting}
          />
        )}
        {phase === 'playing' && current && (
          <PlayingScreen
            duel={current}
            currentRound={index + 1}
            totalRounds={deck.length}
            selectedSide={selectedSide}
            roseSide={roseSide}
            timedOut={timedOutRoundId === current.client_id}
            timeLeft={timeLeft}
            onChoose={chooseSide}
            onRose={chooseRose}
            onSkip={handleTimeout}
            onBack={playAgain}
            onBrokenLook={markLookImageBroken}
          />
        )}
        {phase === 'result' && (
          <ResultScreen
            result={result}
            loading={resultLoading}
            answers={answers}
            onPlayAgain={playAgain}
            onShare={shareResult}
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
        <Loader2 className="mx-auto mb-4 h-11 w-11 animate-spin text-[#ff1493]" />
        <div className="mx-auto max-w-xs text-2xl font-black leading-tight text-white">
          Wait babe, we&apos;re finding your type...
        </div>
      </div>
    </div>
  );
}

function LandingScreen({
  loadError,
  starting,
  onStart,
  onRetry,
}: {
  loadError: string | null;
  starting: boolean;
  onStart: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="-mx-5 -my-5 relative flex min-h-[100dvh] flex-1 items-center justify-center overflow-hidden bg-black">
      <div className="relative aspect-[941/1672] w-full max-w-[430px]">
        <motion.img
          src="/date-or-dump/home-date-or-dump.png"
          alt="Date or Dump home screen"
          className="absolute inset-0 h-full w-full object-contain"
          initial={{ opacity: 0, scale: 1.015 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.36, ease: 'easeOut' }}
        />
        <motion.button
          type="button"
          onClick={loadError ? onRetry : onStart}
          disabled={starting}
          aria-label={loadError ? 'Retry Date or Dump' : 'Show me the boys'}
          className="absolute bottom-[7.2%] left-[15%] right-[15%] flex h-[7.3%] items-center gap-2 rounded-full bg-[#ffd600] px-5 pr-3 text-[clamp(0.92rem,3.5vw,1.08rem)] font-black text-black shadow-[0_0_34px_rgba(255,20,147,0.45),0_9px_0_#c9a600] focus:outline-none focus:ring-4 focus:ring-[#ffd600]/70 disabled:cursor-wait"
          whileTap={{ scale: 0.97, y: 3 }}
        >
          <span className="min-w-0 flex-1 whitespace-nowrap text-center leading-none">
            Show me the boys
          </span>
          <span className="grid aspect-square h-[70%] shrink-0 place-items-center rounded-full bg-black text-white">
            <ChevronLeft className="h-[45%] w-[45%] rotate-180" />
          </span>
        </motion.button>
        {starting && (
          <div className="absolute bottom-[7.2%] left-[15%] right-[15%] grid h-[7.3%] place-items-center rounded-full bg-black/35">
            <Loader2 className="h-7 w-7 animate-spin text-white" />
          </div>
        )}
        {loadError && (
          <div className="absolute left-[9%] right-[9%] top-[8%] rounded-2xl border border-[#ff1493]/70 bg-black/80 px-3 py-2 text-center text-xs font-bold leading-snug text-white shadow-[0_0_20px_rgba(255,20,147,0.35)]">
            {loadError}
          </div>
        )}
      </div>
    </div>
  );
}

function PlayingScreen({
  duel,
  currentRound,
  totalRounds,
  selectedSide,
  roseSide,
  timedOut,
  timeLeft,
  onChoose,
  onRose,
  onSkip,
  onBack,
  onBrokenLook,
}: {
  duel: DateOrDumpDuel;
  currentRound: number;
  totalRounds: number;
  selectedSide: DateOrDumpSide | null;
  roseSide: DateOrDumpSide | null;
  timedOut: boolean;
  timeLeft: number;
  onChoose: (side: DateOrDumpSide) => void;
  onRose: (side: DateOrDumpSide) => void;
  onSkip: () => void;
  onBack: () => void;
  onBrokenLook: (lookId: string) => void;
}) {
  return (
    <div className="relative flex flex-1 flex-col gap-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.25rem,env(safe-area-inset-top))]">
      <GameTopBar onBack={onBack} />
      <header className="relative text-center">
        <div className="pointer-events-none absolute left-10 top-5 text-[#ff1493] drop-shadow-[0_0_14px_rgba(255,20,147,0.9)]">
          <Gem className="h-4 w-4 fill-current" />
        </div>
        <div className="pointer-events-none absolute right-9 top-2 text-[#ff1493] drop-shadow-[0_0_14px_rgba(255,20,147,0.9)]">
          <Gem className="h-5 w-5 fill-current" />
        </div>
        <h1 className="dfb-condensed text-[clamp(4.1rem,15.3vw,5.4rem)] uppercase italic leading-[0.76] tracking-[-0.045em]">
          <span className="text-white">Fit </span>
          <span className="text-[#ff1493]">Duel</span>
        </h1>
        <div className="dfb-condensed -mt-1 flex items-center justify-center gap-2.5 text-[1.3rem] uppercase tracking-wide text-white/90">
          <span className="h-0.5 w-12 bg-[#ff1493]" />
          Round <span className="text-[#ff1493]">{currentRound}</span> of {totalRounds}
          <span className="h-0.5 w-12 bg-[#ff1493]" />
        </div>
      </header>

      <ScenarioBox scenario={duel.scenario} timeLeft={timeLeft} />

      <div className="relative grid min-h-[360px] flex-1 grid-cols-2 gap-5">
        <ChoiceCard
          side="left"
          look={duel.left}
          selectedSide={selectedSide}
          roseSide={roseSide}
          timedOut={timedOut}
          onChoose={onChoose}
          onRose={onRose}
          onBroken={() => onBrokenLook(duel.left.id)}
        />
        <ChoiceCard
          side="right"
          look={duel.right}
          selectedSide={selectedSide}
          roseSide={roseSide}
          timedOut={timedOut}
          onChoose={onChoose}
          onRose={onRose}
          onBroken={() => onBrokenLook(duel.right.id)}
        />
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#ff1493] bg-black text-center shadow-[0_0_20px_rgba(255,20,147,0.72)]">
          <span className="flex h-full w-full items-center justify-center text-[1.12rem] font-black italic leading-none tracking-[-0.03em] text-white">
            VS
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="dfb-condensed rounded-full border-2 border-[#ffd600] px-10 py-2 text-2xl uppercase italic tracking-wide text-[#ffd600]">
          Choose Your Fit
        </div>
        <button
          type="button"
          onClick={onSkip}
          disabled={Boolean(selectedSide) || timedOut}
          className="dfb-condensed text-xl uppercase text-white/60 underline decoration-white/35 underline-offset-4 transition hover:text-white disabled:opacity-40"
        >
          Skip This Round
        </button>
        <ProgressBars currentRound={currentRound} totalRounds={totalRounds} />
      </div>

      <AnimatePresence>
        {timedOut && (
          <motion.div
            className="pointer-events-none absolute inset-0 z-[70] grid place-items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="whitespace-nowrap rounded-full border-2 border-white bg-[#ff1493] px-6 py-3 text-2xl font-black uppercase text-black shadow-[0_0_34px_rgba(255,20,147,0.9),0_10px_0_rgba(0,0,0,0.58)]"
              initial={{ scale: 0.72, rotate: -4 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 320, damping: 18 }}
            >
              Overthinking Alert!
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ResultScreen({
  result,
  loading,
  answers,
  onPlayAgain,
  onShare,
}: {
  result: DateOrDumpResult | null;
  loading: boolean;
  answers: DateOrDumpAnswer[];
  onPlayAgain: () => void;
  onShare: () => void;
}) {
  if (loading || !result) {
    return (
      <div className="grid flex-1 place-items-center text-center">
        <div>
          <Loader2 className="mx-auto mb-4 h-11 w-11 animate-spin text-[#ff1493]" />
          <div className="mx-auto max-w-xs text-2xl font-black leading-tight text-white">
            Wait babe, we&apos;re finding your type...
          </div>
        </div>
      </div>
    );
  }

  const card = DATE_OR_DUMP_RESULT_CARDS[pickDateOrDumpResultCard(result, answers)];

  return (
    <div className="-mx-5 -my-5 relative flex min-h-[100dvh] flex-1 items-center justify-center overflow-hidden bg-black">
      <div className="relative aspect-[941/1672] w-full max-w-[430px]">
        <motion.img
          src={card.src}
          alt={card.alt}
          className="absolute inset-0 h-full w-full object-contain"
          initial={{ opacity: 0, scale: 1.015 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.42, ease: 'easeOut' }}
        />
        <motion.div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.22)_44%,transparent_58%)]"
          initial={{ x: '-130%' }}
          animate={{ x: '130%' }}
          transition={{ duration: 0.85, delay: 0.18, ease: 'easeInOut' }}
        />
        <button
          type="button"
          onClick={onShare}
          aria-label="Share Date or Dump result"
          className="absolute bottom-[8.8%] left-[13.5%] right-[13.5%] h-[6.8%] rounded-full focus:outline-none focus:ring-4 focus:ring-[#ffd600]/70"
        />
        <button
          type="button"
          onClick={onPlayAgain}
          className="absolute bottom-[4.1%] left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-5 py-1.5 text-sm font-black text-white/85 shadow-[0_0_18px_rgba(255,20,147,0.35)] backdrop-blur transition hover:text-white"
        >
          Play Again
        </button>
      </div>
    </div>
  );
}

function GameTopBar({ onBack }: { onBack: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to game home"
          className="grid h-11 w-11 place-items-center rounded-full border border-[#ff1493] bg-black text-white shadow-[0_0_18px_rgba(255,20,147,0.4)]"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="dfb-condensed text-5xl uppercase italic leading-none tracking-[-0.04em] text-[#ff1493]">
          DFB
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex h-7 items-center gap-1 rounded-full border border-[#ff1493] bg-black px-2.5 text-[11px] font-black text-white shadow-[0_0_12px_rgba(255,20,147,0.3)]">
          <Gem className="h-3.5 w-3.5 fill-[#ff1493] text-[#ff1493]" />
          2,450
          <span className="ml-0.5 grid h-4 w-4 place-items-center rounded-full border border-[#ff1493]">
            <Plus className="h-2.5 w-2.5" />
          </span>
        </div>
        <div className="flex h-7 items-center gap-1 rounded-full bg-[#ffd600] px-2.5 text-[10px] font-black uppercase text-black shadow-[0_0_14px_rgba(255,214,0,0.24)]">
          <Zap className="h-3.5 w-3.5 fill-current" />
          5 Day Streak
        </div>
      </div>
    </header>
  );
}

function ScenarioBox({ scenario, timeLeft }: { scenario: string; timeLeft: number }) {
  const urgent = timeLeft <= 3;
  return (
    <section className="relative rounded-[24px] border-2 border-[#ff1493] bg-black/90 px-4 pb-5 pt-5 text-center shadow-[0_0_24px_rgba(255,20,147,0.42)]">
      <div className="mb-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#ff1493]">
        Scenario
      </div>
      <p className="text-[clamp(0.98rem,3.7vw,1.24rem)] font-semibold leading-snug text-white">
        {scenario}
      </p>
      <motion.div
        className="absolute -right-2.5 -top-7 z-10 grid h-[5.5rem] w-[5.5rem] place-items-center"
        animate={urgent ? { scale: [1, 1.08, 1], rotate: [-3, 3, -3] } : { scale: [1, 1.02, 1] }}
        transition={{ duration: urgent ? 0.45 : 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Heart className="absolute inset-0 h-full w-full fill-black text-[#ff1493] drop-shadow-[0_0_24px_rgba(255,20,147,0.78)]" strokeWidth={2.2} />
        <div className="relative z-10 text-center">
          <div className="dfb-condensed text-[1.7rem] italic leading-none text-white">{timeLeft}s</div>
          <div className="dfb-condensed text-[0.82rem] uppercase italic leading-none text-[#ff1493]">Left</div>
        </div>
      </motion.div>
    </section>
  );
}

function ChoiceCard({
  side,
  look,
  selectedSide,
  roseSide,
  timedOut,
  onChoose,
  onRose,
  onBroken,
}: {
  side: DateOrDumpSide;
  look: DateOrDumpGameLook;
  selectedSide: DateOrDumpSide | null;
  roseSide: DateOrDumpSide | null;
  timedOut: boolean;
  onChoose: (side: DateOrDumpSide) => void;
  onRose: (side: DateOrDumpSide) => void;
  onBroken: () => void;
}) {
  const picked = selectedSide === side;
  const rejected = selectedSide !== null && selectedSide !== side;
  const rosePicked = roseSide === side;
  const sideClass = side === 'left'
    ? 'border-[#ff1493] shadow-[0_0_24px_rgba(255,20,147,0.45)]'
    : 'border-[#8a2cff] shadow-[0_0_24px_rgba(138,44,255,0.45)]';
  const roseClass = side === 'left'
    ? 'border-[#ff1493] bg-black/88 shadow-[0_0_22px_rgba(255,20,147,0.55)]'
    : 'border-[#8a2cff] bg-black/88 shadow-[0_0_22px_rgba(138,44,255,0.55)]';

  const chooseFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (selectedSide || timedOut) return;
    onChoose(side);
  };

  return (
    <motion.div
      role="button"
      tabIndex={selectedSide !== null || timedOut ? -1 : 0}
      aria-disabled={selectedSide !== null || timedOut}
      onClick={() => {
        if (selectedSide || timedOut) return;
        onChoose(side);
      }}
      onKeyDown={chooseFromKeyboard}
      className={`relative min-h-[360px] overflow-hidden rounded-[30px] border-[3px] bg-[#f7f2f5] transition-[filter] duration-500 ${sideClass} ${rejected || timedOut ? 'grayscale' : ''}`}
      whileTap={{ scale: 0.97 }}
      animate={{
        scale: picked ? 1.045 : rejected || timedOut ? 0.96 : 1,
        opacity: rejected || timedOut ? 0.56 : 1,
        y: picked ? -8 : 0,
      }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      <SmartFullBodyImage
        src={look.image_url}
        alt={look.theme || look.model_name}
        onBroken={onBroken}
      />
      <div className="pointer-events-none absolute inset-x-6 bottom-6 h-10 rounded-[50%] bg-black/10 blur-lg" />
      <button
        type="button"
        aria-pressed={rosePicked}
        aria-label={`Mark ${side} look as rose preference`}
        disabled={selectedSide !== null || timedOut}
        onClick={(event) => {
          event.stopPropagation();
          onRose(side);
        }}
        className={`absolute bottom-4 ${side === 'left' ? 'left-4' : 'right-4'} z-20 grid h-14 w-14 place-items-center rounded-full border-2 text-[1.85rem] transition disabled:cursor-not-allowed disabled:opacity-70 ${roseClass} ${rosePicked ? 'scale-110 ring-4 ring-white/85' : ''}`}
      >
        <span className="drop-shadow-[0_0_10px_rgba(255,20,147,0.85)]">🌹</span>
      </button>
      <AnimatePresence>{picked && (rosePicked ? <RoseBurst /> : <HeartBurst />)}</AnimatePresence>
    </motion.div>
  );
}

function ProgressBars({
  currentRound,
  totalRounds,
}: {
  currentRound: number;
  totalRounds: number;
}) {
  return (
    <div className="flex w-full max-w-[270px] items-center justify-center gap-2 pt-1">
      {Array.from({ length: totalRounds }).map((_, index) => {
        const active = index < currentRound;
        const current = index === currentRound - 1;
        return (
          <span
            key={index}
            className={`h-3 flex-1 rounded-full transition-all ${
              active ? 'bg-[#ff1493]' : 'bg-white/15'
            } ${current ? 'ring-2 ring-[#ff1493] ring-offset-2 ring-offset-[#050005]' : ''}`}
          />
        );
      })}
    </div>
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

  useEffect(() => {
    setBroken(false);
  }, [src]);

  if (!src || broken) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-white text-black/40">
        <Activity className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#f8f7f8]">
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        loading="eager"
        decoding="async"
        onError={() => {
          setBroken(true);
          onBroken?.();
        }}
        className="relative z-10 h-full w-full object-contain object-center"
      />
    </div>
  );
}

function HeartBurst() {
  const colors = ['#ff1493', '#ffffff', '#050005', '#ff5bb3', '#f7f2f5'];
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {Array.from({ length: 42 }).map((_, i) => {
        const angle = (i / 42) * Math.PI * 2;
        const heartX = 16 * Math.sin(angle) ** 3 * 3.8;
        const heartY = -(
          13 * Math.cos(angle)
          - 5 * Math.cos(2 * angle)
          - 2 * Math.cos(3 * angle)
          - Math.cos(4 * angle)
        ) * 3.8;
        const burstX = Math.cos(angle) * (86 + (i % 4) * 34);
        const burstY = Math.sin(angle) * (86 + (i % 5) * 24);
        const color = colors[i % colors.length];
        const isRibbon = i % 3 === 0;
        return (
          <motion.span
            key={i}
            className={`absolute left-1/2 top-1/2 ${isRibbon ? 'h-7 w-3 rounded-sm' : 'h-4 w-4 rounded-full'} border border-white/55 shadow-[0_0_18px_rgba(255,20,147,0.75)]`}
            style={{ backgroundColor: color }}
            initial={{ x: 0, y: 0, rotate: 0, scale: 0, opacity: 1 }}
            animate={{
              x: [0, heartX, burstX],
              y: [0, heartY, burstY],
              rotate: isRibbon ? [0, 190 + i * 11] : [0, 90],
              scale: [0, 1.16, 1.22, 0.18],
              opacity: [0, 1, 1, 0],
            }}
            transition={{ duration: 1.05, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}

function RoseBurst() {
  const colors = ['#ff1493', '#ffffff', '#050005', '#ff5bb3', '#f7f2f5'];
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {Array.from({ length: 54 }).map((_, i) => {
        const isStem = i >= 42;
        const angle = (i / 42) * Math.PI * 2;
        const petalWave = Math.abs(Math.sin(angle * 4));
        const roseRadius = 18 + petalWave * 42;
        const roseX = isStem ? (i % 2 === 0 ? -5 : 5) : Math.cos(angle) * roseRadius;
        const roseY = isStem ? 24 + (i - 42) * 6 : Math.sin(angle) * roseRadius * 0.76 - 12;
        const burstAngle = angle + (i % 5) * 0.18;
        const burstX = Math.cos(burstAngle) * (96 + (i % 6) * 26);
        const burstY = Math.sin(burstAngle) * (90 + (i % 5) * 24);
        const color = isStem ? (i % 2 === 0 ? '#ffffff' : '#050005') : colors[i % colors.length];
        const isRibbon = i % 4 === 0;

        return (
          <motion.span
            key={i}
            className={`absolute left-1/2 top-1/2 border border-white/60 shadow-[0_0_20px_rgba(255,20,147,0.82)] ${
              isStem
                ? 'h-7 w-2 rounded-full'
                : isRibbon
                  ? 'h-8 w-3 rounded-sm'
                  : 'h-5 w-5 rounded-full'
            }`}
            style={{ backgroundColor: color }}
            initial={{ x: 0, y: 0, rotate: 0, scale: 0, opacity: 1 }}
            animate={{
              x: [0, roseX, roseX, burstX],
              y: [0, roseY, roseY, burstY],
              rotate: isStem ? [0, -18, -18, 150 + i * 9] : [0, i * 8, i * 8, 220 + i * 12],
              scale: [0, 1.12, 1.12, 0.22],
              opacity: [0, 1, 1, 0],
            }}
            transition={{ duration: 1.18, times: [0, 0.38, 0.52, 1], ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}

function pickDateOrDumpResultCard(
  result: DateOrDumpResult,
  answers: DateOrDumpAnswer[],
): DateOrDumpResultCardId {
  const seed = [
    result.title,
    result.archetype,
    result.summary,
    result.tags.join(' '),
    ...answers.flatMap((answer) => [
      answer.winner.id,
      answer.winnerSide,
      String(answer.responseMs),
      answer.winner.theme,
      ...answer.winner.item_snapshot.map((item) => `${item.name} ${item.category}`),
    ]),
  ].join('|');
  const hash = stableHash(seed);
  return DATE_OR_DUMP_RESULT_CARD_LIST[hash % DATE_OR_DUMP_RESULT_CARD_LIST.length].id;
}

function buildDateOrDumpShareCaption(result: DateOrDumpResult, answers: DateOrDumpAnswer[]) {
  const pickedLooks = answers.map((answer) => answer.winner);
  const roseLooks = answers
    .map((answer) => answer.roseLook)
    .filter((look): look is DateOrDumpGameLook => Boolean(look));
  const topModel = pickedLooks[0]?.model_name || 'my mystery fit';
  const topItems = pickedLooks
    .flatMap((look) => look.item_snapshot.map((item) => item.name || item.category))
    .filter(Boolean)
    .slice(0, 3)
    .join(' + ');
  const fitLine = topItems ? `${topModel} in ${topItems}` : topModel;
  const roseLine = roseLooks.length > 0
    ? `Rose pick: ${roseLooks[0].model_name}${roseLooks.length > 1 ? ` + ${roseLooks.length - 1} more` : ''}.`
    : 'No rose pick this time, pure savage voting.';
  const gameUrl = `${window.location.origin}/game`;
  return [
    `I got "${result.archetype || result.title}" on DFB Date or Dump.`,
    `My winning pick screamed: ${fitLine}.`,
    roseLine,
    `Ab tum log bhi play karo and tell me your type. Check it here: ${gameUrl}`,
    'Send your result back on WhatsApp, group chat judgement compulsory.',
    '#DateOrDump #DFB',
  ].join('\n');
}

async function posterImageFile(card: DateOrDumpResultCardConfig) {
  try {
    const response = await fetch(card.src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new File([blob], `dfb-date-or-dump-${card.id}.png`, {
      type: blob.type || 'image/png',
    });
  } catch {
    return null;
  }
}

function recordRosePreferenceLocal(
  anonymousPlayerId: string,
  duel: DateOrDumpDuel,
  roseSide: DateOrDumpSide,
) {
  if (typeof window === 'undefined') return;
  const roseLook = roseSide === 'left' ? duel.left : duel.right;
  const key = 'dfb_date_or_dump_rose_preferences';
  try {
    const existing = JSON.parse(window.localStorage.getItem(key) || '[]') as unknown[];
    const next = [
      {
        anonymousPlayerId,
        duelClientId: duel.client_id,
        roundIndex: duel.round_index,
        modelId: duel.model_id,
        modelName: duel.model_name,
        roseSide,
        lookId: roseLook.id,
        lookTheme: roseLook.theme,
        itemIds: roseLook.item_ids,
        createdAt: new Date().toISOString(),
      },
      ...existing,
    ].slice(0, 100);
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Local analytics should never block the game flow.
  }
}

function stableHash(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

type DateOrDumpSound = 'start' | 'tap' | 'pick' | 'tick' | 'timeout' | 'result';

function createDateOrDumpAudio() {
  const AudioContextCtor = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) {
    return {
      play: () => undefined,
      resume: async () => undefined,
      close: () => undefined,
    };
  }

  const context = new AudioContextCtor();
  const master = context.createGain();
  master.gain.value = 0.16;
  master.connect(context.destination);

  const resume = async () => {
    if (context.state === 'suspended') await context.resume();
  };

  const play = (sound: DateOrDumpSound) => {
    void resume();
    const now = context.currentTime;
    const patterns: Record<DateOrDumpSound, Array<[number, number, number]>> = {
      start: [[261.63, 0, 0.08], [329.63, 0.08, 0.1], [493.88, 0.18, 0.12]],
      tap: [[523.25, 0, 0.045]],
      pick: [[659.25, 0, 0.06], [987.77, 0.07, 0.08], [1318.51, 0.15, 0.09]],
      tick: [[1046.5, 0, 0.045]],
      timeout: [[196, 0, 0.14], [130.81, 0.13, 0.24]],
      result: [[329.63, 0, 0.08], [493.88, 0.09, 0.1], [783.99, 0.2, 0.18]],
    };

    patterns[sound].forEach(([frequency, delay, duration]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = sound === 'timeout' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + delay);
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(sound === 'timeout' ? 0.18 : 0.14, now + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + duration + 0.03);
    });
  };

  const close = () => {
    if (context.state !== 'closed') void context.close();
  };

  return { play, resume, close };
}
