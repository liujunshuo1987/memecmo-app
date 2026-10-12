// GEO Assistant (MemeCMO) — what the bot does with an @-message or a card click.
// Tech plan v1.0: every record is signed by the person who sent it; a message
// that maps to no platform account (or a read-only one) is never stored as
// theirs. Nothing the bot parses is written until the sender confirms.

import { canEditOrg, canSignForOrg } from '@/lib/org-auth';
import { notifyOperator } from '@/lib/alerts';
import { domainOf } from '@/lib/interventions';
import { unitHash } from '@/lib/edits';
import { inngest } from '@/lib/inngest/client';
import { confirmSuggestion, dismissSuggestion, loadPendingSuggestions } from '@/lib/suggestions';
import { HELP_TEXT, XACNHAN_HELP, hanhdongCard, larkDeleteMessage, larkReply, larkSend, larkText, larkUpdateCard, larkUserEmail, parseHanhdong, parseXacnhan, suggestionCard, suggestionListText, type HanhdongDraft } from '@/lib/lark';

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
    .select('id, slug, brand_name, brand_url, metadata, organizations(id, parent_org_id, slug)')
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

  const project = await boundProject(sb, ctx.chatId);
  if (!project) return { toast: toast('error', 'Nhóm chưa được gắn dự án · 本群未绑定项目') };
  if (v.a === 'sugg_confirm' || v.a === 'sugg_dismiss') return handleSuggestionClick(sb, event, project, operator, toast);
  if (!operator || operator !== ctx.senderOpenId) return { toast: toast('error', 'Chỉ người gửi mới xác nhận được · 仅发送人可确认') };
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

// ─── Suggested actions: the card and its buttons ─────────────────────────────

/** The rows posted on one card, newest decision first, with the deciders' emails for display. */
async function cardRows(sb: Sb, projectId: string, messageId: string, fallbackIds: string[]): Promise<Parameters<typeof suggestionCard>[0]> {
  let q = sb.from('intervention_suggestions').select('*').eq('project_id', projectId);
  q = messageId ? q.eq('lark_message_id', messageId) : q.in('id', fallbackIds);
  const { data } = await q.order('seq', { ascending: true }).limit(12);
  const rows = (data ?? []) as any[];
  const ids = Array.from(new Set(rows.flatMap((r) => [r.confirmed_by, r.dismissed_by]).filter(Boolean))) as string[];
  const email = new Map<string, string>();
  await Promise.all(ids.map(async (id) => { try { const { data: u } = await sb.auth.admin.getUserById(id); if (u?.user?.email) email.set(id, u.user.email); } catch { /* display only */ } }));
  const ivIds = rows.map((r) => r.intervention_id).filter(Boolean);
  const targetN = new Map<string, number | null>(); const pub = new Map<string, string>();
  if (ivIds.length) {
    const { data: project } = await sb.from('projects').select('metadata').eq('id', projectId).maybeSingle();
    const core: string[] = Array.isArray(project?.metadata?.coreKeyPrompts) ? project.metadata.coreKeyPrompts : [];
    const { data: ivs } = await sb.from('interventions').select('id, target_prompts, published_at').in('id', ivIds);
    for (const iv of (ivs ?? []) as any[]) {
      const first = (iv.target_prompts ?? [])[0]?.prompt; const n = first ? core.indexOf(first) + 1 : 0;
      targetN.set(iv.id, n > 0 ? n : null); pub.set(iv.id, iv.published_at);
    }
  }
  return rows.map((r) => ({
    id: r.id, seq: r.seq, url: r.url, title: r.title, published_guess: r.published_guess, guess_source: r.guess_source,
    target_candidates: r.target_candidates ?? [], evidence: r.evidence ?? {}, status: r.status,
    decidedBy: email.get(r.confirmed_by ?? r.dismissed_by ?? '') ?? null,
    targetN: r.intervention_id ? targetN.get(r.intervention_id) ?? null : null,
    publishedAt: r.intervention_id ? pub.get(r.intervention_id) ?? null : null,
  }));
}

/** A click on a suggestion card: confirm (optionally with a target question) or dismiss, under the clicker's account. */
async function handleSuggestionClick(sb: Sb, event: any, project: any, operator: string, toast: (t: 'success' | 'error' | 'info', c: string) => object): Promise<object> {
  const v = event?.action?.value ?? {};
  const messageId = String(event?.context?.open_message_id ?? '');
  if (!larkSuggestionsOn(project)) return { toast: toast('error', 'Tính năng chưa bật cho dự án này · 本项目未开启') };
  const who = await senderAccount(sb, operator);
  const org: any = project.organizations;
  if (!isAccount(who)) return { toast: toast('error', 'Email Lark chưa khớp tài khoản MemeCMO · Lark 邮箱未匹配平台账号') };
  if (!(await canSignForOrg(sb, who.userId, { id: org.id, parent_org_id: org.parent_org_id }))) {
    return { toast: toast('error', 'Việc xác nhận phải do thành viên đội ngũ thương hiệu thực hiện · 须由品牌团队成员确认') };
  }
  const core: string[] = Array.isArray(project.metadata?.coreKeyPrompts) ? project.metadata.coreKeyPrompts : [];
  let msg = '';
  if (v.a === 'sugg_dismiss') {
    const r = await dismissSuggestion(sb, { projectId: project.id, id: String(v.id), userId: who.userId });
    msg = r.ok ? 'Đã đánh dấu: không phải hành động · 已标为不算行动' : (r.error === 'not-pending' ? 'Trang này đã được xử lý · 此页已处理过' : `Lỗi · 出错: ${r.error}`);
  } else {
    const qn = Number(v.q || 0);
    const r = await confirmSuggestion(sb, {
      projectId: project.id, id: String(v.id), userId: who.userId, channel: 'lark', larkMessageId: messageId || null, today: vnToday(),
      targetPrompts: qn >= 1 && core[qn - 1] ? [core[qn - 1]] : undefined,
    });
    if (!('error' in r)) {
      msg = `Đã ghi · 已登记${qn ? ` · Q${qn}` : ''}`;
      try { await inngest.send({ name: 'geo/intervention.verify', data: { interventionId: r.intervention.id } }); } catch { /* best effort */ }
    } else {
      const why: Record<string, string> = { 'not-found': 'Không tìm thấy trang · 未找到此页', 'already-confirmed': 'Đã được xác nhận trước đó · 此前已确认', 'already-dismissed': 'Đã bị đánh dấu "không phải hành động" · 已标为不算行动', 'future-date': 'Ngày đăng ở tương lai · 发布日期在未来' };
      msg = why[r.error] ?? `Lỗi · 出错: ${r.error}`;
    }
  }
  const rows = await cardRows(sb, project.id, messageId, [String(v.id)]);
  const opts = await cardOptions(sb, project, messageId);
  return { toast: toast(msg.startsWith('Lỗi') ? 'error' : 'success', msg), card: { type: 'raw', data: suggestionCard(rows, opts) } };
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.memecmo.ai';
const workspaceLink = (project: any) => `${APP_URL}/workspace/${project?.organizations?.slug ?? ''}/${project?.slug ?? ''}`;

/** Rendering context of a project's living card: overflow count, workspace link, 14-day state. */
async function cardOptions(sb: Sb, project: any, messageId: string) {
  const pending = await loadPendingSuggestions(sb, project.id);
  const moreCount = pending.filter((s) => s.lark_message_id !== messageId).length;
  const { data: card } = messageId ? await sb.from('lark_suggestion_cards').select('reminded_at, retired_at').eq('message_id', messageId).maybeSingle() : { data: null };
  return { brand: project.brand_name, moreCount, workspaceUrl: workspaceLink(project), reminder: !!card?.reminded_at, retired: !!card?.retired_at };
}

const DAY = 86400e3;
const CARD_CAPACITY = 5;        // pages shown with buttons; the rest wait in the workspace
const REUSE_DAYS = 7;           // a finished card older than this is not reused
const NOTICE_GAP_DAYS = 6;      // at most one "N new pages ↑" line a week
const REMIND_DAYS = 14;         // ⏰ in the header, once
const RETIRE_DAYS = 30;         // delete / archive

/** Vietnam working hours, Monday–Friday 08:30–17:30 (UTC+7). The notice line goes out only then. */
export function vnWorkingHours(now = new Date()): boolean {
  const vn = new Date(now.getTime() + 7 * 3600e3);
  const dow = vn.getUTCDay(); const mins = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  return dow >= 1 && dow <= 5 && mins >= 8 * 60 + 30 && mins < 17 * 60 + 30;
}

/**
 * Keep the project's ONE living suggestion card in its Lark group (daily cron +
 * the operator route). New pending pages merge into the current card (updated in
 * place, silent) up to CARD_CAPACITY; a new card starts only when there is no
 * usable card. One text notice at most every NOTICE_GAP_DAYS, inside Vietnam
 * working hours (force skips the hours gate, never the gap). ⏰ once at 14 days,
 * retired at 30. Refuses unless the project has suggested actions on for Lark.
 */
export async function keepSuggestionCard(sb: Sb, d: { projectId: string; approvedBy: string; force?: boolean; now?: Date }): Promise<string> {
  if (!d.approvedBy.trim()) return 'refused:no-approver';
  const now = d.now ?? new Date();
  const { data: project } = await sb.from('projects').select('id, slug, brand_name, metadata, organizations(id, parent_org_id, slug)').eq('id', d.projectId).maybeSingle();
  if (!project) return 'refused:no-project';
  if (!larkSuggestionsOn(project)) return 'refused:flag-off';
  const { data: binding } = await sb.from('lark_bindings').select('chat_id').eq('project_id', d.projectId).limit(1).maybeSingle();
  if (!binding?.chat_id) return 'refused:unbound';
  const stamp = now.toISOString();
  const out: string[] = [];

  // The current card, if any.
  const { data: card } = await sb.from('lark_suggestion_cards').select('*').eq('project_id', d.projectId).is('retired_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const pendingAll = await loadPendingSuggestions(sb, d.projectId);
  const onCard = card ? pendingAll.filter((s) => s.lark_message_id === card.message_id) : [];
  const unposted = pendingAll.filter((s) => !s.lark_posted_at);
  const ageDays = card ? (now.getTime() - Date.parse(card.created_at)) / DAY : 0;

  // 30 days: retire (delete; if Lark refuses, archive the card text).
  if (card && ageDays >= RETIRE_DAYS) {
    const deleted = await larkDeleteMessage(card.message_id);
    if (!deleted) { try { await larkUpdateCard(card.message_id, suggestionCard(await cardRows(sb, d.projectId, card.message_id, []), { retired: true, workspaceUrl: workspaceLink(project) })); } catch { /* best effort */ } }
    await sb.from('lark_suggestion_cards').update({ retired_at: stamp, updated_at: stamp }).eq('id', card.id);
    out.push(`retired:${card.message_id}:${deleted ? 'deleted' : 'archived'}`);
  }
  const reusable = card && ageDays < RETIRE_DAYS && (onCard.length > 0 || ageDays < REUSE_DAYS);
  const live = reusable ? card : null;
  if (card && !live && ageDays < RETIRE_DAYS) {
    // Finished and older than a week: close it so new pages start a fresh card.
    await sb.from('lark_suggestion_cards').update({ retired_at: stamp, updated_at: stamp }).eq('id', card.id);
    out.push(`closed:${card.message_id}`);
  }

  const capacity = Math.max(0, CARD_CAPACITY - (live ? onCard.length : 0));
  const toAdd = unposted.slice(0, capacity);
  let messageId = live?.message_id ?? null;
  let created = false;

  if (live) {
    if (toAdd.length) {
      await sb.from('intervention_suggestions').update({ lark_posted_at: stamp, lark_posted_by: d.approvedBy.trim(), lark_message_id: live.message_id }).in('id', toAdd.map((s) => s.id));
    }
    // 14 days with pending pages: the one ⏰, silent.
    const remind = !live.reminded_at && ageDays >= REMIND_DAYS && onCard.length > 0;
    if (remind) await sb.from('lark_suggestion_cards').update({ reminded_at: stamp }).eq('id', live.id);
    // Always re-render the living card: compact format, processed summary, overflow count.
    const rows = await cardRows(sb, d.projectId, live.message_id, []);
    const more = pendingAll.filter((s) => s.lark_message_id !== live.message_id).length;
    try { await larkUpdateCard(live.message_id, suggestionCard(rows, { brand: project.brand_name, moreCount: more, workspaceUrl: workspaceLink(project), reminder: remind || !!live.reminded_at })); }
    catch (e) { out.push(`update-failed:${e instanceof Error ? e.message.slice(0, 80) : 'error'}`); }
    await sb.from('lark_suggestion_cards').update({ updated_at: stamp }).eq('id', live.id);
    out.push(`updated:${live.message_id}:+${toAdd.length}${remind ? ':reminded' : ''}`);
  } else if (toAdd.length) {
    const rows = toAdd.map((s) => ({ id: s.id, seq: s.seq, url: s.url, title: s.title, published_guess: s.published_guess, guess_source: s.guess_source, target_candidates: s.target_candidates ?? [], evidence: s.evidence ?? {}, status: 'pending' as const }));
    const more = unposted.length - toAdd.length;
    messageId = await larkSend(binding.chat_id, { card: suggestionCard(rows, { brand: project.brand_name, moreCount: more, workspaceUrl: workspaceLink(project) }) });
    if (!messageId) return [...out, 'send-failed'].join(' ');
    await sb.from('lark_suggestion_cards').insert({ project_id: d.projectId, chat_id: binding.chat_id, message_id: messageId, created_by: d.approvedBy.trim(), notice_sent_at: stamp });
    await sb.from('intervention_suggestions').update({ lark_posted_at: stamp, lark_posted_by: d.approvedBy.trim(), lark_message_id: messageId }).in('id', toAdd.map((s) => s.id));
    created = true;
    out.push(`created:${messageId}:${toAdd.length}`);
  } else {
    out.push('nothing-new');
  }

  // The weekly one-liner — only when pages were added to an EXISTING card, at most
  // every NOTICE_GAP_DAYS, in Vietnam working hours (a new card is its own notice).
  if (live && toAdd.length && messageId) {
    const last = live.notice_sent_at ? Date.parse(live.notice_sent_at) : 0;
    const gapOk = now.getTime() - last >= NOTICE_GAP_DAYS * DAY;
    const hoursOk = d.force || vnWorkingHours(now);
    if (gapOk && hoursOk) {
      const n = toAdd.length;
      const replyId = await larkReply(messageId, { text: `Tuần này có ${n} trang mới chờ xác nhận — xem thẻ phía trên ↑ · 本周新增 ${n} 页待确认，请在上方卡片确认。` }).catch(() => null);
      if (replyId) { await sb.from('lark_suggestion_cards').update({ notice_sent_at: stamp }).eq('id', live.id); out.push(`notice:${replyId}`); }
    } else out.push(`notice-held:${gapOk ? 'hours' : 'gap'}`);
  }
  if (created) out.push('notice:new-card');
  return out.join(' ');
}

/** Automatic post after a scan's page fetch — only when the project opted in to it explicitly. */
export const larkAutoPostOn = (p: any): boolean => p?.metadata?.larkSuggestionsAutoPost === true;
