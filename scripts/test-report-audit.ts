// Rules behind the audit half of client reports (lib/reports/audit.ts).
//   npx tsx --tsconfig tsconfig.json scripts/test-report-audit.ts
// Each case is a mistake a real digest made (FMVN, 2026-10-03) or a neighbour
// of one that must NOT be caught.

import { selfNames, isBrandedPrompt, coreSplit, classifySource, sourceLane, stalePeriods, sentences, scrub, figureCorpusOf, quarterOf } from '../lib/reports/audit';
import { extractDomains } from '../lib/reports/verify';
import { stripSearchTrace, traceAffectedEngines, mostlyEmptyEngines, fetchRepairedEngines } from '../lib/engines/ingest';
import { pageText } from '../lib/agents/site';
import { siteUseByEngine } from '../lib/site-use';
import { answerBudgetFor, maxTokensFor, answerLength, endsMidSentence, cutShortEngines, answerCapChanges, INSTRUMENT_FREEZES } from '../lib/engines/answer-budget';

let bad = 0;
const ok = (name: string, cond: boolean, got?: unknown) => { if (!cond) bad++; console.log(cond ? 'ok  ' : 'FAIL', name, cond ? '' : JSON.stringify(got)); };

const groups = [
  { canonical: 'Acme Lift Media', aliases: ['Acme Frame Media'], relationship: 'self' },
  { canonical: 'Acme Media Group', aliases: ['Acme Group'], relationship: 'competitor' },
  { canonical: 'Rival Screens', aliases: ['Rival'] },
];
const names = selfNames('Lift Media Vietnam', 'Vietnam', groups);
ok('short brand name and own entities count as self', names.includes('lift media') && names.includes('acme lift media'), names);
ok('a competitor with an overlapping name is not self', !isBrandedPrompt('Acme Media Group có uy tín không?', names));

const core = ['Quảng cáo thang máy có hiệu quả không?', 'Chi phí quảng cáo thang máy bao nhiêu?', 'Lift Media có uy tín không?'];
const smp = (prompt: string, engine: string, brandPresent: boolean, competitorsPresent: string[] = []) => ({ prompt, engine, brandPresent, competitorsPresent });
const cur = { rawSamples: [
  smp(core[0], 'A', true), smp(core[0], 'B', false, ['Rival Screens']),
  smp(core[1], 'A', false, ['Rival Screens']), smp(core[1], 'B', false),
  smp(core[2], 'A', true), smp(core[2], 'B', true),
  smp('một câu luân phiên', 'A', true),
] };
const prev = { rawSamples: [smp(core[0], 'A', false), smp(core[0], 'B', false), smp(core[1], 'A', false), smp(core[1], 'B', false), smp(core[2], 'A', true), smp(core[2], 'B', true)] };
const cs = coreSplit(cur, prev, core, names)!;
ok('fixed questions only: 1/4 without the brand name, 2/2 with it', cs.unbranded.present === 1 && cs.unbranded.total === 4 && cs.branded.present === 2 && cs.branded.total === 2, cs);
ok('question counts: 2 without, 1 with', cs.unbrandedQuestions === 2 && cs.brandedQuestions === 1, cs);
ok('per engine on the questions without the brand name: A 1/2, B 0/2', JSON.stringify(cs.unbrandedByEngine) === JSON.stringify([{ engine: 'A', present: 1, total: 2 }, { engine: 'B', present: 0, total: 2 }]), cs.unbrandedByEngine);
ok('previous scan on the same questions: 0/4', cs.before?.unbranded.present === 0 && cs.before?.unbranded.total === 4, cs.before);
ok('gaps sorted worst first, with who is there instead', cs.gaps[0].prompt === core[1] && cs.gaps[0].now.present === 0 && cs.gaps[0].competitors[0] === 'Rival Screens 1/2', cs.gaps);

const T: Record<string, string[]> = {
  'vds.example': ['VDS - Viet Digital Signage Company Limited', 'Giới thiệu VDS'],
  'ledblue.example': ['Trang chủ - Led Blue'],
  'reseller.example': ['Báo giá quảng cáo thang máy 2026', 'Bảng giá quảng cáo LCD', 'Booking quảng cáo chung cư', 'Tin tức'],
};
const cls = (d: string) => classifySource(d, T[d] ?? [], { groups, brandDomains: new Set(['liftmedia.vn']) });
ok('a screen vendor is hardware → study only', cls('vds.example') === 'hardware' && sourceLane(cls('vds.example')) === 'study', cls('vds.example'));
ok('one "Led" title on an led* host is hardware', cls('ledblue.example') === 'hardware', cls('ledblue.example'));
ok('price-quote pages make a reseller', cls('reseller.example') === 'reseller', cls('reseller.example'));
ok('news media is a venue', cls('e.vnexpress.net') === 'media' && sourceLane('media') === 'presence', cls('e.vnexpress.net'));
ok('self-publishing platform is study only', cls('sites.google.com') === 'platform' && sourceLane('platform') === 'study');
ok('own and competitor sites by the competitor set', cls('liftmedia.vn') === 'own' && cls('rivalscreens.vn') === 'competitor', [cls('liftmedia.vn'), cls('rivalscreens.vn')]);
ok('unknown stays unknown', cls('nobody-knows.vn') === 'unknown' && sourceLane('unknown') === 'unclassified');
ok('a project override wins', classifySource('nobody-knows.vn', [], { overrides: { 'nobody-knows.vn': 'industry' } }) === 'industry');
ok('a general site with no LED word is not hardware', classifySource('tintuc-xyz.vn', ['Tin tức kinh tế hôm nay', 'Knowledge base'], {}) === 'unknown');

const now = new Date('2026-10-03T03:00:00Z');
ok('quarter of 2026-10-03 is Q4 2026', quarterOf(now).label === 'Q4 2026');
ok('"Q2 2026" is past in October', stalePeriods('approve budget trong Q2 2026.', now).length === 1);
ok('"Q4 2026" and "Q1/2027" are not', stalePeriods('trong Q4 2026 và Q1/2027', now).length === 0);
ok('"quý 2/2026" and "2026年第二季度" are past', stalePeriods('trong quý 2/2026', now).length === 1 && stalePeriods('于2026年第二季度批准', now).length === 1);

const figs = figureCorpusOf(['66', '81', '56', '41', '59']);
const facts = 'Lift Media vận hành hơn 18.000 màn hình tại hơn 2.000 tòa nhà.';
const adv = (t: string) => scrub(t, figs, facts, 'vi', now, { forwardLooking: true });
const obs = (t: string) => scrub(t, figs, facts, 'vi', now, {});
const a = adv('Bao gồm Rival (92% elevator DOOH market share theo Kantar 2025) và Acme Media Group (51% traditional OOH theo Mordor Intelligence 2026). Sử dụng giọng văn trung lập.');
ok('outside-research sentence removed, the next kept', a.removed.length === 1 && /giọng văn trung lập/.test(a.text) && !/Kantar|Mordor/.test(a.text), a);
ok('a request dated in a past quarter is removed', adv('Cần duyệt ngân sách trong Q2 2026.').removed.length === 1);
ok('advice with an invented percentage is removed', adv('Brand X tăng brand recall 47% sau 3 tháng.').removed.length === 1);
ok('advice quoting a scan percentage is removed too (advice carries client-material figures only)', adv('Presence ở nhóm ý định cao là 59% nên cần thêm nội dung.').removed.length === 1);
ok('advice citing its reason as a fraction is kept', adv('Nhóm câu hỏi về giá hiện là 0/15; có thể cân nhắc một trang giải thích cách tính giá.').removed.length === 0);
ok('advice with a client-material figure is kept', adv('Lift Media vận hành hơn 18.000 màn hình tại hơn 2.000 tòa nhà, có thể nêu trong bài.').removed.length === 0);
ok('interpretation keeps scan figures', obs('[Observed] Perplexity đạt 81 điểm, Gemini 56 điểm. Top-of-mind là 41%.').removed.length === 0);
ok('a labelled projection keeps its targets when the caller allows it', scrub('[Projection] Trang này có thể tăng presence lên 70-75%.', figs, facts, 'vi', now, { forwardLooking: true, allowProjection: true }).removed.length === 0);
const h = obs('Sự khác biệt về охват và tần suất. Câu này bình thường.');
ok('a sentence with a Cyrillic word is removed, the next kept', h.removed.length === 1 && h.text === 'Câu này bình thường.', h);
ok('Chinese characters in a Vietnamese report are removed', obs('Khả năng Optimization 可优化 của nền tảng.').removed.length === 1);
ok('Vietnamese diacritics are not a foreign script', obs('Quảng cáo thang máy ở Đà Nẵng rất hiệu quả.').removed.length === 0);
ok('a Chinese report keeps Chinese', scrub('品牌在不带品牌名的问题上出现 9/55。', figs, facts, 'zh', now, {}).removed.length === 0);
ok('sentence split keeps domains, decimals and "v.v." whole', sentences('Nguồn vds.vn có 54 trích dẫn. Điểm là 3.5 trên 5. Xem v.v. sau.').length === 3);
ok('"TP.HCM" is not a domain; real hosts still are', JSON.stringify(extractDomains('văn phòng tại TP.HCM và Tp.HCM, nguồn vds.vn, VnExpress.net')) === JSON.stringify(['vds.vn', 'vnexpress.net']), extractDomains('văn phòng tại TP.HCM và Tp.HCM, nguồn vds.vn, VnExpress.net'));

// --- an engine's search log is not its answer (lib/engines/ingest) ---
const LOG = [
  '*Thinking...*', '',
  '> > **🔎 Searching the web**', '> ', '> 🔍 **Search Query:**', '>   • `quảng cáo thang máy`', '> ',
  '> 📚 **Found 10 Sources**', '> ', '> 1. **Câu hỏi thường gặp - Acme Media**', '>    🔗 https://acme.example/faq', '> ',
  '>    *...and 9 more sources*', '> ', '',
].join('\n');
const BODY = 'Có, quảng cáo thang máy thường hiệu quả.[[1]](https://news.example/a)\n\n> "Một câu trích trong bài."\n\n---\n\n**References:**\n\n[1] **Bài báo**\n <https://news.example/a>';
const st = stripSearchTrace(LOG + BODY);
ok('search log removed, answer kept whole (its own quote and reference list too)', st.stripped && st.text === BODY, st);
ok('a URL the engine only found is gone; a URL the answer cites stays', !/acme\.example/.test(st.text) && /news\.example\/a/.test(st.text));
ok('an answer without a log is returned untouched', (() => { const r = stripSearchTrace(BODY); return !r.stripped && r.text === BODY; })());
ok('a second log block is removed as well', stripSearchTrace(LOG + '> 🔍 **Search Query:**\n>   • `lần hai`\n\n' + BODY).text === BODY);
ok('log and nothing else leaves an empty answer', (() => { const r = stripSearchTrace(LOG); return r.stripped && r.text === ''; })());
ok('"*Thinking…*" with an ellipsis character and CRLF line ends', stripSearchTrace('*Thinking…*\r\n\r\n> log\r\n\r\nTrả lời.').text === 'Trả lời.');
ok('an answer that merely mentions "*Thinking...*" later is untouched', !stripSearchTrace('Trả lời.\n*Thinking...*\n> x').stripped);
const scOld = { rawSamples: [{ engine: 'Perplexity', snippet: LOG.slice(0, 400) }, { engine: 'Perplexity', snippet: LOG.slice(0, 400) }, { engine: 'ChatGPT', snippet: 'Có, hiệu quả.' }] };
const scNew = { rawSamples: [{ engine: 'Perplexity', snippet: 'Có, hiệu quả.' }, { engine: 'ChatGPT', snippet: 'Có.' }] };
ok('a scan stored with the log in front is flagged for that engine only', JSON.stringify(traceAffectedEngines(scOld)) === '["Perplexity"]');
ok('a scan taken after the fix is not flagged; nor is a missing scan', traceAffectedEngines(scNew).length === 0 && traceAffectedEngines(null).length === 0);

const mk = (engine: string, answered: number, total: number) => Array.from({ length: total }, (_, i) => ({ engine, snippet: i < answered ? 'Có.' : '' }));
ok('an engine that returned 7 of 24 answers is flagged with its counts', JSON.stringify(mostlyEmptyEngines({ rawSamples: [...mk('Google AI Overview', 7, 24), ...mk('ChatGPT', 24, 24)] })) === '[{"engine":"Google AI Overview","answered":7,"total":24}]');
ok('an engine that returned 15 of 24 (the worst scheduled scan so far) is not', mostlyEmptyEngines({ rawSamples: mk('Google AI Overview', 15, 24) }).length === 0);
ok('no samples, no flag', mostlyEmptyEngines(null).length === 0 && mostlyEmptyEngines({ rawSamples: undefined }).length === 0);

// scans that record how each answer was obtained
const rec = (failedN: number, noAnswer: number, total: number) => Array.from({ length: total }, (_, i) => ({ engine: 'Google AI Overview', snippet: i < failedN + noAnswer ? '' : 'Có.', status: i < failedN ? 'failed' : i < failedN + noAnswer ? 'no_answer' : 'answered' }));
ok('recorded scan: 5 of 24 fetches failed (79% came back) is under the 80% floor', JSON.stringify(mostlyEmptyEngines({ rawSamples: rec(5, 0, 24) })) === '[{"engine":"Google AI Overview","answered":19,"total":24}]');
ok('recorded scan: 4 of 24 failed is not flagged', mostlyEmptyEngines({ rawSamples: rec(4, 0, 24) }).length === 0);
ok('recorded scan: 14 questions the engine did not answer and no failure is a reading, not a fault', mostlyEmptyEngines({ rawSamples: rec(0, 14, 24) }).length === 0);

const prevScan = { rawSamples: [...mk('Google AI Overview', 21, 24), ...mk('ChatGPT', 24, 24)] };
const curScan = { rawSamples: [...rec(0, 0, 24), ...mk('ChatGPT', 24, 24)] };
ok('first scan with fetch records after one without: that engine only, with both counts', JSON.stringify(fetchRepairedEngines(curScan, prevScan)) === '[{"engine":"Google AI Overview","before":21,"now":24,"total":24}]');
ok('two recorded scans, or no previous scan: nothing to note', fetchRepairedEngines(curScan, curScan).length === 0 && fetchRepairedEngines(curScan, null).length === 0);

// --- the site audit reads the page to its footer (lib/agents/site) ---
const filler = (n: number) => 'x'.repeat(n);
const shortPage = `<html><body><h1>Brand</h1><p>${filler(6000)}</p><h2>Câu hỏi thường gặp</h2><footer>Hotline 1900 5111</footer></body></html>`;
const sp = pageText(shortPage);
ok('a 6,000-character page is read whole: the FAQ heading and the footer hotline are in the text', sp.omitted === 0 && /Câu hỏi thường gặp/.test(sp.text) && /1900 5111/.test(sp.text));
const longPage = `<html><body><h1>Brand</h1><p>${filler(30000)}</p><footer>Hotline 1900 5111</footer></body></html>`;
const lp = pageText(longPage);
ok('a very long page keeps its top and its footer, and says how much of the middle is left out', lp.omitted > 0 && lp.text.startsWith('Brand') && /1900 5111/.test(lp.text) && lp.text.includes(`${lp.omitted} characters in the middle`));
ok('scripts and styles are not page text', !/secret/.test(pageText('<script>var secret=1</script><style>.secret{}</style><p>Visible</p>').text));

// --- "on the page" is not "used by AI": which engines cite the brand's own pages (lib/site-use) ---
const useScan = { rawSamples: [
  { engine: 'Perplexity', snippet: 'a', citations: ['https://www.acme.vn/', 'https://news.example/x'] },
  { engine: 'Perplexity', snippet: 'b', citations: ['https://acme.vn/faq'] },
  { engine: 'Perplexity', snippet: 'c', citations: ['https://other.vn/acme.vn'] },
  { engine: 'Perplexity', snippet: '', citations: ['https://acme.vn/'] },
  { engine: 'ChatGPT', snippet: 'd', citations: [] },
  { engine: 'Google AI Overview', snippet: 'e', citations: ['https://blog.acme.vn/post', 'not a url'] },
  { engine: 'Claude', snippet: 'f', citations: ['https://news.example/a'] },
  { engine: 'Claude', snippet: 'g', citations: ['https://wiki.example/b', 'https://news.example/c'] },
  { engine: 'Gemini', snippet: 'h', citations: ['https://news.example/a'] },
  { engine: 'Gemini', snippet: 'i', citations: [] },
  { engine: 'Gemini', snippet: 'j', citations: [] },
] };
const use = siteUseByEngine(useScan, 'https://acme.vn');
const row = (e: string) => use.find((r) => r.engine === e)!;
ok('answers citing the site are counted per engine; the homepage separately; an empty answer is not an answer', row('Perplexity').answers === 3 && row('Perplexity').citingSite === 2 && row('Perplexity').homepage === 1);
ok('a subdomain is the site; a look-alike path on another host is not', row('Google AI Overview').citingSite === 1 && row('Google AI Overview').homepage === 0);
ok('an engine that returns no sources is listed as answering from training', row('ChatGPT').readsWeb === false && row('ChatGPT').citingSite === 0 && row('Perplexity').readsWeb === true);
ok('an engine outside the known list whose answers come back with sources reads the web, even when none of them is the site', row('Claude').readsWeb === true && row('Claude').sourced === 2 && row('Claude').citingSite === 0);
ok('one stray link among answers written from training does not make an engine a reader', row('Gemini').readsWeb === false && row('Gemini').sourced === 1);
ok('no site address or no scan: nothing to show', siteUseByEngine(useScan, '').length === 0 && siteUseByEngine(null, 'https://acme.vn').length === 0);

// --- the token limit per answer is a project setting; a frozen instrument keeps the old one (lib/engines/answer-budget) ---
const FROZEN = INSTRUMENT_FREEZES[0].projectId;
const during = new Date('2026-10-16T02:00:00Z');
const def = answerBudgetFor({ id: 'any-other-project' }, during);
ok('a project with no setting: 900 for the answer, 2,100 on top for an engine that thinks', def.answerMaxTokens === 900 && def.thinkingAllowanceTokens === 2100 && def.source === 'default', def);
ok('so Gemini is asked with 3,000 and the other engines with 900, as before', maxTokensFor(def, { thinking: true }) === 3000 && maxTokensFor(def, {}) === 900);
const frz = answerBudgetFor({ id: FROZEN }, during);
ok('the frozen project keeps 900 for every engine, thinking or not', frz.source === 'frozen' && frz.frozenUntil === '2027-01-01' && maxTokensFor(frz, { thinking: true }) === 900 && maxTokensFor(frz, {}) === 900, frz);
ok('a setting on the project cannot lift a declared freeze', maxTokensFor(answerBudgetFor({ id: FROZEN, metadata: { answerBudget: { thinkingAllowanceTokens: 4000 } } }, during), { thinking: true }) === 900);
ok('the freeze holds through the last second of 2026-12-31 and lapses on 2027-01-01', answerBudgetFor({ id: FROZEN }, new Date('2026-12-31T23:59:59Z')).source === 'frozen' && answerBudgetFor({ id: FROZEN }, new Date('2027-01-01T00:00:00Z')).source === 'default');
const own = answerBudgetFor({ id: 'p', metadata: { answerBudget: { thinkingAllowanceTokens: 3100 } } }, during);
ok('a project setting changes only what it names', own.source === 'project' && own.answerMaxTokens === 900 && maxTokensFor(own, { thinking: true }) === 4000, own);
const pin = (until: string) => answerBudgetFor({ id: 'p', metadata: { answerBudget: { thinkingAllowanceTokens: 0, frozenUntil: until } } }, during);
ok('a freeze written on the project holds until its date, then the default returns', pin('2026-12-01').source === 'frozen' && maxTokensFor(pin('2026-12-01'), { thinking: true }) === 900 && pin('2026-10-01').source === 'default');
ok('a value of the wrong type or out of range is ignored, not clamped', [{ answerMaxTokens: '900' }, { answerMaxTokens: 50 }, { thinkingAllowanceTokens: -1 }, { thinkingAllowanceTokens: 1e6 }, { answerMaxTokens: 900.5 }, 'x', null]
  .every((v) => answerBudgetFor({ id: 'p', metadata: { answerBudget: v } }, during).source === 'default'));

// Gemini at 900, Highlands Coffee panel, 2026-10-12: 138 characters, 863 of 896 tokens spent thinking.
const CUT = 'Việc so sánh **Highlands Coffee** và **Starbucks** thực chất là sự so sánh giữa hai văn hóa thưởng thức cà phê';
const WHOLE = `${CUT} khác nhau.\n\n${'Highlands có giá thấp hơn và hợp khẩu vị đậm của người Việt. '.repeat(12)}`;
ok('an answer cut by the limit stops inside a sentence; a whole one does not', endsMidSentence(CUT) && !endsMidSentence(WHOLE) && !endsMidSentence('') && !endsMidSentence('Xem thêm: [Highlands](https://highlandscoffee.com.vn)\n'));
const len = answerLength([...Array.from({ length: 23 }, () => ({ text: CUT, reasoningTokens: 863 })), { text: WHOLE, reasoningTokens: 853 }, { text: '' }]);
ok('lengths are taken on the full answers: 24 with text, 23 short, 23 mid-sentence, median and reasoning recorded', len.answers === 24 && len.short === 23 && len.midSentence === 23 && len.medianChars === CUT.length && len.reasoningTokens === 863, len);
ok('an engine that reports no reasoning carries no reasoning figure', !('reasoningTokens' in answerLength([{ text: WHOLE }])));
const stored = (engine: string, text: string, n: number) => Array.from({ length: n }, () => ({ engine, snippet: text.slice(0, 400) }));
const cutScan = { rawSamples: [...stored('Gemini', CUT, 23), ...stored('Gemini', WHOLE, 1), ...stored('ChatGPT', WHOLE, 24), ...stored('Google AI Overview', 'Có. Giá từ 29.000đ.', 20), ...mk('Google AI Overview', 0, 4)] };
ok('a stored scan flags the engine whose answers were cut, with its counts — not the one that answers briefly', JSON.stringify(cutShortEngines(cutScan)) === '[{"engine":"Gemini","cut":23,"total":24}]', cutShortEngines(cutScan));
ok('fewer than half cut (11 of 24) is not flagged; nor is a missing scan', cutShortEngines({ rawSamples: [...stored('Gemini', CUT, 11), ...stored('Gemini', WHOLE, 13)] }).length === 0 && cutShortEngines(null).length === 0);

const before = { engines: ['ChatGPT', 'Gemini', 'Google AI Overview'] };
const after = { engines: before.engines, answerCap: { ...def, perEngine: { ChatGPT: 900, Gemini: 3000 } } };
ok('first scan with the allowance after one without a record: Gemini 900 → 3,000, and only Gemini', JSON.stringify(answerCapChanges(after, before)) === '[{"engine":"Gemini","before":900,"now":3000}]', answerCapChanges(after, before));
ok('a frozen project shows no change; nor do two scans with the same limits, or a first scan', answerCapChanges({ engines: before.engines, answerCap: { ...frz, perEngine: { ChatGPT: 900, Gemini: 900 } } }, before).length === 0 && answerCapChanges(after, after).length === 0 && answerCapChanges(after, null).length === 0);
ok('an engine the previous scan did not measure has nothing to be compared with', answerCapChanges(after, { engines: ['ChatGPT'] }).length === 0);
ok('the day a freeze lapses is a change of limit like any other', JSON.stringify(answerCapChanges(after, { engines: before.engines, answerCap: { ...frz, perEngine: { ChatGPT: 900, Gemini: 900 } } })) === '[{"engine":"Gemini","before":900,"now":3000}]');

console.log(bad ? `\n${bad} failing` : '\nall passing');
process.exit(bad ? 1 : 0);
