// GEO Assistant (MemeCMO) — what the bot does with an @-message or a card click.
// Tech plan v1.0: every record is signed by the person who sent it; a message
// that maps to no platform account (or a read-only one) is never stored as
// theirs. Nothing the bot parses is written until the sender confirms.

import { canEditOrg, canSignForOrg } from '@/lib/org-auth';
import { notifyOperator } from '@/lib/alerts';
import { domainOf } from '@/lib/interventions';
import { unitHash } from '@/lib/edits';
import { inngest } from '@/lib/inngest/client';
import { confirmSuggestion, loadPendingSuggestions } from '@/lib/suggestions';
import { HELP_TEXT, XACNHAN_HELP, hanhdongCard, larkReply, larkSend, larkText, larkUserEmail, parseHanhdong, parseXacnhan, suggestionListText, type HanhdongDraft } from '@/lib/lark';

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

// Suggested actions in the group are off unless the project turns them on
// (projects.metadata.larkSuggestedActions = true). Off, /xacnhan is an unknown command.
export const larkSuggestionsOn = (p: any): boolean => p?.metadata?.larkSuggestedActions === true;

const NO_ACCOUNT =
  'Chưa ghi được: email Lark của bạn chưa khớp với tài khoản có quyền chỉnh sửa trên nền tảng MemeCMO. Vui lòng dùng email đã đăng ký, hoặc báo MemeCMO mở quyền. · 未登记：您的 Lark 邮箱未对应到平台上有编辑权限的账号，请联系 MemeCMO 开通。';
const ASK_ACK =
  'Đã nhận và chuyển cho MemeCMO. Câu trả lời sẽ được gửi ngay dưới tin nhắn này sau khi MemeCMO duyệt. · 已收到并转给 MemeCMO。答复经 MemeCMO 审核后，会直接发在这条消息下面。';
const LINK_HINT =
  'Nếu link là bài / trang vừa đăng và cần ghi thành hành động: /hanhdong <link> <ngày đăng> · 如果是刚发布的稿件或页面、需要登记为行动：/hanhdong <链接> <发布日期>';
const UNBOUND ='Nhóm này chưa được gắn với dự án nào trên nền tảng. · 本群尚未绑定平台项目。(MemeCMO: @bot /bind <project-slug>)';
const NOT_CLIENT =
  'Chưa ghi được: việc xác nhận phải do thành viên đội ngũ thương hiệu (tài khoản có quyền chỉnh sửa) thực hiện — MemeCMO không xác nhận thay. · 未登记：需由品牌方团队成员（有编辑权限的账号）确认，MemeCMO 不代为确认。';

/**
 * "/xacnhan <n> [date] [Q..]" from an account that may sign for the project:
 * confirm suggestion n as that person's action. Database only — the caller has
 * resolved the sender and sends the reply. Returns the outcome label, the reply
 * text, and the new intervention's id when one was created.
 */
export async function confirmFromLark(sb: Sb, d: { project: any; userId: string; text: string; messageId: string | null; today: string }): Promise<{ outcome: string; reply: string; interventionId?: string }> {
  const draft = parseXacnhan(d.text, d.today);
  if (!draft.n) return { outcome: 'xacnhan:no-number', reply: `Thiếu số của trang cần xác nhận · 缺少要确认的页面编号。\n${XACNHAN_HELP}` };
  const core: string[] = Array.isArray(d.project.metadata?.coreKeyPrompts) ? d.project.metadata.coreKeyPrompts : [];
  const r = await confirmSuggestion(sb, {
    projectId: d.project.id, seq: draft.n, userId: d.userId, channel: 'lark', larkMessageId: d.messageId, today: d.today,
    publishedAt: draft.date ?? undefined,
    targetPrompts: draft.targets ? draft.targets.map((n) => core[n - 1]).filter(Boolean) : undefined,
  });
  if ('error' in r) {
    const why: Record<string, string> = {
      'not-found': `Không có trang số #${draft.n} · 没有编号 #${draft.n} 的页面。`,
      'already-confirmed': `Trang #${draft.n} đã được xác nhận trước đó · #${draft.n} 此前已确认。`,
      'already-dismissed': `Trang #${draft.n} đã được đánh dấu "không phải hành động" · #${draft.n} 已被标记为"不算行动"。`,
      'bad-date': 'Ngày đăng không hợp lệ · 发布日期无效。',
      'future-date': 'Ngày đăng không thể ở tương lai · 发布日期不能晚于今天。',
    };
    return { outcome: `xacnhan:${r.error.slice(0, 60)}`, reply: why[r.error] ?? `Lỗi · 出错: ${r.error}` };
  }
  const qs = r.intervention.target_prompts.map((t) => { const i = core.indexOf(t.prompt); return i >= 0 ? `Q${i + 1}` : t.prompt.slice(0, 40); });
  return {
    outcome: `xacnhan:saved:${draft.n}`,
    interventionId: r.intervention.id,
    reply: [
      `Đã ghi · 已登记 #${draft.n}: ${r.intervention.url}`,
      `Ngày đăng · 发布日期: ${r.intervention.published_at}${draft.date ? '' : ' (ước tính · 估计)'}`,
      `Câu hỏi mục tiêu · 目标问题: ${qs.length ? qs.join(', ') : '(chưa chọn · 未指定)'}`,
      'Lần quét tiếp theo sẽ tự tính thay đổi trước/sau ngày đăng · 下次扫描起自动计算发布前后的变化。',
    ].join('\n'),
  };
}

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
  const cmd = (text.match(/(?:^|\s)\/(bind|hanhdong|xacnhan|maau|help)\b/i)?.[1] ?? text.match(/^\/([a-z]+)\b/i)?.[1] ?? '').toLowerCase();

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

  if (cmd === 'xacnhan') {
    const project = await boundProject(sb, row.chat_id);
    // Flag off (the default): falls through to the unknown-command reply below.
    if (project && larkSuggestionsOn(project)) {
      const who = await senderAccount(sb, row.sender_open_id);
      const org: any = project.organizations;
      if (!isAccount(who)) return finish(`xacnhan:denied:${who.why}`, await larkReply(row.message_id, { text: NO_ACCOUNT }));
      if (!(await canSignForOrg(sb, who.userId, { id: org.id, parent_org_id: org.parent_org_id }))) {
        return finish(`xacnhan:denied:not-client:${who.email}`, await larkReply(row.message_id, { text: NOT_CLIENT }));
      }
      const r = await confirmFromLark(sb, { project, userId: who.userId, text, messageId: row.message_id, today: vnToday() });
      if (r.interventionId) {
        try { await inngest.send({ name: 'geo/intervention.verify', data: { interventionId: r.interventionId } }); } catch { /* verification is best effort */ }
      }
      return finish(r.outcome, await larkReply(row.message_id, { text: r.reply }));
    }
  }

  if (cmd === 'maau') {
    return finish('maau:not-yet', await larkReply(row.message_id, { text: 'Phiếu yêu cầu MAAU sẽ mở trong đợt tiếp theo · MAAU 需求单将在下一阶段开放。' }));
  }

  if (!text || cmd === 'help') {
    const withConfirm = larkSuggestionsOn(await boundProject(sb, row.chat_id));
    return finish('help', await larkReply(row.message_id, { text: withConfirm ? `${HELP_TEXT}\n${XACNHAN_HELP}` : HELP_TEXT }));
  }
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

/**
 * Post MemeCMO's answer under a stored question, through the bot. Only for a
 * question the bot itself received in a bound group, only once, and only with
 * the name of the person who approved the text — the bot never composes it.
 */
export async function postOperatorAnswer(sb: Sb, d: { rowId: string; text: string; approvedBy: string }): Promise<string> {
  const text = d.text.trim();
  if (!d.rowId || !text) return 'refused:empty';
  if (!d.approvedBy.trim()) return 'refused:no-approver';
  if (text.length > 20000) return 'refused:too-long';
  const { data: row } = await sb.from('lark_messages').select('id, message_id, chat_id, event_type, answered_at').eq('id', d.rowId).maybeSingle();
  if (!row || row.event_type !== 'im.message.receive_v1' || !row.message_id) return 'refused:not-a-question';
  if (row.answered_at) return 'already-answered';
  if (!(await boundProject(sb, row.chat_id))) return 'refused:unbound';
  const replyId = await larkReply(row.message_id, { text });
  const now = new Date().toISOString();
  const { error } = await sb.from('lark_messages').update({ answered_at: now, answer: { reply_id: replyId, text, approved_by: d.approvedBy.trim(), sent_at: now } }).eq('id', row.id);
  if (error) throw new Error(`answer posted (${replyId}) but not recorded: ${error.message}`);
  return `answered:${replyId}`;
}

/**
 * Post the project's pending suggestions to its bound group, numbered for
 * "/xacnhan <n>". NOT wired to any schedule, route or event: each post is a
 * message to the client's group and is sent only when a named person approves
 * that send (same rule as postOperatorAnswer). Refuses unless the project has
 * turned suggested actions on for Lark.
 */
export async function postSuggestionList(sb: Sb, d: { projectId: string; approvedBy: string }): Promise<string> {
  if (!d.approvedBy.trim()) return 'refused:no-approver';
  const { data: project } = await sb.from('projects').select('id, metadata').eq('id', d.projectId).maybeSingle();
  if (!project) return 'refused:no-project';
  if (!larkSuggestionsOn(project)) return 'refused:flag-off';
  const { data: binding } = await sb.from('lark_bindings').select('chat_id').eq('project_id', d.projectId).limit(1).maybeSingle();
  if (!binding?.chat_id) return 'refused:unbound';
  const list = (await loadPendingSuggestions(sb, d.projectId)).slice(0, 10);
  if (!list.length) return 'nothing-pending';
  const messageId = await larkSend(binding.chat_id, { text: suggestionListText(list) });
  const { error } = await sb.from('intervention_suggestions').update({ lark_posted_at: new Date().toISOString(), lark_posted_by: d.approvedBy.trim() }).in('id', list.map((s) => s.id));
  if (error) throw new Error(`list posted (${messageId}) but not recorded: ${error.message}`);
  return `posted:${messageId}:${list.length}`;
}
