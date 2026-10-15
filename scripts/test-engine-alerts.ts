// Regression cases for alertsFor (run: npx tsx scripts/test-engine-alerts.ts)
import { alertsFor, recheckTargets, type HealthResult, type ModelProbe } from '../lib/engines/health';
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
// 3. only SerpAPI key missing → config alert, engines still judged (a failing
//    model that is still listed is an outage, not a retirement)
const noSerp = base({ missingEnv: ['SERPAPI_KEY'], probes: [p('ChatGPT', 'GPT-4o', 'primary', false, { status: 500 })] });
check('missing SERPAPI key → config + engine verdicts', kinds(noSerp), JSON.stringify(kinds(noSerp)) === '["engine_config","engine_outage"]');
// 4. dead engine whose primary is gone from the model list → engine_retired
const dead = base({ probes: [p('Gemini', 'Gemini-3.1-Pro', 'primary', false, { status: 500, listed: false }), p('Gemini', 'Gemini-3.5-Flash', 'fallback', false, { status: 500 })] });
check('dead + delisted → engine_retired', kinds(dead), JSON.stringify(kinds(dead)) === '["engine_retired"]');
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

// ── Second probe (2026-10-15: one failed probe mailed "Engine dead … update the
//    engine table" for a model that never left the list) ─────────────────────
const AT2 = '2026-10-15T01:35:12Z';
const again = (alive: boolean, extra: Partial<NonNullable<ModelProbe['recheck']>> = {}): Partial<ModelProbe> =>
  ({ recheck: { at: AT2, alive, listed: true, latencyMs: 1, ...extra } });
const day = (probes: ModelProbe[], over: Partial<HealthResult> = {}) => base({ checkedAt: '2026-10-15T01:30:04Z', recheckedAt: AT2, probes, ...over });
const engineTable = (a: { detail: string }) => /Update the engine table/.test(a.detail);

// 9. failing twice, still listed → engine_outage: wait, do NOT touch the table
const out1 = day([p('ChatGPT', 'GPT-4o', 'primary', false, { status: 400, ...again(false, { status: 400 }) })]);
const out1a = alertsFor(out1);
check('outage: fails twice, still listed → engine_outage', out1a, JSON.stringify(kinds(out1)) === '["engine_outage"]'
  && /do not change the engine table/i.test(out1a[0].title) && /not a retirement/.test(out1a[0].detail)
  && /stop at 0%/.test(out1a[0].detail) && /re-run the same day/.test(out1a[0].detail)
  && /5 min later/.test(out1a[0].detail) && !engineTable(out1a[0]));
// 10. failing twice, gone from the list → engine_retired, current wording kept
const ret1 = day([p('ChatGPT', 'GPT-4o', 'primary', false, { status: 404, ...again(false, { status: 404, listed: false }) })]);
const ret1a = alertsFor(ret1);
check('retired: fails twice, delisted → engine_retired', ret1a, JSON.stringify(kinds(ret1)) === '["engine_retired"]'
  && ret1a[0].title.startsWith('Engine dead — scans will fail: ChatGPT') && /Update the engine table in lib\/agents\/monitor\.ts/.test(ret1a[0].detail));
// 11. answers on the second probe → no alert at all
const rec1 = day([p('ChatGPT', 'GPT-4o', 'primary', false, { status: 400, ...again(true) })]);
check('recovered on second probe → no alert', alertsFor(rec1), kinds(rec1).length === 0);
// 12. the 2026-10-15 01:30 patrol replayed: GPT-4o 400 twice (listed), Gemini
//     primary 503 then fine, Flash fine → one outage alert, no fallback alert
const oct15 = day([
  p('ChatGPT', 'GPT-4o', 'primary', false, { status: 400, error: 'upstream gateway failure', ...again(false, { status: 400 }) }),
  p('Gemini', 'Gemini-3.1-Pro', 'primary', false, { status: 503, ...again(true) }),
  p('Gemini', 'Gemini-3.5-Flash', 'fallback', true),
]);
check('2026-10-15 replay → engine_outage only', alertsFor(oct15), JSON.stringify(kinds(oct15)) === '["engine_outage"]' && /ChatGPT/.test(alertsFor(oct15)[0].title) && !/Gemini/.test(alertsFor(oct15)[0].title));
// 13. primary still down after the second probe, fallback alive → engine_fallback,
//     and it says a frozen instrument does not switch (FMVN until 2027-01-01)
const fb2 = day([p('Gemini', 'Gemini-3.1-Pro', 'primary', false, { status: 503, ...again(false, { status: 503 }) }), p('Gemini', 'Gemini-3.5-Flash', 'fallback', true)]);
const fb2a = alertsFor(fb2);
check('fallback alert names the frozen project', fb2a, JSON.stringify(kinds(fb2)) === '["engine_fallback"]' && /Focus Media Vietnam/.test(fb2a[0].detail) && /does not switch models/.test(fb2a[0].detail) && /Gemini-3\.5-Flash: ok/.test(fb2a[0].detail));
const fb3 = { ...fb2, checkedAt: '2027-01-02T01:30:00Z', recheckedAt: '2027-01-02T01:35:00Z' };
check('…and stops naming it once the freeze lapses', alertsFor(fb3), !/Focus Media Vietnam/.test(alertsFor(fb3)[0].detail));
// 14. model list unreadable on both looks → outage, retirement "not confirmed"
const unread = day([p('ChatGPT', 'GPT-4o', 'primary', false, { status: 502, listed: null, ...again(false, { status: 502, listed: null }) })], { listedModels: null });
check('list unreadable → engine_outage, not confirmed', alertsFor(unread), JSON.stringify(kinds(unread)) === '["engine_outage"]' && /not confirmed/.test(alertsFor(unread)[0].detail));
// 15. which models get the second probe
const targets = (r: HealthResult) => recheckTargets(r).map((x) => x.model).join(',');
check('recheck: nothing on a healthy day', targets(base()), targets(base()) === '');
check('recheck: primary + failed fallback of a dead engine', targets(dead), targets(dead) === 'Gemini-3.1-Pro,Gemini-3.5-Flash');
check('recheck: the primary when a fallback is alive', targets(fb), targets(fb) === 'Gemini-3.1-Pro');
check('recheck: not a failed fallback whose primary answers', targets(base({ probes: [p('Gemini', 'Gemini-3.1-Pro', 'primary', true), p('Gemini', 'Gemini-3.5-Flash', 'fallback', false)] })), targets(base({ probes: [p('Gemini', 'Gemini-3.1-Pro', 'primary', true), p('Gemini', 'Gemini-3.5-Flash', 'fallback', false)] })) === '');
check('recheck: never while the account is empty', targets(base({ capacity: true, probes: dead.probes })), targets(base({ capacity: true, probes: dead.probes })) === '');
check('recheck: never without the key', targets(preview), targets(preview) === '');

console.log(fails ? `\n${fails} failing` : '\nall passing');
process.exit(fails ? 1 : 0);
