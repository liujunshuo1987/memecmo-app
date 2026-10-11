// Regression cases for alertsFor (run: npx tsx scripts/test-engine-alerts.ts)
import { alertsFor, type HealthResult, type ModelProbe } from '../lib/engines/health';
let fails = 0;
const check = (name: string, got: unknown, ok: boolean) => {
  if (ok) console.log('ok  ', name); else { fails++; console.log('FAIL', name, JSON.stringify(got).slice(0, 200)); }
};
const p = (engine: string, model: string, role: ModelProbe['role'], alive: boolean, extra: Partial<ModelProbe> = {}): ModelProbe =>
  ({ engine, model, role, listed: true, alive, latencyMs: 1, ...extra });
const base = (over: Partial<HealthResult> = {}): HealthResult => ({
  checkedAt: '2026-09-30T01:30:00Z', capacity: false, listedModels: 300,
  probes: [p('ChatGPT', 'GPT-4o', 'primary', true), p('Gemini', 'Gemini-3.1-Pro', 'primary', true), p('Gemini', 'Gemini-3.5-Flash', 'fallback', true)],
  serpapi: { ok: true, left: 4000, perMonth: 5000, used: 1000 }, missingEnv: [], deployment: 'production', ...over,
});
const kinds = (r: HealthResult) => alertsFor(r).map((a) => a.kind);

// 1. healthy day → no alerts
check('healthy', kinds(base()), kinds(base()).length === 0);
// 2. the 2026-09-24…30 preview run: no key, no probes → config alert only, never "engine dead"
const preview = base({ probes: [], listedModels: null, missingEnv: ['POE_API_KEY', 'SERPAPI_KEY'], deployment: 'preview · work/2026-09-platform', serpapi: { ok: true, left: null, perMonth: null, used: null, error: 'SERPAPI_KEY not set' } });
check('missing POE key → engine_config only', alertsFor(preview), JSON.stringify(kinds(preview)) === '["engine_config"]' && alertsFor(preview)[0].title.includes('preview'));
// 3. only SerpAPI key missing → config alert, engines still judged
const noSerp = base({ missingEnv: ['SERPAPI_KEY'], probes: [p('ChatGPT', 'GPT-4o', 'primary', false, { status: 500 })] });
check('missing SERPAPI key → config + engine verdicts', kinds(noSerp), JSON.stringify(kinds(noSerp)) === '["engine_config","engine_retired"]');
// 4. genuine dead engine with the key present → engine_retired
const dead = base({ probes: [p('Gemini', 'Gemini-3.1-Pro', 'primary', false, { status: 500 }), p('Gemini', 'Gemini-3.5-Flash', 'fallback', false, { status: 500 })] });
check('dead engine → engine_retired', kinds(dead), JSON.stringify(kinds(dead)) === '["engine_retired"]');
// 5. primary down, fallback alive → engine_fallback
const fb = base({ probes: [p('Gemini', 'Gemini-3.1-Pro', 'primary', false, { status: 500 }), p('Gemini', 'Gemini-3.5-Flash', 'fallback', true)] });
check('fallback in use', kinds(fb), JSON.stringify(kinds(fb)) === '["engine_fallback"]');
// 6. capacity short-circuits everything else
check('capacity only', kinds(base({ capacity: true })), JSON.stringify(kinds(base({ capacity: true }))) === '["engine_capacity"]');
// 7. alive but delisted → engine_retired (imminent)
const delisted = base({ probes: [p('ChatGPT', 'GPT-4o', 'primary', true, { listed: false })] });
check('delisted but alive', kinds(delisted), JSON.stringify(kinds(delisted)) === '["engine_retired"]');
// 8. SerpAPI low
const serpLow = base({ serpapi: { ok: false, left: 100, perMonth: 5000, used: 4900 } });
check('serpapi low', kinds(serpLow), JSON.stringify(kinds(serpLow)) === '["serpapi_quota"]');

console.log(fails ? `\n${fails} failing` : '\nall passing');
process.exit(fails ? 1 : 0);
