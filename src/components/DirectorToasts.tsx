import { motion, AnimatePresence } from 'framer-motion';
import { X, Megaphone } from 'lucide-react';
import { useDirector } from '../context/DirectorContext';

export function DirectorToasts() {
  const { notes, dismiss } = useDirector();
  return (
    <div className="fixed bottom-6 left-6 z-40 space-y-2 max-w-sm">
      <AnimatePresence>
        {notes.map((n) => (
          <motion.div
            key={n.id}
            layout
            initial={{ opacity: 0, x: -20, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 180, damping: 22 }}
            className="bento p-4 shadow-boutique flex gap-3 items-start"
          >
            <div className="w-9 h-9 rounded-full grid place-items-center bg-cobalt text-white dark:bg-indigo_electric shrink-0">
              <Megaphone className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">{n.title}</div>
              <div className="text-sm mt-0.5 leading-snug">{n.body}</div>
            </div>
            <button
              onClick={() => dismiss(n.id)}
              className="w-7 h-7 rounded-full grid place-items-center text-neutral-500 hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
