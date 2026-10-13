// The action ledger's rules: what a pasted line becomes (lib/action-input.ts),
// what the outcome figures are, and when an engine's change of habit makes the
// before and after of a citation count not comparable (lib/interventions.ts).
//   npx tsx --tsconfig tsconfig.json scripts/test-interventions.ts
// The source-count series is the one measured on a real project on 2026-10-13
// (sources per answer, one engine, 16 comparable scans). Nothing here touches
// the network or a database.

import { INTERVENTION_KINDS as KINDS_FOR_BROWSER, brandHostsOf, kindFromLink, parseActionLine, parseActionLines } from '../lib/action-input';
import {
  INTERVENTION_KINDS, breaksAffecting, computeOutcomes, computeOutcomesAndBreaks, describeOutcome, outcomeFigures, seriesBreak, sourceCountBreaks,
  type Intervention, type Outcome,
} from '../lib/interventions';
import { unitHash } from '../lib/edits';
import { parseHanhdong } from '../lib/lark';

let bad = 0;
const ok = (name: string, cond: boolean, got?: unknown) => { if (!cond) bad++; console.log(cond ? 'ok  ' : 'FAIL', name, cond ? '' : JSON.stringify(got)); };

// ─── an engine that starts listing fewer sources ─────────────────────────────
const SERIES = [26.6, 24.2, 25.6, 25.2, 25, 24.9, 25.8, 26.4, 27.5, 31.5, 4.9, 5.3, 4.8, 4, 3.9, 3.6];
const DATES = ['08-10', '08-12', '08-21', '08-28', '09-04', '09-11', '09-17', '09-17', '09-18', '09-25', '09-29', '10-02', '10-09', '10-09', '10-09', '10-09'];
const near = (x: number, lo: number, hi: number) => x >= lo && x <= hi;

{
  const b = seriesBreak(SERIES);
  ok('the measured series breaks at the eleventh scan', b?.at === 10, b);
  ok('about 25 before, about 5 after (medians 25.7 and 4.4)', !!b && near(b.before, 25.69, 25.71) && near(b.after, 4.39, 4.41), b);
  ok('a flat series has no break', seriesBreak(SERIES.slice(0, 10)) === null && seriesBreak(new Array(16).fill(25)) === null);
  const flat = new Array(12).fill(25);
  const withOutlier = (i: number, v: number) => flat.map((x, j) => (j === i ? v : x));
  ok('one odd scan is not a break, wherever it falls (low)', flat.every((_, i) => seriesBreak(withOutlier(i, 4)) === null), flat.map((_, i) => seriesBreak(withOutlier(i, 4))));
  ok('one odd scan is not a break, wherever it falls (none listed at all)', flat.every((_, i) => seriesBreak(withOutlier(i, 0)) === null), flat.map((_, i) => seriesBreak(withOutlier(i, 0))));
  ok('one odd scan is not a break, wherever it falls (high)', flat.every((_, i) => seriesBreak(withOutlier(i, 90)) === null));
  ok('fewer than two scans on a side: no break', seriesBreak([25, 25, 25, 5]) === null && seriesBreak([25, 5, 5, 5]) === null && seriesBreak([25, 5]) === null && seriesBreak([]) === null);
  ok('two scans on each side is enough', seriesBreak([25, 26, 5, 4])?.at === 2);
  ok('a rise is a break too', seriesBreak([5, 4, 5, 26, 25, 27])?.at === 3);
  ok('less than a factor of two: no break', seriesBreak([25, 26, 25, 14, 13, 14]) === null);
  ok('under one source per answer on both sides: no break', seriesBreak([0.1, 0.2, 0.1, 0.5, 0.6, 0.5]) === null);
  ok('the point is where the new habit starts, not where the ratio is largest', seriesBreak([25, 25, 25, 25, 6, 5, 4, 3, 2])?.at === 4);
}

// The same series as scans: 10 answers per engine per scan; one engine carries the series, one is flat, one lists nothing.
const cite = (n: number, host: string) => Array.from({ length: n }, (_, i) => `https://${host}/p${i}`);
function scansFrom(series: number[], dates: string[]) {
  return series.map((perAnswer, i) => {
    const total = Math.round(perAnswer * 10);
    const samples: any[] = [];
    for (let a = 0; a < 10; a++) {
      const n = Math.floor(total / 10) + (a < total % 10 ? 1 : 0);
      samples.push({ engine: 'Perplexity', prompt: `q${a}`, brandPresent: a < 3, citations: cite(n, a === 0 ? 'liftmedia.example' : 'news.example') });
      samples.push({ engine: 'ChatGPT', prompt: `q${a}`, brandPresent: a < 5, citations: cite(5, 'directory.example') });
      samples.push({ engine: 'Gemini', prompt: `q${a}`, brandPresent: false, citations: [] });
    }
    return { id: `scan-${i}`, at: `2026-${dates[i]}T02:0${i % 10}:00.000+00:00`, samples };
  });
}
const SCANS = scansFrom(SERIES, DATES);

{
  const breaks = sourceCountBreaks(SCANS);
  ok('one engine, one note', breaks.length === 1 && breaks[0].engine === 'Perplexity', breaks);
  ok('from the scan of 2026-09-29', breaks[0]?.from === '2026-09-29', breaks[0]);
  ok('about 25 → about 5', !!breaks[0] && Math.round(breaks[0].before) === 26 && Math.round(breaks[0].after) === 4 && near(breaks[0].before, 24, 27) && near(breaks[0].after, 3.5, 5.5), breaks[0]);
  ok('flat scans: no note', sourceCountBreaks(scansFrom(new Array(16).fill(25), DATES)).length === 0);
  const odd = SERIES.slice(0, 10).map((v, i) => (i === 6 ? 3 : v));
  ok('one outlier scan: no note', sourceCountBreaks(scansFrom(odd, DATES.slice(0, 10))).length === 0);
  ok('an engine missing from some scans is read on the scans it answered in', (() => {
    const s = SCANS.map((x, i) => (i % 5 === 0 ? { ...x, samples: x.samples.filter((a: any) => a.engine !== 'ChatGPT') } : x));
    const b = sourceCountBreaks(s);
    return b.length === 1 && b[0].engine === 'Perplexity' && b[0].from === '2026-09-29';
  })());
  ok('no scans: no note', sourceCountBreaks([]).length === 0);
}

// ─── the figures, and which rows a note belongs to ───────────────────────────
// A stand-in for the one query computeOutcomes makes (agent_runs, newest first).
const fakeSb = (scans: any[]) => {
  const rows = [...scans].reverse().map((s) => ({ id: s.id, completed_at: s.at, output: { rawSamples: s.samples } }));
  const chain: any = { select: () => chain, eq: () => chain, in: () => chain, neq: () => chain, order: () => chain, limit: (n: number) => Promise.resolve({ data: rows.slice(0, n) }) };
  return { from: () => chain };
};
const iv = (o: Partial<Intervention>): Intervention => ({
  id: 'iv', project_id: 'p', kind: 'content_page', url: null, domain: null, title: null, note: null, target_prompts: [], source_asset_type: null, source_run_id: null,
  published_at: '2026-09-04', status: 'live', created_at: '2026-09-04T00:00:00Z', ...o,
});

async function main() {
  const list = [
    iv({ id: 'own', url: 'https://liftmedia.example/p0', domain: 'liftmedia.example', published_at: '2026-09-04', target_prompts: [{ hash: unitHash('q0'), prompt: 'q0' }] }),
    iv({ id: 'early', url: 'https://news.example/a', domain: 'news.example', published_at: '2026-07-01' }),
    iv({ id: 'late', url: 'https://liftmedia.example/new', domain: 'liftmedia.example', published_at: '2026-10-12' }),
    iv({ id: 'elsewhere', url: 'https://directory.example/x', domain: 'directory.example', published_at: '2026-09-04' }),
    iv({ id: 'nolink', published_at: '2026-09-04' }),
  ];
  const sb = fakeSb(SCANS);
  const plain = await computeOutcomes(sb, 'p', list);
  const both = await computeOutcomesAndBreaks(sb, 'p', list);
  ok('the outcomes with a note are the outcomes without one', JSON.stringify(both.outcomes) === JSON.stringify(plain));
  ok('the note comes from the same scans', both.breaks.length === 1 && both.breaks[0].from === '2026-09-29', both.breaks);

  // By hand: 4 scans before 09-04, 12 from then on. The first Perplexity answer of each scan cites the brand's site;
  // it gets floor(total/10) + 1 when total % 10 > 0.  Before: 27 + 25 + 26 + 26 = 104.  After: 25+25+26+27+28+32 + 5+6+5+4+4+4 = 191.
  const o = plain.own;
  ok('scans on each side of the publish date', o.scansBefore === 4 && o.scansAfter === 12 && !o.awaiting, [o.scansBefore, o.scansAfter]);
  ok('whole-site citations before and after, as counted', o.domain?.before.cites === 104 && o.domain?.after.cites === 191, o.domain);
  ok('the engines that cite the site', JSON.stringify(o.domain?.before.engines) === '["Perplexity"]' && JSON.stringify(o.domain?.after.engines) === '["Perplexity"]', o.domain);
  const q0 = o.prompts[0];
  ok('the targeted question, per engine, present/total', q0?.engines.length === 3
    && JSON.stringify(q0.engines.find((e) => e.engine === 'Perplexity')) === JSON.stringify({ engine: 'Perplexity', before: { present: 4, total: 4 }, after: { present: 12, total: 12 } })
    && JSON.stringify(q0.engines.find((e) => e.engine === 'Gemini')) === JSON.stringify({ engine: 'Gemini', before: { present: 0, total: 4 }, after: { present: 0, total: 12 } }), q0);
  ok('figures handed to the digest gate are those numbers and their per-scan rounding',
    JSON.stringify(outcomeFigures({ own: o })) === JSON.stringify([4, 12, 4, 4, 12, 12, 100, 100, 4, 4, 12, 12, 100, 100, 0, 4, 0, 12, 0, 0, 104, 191, 26, 16]), outcomeFigures({ own: o }));
  ok('the plain-text line the digest and the connector read',
    describeOutcome(list[0], o).split('\n').pop() === '  liftmedia.example cited 104 in 4 scans (26/scan) → 191 in 12 scans (16/scan) (engines after: Perplexity)', describeOutcome(list[0], o));
  ok('an action before every scan has nothing before it', plain.early.scansBefore === 0 && plain.early.scansAfter === 16 && plain.early.domain?.before.cites === 0);
  ok('an action after every scan is waiting', plain.late.awaiting && plain.late.scansAfter === 0);
  ok('an action without a link has no site line', plain.nolink.domain === null);

  const b = both.breaks;
  ok('note: scans on both sides, and the engine cites the site', breaksAffecting(plain.own, b).length === 1);
  ok('no note: nothing before the publish date to compare with', breaksAffecting(plain.early, b).length === 0);
  ok('no note: still waiting for a scan after', breaksAffecting(plain.late, b).length === 0);
  ok('no note: the site is cited only by engines that did not change', breaksAffecting(plain.elsewhere, b).length === 0, plain.elsewhere.domain);
  ok('no note: no site line', breaksAffecting(plain.nolink, b).length === 0);
  ok('no break, no note', breaksAffecting(plain.own, []).length === 0);
  const before = JSON.stringify(plain.own);
  breaksAffecting(plain.own, b);
  ok('asking leaves the outcome as it was', JSON.stringify(plain.own) === before && (plain.own as Outcome).sourceBreaks === undefined);
  ok('no actions: nothing loaded, nothing reported', JSON.stringify(await computeOutcomesAndBreaks(sb, 'p', [])) === '{"outcomes":{},"breaks":[]}');

  // ─── a pasted line → an action ─────────────────────────────────────────────
  const hosts = ['liftmedia.example'];
  const today = '2026-10-13';
  ok('one list of kinds for the server and the browser', KINDS_FOR_BROWSER === INTERVENTION_KINDS);
  ok('the brand\'s own site is a content page', kindFromLink('https://www.liftmedia.example/tin-tuc/a', hosts) === 'content_page' && kindFromLink('https://blog.liftmedia.example/a', hosts) === 'content_page');
  ok('anywhere else is a third-party placement', kindFromLink('https://news.example/a', hosts) === 'third_party_placement' && kindFromLink('https://notliftmedia.example/a', hosts) === 'third_party_placement');
  ok('no link: nothing to tell it by', kindFromLink(null, hosts) === 'third_party_placement');
  ok('brand hosts: the site and the extra domains on the project', JSON.stringify(brandHostsOf({ brand_url: 'https://www.LiftMedia.example/vi', metadata: { brandDomains: ['https://www.lift.example/', 'm.lift.example'] } })) === '["liftmedia.example","lift.example","m.lift.example"]'
    && JSON.stringify(brandHostsOf({ brand_url: 'liftmedia.example' })) === '["liftmedia.example"]' && brandHostsOf(null).length === 0, brandHostsOf({ brand_url: 'https://www.LiftMedia.example/vi', metadata: { brandDomains: ['https://www.lift.example/', 'm.lift.example'] } }));

  const lines = [
    'https://news.example/cong-nghe-truyen-thong-5103431.html 2026-07-31',
    '/hanhdong https://news.example/a.chn 31/7',
    '/hanhdong https://liftmedia.example/tin-tuc/a 2026-09-04 Q3,Q5 bài tiêu chuẩn đánh giá',
    'https://liftmedia.example/faq',
    'https://vi.wikipedia.example/wiki/Lift 12/08/2026 bách khoa',
    'https://news.example/b, 2026-07-21.',
    '2026-07-21 https://news.example/c báo',
    'https://liftmedia.example/x schema Q1',
    'https://news.example/d directory_profile',
    'chỉ có chữ, không có link',
    'https://news.example/e Q21 Q0 Q7',
  ];
  const drift = lines.filter((l) => {
    const mine = parseActionLine(l, today, hosts), theirs = parseHanhdong(l, today, hosts);
    return !(mine.url === theirs.url && mine.kind === theirs.kind && mine.note === theirs.note && JSON.stringify(mine.targets) === JSON.stringify(theirs.targets)
      && (mine.date ?? today) === theirs.date && (mine.date === null) === theirs.dateGuessed);
  });
  ok('the panel reads a line exactly as the Lark command does', drift.length === 0, drift.map((l) => [l, parseActionLine(l, today, hosts), parseHanhdong(l, today, hosts)]));
  const first = parseActionLine(lines[0], today, hosts);
  ok('"link date": link, date, kind from the link, no note', first.url === 'https://news.example/cong-nghe-truyen-thong-5103431.html' && first.date === '2026-07-31' && first.kind === 'third_party_placement' && first.kindFrom === 'link' && first.note === '', first);
  ok('a kind word on the line wins over the link', parseActionLine(lines[4], today, hosts).kind === 'encyclopedia' && parseActionLine(lines[4], today, hosts).kindFrom === 'word' && parseActionLine(lines[7], today, hosts).kind === 'schema');
  ok('day/month takes this year; a line without a date has none', parseActionLine(lines[1], today, hosts).date === '2026-07-31' && parseActionLine(lines[3], today, hosts).date === null);
  ok('a line without a link keeps its words as the note', parseActionLine(lines[9], today, hosts).url === null && parseActionLine(lines[9], today, hosts).note === 'chỉ có chữ, không có link');

  const pasted = ['', lines[0], '   ', lines[1], lines[3], ''].join('\r\n');
  const drafts = parseActionLines(pasted, today, hosts);
  ok('a pasted block: one draft per line with something on it', drafts.length === 3 && drafts[0].date === '2026-07-31' && drafts[2].kind === 'content_page' && drafts[2].date === null, drafts);
  ok('nothing pasted: nothing', parseActionLines(' \n ', today, hosts).length === 0);

  console.log(bad ? `\n${bad} failing` : '\nall passing');
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
