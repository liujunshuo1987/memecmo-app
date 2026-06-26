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
import { AGENTS, V05_AGENT_IDS } from '@/lib/agents/registry';
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

export default function WorkspaceClient({ project, organization, initialRuns }: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>(() =>
    initialRuns
      .slice()
      .reverse()
      .map((r) => ({
        id: 'init-' + r.id,
        role: 'system',
        content: `Previous run · ${AGENTS[r.agent_id]?.shortName ?? r.agent_id} · ${r.status}` +
          (r.summary ? ` — ${r.summary}` : ''),
        agentId: r.agent_id,
        runId: r.id,
        ts: r.created_at,
      })),
  );
  const [draft, setDraft] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string>('discovery');
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

  const isTerminal = !!runStatus && ['completed', 'failed', 'canceled'].includes(runStatus.status);

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

  // Load a past run (from history) into the activity/result panel — reuses the
  // same poller, which fetches all its events + output and stops (terminal).
  const loadRun = (runId: string, agentId?: string) => {
    if (runId === activeRunId) return;
    setActivity([]);
    setRunStatus({ status: 'loading', progress_pct: 0, summary: null, agentId, output: null });
    setActiveRunId(runId);
  };

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    const userMsg: ChatTurn = {
      id: 'u-' + Date.now(),
      role: 'user',
      content: draft.trim(),
      ts: new Date().toISOString(),
    };
    setTurns((p) => [...p, userMsg]);
    const prompt = draft.trim();
    setDraft('');
    setSending(true);

    try {
      const res = await fetch('/api/workspace/agent-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          agentId: selectedAgent,
          inputPrompt: prompt,
          triggerMethod: 'chat',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTurns((p) => [
          ...p,
          {
            id: 'e-' + Date.now(),
            role: 'system',
            content: `Error: ${data.error || res.statusText}`,
            ts: new Date().toISOString(),
          },
        ]);
        setSending(false);
        return;
      }
      const assistantMsg: ChatTurn = {
        id: 'a-' + data.run.id,
        role: 'assistant',
        content: `${AGENTS[selectedAgent]?.emoji ?? '🤖'} ${AGENTS[selectedAgent]?.displayName ?? selectedAgent} dispatched. Watch progress on the right →`,
        agentId: selectedAgent,
        runId: data.run.id,
        ts: data.run.created_at,
      };
      setTurns((p) => [...p, assistantMsg]);
      setActivity([]);
      setRunStatus({ status: 'queued', progress_pct: 0, summary: null, agentId: selectedAgent, output: null });
      setActiveRunId(data.run.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTurns((p) => [
        ...p,
        { id: 'e-' + Date.now(), role: 'system', content: `Network error: ${msg}`, ts: new Date().toISOString() },
      ]);
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
        <div className="flex items-center gap-2">
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

      {/* Two-panel body */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_1fr] min-h-0">
        {/* ─── Left: chat ──────────────────────────────────────── */}
        <section className="border-r border-white/5 flex flex-col min-h-0">
          <div className="px-6 py-4 border-b border-white/5">
            <h2 className="text-sm font-semibold tracking-wide">Workspace</h2>
            <p className="text-xs text-gray-500">
              Tell an agent what to do. Default action = run Discovery on this brand.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {turns.length === 0 && (
              <div className="text-xs text-gray-500 italic">
                No history yet. Type a message below and pick an agent to dispatch.
              </div>
            )}
            {turns.map((t) => {
              const clickable = !!t.runId;
              const isActive = t.runId && t.runId === activeRunId;
              return (
                <div
                  key={t.id}
                  className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    onClick={clickable ? () => loadRun(t.runId!, t.agentId) : undefined}
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                      clickable ? 'cursor-pointer hover:border-blue-400/40' : ''
                    } ${
                      t.role === 'user'
                        ? 'bg-blue-600/30 text-blue-50 border border-blue-500/30'
                        : t.role === 'assistant'
                        ? 'bg-white/[0.03] text-gray-100 border border-white/10'
                        : `bg-transparent text-gray-500 border italic text-xs ${
                            isActive ? 'border-emerald-400/40 text-gray-300' : 'border-white/5'
                          }`
                    }`}
                  >
                    {t.content}
                    {clickable && t.role === 'system' && (
                      <span className="ml-2 not-italic text-[10px] text-blue-400">view →</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-white/5 px-6 py-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {V05_AGENT_IDS.map((aid) => {
                const a = AGENTS[aid];
                const active = selectedAgent === aid;
                return (
                  <button
                    key={aid}
                    onClick={() => setSelectedAgent(aid)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition ${
                      active
                        ? 'bg-blue-500/20 border-blue-400/50 text-blue-100'
                        : 'bg-transparent border-white/10 text-gray-400 hover:border-white/30'
                    }`}
                    title={a.description}
                  >
                    <span className="mr-1">{a.emoji}</span>
                    {a.shortName}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={`Ask ${AGENTS[selectedAgent]?.shortName ?? 'an agent'} to…`}
                className="flex-1 bg-white/[0.03] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-400/50"
                disabled={sending}
              />
              <button
                onClick={handleSend}
                disabled={sending || !draft.trim()}
                className="px-4 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 transition"
              >
                {sending ? '…' : 'Send'}
              </button>
            </div>
            <p className="text-[10px] text-gray-600 leading-snug">
              v1.0 — ⚡ Full Scan runs Discovery → Monitor (AIGVR across ChatGPT / Gemini /
              Perplexity / Claude) → Report in one click. On completion it converges to the
              report; the process log collapses. Click a past run to view its result.
            </p>
          </div>
        </section>

        {/* ─── Right: activity stream ────────────────────────── */}
        <section className="flex flex-col min-h-0 bg-[#070f1d]">
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-wide">Agent activity</h2>
              <p className="text-xs text-gray-500">
                {activeRunId
                  ? `Run ${activeRunId.slice(0, 8)} · ${runStatus?.status ?? 'connecting…'} · ${runStatus?.progress_pct ?? 0}%`
                  : 'Idle — dispatch an agent from the left to see live activity.'}
              </p>
            </div>
            {runStatus && (
              <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    runStatus.status === 'failed' ? 'bg-red-500' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${runStatus.progress_pct}%` }}
                />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {!activeRunId && (
              <div className="font-mono text-xs text-gray-600 italic">— Awaiting dispatch —</div>
            )}

            {activeRunId && isTerminal && runStatus?.output ? (
              /* Converged view: deliverable first, process log collapsed. */
              <div className="space-y-4">
                <div ref={resultTopRef} />
                {runStatus.summary && (
                  <div className="p-3 rounded border border-emerald-500/30 bg-emerald-500/5">
                    <div className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1">Result</div>
                    <div className="text-sm text-emerald-100 leading-relaxed">{runStatus.summary}</div>
                  </div>
                )}
                <RunResult agentId={runStatus.agentId} output={runStatus.output} />
                <details className="rounded border border-white/5 bg-white/[0.02]">
                  <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-widest text-gray-500 select-none hover:text-gray-300">
                    Process log · {activity.length} steps
                  </summary>
                  <div className="px-3 pb-3 font-mono text-xs space-y-2 border-t border-white/5 pt-2">
                    {activity.map((ev) => (
                      <ActivityRow key={ev.id} ev={ev} />
                    ))}
                  </div>
                </details>
              </div>
            ) : (
              /* Live view: stream the process as it runs. */
              <div className="font-mono text-xs space-y-2">
                {activity.map((ev) => (
                  <ActivityRow key={ev.id} ev={ev} />
                ))}
                {isTerminal && runStatus?.summary && (
                  <div className="mt-4 p-3 rounded border border-emerald-500/30 bg-emerald-500/5">
                    <div className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1">Result</div>
                    <div className="text-emerald-100 leading-relaxed">{runStatus.summary}</div>
                  </div>
                )}
                <div ref={activityEndRef} />
              </div>
            )}
          </div>
        </section>
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

function DistributionResult({ o }: { o: Record<string, any> }) {
  const targets: any[] = o.targets || [];
  const copy = (t?: string) => { if (t) navigator.clipboard?.writeText(t).catch(() => {}); };
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Distribution kit</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">{targets.length} ready-to-send placements · get cited where AI engines look</p>
        </div>
        <button onClick={() => copy(o.fullMarkdown)} className="text-[11px] px-2 py-0.5 rounded border border-white/10 text-gray-400 hover:border-blue-400/40 hover:text-blue-200 transition shrink-0">Copy kit</button>
      </div>
      <div className="space-y-2.5">
        {targets.map((t, i) => (
          <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[12px] font-medium text-white truncate">{t.domain}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-400 uppercase tracking-wide shrink-0">{(t.channelType || '').replace(/_/g, ' ')}</span>
              <button onClick={() => copy(t.draft)} className="ml-auto text-[10px] text-gray-500 hover:text-blue-200 shrink-0">copy</button>
            </div>
            {t.title && <div className="text-[12px] text-gray-300 font-medium mb-1">{t.title}</div>}
            {t.draft && <div className="text-[12px] text-gray-400 leading-snug whitespace-pre-wrap">{t.draft}</div>}
            {t.why && <div className="text-[10px] text-emerald-300/70 mt-1.5">↳ {t.why}</div>}
          </div>
        ))}
      </div>
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
