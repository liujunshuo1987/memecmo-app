'use client';

// Manus-style two-panel workspace:
//   Left  — chat / command bar
//   Right — agent activity stream + run history
//
// v0.5 supports 3 agents: discovery | monitor | report
// Sending a chat with /discovery (or default to discovery on first message)
// spawns a run; the activity panel subscribes to its SSE stream.

import { useEffect, useRef, useState } from 'react';
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

  // Auto-scroll activity panel
  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activity, runStatus]);

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
          <a href="/" className="text-xs tracking-[0.2em] text-gray-500 uppercase hover:text-gray-300">MemeCMO.ai</a>
          <span className="text-gray-600">/</span>
          <span className="text-xs text-gray-400">{organization.name}</span>
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
              v0.9 — Discovery → Monitor (AIGVR across ChatGPT / Gemini / Perplexity / Claude)
              → Report, all live. Click a past run on the left to view its result.
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

          <div className="flex-1 overflow-y-auto px-6 py-4 font-mono text-xs space-y-2">
            {!activeRunId && (
              <div className="text-gray-600 italic">
                — Awaiting dispatch —
              </div>
            )}
            {activity.map((ev) => (
              <ActivityRow key={ev.id} ev={ev} />
            ))}
            {runStatus?.summary && (
              <div className="mt-4 p-3 rounded border border-emerald-500/30 bg-emerald-500/5">
                <div className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1">
                  Result
                </div>
                <div className="text-emerald-100 leading-relaxed">{runStatus.summary}</div>
              </div>
            )}
            {runStatus?.output && (
              <RunResult agentId={runStatus.agentId} output={runStatus.output} />
            )}
            <div ref={activityEndRef} />
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

function Bar({ value, color = 'bg-emerald-400' }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
    </div>
  );
}

function RunResult({ agentId, output }: { agentId?: string; output: Record<string, any> }) {
  return (
    <div className="mt-4 font-sans text-sm text-gray-200">
      {agentId === 'monitor' ? (
        <MonitorResult o={output} />
      ) : agentId === 'report' ? (
        <ReportResult o={output} />
      ) : agentId === 'discovery' ? (
        <DiscoveryResult o={output} />
      ) : null}
    </div>
  );
}

function DiscoveryResult({ o }: { o: Record<string, any> }) {
  const cats: any[] = o.promptSet || [];
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-white">Discovery — prompt set</h3>
        <span className="text-xs text-gray-400">{o.promptCount ?? '—'} prompts · {cats.length} stages</span>
      </div>
      {o.industry && <div className="text-xs text-gray-400">Industry: <span className="text-gray-200">{o.industry}</span></div>}
      {Array.isArray(o.subVerticals) && o.subVerticals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {o.subVerticals.map((s: string, i: number) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300">{s}</span>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {cats.map((c, i) => (
          <details key={i} className="rounded border border-white/5 bg-white/[0.02]">
            <summary className="cursor-pointer px-3 py-2 text-xs text-gray-300 select-none">
              <span className="text-purple-300">{c.label || c.category}</span>
              <span className="text-gray-600"> · {(c.prompts || []).length}</span>
            </summary>
            <ul className="px-4 pb-2 space-y-1">
              {(c.prompts || []).map((p: string, j: number) => (
                <li key={j} className="text-[12px] text-gray-400 leading-snug">· {p}</li>
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
  const stages: any[] = o.metrics?.perStage || [];
  const bench: any[] = o.competitorBenchmark || [];
  const gaps: any[] = o.gaps || [];
  const score = o.aigvrScore ?? 0;
  const scoreColor = score >= 67 ? 'text-emerald-300' : score >= 34 ? 'text-amber-300' : 'text-red-300';
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">AIGVR Scorecard</h3>
          <p className="text-[11px] text-gray-500">{(o.engines || []).join(' · ')} · {o.sampled?.queries ?? '—'} queries</p>
        </div>
        <div className="text-right">
          <div className={`text-3xl font-bold leading-none ${scoreColor}`}>{score}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">/ 100 · rank #{o.brandRank ?? '—'}</div>
        </div>
      </div>

      <div className="space-y-1.5">
        {dims.map((dim) => (
          <div key={dim.k} className="grid grid-cols-[110px_1fr_32px] items-center gap-2">
            <span className="text-[11px] text-gray-400">{dim.label}</span>
            <Bar value={d[dim.k]} />
            <span className="text-[11px] text-gray-300 text-right">{d[dim.k] ?? '—'}</span>
          </div>
        ))}
      </div>

      {stages.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">Funnel-stage visibility</div>
          <div className="space-y-1.5">
            {stages.map((s, i) => (
              <div key={i} className="grid grid-cols-[110px_1fr_60px] items-center gap-2">
                <span className="text-[11px] text-gray-400 capitalize">{s.stage}</span>
                <Bar value={s.presence} color={s.presence === 0 ? 'bg-red-500/70' : s.presence < 50 ? 'bg-amber-400' : 'bg-emerald-400'} />
                <span className="text-[11px] text-gray-300 text-right">{s.presence}% ({s.brandHits}/{s.queries})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {bench.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">Competitive benchmark</div>
          <div className="space-y-1">
            {bench.map((b, i) => (
              <div key={i} className={`flex items-center justify-between text-[12px] px-2 py-1 rounded ${b.isBrand ? 'bg-emerald-500/10 border border-emerald-500/30' : ''}`}>
                <span className={b.isBrand ? 'text-emerald-200 font-medium' : 'text-gray-400'}>{b.isBrand ? '★ ' : ''}{b.name}</span>
                <span className={b.isBrand ? 'text-emerald-200' : 'text-gray-400'}>{b.sovPct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {gaps.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">High-intent gaps ({gaps.length})</div>
          <ul className="space-y-1.5">
            {gaps.slice(0, 8).map((g, i) => (
              <li key={i} className="text-[12px] leading-snug border-l-2 border-red-500/40 pl-2">
                <span className="text-gray-300">{g.prompt}</span>
                <span className="text-gray-600"> · {g.engine}/{g.stage} → </span>
                <span className="text-amber-300">{(g.competitorsPresent || []).join(', ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {o.citations && (
        <div className="text-[11px] text-gray-500">
          Citations: brand domain cited {o.citations.brandCitedCount ?? 0}× across answers.
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
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">GEO Visibility Report</h3>
        <div className="flex items-center gap-2">
          {typeof o.aigvrScore === 'number' && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300">AIGVR {o.aigvrScore}</span>
          )}
          {o.markdown && (
            <button onClick={copyMarkdown} className="text-[11px] px-2 py-0.5 rounded border border-white/10 text-gray-400 hover:border-blue-400/40 hover:text-blue-200 transition">
              Copy Markdown
            </button>
          )}
        </div>
      </div>

      {o.executiveSummary && (
        <p className="text-[13px] text-gray-300 leading-relaxed">{o.executiveSummary}</p>
      )}

      {findings.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">Key findings</div>
          <ul className="space-y-2">
            {findings.map((f, i) => (
              <li key={i} className="text-[12px] leading-snug">
                <div className="text-gray-200 font-medium">{f.finding}</div>
                {f.evidence && <div className="text-gray-500">{f.evidence}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recs.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">Recommendations</div>
          <div className="space-y-3">
            {recs.map((rec, i) => (
              <div key={i} className="rounded border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PRIORITY_STYLE[rec.priority] || PRIORITY_STYLE.P2}`}>{rec.priority}</span>
                  <span className="text-[13px] font-medium text-white">{rec.title}</span>
                </div>
                {rec.targetStage && <div className="text-[10px] text-gray-500 mb-1">→ {rec.targetStage}</div>}
                {rec.rationale && <p className="text-[12px] text-gray-400 leading-snug mb-1.5">{rec.rationale}</p>}
                {Array.isArray(rec.actions) && (
                  <ul className="space-y-0.5 mb-1.5">
                    {rec.actions.map((a: string, j: number) => (
                      <li key={j} className="text-[12px] text-gray-300 leading-snug">• {a}</li>
                    ))}
                  </ul>
                )}
                {rec.expectedImpact && <div className="text-[11px] text-emerald-300/80">Impact: {rec.expectedImpact}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {quickWins.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">Quick wins</div>
          <ul className="space-y-1">
            {quickWins.map((q, i) => (
              <li key={i} className="text-[12px] text-gray-300 leading-snug">✓ {q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
