import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts';
import { dfbTrend, categoryPerf } from '../data/mock';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';

type DateOrDumpDashboard = {
  sessions: number;
  duels: number;
  completionRate: number;
  avgResponseMs: number;
  geminiResults: number;
  topWinners: Array<{ id: string; imageUrl: string; title: string; model: string; score: number; count: number }>;
  topLosers: Array<{ id: string; imageUrl: string; title: string; model: string; count: number }>;
};

type RunwayAnalyticsLook = {
  id: string;
  image_url?: string | null;
  theme?: string | null;
  model_id?: string | null;
  date_count?: number | null;
  dump_count?: number | null;
  style_quotient_score?: number | null;
  item_snapshot?: Array<{ name?: string; category?: string }> | null;
};

export function Analytics() {
  const { theme } = useTheme();
  const grid = theme === 'dark' ? '#1F1F1F' : '#F1F1F1';
  const axis = theme === 'dark' ? '#888' : '#666';
  const [gameDashboard, setGameDashboard] = useState<DateOrDumpDashboard | null>(null);
  const [gameReady, setGameReady] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadDateOrDumpAnalytics() {
      const [sessionsResult, duelsResult, looksResult, modelsResult] = await Promise.all([
        supabase
          .from('date_or_dump_sessions')
          .select('id,total_duels,completed_duels,completed_at,gemini_used'),
        supabase
          .from('date_or_dump_duels')
          .select('id,winner_look_id,loser_look_id,response_ms'),
        supabase
          .from('runway_looks')
          .select('id,image_url,theme,model_id,item_snapshot,date_count,dump_count,style_quotient_score'),
        supabase
          .from('models_public')
          .select('id,nickname'),
      ]);

      const error = sessionsResult.error || duelsResult.error || looksResult.error || modelsResult.error;
      if (error) {
        if (isMissingDateOrDumpAnalytics(error)) {
          if (active) setGameReady(false);
          return;
        }
        throw error;
      }

      const sessions = sessionsResult.data ?? [];
      const duels = duelsResult.data ?? [];
      const looks = (looksResult.data ?? []) as RunwayAnalyticsLook[];
      const modelsById = new Map((modelsResult.data ?? []).map((model) => [model.id, model.nickname]));
      const responseTimes = duels.map((duel) => Number(duel.response_ms ?? 0)).filter((value) => value > 0);
      const completedSessions = sessions.filter((session) => session.completed_at).length;

      const dashboard: DateOrDumpDashboard = {
        sessions: sessions.length,
        duels: duels.length,
        completionRate: sessions.length ? Math.round((completedSessions / sessions.length) * 100) : 0,
        avgResponseMs: responseTimes.length
          ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
          : 0,
        geminiResults: sessions.filter((session) => session.gemini_used).length,
        topWinners: looks
          .filter((look) => Number(look.date_count ?? 0) > 0)
          .sort((a, b) => Number(b.date_count ?? 0) - Number(a.date_count ?? 0))
          .slice(0, 5)
          .map((look) => ({
            id: look.id,
            imageUrl: look.image_url ?? '',
            title: analyticsLookTitle(look),
            model: modelsById.get(look.model_id ?? '') ?? 'Model',
            score: Number(look.style_quotient_score ?? 0),
            count: Number(look.date_count ?? 0),
          })),
        topLosers: looks
          .filter((look) => Number(look.dump_count ?? 0) > 0)
          .sort((a, b) => Number(b.dump_count ?? 0) - Number(a.dump_count ?? 0))
          .slice(0, 5)
          .map((look) => ({
            id: look.id,
            imageUrl: look.image_url ?? '',
            title: analyticsLookTitle(look),
            model: modelsById.get(look.model_id ?? '') ?? 'Model',
            count: Number(look.dump_count ?? 0),
          })),
      };

      if (active) {
        setGameDashboard(dashboard);
        setGameReady(true);
      }
    }

    loadDateOrDumpAnalytics().catch((error) => {
      console.warn('[Analytics] Could not load Date or Dump analytics:', error);
      if (active) setGameReady(false);
    });

    return () => { active = false; };
  }, []);

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

      <div className="bento">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="eyebrow">Date or Dump Game</div>
            <div className="font-display text-2xl mt-0.5">Pairwise fashion chemistry</div>
            <div className="text-sm text-neutral-500 mt-1">
              Winners, dumped looks, completion, and decision speed from /game.
            </div>
          </div>
          {!gameReady && (
            <span className="chip bg-amber-500/10 text-amber-700 dark:text-amber-300">
              Run pairwise game migration
            </span>
          )}
        </div>

        {gameDashboard ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-5">
              <MiniStat label="Sessions" value={`${gameDashboard.sessions}`} />
              <MiniStat label="Duels" value={`${gameDashboard.duels}`} />
              <MiniStat label="Completion" value={`${gameDashboard.completionRate}%`} />
              <MiniStat label="Avg Pick" value={`${(gameDashboard.avgResponseMs / 1000).toFixed(1)}s`} />
              <MiniStat label="Gemini" value={`${gameDashboard.geminiResults}`} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <div>
                <div className="eyebrow mb-3">Most picked looks</div>
                <div className="space-y-3">
                  {gameDashboard.topWinners.length > 0 ? gameDashboard.topWinners.map((look) => (
                    <AnalyticsLookRow
                      key={look.id}
                      imageUrl={look.imageUrl}
                      title={look.title}
                      meta={`${look.model} - ${look.count} wins`}
                      value={`${look.score}%`}
                    />
                  )) : <EmptyMetric />}
                </div>
              </div>

              <div>
                <div className="eyebrow mb-3">Most dumped looks</div>
                <div className="space-y-3">
                  {gameDashboard.topLosers.length > 0 ? gameDashboard.topLosers.map((look) => (
                    <AnalyticsLookRow
                      key={look.id}
                      imageUrl={look.imageUrl}
                      title={look.title}
                      meta={`${look.model} - ${look.count} losses`}
                      value="Dump"
                    />
                  )) : <EmptyMetric />}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm text-neutral-500 mt-5">
            Date or Dump analytics will appear after players complete pairwise duels.
          </div>
        )}
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-lab-border-light dark:border-lab-border p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">{label}</div>
      <div className="font-display text-2xl mt-1">{value}</div>
    </div>
  );
}

function AnalyticsLookRow({
  imageUrl,
  title,
  meta,
  value,
}: {
  imageUrl: string;
  title: string;
  meta: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="w-12 h-14 rounded-md object-cover bg-neutral-100 dark:bg-neutral-900"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-[11px] text-neutral-500 truncate">{meta}</div>
      </div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function EmptyMetric() {
  return <div className="text-sm text-neutral-500">No game data yet.</div>;
}

function analyticsLookTitle(look: RunwayAnalyticsLook) {
  const itemNames = (look.item_snapshot ?? [])
    .map((item) => item.name?.trim() || item.category?.trim())
    .filter(Boolean)
    .slice(0, 4);
  return itemNames.length ? itemNames.join(' + ') : look.theme || 'Wardrobe look';
}

function isMissingDateOrDumpAnalytics(error: unknown) {
  const err = error as { code?: string; message?: string };
  const message = err?.message ?? String(error);
  return err?.code === 'PGRST205'
    || err?.code === '42P01'
    || /date_or_dump_sessions|date_or_dump_duels|date_count|dump_count|style_quotient/i.test(message);
}
