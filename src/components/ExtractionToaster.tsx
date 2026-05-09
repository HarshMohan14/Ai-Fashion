import { motion, AnimatePresence } from 'framer-motion';
import { useExtractionQueue } from '../context/ExtractionQueueContext';
import { Loader2, PackageCheck, AlertCircle } from 'lucide-react';

export function ExtractionToaster() {
  const { jobs, dismissJob } = useExtractionQueue();

  if (jobs.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {jobs.map((job) => {
          const isScanning = job.status === 'scanning';
          const isRendering = job.status === 'rendering';
          const isDone = job.status === 'dispatched';
          const isFailed = job.status === 'failed';
          const isPending = job.status === 'review_pending';

          if (isPending) return null; // handled in Extraction Lab UI

          return (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="pointer-events-auto min-w-[300px] bento flex items-center gap-3 shadow-boutique bg-white/95 dark:bg-obsidian/95 backdrop-blur-xl border border-lab-border-light dark:border-lab-border p-3 rounded-2xl"
            >
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-black/5 dark:bg-white/5 shrink-0">
                <img src={job.originalImageSrc} className="w-full h-full object-cover" alt="job" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium flex items-center gap-2">
                  {(isScanning || isRendering) && <Loader2 className="w-3.5 h-3.5 animate-spin text-cobalt dark:text-indigo_electric" />}
                  {isDone && <PackageCheck className="w-3.5 h-3.5 text-emerald-500" />}
                  {isFailed && <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
                  <span className="truncate">
                    {isScanning ? 'Scanning...' : isRendering ? 'Extracting & Rendering...' : isDone ? 'Done' : 'Failed'}
                  </span>
                </div>
                <div className="text-[11px] text-neutral-500 truncate mt-0.5">{job.progressMessage}</div>
              </div>
              {(isDone || isFailed) && (
                <button
                  onClick={() => dismissJob(job.id)}
                  className="w-6 h-6 rounded-full hover:bg-black/5 dark:hover:bg-white/5 grid place-items-center text-neutral-400"
                >
                  &times;
                </button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
