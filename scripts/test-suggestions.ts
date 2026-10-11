// Rules behind suggested actions (lib/suggestions.ts) and their Lark command.
//   npx tsx --tsconfig tsconfig.json scripts/test-suggestions.ts
// The detection cases are the shapes found in a real project's data on
// 2026-10-11 (address variants, a relaunched site, dates a site states wrongly),
// rebuilt with invented names. Nothing here touches the network or a database.

import { normUrl, tokens, candidateQuestions, detectSuggestions, confirmSuggestion, dismissSuggestion, loadPendingSuggestions, type DetectionInput, type FetchedPage } from '../lib/suggestions';
import { parseXacnhan, parseHanhdong, suggestionListText } from '../lib/lark';
import { confirmFromLark, larkSuggestionsOn, postSuggestionList } from '../lib/lark-bot';
import { canSignForOrg } from '../lib/org-auth';
import { computeAlignment } from '../lib/collab-alignment';

let bad = 0;
const ok = (name: string, cond: boolean, got?: unknown) => { if (!cond) bad++; console.log(cond ? 'ok  ' : 'FAIL', name, cond ? '' : JSON.stringify(got)); };

// --- one key per address ---
const same = (a: string, b: string) => normUrl(a) === normUrl(b);
ok('scheme, www and trailing slash do not make a new page', same('http://www.liftmedia.example/faq/', 'https://liftmedia.example/faq'));
ok('tracking parameters and fragments are dropped', same('https://liftmedia.example/tin-tuc/a?utm_source=chatgpt.com&utm_medium=rss#top', 'https://liftmedia.example/tin-tuc/a'));
ok('a parameter that selects content is kept', !same('https://liftmedia.example/a?lang=en', 'https://liftmedia.example/a') && same('https://liftmedia.example/a?b=2&a=1', 'https://liftmedia.example/a?a=1&b=2'));
ok('host and path case, index.html', same('https://LiftMedia.example/Tin-Tuc/A/index.html', 'liftmedia.example/tin-tuc/a'));
ok('the home page in its three spellings', same('http://liftmedia.example', 'https://www.liftmedia.example/') && normUrl('https://liftmedia.example/') === 'liftmedia.example');
ok('not a web address → null', normUrl('mailto:a@b.example') === null && normUrl('') === null && normUrl('không phải link') === null, [normUrl('mailto:a@b.example'), normUrl('không phải link')]);

// --- candidate target questions ---
const core = [
  'Quảng cáo trong thang máy có hiệu quả không?',
  'Chi phí quảng cáo màn hình LCD trong tòa nhà khoảng bao nhiêu?',
  'Quảng cáo DOOH là gì và hoạt động như thế nào?',
  'Kênh nào tiếp cận được cư dân chung cư hiệu quả nhất?',
  'Top 5 công ty quảng cáo màn hình digital signage tại Việt Nam',
  'Lift Media có uy tín không? Có nên hợp tác không?',
];
ok('accents folded, đ → d, short words dropped', JSON.stringify(tokens('Đo lường ở Hà Nội')) === '["do","luong","ha","noi"]', tokens('Đo lường ở Hà Nội'));
ok('Han text is cut into pairs', JSON.stringify(tokens('电梯广告')) === '["电梯","梯广","广告"]', tokens('电梯广告'));
const c1 = candidateQuestions('Kênh nào tiếp cận cư dân chung cư hiệu quả nhất? | Lift Media', core, 'Lift Media');
ok('a title that is the question: that question first, pre-selected', c1[0]?.n === 4 && c1[0].strong, c1);
const c2 = candidateQuestions('Chi phí quảng cáo màn hình LCD cho doanh nghiệp nhỏ', core, 'Lift Media');
ok('a partial match is offered but not pre-selected', c2[0]?.n === 2 && !c2[0].strong, c2);
ok('a title sharing only the brand name and common words matches nothing', candidateQuestions('Lift Media quảng cáo', core, 'Lift Media').length === 0);
ok('an FAQ title matches nothing; at most three are offered', candidateQuestions('Những câu hỏi thường gặp', core, 'Lift Media').length === 0 && candidateQuestions(core.join(' '), core, 'Lift Media').length === 3);

// --- detection ---
const NOW = new Date('2026-10-11T03:00:00Z');   // window starts 2026-08-27
const page = (url: string, over: Partial<FetchedPage> = {}): FetchedPage =>
  ({ url, ok: true, title: 'Trang', canonical: null, finalUrl: url, textHash: `h:${url}`, wordCount: 900, publishedAt: null, firstSeenAt: '2026-09-23T17:00:00Z', ...over });
const base = (over: Partial<DetectionInput> = {}): DetectionInput => ({
  now: NOW, ownHosts: ['liftmedia.example'], core, brandName: 'Lift Media',
  discovered: [], pages: [], cited: [], firstScanAt: '2026-06-26T02:00:00Z', loggedUrls: [], suggestedKeys: [], ...over,
});
const H = 'https://liftmedia.example';
const urls = (i: DetectionInput) => detectSuggestions(i).suggestions.map((s) => s.url);
const why = (i: DetectionInput) => Object.entries(detectSuggestions(i).skipped).filter(([, u]) => u.length).map(([k]) => k).join(',');

const faq = base({
  discovered: [{ url: `${H}/faq`, discoveredAt: '2026-09-23T17:17:00Z' }, { url: `${H}/gioi-thieu`, discoveredAt: '2026-09-23T17:17:00Z' }],
  pages: [page(`${H}/faq`, { title: 'Những câu hỏi thường gặp', firstSeenAt: '2026-09-25T02:00:00Z' }), page(`${H}/gioi-thieu`)],
  cited: [
    { url: `${H}/faq`, firstTs: '2026-09-18T02:10:00Z', cites: 90, engines: ['Perplexity'] },
    { url: `${H}/faq/?utm_source=chatgpt.com`, firstTs: '2026-09-25T02:10:00Z', cites: 10, engines: ['Google AI Overview'] },
  ],
});
const rf = detectSuggestions(faq);
ok('a page first cited inside the window is suggested once, variants merged', rf.suggestions.length === 1 && rf.suggestions[0].url === `${H}/faq` && rf.suggestions[0].evidence.cites === 100 && rf.suggestions[0].evidence.engines.length === 2, rf.suggestions);
ok('its date guess is the first sighting, and says so', rf.suggestions[0].publishedGuess === '2026-09-18' && rf.suggestions[0].guessSource === 'first_seen', rf.suggestions[0]);
ok('a page only seen in site-discover\'s first pass is the baseline, not news', rf.skipped.baseline.length === 1 && rf.skipped.baseline[0] === `${H}/gioi-thieu`, rf.skipped);

ok('a page cited before the window is never a candidate', (() => { const r = detectSuggestions(base({ pages: [page(`${H}/cu`)], cited: [{ url: `${H}/cu/`, firstTs: '2026-07-08T02:00:00Z', cites: 40, engines: ['Perplexity'] }] })); return r.suggestions.length === 0 && r.seenBeforeWindow === 1; })());
ok('an old page at a new address (redirect) is still the old page', urls(base({
  pages: [page(`${H}/bao-gia/`, { finalUrl: `${H}/tin-tuc/bao-gia`, canonical: `${H}/tin-tuc/bao-gia` }), page(`${H}/tin-tuc/bao-gia`)],
  cited: [{ url: `${H}/bao-gia/`, firstTs: '2026-06-26T02:00:00Z', cites: 47, engines: ['Perplexity'] }, { url: `${H}/tin-tuc/bao-gia`, firstTs: '2026-09-25T02:00:00Z', cites: 19, engines: ['Perplexity'] }],
})).length === 0);
ok('the same text at two addresses is one page', urls(base({
  pages: [page(`${H}/vi/tin-tuc/a`, { textHash: 'same' }), page(`${H}/tin-tuc/a`, { textHash: 'same' })],
  cited: [{ url: `${H}/tin-tuc/a`, firstTs: '2026-07-08T02:00:00Z', cites: 5, engines: ['Perplexity'] }, { url: `${H}/vi/tin-tuc/a`, firstTs: '2026-09-29T02:00:00Z', cites: 1, engines: ['Perplexity'] }],
})).length === 0);
ok('a canonical pointing at the home page does not swallow the page', urls(base({
  pages: [page(`${H}/tin-tuc/moi`, { canonical: `${H}/` })],
  cited: [{ url: `${H}/tin-tuc/moi`, firstTs: '2026-09-25T02:00:00Z', cites: 3, engines: ['Perplexity'] }],
})).join() === `${H}/tin-tuc/moi`);

const second = base({
  discovered: [{ url: `${H}/`, discoveredAt: '2026-09-23T17:17:00Z' }, { url: `${H}/ai-visibility`, discoveredAt: '2026-10-09T02:04:00Z' }],
  pages: [page(`${H}/`), page(`${H}/ai-visibility`, { firstSeenAt: '2026-10-09T02:10:00Z' })],
});
ok('a page that appears in a later site-discover pass is suggested; the home page never', urls(second).join() === `${H}/ai-visibility` && why(second) === 'home', [urls(second), why(second)]);

const dated = (publishedAt: string | null, lastmod: string | null = null) => base({
  discovered: [{ url: `${H}/bai`, discoveredAt: '2026-09-23T17:17:00Z', lastmod }],
  pages: [page(`${H}/bai`, { publishedAt })],
});
const d1 = detectSuggestions(dated('2026-09-17T08:00:00Z')).suggestions[0];
ok('a publish date stated on the page inside the window: suggested with that date', d1?.publishedGuess === '2026-09-17' && d1.guessSource === 'page_meta', d1);
ok('a publish date stated before the window: an old page found late', why(dated('2026-07-09T00:00:00Z')) === 'stated-old' && urls(dated('2026-07-09T00:00:00Z')).length === 0);
ok('a stated date later than the first sighting is not believed', why(dated('2026-10-05T00:00:00Z')) === 'baseline');
const d2 = detectSuggestions(dated(null, '2026-09-20T00:00:00Z')).suggestions[0];
ok('sitemap lastmod is the guess when the page states no date', d2?.publishedGuess === '2026-09-20' && d2.guessSource === 'sitemap_lastmod', d2);
const d3 = detectSuggestions(dated('2026-09-17T08:00:00Z', '2026-09-20T00:00:00Z')).suggestions[0];
ok('the page\'s own date wins over lastmod', d3?.guessSource === 'page_meta' && d3.publishedGuess === '2026-09-17', d3);

const cite = (path: string) => ({ url: `${H}${path}`, firstTs: '2026-09-25T02:00:00Z', cites: 2, engines: ['Perplexity'] });
ok('already logged under another spelling of the address', why(base({ pages: [page(`${H}/tin-tuc/x`)], cited: [cite('/tin-tuc/x')], loggedUrls: ['http://www.liftmedia.example/tin-tuc/x/?utm_source=zalo'] })) === 'logged');
ok('already suggested (pending, confirmed or dismissed) is not suggested again', why(base({ pages: [page(`${H}/tin-tuc/x`)], cited: [cite('/tin-tuc/x')], suggestedKeys: ['liftmedia.example/tin-tuc/x'] })) === 'already-suggested');
ok('contact pages, language switches and locale roots are left out', (() => {
  const r = detectSuggestions(base({ pages: ['/lien-he', '/en/contact', '/lang/changeLang/vi', '/en'].map((p) => page(`${H}${p}`)), cited: ['/lien-he', '/en/contact', '/lang/changeLang/vi', '/en'].map(cite) }));
  return r.suggestions.length === 0 && r.skipped.utility.length === 3 && r.skipped.home.length === 1;
})());
ok('a section index with pages beneath it is left out; the page beneath is not', (() => {
  const i = base({ pages: [page(`${H}/tin-tuc`), page(`${H}/tin-tuc/y`)], cited: [cite('/tin-tuc'), cite('/tin-tuc/y')] });
  return urls(i).join() === `${H}/tin-tuc/y` && why(i) === 'hub';
})());
ok('a page that answers 404 or 500 is not suggested', why(base({ pages: [page(`${H}/tin-tuc/z`, { ok: false })], cited: [cite('/tin-tuc/z')] })) === 'not-live');
ok('a nearly empty page is not suggested', why(base({ pages: [page(`${H}/tin-tuc/w`, { wordCount: 30 })], cited: [cite('/tin-tuc/w')] })) === 'thin');
const unreadCase = detectSuggestions(base({ cited: [cite('/tin-tuc/chua-doc'), { ...cite('/tin-tuc/chua-doc-2'), cites: 9 }] }));
ok('a page the fetcher has not read waits, and is queued most cited first', unreadCase.suggestions.length === 0 && unreadCase.unread.map((u) => u.cites).join() === '9,2', unreadCase.unread);
ok('another site\'s page is none of this', detectSuggestions(base({ pages: [page('https://news.example/a')], cited: [{ url: 'https://news.example/a', firstTs: '2026-09-25T02:00:00Z', cites: 50, engines: ['Perplexity'] }] })).suggestions.length === 0);
ok('in a project\'s first scan everything is first cited: nothing is suggested from it', why(base({ firstScanAt: '2026-09-25T01:50:00Z', pages: [page(`${H}/tin-tuc/x`)], cited: [cite('/tin-tuc/x')] })) === 'baseline');
ok('a single citation alone is not news; with a date on the page it is', why(base({ pages: [page(`${H}/tin-tuc/mot-lan`)], cited: [{ ...cite('/tin-tuc/mot-lan'), cites: 1 }] })) === 'cited-once'
  && urls(base({ pages: [page(`${H}/tin-tuc/mot-lan`, { publishedAt: '2026-09-20T00:00:00Z' })], cited: [{ ...cite('/tin-tuc/mot-lan'), cites: 1 }] })).length === 1);
ok('most cited first', urls(base({ pages: [page(`${H}/tin-tuc/it`), page(`${H}/tin-tuc/nhieu`)], cited: [cite('/tin-tuc/it'), { ...cite('/tin-tuc/nhieu'), cites: 80 }] })).join() === `${H}/tin-tuc/nhieu,${H}/tin-tuc/it`);
ok('a wider window reaches further back', urls(base({ windowDays: 90, pages: [page(`${H}/tin-tuc/thang-8`)], cited: [{ ...cite('/tin-tuc/thang-8'), firstTs: '2026-08-21T02:00:00Z' }] })).length === 1 && urls(base({ pages: [page(`${H}/tin-tuc/thang-8`)], cited: [{ ...cite('/tin-tuc/thang-8'), firstTs: '2026-08-21T02:00:00Z' }] })).length === 0);

// --- a tiny in-memory stand-in for the database client ---
function fakeDb(tables: Record<string, any[]>) {
  let ids = 0;
  const from = (name: string) => {
    const rows = (tables[name] ??= []);
    const filters: ((r: any) => boolean)[] = [];
    let op: 'select' | 'update' | 'insert' = 'select', patch: any = null, added: any[] = [], one = false, lim = Infinity;
    const q: any = {
      select: () => q, order: () => q, range: () => q,
      eq: (k: string, v: any) => (filters.push((r) => r[k] === v), q),
      in: (k: string, vs: any[]) => (filters.push((r) => vs.includes(r[k])), q),
      is: (k: string, v: any) => (filters.push((r) => (r[k] ?? null) === v), q),
      not: (k: string, _is: string, v: any) => (filters.push((r) => (r[k] ?? null) !== v), q),
      limit: (n: number) => (lim = n, q),
      update: (p: any) => (op = 'update', patch = p, q),
      insert: (r: any) => (op = 'insert', added = (Array.isArray(r) ? r : [r]).map((x) => ({ id: `${name}-${++ids}`, ...x })), q),
      maybeSingle: () => (one = true, q), single: () => (one = true, q),
      then: (resolve: (v: any) => void) => {
        let hit: any[];
        if (op === 'insert') { rows.push(...added); hit = added; }
        else { hit = rows.filter((r) => filters.every((f) => f(r))); if (op === 'update') hit.forEach((r) => Object.assign(r, patch)); }
        resolve({ data: one ? hit[0] ?? null : hit.slice(0, lim), error: null });
      },
    };
    return q;
  };
  return { from, tables } as any;
}
const seed = () => fakeDb({
  organizations: [{ id: 'root', type: 'root' }, { id: 'client', type: 'client' }],
  organization_members: [
    { organization_id: 'root', user_id: 'operator', role: 'admin' },
    { organization_id: 'client', user_id: 'editor', role: 'editor' },
    { organization_id: 'client', user_id: 'viewer', role: 'viewer' },
    { organization_id: 'client', user_id: 'both', role: 'admin' }, { organization_id: 'root', user_id: 'both', role: 'editor' },
  ],
  projects: [{ id: 'p1', metadata: { coreKeyPrompts: core, larkSuggestedActions: true } }, { id: 'p2', metadata: { coreKeyPrompts: core } }],
  lark_bindings: [],
  interventions: [],
  intervention_suggestions: [
    { id: 's1', project_id: 'p1', seq: 1, url: `${H}/faq`, url_key: 'liftmedia.example/faq', domain: 'liftmedia.example', title: 'Những câu hỏi thường gặp', published_guess: '2026-09-18', guess_source: 'first_seen', target_candidates: [], evidence: { cites: 100 }, status: 'pending' },
    { id: 's2', project_id: 'p1', seq: 2, url: `${H}/tin-tuc/kenh-nao`, url_key: 'liftmedia.example/tin-tuc/kenh-nao', domain: 'liftmedia.example', title: 'Kênh nào tiếp cận cư dân chung cư hiệu quả nhất?', published_guess: '2026-09-04', guess_source: 'page_meta', target_candidates: [{ n: 4, prompt: core[3], shared: 8, strong: true }, { n: 1, prompt: core[0], shared: 2, strong: false }], evidence: { cites: 20 }, status: 'pending' },
    { id: 's3', project_id: 'p1', seq: 3, url: `${H}/coming-soon-2`, url_key: 'liftmedia.example/coming-soon-2', domain: 'liftmedia.example', title: 'Sắp ra mắt', published_guess: '2026-10-02', guess_source: 'first_seen', target_candidates: [], evidence: {}, status: 'pending' },
  ],
});

async function main() {
  // --- who may sign ---
  const client = { id: 'client', parent_org_id: null };
  const db0 = seed();
  ok('a client editor may confirm; a viewer may not', (await canSignForOrg(db0, 'editor', client)) && !(await canSignForOrg(db0, 'viewer', client)));
  ok('a MemeCMO operator may not confirm for a client — even one who is also in the client org', !(await canSignForOrg(db0, 'operator', client)) && !(await canSignForOrg(db0, 'both', client)));
  ok('on the root org\'s own project an operator signs for themselves', await canSignForOrg(db0, 'operator', { id: 'root', parent_org_id: null }));
  ok('a stranger may not', !(await canSignForOrg(db0, 'nobody', client)));

  // --- confirm / dismiss ---
  const db = seed();
  ok('pending list: most cited first', (await loadPendingSuggestions(db, 'p1')).map((s) => s.seq).join() === '1,2,3');
  const r1 = await confirmSuggestion(db, { projectId: 'p1', id: 's1', userId: 'editor', channel: 'web', publishedAt: '2026-09-17', targetPrompts: [], today: '2026-10-11' });
  const iv1 = db.tables.interventions[0];
  ok('confirm creates one content-page action signed by the person, with their date', !('error' in r1) && db.tables.interventions.length === 1 && iv1.logged_by === 'editor' && iv1.published_at === '2026-09-17' && iv1.kind === 'content_page' && iv1.url === `${H}/faq` && iv1.channel === 'web', iv1);
  ok('the suggestion is marked confirmed and linked to it', (() => { const s = db.tables.intervention_suggestions[0]; return s.status === 'confirmed' && s.confirmed_by === 'editor' && !!s.confirmed_at && s.intervention_id === iv1.id; })(), db.tables.intervention_suggestions[0]);
  const again = await confirmSuggestion(db, { projectId: 'p1', id: 's1', userId: 'editor', channel: 'web', today: '2026-10-11' });
  ok('a second click logs nothing', 'error' in again && again.error === 'already-confirmed' && db.tables.interventions.length === 1, again);
  const future = await confirmSuggestion(db, { projectId: 'p1', id: 's2', userId: 'editor', channel: 'web', publishedAt: '2026-10-20', today: '2026-10-11' });
  ok('a publish date in the future is refused and the suggestion stays pending', 'error' in future && future.error === 'future-date' && db.tables.intervention_suggestions[1].status === 'pending', future);
  ok('another project\'s suggestion cannot be confirmed from here', 'error' in (await confirmSuggestion(db, { projectId: 'p2', id: 's2', userId: 'editor', channel: 'web', today: '2026-10-11' })));
  ok('"not ours" removes it from the list and logs nothing', (await dismissSuggestion(db, { projectId: 'p1', id: 's3', userId: 'editor' })).ok && db.tables.intervention_suggestions[2].status === 'dismissed' && db.tables.intervention_suggestions[2].dismissed_by === 'editor' && db.tables.interventions.length === 1);
  ok('pending list now holds only the undecided one', (await loadPendingSuggestions(db, 'p1')).map((s) => s.seq).join() === '2');
  db.tables.interventions.push({ id: 'manual', project_id: 'p1', url: `${H}/tin-tuc/kenh-nao/`, status: 'live' });
  ok('a page logged by hand in the meantime no longer shows as pending', (await loadPendingSuggestions(db, 'p1')).length === 0);

  // --- the Lark command ---
  ok('/xacnhan 3 → number only', JSON.stringify(parseXacnhan('/xacnhan 3', '2026-10-11')) === '{"n":3,"date":null,"targets":null}', parseXacnhan('/xacnhan 3', '2026-10-11'));
  ok('number, day/month and questions in any order', JSON.stringify(parseXacnhan('Q5, Q02 17/09 /xacnhan #12', '2026-10-11')) === '{"n":12,"date":"2026-09-17","targets":[5,2]}', parseXacnhan('Q5, Q02 17/09 /xacnhan #12', '2026-10-11'));
  ok('an ISO date is not read as the number', JSON.stringify(parseXacnhan('/xacnhan 2026-09-17 4', '2026-10-11')) === '{"n":4,"date":"2026-09-17","targets":null}', parseXacnhan('/xacnhan 2026-09-17 4', '2026-10-11'));
  ok('no number → none', parseXacnhan('/xacnhan Q3', '2026-10-11').n === null);
  const h = parseHanhdong('/hanhdong https://vnexpress.example/bai 02/10 Q1 bài tiêu chuẩn', '2026-10-11', ['liftmedia.example']);
  ok('/hanhdong still reads its date, question and kind', h.date === '2026-10-02' && !h.dateGuessed && h.targets.join() === '1' && h.kind === 'third_party_placement' && h.url === 'https://vnexpress.example/bai', h);
  ok('/hanhdong without a date still defaults to today', parseHanhdong('/hanhdong https://liftmedia.example/a', '2026-10-11', ['liftmedia.example']).dateGuessed === true);

  ok('the flag is off unless set to true', !larkSuggestionsOn({ metadata: {} }) && !larkSuggestionsOn(null) && !larkSuggestionsOn({ metadata: { larkSuggestedActions: 'yes' } }) && larkSuggestionsOn({ metadata: { larkSuggestedActions: true } }));
  const ldb = seed();
  const project = ldb.tables.projects[0];
  const l1 = await confirmFromLark(ldb, { project, userId: 'editor', text: '/xacnhan 2', messageId: 'om_1', today: '2026-10-11' });
  const liv = ldb.tables.interventions[0];
  ok('/xacnhan 2 logs suggestion 2 for the sender, with the guessed date and the pre-selected question', l1.outcome === 'xacnhan:saved:2' && liv?.logged_by === 'editor' && liv.channel === 'lark' && liv.lark_message_id === 'om_1' && liv.published_at === '2026-09-04' && liv.target_prompts.length === 1 && liv.target_prompts[0].prompt === core[3] && l1.interventionId === liv.id, [l1, liv]);
  ok('the reply names the page, the date as an estimate, and the question', /#2/.test(l1.reply) && /2026-09-04 \(ước tính/.test(l1.reply) && /Q4/.test(l1.reply), l1.reply);
  const l2 = await confirmFromLark(ldb, { project, userId: 'editor', text: '/xacnhan 2', messageId: 'om_2', today: '2026-10-11' });
  ok('the same reply delivered twice logs once', l2.outcome === 'xacnhan:already-confirmed' && ldb.tables.interventions.length === 1, l2);
  const l3 = await confirmFromLark(ldb, { project, userId: 'editor', text: '/xacnhan 1 17/09 Q1', messageId: 'om_3', today: '2026-10-11' });
  ok('a typed date and question replace the guesses', l3.outcome === 'xacnhan:saved:1' && ldb.tables.interventions[1].published_at === '2026-09-17' && ldb.tables.interventions[1].target_prompts[0].prompt === core[0] && !/ước tính/.test(l3.reply), [l3, ldb.tables.interventions[1]]);
  ok('an unknown number and a missing number say so and log nothing', (await confirmFromLark(ldb, { project, userId: 'editor', text: '/xacnhan 99', messageId: 'om_4', today: '2026-10-11' })).outcome === 'xacnhan:not-found' && (await confirmFromLark(ldb, { project, userId: 'editor', text: '/xacnhan', messageId: 'om_5', today: '2026-10-11' })).outcome === 'xacnhan:no-number' && ldb.tables.interventions.length === 2);

  const text = suggestionListText(seed().tables.intervention_suggestions);
  ok('the group list numbers each page by its own number and shows the pre-selected question', /#1 · Những câu hỏi thường gặp/.test(text) && /#2 · /.test(text) && /Q4 ✓, Q1/.test(text) && /\/xacnhan/.test(text) && /2026-09-18/.test(text), text);
  const pdb = seed();
  ok('posting the list refuses without a named approver', (await postSuggestionList(pdb, { projectId: 'p1', approvedBy: ' ' })) === 'refused:no-approver');
  ok('posting refuses while the project flag is off', (await postSuggestionList(pdb, { projectId: 'p2', approvedBy: 'someone' })) === 'refused:flag-off');
  ok('posting refuses when no group is bound', (await postSuggestionList(pdb, { projectId: 'p1', approvedBy: 'someone' })) === 'refused:unbound');

  // --- unconfirmed pages carry no weight ---
  const samples = core.map((prompt) => ({ prompt, brandPresent: false }));
  const none = computeAlignment({ core, baselineSamples: samples, updates: [] });
  ok('with pages found but none confirmed, alignment is still "no update", not a score', none.cos === null && none.trust === null);

  console.log(bad ? `\n${bad} failing` : '\nall passing');
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
