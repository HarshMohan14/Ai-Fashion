import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Check,
  Compass,
  ExternalLink,
  Loader2,
  PackageCheck,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  hasScoutGeminiKey,
  scoutCandidateToMetadata,
  searchScoutCandidates,
  type ScoutCandidate,
} from '../lib/drScout';
import { useExtractionQueue } from '../context/ExtractionQueueContext';
import { useDirector } from '../context/DirectorContext';

const DEFAULT_THEME = 'summer men Indian collection';

export function Scout() {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [imageCount, setImageCount] = useState(12);
  const [candidates, setCandidates] = useState<ScoutCandidate[]>([]);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(() => new Set());
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addJobFromUrl } = useExtractionQueue();
  const director = useDirector();

  const approvedCandidates = useMemo(
    () => candidates.filter((candidate) => approvedIds.has(candidate.id) && candidate.status !== 'imported'),
    [approvedIds, candidates],
  );

  const scoutImages = async () => {
    setLoading(true);
    setError(null);
    setCandidates([]);
    setApprovedIds(new Set());

    try {
      const results = await searchScoutCandidates(theme, imageCount);
      setCandidates(results);
      if (results.length === 0) {
        setError('Gemini searched, but did not return extractable image URLs. Try a more specific clothing theme.');
      }
      director.push('Dr. Scout', `Found ${results.length} Gemini-critiqued images for “${theme}”.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Dr. Scout could not search images.';
      setError(message);
      director.push('Dr. Scout', message);
    } finally {
      setLoading(false);
    }
  };

  const updateCandidate = (id: string, patch: Partial<ScoutCandidate>) => {
    setCandidates((current) => current.map((candidate) => (candidate.id === id ? { ...candidate, ...patch } : candidate)));
  };

  const approveCandidate = (candidate: ScoutCandidate) => {
    updateCandidate(candidate.id, { status: 'approved' });
    setApprovedIds((current) => new Set(current).add(candidate.id));
  };

  const rejectCandidate = (candidate: ScoutCandidate) => {
    updateCandidate(candidate.id, { status: 'rejected' });
    setApprovedIds((current) => {
      const next = new Set(current);
      next.delete(candidate.id);
      return next;
    });
  };

  const sendApprovedToExtraction = async () => {
    if (!rightsConfirmed) {
      director.push('Dr. Scout', 'Confirm image usage rights before sending approved images to Extraction Lab.');
      return;
    }

    if (approvedCandidates.length === 0) {
      director.push('Dr. Scout', 'Approve at least one image before sending to Extraction Lab.');
      return;
    }

    setSending(true);
    let sent = 0;
    let failed = 0;

    for (const candidate of approvedCandidates) {
      try {
        await addJobFromUrl(candidate.imageUrl, scoutCandidateToMetadata(candidate));
        updateCandidate(candidate.id, { status: 'imported' });
        sent += 1;
      } catch (err) {
        updateCandidate(candidate.id, { status: 'failed' });
        failed += 1;
        console.warn('[Dr. Scout] Could not send image to Extraction Lab:', err);
      }
    }

    setSending(false);
    setApprovedIds(new Set());
    director.push('Dr. Scout', `Sent ${sent} approved image${sent === 1 ? '' : 's'} to Extraction Lab.${failed ? ` ${failed} failed due to blocked image URLs/CORS.` : ''}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Section 09 · Dr. Scout</div>
          <h1 className="section-title mt-2">Scout Images</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
            Give Dr. Scout a theme and image count. Gemini searches the web, critiques the candidates, and only then
            shows images for your approval before Extraction Lab handoff.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-lab-border-light bg-white/50 px-3 py-2 text-sm dark:border-lab-border dark:bg-white/[0.03]">
          <Compass className="h-4 w-4 text-cobalt dark:text-indigo_electric" />
          {approvedCandidates.length} approved
        </div>
      </div>

      <div className="bento space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_180px_auto] lg:items-end">
          <div>
            <label className="eyebrow mb-2 block">Theme</label>
            <input
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
              className="w-full rounded-2xl border border-lab-border-light bg-white/70 px-4 py-3 text-sm outline-none transition focus:border-cobalt dark:border-lab-border dark:bg-white/[0.03] dark:focus:border-indigo_electric"
              placeholder="summer men Indian collection"
            />
          </div>
          <div>
            <label className="eyebrow mb-2 block">Images</label>
            <input
              type="number"
              min={1}
              max={30}
              value={imageCount}
              onChange={(event) => setImageCount(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}
              className="w-full rounded-2xl border border-lab-border-light bg-white/70 px-4 py-3 text-sm outline-none transition focus:border-cobalt dark:border-lab-border dark:bg-white/[0.03] dark:focus:border-indigo_electric"
            />
          </div>
          <button onClick={scoutImages} disabled={loading || !theme.trim()} className="btn-primary h-12 disabled:opacity-50">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Scout Images
          </button>
        </div>

        {!hasScoutGeminiKey() && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Add VITE_GEMINI_API_KEY to enable Gemini web scouting and candidate critique.
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      <div className="bento space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Gemini-critiqued candidates</div>
            <div className="font-display text-2xl">Approve images before extraction</div>
          </div>
          <button
            onClick={sendApprovedToExtraction}
            disabled={sending || approvedCandidates.length === 0 || !rightsConfirmed}
            className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            {sending ? <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="mr-2 inline h-3.5 w-3.5" />}
            Send {approvedCandidates.length} Approved to Extraction Lab
          </button>
        </div>

        {candidates.length > 0 && (
          <label className="flex cursor-pointer items-start gap-2 rounded-2xl border border-lab-border-light bg-black/[0.02] p-3 text-xs leading-relaxed dark:border-lab-border dark:bg-white/[0.03]">
            <input type="checkbox" checked={rightsConfirmed} onChange={() => setRightsConfirmed((value) => !value)} className="mt-0.5" />
            <span>
              I confirm I have rights or permission to use approved source images for wardrobe extraction.
            </span>
          </label>
        )}

        {loading ? (
          <div className="grid min-h-72 place-items-center rounded-3xl border border-dashed border-lab-border-light p-8 text-center dark:border-lab-border">
            <div>
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-cobalt dark:text-indigo_electric" />
              <div className="mt-4 font-display text-2xl">Dr. Scout is searching...</div>
              <p className="mt-1 max-w-md text-sm text-neutral-500">
                Gemini is planning searches, checking web results, and critiquing images before showing them here.
              </p>
            </div>
          </div>
        ) : candidates.length === 0 ? (
          <div className="grid min-h-72 place-items-center rounded-3xl border border-dashed border-lab-border-light p-8 text-center dark:border-lab-border">
            <div>
              <Sparkles className="mx-auto h-8 w-8 text-neutral-400" />
              <div className="mt-3 font-display text-2xl">No images scouted yet</div>
              <p className="mt-1 max-w-md text-sm text-neutral-500">
                Enter a theme like “summer men Indian collection”, choose how many images you want, and click Scout Images.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {candidates.map((candidate, index) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                delay={index * 0.03}
                approved={approvedIds.has(candidate.id)}
                onApprove={() => approveCandidate(candidate)}
                onReject={() => rejectCandidate(candidate)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  delay,
  approved,
  onApprove,
  onReject,
}: {
  candidate: ScoutCandidate;
  delay: number;
  approved: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const disabled = candidate.status === 'imported' || candidate.status === 'rejected' || candidate.status === 'failed';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: candidate.status === 'rejected' ? 0.45 : 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 100, damping: 18, delay }}
      className="group overflow-hidden rounded-3xl border border-lab-border-light bg-white/50 dark:border-lab-border dark:bg-white/[0.03]"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-white">
        <img
          src={candidate.thumbnailUrl || candidate.imageUrl}
          alt={candidate.title}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-black/75 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
            {candidate.confidence}% Gemini
          </span>
          {approved && candidate.status !== 'imported' && (
            <span className="rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
              Approved
            </span>
          )}
          {candidate.status === 'imported' && (
            <span className="rounded-full bg-cobalt px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white dark:bg-indigo_electric">
              Sent
            </span>
          )}
          {candidate.status === 'failed' && (
            <span className="rounded-full bg-rose-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
              Failed
            </span>
          )}
        </div>
        <a
          href={candidate.sourceUrl || candidate.imageUrl}
          target="_blank"
          rel="noreferrer"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-cobalt"
          aria-label="Open source"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <div className="line-clamp-2 text-sm font-semibold">{candidate.title}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            {candidate.category} · {candidate.subcategory}
          </div>
        </div>
        <p className="text-xs leading-relaxed text-neutral-500">{candidate.reason}</p>
        <div className="flex flex-wrap gap-1.5">
          <span className="chip">{candidate.sourceName}</span>
          <span className="chip">{candidate.licenseLabel}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onApprove}
            disabled={disabled}
            className={`rounded-xl px-3 py-2 text-xs font-medium transition disabled:opacity-40 ${approved ? 'bg-emerald-500 text-white' : 'border border-lab-border-light hover:bg-black/5 dark:border-lab-border dark:hover:bg-white/5'}`}
          >
            <Check className="mx-auto h-3.5 w-3.5" />
          </button>
          <button
            onClick={onReject}
            disabled={disabled}
            className="rounded-xl border border-lab-border-light px-3 py-2 text-xs font-medium transition hover:bg-rose-500 hover:text-white disabled:opacity-40 dark:border-lab-border"
          >
            <X className="mx-auto h-3.5 w-3.5" />
          </button>
        </div>
        {candidate.status === 'imported' && (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" /> Sent to Extraction Lab
          </div>
        )}
      </div>
    </motion.div>
  );
}
