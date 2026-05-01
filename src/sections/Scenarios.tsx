import { motion } from 'framer-motion';
import { scenarios } from '../data/mock';
import { MapPin, Camera } from 'lucide-react';

export function Scenarios() {
  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">Section 05 · Dr. Photographer</div>
        <h1 className="section-title mt-2">Scenario Hub</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1.5 max-w-xl">
          The cinematic backdrops of Mumbai — from Marine Drive at dusk to rooftop cocktails at Lower Parel.
          Select a scene to anchor every generated look.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {scenarios.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 100, damping: 18, delay: i * 0.05 }}
            whileHover={{ y: -4 }}
            className="group relative aspect-[4/3] rounded-2xl overflow-hidden border border-lab-border-light dark:border-lab-border"
          >
            <img src={s.image} alt={s.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            <div className="absolute top-3 left-3 chip bg-white/90 text-neutral-900">{s.tag}</div>
            <div className="absolute bottom-4 left-4 right-4 text-white">
              <div className="font-display text-2xl">{s.title}</div>
              <div className="flex items-center gap-3 mt-1 text-[12px] text-white/85">
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Mumbai</span>
                <span className="flex items-center gap-1"><Camera className="w-3 h-3" /> 35mm · f/1.8</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
