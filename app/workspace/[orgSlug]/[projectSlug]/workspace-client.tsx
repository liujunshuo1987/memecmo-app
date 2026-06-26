'use client';

// Manus-style two-panel workspace:
//   Left  — chat / command bar
//   Right — agent activity stream + run history
//
// v0.5 supports 3 agents: discovery | monitor | report
// Sending a chat with /discovery (or default to discovery on first message)
// spawns a run; the activity panel subscribes to its SSE stream.

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AGENTS } from '@/lib/agents/registry';
import type { AgentRun, Organization, Project } from '@/lib/workspace';

interface Props {
  project: Project;
  organization: Organization;
  initialRuns: AgentRun[];
}

interface ActivityEvent {
  id: string;
  agent_run_id: string;
  ts: string;
  event_type: string;
  payload: Record<string, unknown>;
}

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agentId?: string;
  runId?: string;
  ts: string;
}

const COUNTRY_FLAG: Record<string, string> = {
  Vietnam: '🇻🇳',
  Thailand: '🇹🇭',
  Indonesia: '🇮🇩',
  Philippines: '🇵🇭',
  Singapore: '🇸🇬',
  Malaysia: '🇲🇾',
};

// Outcome-first deliverable groups. Each item maps to an agent; cards show the
// latest completed run of that agent (view it) or offer to run it.
const DELIVERABLE_GROUPS: { label: string; items: string[] }[] = [
  { label: 'Setup', items: ['profile', 'discovery'] },
  { label: 'Measure', items: ['monitor', 'report'] },
  { label: 'Act — build AEO presence', items: ['site', 'optimize', 'distribute', 'encyclopedia'] },
];

type LatestRun = { runId: string; summary: string | null; status: string; output: any; createdAt: string };

export default function WorkspaceClient({ project, organization, initialRuns }: Props) {
  const [runsByAgent, setRunsByAgent] = useState<Record<string, LatestRun>>(() => {
    const m: Record<string, LatestRun> = {};
    for (const r of initialRuns) {
      // initialRuns is newest-first; keep the first (latest) completed per agent.
      if (r.status === 'completed' && !m[r.agent_id]) {
        m[r.agent_id] = { runId: r.id, summary: r.summary, status: r.status, output: r.output, createdAt: r.created_at };
      }
    }
    return m;
  });
  const [intent, setIntent] = useState('');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [runStatus, setRunStatus] = useState<{
    status: string;
    progress_pct: number;
    summary: string | null;
    agentId?: string;
    output?: Record<string, any> | null;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const activityEndRef = useRef<HTMLDivElement>(null);
  const resultTopRef = useRef<HTMLDivElement>(null);
  const freshRunRef = useRef(false);

  const isTerminal = !!runStatus && ['completed', 'failed', 'canceled'].includes(runStatus.status);

  // Headline AIGVR — from the most recent monitor / full_scan run.
  const scoreRun = [runsByAgent['monitor'], runsByAgent['full_scan']]
    .filter((r) => r && r.output?.aigvrScore != null)
    .sort((a, b) => (b!.createdAt || '').localeCompare(a!.createdAt || ''))[0];
  const headlineAigvr: number | null = scoreRun?.output?.aigvrScore ?? null;

  // While running, follow the live stream to the bottom. Once terminal, stop
  // chasing the log — we converge to the deliverable instead.
  useEffect(() => {
    if (!isTerminal) activityEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activity, runStatus, isTerminal]);

  // On completion, scroll the result modules into view (deliverable-first).
  useEffect(() => {
    if (isTerminal && runStatus?.output) {
      resultTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isTerminal, runStatus?.output]);

  // Poll the read-only run observer while a run is active. Execution happens
  // in Inngest (server-side, durable) — this only reads status + new events.
  useEffect(() => {
    if (!activeRunId) return;
    let cancelled = false;
    let cursor = '1970-01-01T00:00:00Z';
    const seen = new Set<string>();

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/workspace/agent-runs/${activeRunId}?since=${encodeURIComponent(cursor)}`,
          { cache: 'no-store' },
        );
        if (res.ok) {
          const data = await res.json();
          if (data.events?.length) {
            const fresh = (data.events as ActivityEvent[]).filter((e) => !seen.has(e.id));
            fresh.forEach((e) => seen.add(e.id));
            if (fresh.length) setActivity((prev) => [...prev, ...fresh]);
            cursor = data.cursor || cursor;
          }
          if (data.run) {
            setRunStatus({
              status: data.run.status,
              progress_pct: data.run.progress_pct,
              summary: data.run.summary,
              agentId: data.run.agent_id,
              output: data.run.output ?? null,
            });
          }
          if (data.terminal) {
            // A freshly-dispatched run that finished updates the deliverable hub.
            if (freshRunRef.current && data.run?.agent_id && activeRunId) {
              freshRunRef.current = false;
              setRunsByAgent((prev) => ({
                ...prev,
                [data.run.agent_id]: {
                  runId: activeRunId,
                  summary: data.run.summary,
                  status: data.run.status,
                  output: data.run.output ?? null,
                  createdAt: data.run.created_at || prev[data.run.agent_id]?.createdAt || '',
                },
              }));
            }
            cancelled = true;
            return;
          }
        }
      } catch {
        // transient — keep polling
      }
      if (!cancelled) setTimeout(tick, 1000);
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [activeRunId]);

  // View a completed run's result (read-only). Reuses the poller, which fetches
  // its events + output and stops (terminal).
  const viewRun = (runId: string, agentId?: string) => {
    if (runId === activeRunId) return;
    freshRunRef.current = false;
    setActivity([]);
    setRunStatus({ status: 'loading', progress_pct: 0, summary: null, agentId, output: null });
    setActiveRunId(runId);
  };

  // Dispatch an agent (or the full-scan cascade) and watch it.
  const dispatchAgent = async (agentId: string, inputPrompt?: string) => {
    if (sending) return;
    setSending(true);
    freshRunRef.current = true;
    setActivity([]);
    setRunStatus({ status: 'queued', progress_pct: 0, summary: null, agentId, output: null });
    setActiveRunId(null);
    try {
      const res = await fetch('/api/workspace/agent-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, agentId, inputPrompt: inputPrompt || undefined, triggerMethod: 'chat' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRunStatus({ status: 'failed', progress_pct: 0, summary: data.error || res.statusText, agentId, output: null });
        setSending(false);
        return;
      }
      setActiveRunId(data.run.id);
    } catch (err) {
      setRunStatus({ status: 'failed', progress_pct: 0, summary: err instanceof Error ? err.message : String(err), agentId, output: null });
    }
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-[#0a1628] text-white flex flex-col">
      {/* Top bar */}
      <header className="border-b border-white/5 px-6 py-3 flex items-center justify-between bg-[#0a1628]/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <a href="/dashboard" className="text-xs tracking-[0.2em] text-gray-500 uppercase hover:text-gray-300">MemeCMO.ai</a>
          <span className="text-gray-600">/</span>
          <a href="/dashboard" className="text-xs text-gray-400 hover:text-gray-200">{organization.name}</a>
          <span className="text-gray-600">/</span>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg leading-none">{COUNTRY_FLAG[project.target_country] || '🌐'}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{project.brand_name}</div>
              <div className="text-[10px] tracking-widest text-gray-500 uppercase">
                {project.target_country} · {project.target_language || 'auto'}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {headlineAigvr != null && (
            <div className="text-right leading-none">
              <div className={`text-lg font-semibold ${headlineAigvr >= 67 ? 'text-emerald-300' : headlineAigvr >= 34 ? 'text-amber-300' : 'text-red-300'}`}>{headlineAigvr}</div>
              <div className="text-[9px] text-gray-500 uppercase tracking-wider">AIGVR</div>
            </div>
          )}
          <span
            className={`text-[10px] px-2 py-1 rounded-full uppercase tracking-wider ${
              project.status === 'active'
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-yellow-500/15 text-yellow-300'
            }`}
          >
            {project.status}
          </span>
        </div>
      </header>

      {/* Outcome-first body */}
      <main className="max-w-3xl mx-auto w-full px-6 py-6 space-y-6">
        {/* Primary action */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => dispatchAgent('full_scan')}
              disabled={sending}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-sm font-medium transition"
            >
              ⚡ Run full GEO scan
            </button>
            <input
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && intent.trim()) { e.preventDefault(); dispatchAgent('full_scan', intent.trim()); setIntent(''); }
              }}
              placeholder="…or tell the agents what to focus on"
              disabled={sending}
              className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400/50"
            />
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            One click runs Discovery → Monitor (AIGVR) → Report. Or open / run any deliverable below.
          </p>
        </div>

        {/* Deliverables hub */}
        {DELIVERABLE_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-2">{group.label}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {group.items.map((aid) => (
                <DeliverableCard
                  key={aid}
                  agentId={aid}
                  run={runsByAgent[aid]}
                  running={sending && runStatus?.agentId === aid && !isTerminal}
                  isViewing={!!runsByAgent[aid] && runsByAgent[aid].runId === activeRunId}
                  onView={viewRun}
                  onRun={dispatchAgent}
                  disabled={sending}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Detail panel — active run / viewed result */}
        {runStatus && (
          <div ref={resultTopRef} className="rounded-xl border border-white/10 bg-[#070f1d] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {AGENTS[runStatus.agentId ?? '']?.emoji} {AGENTS[runStatus.agentId ?? '']?.displayName ?? 'Agent run'}
                </div>
                <div className="text-[11px] text-gray-500">{runStatus.status} · {runStatus.progress_pct ?? 0}%</div>
              </div>
              <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden shrink-0">
                <div
                  className={`h-full transition-all ${runStatus.status === 'failed' ? 'bg-red-500' : 'bg-emerald-400'}`}
                  style={{ width: `${runStatus.progress_pct ?? 0}%` }}
                />
              </div>
            </div>

            <div className="px-4 py-4 max-h-[70vh] overflow-y-auto">
              {isTerminal && runStatus.output ? (
                <div className="space-y-4">
                  {runStatus.summary && (
                    <div className="p-3 rounded border border-emerald-500/30 bg-emerald-500/5 text-sm text-emerald-100 leading-relaxed">
                      {runStatus.summary}
                    </div>
                  )}
                  <RunResult agentId={runStatus.agentId} output={runStatus.output} />
                  <details className="rounded border border-white/5 bg-white/[0.02]">
                    <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-widest text-gray-500 select-none hover:text-gray-300">
                      Process log · {activity.length} steps
                    </summary>
                    <div className="px-3 pb-3 font-mono text-xs space-y-2 border-t border-white/5 pt-2">
                      {activity.map((ev) => (<ActivityRow key={ev.id} ev={ev} />))}
                    </div>
                  </details>
                </div>
              ) : isTerminal && runStatus.status === 'failed' ? (
                <div className="text-sm text-red-300">{runStatus.summary || 'Run failed.'}</div>
              ) : (
                <div className="font-mono text-xs space-y-2">
                  {activity.length === 0 && <div className="text-gray-600 italic">starting…</div>}
                  {activity.map((ev) => (<ActivityRow key={ev.id} ev={ev} />))}
                  <div ref={activityEndRef} />
                </div>
              )}
            </div>
          </div>
        )}

        <p className="text-[10px] text-gray-600 leading-snug pt-2">
          v1.1 — outcome-first workspace. Full Scan orchestrates Discovery → Monitor → Report;
          execution agents (Site / Content / Distribute / Encyclopedia) build AEO presence; all
          share one canonical Brand Profile.
        </p>
      </main>
    </div>
  );
}

function DeliverableCard({
  agentId, run, running, isViewing, onView, onRun, disabled,
}: {
  agentId: string;
  run?: LatestRun;
  running: boolean;
  isViewing: boolean;
  onView: (runId: string, agentId: string) => void;
  onRun: (agentId: string) => void;
  disabled: boolean;
}) {
  const a = AGENTS[agentId];
  const ready = !!run && run.status === 'completed';
  return (
    <div
      onClick={() => (ready ? onView(run!.runId, agentId) : onRun(agentId))}
      className={`group rounded-lg border bg-white/[0.02] p-3 cursor-pointer transition ${
        isViewing ? 'border-emerald-400/40' : 'border-white/10 hover:border-blue-400/40'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{a?.emoji ?? '•'}</span>
        <span className="text-sm font-medium text-gray-100 truncate">{a?.shortName ?? agentId}</span>
        <span className="ml-auto shrink-0">
          {running ? (
            <span className="text-[10px] text-blue-300">running…</span>
          ) : ready ? (
            <span className="text-[10px] text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded">ready</span>
          ) : (
            <span className="text-[10px] text-gray-500">not run</span>
          )}
        </span>
      </div>
      <div className="text-[11px] text-gray-500 mt-1.5 line-clamp-2 min-h-[28px]">
        {ready ? run!.summary : a?.description}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px]">
        {ready ? (
          <>
            <span className="text-blue-300 group-hover:underline">View →</span>
            <button
              onClick={(e) => { e.stopPropagation(); if (!disabled) onRun(agentId); }}
              disabled={disabled}
              className="text-gray-500 hover:text-gray-200 disabled:opacity-40"
            >
              ↻ re-run
            </button>
          </>
        ) : (
          <span className="text-blue-300 group-hover:underline">Run →</span>
        )}
      </div>
    </div>
  );
}

function ActivityRow({ ev }: { ev: ActivityEvent }) {
  const ts = new Date(ev.ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const tone =
    ev.event_type === 'error'
      ? 'text-red-300'
      : ev.event_type === 'milestone'
      ? 'text-blue-300'
      : ev.event_type === 'tool_call'
      ? 'text-yellow-200'
      : ev.event_type === 'tool_result'
      ? 'text-emerald-200'
      : ev.event_type === 'progress'
      ? 'text-gray-500'
      : ev.event_type === 'output_chunk'
      ? 'text-purple-200'
      : 'text-gray-300';
  const label = ev.event_type.replace('_', ' ').toUpperCase();
  let body = '';
  if (typeof ev.payload === 'object' && ev.payload) {
    if ('text' in ev.payload) body = String(ev.payload.text);
    else if ('label' in ev.payload) body = String(ev.payload.label);
    else if ('message' in ev.payload) body = String(ev.payload.message);
    else if ('pct' in ev.payload) body = `${ev.payload.pct}%`;
    else if ('tool' in ev.payload && 'result' in ev.payload)
      body = `[${ev.payload.tool}] → ${String(ev.payload.result).slice(0, 140)}`;
    else if ('tool' in ev.payload) body = `[${ev.payload.tool}] called`;
    else if ('kind' in ev.payload) body = `[${ev.payload.kind}]`;
    else body = JSON.stringify(ev.payload).slice(0, 160);
  }
  return (
    <div className="flex items-start gap-3">
      <span className="text-gray-700 select-none">{ts}</span>
      <span className={`uppercase tracking-wider w-20 shrink-0 text-[10px] ${tone}`}>
        {label}
      </span>
      <span className="text-gray-200 break-words flex-1">{body}</span>
    </div>
  );
}

// ── Rich result renderers ────────────────────────────────────────────────────

// value→hex (red→amber→emerald) for SVG strokes / dynamic text colors.
function toneColor(v: number): string {
  return v >= 67 ? '#34d399' : v >= 34 ? '#fbbf24' : '#f87171';
}

// Auto-coloring meter bar: red at/near 0, amber mid, emerald high. Pass an
// explicit Tailwind `color` class to override the value-based tint.
function Bar({ value, color }: { value: number; color?: string }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const cls = color ?? (v <= 0 ? 'bg-red-500/80' : v < 34 ? 'bg-red-400' : v < 67 ? 'bg-amber-400' : 'bg-emerald-400');
  return (
    <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${cls} transition-all duration-500`} style={{ width: `${v}%` }} />
    </div>
  );
}

// Small accented section heading used across result cards.
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-1 h-3 rounded-full bg-emerald-400/70" />
      <span className="text-[10px] uppercase tracking-[0.18em] text-gray-400">{children}</span>
    </div>
  );
}

// Donut gauge for the 0-100 AIGVR headline.
function ScoreGauge({ score, size = 96 }: { score: number; size?: number }) {
  const s = Math.max(0, Math.min(100, Math.round(score || 0)));
  const sw = 8;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - s / 100);
  const col = toneColor(s);
  const mid = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={sw} />
      <circle
        cx={mid}
        cy={mid}
        r={r}
        fill="none"
        stroke={col}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform={`rotate(-90 ${mid} ${mid})`}
        style={{ transition: 'stroke-dashoffset 0.7s ease' }}
      />
      <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" fontSize="27" fontWeight="700" fill={col}>{s}</text>
      <text x="50%" y="64%" textAnchor="middle" dominantBaseline="middle" fontSize="9" letterSpacing="2" fill="rgba(255,255,255,0.4)">AIGVR</text>
    </svg>
  );
}

// Pentagon radar for the 5 AIGVR dimensions (each 0-100). Extra horizontal
// canvas room so the side labels don't clip.
function RadarChart({ data }: { data: { label: string; value: number }[] }) {
  const W = 212;
  const H = 184;
  const cx = W / 2;
  const cy = H / 2 + 2;
  const maxR = 62;
  const n = data.length;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, rr: number): [number, number] => [cx + rr * Math.cos(ang(i)), cy + rr * Math.sin(ang(i))];
  const ringPoly = (rr: number) => data.map((_, i) => pt(i, rr).join(',')).join(' ');
  const dataPts = data.map((dm, i) => pt(i, maxR * (Math.max(0, Math.min(100, dm.value || 0)) / 100)));
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={ringPoly(maxR * f)} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
      ))}
      {data.map((_, i) => {
        const [x, y] = pt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />;
      })}
      <polygon
        points={dataPts.map((p) => p.join(',')).join(' ')}
        fill="rgba(52,211,153,0.18)"
        stroke="#34d399"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {dataPts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={2.6} fill="#34d399" />
      ))}
      {data.map((dm, i) => {
        const [x, y] = pt(i, maxR + 15);
        const co = Math.cos(ang(i));
        const anchor = co > 0.3 ? 'start' : co < -0.3 ? 'end' : 'middle';
        return (
          <text key={i} x={x} y={y} dy="0.32em" textAnchor={anchor} fontSize="9" letterSpacing="0.5" fill="rgba(255,255,255,0.5)">
            {dm.label}
          </text>
        );
      })}
    </svg>
  );
}

function RunResult({ agentId, output }: { agentId?: string; output: Record<string, any> }) {
  return (
    <div className="mt-4 font-sans text-sm text-gray-200 space-y-4">
      {agentId === 'full_scan' ? (
        <>
          {output.scorecard && <MonitorResult o={output.scorecard} />}
          {output.report && <ReportResult o={output.report} />}
        </>
      ) : agentId === 'monitor' ? (
        <MonitorResult o={output} />
      ) : agentId === 'report' ? (
        <ReportResult o={output} />
      ) : agentId === 'optimize' ? (
        <ContentResult o={output} />
      ) : agentId === 'distribute' ? (
        <DistributionResult o={output} />
      ) : agentId === 'site' ? (
        <SiteResult o={output} />
      ) : agentId === 'encyclopedia' ? (
        <EncyclopediaResult o={output} />
      ) : agentId === 'profile' ? (
        <ProfileResult o={output} />
      ) : agentId === 'discovery' ? (
        <DiscoveryResult o={output} />
      ) : null}
    </div>
  );
}

function ContentResult({ o }: { o: Record<string, any> }) {
  const faq: any[] = o.faq || [];
  const copy = (text?: string) => { if (text) navigator.clipboard?.writeText(text).catch(() => {}); };
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">Content draft</h3>
          {o.targetQuery && (
            <p className="text-[11px] text-gray-500 mt-0.5">
              targets: <span className="text-amber-300">{o.targetQuery}</span>
              {o.stage && <span className="text-gray-600"> · {o.stage}</span>}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => copy(o.fullMarkdown)} className="text-[11px] px-2 py-0.5 rounded border border-white/10 text-gray-400 hover:border-blue-400/40 hover:text-blue-200 transition">Copy page</button>
          <button onClick={() => copy(JSON.stringify(o.schemaJsonLd, null, 2))} className="text-[11px] px-2 py-0.5 rounded border border-white/10 text-gray-400 hover:border-blue-400/40 hover:text-blue-200 transition">Copy schema</button>
        </div>
      </div>

      {o.title && <div className="text-[15px] font-semibold text-white leading-snug">{o.title}</div>}
      {o.metaDescription && <div className="text-[12px] text-gray-500 italic">{o.metaDescription}</div>}

      {o.articleMarkdown && (
        <div className="text-[13px] text-gray-300 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto border border-white/5 rounded-md p-3 bg-black/20">
          {o.articleMarkdown}
        </div>
      )}

      {faq.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">FAQ ({faq.length}) · FAQPage schema generated</div>
          <ul className="space-y-2">
            {faq.map((f, i) => (
              <li key={i} className="text-[12px] leading-snug">
                <div className="text-gray-200 font-medium">{f.question}</div>
                <div className="text-gray-500">{f.answer}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ProfileResult({ o }: { o: Record<string, any> }) {
  const facts: any[] = o.facts || [];
  const nap = o.nap || {};
  const napEntries = Object.entries(nap).filter(([, v]) => v);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-white">Canonical brand profile</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">{o.sourcedFromHomepage ? 'verified against homepage' : 'from brand knowledge'} · reused by all execution agents</p>
      </div>
      {o.definition && <div className="text-[13px] text-gray-200 font-medium leading-snug">{o.definition}</div>}
      {o.description && <div className="text-[12px] text-gray-400 leading-relaxed">{o.description}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        {(o.services || []).length > 0 && (
          <div><SectionLabel>Services</SectionLabel><div className="flex flex-wrap gap-1">{o.services.map((s: string, i: number) => <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300">{s}</span>)}</div></div>
        )}
        {(o.differentiators || []).length > 0 && (
          <div><SectionLabel>Differentiators</SectionLabel><ul className="space-y-0.5">{o.differentiators.map((d: string, i: number) => <li key={i} className="text-[11px] text-gray-400">· {d}</li>)}</ul></div>
        )}
      </div>
      {facts.length > 0 && (
        <div><SectionLabel>Facts</SectionLabel>
          <div className="space-y-0.5">{facts.map((f, i) => <div key={i} className="text-[12px]"><span className="text-gray-500">{f.label}: </span><span className="text-gray-200">{f.value}</span></div>)}</div>
        </div>
      )}
      {napEntries.length > 0 && (
        <div><SectionLabel>NAP</SectionLabel>
          <div className="text-[11px] text-gray-400">{napEntries.map(([k, v]) => `${k}: ${v}`).join('  ·  ')}</div>
        </div>
      )}
      {o.confidence && <div className="text-[10px] text-gray-600 pt-1 border-t border-white/5">{o.confidence}</div>}
    </div>
  );
}

function EncyclopediaResult({ o }: { o: Record<string, any> }) {
  const n = o.notability || {};
  const cites: any[] = o.citationPlan || [];
  const targets: any[] = o.existingArticleTargets || [];
  const da = o.draftArticle || {};
  const copy = (t?: string) => { if (t) navigator.clipboard?.writeText(t).catch(() => {}); };
  const vColor = n.verdict === 'likely' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
    : n.verdict === 'borderline' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    : 'bg-red-500/20 text-red-300 border-red-500/40';
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">Encyclopedia entry &amp; path</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">{o.targetWiki}</p>
        </div>
        <button onClick={() => copy(o.fullMarkdown)} className="text-[11px] px-2 py-0.5 rounded border border-white/10 text-gray-400 hover:border-blue-400/40 hover:text-blue-200 transition shrink-0">Copy plan</button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] px-2 py-0.5 rounded border uppercase tracking-wide ${vColor}`}>notability: {n.verdict || '—'}</span>
        {o.recommendedApproach && <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300">{String(o.recommendedApproach).replace(/_/g, ' ')}</span>}
      </div>
      {n.reasoning && <p className="text-[12px] text-gray-400 leading-snug">{n.reasoning}</p>}

      {n.evidenceNeeded?.length > 0 && (
        <div>
          <SectionLabel>Evidence needed to qualify</SectionLabel>
          <ul className="space-y-0.5">{n.evidenceNeeded.map((e: string, i: number) => <li key={i} className="text-[12px] text-gray-400">· {e}</li>)}</ul>
        </div>
      )}

      {da.title && (
        <div>
          <SectionLabel>Draft — {da.title}</SectionLabel>
          {da.lead && <p className="text-[12px] text-gray-300 leading-relaxed">{da.lead}</p>}
          {(da.sections || []).map((s: any, i: number) => (
            <div key={i} className="mt-1.5">
              <div className="text-[12px] text-gray-200 font-medium">{s.heading}</div>
              <div className="text-[12px] text-gray-400 leading-snug">{s.content}</div>
            </div>
          ))}
        </div>
      )}

      {cites.length > 0 && (
        <div>
          <SectionLabel>Citation plan</SectionLabel>
          <ul className="space-y-0.5">
            {cites.map((c, i) => (
              <li key={i} className="text-[12px] leading-snug">
                <span className={c.status === 'have' ? 'text-emerald-400' : 'text-amber-400'}>{c.status === 'have' ? '✓' : '○'}</span>
                <span className="text-gray-300"> {c.claim}</span>
                <span className="text-gray-600"> — {c.sourceType}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {targets.length > 0 && (
        <div>
          <SectionLabel>Get mentioned in existing articles</SectionLabel>
          <div className="space-y-1.5">
            {targets.map((t, i) => (
              <div key={i} className="text-[12px] leading-snug">
                <span className="text-purple-200 font-medium">{t.article}: </span>
                <span className="text-gray-400">{t.howToGetMentioned}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DistributionResult({ o }: { o: Record<string, any> }) {
  const targets: any[] = o.targets || [];
  const copy = (t?: string) => { if (t) navigator.clipboard?.writeText(t).catch(() => {}); };
  const tierLabel: Record<number, string> = { 1: 'Tier 1 · National / mainstream', 2: 'Tier 2 · Industry / trade', 3: 'Tier 3 · Directories (quick wins)' };
  const tierColor: Record<number, string> = { 1: 'text-rose-300', 2: 'text-amber-300', 3: 'text-emerald-300' };
  const tiers = Array.from(new Set(targets.map((t) => t.tier || 3))).sort((a, b) => a - b);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Distribution kit</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">{targets.length} ready-to-send placements, tiered by authority · get cited where AI engines look</p>
        </div>
        <button onClick={() => copy(o.fullMarkdown)} className="text-[11px] px-2 py-0.5 rounded border border-white/10 text-gray-400 hover:border-blue-400/40 hover:text-blue-200 transition shrink-0">Copy kit</button>
      </div>
      {tiers.map((tier) => (
        <div key={tier}>
          <div className={`text-[10px] uppercase tracking-widest mb-1.5 ${tierColor[tier] || 'text-gray-400'}`}>{tierLabel[tier] || `Tier ${tier}`}</div>
          <div className="space-y-2">
            {targets.filter((t) => (t.tier || 3) === tier).map((t, i) => (
              <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[12px] font-medium text-white truncate">{t.domain}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-400 uppercase tracking-wide shrink-0">{(t.channelType || '').replace(/_/g, ' ')}</span>
                  {t.effort && <span className="text-[9px] text-gray-600 shrink-0">{t.effort}</span>}
                  <button onClick={() => copy(t.draft)} className="ml-auto text-[10px] text-gray-500 hover:text-blue-200 shrink-0">copy</button>
                </div>
                {t.title && <div className="text-[12px] text-gray-300 font-medium mb-1">{t.title}</div>}
                {t.draft && <div className="text-[12px] text-gray-400 leading-snug whitespace-pre-wrap">{t.draft}</div>}
                {t.why && <div className="text-[10px] text-emerald-300/70 mt-1.5">↳ {t.why}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SiteResult({ o }: { o: Record<string, any> }) {
  const checklist: any[] = o.aeoChecklist || [];
  const edits: any[] = o.homepageEdits || [];
  const schema: any[] = o.schema || [];
  const copy = (t?: string) => { if (t) navigator.clipboard?.writeText(t).catch(() => {}); };
  const dot = (s: string) => (s === 'ok' ? 'text-emerald-400' : s === 'weak' ? 'text-amber-400' : 'text-red-400');
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">Homepage AEO upgrade</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {o.siteAudited ? <>audited <span className="text-gray-400">{o.siteAudited}</span></> : 'homepage not fetched — from brand knowledge'}
            {o.existingSchema?.length ? ` · existing schema: ${o.existingSchema.join(', ')}` : ' · no existing schema'}
          </p>
        </div>
        <button onClick={() => copy(o.fullMarkdown)} className="text-[11px] px-2 py-0.5 rounded border border-white/10 text-gray-400 hover:border-blue-400/40 hover:text-blue-200 transition shrink-0">Copy brief</button>
      </div>

      {checklist.length > 0 && (
        <div>
          <SectionLabel>AEO checklist</SectionLabel>
          <ul className="space-y-1">
            {checklist.map((c, i) => (
              <li key={i} className="text-[12px] leading-snug">
                <span className={`${dot(c.status)} mr-1`}>●</span>
                <span className="text-gray-200">{c.item}</span>
                <span className="text-gray-500"> — {c.fix}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {edits.length > 0 && (
        <div>
          <SectionLabel>Homepage edits</SectionLabel>
          <div className="space-y-1.5">
            {edits.map((e, i) => (
              <div key={i} className="text-[12px] leading-snug">
                <span className="text-gray-300 font-medium">{e.section}: </span>
                <span className="text-gray-400">{e.change}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {schema.length > 0 && (
        <div>
          <SectionLabel>Paste-in JSON-LD ({schema.length})</SectionLabel>
          <div className="space-y-1.5">
            {schema.map((s, i) => (
              <div key={i} className="rounded border border-white/5 bg-black/20">
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-[11px] text-purple-200">{s.type}</span>
                  <button onClick={() => copy(JSON.stringify(s.jsonld, null, 2))} className="text-[10px] text-gray-500 hover:text-blue-200">copy</button>
                </div>
                <pre className="text-[10px] text-gray-400 px-2.5 pb-2 overflow-x-auto max-h-40 overflow-y-auto">{JSON.stringify(s.jsonld, null, 2)}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DiscoveryResult({ o }: { o: Record<string, any> }) {
  const cats: any[] = o.promptSet || [];
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white tracking-wide">Discovery — prompt set</h3>
          {o.industry && <p className="text-[11px] text-gray-500 mt-0.5 truncate">{o.industry}</p>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-white leading-none tabular-nums">{o.promptCount ?? '—'}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">prompts · {cats.length} stages</div>
        </div>
      </div>

      {Array.isArray(o.subVerticals) && o.subVerticals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {o.subVerticals.map((s: string, i: number) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-200/90">{s}</span>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {cats.map((c, i) => (
          <details key={i} className="group rounded-lg border border-white/5 bg-white/[0.02] open:bg-white/[0.03]">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-2.5 flex items-center gap-2 select-none rounded-lg hover:bg-white/[0.02]">
              <span className="text-gray-600 text-[9px] transition-transform group-open:rotate-90">▶</span>
              <span className="text-[12px] font-medium text-purple-200/90 flex-1 min-w-0 truncate">{c.label || c.category}</span>
              <span className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded-full bg-white/5 tabular-nums">{(c.prompts || []).length}</span>
            </summary>
            <ul className="px-3 pb-2.5 pt-1.5 space-y-1.5 border-t border-white/5">
              {(c.prompts || []).map((p: string, j: number) => (
                <li key={j} className="flex gap-2 text-[12px] text-gray-400 leading-snug">
                  <span className="text-gray-600 flex-none tabular-nums">{j + 1}.</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}

function MonitorResult({ o }: { o: Record<string, any> }) {
  const d = o.dimensions || {};
  const dims: { k: string; label: string }[] = [
    { k: 'presence', label: 'Presence (SoV)' },
    { k: 'prominence', label: 'Prominence' },
    { k: 'sentiment', label: 'Sentiment' },
    { k: 'citation', label: 'Citation (AEO)' },
    { k: 'competitiveShare', label: 'Competitive share' },
  ];
  const radar = [
    { label: 'Presence', value: d.presence ?? 0 },
    { label: 'Prom.', value: d.prominence ?? 0 },
    { label: 'Sent.', value: d.sentiment ?? 0 },
    { label: 'Cite', value: d.citation ?? 0 },
    { label: 'Share', value: d.competitiveShare ?? 0 },
  ];
  const stages: any[] = o.metrics?.perStage || [];
  const engines: any[] = o.metrics?.perEngine || [];
  const bench: any[] = o.competitorBenchmark || [];
  const maxSov = Math.max(1, ...bench.map((b) => b.sovPct || 0));
  const gaps: any[] = o.gaps || [];
  const score = o.aigvrScore ?? 0;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-5">
      {/* Header: title + headline gauge */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white tracking-wide">AIGVR Scorecard</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">{(o.engines || []).join(' · ')} · {o.sampled?.queries ?? '—'} queries</p>
        </div>
        <div className="flex flex-col items-center shrink-0">
          <ScoreGauge score={score} />
          <div className="text-[10px] text-gray-500 mt-1">
            Rank <span className="text-gray-200 font-semibold">#{o.brandRank ?? '—'}</span> of {bench.length || '—'}
          </div>
        </div>
      </div>

      {/* Radar + per-dimension breakdown */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <RadarChart data={radar} />
        <div className="flex-1 min-w-[200px] space-y-2">
          {dims.map((dim) => {
            const v = Math.round(d[dim.k] ?? 0);
            return (
              <div key={dim.k} className="grid grid-cols-[100px_1fr_30px] items-center gap-2.5">
                <span className="text-[11px] text-gray-400 truncate">{dim.label}</span>
                <Bar value={v} />
                <span className="text-[11px] font-semibold text-gray-200 text-right tabular-nums">{v}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-engine scores */}
      {engines.length > 0 && (
        <div>
          <SectionLabel>By engine</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {engines.map((e, i) => (
              <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2">
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-[11px] text-gray-300 truncate">{e.engine}</span>
                  <span className="text-[13px] font-bold tabular-nums" style={{ color: toneColor(e.aigvr || 0) }}>{e.aigvr ?? '—'}</span>
                </div>
                <div className="mt-1.5"><Bar value={e.aigvr} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Funnel-stage visibility */}
      {stages.length > 0 && (
        <div>
          <SectionLabel>Funnel-stage visibility</SectionLabel>
          <div className="space-y-2">
            {stages.map((s, i) => (
              <div key={i} className="grid grid-cols-[96px_1fr_72px] items-center gap-2.5">
                <span className="text-[11px] text-gray-400 capitalize truncate">
                  {s.stage}
                  {s.confidence === 'low' && <span className="ml-1 text-amber-500/70" title="few queries — low confidence">·low n</span>}
                </span>
                <Bar value={s.presence} />
                <span className="text-[11px] text-gray-400 text-right tabular-nums">
                  <span className="text-gray-200 font-semibold">{s.presence}%</span>
                  <span className="text-gray-600"> {s.brandHits}/{s.queries}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Competitive share-of-voice bar chart */}
      {bench.length > 0 && (
        <div>
          <SectionLabel>Share of voice</SectionLabel>
          <div className="space-y-1">
            {bench.map((b, i) => (
              <div
                key={i}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1 ${b.isBrand ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30' : ''}`}
              >
                <span className={`w-28 shrink-0 truncate text-[11px] ${b.isBrand ? 'text-emerald-200 font-semibold' : 'text-gray-400'}`}>
                  {b.isBrand && <span className="mr-0.5">★</span>}{b.name}
                </span>
                <div className="flex-1 h-2.5 bg-white/[0.05] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${b.isBrand ? 'bg-emerald-400' : 'bg-sky-400/50'} transition-all duration-500`}
                    style={{ width: `${((b.sovPct || 0) / maxSov) * 100}%` }}
                  />
                </div>
                <span className={`w-9 text-right text-[11px] tabular-nums ${b.isBrand ? 'text-emerald-200 font-semibold' : 'text-gray-400'}`}>{b.sovPct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* High-intent gaps */}
      {gaps.length > 0 && (
        <div>
          <SectionLabel>High-intent gaps ({gaps.length})</SectionLabel>
          <ul className="space-y-2">
            {gaps.slice(0, 8).map((g, i) => (
              <li key={i} className="rounded-md border border-white/5 border-l-2 border-l-red-500/50 bg-red-500/[0.04] pl-2.5 pr-2 py-1.5">
                <div className="text-[12px] text-gray-200 leading-snug">{g.prompt}</div>
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wide">{g.engine} · {g.stage}</span>
                  {(g.competitorsPresent || []).length > 0 && <span className="text-gray-600 text-[10px]">→</span>}
                  {(g.competitorsPresent || []).map((c: string, j: number) => (
                    <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300/90 border border-amber-500/20">{c}</span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Source-Authority Index — which domains the engines actually cite */}
      {o.sourceAuthority?.ranking?.length > 0 && (
        <div>
          <SectionLabel>Sources AI engines cite · AEO targets</SectionLabel>
          <p className="text-[10px] text-gray-600 mb-1.5">
            {o.sourceAuthority.totalCitations} citations indexed across this project&apos;s scans — get featured on these.
          </p>
          <div className="space-y-1">
            {o.sourceAuthority.ranking.slice(0, 10).map((d: any, i: number) => (
              <div key={i} className={`flex items-center gap-2.5 rounded-md px-2 py-1 ${d.isBrand ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30' : ''}`}>
                <span className="w-4 text-[10px] text-gray-600 tabular-nums">{i + 1}</span>
                <span className={`flex-1 truncate text-[11px] ${d.isBrand ? 'text-emerald-200 font-semibold' : 'text-gray-300'}`}>
                  {d.isBrand && <span className="mr-0.5">★</span>}{d.domain}
                  {d.isBrand && <span className="ml-1 text-[9px] text-emerald-400/70 uppercase">you</span>}
                </span>
                <span className="text-[10px] text-gray-500">{d.engines} eng</span>
                <span className="w-9 text-right text-[11px] tabular-nums text-gray-300 font-medium">{d.citations}×</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {o.citations && (
        <div className="text-[11px] text-gray-500 pt-1 border-t border-white/5">
          Brand domain cited <span className="text-gray-300 font-medium">{o.citations.brandCitedCount ?? 0}×</span> across AI answers.
        </div>
      )}
    </div>
  );
}

const PRIORITY_STYLE: Record<string, string> = {
  P0: 'bg-red-500/20 text-red-300 border-red-500/40',
  P1: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  P2: 'bg-gray-500/20 text-gray-300 border-gray-500/40',
};

const PRIORITY_RAIL: Record<string, string> = {
  P0: 'border-l-red-500',
  P1: 'border-l-amber-400',
  P2: 'border-l-gray-500',
};

function ReportResult({ o }: { o: Record<string, any> }) {
  const findings: any[] = o.keyFindings || [];
  const recs: any[] = (o.recommendations || []).slice().sort((a: any, b: any) => {
    const r: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
    return (r[a.priority] ?? 9) - (r[b.priority] ?? 9);
  });
  const quickWins: string[] = o.quickWins || [];
  const copyMarkdown = () => {
    if (o.markdown) navigator.clipboard?.writeText(o.markdown).catch(() => {});
  };
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white tracking-wide">GEO Visibility Report</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">AI Generative Visibility analysis</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {typeof o.aigvrScore === 'number' && (
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: toneColor(o.aigvrScore) }} />
              <span className="text-[11px] text-gray-400">AIGVR <span className="font-semibold" style={{ color: toneColor(o.aigvrScore) }}>{o.aigvrScore}</span></span>
            </div>
          )}
          {o.markdown && (
            <button onClick={copyMarkdown} className="text-[11px] px-2 py-1 rounded border border-white/10 text-gray-400 hover:border-blue-400/40 hover:text-blue-200 transition">
              Copy Markdown
            </button>
          )}
        </div>
      </div>

      {o.executiveSummary && (
        <div className="rounded-lg border border-white/5 border-l-2 border-l-emerald-400/50 bg-white/[0.02] px-3.5 py-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-400/70 mb-1.5">Executive summary</div>
          <p className="text-[13px] text-gray-200 leading-relaxed">{o.executiveSummary}</p>
        </div>
      )}

      {findings.length > 0 && (
        <div>
          <SectionLabel>Key findings</SectionLabel>
          <ul className="space-y-2.5">
            {findings.map((f, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-0.5 flex-none w-5 h-5 rounded-full bg-white/[0.04] border border-white/10 text-[10px] font-semibold text-gray-400 flex items-center justify-center tabular-nums">{i + 1}</span>
                <div className="min-w-0">
                  <div className="text-[12.5px] text-gray-100 font-medium leading-snug">{f.finding}</div>
                  {f.evidence && <div className="text-[11.5px] text-gray-500 leading-snug mt-0.5">{f.evidence}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recs.length > 0 && (
        <div>
          <SectionLabel>Recommendations</SectionLabel>
          <div className="space-y-2.5">
            {recs.map((rec, i) => (
              <div key={i} className={`rounded-lg border border-white/5 border-l-[3px] ${PRIORITY_RAIL[rec.priority] || PRIORITY_RAIL.P2} bg-white/[0.02] p-3.5`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${PRIORITY_STYLE[rec.priority] || PRIORITY_STYLE.P2}`}>{rec.priority}</span>
                  <span className="text-[13px] font-semibold text-white leading-tight">{rec.title}</span>
                  {rec.targetStage && <span className="ml-auto shrink-0 text-[10px] text-gray-400 px-1.5 py-0.5 rounded bg-white/5 capitalize">{rec.targetStage}</span>}
                </div>
                {rec.rationale && <p className="text-[12px] text-gray-400 leading-snug mb-2">{rec.rationale}</p>}
                {Array.isArray(rec.actions) && rec.actions.length > 0 && (
                  <ul className="space-y-1 mb-2">
                    {rec.actions.map((a: string, j: number) => (
                      <li key={j} className="flex gap-2 text-[12px] text-gray-300 leading-snug">
                        <span className="text-emerald-400/70 flex-none">▸</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {rec.expectedImpact && (
                  <div className="text-[11px] text-emerald-300/90 flex items-center gap-1.5">
                    <span aria-hidden>↗</span>
                    <span>{rec.expectedImpact}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {quickWins.length > 0 && (
        <div>
          <SectionLabel>Quick wins</SectionLabel>
          <ul className="space-y-1.5">
            {quickWins.map((q, i) => (
              <li key={i} className="flex gap-2 text-[12px] text-gray-300 leading-snug">
                <span className="flex-none mt-0.5 w-4 h-4 rounded-full bg-emerald-500/15 text-emerald-300 text-[9px] flex items-center justify-center">✓</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
