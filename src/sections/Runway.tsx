import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Wand2,
  Users,
  Palette,
  Hash,
  Loader2,
  Check,
  RotateCcw,
  MessageSquareMore,
  Camera,
  CircleDot,
  Trash2,
  Eye,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  fetchStylistInputs,
  buildPermutations,
  generateLook,
  type StylistModel,
  type GeneratedLook,
  type Permutation,
} from '../lib/drStylist';
import { WardrobeItem } from '../lib/supabase';
import { useDirector } from '../context/DirectorContext';

type Status = 'draft' | 'in_review' | 'approved';
type BatchProgress = { running: boolean; current: number; total: number; current_model?: string };

const RUNWAY_LOOK_COLUMNS =
  'id,image_url,theme,status,model_id,item_ids,feedback,mocked,model_used,prompt,created_at';

function isHostedPhotosheetUrl(url: string | null | undefined) {
  return /^https?:\/\//i.test(url?.trim() ?? '');
}

export function Runway() {
  const [looks, setLooks] = useState<GeneratedLook[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | Status>('all');

  const [models, setModels] = useState<StylistModel[]>([]);
  const [items, setItems] = useState<WardrobeItem[]>([]);

  const [count, setCount] = useState<number>(5);
  const [styleContext, setStyleContext] = useState<string>('');
  const [modelFilter, setModelFilter] = useState<string>('all');

  const [progress, setProgress] = useState<BatchProgress>({ running: false, current: 0, total: 0 });
  const [feedbackFor, setFeedbackFor] = useState<GeneratedLook | null>(null);
  const [lightbox, setLightbox] = useState<GeneratedLook | null>(null);
  const [missingInputs, setMissingInputs] = useState<string | null>(null);

  const { push } = useDirector();

  const loadAll = useCallback(async () => {
    setLoading(true);
    const inputs = await fetchStylistInputs();
    setModels(inputs.models);
    setItems(inputs.items);
    const { data, error } = await supabase
      .from('runway_looks')
      .select(RUNWAY_LOOK_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      push(
        'Dr. Stylist',
        error.message || 'Could not load existing Runway looks from Supabase.',
      );
      setLooks([]);
    } else {
      setLooks(((data ?? []) as GeneratedLook[]).map((look) => hydrateLookSnapshot(look, inputs.items)));
    }
    setLoading(false);

    const topwear = inputs.items.filter((i) => i.category === 'Topwear');
    const bottomwear = inputs.items.filter((i) => i.category === 'Bottomwear');
    const footwear = inputs.items.filter((i) => i.category === 'Footwear');
    const missing: string[] = [];
    if (!inputs.models.length) missing.push('models');
    else if (!inputs.models.some((m) => isHostedPhotosheetUrl(m.composite_url))) missing.push('hosted model photosheets');
    if (!topwear.length) missing.push('topwear');
    if (!bottomwear.length) missing.push('bottomwear');
    if (!footwear.length) missing.push('footwear');
    setMissingInputs(missing.length ? missing.join(', ') : null);
  }, [push]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filtered = useMemo(
    () => (filter === 'all' ? looks : looks.filter((l) => l.status === filter)),
    [looks, filter],
  );

  const selectedModel = useMemo(
    () => (modelFilter === 'all' ? null : models.find((m) => m.id === modelFilter) ?? null),
    [modelFilter, models],
  );

  const modelsWithPhotosheets = useMemo(
    () => models.filter((m) => isHostedPhotosheetUrl(m.composite_url)),
    [models],
  );

  const generationBlocker = useMemo(() => {
    if (missingInputs) return `Missing inputs: ${missingInputs}. Seed the Wardrobe and Model Hub before generating looks.`;
    if (!styleContext.trim()) return 'Add a style context before generating looks.';
    if (modelFilter === 'all' && modelsWithPhotosheets.length === 0) return 'Upload or backfill a hosted model photosheet first.';
    if (modelFilter !== 'all' && selectedModel && !isHostedPhotosheetUrl(selectedModel.composite_url)) {
      return 'The selected model still has a base64 or empty photosheet. Run the backfill or re-upload it in Model Hub.';
    }
    return null;
  }, [missingInputs, modelFilter, modelsWithPhotosheets.length, selectedModel, styleContext]);

  const runBatch = async () => {
    if (generationBlocker) return;
    const style = styleContext.trim();
    const perms = buildPermutations(models, items, { count, theme: style, modelFilter });
    if (!perms.length) {
      setMissingInputs('could not build any permutations — check the Wardrobe and Model Hub');
      return;
    }
    setProgress({ running: true, current: 0, total: perms.length, current_model: perms[0].model.nickname });
    let generated = 0;
    let failed = 0;
    for (let i = 0; i < perms.length; i++) {
      const p = perms[i];
      setProgress({ running: true, current: i, total: perms.length, current_model: p.model.nickname });
      try {
        const look = await generateLook(p);
        setLooks((prev) => [look, ...prev]);
        generated += 1;
      } catch (e) {
        console.error(e);
        failed += 1;
        push(
          'Dr. Stylist',
          e instanceof Error
            ? e.message
            : 'Gemini could not compose this look. No fallback contact sheet was saved.',
        );
      }
    }
    setProgress({ running: false, current: perms.length, total: perms.length });
    if (generated > 0) {
      push(
        'Dr. Stylist',
        `Generated ${generated} composed runway look${generated === 1 ? '' : 's'} using your style context.${failed ? ` ${failed} failed and were not saved.` : ' Review drafts in the Runway and approve for DFB.'}`,
      );
    } else if (failed > 0) {
      push(
        'Dr. Stylist',
        'Gemini did not return any composed runway images, so no separate reference/contact-sheet images were saved.',
      );
    }
  };

  const updateStatus = async (id: string, status: Status) => {
    setLooks((list) => list.map((l) => (l.id === id ? { ...l, status } : l)));
    await supabase.from('runway_looks').update({ status }).eq('id', id);
  };

  const removeLook = async (id: string) => {
    setLooks((list) => list.filter((l) => l.id !== id));
    await supabase.from('runway_looks').delete().eq('id', id);
  };

  const regenerateWithFeedback = async (look: GeneratedLook, feedback: string) => {
    setFeedbackFor(null);
    const model = models.find((m) => m.id === look.model_id);
    const top = items.find((i) => i.id === look.item_ids[0]);
    const bot = items.find((i) => i.id === look.item_ids[1]);
    const shoe = items.find((i) => i.id === look.item_ids[2]);
    const acc = look.item_ids[3] ? items.find((i) => i.id === look.item_ids[3]) : null;
    if (!model || !top || !bot || !shoe) return;

    const perm: Permutation = {
      model,
      topwear: top,
      bottomwear: bot,
      footwear: shoe,
      accessory: acc ?? null,
      theme: look.theme,
    };

    setProgress({ running: true, current: 0, total: 1, current_model: model.nickname });
    try {
      const fresh = await generateLook(perm, undefined, feedback);
      setLooks((prev) => [fresh, ...prev]);
      await supabase.from('runway_looks').update({ status: 'in_review', feedback }).eq('id', look.id);
      setLooks((prev) => prev.map((l) => (l.id === look.id ? { ...l, status: 'in_review', feedback } : l)));
    } catch (e) {
      console.error(e);
      push(
        'Dr. Stylist',
        e instanceof Error
          ? e.message
          : 'Gemini could not regenerate this look. No fallback contact sheet was saved.',
      );
    } finally {
      setProgress({ running: false, current: 1, total: 1 });
    }
  };

  const counts = useMemo(() => ({
    all: looks.length,
    draft: looks.filter((l) => l.status === 'draft').length,
    in_review: looks.filter((l) => l.status === 'in_review').length,
    approved: looks.filter((l) => l.status === 'approved').length,
  }), [looks]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow">Section 07 · Dr. Stylist</div>
          <h1 className="section-title mt-2">Runway</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1.5 max-w-xl">
            Dr. Stylist uses the uploaded 5-angle model photosheet as the identity reference, combines it
            with wardrobe garments, and follows your written style context for the final editorial frame.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip">{looks.length} looks total</span>
          <span className="chip bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <Check className="w-3 h-3" /> {counts.approved} approved
          </span>
        </div>
      </div>

      {/* Batch control panel */}
      <div className="bento p-5">
        <div className="flex items-center gap-2 mb-4">
          <Wand2 className="w-4 h-4 text-cobalt dark:text-indigo_electric" />
          <div className="font-medium">Generate batch</div>
          <span className="chip ml-auto">Dr. Stylist · Nano Banana 2</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <ControlField className="md:col-span-4" label="Style context" icon={<Palette className="w-3.5 h-3.5" />}>
            <textarea
              value={styleContext}
              onChange={(e) => setStyleContext(e.target.value)}
              placeholder="e.g. rooftop dinner in Mumbai, black linen eveningwear mood, warm cinematic lighting, confident editorial stance"
              className="lab-input min-h-[96px] resize-y"
            />
          </ControlField>
          <ControlField label="Permutations" icon={<Hash className="w-3.5 h-3.5" />}>
            <input
              type="number"
              min={1}
              max={30}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
              className="lab-input"
            />
          </ControlField>
          <ControlField className="md:col-span-2" label="Model filter" icon={<Users className="w-3.5 h-3.5" />}>
            <select value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} className="lab-input">
              <option value="all">Use all models with photosheets ({modelsWithPhotosheets.length})</option>
              {models.map((m) => (
                <option key={m.id} value={m.id} disabled={!isHostedPhotosheetUrl(m.composite_url)}>
                  Only: {m.nickname}{isHostedPhotosheetUrl(m.composite_url) ? '' : ' (needs hosted photosheet)'}
                </option>
              ))}
            </select>
          </ControlField>
          <div className="flex items-end">
            <button
              onClick={runBatch}
              disabled={progress.running || !!generationBlocker}
              className="btn-primary w-full justify-center disabled:opacity-40"
            >
              {progress.running ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Styling…</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" /> Generate batch</>
              )}
            </button>
          </div>
        </div>

        {generationBlocker && (
          <div className="mt-4 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 rounded-lg p-3">
            {generationBlocker}
          </div>
        )}
      </div>

      {/* Filter rail */}
      <div className="flex gap-2 flex-wrap">
        <FilterChip label={`All · ${counts.all}`} active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterChip label={`Drafts · ${counts.draft}`} active={filter === 'draft'} onClick={() => setFilter('draft')} />
        <FilterChip label={`In review · ${counts.in_review}`} active={filter === 'in_review'} onClick={() => setFilter('in_review')} />
        <FilterChip label={`Approved · ${counts.approved}`} active={filter === 'approved'} onClick={() => setFilter('approved')} />
      </div>

      {/* Masonry */}
      {loading ? (
        <MasonrySkeleton />
      ) : filtered.length === 0 ? (
        <div className="bento grid place-items-center py-20 text-center">
          <Camera className="w-10 h-10 text-neutral-400 mb-3" />
          <div className="font-display text-2xl">
            {looks.length === 0 ? 'No looks yet' : 'No looks match this filter'}
          </div>
          <div className="text-sm text-neutral-500 mt-1.5 max-w-md">
            {looks.length === 0
              ? 'Configure a batch above and let Dr. Stylist compose the first editorial frames.'
              : 'Try a different status filter.'}
          </div>
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-5 space-y-5">
          <AnimatePresence>
            {filtered.map((look) => (
              <LookCard
                key={look.id}
                look={look}
                model={models.find((m) => m.id === look.model_id)}
                onApprove={() => updateStatus(look.id, 'approved')}
                onDraft={() => updateStatus(look.id, 'draft')}
                onRequestFeedback={() => setFeedbackFor(look)}
                onDelete={() => removeLook(look.id)}
                onZoom={() => setLightbox(look)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Global styling loader */}
      <AnimatePresence>
        {progress.running && <StylingLoader progress={progress} />}
      </AnimatePresence>

      {/* Feedback modal */}
      <AnimatePresence>
        {feedbackFor && (
          <FeedbackModal
            look={feedbackFor}
            onClose={() => setFeedbackFor(null)}
            onSubmit={(fb) => regenerateWithFeedback(feedbackFor, fb)}
          />
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <Lightbox look={lightbox} onClose={() => setLightbox(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function buildItemSnapshot(itemIds: string[], items: WardrobeItem[]): GeneratedLook['item_snapshot'] {
  return itemIds.map((id) => {
    const item = items.find((i) => i.id === id);
    return {
      id,
      name: item?.name ?? 'Archived item',
      image: item?.image_url ?? '',
      category: item?.category ?? 'Unknown',
    };
  });
}

function hydrateLookSnapshot(look: GeneratedLook, items: WardrobeItem[]): GeneratedLook {
  const itemIds = look.item_ids ?? [];
  const snapshot = Array.isArray(look.item_snapshot) && look.item_snapshot.length > 0
    ? look.item_snapshot.map((saved) => {
        const item = items.find((i) => i.id === saved.id);
        return {
          id: saved.id,
          name: saved.name || item?.name || 'Archived item',
          image: saved.image || item?.image_url || '',
          category: saved.category || item?.category || 'Unknown',
        };
      })
    : buildItemSnapshot(itemIds, items);
  return { ...look, item_ids: itemIds, item_snapshot: snapshot };
}

function ControlField({
  label,
  icon,
  children,
  className = '',
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-1.5">
        {icon} {label}
      </div>
      {children}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition ${
        active
          ? 'bg-cobalt dark:bg-indigo_electric text-white border-transparent'
          : 'border-lab-border-light dark:border-lab-border text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5'
      }`}
    >
      {label}
    </button>
  );
}

function LookCard({
  look,
  model,
  onApprove,
  onDraft,
  onRequestFeedback,
  onDelete,
  onZoom,
}: {
  look: GeneratedLook;
  model?: StylistModel;
  onApprove: () => void;
  onDraft: () => void;
  onRequestFeedback: () => void;
  onDelete: () => void;
  onZoom: () => void;
}) {
  const aspect = look.status === 'approved' ? 'aspect-[3/5]' : 'aspect-[4/5]';
  const modelName = model?.nickname;
  const modelThumb = model?.composite_url || model?.primary_photo_url;
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 120, damping: 22 }}
      className="break-inside-avoid bento p-0 overflow-hidden group"
    >
      <div className={`relative ${aspect} overflow-hidden bg-white`}>
        <img src={look.image_url} alt={modelName || 'look'} className="w-full h-full object-cover transition duration-700 group-hover:scale-[1.03]" loading="lazy" />

        {modelThumb && (
          <div className="absolute bottom-3 right-3 w-16 h-20 rounded-lg overflow-hidden border-2 border-white shadow-boutique bg-white">
            <img src={modelThumb} alt="original" className="w-full h-full object-cover" />
            <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] uppercase tracking-[0.18em] text-white text-center py-0.5">
              Source
            </div>
          </div>
        )}

        <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
          <StatusBadge status={look.status as Status} />
          {look.mocked && <span className="chip bg-amber-500/80 text-white border-transparent">Simulated</span>}
        </div>

        <div className="absolute top-3 right-3 flex gap-1.5">
          <button onClick={onZoom} className="w-8 h-8 rounded-full grid place-items-center bg-black/40 backdrop-blur text-white opacity-0 group-hover:opacity-100 transition">
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="w-8 h-8 rounded-full grid place-items-center bg-black/40 backdrop-blur text-white opacity-0 group-hover:opacity-100 transition hover:bg-rose-500/80">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-3 pb-2 bg-gradient-to-t from-black/85 via-black/50 to-transparent text-white pr-24">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/70 line-clamp-1">{look.theme || 'Style context'}</div>
          <div className="font-display text-lg leading-tight mt-0.5">{modelName || 'Model'}</div>
          <div className="text-[11px] text-white/70 mt-0.5 line-clamp-1">
            {look.item_snapshot.map((s) => s.name).join(' · ')}
          </div>
        </div>
      </div>

      <div className="p-3 flex items-center gap-2">
        {look.status !== 'approved' ? (
          <button onClick={onApprove} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium">
            <Check className="w-3.5 h-3.5" /> Approve for DFB
          </button>
        ) : (
          <button onClick={onDraft} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-black/5 dark:bg-white/10 text-xs font-medium hover:bg-black/10 dark:hover:bg-white/15">
            <CircleDot className="w-3.5 h-3.5" /> Move to draft
          </button>
        )}
        <button onClick={onRequestFeedback} className="px-3 py-2 rounded-lg border border-lab-border-light dark:border-lab-border text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1.5">
          <RotateCcw className="w-3.5 h-3.5" /> Regenerate
        </button>
      </div>
    </motion.article>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string }> = {
    draft: { label: 'Draft', cls: 'bg-neutral-700 text-white' },
    in_review: { label: 'In review', cls: 'bg-amber-500 text-white' },
    approved: { label: 'Approved', cls: 'bg-emerald-500 text-white' },
  };
  const s = map[status] ?? map.draft;
  return <span className={`chip border-transparent ${s.cls}`}>{s.label}</span>;
}

function MasonrySkeleton() {
  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-5 space-y-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className={`break-inside-avoid bento p-0 animate-pulse ${i % 3 === 0 ? 'h-96' : i % 3 === 1 ? 'h-72' : 'h-80'}`} />
      ))}
    </div>
  );
}

function StylingLoader({ progress }: { progress: BatchProgress }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bento flex items-center gap-4 shadow-boutique max-w-lg"
    >
      <div className="relative w-12 h-12 grid place-items-center">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-dashed border-cobalt dark:border-indigo_electric"
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        />
        <motion.svg
          viewBox="0 0 32 32"
          className="w-7 h-7 relative"
          animate={{ rotate: [-12, 12, -12] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <defs>
            <linearGradient id="thread" x1="0" x2="1">
              <stop offset="0" stopColor="#1E40AF" />
              <stop offset="1" stopColor="#5B5BF6" />
            </linearGradient>
          </defs>
          <path d="M6 26 L26 6" stroke="#d1d5db" strokeWidth="1" strokeDasharray="2 2" />
          <path d="M26 6 L20 12" stroke="url(#thread)" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="26" cy="6" r="1.6" fill="#5B5BF6" />
          <path d="M22 10 L28 4" stroke="#111" strokeWidth="1.6" strokeLinecap="round" />
        </motion.svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display text-lg leading-tight">Dr. Stylist is mapping garments to physical model coordinates…</div>
        <div className="text-xs text-neutral-500 mt-0.5 truncate">
          {progress.current + 1} of {progress.total}
          {progress.current_model ? ` · ${progress.current_model}` : ''}
        </div>
        <div className="mt-2 h-1 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-cobalt to-indigo_electric"
            animate={{ width: `${((progress.current + 1) / Math.max(progress.total, 1)) * 100}%` }}
            transition={{ type: 'spring', stiffness: 80, damping: 18 }}
          />
        </div>
      </div>
    </motion.div>
  );
}

function FeedbackModal({
  look,
  onClose,
  onSubmit,
}: {
  look: GeneratedLook;
  onClose: () => void;
  onSubmit: (feedback: string) => void;
}) {
  const [text, setText] = useState(look.feedback || '');
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bento"
      >
        <div className="flex items-center gap-2 mb-3">
          <MessageSquareMore className="w-4 h-4 text-cobalt dark:text-indigo_electric" />
          <div className="font-medium">Tell Dr. Stylist what to fix</div>
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. The tuck of the shirt is messy — keep it crisp and front-tucked."
          className="lab-input w-full h-32 resize-none"
        />
        <div className="flex items-center gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-full border border-lab-border-light dark:border-lab-border text-sm hover:bg-black/5 dark:hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={() => text.trim() && onSubmit(text.trim())}
            disabled={!text.trim()}
            className="btn-primary ml-auto disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Regenerate
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Lightbox({ look, onClose }: { look: GeneratedLook; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl p-6 grid place-items-center"
    >
      <motion.div
        initial={{ scale: 0.96 }}
        animate={{ scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-3 gap-5"
      >
        <div className="md:col-span-2 rounded-2xl overflow-hidden bg-white">
          <img src={look.image_url} alt="look" className="w-full h-full object-contain" />
        </div>
        <div className="bento space-y-3 max-h-[80vh] overflow-y-auto">
          <div>
            <div className="eyebrow">Style Context</div>
            <div className="font-display text-xl mt-0.5">{look.theme}</div>
          </div>
          <div>
            <div className="eyebrow">Stylist prompt</div>
            <p className="text-[12px] text-neutral-600 dark:text-neutral-400 mt-1 leading-relaxed">
              {look.prompt}
            </p>
          </div>
          <div>
            <div className="eyebrow mb-2">Items</div>
            <div className="grid grid-cols-2 gap-2">
              {look.item_snapshot.map((s) => (
                <div key={s.id} className="rounded-lg overflow-hidden border border-lab-border-light dark:border-lab-border bg-white">
                  <div className="aspect-square bg-white">
                    <img src={s.image} alt={s.name} className="w-full h-full object-contain p-2" />
                  </div>
                  <div className="p-2 text-[11px]">
                    <div className="text-[9px] uppercase tracking-[0.2em] text-neutral-500">{s.category}</div>
                    <div className="font-medium truncate">{s.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="btn-primary w-full justify-center">Close</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
