import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Layers, Zap, CheckCircle2, FlaskConical, Wand2, Trash2, RefreshCw, Sparkles, PackageCheck, ShieldCheck, ChevronRight, RotateCcw, Package
} from 'lucide-react';
import { hasGeminiKey, type ExtractedItem } from '../lib/drScientist';
import { useExtractionQueue } from '../context/ExtractionQueueContext';
import { LabItem } from '../lib/extractionUtils';

const BLUEPRINT = '#22D3EE';
type Stage = 'idle' | 'scanning' | 'review' | 'rerender' | 'verify' | 'packaging' | 'done';

export function ExtractionLab() {
  const { jobs, addJob, updateJobItem, removeJobItem, startRendering, dismissJob, dispatchItem, regenerateItem } = useExtractionQueue();
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refineMode, setRefineMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeJob = jobs.find((j) => j.id === activeJobId);
  const stage: Stage = !activeJob ? 'idle' :
    activeJob.status === 'scanning' ? 'scanning' :
    activeJob.status === 'review_pending' ? 'review' :
    activeJob.status === 'rendering' ? 'rerender' :
    activeJob.status === 'verify_pending' ? 'verify' :
    activeJob.status === 'dispatched' ? 'done' : 'idle';
  const imageSrc = activeJob?.originalImageSrc || null;
  const items = activeJob?.items || [];

  const handleFiles = (file: File) => {
    addJob(file);
    setActiveJobId(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFiles(f);
  };

  const reset = () => {
    setActiveJobId(null);
    setSelectedId(null);
    setRefineMode(false);
  };

  const removeItem = (id: string) => {
    if (activeJob) removeJobItem(activeJob.id, id);
    if (selectedId === id) setSelectedId(null);
  };

  const updateItem = (id: string, patch: Partial<LabItem>) => {
    if (activeJob) updateJobItem(activeJob.id, id, patch);
  };

  const runReRenderPhase = () => {
    if (activeJob) {
      startRendering(activeJob.id);
      setActiveJobId(null); // Return to dashboard
    }
  };

  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="eyebrow">Section 03 · Dr. Scientist</div>
          <h1 className="section-title mt-2">Extraction Lab</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1.5 max-w-xl">
            Drop a full-outfit photo. Dr. Scientist deconstructs it. Nano Banana extracts it in the background.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`chip ${hasGeminiKey() ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>
            <FlaskConical className="w-3 h-3" />
            {hasGeminiKey() ? 'Gemini · Flash · Online' : 'Mock Mode'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bento relative overflow-hidden">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFiles(f);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />

          <div
            onClick={() => !activeJobId && fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className={`relative rounded-xl border-2 ${
              !activeJobId
                ? 'border-dashed border-lab-border-light dark:border-lab-border cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition'
                : 'border-solid border-transparent'
            } h-[520px] grid place-items-center text-center overflow-hidden bg-black/[0.02] dark:bg-white/[0.02]`}
          >
            {imageSrc && (
              <img src={imageSrc} alt="subject" className="absolute inset-0 w-full h-full object-contain" crossOrigin="anonymous" />
            )}

            {(stage === 'verify' || stage === 'done') && selected && (
              <VerifyCompare item={selected} />
            )}

            {imageSrc && stage === 'review' && (
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                {items.map((it) => {
                  const active = selectedId === it.id;
                  return (
                    <g key={it.id} onClick={(e) => { e.stopPropagation(); setSelectedId(it.id); }} style={{ cursor: 'pointer' }}>
                      <rect
                        x={it.box.x * 100}
                        y={it.box.y * 100}
                        width={it.box.width * 100}
                        height={it.box.height * 100}
                        fill={active ? 'rgba(34,211,238,0.14)' : 'rgba(34,211,238,0.06)'}
                        stroke={BLUEPRINT}
                        strokeWidth={active ? 0.4 : 0.22}
                        strokeDasharray={active ? '0' : '0.9 0.6'}
                      />
                      <rect
                        x={it.box.x * 100}
                        y={Math.max(0, it.box.y * 100 - 3.2)}
                        width={Math.min(40, it.name.length * 0.9 + 3)}
                        height={3}
                        fill={BLUEPRINT}
                        opacity={0.92}
                      />
                      <text
                        x={it.box.x * 100 + 0.6}
                        y={Math.max(0, it.box.y * 100 - 0.9)}
                        fill="#001018"
                        fontSize="1.5"
                        fontFamily="Inter, sans-serif"
                        fontWeight="600"
                      >
                        {it.name.slice(0, 28)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}

            {!activeJobId && (
              <div>
                <div className="w-16 h-16 rounded-2xl bg-white dark:bg-white/10 grid place-items-center mx-auto mb-4 shadow-boutique">
                  <Upload className="w-6 h-6 text-cobalt dark:text-indigo_electric" />
                </div>
                <div className="font-display text-2xl">Drop an outfit photo</div>
                <div className="text-sm text-neutral-500 mt-2">
                  or click to upload · Queue multiple images at once
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  className="btn-primary mt-5"
                >
                  <Zap className="w-3.5 h-3.5" /> Upload outfit
                </button>
              </div>
            )}
          </div>

          {activeJob && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setRefineMode((r) => !r)}
                className={`chip cursor-pointer ${refineMode ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300' : ''}`}
              >
                <Wand2 className="w-3 h-3" /> {refineMode ? 'Refining…' : 'Manual refine'}
              </button>
              <span className="chip">
                {items.length} item{items.length === 1 ? '' : 's'} detected
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={reset} className="chip cursor-pointer">
                  <RefreshCw className="w-3 h-3" /> Back to Queue
                </button>
                {stage === 'review' && items.length > 0 && (
                  <button onClick={runReRenderPhase} className="btn-primary">
                    Extract & Render <Sparkles className="w-3.5 h-3.5" />
                  </button>
                )}
                {stage === 'verify' && (
                  <button onClick={() => { dismissJob(activeJob.id); reset(); }} className="btn-primary bg-emerald-500 hover:bg-emerald-600 border-emerald-500 text-white">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Finish & Close
                  </button>
                )}
              </div>
            </div>
          )}

          {refineMode && selected && stage === 'review' && (
            <RefinePanel item={selected} onChange={(box) => updateItem(selected.id, { box })} />
          )}
        </div>

        <div className="space-y-4">
          {!activeJobId ? (
            <div className="space-y-6">
              <div className="bento min-h-[200px]">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="w-4 h-4 text-cobalt dark:text-indigo_electric" />
                  <div className="font-medium">Detected (Awaiting Render)</div>
                </div>
                {jobs.filter(j => ['scanning', 'review_pending'].includes(j.status)).length === 0 ? (
                  <div className="text-sm text-neutral-500">No items detected yet.</div>
                ) : (
                  <div className="space-y-2">
                    {jobs.filter(j => ['scanning', 'review_pending'].includes(j.status)).map((job) => (
                      <div key={job.id} className="flex items-center justify-between p-3 border border-lab-border-light dark:border-lab-border rounded-xl">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
                             <img src={job.originalImageSrc} className="w-full h-full object-cover" alt="" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{job.progressMessage}</div>
                            <div className="text-xs text-neutral-500 capitalize">{job.status.replace('_', ' ')}</div>
                          </div>
                        </div>
                        {job.status === 'review_pending' && (
                          <button onClick={() => setActiveJobId(job.id)} className="btn-secondary text-xs px-3 py-1.5">
                            Review <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bento min-h-[200px]">
                <div className="flex items-center gap-2 mb-3">
                  <PackageCheck className="w-4 h-4 text-emerald-500" />
                  <div className="font-medium">Rendered (Awaiting Approval)</div>
                </div>
                {jobs.filter(j => ['rendering', 'verify_pending'].includes(j.status)).length === 0 ? (
                  <div className="text-sm text-neutral-500">No items ready for approval.</div>
                ) : (
                  <div className="space-y-2">
                    {jobs.filter(j => ['rendering', 'verify_pending'].includes(j.status)).map((job) => (
                      <div key={job.id} className="flex items-center justify-between p-3 border border-lab-border-light dark:border-lab-border rounded-xl">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
                             <img src={job.originalImageSrc} className="w-full h-full object-cover" alt="" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{job.progressMessage}</div>
                            <div className="text-xs text-neutral-500 capitalize">{job.status.replace('_', ' ')}</div>
                          </div>
                        </div>
                        {job.status === 'verify_pending' && (
                          <button onClick={() => { setActiveJobId(job.id); setSelectedId(job.items[0]?.id || null); }} className="btn-primary text-xs px-3 py-1.5">
                            Verify <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : activeJob ? (
            <>
              {selected && (stage === 'verify' || stage === 'done') && (
                <VerifyCard
                  item={selected}
                  onApprove={() => dispatchItem(activeJob.id, selected.id)}
                  onRegenerate={() => regenerateItem(activeJob.id, selected.id)}
                />
              )}
              <div className="bento">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="w-4 h-4 text-cobalt dark:text-indigo_electric" />
                  <div className="font-medium">Children</div>
                </div>
                <div className="space-y-2 max-h-[360px] overflow-y-auto custom-scroll pr-1">
                  <AnimatePresence>
                    {items.map((it) => (
                      <motion.div
                        key={it.id}
                        layout
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(it.id)}
                        className={`w-full flex items-center gap-3 p-2 rounded-xl border text-left transition ${
                          selectedId === it.id
                            ? 'border-cyan-400/60 bg-cyan-500/5'
                            : 'border-lab-border-light dark:border-lab-border hover:bg-black/[0.03] dark:hover:bg-white/[0.03]'
                        }`}
                      >
                        <div className="w-12 h-12 rounded-lg border border-lab-border-light dark:border-lab-border overflow-hidden shrink-0">
                          {(it.renderedDataUrl || it.cropDataUrl) && (
                            <img src={it.renderedDataUrl || it.cropDataUrl} alt={it.name} className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{it.name}</div>
                          <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500 truncate">
                            {it.targetCategory ? `${it.targetCategory} · ${it.targetSubcategory}` : it.category}
                          </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); removeItem(it.id); }} className="w-7 h-7 rounded-lg grid place-items-center text-neutral-400 hover:text-rose-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}


function VerifyCompare({ item }: { item: LabItem }) {
  return (
    <div className="relative w-full h-full grid grid-cols-2">
      <div
        className="relative overflow-hidden"
        style={{
          backgroundImage:
            'linear-gradient(45deg, rgba(0,0,0,0.04) 25%, transparent 25%), linear-gradient(-45deg, rgba(0,0,0,0.04) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.04) 75%), linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.04) 75%)',
          backgroundSize: '14px 14px',
          backgroundPosition: '0 0, 0 7px, 7px -7px, -7px 0',
        }}
      >
        {item.cropDataUrl && (
          <img src={item.cropDataUrl} alt="raw" className="absolute inset-0 w-full h-full object-contain p-6" />
        )}
        <div className="absolute top-3 left-3 chip bg-black/60 text-white border-transparent">Raw crop</div>
      </div>
      <div className="relative overflow-hidden bg-white">
        {item.renderedDataUrl ? (
          <img src={item.renderedDataUrl} alt="rendered" className="absolute inset-0 w-full h-full object-contain p-6" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-sm text-neutral-500">
            Rendering…
          </div>
        )}
        <div className="absolute top-3 left-3 chip bg-emerald-500 text-white border-transparent">
          <Sparkles className="w-3 h-3" /> AI re-rendered
        </div>
      </div>
      <div className="absolute inset-y-8 left-1/2 w-px bg-neutral-300/60 dark:bg-white/15" />
    </div>
  );
}

function VerifyCard({
  item,
  onApprove,
  onRegenerate,
}: {
  item: LabItem;
  onApprove: () => void;
  onRegenerate: () => void;
}) {
  return (
    <div className="bento">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4 text-emerald-500" />
        <div className="font-medium">Verify & Sanitize</div>
        {item.dispatched && (
          <span className="chip ml-auto bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <PackageCheck className="w-3 h-3" /> Dispatched
          </span>
        )}
      </div>
      <div className="text-sm">
        <div className="font-medium">{item.name}</div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500 mt-0.5">
          {item.targetCategory} · {item.targetSubcategory}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <span className="chip">
          <span className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ background: item.color }} />
          {item.color}
        </span>
        <span className="chip">Fabric · {item.fabric}</span>
        <span className="chip">Fit · {item.fit}</span>
        {item.renderModel && <span className="chip">Renderer · {item.renderModel}</span>}
      </div>
      <div className="text-xs text-neutral-500 mt-3">
        Confirm the AI didn't hallucinate the design. Regenerate if the silhouette or color drifted; approve to
        hand over to Dr. Shopkeeper.
      </div>
      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={onRegenerate}
          disabled={item.dispatched}
          className="chip cursor-pointer disabled:opacity-40"
        >
          <RotateCcw className="w-3 h-3" /> Regenerate
        </button>
        <button
          onClick={onApprove}
          disabled={!item.renderedDataUrl || item.dispatched}
          className="btn-primary ml-auto disabled:opacity-40"
        >
          <Package className="w-3.5 h-3.5" />
          {item.dispatched ? 'Sent' : 'Approve & Send'}
        </button>
      </div>
    </div>
  );
}

function RefinePanel({
  item,
  onChange,
}: {
  item: ExtractedItem;
  onChange: (box: ExtractedItem['box']) => void;
}) {
  const field = (key: keyof ExtractedItem['box'], label: string) => (
    <div className="flex items-center gap-2 text-xs">
      <label className="w-14 text-neutral-500">{label}</label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={item.box[key]}
        onChange={(e) => onChange({ ...item.box, [key]: parseFloat(e.target.value) })}
        className="flex-1 accent-cyan-500"
      />
      <span className="w-10 tabular-nums text-neutral-600 dark:text-neutral-300">
        {(item.box[key] * 100).toFixed(0)}%
      </span>
    </div>
  );
  return (
    <div className="mt-3 p-3 rounded-xl border border-cyan-400/40 bg-cyan-500/[0.04] space-y-2">
      <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300 font-semibold">
        Refining · {item.name}
      </div>
      {field('x', 'X')}
      {field('y', 'Y')}
      {field('width', 'Width')}
      {field('height', 'Height')}
    </div>
  );
}
