// Client-facing GEO digest emails — the "解读" layer on top of scan data.
//
// Design (confirmed 2026-07-26): the FULL scan report stays in the product
// (workspace → PDF export). The email is a CONCISE summary — headline score,
// per-engine one-liners, actions shipped — except for two sections that are
// deliberately DETAILED: effect attribution (证明效果) and strategy guidance
// (指导策略). Interpretation tone switches by lifecycle stage:
//
//   build    (< 28 days or < 2 scans)  actions + cooperation list; score shown
//                                      as baseline only, movement not read.
//   optimize (< 90 days)               deltas become meaningful; attribution
//                                      links shipped actions to metric moves.
//   steady   (90 days +)               same weekly pulse; folds in the latest
//                                      Report agent recommendations when fresh.
//
// Config lives on projects.metadata.reportSchedule:
//   { recipients: string[], language?: 'zh'|'en'|'vi', kickoffAt?: ISO,
//     stageOverride?: 'build'|'optimize'|'steady',
//     lastDigestAt?: ISO, lastAlertRunId?: string }
// No recipients → module is inert. The Inngest cron is additionally gated by
// SCHEDULED_SCANS_ENABLED, so nothing sends until activation.

import type { SupabaseClient } from '@supabase/supabase-js';
import { poeChat, parseJsonFromLLM, DEFAULT_MODEL } from '@/lib/llm/poe';
import { sendEmail } from '@/lib/email';

export type DigestStage = 'build' | 'optimize' | 'steady';
export type DigestLang = 'zh' | 'en' | 'vi';

export interface ReportSchedule {
  recipients?: string[];
  language?: DigestLang;
  kickoffAt?: string;
  stageOverride?: DigestStage;
  lastDigestAt?: string;
  lastAlertRunId?: string;
}

const APP_URL = 'https://app.memecmo.ai';

// Agent → client-facing deliverable label (never internal codenames).
const ACTION_LABELS: Record<string, { zh: string; en: string; vi: string }> = {
  discovery: { zh: '提示词库更新', en: 'Prompt library refresh', vi: 'Cập nhật thư viện câu hỏi' },
  answers: { zh: '标准答案库', en: 'Standard answer library', vi: 'Thư viện câu trả lời chuẩn' },
  monitor: { zh: 'AI 可见度扫描', en: 'AI visibility scan', vi: 'Quét khả năng hiển thị AI' },
  report: { zh: '深度分析报告', en: 'In-depth analysis report', vi: 'Báo cáo phân tích chuyên sâu' },
  optimize: { zh: '内容优化方案', en: 'Content optimization plan', vi: 'Kế hoạch tối ưu nội dung' },
  site: { zh: '站点 GEO 改造建议', en: 'Site GEO recommendations', vi: 'Khuyến nghị GEO cho website' },
  schema: { zh: '结构化数据部署包', en: 'Structured-data package', vi: 'Gói dữ liệu có cấu trúc' },
  distribute: { zh: '分发内容包', en: 'Distribution content pack', vi: 'Gói nội dung phân phối' },
  encyclopedia: { zh: '百科/知识条目', en: 'Encyclopedia entries', vi: 'Mục bách khoa toàn thư' },
  full_scan: { zh: '全链路扫描与交付', en: 'Full pipeline scan & deliverables', vi: 'Quét toàn diện & bàn giao' },
};

const UI = {
  zh: {
    subject: (brand: string, label: string, score: number | null) =>
      score != null ? `${brand} GEO 周报 · ${label} ${score}` : `${brand} GEO 周报`,
    baselineNote: '当前处于基线观察期:AI 引擎尚未完成对新内容的重新抓取,分数波动暂无解读意义。本期以交付动作为准。',
    scoreSection: '本期指数',
    actionsSection: '本期交付动作',
    attributionSection: '效果归因',
    strategySection: '策略建议',
    cooperationSection: '需要贵方配合',
    engines: '分引擎表现',
    highIntent: '高意图问题得分',
    topOfMind: '首位提及率',
    noActions: '本期无新增交付(扫描与监测持续运行)。',
    fullReport: '完整扫描数据与 PDF 报告可在工作台查看下载:',
    footer: 'MemeCMO Tech Limited · Hong Kong CR No. 80218619 · GEO 生成式引擎优化平台',
    alertSubject: (brand: string) => `【关注】${brand} AI 可见度显著变化`,
    stageLabels: { build: '建设期', optimize: '优化期', steady: '稳态期' },
  },
  en: {
    subject: (brand: string, label: string, score: number | null) =>
      score != null ? `${brand} GEO Weekly · ${label} ${score}` : `${brand} GEO Weekly`,
    baselineNote: 'Baseline observation period: AI engines have not yet re-crawled the new content, so score movement is not meaningful yet. This digest focuses on delivered work.',
    scoreSection: 'Index this period',
    actionsSection: 'Delivered this period',
    attributionSection: 'Effect attribution',
    strategySection: 'Strategy guidance',
    cooperationSection: 'Action needed from your team',
    engines: 'Per-engine performance',
    highIntent: 'High-intent score',
    topOfMind: 'Top-of-mind rate',
    noActions: 'No new deliverables this period (scanning and monitoring continue).',
    fullReport: 'Full scan data and the PDF report are available in the workspace:',
    footer: 'MemeCMO Tech Limited · Hong Kong CR No. 80218619 · Generative Engine Optimization',
    alertSubject: (brand: string) => `[Attention] Significant AI-visibility change for ${brand}`,
    stageLabels: { build: 'Build phase', optimize: 'Optimization phase', steady: 'Steady state' },
  },
  vi: {
    subject: (brand: string, label: string, score: number | null) =>
      score != null ? `Báo cáo GEO tuần · ${brand} · ${label} ${score}` : `Báo cáo GEO tuần · ${brand}`,
    baselineNote: 'Giai đoạn quan sát cơ sở: các AI engine chưa thu thập lại nội dung mới, biến động điểm số chưa có ý nghĩa. Bản tin này tập trung vào công việc đã bàn giao.',
    scoreSection: 'Chỉ số kỳ này',
    actionsSection: 'Đã bàn giao kỳ này',
    attributionSection: 'Phân tích hiệu quả',
    strategySection: 'Khuyến nghị chiến lược',
    cooperationSection: 'Cần quý công ty phối hợp',
    engines: 'Hiệu suất theo từng engine',
    highIntent: 'Điểm câu hỏi ý định cao',
    topOfMind: 'Tỷ lệ nhắc đến đầu tiên',
    noActions: 'Không có bàn giao mới trong kỳ (quét và giám sát vẫn tiếp tục).',
    fullReport: 'Dữ liệu quét đầy đủ và báo cáo PDF có tại workspace:',
    footer: 'MemeCMO Tech Limited · Hong Kong CR No. 80218619 · Generative Engine Optimization',
    alertSubject: (brand: string) => `[Chú ý] Thay đổi đáng kể về khả năng hiển thị AI của ${brand}`,
    stageLabels: { build: 'Giai đoạn xây dựng', optimize: 'Giai đoạn tối ưu', steady: 'Giai đoạn ổn định' },
  },
} as const;

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Normalize a completed monitor/full_scan run output to the scorecard object. */
function toScorecard(output: any): any | null {
  if (!output) return null;
  const sc = output.scorecard ?? output;
  return typeof sc?.aigvrScore === 'number' || typeof sc?.metrics === 'object' ? sc : null;
}

export function deriveStage(rs: ReportSchedule, scanCount: number): DigestStage {
  if (rs.stageOverride) return rs.stageOverride;
  const days = rs.kickoffAt ? (Date.now() - new Date(rs.kickoffAt).getTime()) / 86400_000 : 0;
  if (days < 28 || scanCount < 2) return 'build';
  if (days < 90) return 'optimize';
  return 'steady';
}

interface GatherResult {
  project: any;
  orgSlug: string;
  projectSlug: string;
  scoreLabel: string;
  schedule: ReportSchedule;
  stage: DigestStage;
  current: any | null;   // latest scorecard
  previous: any | null;  // the one before
  actions: { label: string; summary: string; at: string }[];
  latestReport: any | null; // Report-agent output completed within 7 days, if any
}

async function gather(sb: SupabaseClient, projectId: string): Promise<GatherResult | null> {
  const { data: project } = await sb
    .from('projects')
    .select('id, slug, brand_name, brand_url, target_country, target_language, industry, metadata, organization_id, organizations!inner(slug, metadata)')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return null;

  const org: any = project.organizations;
  const schedule: ReportSchedule = (project.metadata as any)?.reportSchedule || {};

  const { data: scans } = await sb
    .from('agent_runs')
    .select('id, agent_id, output, completed_at')
    .eq('project_id', projectId)
    .in('agent_id', ['monitor', 'full_scan'])
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(6);
  const scorecards = (scans ?? []).map((r) => ({ ...r, sc: toScorecard(r.output) })).filter((r) => r.sc);

  const since = schedule.lastDigestAt || new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: recent } = await sb
    .from('agent_runs')
    .select('agent_id, summary, output, completed_at')
    .eq('project_id', projectId)
    .eq('status', 'completed')
    .gt('completed_at', since)
    .order('completed_at', { ascending: true })
    .limit(30);

  // Aggregate by deliverable type — repeated runs of the same agent (e.g. the
  // scan re-measuring several times in a period) collapse into one row with a
  // count and the LATEST summary, instead of spamming the client's inbox.
  const lang: DigestLang = schedule.language || 'en';
  const byAgent = new Map<string, { count: number; summary: string; at: string }>();
  for (const r of recent ?? []) {
    if (!ACTION_LABELS[r.agent_id]) continue;
    const prev = byAgent.get(r.agent_id);
    byAgent.set(r.agent_id, {
      count: (prev?.count ?? 0) + 1,
      summary: String(r.summary || '').slice(0, 200), // recent is ascending → last write wins
      at: r.completed_at,
    });
  }
  const actions = [...byAgent.entries()].map(([agentId, v]) => ({
    label: ACTION_LABELS[agentId][lang] + (v.count > 1 ? ` ×${v.count}` : ''),
    summary: v.summary,
    at: v.at,
  }));

  const freshReport = (recent ?? []).find(
    (r) => r.agent_id === 'report' || (r.agent_id === 'full_scan' && (r.output as any)?.report),
  );
  const latestReport = freshReport
    ? ((freshReport.output as any)?.report ?? freshReport.output)
    : null;

  return {
    project,
    orgSlug: org?.slug || '',
    projectSlug: project.slug,
    scoreLabel: org?.metadata?.scoreLabel || 'AI Mindset Index',
    schedule,
    stage: deriveStage(schedule, scorecards.length),
    current: scorecards[0]?.sc ?? null,
    previous: scorecards[1]?.sc ?? null,
    actions,
    latestReport,
  };
}

// ── LLM interpretation: the two DETAILED sections ────────────────────────────
// Attribution + strategy are prose, stage-aware, in the client's language.
// Deterministic numbers never depend on this call — if it fails, the digest
// still sends with data sections only.

interface Interpretation {
  attribution: string[];   // detailed paragraphs
  strategy: { title: string; detail: string }[];
  cooperation: string[];   // client-side asks (build stage emphasizes this)
}

const LANG_NAME: Record<DigestLang, string> = { zh: 'Simplified Chinese', en: 'English', vi: 'Vietnamese' };

async function interpret(g: GatherResult): Promise<Interpretation | null> {
  const lang = g.schedule.language || 'en';
  const cur = g.current;
  const prev = g.previous;
  const brief = (sc: any) =>
    sc
      ? {
          score: sc.aigvrScore,
          dims: sc.metrics?.overall,
          perEngine: (sc.metrics?.perEngine ?? []).map((e: any) => ({ engine: e.engine, score: e.aigvr, presence: e.presenceRate })),
          perIntent: sc.metrics?.perIntent,
          topOfMind: sc.topOfMind?.overallRate,
          topCompetitors: (sc.competitors ?? sc.competitorAnalysis?.competitors ?? []).slice(0, 5),
          gaps: (sc.gaps ?? []).slice(0, 6),
        }
      : null;

  const stageGuide: Record<DigestStage, string> = {
    build:
      'BUILD stage: engines have not re-crawled yet. Do NOT interpret score movement. Attribution = what the delivered work sets up and why it matters. Cooperation list is the most important output — concrete asks (publish content, verify facts, DNS/schema deployment, provide materials).',
    optimize:
      'OPTIMIZE stage: deltas are meaningful. Attribution must CONNECT the shipped actions to specific metric movements (which engine, which dimension, which intent class) — be concrete and evidence-based, admit uncertainty where attribution is weak. Strategy = the highest-leverage next actions.',
    steady:
      'STEADY stage: focus on trend, competitive movements, and defending/extending position. Fold in the monthly report recommendations if provided. Strategy should read like a fractional-CMO advisory note.',
  };

  const sys =
    'You are a senior GEO (Generative Engine Optimization) analyst writing the interpretation sections of a client digest email. ' +
    `Write in ${LANG_NAME[lang]}. Detailed, specific, evidence-based prose — no hype, no vague consulting filler. ` +
    'Never mention internal tooling or vendors; refer to engines by their public names. Output strict JSON only.';

  const user = [
    `Brand: ${g.project.brand_name} · Market: ${g.project.target_country} · Industry: ${g.project.industry || 'n/a'}`,
    `Lifecycle stage: ${g.stage}. ${stageGuide[g.stage]}`,
    '',
    `CURRENT scan: ${JSON.stringify(brief(cur))}`,
    `PREVIOUS scan: ${JSON.stringify(brief(prev))}`,
    `Actions shipped this period: ${JSON.stringify(g.actions.map((a) => ({ what: a.label, note: a.summary })))}`,
    g.latestReport ? `Latest analyst report highlights: ${JSON.stringify({ summary: (g.latestReport as any).executiveSummary ?? (g.latestReport as any).summary, recs: ((g.latestReport as any).recommendations ?? []).slice(0, 4) }).slice(0, 3000)}` : null,
    '',
    'Return ONLY this JSON:',
    '{ "attribution": ["detailed paragraph", ...], "strategy": [{ "title": "short", "detail": "detailed paragraph" }, ...], "cooperation": ["concrete ask", ...] }',
    'attribution: 2-4 paragraphs. strategy: 2-4 items. cooperation: 0-5 items (build stage: always ≥3).',
  ].filter(Boolean).join('\n');

  try {
    const res = await poeChat({
      model: DEFAULT_MODEL,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      // CJK JSON is token-hungry — 2200 truncated mid-object in testing.
      maxTokens: 4200,
      temperature: 0.3,
      retries: 1,
    });
    const parsed = parseJsonFromLLM<any>(res.content);
    if (!parsed) {
      console.error('[digest] interpretation parse miss:', res.content.slice(0, 300));
      return null;
    }
    return {
      attribution: (parsed.attribution ?? []).filter((s: any) => typeof s === 'string'),
      strategy: (parsed.strategy ?? []).filter((s: any) => s?.title && s?.detail),
      cooperation: (parsed.cooperation ?? []).filter((s: any) => typeof s === 'string'),
    };
  } catch (e) {
    // Digest degrades to data-only rather than blocking — but the miss must be
    // visible in server logs, never silent.
    console.error('[digest] interpretation failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

// ── HTML assembly (Atelier day palette, inline styles for email clients) ─────

function digestHtml(g: GatherResult, interp: Interpretation | null): string {
  const lang = g.schedule.language || 'en';
  const t = UI[lang];
  const cur = g.current;
  const prev = g.previous;
  const delta = cur && prev ? Math.round((cur.aigvrScore - prev.aigvrScore) * 10) / 10 : null;
  const deltaBadge =
    delta == null || g.stage === 'build'
      ? ''
      : delta > 0
        ? `<span style="color:#5B8266;font-size:15px;font-weight:600;"> ▲ +${delta}</span>`
        : delta < 0
          ? `<span style="color:#A64B4B;font-size:15px;font-weight:600;"> ▼ ${delta}</span>`
          : `<span style="color:#9C8E8A;font-size:13px;"> ―</span>`;

  const sec = (title: string, inner: string) =>
    `<div style="margin-top:26px;"><div style="font-size:11px;letter-spacing:2px;color:#9C8E8A;text-transform:uppercase;margin-bottom:10px;">${esc(title)}</div>${inner}</div>`;

  // Score block — concise by design (full data lives in the workspace PDF).
  let scoreBlock = '';
  if (cur) {
    const engines = (cur.metrics?.perEngine ?? [])
      .map(
        (e: any) =>
          `<tr><td style="padding:5px 0;font-size:13px;color:#2A2024;">${esc(e.engine)}</td><td style="padding:5px 0;font-size:13px;color:#6E625F;text-align:right;font-variant-numeric:tabular-nums;">${Math.round(e.aigvr)}</td></tr>`,
      )
      .join('');
    const hi = (cur.metrics?.perIntent ?? []).find((i: any) => i.intent === 'high_intent');
    scoreBlock = sec(
      `${t.scoreSection} · ${t.stageLabels[g.stage]}`,
      `<div style="font-size:40px;font-weight:700;color:#2A2024;line-height:1;">${Math.round(cur.aigvrScore)}${deltaBadge}</div>
       <div style="font-size:12px;color:#9C8E8A;margin-top:4px;">${esc(g.scoreLabel)}</div>
       ${g.stage === 'build' ? `<p style="margin:12px 0 0;font-size:12.5px;color:#8A6D3B;background:#FBF3E4;border-radius:8px;padding:10px 12px;line-height:1.55;">${esc(t.baselineNote)}</p>` : ''}
       <table style="width:100%;border-collapse:collapse;margin-top:14px;">${engines}</table>
       <div style="font-size:12px;color:#6E625F;margin-top:8px;">${esc(t.highIntent)}: ${hi ? Math.round(hi.aigvr) : '–'} · ${esc(t.topOfMind)}: ${cur.topOfMind?.overallRate != null ? Math.round(cur.topOfMind.overallRate) + '%' : '–'}</div>`,
    );
  }

  const actionsBlock = sec(
    t.actionsSection,
    g.actions.length
      ? `<ul style="margin:0;padding-left:18px;">${g.actions
          .map((a) => `<li style="font-size:13px;color:#2A2024;margin-bottom:6px;line-height:1.5;"><strong>${esc(a.label)}</strong>${a.summary ? ` — <span style="color:#6E625F;">${esc(a.summary)}</span>` : ''}</li>`)
          .join('')}</ul>`
      : `<p style="margin:0;font-size:13px;color:#6E625F;">${esc(t.noActions)}</p>`,
  );

  // The two deliberately DETAILED sections.
  const attributionBlock =
    interp && interp.attribution.length && g.stage !== 'build'
      ? sec(t.attributionSection, interp.attribution.map((p) => `<p style="margin:0 0 12px;font-size:13.5px;color:#2A2024;line-height:1.7;">${esc(p)}</p>`).join(''))
      : '';
  const strategyBlock =
    interp && interp.strategy.length
      ? sec(
          t.strategySection,
          interp.strategy
            .map(
              (s) =>
                `<div style="margin-bottom:14px;"><div style="font-size:13.5px;font-weight:600;color:#2A2024;margin-bottom:3px;">${esc(s.title)}</div><p style="margin:0;font-size:13px;color:#6E625F;line-height:1.65;">${esc(s.detail)}</p></div>`,
            )
            .join(''),
        )
      : '';
  const cooperationBlock =
    interp && interp.cooperation.length
      ? sec(
          t.cooperationSection,
          `<ul style="margin:0;padding-left:18px;">${interp.cooperation.map((c) => `<li style="font-size:13px;color:#2A2024;margin-bottom:6px;line-height:1.5;">${esc(c)}</li>`).join('')}</ul>`,
        )
      : '';

  const workspaceUrl = `${APP_URL}/workspace/${g.orgSlug}/${g.projectSlug}`;

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#FBF7F4;font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:11px;letter-spacing:3px;color:#9C8E8A;text-transform:uppercase;margin-bottom:18px;">MemeCMO &middot; GEO</div>
    <div style="background:#FFFFFF;border:1px solid rgba(58,30,34,0.12);border-radius:14px;padding:28px;">
      <h1 style="margin:0 0 2px;font-size:18px;color:#2A2024;">${esc(g.project.brand_name)} &middot; ${esc(g.project.target_country)}</h1>
      <div style="font-size:12px;color:#9C8E8A;">${new Date().toISOString().slice(0, 10)}</div>
      ${scoreBlock}
      ${actionsBlock}
      ${attributionBlock}
      ${strategyBlock}
      ${cooperationBlock}
      <div style="margin-top:26px;padding-top:16px;border-top:1px solid rgba(58,30,34,0.08);">
        <p style="margin:0 0 8px;font-size:12px;color:#6E625F;">${esc(t.fullReport)}</p>
        <a href="${workspaceUrl}" style="display:inline-block;background:#C76B7A;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:600;padding:10px 16px;border-radius:9px;">Workspace →</a>
      </div>
    </div>
    <p style="margin:16px 0 0;font-size:11px;color:#9C8E8A;text-align:center;">${esc(t.footer)}</p>
  </div>
</body></html>`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Compose the digest without sending — operator preview. */
export async function previewProjectDigest(
  sb: SupabaseClient,
  projectId: string,
): Promise<{ subject: string; html: string; stage: DigestStage; recipients: string[] } | null> {
  const g = await gather(sb, projectId);
  if (!g) return null;
  const interp = await interpret(g);
  const lang = g.schedule.language || 'en';
  return {
    subject: UI[lang].subject(g.project.brand_name, g.scoreLabel, g.current ? Math.round(g.current.aigvrScore) : null),
    html: digestHtml(g, interp),
    stage: g.stage,
    recipients: g.schedule.recipients ?? [],
  };
}

/** Compose and send the weekly digest for one project. Never throws. */
export async function sendProjectDigest(
  sb: SupabaseClient,
  projectId: string,
): Promise<{ sent: boolean; reason?: string }> {
  const g = await gather(sb, projectId);
  if (!g) return { sent: false, reason: 'project not found' };
  const recipients = (g.schedule.recipients ?? []).filter((r) => /.+@.+\..+/.test(r));
  if (!recipients.length) return { sent: false, reason: 'no recipients configured' };

  const interp = await interpret(g); // null → digest still sends, data-only
  const lang = g.schedule.language || 'en';
  const html = digestHtml(g, interp);
  const subject = UI[lang].subject(
    g.project.brand_name,
    g.scoreLabel,
    g.current ? Math.round(g.current.aigvrScore) : null,
  );

  const res = await sendEmail({ to: recipients, subject, html });
  if (res.sent) {
    const metadata = { ...(g.project.metadata as any), reportSchedule: { ...g.schedule, lastDigestAt: new Date().toISOString() } };
    await sb.from('projects').update({ metadata }).eq('id', projectId);
  }
  return res;
}

/**
 * Event-triggered alert after a scan completes: score drop ≥ 5 or an engine's
 * coverage collapsing to zero. Deduped per run id. Never throws.
 */
export async function maybeSendScanAlert(
  sb: SupabaseClient,
  projectId: string,
  runId: string,
): Promise<{ sent: boolean; reason?: string }> {
  const g = await gather(sb, projectId);
  if (!g) return { sent: false, reason: 'project not found' };
  const recipients = (g.schedule.recipients ?? []).filter((r) => /.+@.+\..+/.test(r));
  if (!recipients.length) return { sent: false, reason: 'no recipients' };
  if (g.schedule.lastAlertRunId === runId) return { sent: false, reason: 'already alerted for this run' };
  if (!g.current || !g.previous) return { sent: false, reason: 'need two scans' };
  if (g.stage === 'build') return { sent: false, reason: 'baseline period — no movement alerts' };

  const drop = g.previous.aigvrScore - g.current.aigvrScore;
  const prevEngines = new Map<string, number>((g.previous.metrics?.perEngine ?? []).map((e: any) => [e.engine, e.aigvr]));
  const collapsed = (g.current.metrics?.perEngine ?? []).filter(
    (e: any) => e.aigvr === 0 && (prevEngines.get(e.engine) ?? 0) > 10,
  );
  if (drop < 5 && !collapsed.length) return { sent: false, reason: 'no alert condition' };

  const lang = g.schedule.language || 'en';
  const t = UI[lang];
  const lines: string[] = [];
  if (drop >= 5) {
    lines.push(
      lang === 'zh'
        ? `综合指数从 ${Math.round(g.previous.aigvrScore)} 降至 ${Math.round(g.current.aigvrScore)}(-${Math.round(drop * 10) / 10})。我们已启动归因分析,将在下期报告中给出完整解读与应对动作。`
        : lang === 'vi'
          ? `Chỉ số tổng hợp giảm từ ${Math.round(g.previous.aigvrScore)} xuống ${Math.round(g.current.aigvrScore)} (-${Math.round(drop * 10) / 10}). Chúng tôi đã bắt đầu phân tích nguyên nhân và sẽ có giải thích đầy đủ trong báo cáo kỳ tới.`
          : `The composite index dropped from ${Math.round(g.previous.aigvrScore)} to ${Math.round(g.current.aigvrScore)} (-${Math.round(drop * 10) / 10}). Attribution analysis has started; the next digest will carry a full read-out and response actions.`,
    );
  }
  for (const e of collapsed) {
    lines.push(
      lang === 'zh'
        ? `${e.engine} 上的可见度归零(上期 ${Math.round(prevEngines.get(e.engine)!)})——正在核查是引擎侧变化还是内容侧问题。`
        : lang === 'vi'
          ? `Khả năng hiển thị trên ${e.engine} về 0 (kỳ trước ${Math.round(prevEngines.get(e.engine)!)}) — đang kiểm tra nguyên nhân.`
          : `Visibility on ${e.engine} collapsed to zero (was ${Math.round(prevEngines.get(e.engine)!)}) — investigating whether this is engine-side or content-side.`,
    );
  }

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#FBF7F4;font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:11px;letter-spacing:3px;color:#9C8E8A;text-transform:uppercase;margin-bottom:18px;">MemeCMO &middot; GEO</div>
    <div style="background:#FFFFFF;border:1px solid rgba(166,75,75,0.35);border-radius:14px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:17px;color:#A64B4B;">${esc(t.alertSubject(g.project.brand_name))}</h1>
      ${lines.map((l) => `<p style="margin:0 0 10px;font-size:13.5px;color:#2A2024;line-height:1.65;">${esc(l)}</p>`).join('')}
      <a href="${APP_URL}/workspace/${g.orgSlug}/${g.projectSlug}" style="display:inline-block;margin-top:8px;background:#C76B7A;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:600;padding:10px 16px;border-radius:9px;">Workspace →</a>
    </div>
    <p style="margin:16px 0 0;font-size:11px;color:#9C8E8A;text-align:center;">${esc(t.footer)}</p>
  </div>
</body></html>`;

  const res = await sendEmail({ to: recipients, subject: t.alertSubject(g.project.brand_name), html });
  if (res.sent) {
    const metadata = { ...(g.project.metadata as any), reportSchedule: { ...g.schedule, lastAlertRunId: runId } };
    await sb.from('projects').update({ metadata }).eq('id', projectId);
  }
  return res;
}
