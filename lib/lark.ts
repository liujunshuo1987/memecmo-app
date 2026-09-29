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

/** Sender's email (needs contact:user.email:readonly and the sender inside the app's contact scope). */
export async function larkUserEmail(openId: string): Promise<string | null> {
  const d = await larkApi(`/contact/v3/users/${encodeURIComponent(openId)}?user_id_type=open_id`);
  const u = d?.user ?? {};
  return (u.email || u.enterprise_email || null) as string | null;
}

// ─── Commands ────────────────────────────────────────────────────────────────
/** Message text without the @mention placeholders ("@_user_1"). */
export function larkText(content: unknown): string {
  let text = '';
  try { text = String(JSON.parse(String(content ?? '{}')).text ?? ''); } catch { text = ''; }
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

/** Parse "/hanhdong <url> <date> [kind] [Q3,Q5] [note]" (order-free after the command). */
export function parseHanhdong(text: string, today: string, brandHosts: string[] = []): HanhdongDraft {
  let rest = text.replace(/^\/hanhdong\b/i, ' ');
  const urlM = rest.match(/https?:\/\/[^\s<>"]+/i);
  const url = urlM ? urlM[0].replace(/[),.;]+$/, '') : null;
  if (urlM) rest = rest.replace(urlM[0], ' ');

  let date = today;
  let dateGuessed = true;
  const iso = rest.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  const dmy = rest.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  if (iso) {
    date = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    rest = rest.replace(iso[0], ' ');
    dateGuessed = false;
  } else if (dmy) {
    date = `${dmy[3] || today.slice(0, 4)}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    rest = rest.replace(dmy[0], ' ');
    dateGuessed = false;
  }

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
  return { config: { wide_screen_mode: true, update_multi: true }, header: { template, title: { tag: 'plain_text', content: header } }, elements };
}

export const HELP_TEXT = [
  'GEO Assistant (MemeCMO) — lệnh · 指令:',
  '• /hanhdong <link> <YYYY-MM-DD> [loại] [Q1–Q20] [ghi chú] — ghi một bài đã đăng · 登记一次发布',
  '  Ví dụ · 例: /hanhdong https://vnexpress.net/... 2026-10-02 Q1 bài tiêu chuẩn đánh giá',
  '• /maau — phiếu yêu cầu MAAU (sắp mở · 即将开放)',
  'Bot chỉ đọc tin nhắn có @ bot · 机器人只读 @ 它的消息。',
].join('\n');
