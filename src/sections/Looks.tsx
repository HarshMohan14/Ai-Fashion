import { motion } from 'framer-motion';
import { Shuffle, Heart, Share2 } from 'lucide-react';
import { looks } from '../data/mock';

export function Looks() {
  return (
    <div className="relative space-y-6">
      <div>
        <div className="eyebrow">Section 06 · Dr. Stylist</div>
        <h1 className="section-title mt-2">Output Gallery</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1.5 max-w-xl">
          Fully assembled looks — garment, model, and scenario composed into a single editorial frame. Use
          the Swap Tool to rotate any element without starting over.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {looks.map((l, i) => (
          <motion.article
            key={l.title}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 100, damping: 18, delay: i * 0.05 }}
            whileHover={{ y: -4 }}
            className="bento p-0 overflow-hidden group"
          >
            <div className="relative aspect-[4/5] overflow-hidden">
              <img src={l.image} alt={l.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute top-3 left-3 chip bg-white/90 text-neutral-900">
                {l.success}% Date Success
              </div>
              <div className="absolute top-3 right-3 flex gap-2">
                <button className="w-8 h-8 rounded-full grid place-items-center bg-black/40 backdrop-blur text-white"><Heart className="w-3.5 h-3.5" /></button>
                <button className="w-8 h-8 rounded-full grid place-items-center bg-black/40 backdrop-blur text-white"><Share2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="p-4">
              <div className="font-display text-xl">{l.title}</div>
              <div className="text-[12px] text-neutral-500 mt-0.5">{l.occasion}</div>
            </div>
          </motion.article>
        ))}
      </div>

      {/* Floating Swap Tool */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.06 }}
        transition={{ type: 'spring', stiffness: 160, damping: 14 }}
        className="fixed bottom-6 right-6 z-40 pl-4 pr-5 py-3.5 rounded-full bg-black text-white dark:bg-white dark:text-black shadow-glow flex items-center gap-2 text-sm font-medium"
      >
        <Shuffle className="w-4 h-4" />
        Swap Tool
      </motion.button>
    </div>
  );
}
