// Daily engine liveness patrol.
//
// Two incidents in September 2026 had the same shape: an upstream condition
// (Poe points at zero on 09-07; Poe retiring Gemini-2.5-Pro on ~09-15) made
// every scan fail, and the operator learned it from a customer. The run-time
// preflight now catches both at 0% — but only when a scan is attempted. This
// patrol runs at 01:30 UTC, thirty minutes before the daily scan hour, and
// checks the things a scan depends on WITHOUT spending a scan:
//
//   · Poe /v1/models — is each bot we rely on still listed? (retirement shows
//     here first; a bot can be listed-but-500 or 200-but-delisted)
//   · a 1-token ping of every primary AND fallback model (≈8 tokens total)
//   · SerpAPI monthly quota — the other budget that ends silently
//
// Results are written to engine_health_checks (durable, queryable), and only
// conditions that change what will happen tonight raise an operator alert.
//
// One failed probe is not a verdict. 2026-10-15 01:30: GPT-4o answered 400
// "upstream gateway failure" and Gemini-3.1-Pro 503; the patrol mailed "Engine
// dead … update the engine table" and "fallback in use". GPT-4o had never left
// the model list, both answered again by 14:40, and changing the engine table
// would have changed a frozen instrument for nothing. So an engine whose
// primary fails is probed again about five minutes later, still before the
// 02:00 UTC scans, and the alert says which of three things it is:
//   · recovered on the second probe → no alert
//   · still failing, model still listed → engine_outage: wait, do not touch
//     the engine table; scans needing it may stop at 0% and need a re-run
//   · still failing, model gone from the list → engine_retired: replace it

import { poeChat, isCapacityError } from '@/lib/llm/poe';
import { ENGINES, type Engine } from '@/lib/agents/monitor';
import { notifyOperator, type OperatorAlert } from '@/lib/alerts';
import { INSTRUMENT_FREEZES } from '@/lib/engines/answer-budget';

interface ProbeOutcome {
  listed: boolean | null;   // null = the models list could not be fetched
  alive: boolean;
  latencyMs: number;
  status?: number;
  error?: string;
}
export interface ModelProbe extends ProbeOutcome {
  engine: string;
  model: string;
  role: 'primary' | 'fallback';
  /** The second probe of a model that failed (recheckEngineHealth). */
  recheck?: ProbeOutcome & { at: string };
}
export interface SerpQuota { ok: boolean; left: number | null; perMonth: number | null; used: number | null; error?: string }
export interface HealthResult {
  checkedAt: string;
  capacity: boolean;        // Poe account out of points
  listedModels: number | null;
  probes: ModelProbe[];
  serpapi: SerpQuota;
  /** Keys the patrol needs that are absent in the deployment it ran in. */
  missingEnv: string[];
  /** Which deployment ran the patrol — 'local' when not on Vercel. */
  deployment: string;
  /** Set when failed models were probed a second time. */
  recheckedAt?: string;
}

// A missing key is a property of the deployment that ran the patrol, not of
// the engines. 2026-09-24…30: the Vercel Preview deployment (Supabase keys,
// no POE_API_KEY) ran this cron via its Inngest branch environment and filed
// "Engine dead — ChatGPT, Gemini, Perplexity, Claude" every night while the
// production patrol, 40 s earlier, found all engines alive.
const REQUIRED_ENV = ['POE_API_KEY', 'SERPAPI_KEY'] as const;
const deploymentLabel = () =>
  [process.env.VERCEL_ENV ?? 'local', process.env.VERCEL_GIT_COMMIT_REF, process.env.VERCEL_URL].filter(Boolean).join(' · ');

// SerpAPI: alert when fewer than this many searches remain (≈ 20 scans at 24
// AIO queries each) or under 15% of the plan, whichever is larger.
const SERP_MIN_LEFT = 500;

async function poeModelIds(): Promise<Set<string> | null> {
  const key = process.env.POE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.poe.com/v1/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const json: any = await res.json();
    return new Set((json?.data ?? []).map((m: any) => String(m?.id ?? '').toLowerCase()).filter(Boolean));
  } catch {
    return null;
  }
}

async function probe(engine: string, model: string, role: ModelProbe['role'], listed: Set<string> | null): Promise<{ p: ModelProbe; capacity: boolean }> {
  const t0 = Date.now();
  const base: ModelProbe = { engine, model, role, listed: listed ? listed.has(model.toLowerCase()) : null, alive: false, latencyMs: 0 };
  try {
    // A liveness ping asks for 16 output tokens, never fewer. Since 2026-10-15
    // Poe's OpenAI bots reject any request with max_tokens below 16 with 400
    // "upstream gateway failure" (measured 2026-10-18 against GPT-4o: 1–12 →
    // 400, 16+ → 200, real questions answered normally), consistent with the
    // OpenAI Responses API minimum of 16 output tokens. The 1-token ping used
    // here filed "Engine dead — ChatGPT (GPT-4o: 400)" for three nights and the
    // same ping in resolveEngineModels stopped FMVN's 2026-10-16 scheduled scan
    // at 0% while the engine was alive. Gemini and Perplexity accept 1.
    await poeChat({ model, messages: [{ role: 'user', content: 'ping' }], maxTokens: 16, retries: 0 });
    return { p: { ...base, alive: true, latencyMs: Date.now() - t0 }, capacity: false };
  } catch (err) {
    const e = err as any;
    return {
      p: { ...base, alive: false, latencyMs: Date.now() - t0, status: typeof e?.status === 'number' ? e.status : undefined, error: String(e?.message ?? e).slice(0, 160) },
      capacity: isCapacityError(err),
    };
  }
}

async function serpQuota(): Promise<SerpQuota> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return { ok: true, left: null, perMonth: null, used: null, error: 'SERPAPI_KEY not set' };
  try {
    const res = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { ok: false, left: null, perMonth: null, used: null, error: `HTTP ${res.status}` };
    const j: any = await res.json();
    const left = Number(j?.total_searches_left ?? j?.plan_searches_left);
    const perMonth = Number(j?.searches_per_month);
    const used = Number(j?.this_month_usage);
    const floor = Math.max(SERP_MIN_LEFT, Number.isFinite(perMonth) ? Math.round(perMonth * 0.15) : 0);
    return { ok: !Number.isFinite(left) || left >= floor, left: Number.isFinite(left) ? left : null, perMonth: Number.isFinite(perMonth) ? perMonth : null, used: Number.isFinite(used) ? used : null };
  } catch (e) {
    return { ok: false, left: null, perMonth: null, used: null, error: String((e as Error)?.message ?? e).slice(0, 120) };
  }
}

export async function checkEngineHealth(engines: Engine[] = ENGINES): Promise<HealthResult> {
  const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
  // Without the key every probe fails identically; probing says nothing about the engines.
  const canProbe = !missingEnv.includes('POE_API_KEY');
  const listed = canProbe ? await poeModelIds() : null;
  const poeEngines = canProbe ? engines.filter((e) => e.kind === 'poe') : [];
  const results = await Promise.all(
    poeEngines.flatMap((e) => [probe(e.label, e.model, 'primary', listed), ...(e.fallbacks ?? []).map((m) => probe(e.label, m, 'fallback', listed))]),
  );
  const serpapi = await serpQuota();
  return {
    checkedAt: new Date().toISOString(),
    capacity: results.some((r) => r.capacity),
    listedModels: listed ? listed.size : null,
    probes: results.map((r) => r.p),
    serpapi,
    missingEnv,
    deployment: deploymentLabel(),
  };
}

// Long enough for a gateway blip to clear, short enough that the second look
// (01:35) still comes before the 02:00 UTC scans.
export const RECHECK_DELAY_MS = 5 * 60_000;

/** Pure: the probes worth a second look — every failed model of an engine
 *  whose primary failed. A primary down with a live fallback counts too: a
 *  frozen instrument does not switch, so for it the engine is down. Nothing
 *  when the account is out of points or the key is missing — neither is
 *  about a model. */
export function recheckTargets(r: HealthResult): ModelProbe[] {
  if (r.capacity || r.missingEnv.includes('POE_API_KEY')) return [];
  const down = new Set(r.probes.filter((p) => p.role === 'primary' && !p.alive).map((p) => p.engine));
  return r.probes.filter((p) => down.has(p.engine) && !p.alive);
}

/** Probe the recheckTargets again and attach the outcome to each probe as
 *  `recheck`, with a fresh read of the model list. The first outcome stays. */
export async function recheckEngineHealth(r: HealthResult): Promise<HealthResult> {
  const targets = recheckTargets(r);
  if (!targets.length) return r;
  const listed = await poeModelIds();
  const again = new Map(await Promise.all(targets.map(async (t) => [t, await probe(t.engine, t.model, t.role, listed)] as const)));
  const at = new Date().toISOString();
  return {
    ...r,
    recheckedAt: at,
    capacity: r.capacity || [...again.values()].some((a) => a.capacity),
    probes: r.probes.map((p) => {
      const a = again.get(p)?.p;
      if (!a) return p;
      // An unreadable list on the second look keeps what the first look saw.
      return { ...p, recheck: { at, listed: a.listed ?? p.listed, alive: a.alive, latencyMs: a.latencyMs, ...(a.status !== undefined ? { status: a.status } : {}), ...(a.error ? { error: a.error } : {}) } };
    }),
  };
}

/** Pure: which conditions deserve an operator alert. Tested without I/O. */
export function alertsFor(r: HealthResult): OperatorAlert[] {
  const out: OperatorAlert[] = [];
  if (r.missingEnv.length) {
    out.push({ kind: 'engine_config', title: `Engine patrol ran without ${r.missingEnv.join(', ')} (${r.deployment})`, detail: `The deployment that ran the patrol has no ${r.missingEnv.join(' / ')}. This says nothing about the engines. In production, scans that need the key will fail — restore it in Vercel. Anywhere else, that deployment should not be running crons at all (see cronsEnabled in lib/inngest/functions.ts).` });
    if (r.missingEnv.includes('POE_API_KEY')) return out; // no probes ran — nothing else to judge
  }
  if (r.capacity) {
    out.push({ kind: 'engine_capacity', title: 'AI engine capacity exhausted — tonight\'s scans will fail', detail: 'The engine account returned 402 on the daily patrol ping. Top up before the 02:00 UTC scan window.' });
    return out; // everything else is noise while the account is empty
  }
  const byEngine = new Map<string, ModelProbe[]>();
  for (const p of r.probes) (byEngine.get(p.engine) ?? byEngine.set(p.engine, []).get(p.engine)!).push(p);
  // The latest word on a model is its second probe, when it had one.
  const last = (p: ModelProbe): ProbeOutcome => p.recheck ?? p;
  const cause = (o: ProbeOutcome) => (o.alive ? 'ok' : String(o.status ?? o.error ?? 'dead'));
  const trail = (p: ModelProbe) => `${p.model}: ${cause(p)}${p.recheck ? (p.recheck.alive ? ', then answered' : `, again ${cause(p.recheck)}`) : ''}`;
  const minutes = r.recheckedAt ? Math.max(1, Math.round((Date.parse(r.recheckedAt) - Date.parse(r.checkedAt)) / 60_000)) : 0;
  // Projects whose instrument may not switch to a fallback (answer-budget.ts).
  const frozen = INSTRUMENT_FREEZES.filter((f) => f.noFallback && Date.parse(r.checkedAt) < Date.parse(f.until)).map((f) => `${f.label} until ${f.until}`);
  const retired: string[] = [], outage: string[] = [], onFallback: string[] = [], delisted: string[] = [];
  let listUnread = false;
  for (const [engine, probes] of byEngine) {
    const primary = probes.find((p) => p.role === 'primary')!;
    const liveFallback = probes.find((p) => p.role === 'fallback' && last(p).alive);
    const now = last(primary);
    if (!now.alive && !liveFallback) {
      // Only a model gone from the provider's list is retired. Listed, or a
      // list that could not be read, is an outage until shown otherwise.
      if (now.listed === false) retired.push(engine);
      else { outage.push(engine); if (now.listed === null) listUnread = true; }
    } else if (!now.alive && liveFallback) onFallback.push(engine);
    else if (now.alive && now.listed === false) delisted.push(engine);
  }
  const named = (engines: string[]) => engines.map((e) => `${e} (${byEngine.get(e)!.map(trail).join(', ')})`).join('; ');
  if (retired.length) out.push({ kind: 'engine_retired', title: `Engine dead — scans will fail: ${retired.join(', ')}`, detail: `No live model (primary or fallback) for: ${named(retired)}; the primary is no longer in the provider's model list. Update the engine table in lib/agents/monitor.ts before the 02:00 UTC scan window.${frozen.length ? ` For ${frozen.join(', ')} a new model is a new instrument: agree it with the client first.` : ''}` });
  if (outage.length) out.push({ kind: 'engine_outage', title: `Upstream outage, model still listed — do not change the engine table: ${outage.join(', ')}`, detail: `${named(outage)}. ${minutes ? `Failed again on a second probe ${minutes} min later` : 'Failed on the patrol probe (no second probe was taken)'}, ${listUnread ? 'and the provider\'s model list could not be read, so a retirement is not confirmed — check /v1/models before changing anything' : 'yet the model is still in the provider\'s model list'}: an upstream outage, not a retirement. Do not change the engine table in lib/agents/monitor.ts. While it lasts, the 02:00 UTC scans that use this engine stop at 0% (nothing charged, no partial reading written) and need a re-run the same day; a scheduled scan is queued again once, about 3 h after it stops.` });
  if (onFallback.length) out.push({ kind: 'engine_fallback', title: `Engine primary down — fallback in use: ${onFallback.map((e) => `${e}: ${byEngine.get(e)!.find((p) => p.role === 'primary')!.model} → ${byEngine.get(e)!.find((p) => p.role === 'fallback' && last(p).alive)!.model}`).join('; ')}`, detail: `${named(onFallback)}. Scans will run on the fallback model. That is a methodology change (the digest annotates it automatically); decide whether to promote the fallback or restore the primary.${frozen.length ? ` Not for ${frozen.join(', ')}: a frozen instrument does not switch models, so those scans stop at 0% while the primary is down (a scheduled one is queued again once, about 3 h later).` : ''}` });
  if (delisted.length) out.push({ kind: 'engine_retired', title: `Engine model delisted upstream (still answering): ${delisted.map((e) => `${e}: ${byEngine.get(e)!.find((p) => p.role === 'primary')!.model}`).join('; ')}`, detail: 'The bot answers today but is no longer in the provider\'s model list — retirement is usually days away. Pick a replacement now.' });
  if (!r.serpapi.ok) out.push({ kind: 'serpapi_quota', title: `SerpAPI quota low: ${r.serpapi.left ?? '?'} of ${r.serpapi.perMonth ?? '?'} searches left`, detail: `Google AI Overview queries stop when this reaches zero (≈24 per scan). ${r.serpapi.error ?? ''}`.trim() });
  return out;
}

/** Persist one patrol result and raise its alerts. */
export async function recordPatrol(sb: any, result: HealthResult): Promise<{ healthy: boolean; alerts: string[]; result: HealthResult }> {
  const alerts = alertsFor(result);
  await sb.from('engine_health_checks').insert({
    checked_at: result.checkedAt,
    healthy: alerts.length === 0,
    capacity: result.capacity,
    probes: result.probes,
    serpapi: result.serpapi,
    alerts: alerts.map((a) => a.kind),
  });
  for (const a of alerts) await notifyOperator(a).catch((e) => console.error('[engine-patrol] alert failed:', e));
  return { healthy: alerts.length === 0, alerts: alerts.map((a) => a.title), result };
}

/** The whole patrol in one call (operator endpoint): check → second probe of
 *  what failed, right away → persist → alert. The 01:30 cron runs the same
 *  steps with RECHECK_DELAY_MS between the probes (lib/inngest/functions.ts). */
export async function runEnginePatrol(sb: any): Promise<{ healthy: boolean; alerts: string[]; result: HealthResult }> {
  return recordPatrol(sb, await recheckEngineHealth(await checkEngineHealth()));
}
