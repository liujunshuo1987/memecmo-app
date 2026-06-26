// Agent dispatcher — runs an agent for a given run row, emitting events
// through whatever emitter is supplied, and finalizes the run + assets.
//
// Designed to be invoked from the SSE stream endpoint: that endpoint is a
// long-lived streaming response, so the serverless function stays alive for
// the agent's full duration (unlike a fire-and-forget after an HTTP return,
// which Vercel freezes immediately).

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { AGENTS } from './registry';
import { runDiscoveryAgent } from './discovery';
import { runMonitorAgent } from './monitor';
import { runReportAgent } from './report';
import { runOptimizeAgent } from './optimize';

export type AgentEvent = {
  event_type:
    | 'log'
    | 'tool_call'
    | 'tool_result'
    | 'progress'
    | 'output_chunk'
    | 'error'
    | 'milestone';
  payload: Record<string, unknown>;
};

export type Emitter = (event: AgentEvent) => Promise<void>;

interface ProjectLite {
  id: string;
  brand_name: string;
  brand_url: string | null;
  target_country: string;
  target_language: string | null;
  industry: string | null;
}

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Atomically claim a queued run (queued → running). Returns true if we won
// the claim (and should run the agent), false if someone else already did.
export async function claimRun(runId: string): Promise<boolean> {
  const sb = svc();
  const { data } = await sb
    .from('agent_runs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('status', 'queued')
    .select('id');
  return !!data && data.length > 0;
}

// Run the agent end-to-end: emit events, finalize status, persist assets.
export async function executeAgentRun(
  runId: string,
  agentId: string,
  project: ProjectLite,
  emit: Emitter,
): Promise<void> {
  const sb = svc();

  // Combined emitter: persist to DB (for history/replay) + caller's emitter.
  const persistAndEmit: Emitter = async (event) => {
    await sb.from('agent_run_events').insert({
      agent_run_id: runId,
      event_type: event.event_type,
      payload: event.payload,
    });
    // Mirror progress events onto the run row so the UI progress bar moves
    // smoothly instead of jumping 0 → 100 at completion.
    if (event.event_type === 'progress' && typeof event.payload?.pct === 'number') {
      await sb.from('agent_runs').update({ progress_pct: event.payload.pct }).eq('id', runId);
    }
    await emit(event);
  };

  // Phase-banded emitter for the cascade: remaps a sub-agent's 0-100 progress
  // into a slice [base, base+span] of the overall bar so it advances
  // monotonically across the three phases instead of resetting each time.
  const bandedEmit = (base: number, span: number): Emitter => async (event) => {
    const pct = (event.payload as { pct?: number })?.pct;
    if (event.event_type === 'progress' && typeof pct === 'number') {
      await persistAndEmit({ ...event, payload: { ...event.payload, pct: Math.round(base + (pct / 100) * span) } });
    } else {
      await persistAndEmit(event);
    }
  };

  try {
    let result: { summary: string; output: Record<string, unknown> };

    if (agentId === 'full_scan') {
      // One-click cascade: Discovery → Monitor → Report, all into this one run.
      const base = {
        brandName: project.brand_name,
        brandUrl: project.brand_url,
        targetCountry: project.target_country,
        targetLanguage: project.target_language,
        industry: project.industry,
      };

      await persistAndEmit({ event_type: 'milestone', payload: { label: 'Phase 1/3 · Discovery', step: 1, totalSteps: 3 } });
      const disc = await runDiscoveryAgent(base, bandedEmit(0, 33));
      await sb.from('assets').insert({
        project_id: project.id, agent_run_id: runId, type: 'prompt_set',
        title: `${project.brand_name} — Discovery prompt set`, format: 'json',
        content: JSON.stringify(disc.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });

      await persistAndEmit({ event_type: 'milestone', payload: { label: 'Phase 2/3 · Monitor', step: 2, totalSteps: 3 } });
      const promptSet = ((disc.output as { promptSet?: unknown[] }).promptSet as { category: string; label: string; prompts: string[] }[]) || [];
      const mon = await runMonitorAgent({ ...base, promptSet }, bandedEmit(33, 33));
      await sb.from('assets').insert({
        project_id: project.id, agent_run_id: runId, type: 'geo_scorecard',
        title: `${project.brand_name} — GEO visibility scorecard`, format: 'json',
        content: JSON.stringify(mon.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });

      await persistAndEmit({ event_type: 'milestone', payload: { label: 'Phase 3/3 · Report', step: 3, totalSteps: 3 } });
      const rep = await runReportAgent({ ...base, scorecard: mon.output }, bandedEmit(66, 34));
      await sb.from('assets').insert({
        project_id: project.id, agent_run_id: runId, type: 'geo_report',
        title: `${project.brand_name} — GEO visibility report`, format: 'markdown',
        content: (rep.output as { markdown?: string }).markdown ?? JSON.stringify(rep.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });

      result = {
        summary: rep.summary,
        output: { aigvrScore: (mon.output as { aigvrScore?: number }).aigvrScore, scorecard: mon.output, report: rep.output },
      };
    } else if (agentId === 'discovery') {
      result = await runDiscoveryAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
        },
        persistAndEmit,
      );
    } else if (agentId === 'monitor') {
      // Monitor measures the latest Discovery prompt set against AI engines.
      const { data: psAsset } = await sb
        .from('assets')
        .select('content')
        .eq('project_id', project.id)
        .eq('type', 'prompt_set')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!psAsset?.content) {
        throw new Error('No Discovery prompt set found for this project. Run Discovery first.');
      }
      let promptSet: { category: string; label: string; prompts: string[] }[] = [];
      try {
        promptSet = JSON.parse(psAsset.content)?.promptSet ?? [];
      } catch {
        throw new Error('Discovery prompt set asset is corrupted — re-run Discovery.');
      }
      if (!promptSet.length) {
        throw new Error('Discovery prompt set is empty — re-run Discovery.');
      }
      result = await runMonitorAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
          promptSet,
        },
        persistAndEmit,
      );
    } else if (agentId === 'report') {
      // Report turns the latest Monitor scorecard into a client deliverable.
      const { data: scAsset } = await sb
        .from('assets')
        .select('content')
        .eq('project_id', project.id)
        .eq('type', 'geo_scorecard')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!scAsset?.content) {
        throw new Error('No Monitor scorecard found for this project. Run Monitor first.');
      }
      let scorecard: unknown;
      try {
        scorecard = JSON.parse(scAsset.content);
      } catch {
        throw new Error('Monitor scorecard asset is corrupted — re-run Monitor.');
      }
      result = await runReportAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
          scorecard,
        },
        persistAndEmit,
      );
    } else if (agentId === 'optimize') {
      // Optimize turns the top measured gap into a publish-ready content asset.
      const { data: scAsset } = await sb
        .from('assets')
        .select('content')
        .eq('project_id', project.id)
        .eq('type', 'geo_scorecard')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!scAsset?.content) {
        throw new Error('No Monitor scorecard found. Run Monitor (or Full Scan) first.');
      }
      let scorecard: any;
      try {
        scorecard = JSON.parse(scAsset.content);
      } catch {
        throw new Error('Scorecard asset corrupted — re-run Monitor.');
      }

      const order = ['discovery', 'consideration', 'evaluation', 'competitive', 'trust'];
      const rank = (s: string) => {
        const i = order.indexOf(s);
        return i < 0 ? 99 : i;
      };
      const gaps = (scorecard.gaps || []) as { prompt: string; stage: string; competitorsPresent?: string[] }[];
      let target: { query: string; stage: string; competitors?: string[] };
      if (gaps.length) {
        const g = [...gaps].sort((a, b) => rank(a.stage) - rank(b.stage))[0];
        target = { query: g.prompt, stage: g.stage, competitors: g.competitorsPresent };
      } else {
        // No gap → target the lowest-presence stage's first prompt.
        const { data: psAsset } = await sb
          .from('assets')
          .select('content')
          .eq('project_id', project.id)
          .eq('type', 'prompt_set')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const perStage = (scorecard.metrics?.perStage || []) as { stage: string; presence: number }[];
        const weakest = [...perStage].sort((a, b) => a.presence - b.presence)[0];
        let q = '';
        if (psAsset?.content) {
          try {
            const ps = (JSON.parse(psAsset.content).promptSet || []) as { category: string; prompts: string[] }[];
            const cat = ps.find((c) => c.category === weakest?.stage) || ps[0];
            q = cat?.prompts?.[0] || '';
          } catch {
            /* ignore */
          }
        }
        if (!q) throw new Error('No gap and no prompt available to optimize. Run Discovery + Monitor first.');
        target = { query: q, stage: weakest?.stage || 'discovery' };
      }

      result = await runOptimizeAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
          target,
        },
        persistAndEmit,
      );
    } else {
      const def = AGENTS[agentId];
      await persistAndEmit({
        event_type: 'log',
        payload: { text: `${def?.displayName ?? agentId} — not yet implemented in v0.5. Stub run.` },
      });
      await persistAndEmit({ event_type: 'progress', payload: { pct: 100 } });
      result = {
        summary: `${def?.displayName ?? agentId} stub run completed (v0.5 placeholder).`,
        output: { stub: true, agent: agentId },
      };
    }

    await sb
      .from('agent_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress_pct: 100,
        summary: result.summary,
        output: result.output,
      })
      .eq('id', runId);

    if (agentId === 'discovery') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'prompt_set',
        title: `${project.brand_name} — Discovery prompt set`,
        format: 'json',
        content: JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });
    } else if (agentId === 'monitor') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'geo_scorecard',
        title: `${project.brand_name} — GEO visibility scorecard`,
        format: 'json',
        content: JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });
    } else if (agentId === 'report') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'geo_report',
        title: `${project.brand_name} — GEO visibility report`,
        format: 'markdown',
        content: (result.output as { markdown?: string }).markdown ?? JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });
    } else if (agentId === 'optimize') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'content_draft',
        title: `${project.brand_name} — ${(result.output as { title?: string }).title ?? 'GEO content draft'}`,
        format: 'markdown',
        content: (result.output as { fullMarkdown?: string }).fullMarkdown ?? JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, targetQuery: (result.output as { targetQuery?: string }).targetQuery },
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await persistAndEmit({ event_type: 'error', payload: { message: msg } });
    await sb
      .from('agent_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: msg,
      })
      .eq('id', runId);
  }
}
