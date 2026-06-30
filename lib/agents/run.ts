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
import { runDistributeAgent } from './distribute';
import { runSiteAgent } from './site';
import { runEncyclopediaAgent } from './encyclopedia';
import { runProfileAgent } from './profile';

// Load the latest canonical brand profile (if any) so execution agents share
// consistent facts. Returns null when none exists yet.
async function loadBrandProfile(sb: ReturnType<typeof svc>, projectId: string): Promise<any | null> {
  const { data } = await sb
    .from('assets')
    .select('content')
    .eq('project_id', projectId)
    .eq('type', 'brand_profile')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.content) return null;
  try {
    return JSON.parse(data.content);
  } catch {
    return null;
  }
}

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

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

// Persist this scan's citations to the Source-Authority Index and return the
// CROSS-SCAN ranking (which domains the engines cite most for this project,
// across all scans so far). The compounding GEO-native authority signal.
async function recordCitationsAndIndex(
  sb: ReturnType<typeof svc>,
  projectId: string,
  agentRunId: string,
  brandDomain: string,
  rawSamples: { engine?: string; stage?: string; citations?: string[] }[],
): Promise<{ ranking: { domain: string; citations: number; engines: number; isBrand: boolean }[]; totalCitations: number }> {
  const rows: Record<string, unknown>[] = [];
  for (const s of rawSamples || []) {
    for (const url of s.citations || []) {
      const dom = domainOf(url);
      if (!dom) continue;
      rows.push({
        project_id: projectId,
        agent_run_id: agentRunId,
        engine: s.engine ?? 'unknown',
        stage: s.stage ?? null,
        domain: dom,
        url,
        is_brand_domain: !!brandDomain && dom === brandDomain,
      });
    }
  }
  if (rows.length) await sb.from('geo_citations').insert(rows);

  const { data } = await sb
    .from('geo_citations')
    .select('domain,engine,is_brand_domain')
    .eq('project_id', projectId);
  const map = new Map<string, { citations: number; engines: Set<string>; isBrand: boolean }>();
  for (const r of data || []) {
    const e = map.get(r.domain) || { citations: 0, engines: new Set<string>(), isBrand: false };
    e.citations++;
    e.engines.add(r.engine);
    e.isBrand = e.isBrand || r.is_brand_domain;
    map.set(r.domain, e);
  }
  const ranking = Array.from(map.entries())
    .map(([domain, e]) => ({ domain, citations: e.citations, engines: e.engines.size, isBrand: e.isBrand }))
    .sort((a, b) => b.citations - a.citations)
    .slice(0, 20);
  return { ranking, totalCitations: (data || []).length };
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

// Minimal shape of the Inngest `step` we use — passed through so long cascades
// checkpoint per phase (separate short invocations, durable resume). Loosely
// typed because Inngest's step.run returns Jsonify<T> (it serializes results);
// our agent outputs are plain JSON so the round-trip is lossless.
type StepRunner = { run: (id: string, fn: () => Promise<any>) => Promise<any> };

// Run the agent end-to-end: emit events, finalize status, persist assets.
export async function executeAgentRun(
  runId: string,
  agentId: string,
  project: ProjectLite,
  emit: Emitter,
  step?: StepRunner,
): Promise<void> {
  const sb = svc();

  // The user's typed instruction (intent box / chat) — steers Discovery.
  const { data: runRow } = await sb.from('agent_runs').select('input_prompt').eq('id', runId).maybeSingle();
  const userPrompt: string | undefined = runRow?.input_prompt || undefined;

  // step.run when running under Inngest, else a passthrough (direct call/test).
  // IMPORTANT: everything with a side effect inside a cascade must live INSIDE a
  // step — Inngest re-executes code OUTSIDE steps on every resume, which would
  // duplicate events/assets. A completed step is skipped (memoized) on resume.
  const runStep: (id: string, fn: () => Promise<any>) => Promise<any> = step
    ? (id, fn) => step.run(id, fn)
    : (_id, fn) => fn();

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
        userPrompt,
      };

      // Each phase is one Inngest step → its own short invocation, durable
      // resume. All side effects (emit + asset insert) live INSIDE the step so
      // they run exactly once even if a later phase resumes the function.
      const disc = await runStep('phase-discovery', async () => {
        await persistAndEmit({ event_type: 'milestone', payload: { label: 'Phase 1/3 · Discovery', step: 1, totalSteps: 3 } });
        const d = await runDiscoveryAgent(base, bandedEmit(0, 33));
        await sb.from('assets').insert({
          project_id: project.id, agent_run_id: runId, type: 'prompt_set',
          title: `${project.brand_name} — Discovery prompt set`, format: 'json',
          content: JSON.stringify(d.output, null, 2),
          meta: { brand: project.brand_name, country: project.target_country },
        });
        return d;
      });

      const mon = await runStep('phase-monitor', async () => {
        await persistAndEmit({ event_type: 'milestone', payload: { label: 'Phase 2/3 · Monitor', step: 2, totalSteps: 3 } });
        const promptSet = ((disc.output as { promptSet?: unknown[] }).promptSet as { category: string; label: string; prompts: string[] }[]) || [];
        const keyPrompts = ((disc.output as { keyPrompts?: unknown[] }).keyPrompts as string[]) || [];
        // No nested stepper: this whole phase is already one step.
        const m = await runMonitorAgent({ ...base, promptSet, keyPrompts }, bandedEmit(33, 33));
        const sa = await recordCitationsAndIndex(sb, project.id, runId, domainOf(project.brand_url || ''), (m.output as { rawSamples?: any[] }).rawSamples || []);
        (m.output as Record<string, unknown>).sourceAuthority = sa;
        await sb.from('assets').insert({
          project_id: project.id, agent_run_id: runId, type: 'geo_scorecard',
          title: `${project.brand_name} — GEO visibility scorecard`, format: 'json',
          content: JSON.stringify(m.output, null, 2),
          meta: { brand: project.brand_name, country: project.target_country },
        });
        return m;
      });

      const rep = await runStep('phase-report', async () => {
        await persistAndEmit({ event_type: 'milestone', payload: { label: 'Phase 3/3 · Report', step: 3, totalSteps: 3 } });
        const r = await runReportAgent({ ...base, scorecard: mon.output }, bandedEmit(66, 34));
        await sb.from('assets').insert({
          project_id: project.id, agent_run_id: runId, type: 'geo_report',
          title: `${project.brand_name} — GEO visibility report`, format: 'markdown',
          content: (r.output as { markdown?: string }).markdown ?? JSON.stringify(r.output, null, 2),
          meta: { brand: project.brand_name, country: project.target_country },
        });
        return r;
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
          userPrompt,
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
      let keyPrompts: string[] = [];
      try {
        const ps = JSON.parse(psAsset.content);
        promptSet = ps?.promptSet ?? [];
        keyPrompts = Array.isArray(ps?.keyPrompts) ? ps.keyPrompts : [];
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
          keyPrompts,
        },
        persistAndEmit,
      );
      const sa = await recordCitationsAndIndex(sb, project.id, runId, domainOf(project.brand_url || ''), (result.output as { rawSamples?: any[] }).rawSamples || []);
      (result.output as Record<string, unknown>).sourceAuthority = sa;
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
          brandProfile: await loadBrandProfile(sb, project.id),
        },
        persistAndEmit,
      );
    } else if (agentId === 'distribute') {
      // Distribute turns the Source-Authority targets into submission assets.
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
      const sources = (scorecard.sourceAuthority?.ranking || []) as { domain: string; citations: number; isBrand: boolean }[];
      result = await runDistributeAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
          sources,
          competitors: scorecard.competitors,
          brandProfile: await loadBrandProfile(sb, project.id),
        },
        persistAndEmit,
      );
    } else if (agentId === 'site') {
      // Homepage AEO upgrade — no prerequisite; fetches the brand site itself.
      result = await runSiteAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
          brandProfile: await loadBrandProfile(sb, project.id),
        },
        persistAndEmit,
      );
    } else if (agentId === 'encyclopedia') {
      // Encyclopedia: notability assessment + entry/path. Grounds notability on
      // the Source-Authority sources if a scorecard exists (optional).
      const { data: scAsset } = await sb
        .from('assets')
        .select('content')
        .eq('project_id', project.id)
        .eq('type', 'geo_scorecard')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      let sources: { domain: string; citations: number; isBrand: boolean }[] = [];
      if (scAsset?.content) {
        try {
          sources = JSON.parse(scAsset.content)?.sourceAuthority?.ranking ?? [];
        } catch {
          /* optional grounding — ignore */
        }
      }
      result = await runEncyclopediaAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
          sources,
          brandProfile: await loadBrandProfile(sb, project.id),
        },
        persistAndEmit,
      );
    } else if (agentId === 'profile') {
      // Canonical brand profile — fetches the site; grounds on Discovery /
      // Monitor hints if present. No hard prerequisite.
      let subVerticals: string[] = [];
      let competitors: string[] = [];
      const { data: psA } = await sb.from('assets').select('content').eq('project_id', project.id).eq('type', 'prompt_set').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (psA?.content) { try { subVerticals = JSON.parse(psA.content)?.subVerticals ?? []; } catch { /* ignore */ } }
      const { data: scA } = await sb.from('assets').select('content').eq('project_id', project.id).eq('type', 'geo_scorecard').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (scA?.content) { try { competitors = JSON.parse(scA.content)?.competitors ?? []; } catch { /* ignore */ } }
      result = await runProfileAgent(
        {
          brandName: project.brand_name,
          brandUrl: project.brand_url,
          targetCountry: project.target_country,
          targetLanguage: project.target_language,
          industry: project.industry,
          hints: { subVerticals, competitors },
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
    } else if (agentId === 'distribute') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'distribution_kit',
        title: `${project.brand_name} — GEO distribution kit`,
        format: 'markdown',
        content: (result.output as { fullMarkdown?: string }).fullMarkdown ?? JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });
    } else if (agentId === 'site') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'site_optimization',
        title: `${project.brand_name} — homepage AEO upgrade`,
        format: 'markdown',
        content: (result.output as { fullMarkdown?: string }).fullMarkdown ?? JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });
    } else if (agentId === 'encyclopedia') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'encyclopedia_entry',
        title: `${project.brand_name} — encyclopedia entry & path`,
        format: 'markdown',
        content: (result.output as { fullMarkdown?: string }).fullMarkdown ?? JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
      });
    } else if (agentId === 'profile') {
      await sb.from('assets').insert({
        project_id: project.id,
        agent_run_id: runId,
        type: 'brand_profile',
        title: `${project.brand_name} — canonical brand profile`,
        format: 'json',
        content: JSON.stringify(result.output, null, 2),
        meta: { brand: project.brand_name, country: project.target_country },
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
