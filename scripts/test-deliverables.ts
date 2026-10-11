// Rules behind the typeset deliverable view (lib/deliverables/*).
//   npx tsx --tsconfig tsconfig.json scripts/test-deliverables.ts
// Half of the cases are things the view must show properly; the other half is
// client copy that must come through exactly as written. The fixtures follow
// the shapes of real kits (FMVN, 2026-09-28) with the brand replaced.

import { parseMarkdown, parseInline, toPlainText, inlineText, type Block, type Inline } from '../lib/deliverables/markdown';
import { splitFields, isFieldList, parseKit, matchPlacements, parseContentDoc, hostOf } from '../lib/deliverables/layout';

let bad = 0;
const ok = (name: string, cond: boolean, got?: unknown) => { if (!cond) bad++; console.log(cond ? 'ok  ' : 'FAIL', name, cond ? '' : JSON.stringify(got)); };

// Compact rendering of the tree, for assertions only.
const inl = (c: Inline[]): string => c.map((n) =>
  n.t === 'text' ? n.v : n.t === 'br' ? '<br>' : n.t === 'code' ? `<code>${n.v}</code>`
    : n.t === 'link' ? `<a ${n.href}>${inl(n.c)}</a>` : `<${n.t === 'strong' ? 'b' : 'i'}>${inl(n.c)}</${n.t === 'strong' ? 'b' : 'i'}>`).join('');
const blk = (bs: Block[]): string => bs.map((b) =>
  b.t === 'heading' ? `<h${b.level}>${inl(b.c)}</h${b.level}>` : b.t === 'para' ? `<p>${inl(b.c)}</p>` : b.t === 'rule' ? '<hr>'
    : b.t === 'code' ? `<pre ${b.lang}>${b.v}</pre>` : b.t === 'quote' ? `<q>${blk(b.blocks)}</q>`
      : b.t === 'table' ? `<table>${[b.head, ...b.rows].map((r) => `<tr>${r.map((c) => `<td>${inl(c)}</td>`).join('')}</tr>`).join('')}</table>`
        : `<${b.ordered ? 'ol' : 'ul'}>${b.items.map((it) => `<li${it.checked === undefined ? '' : it.checked ? ' x' : ' o'}>${blk(it.blocks)}</li>`).join('')}</${b.ordered ? 'ol' : 'ul'}>`).join('');
const md = (s: string) => blk(parseMarkdown(s));
const line = (s: string) => inl(parseInline(s));

// ── What must be typeset ─────────────────────────────────────────────────────
ok('headings by level', md('# Một\n## Hai\n### Ba') === '<h1>Một</h1><h2>Hai</h2><h3>Ba</h3>', md('# Một\n## Hai\n### Ba'));
ok('bold, italic, inline code', line('**đậm** và *nghiêng* và `mã`') === '<b>đậm</b> và <i>nghiêng</i> và <code>mã</code>', line('**đậm** và *nghiêng* và `mã`'));
ok('bold-italic', line('***cả hai***') === '<b><i>cả hai</i></b>');
ok('bold next to CJK without spaces', line('这是**重点**内容') === '这是<b>重点</b>内容', line('这是**重点**内容'));
ok('underscore emphasis around a phrase that contains snake_case', line('_(industry_media · high effort)_') === '<i>(industry_media · high effort)</i>', line('_(industry_media · high effort)_'));
ok('unordered list', md('- một\n- hai') === '<ul><li><p>một</p></li><li><p>hai</p></li></ul>', md('- một\n- hai'));
ok('ordered list keeps its start', md('3. ba\n4. bốn') === '<ol><li><p>ba</p></li><li><p>bốn</p></li></ol>' && (parseMarkdown('3. ba\n4. bốn')[0] as any).start === 3);
ok('nested list', md('- cha\n  - con\n- chú') === '<ul><li><p>cha</p><ul><li><p>con</p></li></ul></li><li><p>chú</p></li></ul>', md('- cha\n  - con\n- chú'));
ok('task list (site and encyclopedia checklists)', md('- [x] **Schema** (ok) — giữ\n- [ ] **FAQ** (missing) — thêm') === '<ul><li x><p><b>Schema</b> (ok) — giữ</p></li><li o><p><b>FAQ</b> (missing) — thêm</p></li></ul>', md('- [x] **Schema** (ok) — giữ\n- [ ] **FAQ** (missing) — thêm'));
ok('a list directly under a label line', md('**Cộng đồng mục tiêu:**\n- Nhóm A\n- Nhóm B') === '<p><b>Cộng đồng mục tiêu:</b></p><ul><li><p>Nhóm A</p></li><li><p>Nhóm B</p></li></ul>', md('**Cộng đồng mục tiêu:**\n- Nhóm A\n- Nhóm B'));
ok('blockquote', md('> Why: được AI trích dẫn 651×') === '<q><p>Why: được AI trích dẫn 651×</p></q>');
ok('link', line('xem [bảng giá](https://example.vn/gia) nhé') === 'xem <a https://example.vn/gia>bảng giá</a> nhé');
ok('horizontal rule', md('trên\n\n---\n\ndưới') === '<p>trên</p><hr><p>dưới</p>');
ok('fenced code keeps its text exactly', md('```json\n{ "a": "**b**" }\n```') === '<pre json>{ "a": "**b**" }</pre>', md('```json\n{ "a": "**b**" }\n```'));
ok('table', md('| Định dạng | Thời lượng |\n| --- | --- |\n| LCD | 15 giây |') === '<table><tr><td>Định dạng</td><td>Thời lượng</td></tr><tr><td>LCD</td><td>15 giây</td></tr></table>', md('| Định dạng | Thời lượng |\n| --- | --- |\n| LCD | 15 giây |'));
ok('an HTML comment is a note for the source, not content', md('---\n\n<!-- JSON-LD: paste into the page <head> for AEO -->\n```json\n{}\n```') === '<hr><pre json>{}</pre>', md('---\n\n<!-- JSON-LD: paste into the page <head> for AEO -->\n```json\n{}\n```'));

// ── What must NOT be mangled ─────────────────────────────────────────────────
const url = 'https://example.vn/bao_gia_2026_final.pdf';
ok('a URL with underscores is one link, untouched', line(`Tải tại ${url}.`) === `Tải tại <a ${url}>${url}</a>.`, line(`Tải tại ${url}.`));
ok('…also inside emphasis', line(`_xem ${url} trước_`) === `<i>xem <a ${url}>${url}</a> trước</i>`, line(`_xem ${url} trước_`));
ok('a URL in brackets loses only the bracket', line(`(${url})`) === `(<a ${url}>${url}</a>)`);
ok('"TP.HCM" stays text — bare domains are not links', line('Hà Nội hay TP.HCM, focusmedia.vn') === 'Hà Nội hay TP.HCM, focusmedia.vn');
ok('a price with an asterisk and its footnote', line('Giá từ 5.000.000đ*/tuần (*chưa gồm VAT)') === 'Giá từ 5.000.000đ*/tuần (*chưa gồm VAT)', line('Giá từ 5.000.000đ*/tuần (*chưa gồm VAT)'));
ok('two starred prices on one line', line('2.500.000* VND – 4.000.000* VND') === '2.500.000* VND – 4.000.000* VND', line('2.500.000* VND – 4.000.000* VND'));
ok('asterisks between numbers and letters', line('3*4*5 và a*b*c và 5**2**3') === '3*4*5 và a*b*c và 5**2**3', line('3*4*5 và a*b*c và 5**2**3'));
ok('a footnote line starting with an asterisk', md('*Giá chưa bao gồm VAT') === '<p>*Giá chưa bao gồm VAT</p>', md('*Giá chưa bao gồm VAT'));
ok('an escaped asterisk', line('5 sao \\*\\*\\*\\*\\*') === '5 sao *****');
const vi = 'Tầng 21, Tòa tháp 1, 3A-3B Tôn Đức Thắng, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh';
ok('Vietnamese diacritics round-trip', toPlainText(vi) === vi && toPlainText(vi.normalize('NFD')) === vi.normalize('NFD'));
ok('hashtags are not headings', md('#TruyềnThôngThangMáy #DOOH #Focus_Media_Vietnam') === '<p>#TruyềnThôngThangMáy #DOOH #Focus_Media_Vietnam</p>', md('#TruyềnThôngThangMáy #DOOH #Focus_Media_Vietnam'));
ok('line breaks inside a paragraph are kept', md('✅ Tiếp cận lặp lại\n✅ Hạ tầng 5G\n📞 1900 0000') === '<p>✅ Tiếp cận lặp lại<br>✅ Hạ tầng 5G<br>📞 1900 0000</p>', md('✅ Tiếp cận lặp lại\n✅ Hạ tầng 5G\n📞 1900 0000'));
ok('a stray ** cannot bold across lines', md('**Lưu ý\ndòng hai** hết') === '<p>**Lưu ý<br>dòng hai** hết</p>', md('**Lưu ý\ndòng hai** hết'));
ok('figures with dots are not list items', md('18.000+ điểm chạm trên 2.000+ tòa nhà') === '<p>18.000+ điểm chạm trên 2.000+ tòa nhà</p>' && md('2026. Năm của DOOH') === '<p>2026. Năm của DOOH</p>');
ok('a wrapped line starting "15. " stays in its paragraph', md('video dài\n15. giây mỗi lần') === '<p>video dài<br>15. giây mỗi lần</p>', md('video dài\n15. giây mỗi lần'));
ok('a phone number is not a list', md('1900 5111 | info@example.vn') === '<p>1900 5111 | info@example.vn</p>');
ok('pipes followed by a rule are not a table', md('1900 5111 | info@example.vn | example.vn\n---') === '<p>1900 5111 | info@example.vn | example.vn</p><hr>', md('1900 5111 | info@example.vn | example.vn\n---'));
ok('raw HTML is text, never markup', line('Thêm <script>alert(1)</script> vào <head>') === 'Thêm <script>alert(1)</script> vào <head>');
ok('a javascript: link is not a link', line('[bấm](javascript:alert(1))') === '[bấm](javascript:alert(1))', line('[bấm](javascript:alert(1))'));
ok('code keeps markers', line('dùng `**kwargs` và `a_b_c`') === 'dùng <code>**kwargs</code> và <code>a_b_c</code>');
ok('plain text out: markers gone, structure kept', toPlainText('## Dịch vụ\n\n**Elevator TV** và *Digital Frame*\n\n- một\n- hai\n\n1. ba\n2. bốn') === 'Dịch vụ\n\nElevator TV và Digital Frame\n\n- một\n- hai\n\n1. ba\n2. bốn', toPlainText('## Dịch vụ\n\n**Elevator TV** và *Digital Frame*\n\n- một\n- hai\n\n1. ba\n2. bốn'));
ok('plain text out: a link keeps its address once', inlineText(parseInline('[bảng giá](https://example.vn/gia) · https://example.vn')) === 'bảng giá (https://example.vn/gia) · https://example.vn');

// ── Labelled fields ──────────────────────────────────────────────────────────
const listing = [
  '**Tên doanh nghiệp:** Acme Lift Media',
  '',
  '**Mô tả:**',
  'Acme Lift Media là công ty truyền thông thang máy. Mạng lưới 18.000+ điểm chạm.',
  '',
  '**Địa chỉ:** Tầng 21, 3A-3B Tôn Đức Thắng, Quận 1, TP. Hồ Chí Minh',
  '',
  '**Điện thoại:** 1900 0000',
  '',
  '**Website**: https://example.vn/gioi_thieu',
  '',
  '**Giờ làm việc:** Thứ Hai – Thứ Sáu: 9:00–18:00',
].join('\n');
const f = splitFields(listing);
ok('a directory listing splits into its fields', isFieldList(f) && f.map((s) => s.label).join('|') === 'Tên doanh nghiệp|Mô tả|Địa chỉ|Điện thoại|Website|Giờ làm việc', f);
ok('the value only — no label, no markers', f[2].value === 'Tầng 21, 3A-3B Tôn Đức Thắng, Quận 1, TP. Hồ Chí Minh' && f[3].value === '1900 0000' && toPlainText(f[4].value) === 'https://example.vn/gioi_thieu', f);
ok('a label alone on its line takes the paragraph under it', f[1].value.startsWith('Acme Lift Media là công ty') && f[1].value.endsWith('điểm chạm.'), f[1]);
ok('a colon inside the value does not split it', f[5].value === 'Thứ Hai – Thứ Sáu: 9:00–18:00', f[5]);

const profile = ['**Tagline:** Truyền thông thang máy', '', '**About (Giới thiệu):**', 'Đoạn một.', '', 'Đoạn hai.', '', 'Đoạn ba.', '', '**Founded:** 2023'].join('\n');
const pf = splitFields(profile);
ok('a multi-paragraph field stays one field', pf.length === 3 && pf[1].label === 'About (Giới thiệu)' && pf[1].value === 'Đoạn một.\n\nĐoạn hai.\n\nĐoạn ba.', pf);

const mixed = ['**Acme Lift Media (Acme Co., Ltd.)**', '', 'Đoạn giới thiệu không có nhãn.', '', '**Quy mô:** 18.000+ màn hình', '', '**Liên hệ:** 1900 0000 | info@example.vn', '', 'Câu kết không có nhãn.'].join('\n');
const mx = splitFields(mixed);
ok('prose around the fields is kept, in order', mx.map((s) => s.label ?? '·').join('|') === '·|Quy mô|Liên hệ|·' && mx[0].value.includes('Đoạn giới thiệu') && mx[3].value === 'Câu kết không có nhãn.', mx);
ok('a pitch is prose, not a form', !isFieldList(splitFields('Truyền thông thang máy đang chuyển đổi.\n\n**Lưu ý: số liệu công bố năm 2026**\n\nLiên hệ: 1900 0000')));
ok('one label does not make a form', !isFieldList(splitFields('**Liên hệ:** 1900 0000\n\nPhần còn lại là văn xuôi.')));
ok('full-width colon (Chinese listings)', splitFields('**地址：** 胡志明市第一郡\n\n**电话：** 1900 0000').map((s) => `${s.label}=${s.value}`).join('|') === '地址=胡志明市第一郡|电话=1900 0000', splitFields('**地址：** 胡志明市第一郡\n\n**电话：** 1900 0000'));

// ── Distribution kit ─────────────────────────────────────────────────────────
// Same assembly as lib/agents/distribute.ts.
const targets = [
  { domain: 'brandsvietnam.com', channelType: 'industry_media', tier: 1, effort: 'high', format: 'submission', title: 'Acme Lift Media: Hạ tầng truyền thông thang máy thế hệ mới', draft: 'Acme Lift Media vận hành 18.000+ điểm chạm.\n\nThông tin: 1900 0000 | info@example.vn', why: 'BrandsVietnam is cited 651× by AI engines.' },
  { domain: 'facebook.com', channelType: 'social', tier: 2, effort: 'quick', format: 'submission', title: 'Acme Lift Media – Truyền thông thang máy', draft: '🏢 Quy mô: 18.000+ điểm chạm\n📞 1900 0000\n\n#TruyềnThôngThangMáy #DOOH', why: 'Facebook cited 1,613× by AI engines.' },
  { domain: 'facebook.com', channelType: 'community', tier: 2, effort: 'medium', format: 'engagement_brief', title: 'Engagement Brief: Vietnam Marketing Groups', draft: '**Cộng đồng mục tiêu:**\n- Marketing Vietnam\n- OOH & DOOH Vietnam', why: 'Facebook Groups are primary B2B discovery channels.', complianceFlags: ['Engagement brief: official disclosed account · contribute verified facts only.', '1 figure(s) not in the brand facts were replaced with [cần số liệu] — fill in from a verified source or delete.'] },
  { domain: 'google.com/business', channelType: 'directory', tier: 3, effort: 'quick', format: 'submission', title: 'Acme Lift Media – Google Business Profile', draft: listing, why: 'AI engines cite GBP data for location-based queries.' },
];
const tierLabel = (n: number) => (n === 1 ? 'Tier 1 — National / mainstream media' : n === 2 ? 'Tier 2 — Industry / trade media' : 'Tier 3 — Directories / listings (quick wins)');
const kitMd = (() => {
  const out = ['# Acme Lift Media — GEO Distribution Kit', '', 'Market: Vietnam · language: Vietnamese', ''];
  let cur = 0;
  for (const t of targets) {
    if (t.tier !== cur) { out.push(`\n## ${tierLabel(t.tier)}\n`); cur = t.tier; }
    out.push(`### ${t.domain}  _(${t.channelType} · ${t.format === 'engagement_brief' ? 'engagement brief' : `${t.effort} effort`})_`, `**${t.title}**`, '', t.draft, '', `> Why: ${t.why}`, '');
    for (const fl of (t as any).complianceFlags ?? []) out.push(`> ⚠ COMPLIANCE: ${fl}`, '');
  }
  return out.join('\n');
})();
const kit = parseKit(kitMd, targets)!;
ok('one placement per site section', kit?.placements.length === 4 && kit.heading === 'Acme Lift Media — GEO Distribution Kit' && kit.intro === 'Market: Vietnam · language: Vietnamese', kit);
ok('site, tier, type, effort from the heading', kit.placements.map((p) => `${p.site}/${p.tier}/${p.channelType}/${p.effort}`).join(' ') === 'brandsvietnam.com/1/industry_media/high facebook.com/2/social/quick facebook.com/2/community/medium google.com/business/3/directory/quick', kit.placements.map((p) => `${p.site}/${p.tier}/${p.channelType}/${p.effort}`));
ok('title, copy and why come apart', kit.placements[0].title === targets[0].title && kit.placements[0].draft === targets[0].draft && kit.placements[0].why === targets[0].why, kit.placements[0]);
ok('an engagement brief is marked as one, with its flags', kit.placements[2].brief && !kit.placements[1].brief && kit.placements[2].flags.length === 2 && kit.placements[2].flags[1].startsWith('1 figure(s) not in the brand facts'), kit.placements[2]);
ok('the copy carries neither the why nor the flags', !/Why:|COMPLIANCE/.test(kit.placements.map((p) => p.draft).join('\n')));
ok('a listing inside a kit still splits into fields', isFieldList(splitFields(kit.placements[3].draft)) && kit.placements[3].draft === listing);
ok('host drops the path', kit.placements[3].host === 'google.com' && hostOf('www.LinkedIn.com/company') === 'linkedin.com' && hostOf('Zalo OA') === null);
const edited = parseKit(kitMd.replace('Acme Lift Media vận hành 18.000+ điểm chạm.', 'Bản đã sửa tay.'), targets)!;
ok('a hand edit shows in the card (layout follows the text, not the run output)', edited.placements[0].draft.startsWith('Bản đã sửa tay.'), edited.placements[0].draft);
const bare = parseKit('# Kit\n\n## Nhóm 2\n\n### facebook.com\n**Tiêu đề**\n\nNội dung\n\n> Lý do: nền tảng lớn', [{ domain: 'facebook.com', channelType: 'social', tier: 2, effort: 'quick', title: 'Tiêu đề' }])!;
ok('a rewritten heading falls back on the run output', bare.placements[0].channelType === 'social' && bare.placements[0].effort === 'quick' && bare.placements[0].tier === 2 && bare.placements[0].why === 'nền tảng lớn', bare.placements[0]);
const plain = parseKit('## Tier 3\n\n### vds.com.vn (directory · quick effort)\n**T**\n\nNội dung\n\n### Nhóm Facebook (Marketing Vietnam)\n**U**\n\nNội dung', [{ domain: 'vds.com.vn', tier: 3, channelType: 'directory', effort: 'quick', title: 'T' }])!;
ok('heading brackets without underscores: meta only when they hold "a · b"', plain.placements[0].site === 'vds.com.vn' && plain.placements[0].channelType === 'directory' && plain.placements[0].effort === 'quick' && plain.placements[1].site === 'Nhóm Facebook (Marketing Vietnam)', plain.placements.map((p) => [p.site, p.channelType, p.effort]));
ok('a kit with no site sections is not forced into cards', parseKit('# Kit\n\nMột đoạn văn duy nhất.', targets) === null);
ok('a "### " inside a code block is not a placement', parseKit('### a.vn\n**T**\n\n```\n### not a site\n```', [])!.placements.length === 1);

// ── Which action belongs to which placement ──────────────────────────────────
const act = (id: string, title: string | null, domain: string | null) => ({ id, title, domain, published_at: '2026-10-11' });
const ids = (m: { matched: { id: string }[][]; unmatched: { id: string }[] }) => `${m.matched.map((a) => a.map((x) => x.id).join('+') || '-').join(' ')} | ${m.unmatched.map((x) => x.id).join('+') || '-'}`;
const P = kit.placements;
ok('title keeps two placements on one site apart', ids(matchPlacements(P, [act('a', targets[2].title, 'facebook.com'), act('b', targets[1].title, 'facebook.com')])) === '- b a - | -', ids(matchPlacements(P, [act('a', targets[2].title, 'facebook.com'), act('b', targets[1].title, 'facebook.com')])));
ok('title match survives case, spacing and Unicode form', ids(matchPlacements(P, [act('a', `  ${targets[0].title.toUpperCase().normalize('NFD')} `, null)])) === 'a - - - | -', ids(matchPlacements(P, [act('a', `  ${targets[0].title.toUpperCase().normalize('NFD')} `, null)])));
ok('title wins when the live URL is on another host (g.page for a Google profile)', ids(matchPlacements(P, [act('a', targets[3].title, 'g.page')])) === '- - - a | -');
ok('no title: a host that only one placement has', ids(matchPlacements(P, [act('a', null, 'brandsvietnam.com'), act('b', 'tiêu đề đã đổi', 'business.google.com')])) === 'a - - b | -', ids(matchPlacements(P, [act('a', null, 'brandsvietnam.com'), act('b', 'tiêu đề đã đổi', 'business.google.com')])));
ok('no title and two placements on that host: not guessed', ids(matchPlacements(P, [act('a', null, 'm.facebook.com')])) === '- - - - | a', ids(matchPlacements(P, [act('a', null, 'm.facebook.com')])));
ok('nothing to go on: kept, unmatched', ids(matchPlacements(P, [act('a', null, null), act('b', 'khác hẳn', 'vnexpress.net')])) === '- - - - | a+b');
ok('"notfacebook.com" is not facebook.com', ids(matchPlacements([P[0], P[1]], [act('a', null, 'notfacebook.com')])) === '- - | a');
ok('several actions on one placement are all kept', ids(matchPlacements(P, [act('a', targets[0].title, 'brandsvietnam.com'), act('b', targets[0].title, null)])) === 'a+b - - - | -');

// ── Content draft ────────────────────────────────────────────────────────────
// Same assembly as lib/agents/optimize.ts.
const schema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Chi phí bao nhiêu?' }] }, null, 2);
const article = '# Chi phí quảng cáo màn hình LCD?\n\n**Không có mức giá cố định.** Chi phí phụ thuộc vào thành phố (Hà Nội hay TP.HCM).\n\n## Những yếu tố nào quyết định chi phí?\n\n**Định dạng:** Elevator TV/LCD hoặc Digital Frame.';
const pageMd = `> ⚠ REVIEW: 1 figure(s) not in the brand facts were replaced with [cần số liệu] — fill in or delete.\n\n# Chi phí quảng cáo màn hình LCD? | Hướng dẫn 2026\n\n${article}\n\n## FAQ\n\n**Chi phí bao nhiêu?**\n\nTùy chiến dịch.\n\n**Có đo lường được không?**\n\nCó.\n\nQua NFC/QR.\n\n---\n\n<!-- JSON-LD: paste into the page <head> for AEO -->\n\`\`\`json\n${schema}\n\`\`\``;
const doc = parseContentDoc(pageMd)!;
ok('page title, without the review note', doc?.title === 'Chi phí quảng cáo màn hình LCD? | Hướng dẫn 2026' && doc.notes.length === 1 && doc.notes[0].startsWith('1 figure(s)'), doc);
ok('the article is the article — no FAQ, no schema, no rule', doc.article === article, doc.article);
ok('FAQ as questions and answers', doc.faq.length === 2 && doc.faq[0].question === 'Chi phí bao nhiêu?' && doc.faq[0].answer === 'Tùy chiến dịch.' && doc.faq[1].answer === 'Có.\n\nQua NFC/QR.', doc.faq);
ok('the JSON-LD block, byte for byte', doc.schema === schema);
ok('no schema block: still a page', parseContentDoc('# T\n\nThân bài.')?.schema === null && parseContentDoc('# T\n\nThân bài.')?.article === 'Thân bài.');
ok('a last code block that is not JSON stays in the article', parseContentDoc('# T\n\nThân bài.\n\n```\nnpm run build\n```')?.schema === null);
ok('an FAQ that is not question/answer stays in the article', (() => { const d = parseContentDoc('# T\n\nThân.\n\n## FAQ\n\nXem trang hỗ trợ.\n\n**Hỏi?**\n\nĐáp.')!; return d.faq.length === 0 && d.article.includes('## FAQ'); })());
ok('a localized FAQ heading', parseContentDoc('# T\n\nThân.\n\n## Câu hỏi thường gặp\n\n**Hỏi?**\n\nĐáp.')?.faq.length === 1 && parseContentDoc('# T\n\n正文。\n\n## 常见问题\n\n**问?**\n\n答。')?.faq.length === 1);
ok('an article with its own FAQ section: the appended one is the FAQ', (() => { const d = parseContentDoc('# T\n\nThân.\n\n## Câu hỏi thường gặp\n\nPhần này nằm trong bài.\n\n## FAQ\n\n**Hỏi?**\n\nĐáp.')!; return d.faq.length === 1 && d.article.includes('Phần này nằm trong bài.') && !d.article.includes('Hỏi?'); })());
ok('text that no longer opens with a title is shown whole', parseContentDoc('Chỉ còn một đoạn văn.') === null);

console.log(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
