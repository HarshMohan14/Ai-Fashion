import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts';
import { dfbTrend, categoryPerf } from '../data/mock';
import { useTheme } from '../context/ThemeContext';

export function Analytics() {
  const { theme } = useTheme();
  const grid = theme === 'dark' ? '#1F1F1F' : '#F1F1F1';
  const axis = theme === 'dark' ? '#888' : '#666';

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">Section 07 · Dr. Analytics</div>
        <h1 className="section-title mt-2">DFB Analytics</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1.5 max-w-xl">
          Date · Friendzone · Block — the only three signals that matter. Track how every outfit, model, and
          scenario shifts the ratio week over week.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bento">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="eyebrow">Weekly DFB Trend</div>
              <div className="font-display text-2xl mt-0.5">Date is winning the week</div>
            </div>
            <div className="flex gap-2 text-[11px]">
              <LegendDot color="#10B981" label="Date" />
              <LegendDot color="#1E40AF" label="Friendzone" />
              <LegendDot color="#6B1E2B" label="Block" />
            </div>
          </div>

          <div className="h-80">
            <ResponsiveContainer>
              <AreaChart data={dfbTrend}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1E40AF" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#1E40AF" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6B1E2B" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#6B1E2B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="day" stroke={axis} tickLine={false} axisLine={false} />
                <YAxis stroke={axis} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: theme === 'dark' ? '#0F0F0F' : '#fff',
                    border: `1px solid ${grid}`,
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="Date" stroke="#10B981" strokeWidth={2} fill="url(#g1)" />
                <Area type="monotone" dataKey="Friendzone" stroke="#1E40AF" strokeWidth={2} fill="url(#g2)" />
                <Area type="monotone" dataKey="Block" stroke="#6B1E2B" strokeWidth={2} fill="url(#g3)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bento">
          <div className="eyebrow">Category Success</div>
          <div className="font-display text-2xl mt-0.5 mb-3">Indian Wear leads</div>
          <div className="h-72">
            <ResponsiveContainer>
              <RadialBarChart
                innerRadius="30%"
                outerRadius="95%"
                data={categoryPerf.map((c, i) => ({
                  ...c,
                  fill: ['#10B981', '#1E40AF', '#5B5BF6', '#B45309', '#6B1E2B'][i],
                }))}
                startAngle={90}
                endAngle={-270}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar background dataKey="score" cornerRadius={8} />
                <Tooltip
                  contentStyle={{
                    background: theme === 'dark' ? '#0F0F0F' : '#fff',
                    border: `1px solid ${grid}`,
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {categoryPerf.map((c, i) => (
              <div key={c.category} className="flex items-center gap-2 text-[12px]">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: ['#10B981', '#1E40AF', '#5B5BF6', '#B45309', '#6B1E2B'][i] }}
                />
                <span className="flex-1 truncate">{c.category}</span>
                <span className="text-neutral-500">{c.score}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Stat label="Avg. Date Score" value="91" delta="+4 this week" />
        <Stat label="Friendzone Rate" value="29%" delta="-4 vs last week" />
        <Stat label="Block Rate" value="13%" delta="-2 vs last week" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      <span className="text-neutral-500">{label}</span>
    </div>
  );
}

function Stat({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="bento">
      <div className="eyebrow">{label}</div>
      <div className="font-display text-4xl mt-1">{value}</div>
      <div className="text-[12px] text-neutral-500 mt-1">{delta}</div>
    </div>
  );
}
