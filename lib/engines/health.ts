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

import { poeChat, isCapacityError } from '@/lib/llm/poe';
import { ENGINES, type Engine } from '@/lib/agents/monitor';
import { notifyOperator, type OperatorAlert } from '@/lib/alerts';

export interface ModelProbe {
  engine: string;
  model: string;
  role: 'primary' | 'fallback';
  listed: boolean | null;   // null = the models list could not be fetched
  alive: boolean;
  latencyMs: number;
  status?: number;
  error?: string;
}
export interface SerpQuota { ok: boolean; left: number | null; perMonth: number | null; used: number | null; error?: string }
export interface HealthResult {
  checkedAt: string;
  capacity: boolean;        // Poe account out of points
  listedModels: number | null;
  probes: ModelProbe[];
  serpapi: SerpQuota;
}

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

async function probe(engine: Engine, model: string, role: ModelProbe['role'], listed: Set<string> | null): Promise<{ p: ModelProbe; capacity: boolean }> {
  const t0 = Date.now();
  const base: ModelProbe = { engine: engine.label, model, role, listed: listed ? listed.has(model.toLowerCase()) : null, alive: false, latencyMs: 0 };
  try {
    await poeChat({ model, messages: [{ role: 'user', content: 'ping' }], maxTokens: 1, retries: 0 });
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
  const listed = await poeModelIds();
  const poeEngines = engines.filter((e) => e.kind === 'poe');
  const results = await Promise.all(
    poeEngines.flatMap((e) => [probe(e, e.model, 'primary', listed), ...(e.fallbacks ?? []).map((m) => probe(e, m, 'fallback', listed))]),
  );
  const serpapi = await serpQuota();
  return {
    checkedAt: new Date().toISOString(),
    capacity: results.some((r) => r.capacity),
    listedModels: listed ? listed.size : null,
    probes: results.map((r) => r.p),
    serpapi,
  };
}

/** Pure: which conditions deserve an operator alert. Tested without I/O. */
export function alertsFor(r: HealthResult): OperatorAlert[] {
  const out: OperatorAlert[] = [];
  if (r.capacity) {
    out.push({ kind: 'engine_capacity', title: 'AI engine capacity exhausted — tonight\'s scans will fail', detail: 'The engine account returned 402 on the daily patrol ping. Top up before the 02:00 UTC scan window.' });
    return out; // everything else is noise while the account is empty
  }
  const byEngine = new Map<string, ModelProbe[]>();
  for (const p of r.probes) (byEngine.get(p.engine) ?? byEngine.set(p.engine, []).get(p.engine)!).push(p);
  const dead: string[] = [], onFallback: string[] = [], delisted: string[] = [];
  for (const [engine, probes] of byEngine) {
    const primary = probes.find((p) => p.role === 'primary')!;
    const liveFallback = probes.find((p) => p.role === 'fallback' && p.alive);
    if (!primary.alive && !liveFallback) dead.push(`${engine} (${probes.map((p) => `${p.model}: ${p.status ?? p.error ?? 'dead'}`).join(', ')})`);
    else if (!primary.alive && liveFallback) onFallback.push(`${engine}: ${primary.model} → ${liveFallback.model}`);
    else if (primary.alive && primary.listed === false) delisted.push(`${engine}: ${primary.model}`);
  }
  if (dead.length) out.push({ kind: 'engine_retired', title: `Engine dead — scans will fail: ${dead.map((d) => d.split(' ')[0]).join(', ')}`, detail: `No live model (primary or fallback) for: ${dead.join('; ')}. Update the engine table in lib/agents/monitor.ts before the 02:00 UTC scan window.` });
  if (onFallback.length) out.push({ kind: 'engine_fallback', title: `Engine primary down — fallback in use: ${onFallback.join('; ')}`, detail: 'Scans will run on the fallback model. That is a methodology change (the digest annotates it automatically); decide whether to promote the fallback or restore the primary.' });
  if (delisted.length) out.push({ kind: 'engine_retired', title: `Engine model delisted upstream (still answering): ${delisted.join('; ')}`, detail: 'The bot answers today but is no longer in the provider\'s model list — retirement is usually days away. Pick a replacement now.' });
  if (!r.serpapi.ok) out.push({ kind: 'serpapi_quota', title: `SerpAPI quota low: ${r.serpapi.left ?? '?'} of ${r.serpapi.perMonth ?? '?'} searches left`, detail: `Google AI Overview queries stop when this reaches zero (≈24 per scan). ${r.serpapi.error ?? ''}`.trim() });
  return out;
}

/** Run the patrol: check → persist → alert. Returns a compact summary. */
export async function runEnginePatrol(sb: any): Promise<{ healthy: boolean; alerts: string[]; result: HealthResult }> {
  const result = await checkEngineHealth();
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
