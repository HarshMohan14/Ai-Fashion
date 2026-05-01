import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Shirt, FlaskConical, Users, Camera, Sparkles,
  BarChart3, Moon, Sun, Bell, Search, FlaskRound, Scissors
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export type SectionKey =
  | 'boardroom' | 'wardrobe' | 'lab' | 'models' | 'scenarios' | 'runway' | 'looks' | 'analytics';

const nav: { key: SectionKey; label: string; icon: typeof LayoutDashboard; doctor: string }[] = [
  { key: 'boardroom', label: 'The Boardroom', icon: LayoutDashboard, doctor: 'Dr. Director' },
  { key: 'wardrobe', label: 'Digital Wardrobe', icon: Shirt, doctor: 'Dr. Shopkeeper' },
  { key: 'lab', label: 'Extraction Lab', icon: FlaskConical, doctor: 'Dr. Scientist' },
  { key: 'models', label: 'Model Hub', icon: Users, doctor: 'Dr. Body' },
  { key: 'scenarios', label: 'Scenario Hub', icon: Camera, doctor: 'Dr. Photographer' },
  { key: 'runway', label: 'Runway', icon: Scissors, doctor: 'Dr. Stylist' },
  { key: 'looks', label: 'Output Gallery', icon: Sparkles, doctor: 'Dr. Stylist' },
  { key: 'analytics', label: 'DFB Analytics', icon: BarChart3, doctor: 'Dr. Analytics' },
];

export function Shell({
  current, onChange, children,
}: {
  current: SectionKey;
  onChange: (k: SectionKey) => void;
  children: ReactNode;
}) {
  const { theme, toggle } = useTheme();

  return (
    <div className="h-screen overflow-hidden font-sans text-neutral-900 dark:text-neutral-100 bg-alabaster dark:bg-obsidian relative">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 opacity-60 dark:opacity-100 z-0">
        <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full blur-3xl dark:bg-[#5B5BF6]/10 bg-[#1E40AF]/5" />
        <div className="absolute top-1/3 -right-32 w-[420px] h-[420px] rounded-full blur-3xl dark:bg-[#6B1E2B]/10 bg-[#6B1E2B]/5" />
        <div className="absolute inset-0 bg-grid-light dark:bg-grid-dark [background-size:28px_28px]" />
      </div>

      <div className="relative z-10 flex h-screen">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen px-5 py-7 border-r border-lab-border-light dark:border-lab-border bg-alabaster/80 dark:bg-obsidian/80 backdrop-blur-xl">
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-9 h-9 rounded-xl grid place-items-center bg-black text-white dark:bg-white dark:text-black">
              <FlaskRound className="w-4 h-4" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-[17px]">The Fashion Lab</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">Admin Console</div>
            </div>
          </div>

          <div className="eyebrow mb-3 px-2">Departments</div>
          <nav className="space-y-1">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = current === n.key;
              return (
                <button
                  key={n.key}
                  onClick={() => onChange(n.key)}
                  className="w-full relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm group"
                >
                  {active && (
                    <motion.div
                      layoutId="nav-pill"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      className="absolute inset-0 rounded-xl bg-black/[0.06] dark:bg-white/[0.06] border border-black/5 dark:border-white/10"
                    />
                  )}
                  <Icon className={`w-4 h-4 relative z-10 ${active ? 'text-cobalt dark:text-indigo_electric' : 'text-neutral-500 group-hover:text-neutral-800 dark:group-hover:text-neutral-200'}`} />
                  <div className="relative z-10 flex-1 text-left">
                    <div className={`font-medium ${active ? 'text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-300'}`}>
                      {n.label}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">{n.doctor}</div>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto pt-6">
            <div className="glass-card p-4">
              <div className="eyebrow mb-1">Lab Status</div>
              <div className="flex items-center gap-2 text-sm">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                All six doctors online
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0 flex flex-col h-screen">
          {/* Topbar */}
          <header className="shrink-0 z-30 backdrop-blur-xl bg-alabaster/80 dark:bg-obsidian/80 border-b border-lab-border-light dark:border-lab-border">
            <div className="px-5 md:px-8 h-16 flex items-center gap-4">
              <div className="flex items-center gap-2 lg:hidden">
                <div className="w-8 h-8 rounded-lg grid place-items-center bg-black text-white dark:bg-white dark:text-black">
                  <FlaskRound className="w-4 h-4" />
                </div>
                <span className="font-display text-lg">The Fashion Lab</span>
              </div>
              <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-full border border-lab-border-light dark:border-lab-border bg-white/50 dark:bg-white/[0.03] max-w-md w-full">
                <Search className="w-4 h-4 text-neutral-500" />
                <input
                  className="bg-transparent outline-none text-sm flex-1 placeholder:text-neutral-500"
                  placeholder="Search garments, models, scenarios…"
                />
                <span className="chip">Cmd K</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button className="w-10 h-10 rounded-full grid place-items-center border border-lab-border-light dark:border-lab-border hover:bg-black/5 dark:hover:bg-white/5">
                  <Bell className="w-4 h-4" />
                </button>

                <ThemeToggle theme={theme} toggle={toggle} />

                <div className="flex items-center gap-3 pl-2 pr-3 py-1.5 rounded-full border border-lab-border-light dark:border-lab-border">
                  <img
                    src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=80"
                    className="w-7 h-7 rounded-full object-cover"
                    alt="admin"
                  />
                  <div className="hidden sm:block leading-tight">
                    <div className="text-xs font-medium">Dr. Director</div>
                    <div className="text-[10px] text-neutral-500">Admin</div>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto custom-scroll">
            <AnimatePresence mode="wait">
              <motion.main
                key={current}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ type: 'spring', stiffness: 100, damping: 18 }}
                className="p-5 md:p-8 max-w-[1500px]"
              >
                {children}
              </motion.main>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeToggle({ theme, toggle }: { theme: 'dark' | 'light'; toggle: () => void }) {
  const isDark = theme === 'dark';
  return (
    <button
      onClick={toggle}
      className="relative w-16 h-9 rounded-full border border-lab-border-light dark:border-lab-border bg-white/60 dark:bg-white/[0.04] flex items-center px-1"
      aria-label="Toggle theme"
    >
      <motion.div
        className="absolute top-1 left-1 w-7 h-7 rounded-full bg-black text-white dark:bg-white dark:text-black grid place-items-center shadow-md"
        animate={{ x: isDark ? 28 : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      >
        {isDark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
      </motion.div>
      <div className="flex-1 flex justify-between px-2 text-[10px] uppercase tracking-widest text-neutral-500">
        <span className={!isDark ? 'opacity-0' : ''}>Sun</span>
        <span className={isDark ? 'opacity-0' : ''}>Moon</span>
      </div>
    </button>
  );
}
