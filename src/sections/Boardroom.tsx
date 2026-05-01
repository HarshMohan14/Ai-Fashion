import { motion } from 'framer-motion';
import { ArrowUpRight, Sparkles, Send } from 'lucide-react';
import { doctorReports } from '../data/mock';

export function Boardroom() {
  return (
    <div className="space-y-6">
      <Header />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bento p-0 overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-lab-border-light dark:border-lab-border">
            <div>
              <div className="eyebrow">Dr. Director · Morning Standup</div>
              <div className="font-display text-2xl mt-0.5">Daily Reports</div>
            </div>
            <span className="chip">Live · 6 agents</span>
          </div>

          <div className="max-h-[560px] overflow-y-auto p-5 space-y-4">
            {doctorReports.map((d, i) => (
              <motion.div
                key={d.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 100, damping: 18, delay: i * 0.05 }}
                className="flex gap-3"
              >
                <div
                  className="w-9 h-9 rounded-full shrink-0 grid place-items-center text-white text-[11px] font-semibold"
                  style={{ background: d.color }}
                >
                  {d.name.split(' ')[1][0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{d.name}</span>
                    <span className="text-[11px] text-neutral-500">· {d.role} · {d.time}</span>
                  </div>
                  <div className="mt-1 p-3 rounded-2xl rounded-tl-sm bg-black/[0.04] dark:bg-white/[0.04] text-sm leading-relaxed">
                    {d.message}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="p-4 border-t border-lab-border-light dark:border-lab-border flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-cobalt dark:text-indigo_electric" />
            <input
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-neutral-500"
              placeholder="Ask Dr. Director — e.g. 'Summarize today in one sentence'"
            />
            <button className="btn-primary">
              <Send className="w-3.5 h-3.5" />
              Send
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <Kpi label="Garments Extracted" value="1,284" delta="+46 this week" accent />
          <Kpi label="Active Models" value="10 / 10" delta="Mumbai roster · synced" />
          <Kpi label="Date Success Rate" value="58%" delta="+6% vs last week" />
          <Kpi label="Scenarios Captured" value="142" delta="14 new backdrops" />
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-end justify-between gap-6 flex-wrap">
      <div>
        <div className="eyebrow">Section 01 · The Boardroom</div>
        <h1 className="section-title mt-2">Good morning, Director.</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1.5 max-w-xl">
          Six specialist agents have filed their morning reports. Review briefings, coordinate moves, and
          steer the day from a single cinematic hub.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button className="px-4 py-2 rounded-full border border-lab-border-light dark:border-lab-border text-sm hover:bg-black/5 dark:hover:bg-white/5">
          Export Digest
        </button>
        <button className="btn-primary">
          Open War Room <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function Kpi({ label, value, delta, accent }: { label: string; value: string; delta: string; accent?: boolean }) {
  return (
    <div className={`bento relative overflow-hidden ${accent ? 'ring-1 ring-cobalt/20 dark:ring-indigo_electric/30' : ''}`}>
      <div className="eyebrow">{label}</div>
      <div className="font-display text-4xl mt-2">{value}</div>
      <div className="mt-2 text-[12px] text-neutral-500">{delta}</div>
      {accent && (
        <div className="absolute -right-10 -bottom-10 w-32 h-32 rounded-full bg-cobalt/15 dark:bg-indigo_electric/15 blur-2xl" />
      )}
    </div>
  );
}
