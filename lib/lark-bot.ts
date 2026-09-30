// GEO Assistant (MemeCMO) — what the bot does with an @-message or a card click.
// Tech plan v1.0: every record is signed by the person who sent it; a message
// that maps to no platform account (or a read-only one) is never stored as
// theirs. Nothing the bot parses is written until the sender confirms.

import { canEditOrg } from '@/lib/org-auth';
import { notifyOperator } from '@/lib/alerts';
import { domainOf } from '@/lib/interventions';
import { unitHash } from '@/lib/edits';
import { inngest } from '@/lib/inngest/client';
import { HELP_TEXT, hanhdongCard, larkReply, larkText, larkUserEmail, parseHanhdong, type HanhdongDraft } from '@/lib/lark';

type Sb = any;

const vnToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

// Why an identity failed is kept in lark_messages.outcome (internal only — never
// posted to the group), so a mismatch can be fixed without guessing:
//   no-email      Lark returned no email (external member, or outside the app's contact scope)
//   no-account:X  Lark email X has no platform account
async function senderAccount(sb: Sb, openId: string): Promise<{ userId: string; email: string } | { why: string }> {
  let email: string | null = null;
  try { email = await larkUserEmail(openId); } catch (e) { return { why: `no-email(${e instanceof Error ? e.message.slice(0, 80) : 'error'})` }; }
  if (!email) return { why: 'no-email' };
  const { data, error } = await sb.rpc('user_id_by_email', { p_email: email });
  if (error) throw new Error(`user_id_by_email: ${error.message}`);
  return data ? { userId: String(data), email } : { why: `no-account:${email}` };
}
const isAccount = (w: any): w is { userId: string; email: string } => !!w && typeof w.userId === 'string';

async function boundProject(sb: Sb, chatId: string) {
  const { data: b } = await sb.from('lark_bindings').select('project_id').eq('chat_id', chatId).maybeSingle();
  if (!b) return null;
  const { data: p } = await sb
    .from('projects')
    .select('id, slug, brand_name, brand_url, metadata, organizations(id, parent_org_id)')
    .eq('id', b.project_id)
    .maybeSingle();
  return p ?? null;
}

async function isOperator(sb: Sb, userId: string): Promise<boolean> {
  const { data: root } = await sb.from('organizations').select('id').eq('type', 'root').maybeSingle();
  if (!root) return false;
  const { data } = await sb.from('organization_members').select('role').eq('organization_id', root.id).eq('user_id', userId).maybeSingle();
  return !!data;
}

const brandHosts = (p: any): string[] => {
  const hosts = new Set<string>();
  const add = (u: unknown) => { const d = domainOf(String(u ?? '')); if (d) hosts.add(d); };
  add(p?.brand_url);
  for (const d of (p?.metadata?.brandDomains ?? []) as unknown[]) {
    const s = String(d ?? '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (s) hosts.add(s);
  }
  return [...hosts];
};

const NO_ACCOUNT =
  'Chưa ghi được: email Lark của bạn chưa khớp với tài khoản có quyền chỉnh sửa trên nền tảng MemeCMO. Vui lòng dùng email đã đăng ký, hoặc báo MemeCMO mở quyền. · 未登记：您的 Lark 邮箱未对应到平台上有编辑权限的账号，请联系 MemeCMO 开通。';
const ASK_ACK =
  'Đã nhận. Bot chưa tự trả lời được câu hỏi dạng này; đã chuyển cho MemeCMO, sẽ có người trả lời trực tiếp trong nhóm. · 已收到。机器人还不能自己回答这类问题，已转给 MemeCMO，会有人在群里直接回复。';
const LINK_HINT =
  'Nếu link là bài / trang vừa đăng và cần ghi thành hành động: /hanhdong <link> <ngày đăng> · 如果是刚发布的稿件或页面、需要登记为行动：/hanhdong <链接> <发布日期>';
const UNBOUND ='Nhóm này chưa được gắn với dự án nào trên nền tảng. · 本群尚未绑定平台项目。(MemeCMO: @bot /bind <project-slug>)';

/** Handle one stored @-message (Inngest worker). Returns the outcome label. */
export async function handleLarkMessage(sb: Sb, rowId: string): Promise<string> {
  const { data: row } = await sb.from('lark_messages').select('*').eq('id', rowId).maybeSingle();
  if (!row) return 'missing';
  if (row.handled_at) return `already:${row.outcome ?? ''}`;
  const finish = async (outcome: string, replyId: string | null = null) => {
    await sb.from('lark_messages').update({ handled_at: new Date().toISOString(), outcome, reply_id: replyId }).eq('id', rowId);
    return outcome;
  };
  if (row.event_type !== 'im.message.receive_v1' || !row.message_id) return finish('ignored:not-a-message');
  // Text and rich text are read; a bare attachment (a screenshot sent to the bot
  // in a DM) is still a message for MemeCMO — it goes to the question path below.
  const attachment = ['image', 'file', 'media', 'audio'].includes(row.msg_type);
  if (row.msg_type !== 'text' && row.msg_type !== 'post' && !attachment) return finish(`ignored:${row.msg_type}`);

  const text = attachment ? `[${row.msg_type === 'image' ? 'ảnh' : row.msg_type}]` : larkText(row.content?.content, row.msg_type);
  // A known command may come after a pasted link ("<link> @bot /hanhdong …"), so it
  // is looked for anywhere after whitespace (the "/faq" inside a URL never matches);
  // an unknown one only counts at the start, so "50 /tháng" is not a command.
  const cmd = (text.match(/(?:^|\s)\/(bind|hanhdong|maau|help)\b/i)?.[1] ?? text.match(/^\/([a-z]+)\b/i)?.[1] ?? '').toLowerCase();

  if (cmd === 'bind') {
    const who = await senderAccount(sb, row.sender_open_id);
    if (!isAccount(who) || !(await isOperator(sb, who.userId))) {
      return finish(`bind:denied:${isAccount(who) ? `not-operator:${who.email}` : who.why}`, await larkReply(row.message_id, { text: 'Chỉ MemeCMO mới gắn được nhóm · 仅 MemeCMO 可绑定。' }));
    }
    const slug = text.match(/\/bind\s+(\S+)/i)?.[1] ?? '';
    const { data: p } = await sb.from('projects').select('id, brand_name, slug').eq('slug', slug).maybeSingle();
    if (!p) return finish('bind:no-project', await larkReply(row.message_id, { text: `Không tìm thấy dự án "${slug}" · 找不到项目。` }));
    await sb.from('lark_bindings').upsert({ chat_id: row.chat_id, project_id: p.id, created_by: who.email }, { onConflict: 'chat_id' });
    return finish('bind:ok', await larkReply(row.message_id, { text: `Đã gắn nhóm với dự án ${p.brand_name} (${p.slug}) · 已绑定项目。\n\n${HELP_TEXT}` }));
  }

  if (cmd === 'hanhdong') {
    const project = await boundProject(sb, row.chat_id);
    if (!project) return finish('ignored:unbound', await larkReply(row.message_id, { text: UNBOUND }));
    const who = await senderAccount(sb, row.sender_open_id);
    const org: any = project.organizations;
    if (!isAccount(who) || !(await canEditOrg(sb, who.userId, { id: org.id, parent_org_id: org.parent_org_id }))) {
      return finish(`hanhdong:denied:${isAccount(who) ? `read-only:${who.email}` : who.why}`, await larkReply(row.message_id, { text: NO_ACCOUNT }));
    }
    const draft = parseHanhdong(text, vnToday(), brandHosts(project));
    if (!draft.url) return finish('hanhdong:no-url', await larkReply(row.message_id, { text: `Thiếu link bài đã đăng · 缺少发布链接。\n\n${HELP_TEXT}` }));
    const core: string[] = Array.isArray(project.metadata?.coreKeyPrompts) ? project.metadata.coreKeyPrompts : [];
    const card = hanhdongCard(draft, core, { senderOpenId: row.sender_open_id, chatId: row.chat_id, messageId: row.message_id });
    return finish('hanhdong:card', await larkReply(row.message_id, { card }));
  }

  if (cmd === 'maau') {
    return finish('maau:not-yet', await larkReply(row.message_id, { text: 'Phiếu yêu cầu MAAU sẽ mở trong đợt tiếp theo · MAAU 需求单将在下一阶段开放。' }));
  }

  if (!text || cmd === 'help') return finish('help', await larkReply(row.message_id, { text: HELP_TEXT }));
  if (cmd) {
    return finish(`unknown:${cmd}`, await larkReply(row.message_id, { text: `Không có lệnh /${cmd} · 没有 /${cmd} 这个指令。\n\n${HELP_TEXT}` }));
  }

  // A question or request in plain words (9-30: "<link> kiểm tra khả năng AI index").
  // No model reads the group, so the bot cannot answer it; answering with the
  // command list read as a non-answer. It says a person will reply, and makes
  // that true by alerting MemeCMO.
  const project = await boundProject(sb, row.chat_id);
  const asker = await larkUserEmail(row.sender_open_id).catch(() => null);
  let alerted = false;
  try {
    const r = await notifyOperator({
      kind: 'lark_request',
      title: `Lark 群提问${project ? ` · ${project.brand_name}` : ''}`,
      detail: `${asker ?? row.sender_open_id}: "${text.slice(0, 600)}" — 请在群里直接回复。`,
      projectId: project?.id, projectSlug: project?.slug, brand: project?.brand_name,
    });
    alerted = r.sent;
  } catch { /* the acknowledgement still goes out; the outcome records the miss */ }
  const reply = /https?:\/\//i.test(text) ? `${ASK_ACK}\n\n${LINK_HINT}` : ASK_ACK;
  return finish(`request:${alerted ? 'alerted' : 'alert-failed'}`, await larkReply(row.message_id, { text: reply }));
}

/** Handle a card button click (synchronous: Lark expects the reply within 3 s). */
export async function handleLarkCardAction(sb: Sb, event: any): Promise<object> {
  const v = event?.action?.value ?? {};
  const operator = String(event?.operator?.open_id ?? '');
  const draft: HanhdongDraft = {
    url: v.u || null,
    date: String(v.d || vnToday()),
    kind: v.k || 'other',
    targets: String(v.t || '').split(',').map(Number).filter((n) => n >= 1 && n <= 20),
    note: String(v.n || ''),
    dateGuessed: false,
  };
  const ctx = { senderOpenId: String(v.s || ''), chatId: String(v.c || event?.context?.open_chat_id || ''), messageId: String(v.m || '') };
  const toast = (type: 'success' | 'error' | 'info', content: string) => ({ type, content });

  if (!operator || operator !== ctx.senderOpenId) return { toast: toast('error', 'Chỉ người gửi mới xác nhận được · 仅发送人可确认') };
  const project = await boundProject(sb, ctx.chatId);
  if (!project) return { toast: toast('error', 'Nhóm chưa được gắn dự án · 本群未绑定项目') };
  const core: string[] = Array.isArray(project.metadata?.coreKeyPrompts) ? project.metadata.coreKeyPrompts : [];

  if (v.a === 'hanhdong_cancel') {
    return { toast: toast('info', 'Đã hủy · 已取消'), card: { type: 'raw', data: hanhdongCard(draft, core, ctx, 'cancelled') } };
  }
  if (v.a !== 'hanhdong_confirm') return { toast: toast('error', 'Unknown action') };

  const who = await senderAccount(sb, operator);
  const org: any = project.organizations;
  if (!isAccount(who) || !(await canEditOrg(sb, who.userId, { id: org.id, parent_org_id: org.parent_org_id }))) {
    return { toast: toast('error', 'Tài khoản chưa có quyền chỉnh sửa · 账号无编辑权限') };
  }
  // A double click must not log the action twice.
  const { data: existing } = await sb.from('interventions').select('id').eq('project_id', project.id).eq('lark_message_id', ctx.messageId).maybeSingle();
  if (!existing) {
    const targets = draft.targets.map((n) => core[n - 1]).filter(Boolean).map((p) => ({ hash: unitHash(p), prompt: p }));
    const { data: iv, error } = await sb
      .from('interventions')
      .insert({
        project_id: project.id, kind: draft.kind, url: draft.url, domain: domainOf(draft.url), note: draft.note || null,
        target_prompts: targets, published_at: draft.date, logged_by: who.userId, channel: 'lark', lark_message_id: ctx.messageId,
      })
      .select('id, url')
      .single();
    if (error) return { toast: toast('error', `Lỗi · 出错: ${error.message}`) };
    if (iv?.url) {
      try { await inngest.send({ name: 'geo/intervention.verify', data: { interventionId: iv.id } }); } catch { /* verification is best effort */ }
    }
  }
  return { toast: toast('success', 'Đã ghi · 已登记'), card: { type: 'raw', data: hanhdongCard(draft, core, ctx, 'saved') } };
}
