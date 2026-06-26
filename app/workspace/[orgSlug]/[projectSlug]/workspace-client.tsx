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
      setRunStatus({ status: 'queued', progress_pct: 0, summary: null });
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
            {turns.map((t) => (
              <div
                key={t.id}
                className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                    t.role === 'user'
                      ? 'bg-blue-600/30 text-blue-50 border border-blue-500/30'
                      : t.role === 'assistant'
                      ? 'bg-white/[0.03] text-gray-100 border border-white/10'
                      : 'bg-transparent text-gray-500 border border-white/5 italic text-xs'
                  }`}
                >
                  {t.content}
                </div>
              </div>
            ))}
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
              v0.7 — Discovery (real LLM) &amp; Monitor (live ChatGPT / Gemini / Perplexity
              share-of-voice) are wired. Report composer is next.
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
