import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BadgeCheck,
  Check,
  ClipboardList,
  Compass,
  ExternalLink,
  ImagePlus,
  Loader2,
  PackageCheck,
  Search,
  ShieldCheck,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import {
  buildScoutPacks,
  buildScoutSearchIntents,
  candidateFromManualUrl,
  parseScoutBrief,
  scoutCandidateToMetadata,
  searchScoutImages,
  type ScoutCandidate,
  type ScoutCandidateStatus,
} from '../lib/drScout';
import { useExtractionQueue } from '../context/ExtractionQueueContext';
import { useDirector } from '../context/DirectorContext';

const DEFAULT_BRIEF = 'summer indian collection with pastel kurtas, airy palazzos, juttis, oxidized jewelry and tote bags';

export function Scout() {
  const [briefText, setBriefText] = useState(DEFAULT_BRIEF);
  const [manualUrl, setManualUrl] = useState('');
  const [candidates, setCandidates] = useState<ScoutCandidate[]>([]);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(() => new Set());
  const [searching, setSearching] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const { addJobFromUrl } = useExtractionQueue();
  const director = useDirector();

  const brief = useMemo(() => parseScoutBrief(briefText), [briefText]);
  const intents = useMemo(() => buildScoutSearchIntents(brief), [brief]);
  const packs = useMemo(() => buildScoutPacks(candidates.filter((candidate) => candidate.status !== 'rejected')), [candidates]);
  const categories = useMemo(() => ['All', ...Array.from(new Set(candidates.map((candidate) => candidate.category)))], [candidates]);
  const visibleCandidates = candidates.filter((candidate) => activeCategory === 'All' || candidate.category === activeCategory);
  const approvedCount = candidates.filter((candidate) => candidate.status === 'approved' || candidate.status === 'imported').length;

  const updateCandidate = (id: string, patch: Partial<ScoutCandidate>) => {
    setCandidates((current) => current.map((candidate) => (candidate.id === id ? { ...candidate, ...patch } : candidate)));
  };

  const setCandidateStatus = (id: string, status: ScoutCandidateStatus) => updateCandidate(id, { status });

  const runScout = async () => {
    setSearching(true);
    try {
      const results = await searchScoutImages(intents, brief);
      setCandidates(results);
      setConfirmedIds(new Set());
      setActiveCategory('All');
      director.push('Dr. Scout', `Found ${results.length} reference candidates for ${brief.title}.`);
    } finally {
      setSearching(false);
    }
  };

  const addManualCandidate = () => {
    const url = manualUrl.trim();
    if (!url) return;
    const intent = intents[0];
    const candidate = candidateFromManualUrl(url, brief, intent);
    setCandidates((current) => [candidate, ...current]);
    setManualUrl('');
    director.push('Dr. Scout', 'Manual source added to the scout board.');
  };

  const toggleConfirmed = (id: string) => {
    setConfirmedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const importCandidate = async (candidate: ScoutCandidate) => {
    if (!confirmedIds.has(candidate.id)) {
      director.push('Dr. Scout', 'Confirm image usage rights before sending this reference to the Extraction Lab.');
      return;
    }

    setImportingId(candidate.id);
    updateCandidate(candidate.id, { status: 'approved' });
    try {
      const jobId = await addJobFromUrl(candidate.imageUrl, scoutCandidateToMetadata(candidate));
      updateCandidate(candidate.id, { status: 'imported' });
      director.push('Dr. Scout', `Sent ${candidate.subcategory} to Dr. Scientist as extraction job ${jobId.slice(0, 8)}.`);
    } catch (error) {
      updateCandidate(candidate.id, { status: 'failed' });
      director.push(
        'Dr. Scout',
        error instanceof Error
          ? error.message
          : 'Could not import that Scout source. Try a direct image URL or upload manually.',
      );
    } finally {
      setImportingId(null);
    }
  };

  const approvePack = async (candidateIds: string[]) => {
    for (const candidate of candidates.filter((item) => candidateIds.includes(item.id))) {
      if (!confirmedIds.has(candidate.id) || candidate.status === 'imported') continue;
      await importCandidate(candidate);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Section 09 · Dr. Scout</div>
          <h1 className="section-title mt-2">Scout Sourcing</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
            Describe a collection and Dr. Scout turns it into category-specific source boards. Approve references,
            confirm usage rights, and send them straight to Dr. Scientist for extraction and re-rendering.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-lab-border-light bg-white/50 px-3 py-2 text-sm dark:border-lab-border dark:bg-white/[0.03]">
          <Compass className="h-4 w-4 text-cobalt dark:text-indigo_electric" />
          {approvedCount} approved/imported
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <div className="bento space-y-4">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-cobalt dark:text-indigo_electric" />
            <div>
              <div className="font-display text-2xl">Collection brief</div>
              <div className="text-xs text-neutral-500">Natural language in, extraction-ready sourcing board out.</div>
            </div>
          </div>
          <textarea
            value={briefText}
            onChange={(event) => setBriefText(event.target.value)}
            className="min-h-32 w-full rounded-2xl border border-lab-border-light bg-white/70 p-4 text-sm outline-none transition focus:border-cobalt dark:border-lab-border dark:bg-white/[0.03] dark:focus:border-indigo_electric"
            placeholder="Example: summer Indian collection with pastel kurtas, airy palazzos, juttis, oxidized jewelry, tote bags…"
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <BriefStat label="Collection" value={brief.title} />
            <BriefStat label="Season" value={brief.season} />
            <BriefStat label="Region" value={brief.region} />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <TokenPanel title="Palette" tokens={brief.colors} />
            <TokenPanel title="Fabrics" tokens={brief.fabrics} />
          </div>
          <TokenPanel title="Avoid" tokens={brief.avoid} tone="warning" />
          <div className="flex flex-wrap gap-2">
            <button onClick={runScout} disabled={searching} className="btn-primary disabled:opacity-50">
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Scout Collection
            </button>
            <div className="flex min-w-[280px] flex-1 items-center gap-2 rounded-full border border-lab-border-light bg-white/60 px-3 py-2 dark:border-lab-border dark:bg-white/[0.03]">
              <ImagePlus className="h-4 w-4 text-neutral-500" />
              <input
                value={manualUrl}
                onChange={(event) => setManualUrl(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="Paste direct image URL"
              />
              <button onClick={addManualCandidate} className="text-xs font-semibold text-cobalt dark:text-indigo_electric">
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="bento space-y-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-cobalt dark:text-indigo_electric" />
            <div>
              <div className="font-display text-2xl">Scout plan</div>
              <div className="text-xs text-neutral-500">Queries Dr. Scout will use for this drop.</div>
            </div>
          </div>
          <div className="max-h-[415px] space-y-2 overflow-y-auto pr-1 custom-scroll">
            {intents.map((intent) => (
              <div key={intent.id} className="rounded-2xl border border-lab-border-light bg-black/[0.02] p-3 dark:border-lab-border dark:bg-white/[0.03]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{intent.subcategory}</div>
                    <div className="mt-1 text-xs text-neutral-500">{intent.query}</div>
                  </div>
                  <span className="chip shrink-0">P{intent.priority}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {packs.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {packs.map((pack) => (
            <div key={pack.id} className="bento flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="eyebrow">Scout Pack</div>
                <div className="font-display text-2xl">{pack.name}</div>
                <p className="mt-1 text-sm text-neutral-500">{pack.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {pack.categoryCoverage.map((category) => <span key={category} className="chip">{category}</span>)}
                </div>
              </div>
              <button
                onClick={() => approvePack(pack.candidateIds)}
                className="rounded-full border border-lab-border-light px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-lab-border dark:hover:bg-white/5"
              >
                Send confirmed pack
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bento space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Candidate Board</div>
            <div className="font-display text-2xl">Approve references for extraction</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  activeCategory === category
                    ? 'bg-black text-white dark:bg-white dark:text-black'
                    : 'bg-black/5 text-neutral-600 hover:bg-black/10 dark:bg-white/[0.06] dark:text-neutral-300'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {visibleCandidates.length === 0 ? (
          <div className="grid min-h-64 place-items-center rounded-3xl border border-dashed border-lab-border-light p-8 text-center dark:border-lab-border">
            <div>
              <Sparkles className="mx-auto h-8 w-8 text-neutral-400" />
              <div className="mt-3 font-display text-2xl">No Scout board yet</div>
              <p className="mt-1 max-w-md text-sm text-neutral-500">
                Run a collection scout or paste a direct image URL to start sending references into the Extraction Lab.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {visibleCandidates.map((candidate, index) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                delay={index * 0.03}
                confirmed={confirmedIds.has(candidate.id)}
                importing={importingId === candidate.id}
                onConfirm={() => toggleConfirmed(candidate.id)}
                onShortlist={() => setCandidateStatus(candidate.id, 'shortlisted')}
                onReject={() => setCandidateStatus(candidate.id, 'rejected')}
                onImport={() => importCandidate(candidate)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BriefStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-lab-border-light bg-black/[0.02] p-3 dark:border-lab-border dark:bg-white/[0.03]">
      <div className="eyebrow">{label}</div>
      <div className="mt-1 text-sm font-semibold capitalize">{value}</div>
    </div>
  );
}

function TokenPanel({ title, tokens, tone = 'default' }: { title: string; tokens: string[]; tone?: 'default' | 'warning' }) {
  return (
    <div className="rounded-2xl border border-lab-border-light bg-black/[0.02] p-3 dark:border-lab-border dark:bg-white/[0.03]">
      <div className="eyebrow mb-2">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {tokens.map((token) => (
          <span key={token} className={`chip ${tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : ''}`}>{token}</span>
        ))}
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  delay,
  confirmed,
  importing,
  onConfirm,
  onShortlist,
  onReject,
  onImport,
}: {
  candidate: ScoutCandidate;
  delay: number;
  confirmed: boolean;
  importing: boolean;
  onConfirm: () => void;
  onShortlist: () => void;
  onReject: () => void;
  onImport: () => void;
}) {
  const disabled = candidate.status === 'imported' || candidate.status === 'rejected' || importing;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: candidate.status === 'rejected' ? 0.45 : 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 100, damping: 18, delay }}
      className="group overflow-hidden rounded-3xl border border-lab-border-light bg-white/50 dark:border-lab-border dark:bg-white/[0.03]"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-white">
        <img
          src={candidate.thumbnailUrl}
          alt={candidate.title}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
            {candidate.confidence}% fit
          </span>
          {candidate.status !== 'suggested' && (
            <span className="rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
              {candidate.status}
            </span>
          )}
        </div>
        <a
          href={candidate.sourceUrl}
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
        <label className="flex cursor-pointer items-start gap-2 rounded-2xl border border-lab-border-light bg-black/[0.02] p-3 text-xs leading-relaxed dark:border-lab-border dark:bg-white/[0.03]">
          <input type="checkbox" checked={confirmed} onChange={onConfirm} className="mt-0.5" />
          <span>
            I confirm I have rights or permission to use this source for wardrobe extraction.
          </span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={onShortlist}
            disabled={disabled}
            className="rounded-xl border border-lab-border-light px-2 py-2 text-xs font-medium hover:bg-black/5 disabled:opacity-40 dark:border-lab-border dark:hover:bg-white/5"
          >
            <BadgeCheck className="mx-auto h-3.5 w-3.5" />
          </button>
          <button
            onClick={onReject}
            disabled={disabled}
            className="rounded-xl border border-lab-border-light px-2 py-2 text-xs font-medium hover:bg-rose-500 hover:text-white disabled:opacity-40 dark:border-lab-border"
          >
            <X className="mx-auto h-3.5 w-3.5" />
          </button>
          <button
            onClick={onImport}
            disabled={disabled || !confirmed}
            className="rounded-xl bg-black px-2 py-2 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            {importing ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : candidate.status === 'imported' ? <Check className="mx-auto h-3.5 w-3.5" /> : <PackageCheck className="mx-auto h-3.5 w-3.5" />}
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
