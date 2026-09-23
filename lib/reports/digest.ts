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
import { outputTokenBudget } from '@/lib/markets';
import { poeChat, parseJsonFromLLM, DEFAULT_MODEL, assertComplete } from '@/lib/llm/poe';
import { sendEmail } from '@/lib/email';
import { gate, domainCandidates, figuresFromScorecard, type GroundTruth, type VerificationReport } from './verify';
import { loadInterventions, computeOutcomes, outcomeFigures, describeOutcome, citesPerScan, type Intervention, type Outcome } from '@/lib/interventions';

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
    citationSection: '引用源明细', ownDomain: '品牌自域', thirdParty: '第三方来源',
    leverageSection: '信源杠杆',
    ivxSection: '行动与结果', ivxAwaiting: '等待下一次扫描', ivxPresence: '目标问题上品牌在场', ivxCited: '被引用次数', ivxScans: (b: number, a: number) => `发布前 ${b} 次扫描 · 发布后 ${a} 次`, ivxNote: '口径:同一问题、同一引擎,发布日前后各次扫描中品牌在场的回答数 ÷ 该窗口内的回答数;引用次数为该域名在全部回答引用链接中出现的次数。',
    methodChange: (list: string) => `方法学变更:本期与上期对比的引擎中,底层模型发生了变化(${list})。这是供应商侧的模型更替,不是品牌表现的变化;该引擎的分数以本期为新基线,本期不解读其涨跌。`,
    provenance: (checked: number, passed: number) =>
      `数据核验:本期解读共 ${checked} 条论断,逐条对照本项目扫描数据与引用索引核验,${passed} 条通过。未能核验的论断已降级或移除,不进入本报告。`,
    leverageBasis: (domains: number, cites: number, since: string) =>
      `累计源库中 ${domains} 个第三方域名 · ${cites} 条带结果判定的引用 · 自 ${since}`,
    carriersTitle: '承载品牌的来源',
    carriersNote: '[推断] 这些来源被引用时,品牌出现在应答里的比例远高于平均。它们的内容正在为品牌背书 —— 优先维护、更新与扩展。',
    gapsTitle: '纯引用缺口',
    gapsNote: '[实测] AI 在这些来源上引用了竞争者,品牌出现 0 次。它们已被引擎视为本品类的权威,却完全没有品牌的位置 —— 收益最高的获取目标。',
    colQuestions: '涉及问题', colHiCites: '高意图引用', colRatio: '倍数', colHolders: '当前占位',
    interpUnavailable: '本期深度解读(效果归因/策略建议/协作请求)生成失败,以上数据区完整无误;完整分析将尽快补发。',
    thisScan: '本期实测(当期扫描 · 仅检索型引擎的真实引用)', cumulativeIdx: '累计源库(跨全部扫描,含历史)',
    newCites: '本期新增来源', lostCites: '本期流失来源', citedByEngine: '各引擎实际引用',
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
    citationSection: 'Citation sources', ownDomain: 'Brand-owned', thirdParty: 'Third-party',
    leverageSection: 'Source leverage',
    ivxSection: 'Actions and what moved', ivxAwaiting: 'awaiting the next scan', ivxPresence: 'brand present on the targeted question', ivxCited: 'times cited', ivxScans: (b: number, a: number) => `${b} scans before publishing · ${a} after`, ivxNote: 'Method: same question, same engine — answers naming the brand ÷ answers in the window before vs after the publish date; "times cited" counts the domain across all answer links.',
    methodChange: (list: string) => `Methodology change: the model behind one or more engines changed between the two scans compared (${list}). This is a provider-side model replacement, not a change in brand performance; that engine's score resets its baseline this issue and its movement is not interpreted.`,
    provenance: (checked: number, passed: number) =>
      `Verification: ${checked} claims in this issue were each checked against this project's own scan data and citation index; ${passed} passed. Claims that could not be verified were demoted or removed and do not appear above.`,
    leverageBasis: (domains: number, cites: number, since: string) =>
      `${domains} third-party domains in the cumulative index · ${cites} outcome-tagged citations · since ${since}`,
    carriersTitle: 'Sources that carry the brand',
    carriersNote: '[Inferred] When these sources are cited, the brand appears in the answer far more often than average. Their content is vouching for the brand — keep it current and extend it.',
    gapsTitle: 'Pure citation gaps',
    gapsNote: '[Observed] The engines cite competitors from these sources and the brand appears zero times. They are already treated as category authorities with no place for the brand — the highest-yield acquisition targets.',
    colQuestions: 'Questions', colHiCites: 'High-intent cites', colRatio: 'Ratio', colHolders: 'Who holds it',
    interpUnavailable: 'The interpretation sections (attribution / strategy / cooperation) failed to generate this issue; the data sections above are complete. A full analysis follow-up will be sent.',
    thisScan: 'This scan (retrieval engines only — verified citations)', cumulativeIdx: 'Cumulative source index (all scans)',
    newCites: 'New this period', lostCites: 'Lost this period', citedByEngine: 'Cited by engine',
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
    citationSection: 'Nguồn trích dẫn', ownDomain: 'Tên miền thương hiệu', thirdParty: 'Nguồn bên thứ ba',
    leverageSection: 'Đòn bẩy nguồn trích dẫn',
    ivxSection: 'Hành động và kết quả', ivxAwaiting: 'chờ lần quét tiếp theo', ivxPresence: 'thương hiệu xuất hiện ở câu hỏi mục tiêu', ivxCited: 'lần được trích dẫn', ivxScans: (b: number, a: number) => `${b} lần quét trước khi đăng · ${a} lần sau`, ivxNote: 'Chuẩn đo: cùng câu hỏi, cùng engine — số câu trả lời có nhắc thương hiệu ÷ số câu trả lời trong cửa sổ trước và sau ngày đăng; "lần được trích dẫn" đếm tên miền trong mọi liên kết được trích.',
    methodChange: (list: string) => `Thay đổi phương pháp: mô hình nền của một hoặc nhiều engine đã thay đổi giữa hai lần quét được so sánh (${list}). Đây là việc nhà cung cấp thay mô hình, không phải thay đổi trong hiệu suất thương hiệu; điểm của engine đó lấy kỳ này làm mốc mới và không diễn giải biến động.`,
    provenance: (checked: number, passed: number) =>
      `Kiểm chứng: ${checked} luận điểm trong kỳ này đã được đối chiếu với dữ liệu quét và kho nguồn trích dẫn của chính dự án; ${passed} luận điểm đạt. Những luận điểm không kiểm chứng được đã bị hạ cấp hoặc loại bỏ, không xuất hiện ở trên.`,
    leverageBasis: (domains: number, cites: number, since: string) =>
      `${domains} tên miền bên thứ ba trong kho nguồn tích lũy · ${cites} trích dẫn đã gắn kết quả · từ ${since}`,
    carriersTitle: 'Nguồn đang mang thương hiệu',
    carriersNote: '[Suy luận] Khi các nguồn này được trích dẫn, thương hiệu xuất hiện trong câu trả lời với tỷ lệ cao hơn mức trung bình rất nhiều. Nội dung của họ đang bảo chứng cho thương hiệu — hãy duy trì, cập nhật và mở rộng.',
    gapsTitle: 'Khoảng trống trích dẫn hoàn toàn',
    gapsNote: '[Đo được] AI trích dẫn đối thủ từ các nguồn này và thương hiệu xuất hiện 0 lần. Các engine đã coi đây là nguồn uy tín của ngành nhưng không có chỗ cho thương hiệu — mục tiêu cần giành lấy, hiệu quả cao nhất.',
    colQuestions: 'Số câu hỏi', colHiCites: 'Trích dẫn ý định cao', colRatio: 'Hệ số', colHolders: 'Đang chiếm chỗ',
    interpUnavailable: 'Phần diễn giải (phân tích hiệu quả / khuyến nghị / phối hợp) của kỳ này không tạo được; các mục dữ liệu phía trên vẫn đầy đủ. Bản phân tích đầy đủ sẽ được gửi bổ sung.',
    thisScan: 'Kỳ này (chỉ engine truy xuất — trích dẫn đã xác thực)', cumulativeIdx: 'Kho nguồn tích lũy (mọi lần quét)',
    newCites: 'Nguồn mới kỳ này', lostCites: 'Nguồn mất kỳ này', citedByEngine: 'Trích dẫn theo engine',
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

/** Model prose only. The interpretation model marks its evidence tags up as
 *  **[Observed]** — escaped verbatim that reaches the client as literal
 *  asterisks. Escape first (never trust model output as HTML), then promote
 *  the one markdown construct it actually uses. */
function escProse(s: string): string {
  return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
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

// ── Source leverage (S1) ─────────────────────────────────────────────────────
// The citation index says WHICH domains the engines cite. S1 adds what each
// citation co-occurred with, which splits the third-party corpus in two:
//
//   carriers — cited across many DIFFERENT questions, and the brand is in the
//              answer far more often than not. Inferred: their content carries
//              the brand. Defend and extend.
//   gaps     — cited only on answers where the brand is ABSENT and competitors
//              are named. Observed, and the highest-yield acquisition list.
//
// Thresholds exist to keep a single lucky question out of a client email:
// a carrier must hold across ≥3 distinct questions AND ≥2 engines (one engine
// on one question is a sampling artifact, not leverage), and outscore its
// misses ≥3×. A gap must be missing on ≥2 distinct questions with ≥5
// high-intent citations and at least one named competitor standing there.
const LEV = {
  carrierMinPrompts: 3,
  carrierMinEngines: 2,
  carrierMinRatio: 3,
  gapMinPrompts: 2,
  gapMinHighIntent: 5,
  show: 5,
} as const;

export interface LeverageRow {
  domain: string;
  win: number; loss: number;
  winPrompts: number; lossPrompts: number;
  hiWin: number; hiLoss: number;
  engines: number;
  competitors: string[];
}
export interface LeverageInsight {
  carriers: LeverageRow[];
  gaps: LeverageRow[];
  domains: number;      // third-party domains with a verdict
  observed: number;     // citation rows behind the analysis
  since: string | null; // start of the observation window
}

/** Aggregate the project's whole citation index into the two leverage lists.
 *  Ranking and thresholds run in SQL (the index outgrew PostgREST's 1000-row
 *  reply cap, which truncated the aggregate silently). Deterministic, and never
 *  blocks the digest — returns null on any failure. */
async function gatherLeverage(
  sb: SupabaseClient,
  projectId: string,
  brandDomains: Set<string>,
): Promise<LeverageInsight | null> {
  const { data, error } = await sb.rpc('geo_source_leverage', {
    p_project_id: projectId,
    p_brand_domains: [...brandDomains],
    p_carrier_min_prompts: LEV.carrierMinPrompts,
    p_carrier_min_engines: LEV.carrierMinEngines,
    p_carrier_min_ratio: LEV.carrierMinRatio,
    p_gap_min_prompts: LEV.gapMinPrompts,
    p_gap_min_high_intent: LEV.gapMinHighIntent,
    p_limit: LEV.show,
  });
  if (error || !Array.isArray(data) || !data.length) {
    if (error) console.error('[digest] leverage rpc failed:', error.message);
    return null;
  }
  const toRow = (r: any): LeverageRow => ({
    domain: String(r.domain),
    win: Number(r.win_cites) || 0,
    loss: Number(r.loss_cites) || 0,
    winPrompts: Number(r.win_prompts) || 0,
    lossPrompts: Number(r.loss_prompts) || 0,
    hiWin: Number(r.hi_win) || 0,
    hiLoss: Number(r.hi_loss) || 0,
    engines: Number(r.engines) || 0,
    competitors: Array.isArray(r.top_competitors) ? r.top_competitors.map(String) : [],
  });
  const carriers = data.filter((r: any) => r.kind === 'carrier').map(toRow);
  const gaps = data.filter((r: any) => r.kind === 'gap').map(toRow);
  if (!carriers.length && !gaps.length) return null;
  const first: any = data[0];
  return {
    carriers,
    gaps,
    domains: Number(first.total_domains) || 0,
    observed: Number(first.total_cites) || 0,
    since: first.since ?? null,
  };
}

interface GatherResult {
  project: any;
  orgSlug: string;
  projectSlug: string;
  scoreLabel: string;
  schedule: ReportSchedule;
  stage: DigestStage;
  current: any | null;   // latest scorecard
  currentMeta: { id: string; at: string | null; trigger: string | null } | null;
  previousMeta: { id: string; at: string | null; trigger: string | null } | null;
  previous: any | null;  // the one before
  // Engines whose underlying model differs between the two scans compared.
  // A provider retiring a bot (Poe: Gemini-2.5-Pro → 3.1-Pro, 2026-09-16)
  // changes the measurement, not the brand — the digest must say so, the
  // attribution model must not read it as movement, and the alert must not
  // fire on it.
  engineChange: string[];
  // What the client put into the world (last 90 days) and what the engines
  // did after — the causal half of the loop, computed from the scans.
  interventions: { list: Intervention[]; outcomes: Record<string, Outcome> };
  actions: { label: string; summary: string; at: string }[];
  latestReport: any | null; // Report-agent output completed within 7 days, if any
  brandDomains: Set<string>;
  leverage: LeverageInsight | null;
  indexTotals: { own: number; third: number } | null;
  truth: GroundTruth;
  sb: SupabaseClient;
  projectId: string;
}

/** Engines whose model changed between two scorecards. Uses the per-engine
 *  model map when both scans carry it; otherwise falls back to the
 *  `generatedBy` string (older scans) and reports the whole string. */
function engineModelChanges(cur: any, prev: any): string[] {
  if (!cur || !prev) return [];
  const a = cur.engineModels, b = prev.engineModels;
  if (a && b) {
    return Object.keys(a).filter((k) => b[k] && a[k] !== b[k]).map((k) => `${k}: ${b[k]} → ${a[k]}`);
  }
  if (cur.generatedBy && prev.generatedBy && cur.generatedBy !== prev.generatedBy) return [`${prev.generatedBy} → ${cur.generatedBy}`];
  return [];
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
    .select('id, agent_id, output, completed_at, trigger_method')
    .eq('project_id', projectId)
    .in('agent_id', ['monitor', 'full_scan'])
    .eq('status', 'completed')
    .neq('trigger_method', 'diagnostic') // partial engine sets never enter the digest comparison
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

  // Own hosts: brand_url plus any extras on metadata.brandDomains (a brand
  // often answers on more than one domain).
  const brandDomains = new Set<string>();
  try {
    const h = new URL(project.brand_url || '').hostname.replace(/^www\./, '').toLowerCase();
    if (h) brandDomains.add(h);
  } catch { /* no or malformed brand_url */ }
  for (const d of ((project.metadata as any)?.brandDomains ?? []) as unknown[]) {
    const norm = String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (norm) brandDomains.add(norm);
  }

  // True cumulative index size. The stored scorecard only keeps the TOP 20
  // domains, so summing its ranking undercounts the index by orders of
  // magnitude — and the digest labels that line "all scans".
  const countIndex = async (isBrand: boolean) =>
    (
      await sb
        .from('geo_citations')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('is_brand_domain', isBrand)
    ).count ?? 0;
  const indexTotals = await Promise.all([countIndex(true), countIndex(false)])
    .then(([own, third]) => ({ own, third }))
    .catch(() => null);

  const leverage = await gatherLeverage(sb, projectId, brandDomains).catch((e) => {
    console.error('[digest] leverage failed:', e instanceof Error ? e.message : e);
    return null;
  });

  // Ground truth for the verification gate. Engines and figures are fixed by the
  // scan; the domain set is resolved later, once we know which domains the
  // report actually mentions (see resolveDomains).
  const current = scorecards[0]?.sc ?? null;
  const leverageFigures = leverage
    ? [...leverage.carriers, ...leverage.gaps].flatMap((r) => [r.win, r.loss, r.winPrompts, r.lossPrompts, r.hiWin, r.hiLoss])
    : [];
  const actionList = (await loadInterventions(sb, projectId, { limit: 12 })).filter(
    (iv) => Date.now() - new Date(iv.published_at).getTime() < 90 * 86400e3,
  );
  const actionOutcomes = await computeOutcomes(sb, projectId, actionList);
  const truth: GroundTruth = {
    domains: new Set<string>(),
    engines: new Set<string>((current?.engines ?? (current?.metrics?.perEngine ?? []).map((e: any) => e.engine)) as string[]),
    // Outcome figures are legitimate observations — the gate must accept them.
    figures: figuresFromScorecard(current, [...leverageFigures, ...outcomeFigures(actionOutcomes)]),
  };

  return {
    project,
    orgSlug: org?.slug || '',
    projectSlug: project.slug,
    scoreLabel: org?.metadata?.scoreLabel || 'AI Mindset Index',
    schedule,
    stage: deriveStage(schedule, scorecards.length),
    current: scorecards[0]?.sc ?? null,
    previous: scorecards[1]?.sc ?? null,
    engineChange: engineModelChanges(scorecards[0]?.sc, scorecards[1]?.sc),
    interventions: { list: actionList, outcomes: actionOutcomes },
    currentMeta: scorecards[0] ? { id: scorecards[0].id, at: scorecards[0].completed_at, trigger: (scorecards[0] as any).trigger_method } : null,
    previousMeta: scorecards[1] ? { id: scorecards[1].id, at: scorecards[1].completed_at, trigger: (scorecards[1] as any).trigger_method } : null,
    actions,
    latestReport,
    brandDomains,
    leverage,
    indexTotals,
    truth,
    sb,
    projectId,
  };
}

/** Resolve which of the domains a report mentions actually exist in the
 *  project's citation index. Bounded by the claim text — never pulls the index. */
async function resolveDomains(g: GatherResult, claims: string[]): Promise<Set<string>> {
  const candidates = domainCandidates(claims);
  if (!candidates.length) return new Set();
  const { data, error } = await g.sb.rpc('geo_domains_known', {
    p_project_id: g.projectId,
    p_domains: candidates,
  });
  if (error) {
    // Fail SAFE: an unreachable index must not turn every cited domain into a
    // hallucination and gut the report. Trust the domains, keep gating figures.
    console.error('[digest] domain resolution failed, skipping domain checks:', error.message);
    return new Set(candidates);
  }
  return new Set((Array.isArray(data) ? data : []).map((r: any) => String(r.domain)));
}

// ── LLM interpretation: the two DETAILED sections ────────────────────────────
// Attribution + strategy are prose, stage-aware, in the client's language.
// Deterministic numbers never depend on this call — if it fails, the digest
// still sends with data sections only.

interface Interpretation {
  attribution: string[];   // detailed paragraphs
  strategy: { title: string; detail: string }[];
  cooperation: string[];   // client-side asks (build stage emphasizes this)
  verification: VerificationReport | null;
}

const LANG_NAME: Record<DigestLang, string> = { zh: 'Simplified Chinese', en: 'English', vi: 'Vietnamese' };

function buildInterpretationPrompt(g: GatherResult): { sys: string; user: string } {
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
    'Never mention internal tooling or vendors; refer to engines by their public names. ' +
    'EVIDENCE DISCIPLINE (client-agreed reporting standard): tag every claim with one of ' +
    '[Observed] (directly measured this scan), [Inferred] (reasoned from measured data), or [Hypothesis] (plausible, unverified). ' +
    'Score movements within ±3 points on an unchanged corpus are sampling noise — never present them as improvement or decline. ' +
    'NEVER attribute a metric change to a cause (PR, engine behavior change, competitor investment) unless the supporting evidence ' +
    'is itself in the data provided (e.g. named new cited sources); otherwise state it as [Hypothesis] with what evidence would confirm it. ' +
    'Output strict JSON only.';

  const methodologyLine = g.engineChange.length
    ? `METHODOLOGY CHANGE (non-negotiable): the model behind ${g.engineChange.join('; ')} changed between the two scans. Any movement on that engine is a measurement artefact — state this explicitly, do NOT attribute it to actions or to competitors, and treat this scan as the new baseline for that engine.`
    : null;
  const ivxLine = g.interventions.list.length
    ? 'CLIENT ACTIONS AND MEASURED OUTCOMES (observed; cite the fractions verbatim, attribute movement only to the specific action/engine/question shown):\n' +
      g.interventions.list.map((iv) => describeOutcome(iv, g.interventions.outcomes[iv.id] ?? { scansBefore: 0, scansAfter: 0, awaiting: true, prompts: [], domain: null })).join('\n')
    : null;
  const user = [
    methodologyLine,
    ivxLine,
    `Brand: ${g.project.brand_name} · Market: ${g.project.target_country} · Industry: ${g.project.industry || 'n/a'}`,
    `Lifecycle stage: ${g.stage}. ${stageGuide[g.stage]}`,
    '',
    `CURRENT scan: ${JSON.stringify(brief(cur))}`,
    `PREVIOUS scan: ${JSON.stringify(brief(prev))}`,
    `Actions shipped this period: ${JSON.stringify(g.actions.map((a) => ({ what: a.label, note: a.summary })))}`,
    g.leverage
      ? 'SOURCE LEVERAGE (cumulative citation index — deterministic, already shown to the client as a table; do NOT restate the numbers, USE them): ' +
        JSON.stringify({
          carriers: g.leverage.carriers.map((r) => ({ domain: r.domain, questionsWithBrand: r.winPrompts, questionsWithout: r.lossPrompts })),
          pureGaps: g.leverage.gaps.map((r) => ({ domain: r.domain, highIntentCitations: r.hiLoss, questions: r.lossPrompts, competitorsHolding: r.competitors.slice(0, 3) })),
        })
      : null,
    g.latestReport ? `Latest analyst report highlights: ${JSON.stringify({ summary: (g.latestReport as any).executiveSummary ?? (g.latestReport as any).summary, recs: ((g.latestReport as any).recommendations ?? []).slice(0, 4) }).slice(0, 3000)}` : null,
    '',
    'Return ONLY this JSON:',
    '{ "attribution": ["detailed paragraph", ...], "strategy": [{ "title": "short", "detail": "detailed paragraph" }, ...], "cooperation": ["concrete ask", ...] }',
    'attribution: 2-4 paragraphs. strategy: 2-4 items. cooperation: 0-5 items (build stage: always ≥3).',
    g.leverage
      ? 'If SOURCE LEVERAGE is present, at least one strategy item must act on it: name a specific pure-gap domain and say what earns a place there ' +
        '(the actual mechanism — a listing/profile, a contributed article, a data submission, a partnership page — not "create content"). ' +
        'Carriers are a CO-OCCURRENCE, not a proven cause: refer to them as sources whose content the brand appears alongside, tagged [Inferred], ' +
        'and never claim a source caused a score movement.'
      : null,
  ].filter(Boolean).join('\n');

  return { sys, user };
}

async function interpret(g: GatherResult): Promise<Interpretation | null> {
  const { sys, user } = buildInterpretationPrompt(g);

  // Two attempts: evidence-discipline tags lengthened output past the old
  // 4200 cap on 8-15 — the JSON truncated mid-array and the client received a
  // digest with one stray strategy line (round-3 §1). Attempt 2 asks for a
  // tighter shape.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const brevity = attempt === 0 ? '' :
        '\nYour previous response was truncated. BE CONCISE: attribution max 2 paragraphs; strategy max 3 items, each detail ≤2 sentences; cooperation max 4 items.';
      const res = await poeChat({
        model: DEFAULT_MODEL,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user + brevity }],
        // CJK/Vietnamese JSON with evidence tags is token-hungry — 4200
        // truncated on 8-15, and a live FMVN run with the source-leverage feed
        // used 4,939 on attempt 1. Headroom is far cheaper than a lost section.
        maxTokens: outputTokenBudget(8000, g.schedule.language),
        temperature: 0.3,
        retries: 1,
      });
      assertComplete(res, 'Digest interpretation');
      const parsed = parseJsonFromLLM<any>(res.content);
      if (!parsed) {
        console.error('[digest] interpretation parse miss (attempt ' + attempt + '):', res.content.slice(0, 300));
        continue;
      }
      // Verification gate. Every claim is checked against the data the report is
      // built on before the client sees it: a hallucinated source domain drops
      // the claim, an unsupported figure or engine demotes its evidence class.
      // Strategy items are gated as title+detail together — a recommendation to
      // act on a domain that does not exist must not ship on a good title.
      const attribution = (parsed.attribution ?? []).filter((x: any) => typeof x === 'string');
      const strategy = (parsed.strategy ?? []).filter((x: any) => x?.title && x?.detail);
      const cooperation = (parsed.cooperation ?? []).filter((x: any) => typeof x === 'string');

      const SEP = '\u0000';
      const stLines = strategy.map((x: any) => `${x.title}${SEP}${x.detail}`);
      const truth: GroundTruth = {
        ...g.truth,
        domains: await resolveDomains(g, [...attribution, ...stLines, ...cooperation]),
      };
      const a = gate(attribution, truth);
      const st = gate(stLines, truth);
      const co = gate(cooperation, truth);
      const verification: VerificationReport = {
        checked: a.report.checked + st.report.checked + co.report.checked,
        passed: a.report.passed + st.report.passed + co.report.passed,
        demoted: a.report.demoted + st.report.demoted + co.report.demoted,
        dropped: a.report.dropped + st.report.dropped + co.report.dropped,
        verdicts: [...a.report.verdicts, ...st.report.verdicts, ...co.report.verdicts],
      };
      if (verification.dropped || verification.demoted) {
        console.warn(
          `[digest] verification gate: ${verification.dropped} dropped, ${verification.demoted} demoted of ${verification.checked}`,
          verification.verdicts.filter((v) => v.outcome !== 'pass').map((v) => ({
            outcome: v.outcome, badDomains: v.badDomains, badFigures: v.badFigures, badEngines: v.badEngines,
            text: v.text.slice(0, 120),
          })),
        );
      }

      return {
        attribution: a.kept,
        strategy: st.kept.map((line) => {
          const i = line.indexOf(SEP);
          return i < 0 ? { title: line, detail: '' } : { title: line.slice(0, i), detail: line.slice(i + 1) };
        }),
        cooperation: co.kept,
        verification,
      };
    } catch (e) {
      // Log and fall through to the next attempt; the digest itself never blocks.
      console.error(`[digest] interpretation failed (attempt ${attempt}):`, e instanceof Error ? e.message : e);
    }
  }
  return null;
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
    const methodBlock = g.engineChange.length
      ? `<div style="margin:12px 0;padding:10px 12px;background:#FFF6E5;border-left:3px solid #B6863A;border-radius:6px;font-size:12px;color:#5A4A2A;line-height:1.6;">${esc(t.methodChange(g.engineChange.join('; ')))}</div>`
      : '';
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
       ${methodBlock}
       <table style="width:100%;border-collapse:collapse;margin-top:14px;">${engines}</table>
       <div style="font-size:12px;color:#6E625F;margin-top:8px;">${esc(t.highIntent)}: ${hi ? Math.round(hi.aigvr) : '–'} · ${esc(t.topOfMind)}: ${cur.topOfMind?.overallRate != null ? Math.round(cur.topOfMind.overallRate) + '%' : '–'}</div>`,
    );
  }

  // Citations block — deterministic, from the scorecard. Added per client
  // feedback (2026-08-06): split own vs third-party, name the URLs each
  // engine actually cited, and show source domains gained/lost vs last scan.
  let citationsBlock = '';
  if (cur) {
    const rank: any[] = cur.sourceAuthority?.ranking ?? [];
    if (rank.length) {
      // Round-3 corrections: (a) counts are PER-PERIOD from this scan's samples
      // (the cumulative cross-scan index is shown separately — mixing the two
      // denominators produced "57/597 unchanged yet 6 new/6 lost"); (b) only
      // retrieval engines count — parametric engines' answer-text URLs are
      // unverified generations (Claude "322 URLs" was that artifact).
      const RETRIEVAL = new Set(['Perplexity', 'Google AI Overview']);
      const brandDomains = new Set([...g.brandDomains, ...rank.filter((r) => r.isBrand).map((r) => r.domain)]);
      const domOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
      let own = 0, third = 0;
      const thirdCount = new Map<string, number>();
      const perEng = new Map<string, Map<string, number>>();
      for (const smp of cur.rawSamples ?? []) {
        if (!RETRIEVAL.has(smp.engine)) continue;
        for (const u of smp.citations ?? []) {
          const d = domOf(u); if (!d) continue;
          if (brandDomains.has(d)) own++;
          else { third++; thirdCount.set(d, (thirdCount.get(d) || 0) + 1); }
          if (!perEng.has(smp.engine)) perEng.set(smp.engine, new Map());
          const m = perEng.get(smp.engine)!;
          m.set(u, (m.get(u) || 0) + 1);
        }
      }
      const topThird = [...thirdCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([d, c]) => `<tr><td style="padding:4px 0;font-size:12.5px;color:#2A2024;">${esc(d)}</td><td style="padding:4px 0;font-size:12.5px;color:#6E625F;text-align:right;font-variant-numeric:tabular-nums;">${c}</td></tr>`)
        .join('');
      const engineRows = [...perEng.entries()]
        .map(([eng, m]) => {
          const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
            .map(([u]) => `<div style="font-size:11px;color:#9C8E8A;word-break:break-all;margin-top:2px;">${esc(u.slice(0, 96))}</div>`)
            .join('');
          return `<div style="margin-top:8px;"><span style="font-size:12.5px;color:#2A2024;font-weight:600;">${esc(eng)}</span><span style="font-size:12px;color:#6E625F;"> · ${m.size} URL (unique)</span>${top}</div>`;
        })
        .join('');
      let diffLine = '';
      const domainsOf = (sc: any): Set<string> => {
        const out = new Set<string>();
        for (const smp of sc?.rawSamples ?? []) {
          if (!RETRIEVAL.has(smp.engine)) continue;
          for (const u of smp.citations ?? []) { const d = domOf(u); if (d) out.add(d); }
        }
        return out;
      };
      const prevDomains = domainsOf(prev);
      if (prevDomains.size) {
        const curD = domainsOf(cur);
        const added = [...curD].filter((d) => !prevDomains.has(d)).slice(0, 6);
        const lost = [...prevDomains].filter((d) => !curD.has(d)).slice(0, 6);
        diffLine = `<div style="font-size:12px;color:#6E625F;margin-top:10px;line-height:1.6;"><strong>${esc(t.newCites)}</strong>: ${added.length ? esc(added.join(', ')) : '—'}<br/><strong>${esc(t.lostCites)}</strong>: ${lost.length ? esc(lost.join(', ')) : '—'}</div>`;
      }
      const cumOwn = g.indexTotals?.own ?? rank.filter((r) => r.isBrand).reduce((a, r) => a + (r.citations || 0), 0);
      const cumThird = g.indexTotals?.third ?? rank.filter((r) => !r.isBrand).reduce((a, r) => a + (r.citations || 0), 0);
      citationsBlock = sec(
        t.citationSection,
        `<div style="font-size:11px;letter-spacing:1px;color:#9C8E8A;text-transform:uppercase;">${esc(t.thisScan)}</div>
         <div style="font-size:12.5px;color:#2A2024;margin-top:4px;">${esc(t.ownDomain)}: <strong>${own}</strong> · ${esc(t.thirdParty)}: <strong>${third}</strong></div>
         <table style="width:100%;border-collapse:collapse;margin-top:8px;">${topThird}</table>
         <div style="font-size:11px;letter-spacing:1px;color:#9C8E8A;text-transform:uppercase;margin-top:12px;">${esc(t.citedByEngine)}</div>
         ${engineRows || '<div style="font-size:12px;color:#9C8E8A;margin-top:4px;">—</div>'}
         ${diffLine}
         <div style="font-size:11px;color:#9C8E8A;margin-top:10px;">${esc(t.cumulativeIdx)} — ${esc(t.ownDomain)} ${cumOwn} · ${esc(t.thirdParty)} ${cumThird}</div>`,
      );
    }
  }

  // Source-leverage block — deterministic, from the cumulative citation index
  // (S1). Two lists with opposite meanings: sources whose content carries the
  // brand, and category authorities the brand is absent from entirely. This is
  // the part of the digest a competitor cannot reproduce without the index.
  let leverageBlock = '';
  if (g.leverage) {
    const L = g.leverage;
    const row = (cells: string[], strongFirst = true) =>
      `<tr>${cells
        .map(
          (c, i) =>
            `<td style="padding:4px 0;font-size:12.5px;color:${i === 0 && strongFirst ? '#2A2024' : '#6E625F'};${i ? 'text-align:right;font-variant-numeric:tabular-nums;padding-left:10px;' : ''}">${c}</td>`,
        )
        .join('')}</tr>`;
    const head = (cells: string[]) =>
      `<tr>${cells
        .map((c, i) => `<td style="padding:0 0 4px;font-size:10.5px;letter-spacing:.5px;color:#9C8E8A;text-transform:uppercase;${i ? 'text-align:right;padding-left:10px;' : ''}">${esc(c)}</td>`)
        .join('')}</tr>`;
    const note = (text: string) =>
      `<p style="margin:6px 0 0;font-size:11.5px;color:#6E625F;line-height:1.6;">${esc(text)}</p>`;

    const carriersTable = L.carriers.length
      ? `<div style="font-size:12.5px;font-weight:600;color:#2A2024;margin-top:2px;">${esc(t.carriersTitle)}</div>
         <table style="width:100%;border-collapse:collapse;margin-top:6px;">
           ${head(['', t.colQuestions, t.colRatio])}
           ${L.carriers
             .map((r) =>
               row([
                 esc(r.domain),
                 `${r.winPrompts}${r.lossPrompts ? ` / ${r.lossPrompts}` : ''}`,
                 `${(r.win / (r.loss || 1)).toFixed(r.loss ? 1 : 0)}×`,
               ]),
             )
             .join('')}
         </table>
         ${note(t.carriersNote)}`
      : '';

    const gapsTable = L.gaps.length
      ? `<div style="font-size:12.5px;font-weight:600;color:#2A2024;margin-top:${L.carriers.length ? 18 : 2}px;">${esc(t.gapsTitle)}</div>
         <table style="width:100%;border-collapse:collapse;margin-top:6px;">
           ${head(['', t.colHiCites, t.colQuestions])}
           ${L.gaps
             .map(
               (r) =>
                 row([
                   `${esc(r.domain)}<div style="font-size:10.5px;color:#9C8E8A;margin-top:1px;">${esc(t.colHolders)}: ${esc(r.competitors.slice(0, 2).join(', ') || '—')}</div>`,
                   String(r.hiLoss),
                   String(r.lossPrompts),
                 ]),
             )
             .join('')}
         </table>
         ${note(t.gapsNote)}`
      : '';

    leverageBlock = sec(
      t.leverageSection,
      `<div style="font-size:11px;color:#9C8E8A;margin-bottom:10px;line-height:1.5;">${esc(
        t.leverageBasis(L.domains, L.observed, (L.since || '').slice(0, 10)),
      )}</div>${carriersTable}${gapsTable}`,
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
  const interpNotice = !interp
    ? `<div style="margin-top:22px;padding:10px 12px;background:#FBF3E4;border-radius:8px;font-size:12px;color:#8A6D3B;line-height:1.6;">${esc(t.interpUnavailable)}</div>`
    : '';
  const attributionBlock =
    interp && interp.attribution.length && g.stage !== 'build'
      ? sec(t.attributionSection, interp.attribution.map((p) => `<p style="margin:0 0 12px;font-size:13.5px;color:#2A2024;line-height:1.7;">${escProse(p)}</p>`).join(''))
      : '';
  const strategyBlock =
    interp && interp.strategy.length
      ? sec(
          t.strategySection,
          interp.strategy
            .map(
              (s) =>
                `<div style="margin-bottom:14px;"><div style="font-size:13.5px;font-weight:600;color:#2A2024;margin-bottom:3px;">${escProse(s.title)}</div><p style="margin:0;font-size:13px;color:#6E625F;line-height:1.65;">${escProse(s.detail)}</p></div>`,
            )
            .join(''),
        )
      : '';
  const cooperationBlock =
    interp && interp.cooperation.length
      ? sec(
          t.cooperationSection,
          `<ul style="margin:0;padding-left:18px;">${interp.cooperation.map((c) => `<li style="font-size:13px;color:#2A2024;margin-bottom:6px;line-height:1.5;">${escProse(c)}</li>`).join('')}</ul>`,
        )
      : '';

  // Provenance footer — the client is told the interpretation was machine-checked
  // against this project's own data, and how many claims survived.
  // Actions & outcomes — the loop the digest exists to close. Every figure is
  // a fraction from the project's own scans; nothing here is interpreted.
  const fmtWin = (w: { present: number; total: number }) => (w.total ? `${w.present}/${w.total}` : '—');
  const ivxBlock = g.interventions.list.length
    ? `<div style="margin-top:22px;"><div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8A7F78;margin-bottom:8px;">${esc(t.ivxSection)}</div>` +
      g.interventions.list.map((iv) => {
        const o = g.interventions.outcomes[iv.id];
        const head = `<div style="font-size:13px;color:#2B2B2B;"><strong>${esc(iv.kind.replace(/_/g, ' '))}</strong>${iv.title ? ` · ${esc(iv.title)}` : ''}${iv.url ? ` · <a href="${esc(iv.url)}" style="color:#C76B7A;">${esc(iv.domain ?? iv.url)}</a>` : ''} · ${esc(iv.published_at)}</div>`;
        if (!o) return `<div style="margin:0 0 10px;">${head}</div>`;
        if (o.awaiting) return `<div style="margin:0 0 10px;">${head}<div style="font-size:12px;color:#8A7F78;">${esc(t.ivxScans(o.scansBefore, o.scansAfter))} — ${esc(t.ivxAwaiting)}</div></div>`;
        const rows: string[] = [];
        for (const p of o.prompts) {
          rows.push(`<div style="font-size:12px;color:#4A4A4A;margin-top:4px;">“${esc(p.prompt.slice(0, 90))}” — ${esc(t.ivxPresence)}: ${p.engines.map((e) => `${esc(e.engine)} ${fmtWin(e.before)} → <strong>${fmtWin(e.after)}</strong>`).join(' · ')}</div>`);
        }
        if (o.domain) rows.push(`<div style="font-size:12px;color:#4A4A4A;margin-top:4px;">${esc(o.domain.domain)} — ${esc(t.ivxCited)}: ${esc(citesPerScan(o.domain.before.cites, o.scansBefore))} → <strong>${esc(citesPerScan(o.domain.after.cites, o.scansAfter))}</strong>${o.domain.after.engines.length ? ` (${o.domain.after.engines.map(esc).join(', ')})` : ''}</div>`);
        return `<div style="margin:0 0 12px;">${head}<div style="font-size:11px;color:#8A7F78;">${esc(t.ivxScans(o.scansBefore, o.scansAfter))}</div>${rows.join('')}</div>`;
      }).join('') +
      `<div style="font-size:10.5px;color:#9A9A9A;margin-top:6px;">${esc(t.ivxNote)}</div></div>`
    : '';

  const provenanceBlock =
    interp?.verification && interp.verification.checked
      ? `<div style="margin-top:22px;padding:10px 12px;background:#F3F6F3;border-left:3px solid #5B8266;border-radius:6px;font-size:11.5px;color:#4A5A4E;line-height:1.6;">${esc(
          t.provenance(interp.verification.checked, interp.verification.passed),
        )}</div>`
      : '';

  const workspaceUrl = `${APP_URL}/workspace/${g.orgSlug}/${g.projectSlug}`;

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#FBF7F4;font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="margin-bottom:18px;"><img src="${APP_URL}/email-logo.png" width="22" height="22" alt="MemeCMO" style="vertical-align:middle;border:0;border-radius:5px;"/><span style="font-size:11px;letter-spacing:3px;color:#9C8E8A;text-transform:uppercase;vertical-align:middle;margin-left:8px;">MemeCMO &middot; GEO</span></div>
    <div style="background:#FFFFFF;border:1px solid rgba(58,30,34,0.12);border-radius:14px;padding:28px;">
      <h1 style="margin:0 0 2px;font-size:18px;color:#2A2024;">${esc(g.project.brand_name)} &middot; ${esc(g.project.target_country)}</h1>
      <div style="font-size:12px;color:#9C8E8A;">${new Date().toISOString().slice(0, 10)}</div>
      ${g.currentMeta ? `<div style="font-size:10.5px;color:#9C8E8A;margin-top:2px;">Scan ${esc((g.currentMeta.at || '').slice(0, 10))} · #${esc(g.currentMeta.id.slice(0, 8))} · ${g.currentMeta.trigger === 'schedule' ? 'auto' : 'manual'} · n=${cur?.metrics?.overall?.queries ?? '–'} · panel ${cur?.sampled?.used ?? '–'}/${cur?.sampled?.total ?? '–'}${g.previousMeta ? ` · vs ${esc((g.previousMeta.at || '').slice(0, 10))} #${esc(g.previousMeta.id.slice(0, 8))} (${g.previousMeta.trigger === 'schedule' ? 'auto' : 'manual'})` : ''}</div>` : ''}
      ${scoreBlock}
      ${citationsBlock}
      ${leverageBlock}
      ${actionsBlock}
      ${interpNotice}
      ${attributionBlock}
      ${strategyBlock}
      ${cooperationBlock}
      ${ivxBlock}
      ${provenanceBlock}
      <div style="margin-top:26px;padding-top:16px;border-top:1px solid rgba(58,30,34,0.08);">
        <p style="margin:0 0 8px;font-size:12px;color:#6E625F;">${esc(t.fullReport)}</p>
        <a href="${workspaceUrl}" style="display:inline-block;background:#C76B7A;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:600;padding:10px 16px;border-radius:9px;">Workspace →</a>
      </div>
    </div>
    <div style="text-align:center;margin-top:20px;"><img src="${APP_URL}/email-logo-faint.png" width="44" height="44" alt="" style="border:0;"/></div>
    <p style="margin:10px 0 0;font-size:11px;color:#9C8E8A;text-align:center;">${esc(t.footer)}</p>
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
  if (g.engineChange.length) return { sent: false, reason: `engine model changed (${g.engineChange.join('; ')}) — movement is a measurement artefact` };

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
    <div style="margin-bottom:18px;"><img src="${APP_URL}/email-logo.png" width="22" height="22" alt="MemeCMO" style="vertical-align:middle;border:0;border-radius:5px;"/><span style="font-size:11px;letter-spacing:3px;color:#9C8E8A;text-transform:uppercase;vertical-align:middle;margin-left:8px;">MemeCMO &middot; GEO</span></div>
    <div style="background:#FFFFFF;border:1px solid rgba(166,75,75,0.35);border-radius:14px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:17px;color:#A64B4B;">${esc(t.alertSubject(g.project.brand_name))}</h1>
      ${lines.map((l) => `<p style="margin:0 0 10px;font-size:13.5px;color:#2A2024;line-height:1.65;">${esc(l)}</p>`).join('')}
      <a href="${APP_URL}/workspace/${g.orgSlug}/${g.projectSlug}" style="display:inline-block;margin-top:8px;background:#C76B7A;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:600;padding:10px 16px;border-radius:9px;">Workspace →</a>
    </div>
    <div style="text-align:center;margin-top:20px;"><img src="${APP_URL}/email-logo-faint.png" width="44" height="44" alt="" style="border:0;"/></div>
    <p style="margin:10px 0 0;font-size:11px;color:#9C8E8A;text-align:center;">${esc(t.footer)}</p>
  </div>
</body></html>`;

  const res = await sendEmail({ to: recipients, subject: t.alertSubject(g.project.brand_name), html });
  if (res.sent) {
    const metadata = { ...(g.project.metadata as any), reportSchedule: { ...g.schedule, lastAlertRunId: runId } };
    await sb.from('projects').update({ metadata }).eq('id', projectId);
  }
  return res;
}
