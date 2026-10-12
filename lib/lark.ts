// Lark (larksuite) plumbing for the collaboration bot — tech plan v1.0.
//
// Credentials come only from env (LARK_APP_ID, LARK_APP_SECRET,
// LARK_ENCRYPT_KEY, LARK_VERIFICATION_TOKEN). FMVN's IT keeps control: they
// can reset the secret or disable the app at any time, which cuts the channel.

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { INTERVENTION_KINDS, type InterventionKind } from '@/lib/interventions';

const API = process.env.LARK_API_BASE || 'https://open.larksuite.com/open-apis';

export function larkConfigured(): boolean {
  return !!(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET && process.env.LARK_ENCRYPT_KEY && process.env.LARK_VERIFICATION_TOKEN);
}

// ─── Inbound security ────────────────────────────────────────────────────────
// Body is {"encrypt": base64(iv ‖ AES-256-CBC(json))}, key = SHA-256(encrypt key).
export function larkDecrypt(encrypt: string, encryptKey = process.env.LARK_ENCRYPT_KEY || ''): string {
  const key = createHash('sha256').update(encryptKey).digest();
  const buf = Buffer.from(encrypt, 'base64');
  const decipher = createDecipheriv('aes-256-cbc', key, buf.subarray(0, 16));
  return Buffer.concat([decipher.update(buf.subarray(16)), decipher.final()]).toString('utf8');
}

/** Test helper: the inverse of larkDecrypt. */
export function larkEncrypt(plain: string, encryptKey: string): string {
  const key = createHash('sha256').update(encryptKey).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([iv, cipher.update(plain, 'utf8'), cipher.final()]).toString('base64');
}

// X-Lark-Signature = hex(SHA-256(timestamp + nonce + encryptKey + rawBody)).
export function larkSignature(timestamp: string, nonce: string, rawBody: string, encryptKey = process.env.LARK_ENCRYPT_KEY || ''): string {
  return createHash('sha256').update(timestamp + nonce + encryptKey + rawBody).digest('hex');
}

export function larkSignatureOk(headers: Headers, rawBody: string): boolean {
  const sig = headers.get('x-lark-signature');
  const ts = headers.get('x-lark-request-timestamp');
  const nonce = headers.get('x-lark-request-nonce');
  if (!sig || !ts || !nonce) return false;
  const want = Buffer.from(larkSignature(ts, nonce, rawBody));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

export function larkTokenOk(token: unknown): boolean {
  const want = process.env.LARK_VERIFICATION_TOKEN || '';
  const got = String(token ?? '');
  return !!want && want.length === got.length && timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

// ─── OpenAPI ─────────────────────────────────────────────────────────────────
let cached: { token: string; until: number } | null = null;
async function tenantToken(): Promise<string> {
  if (cached && Date.now() < cached.until) return cached.token;
  const r = await fetch(`${API}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }),
  });
  const d: any = await r.json();
  if (d.code !== 0 || !d.tenant_access_token) throw new Error(`lark token: ${d.code} ${d.msg}`);
  cached = { token: d.tenant_access_token, until: Date.now() + (Number(d.expire || 7200) - 300) * 1000 };
  return cached.token;
}

async function larkApi(path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
  const r = await fetch(`${API}${path}`, {
    method: init.method || 'GET',
    headers: { Authorization: `Bearer ${await tenantToken()}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const d: any = await r.json().catch(() => ({}));
  if (d.code !== 0) throw new Error(`lark ${path}: ${d.code} ${d.msg}`);
  return d.data;
}

/** Reply in thread to a message; returns the reply's message_id. */
export async function larkReply(messageId: string, msg: { text: string } | { card: object }): Promise<string | null> {
  const body = 'text' in msg
    ? { msg_type: 'text', content: JSON.stringify({ text: msg.text }) }
    : { msg_type: 'interactive', content: JSON.stringify(msg.card) };
  const d = await larkApi(`/im/v1/messages/${encodeURIComponent(messageId)}/reply`, { method: 'POST', body });
  return d?.message_id ?? null;
}

/** A new message in a chat (not a reply); returns its message_id. Every call
 *  is a message to the client's group — callers send only on a named person's approval. */
export async function larkSend(chatId: string, msg: { text: string } | { card: object }): Promise<string | null> {
  const body = 'text' in msg
    ? { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text: msg.text }) }
    : { receive_id: chatId, msg_type: 'interactive', content: JSON.stringify(msg.card) };
  const d = await larkApi('/im/v1/messages?receive_id_type=chat_id', { method: 'POST', body });
  return d?.message_id ?? null;
}

/** Replace an interactive card in place (no new message, no notification). */
export async function larkUpdateCard(messageId: string, card: object): Promise<void> {
  await larkApi(`/im/v1/messages/${encodeURIComponent(messageId)}`, { method: 'PATCH', body: { content: JSON.stringify(card) } });
}

/** Delete one of the bot's own messages; false when Lark refuses (then the caller archives the card instead). */
export async function larkDeleteMessage(messageId: string): Promise<boolean> {
  try { await larkApi(`/im/v1/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' }); return true; } catch { return false; }
}

/** Sender's email (needs contact:user.email:readonly and the sender inside the app's contact scope). */
export async function larkUserEmail(openId: string): Promise<string | null> {
  const d = await larkApi(`/contact/v3/users/${encodeURIComponent(openId)}?user_id_type=open_id`);
  const u = d?.user ?? {};
  return (u.email || u.enterprise_email || null) as string | null;
}

// ─── Commands ────────────────────────────────────────────────────────────────
/** Message text without the @mention placeholders ("@_user_1"). */
// Feedback often arrives as rich text ("post": formatting, pasted links, a
// screenshot next to the words); it is flattened here, images marked "[ảnh]".
export function larkText(content: unknown, msgType = 'text'): string {
  let obj: any = {};
  try { obj = JSON.parse(String(content ?? '{}')); } catch { obj = {}; }
  let text = String(obj?.text ?? '');
  if (msgType === 'post') {
    // Received posts are {title, content}; some clients wrap them per locale ({zh_cn: {...}}).
    const body: any = Array.isArray(obj?.content) ? obj : Object.values(obj ?? {}).find((v: any) => Array.isArray(v?.content)) ?? {};
    const el = (e: any): string =>
      e?.tag === 'text' ? String(e.text ?? '')
        : e?.tag === 'a' ? [e.text, e.href].filter((s, i, a) => s && a.indexOf(s) === i).join(' ')
        : e?.tag === 'img' || e?.tag === 'media' ? ' [ảnh] '
        : '';
    const lines = (body.content ?? []).map((para: any) => (Array.isArray(para) ? para.map(el).join('') : ''));
    text = [body.title, ...lines].filter(Boolean).join('\n');
  }
  return text.replace(/@_user_\d+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Group-chat words for each action kind (tech plan §5.1); platform values also accepted.
const KIND_WORDS: [InterventionKind, RegExp][] = [
  ['encyclopedia', /wiki|bách khoa|bach khoa|百科/iu],
  ['directory_profile', /danh bạ|danh ba|directory|目录/iu],
  ['schema', /schema|cấu trúc|cau truc|结构化/iu],
  ['site_update', /cập nhật|cap nhat|site_update|网站更新/iu],
  ['content_page', /trang nội dung|trang noi dung|content_page|官网页面|说明页/iu],
  ['third_party_placement', /báo|bao |bên thứ ba|placement|媒体|稿件/iu],
  ['other', /khác|other|其他/iu],
];

export interface HanhdongDraft {
  url: string | null;
  date: string;            // YYYY-MM-DD
  kind: InterventionKind;
  targets: number[];       // 1-based Core 20 positions ("Q3")
  note: string;
  dateGuessed: boolean;
}

// A date as people type it in the group: YYYY-MM-DD, or DD/MM with an optional year.
function takeDate(text: string, today: string): { date: string | null; rest: string } {
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return { date: `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`, rest: text.replace(iso[0], ' ') };
  const dmy = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  if (dmy) return { date: `${dmy[3] || today.slice(0, 4)}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`, rest: text.replace(dmy[0], ' ') };
  return { date: null, rest: text };
}

/** Parse "/hanhdong <url> <date> [kind] [Q3,Q5] [note]" (order-free after the command). */
export function parseHanhdong(text: string, today: string, brandHosts: string[] = []): HanhdongDraft {
  let rest = text.replace(/(^|\s)\/hanhdong\b/i, ' ');
  const urlM = rest.match(/https?:\/\/[^\s<>"]+/i);
  const url = urlM ? urlM[0].replace(/[),.;]+$/, '') : null;
  if (urlM) rest = rest.replace(urlM[0], ' ');

  const found = takeDate(rest, today);
  const date = found.date ?? today;
  const dateGuessed = !found.date;
  rest = found.rest;

  const targets = [...rest.matchAll(/\bQ0?(\d{1,2})\b/gi)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= 20);
  rest = rest.replace(/\bQ0?\d{1,2}\b[,，]?/gi, ' ');

  let kind: InterventionKind | null = null;
  for (const w of rest.split(/\s+/)) if ((INTERVENTION_KINDS as readonly string[]).includes(w)) kind = w as InterventionKind;
  if (!kind) for (const [k, re] of KIND_WORDS) if (re.test(rest)) { kind = k; break; }
  if (!kind) {
    // Default by where it went live: the brand's own site → a content page; elsewhere → a placement (track A).
    let host = '';
    try { host = url ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch { host = ''; }
    kind = host && brandHosts.some((b) => host === b || host.endsWith('.' + b)) ? 'content_page' : 'third_party_placement';
  }
  return { url, date, kind, targets: [...new Set(targets)], note: rest.replace(/\s+/g, ' ').trim().slice(0, 300), dateGuessed };
}

const KIND_LABEL: Record<InterventionKind, string> = {
  third_party_placement: 'Bài đăng báo / bên thứ ba · 媒体稿件',
  content_page: 'Trang nội dung trên website · 官网页面',
  site_update: 'Cập nhật website · 网站更新',
  schema: 'Dữ liệu cấu trúc · 结构化数据',
  encyclopedia: 'Bách khoa · 百科',
  directory_profile: 'Hồ sơ danh bạ · 目录资料',
  other: 'Khác · 其他',
};

// Logging is bookkeeping, not publishing. Said on every card and in the help,
// because a command with a confirm button reads like "submit this to AI"
// (2026-09-30: a link sent to the bot with "check that AI can index it").
export const NOT_PUBLISHING =
  'MemeCMO không đăng nội dung lên AI nào: AI chỉ đọc các trang web công khai. Thao tác này chỉ ghi lại bài đã đăng. · MemeCMO 不向任何 AI 发布内容：AI 只读公开的网页。这一步只是登记已发布的内容。';

/** Confirmation card. Nothing is written until the sender presses Xác nhận. */
export function hanhdongCard(d: HanhdongDraft, core: string[], ctx: { senderOpenId: string; chatId: string; messageId: string }, state: 'pending' | 'saved' | 'cancelled' = 'pending'): object {
  const targets = d.targets.map((n) => `Q${n} · ${core[n - 1] ?? '—'}`);
  const lines = [
    `**Link:** ${d.url ?? '—'}`,
    `**Ngày đăng · 发布日期:** ${d.date}${d.dateGuessed ? ' (hôm nay · 默认今天)' : ''}`,
    `**Loại · 类型:** ${KIND_LABEL[d.kind]}`,
    `**Câu hỏi mục tiêu · 目标问题:** ${targets.length ? targets.join('\n') : '(chưa chọn · 未指定 — thêm Q1–Q20 nếu cần)'}`,
    ...(d.note ? [`**Ghi chú · 备注:** ${d.note}`] : []),
  ];
  const header = state === 'saved' ? 'Đã ghi hành động · 已登记' : state === 'cancelled' ? 'Đã hủy · 已取消' : 'Xác nhận ghi hành động · 确认登记行动';
  const template = state === 'saved' ? 'green' : state === 'cancelled' ? 'grey' : 'blue';
  const value = { a: '', u: d.url ?? '', d: d.date, k: d.kind, t: d.targets.join(','), n: d.note, s: ctx.senderOpenId, c: ctx.chatId, m: ctx.messageId };
  const elements: any[] = [{ tag: 'div', text: { tag: 'lark_md', content: lines.join('\n') } }];
  if (state === 'pending') {
    elements.push({
      tag: 'action',
      actions: [
        { tag: 'button', type: 'primary', text: { tag: 'plain_text', content: 'Xác nhận · 确认' }, value: { ...value, a: 'hanhdong_confirm' } },
        { tag: 'button', type: 'default', text: { tag: 'plain_text', content: 'Hủy · 取消' }, value: { ...value, a: 'hanhdong_cancel' } },
      ],
    });
    elements.push({ tag: 'note', elements: [{ tag: 'plain_text', content: 'Chỉ người gửi mới xác nhận được · 仅发送人可确认。Sau khi ghi, lần quét tiếp theo sẽ tự tính thay đổi trước/sau ngày đăng.' }] });
  }
  if (state !== 'cancelled') elements.push({ tag: 'note', elements: [{ tag: 'plain_text', content: NOT_PUBLISHING }] });
  return { config: { wide_screen_mode: true, update_multi: true }, header: { template, title: { tag: 'plain_text', content: header } }, elements };
}

// ─── Suggested actions (lib/suggestions) ─────────────────────────────────────
export interface XacnhanDraft { n: number | null; date: string | null; targets: number[] | null }

/** Parse "/xacnhan <n> [date] [Q3,Q5]": confirm suggestion number n. A missing
 *  date keeps the suggestion's own guess; `targets` is null when no Q was typed
 *  (the action is then logged without a target question). */
export function parseXacnhan(text: string, today: string): XacnhanDraft {
  const found = takeDate(text.replace(/(^|\s)\/xacnhan\b/i, ' '), today);
  let rest = found.rest;
  const targets = [...rest.matchAll(/\bQ0?(\d{1,2})\b/gi)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= 20);
  rest = rest.replace(/\bQ0?\d{1,2}\b[,，]?/gi, ' ');
  const n = rest.match(/(?:^|\s)#?(\d{1,5})(?=\s|$)/);
  return { n: n ? Number(n[1]) : null, date: found.date, targets: targets.length ? [...new Set(targets)] : null };
}

const GUESS_LABEL: Record<string, string> = {
  page_meta: 'ngày ghi trên trang · 页面标注',
  sitemap_lastmod: 'ngày trong sitemap · sitemap 日期',
  first_seen: 'ngày nền tảng thấy lần đầu · 平台首次发现',
};

/** The pending suggestions as one group message. Numbers are the suggestions'
 *  own (they never change), so a reply still means the same page days later. */
export function suggestionListText(list: { seq: number; url: string; title: string | null; published_guess: string; guess_source: string; target_candidates: { n: number }[]; evidence?: { cites?: number } }[]): string {
  const items = list.map((s) => {
    const qs = s.target_candidates.map((c) => `Q${c.n}`).join(', ');
    return [
      `#${s.seq} · ${s.title ?? s.url}`,
      `   ${s.url}`,
      `   Ngày đăng (ước tính) · 发布日期(估计): ${s.published_guess} — ${GUESS_LABEL[s.guess_source] ?? s.guess_source}${s.evidence?.cites ? ` · AI đã trích dẫn ${s.evidence.cites} lần · 已被引用 ${s.evidence.cites} 次` : ''}`,
      ...(qs ? [`   Câu hỏi có thể liên quan · 可能对应的问题: ${qs}`] : []),
    ].join('\n');
  });
  return [
    `Nền tảng phát hiện ${list.length} trang mới trên website, chưa được ghi thành hành động · 平台在官网上发现 ${list.length} 个新页面，尚未登记为行动:`,
    '',
    items.join('\n\n'),
    '',
    'Xác nhận · 确认: @bot /xacnhan <số> [ngày đăng] [Q1–Q20]   — ví dụ · 例: /xacnhan 3 17/09 Q5',
    'Không ghi ngày thì dùng ngày ước tính; không ghi Q thì hành động không gắn câu hỏi mục tiêu · 不写日期则用估计日期；不写 Q 则不记目标问题。',
    'Chỉ khi thành viên đội ngũ xác nhận mới được ghi, và ghi dưới tên người xác nhận · 团队成员确认后才登记，并记在确认人名下。',
  ].join('\n');
}

export const XACNHAN_HELP = '• /xacnhan <số> [ngày đăng] [Q1–Q20] — xác nhận một trang nền tảng đã phát hiện · 确认平台发现的页面';

export const HELP_TEXT = [
  'GEO Assistant (MemeCMO) — lệnh · 指令:',
  '• /hanhdong <link> <YYYY-MM-DD> [loại] [Q1–Q20] [ghi chú] — ghi một bài đã đăng · 登记一次发布',
  '  Ví dụ · 例: /hanhdong https://vnexpress.net/... 2026-10-02 Q1 bài tiêu chuẩn đánh giá',
  `  ${NOT_PUBLISHING}`,
  '• /maau — phiếu yêu cầu MAAU (sắp mở · 即将开放)',
  '• Góp ý / câu hỏi cho MemeCMO: @bot kèm nội dung (có thể kèm ảnh) — bot xác nhận và chuyển ngay · 给 MemeCMO 的反馈或问题：@机器人 + 内容（可附截图），机器人确认并即时转交',
  'Bot chỉ đọc tin nhắn có @ bot · 机器人只读 @ 它的消息。',
].join('\n');

// ─── Suggested actions as an interactive card ────────────────────────────────
export interface SuggestionCardRow {
  id: string; seq: number; url: string; title: string | null; published_guess: string; guess_source: string;
  target_candidates: { n: number; prompt?: string; strong?: boolean }[]; evidence?: { cites?: number; engines?: unknown };
  status: 'pending' | 'confirmed' | 'dismissed';
  /** Who decided (email), and the target question picked — shown after a click. */
  decidedBy?: string | null; targetN?: number | null; publishedAt?: string | null;
}

export interface SuggestionCardOptions {
  brand?: string | null;
  /** Pending pages NOT on this card (they wait in the workspace). */
  moreCount?: number;
  workspaceUrl?: string | null;
  /** 14-day state: the header gets a ⏰, nothing else changes. */
  reminder?: boolean;
  /** 30-day state: the card is archived (short text, no buttons). */
  retired?: boolean;
  /** Pages shown with buttons; the rest of this card's pending rows queue behind them (default 5). */
  capacity?: number;
}

const mdLink = (title: string | null, url: string) => `[${(title ?? url).replace(/[\[\]]/g, ' ').slice(0, 90)}](${url})`;

/**
 * The ONE living card of a project. Compact by design: three buttons per page
 * (✓ with the most likely target question, ✓ without one, ✗ not an action),
 * processed pages folded into one line, the overflow pointed to the workspace.
 * update_multi so a decision shows for everyone; nothing is pre-selected.
 */
export function suggestionCard(rows: SuggestionCardRow[], opts: SuggestionCardOptions = {}): object {
  const pending = rows.filter((r) => r.status === 'pending');
  const done = rows.filter((r) => r.status !== 'pending');
  const confirmed = done.filter((r) => r.status === 'confirmed').length;
  const dismissed = done.length - confirmed;
  if (opts.retired) {
    return {
      config: { wide_screen_mode: true, update_multi: true },
      header: { template: 'grey', title: { tag: 'plain_text', content: 'Trang mới trên website · 官网新页面 — đã lưu trữ · 已归档' } },
      elements: [{ tag: 'div', text: { tag: 'lark_md', content: `Các trang chưa xác nhận vẫn nằm trong workspace · 未确认的页面仍在工作区${opts.workspaceUrl ? `: ${opts.workspaceUrl}` : ''}。${done.length ? ` ✅ ${confirmed} · ➖ ${dismissed}` : ''}` } }],
    };
  }
  const n = pending.length;
  const shown = pending.slice(0, opts.capacity ?? 5);
  const overflow = (n - shown.length) + Math.max(0, opts.moreCount ?? 0);
  const header = n
    ? `${opts.reminder ? '⏰ ' : ''}Trang mới trên website · 官网新页面 — còn ${n} chờ xác nhận · 待确认 ${n}`
    : 'Trang mới trên website · 官网新页面 — đã xử lý · 已处理';
  const elements: any[] = [];
  if (n) elements.push({ tag: 'div', text: { tag: 'lark_md', content: `Bấm để xác nhận, ghi dưới tên người bấm · 点按钮即确认，记在点击人名下${opts.brand ? ` · ${opts.brand}` : ''}` } });
  if (done.length) {
    const who = done.slice(0, 3).map((r) => `${r.status === 'confirmed' ? '✅' : '➖'} #${r.seq}${r.decidedBy ? ` ${r.decidedBy.split('@')[0]}` : ''}${r.targetN ? ` Q${r.targetN}` : ''}`).join(' · ');
    elements.push({ tag: 'note', elements: [{ tag: 'plain_text', content: `Đã xử lý · 已处理 ${done.length}: ✅ ${confirmed} · ➖ ${dismissed}${who ? `  (${who}${done.length > 3 ? ' …' : ''})` : ''}` }] });
  }
  shown.forEach((r, i) => {
    const cites = r.evidence?.cites ? ` · AI đã trích dẫn ${r.evidence.cites} lần · 已引用 ${r.evidence.cites} 次` : '';
    if (i > 0 || done.length) elements.push({ tag: 'hr' });
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `**#${r.seq} · ${mdLink(r.title, r.url)}**\n${r.published_guess} — ${GUESS_LABEL[r.guess_source] ?? r.guess_source}${cites}` } });
    const cands = r.target_candidates ?? [];
    const top = cands.find((c) => c.strong) ?? cands[0] ?? null;
    const actions: any[] = [];
    if (top) actions.push({ tag: 'button', type: 'primary', text: { tag: 'plain_text', content: `✓ Q${top.n}` }, value: { a: 'sugg_confirm', id: r.id, q: top.n } });
    actions.push({ tag: 'button', type: top ? 'default' : 'primary', text: { tag: 'plain_text', content: top ? '✓ Không gắn Q · 不指定' : '✓ Xác nhận · 确认' }, value: { a: 'sugg_confirm', id: r.id } });
    actions.push({ tag: 'button', type: 'danger', text: { tag: 'plain_text', content: '✗ Không phải · 不算' }, value: { a: 'sugg_dismiss', id: r.id } });
    elements.push({ tag: 'action', actions });
    if (top?.prompt) elements.push({ tag: 'note', elements: [{ tag: 'plain_text', content: `Q${top.n} = ${top.prompt.slice(0, 80)}` }] });
  });
  if (overflow > 0) {
    elements.push({ tag: 'hr' });
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `Còn ${overflow} trang khác · 还有 ${overflow} 页${opts.workspaceUrl ? ` — xem trong workspace · 在工作区查看: ${opts.workspaceUrl}` : ''}` } });
  }
  if (n) elements.push({ tag: 'note', elements: [{ tag: 'plain_text', content: 'Chỉ thành viên đội ngũ thương hiệu xác nhận được; ngày đăng là ước tính, sửa được trong workspace. MemeCMO không đăng nội dung lên AI nào. · 仅品牌团队成员可确认；日期为估计值，可在工作区修改。MemeCMO 不向任何 AI 发布内容。' }] });
  return { config: { wide_screen_mode: true, update_multi: true }, header: { template: n ? (opts.reminder ? 'orange' : 'blue') : 'green', title: { tag: 'plain_text', content: header } }, elements };
}
