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
import { loadCollabAlignment, type CollabAlignment } from '@/lib/collab-alignment';
import { loadBrandProfile } from '@/lib/agents/run';
import { traceAffectedEngines, mostlyEmptyEngines, fetchRepairedEngines } from '@/lib/engines/ingest';
import { brandFactsCorpus, brandProfileBlock } from '@/lib/agents/brand-facts';
import type { CompetitorGroup } from '@/lib/agents/source-owners';
import {
  NOISE_BAND, isSeriesScan, selfNames, coreSplit, classifySource, sourceLane, quarterOf, scrub, figureCorpusOf, sentences,
  SOURCE_TYPE_LABEL, SOURCE_FIT_LABEL, type CoreSplit, type Frac, type SourceType,
} from './audit';

export type DigestStage = 'build' | 'optimize' | 'steady';
export type DigestLang = 'zh' | 'en' | 'vi';

export interface ReportSchedule {
  recipients?: string[];
  language?: DigestLang;
  kickoffAt?: string;
  stageOverride?: DigestStage;
  lastDigestAt?: string;
  lastAlertRunId?: string;
  // Opt-in per project: show the collaboration-alignment line (lib/collab-alignment).
  collabMetric?: boolean;
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
    actionsSection: '平台本期产出(草稿与扫描)',
    draftsNote: '以上是平台生成的草稿和扫描结果,尚未发布。只有贵方登记过的内容(平台上「记一条行动」,或群内 /hanhdong)才计为已发布的行动。',
    attributionSection: 'AI 解读',
    strategySection: '内容与分发建议',
    cooperationSection: '需要贵方确认或提供',
    partAudit: '一 · 测量结果(客观审计,任何一方都不作人工调整)',
    partInterp: '二 · AI 解读(逐条对照本项目扫描数据,带证据等级)',
    partSuggest: '三 · 建议(由贵方决定)',
    suggestNote: '以下是 AI 根据上面的测量结果和贵方提供的事实生成的建议。贵方可以修改,也可以不采纳;第一部分的数字不会因此改变。',
    scheduled: '排程', manual: '手动', scanWord: '扫描',
    compareLine: (date: string, id: string, score: number) => `对比基准:排程扫描 ${date} #${id}(${score})`,
    noBaseline: '还没有可比的上一次排程扫描,本期不显示涨跌。',
    withinNoise: `在 ±${NOISE_BAND} 的抽样噪声范围内`,
    notInterpreted: '含测量误差,不作涨跌解读(见下方说明)',
    unread: (engine: string, a: number, n: number) => `${engine} 只返回 ${a}/${n} 条回答`,
    totalInvalid: '总分无效',
    fetchNote: (e: string, a: number, b: number, n: number) => `* 取数说明:从本期扫描起,${e} 的取数方式已修正,之前因超时没取回的回答现在可以取回(上期 ${a}/${n} 条有内容,本期 ${b}/${n} 条)。所以 ${e} 本期与上期的读数不完全可比,本期不把它的变化解读为品牌表现的变化。`,
    emptyNote: (items: string, scope: 'both' | 'current' | 'previous') => {
      const w = scope === 'both' ? '本期和上期' : scope === 'current' ? '本期' : '上期';
      return `* 测量说明:${w}扫描中,${items}。没有返回的回答在计分时记作"品牌未出现",所以${w}该引擎的读数和总分不反映品牌的实际情况,本期不解读其涨跌。`;
    },
    ingestNote: (engines: string, scope: 'both' | 'current' | 'previous') => {
      const w = scope === 'both' ? '本期和上期' : scope === 'current' ? '本期' : '上期';
      return `* 测量说明:${engines} 的回答开头带有该引擎自己的搜索记录(搜索词和它找到的来源)。${w}扫描中,判分读到的是这段记录而不是回答正文,所以${w} ${engines} 的显著度、情感和出现率读数不可靠,总分里由它们决定的部分也受影响。本期不解读 ${engines} 和总分的涨跌。` +
        (scope === 'previous' ? '本期扫描已只对回答正文判分,并作为该引擎的新基线。' : '这个问题已修正:下一次扫描起只对回答正文判分,并以那一次作为该引擎的新基线。');
    },
    manualScans: (list: string) => `期内手动扫描(单独列出,不用于对比):${list}`,
    coreSection: '固定重点问题',
    coreLine: (q: number, uq: number, u: string, bq: number, b: string) => `${q} 个固定问题 · ${uq} 个不带品牌名:${u} · ${bq} 个带品牌名:${b}`,
    corePrev: (v: string) => `(上次 ${v})`,
    panelNote: (used: number | string, core: number) => `本次扫描共 ${used} 个问题,其中 ${core} 个固定、其余按期轮换。综合指数按全部问题计算;前后对比以固定问题为准。`,
    coreSeries: (list: string) => `最近几次排程扫描(不带品牌名的固定问题):${list}`,
    coreEngines: (list: string) => `按引擎(不带品牌名的固定问题,每题一条回答):${list}`,
    coreGapsTitle: '不带品牌名的重点问题:品牌未出现的回答', colQuestion: '问题', colPresence: '出现', colOthers: '回答中出现的其他品牌',
    srcType: '类型', srcFit: '与本行业的关系', srcHi: '高意图引用',
    lanePresence: '可考虑争取出现的来源(媒体类)', laneStudy: '仅用于研究 AI 所用信息结构的来源', laneUnknown: '尚未分类、需确认类型的来源',
    lanesNote: '按来源类型给出的建议;是否争取、争取哪些,由贵方决定。',
    engines: '分引擎表现',
    highIntent: '高意图问题得分',
    topOfMind: '首位提及率',
    citationSection: '引用源明细', ownDomain: '品牌自域', thirdParty: '第三方来源',
    leverageSection: '信源杠杆',
    ivxSection: '行动与结果', ivxAwaiting: '等待下一次扫描', ivxPresence: '目标问题上品牌在场', ivxCited: '被引用次数', ivxScans: (b: number, a: number) => `发布前 ${b} 次扫描 · 发布后 ${a} 次`, ivxNote: '口径:同一问题、同一引擎,发布日前后各次扫描中品牌在场的回答数 ÷ 该窗口内的回答数;引用次数为该域名在全部回答引用链接中出现的次数。',
    collabSection: '协作一致度(近 28 天)',
    collabValue: (trust: number, n: number, on: number) => `${trust.toFixed(2)} · 贵方署名更新 ${n} 条,其中 ${Math.round(on * 100)}% 落在重点 20 题上`,
    collabNone: '近 28 天平台上没有贵方署名的行动或答案修改,暂无法计算。每次发布后在平台上点"记一条行动"记录一次,即可计入。',
    collabGovernance: (f: number, s: number) => `另有治理类更新:事实修改 ${f} 条、问题/竞品集修改 ${s} 条(计入参与,不计入方向)。`,
    collabNeglected: '差距最大、本期尚无行动的问题',
    collabNote: '口径:以本期开始前最近一次扫描为基准,重点 20 题上每题的差距 = 1 − 提到品牌的回答 ÷ 该题回答数;贵方本期署名的行动与答案修改按题计量;两者的余弦相似度,负值记为 0(0 = 方向无关,1 = 完全一致)。仅计贵方账号,不含 MemeCMO 代录。',
    methodChange: (list: string) => `方法学变更:本期与上期对比的引擎中,底层模型发生了变化(${list})。这是供应商侧的模型更替,不是品牌表现的变化;该引擎的分数以本期为新基线,本期不解读其涨跌。`,
    provenance: (checked: number, passed: number, removed: number) =>
      `数据核验:本期解读共 ${checked} 条论断,逐条对照本项目扫描数据与引用索引核验,${passed} 条通过。未能核验的论断已降级或移除,不进入本报告。` +
      (removed ? `另有 ${removed} 句因含有扫描数据和贵方资料中都没有的数字、外部研究引用、已过去的时间或非报告用语,已整句删除。` : ''),
    leverageBasis: (domains: number, cites: number, since: string) =>
      `累计源库中 ${domains} 个第三方域名 · ${cites} 条带结果判定的引用 · 自 ${since}`,
    carriersTitle: '承载品牌的来源',
    carriersNote: '[实测] 这些来源被引用的回答里,品牌出现的比例高于平均。这是同时出现(共现),不代表因果。',
    gapsTitle: '纯引用缺口',
    gapsNote: '[实测] AI 引用这些来源的回答里提到了其他品牌,品牌出现 0 次。这里衡量的是检索频次,不代表来源的权威性或是否值得争取;来源类型见每行说明。',
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
    actionsSection: 'Produced by the platform this period (drafts and scans)',
    draftsNote: 'These are drafts and scan results the platform produced; none of them is published. Only what your team logs ("Log an action" on the platform, or /hanhdong in the group) counts as a published action.',
    attributionSection: 'AI interpretation',
    strategySection: 'Content and distribution suggestions',
    cooperationSection: 'For your team to confirm or provide',
    partAudit: 'Part 1 · Measurement (objective audit — not adjusted by anyone)',
    partInterp: 'Part 2 · AI interpretation (each claim checked against this project\'s scan data, with its evidence class)',
    partSuggest: 'Part 3 · Suggestions (your decision)',
    suggestNote: 'The suggestions below were generated by AI from the measurements above and the facts your team has given the platform. You may edit or ignore them; the figures in Part 1 do not change either way.',
    scheduled: 'scheduled', manual: 'manual', scanWord: 'Scan',
    compareLine: (date: string, id: string, score: number) => `Compared with: scheduled scan ${date} #${id} (${score})`,
    noBaseline: 'There is no comparable earlier scheduled scan yet, so no movement is shown.',
    withinNoise: `within the ±${NOISE_BAND} sampling-noise band`,
    notInterpreted: 'includes a measurement error, not read as a rise or fall (see note below)',
    unread: (engine: string, a: number, n: number) => `${engine} returned ${a} of ${n} answers`,
    totalInvalid: 'total not valid',
    fetchNote: (e: string, a: number, b: number, n: number) => `* Retrieval note: from this scan on, answers from ${e} that used to be lost to a time limit are retrieved (previous scan ${a} of ${n} with content, this scan ${b} of ${n}). ${e}'s reading is therefore not fully comparable with the previous scan, and its change is not read as a change in the brand's performance in this issue.`,
    emptyNote: (items: string, scope: 'both' | 'current' | 'previous') => {
      const w = scope === 'both' ? 'this scan and the previous one' : scope === 'current' ? 'this scan' : 'the previous scan';
      return `* Measurement note: in ${w}, ${items}. An answer that was not returned is scored as "brand absent", so that engine's readings and the overall score for ${w} do not describe the brand, and their movement is not interpreted in this issue.`;
    },
    ingestNote: (engines: string, scope: 'both' | 'current' | 'previous') => {
      const w = scope === 'both' ? 'this scan and the previous one' : scope === 'current' ? 'this scan' : 'the previous scan';
      return `* Measurement note: answers from ${engines} begin with the engine's own search log (its query and the sources it found). In ${w} our scoring read that log instead of the answer, so the prominence, sentiment and presence readings for ${engines} in ${w} are not reliable, and neither is the part of the overall score that depends on them. Movement on ${engines} and on the overall score is not interpreted in this issue. ` +
        (scope === 'previous' ? `This scan was scored on the answer text only and is the new baseline for ${engines}.` : `This has been corrected: from the next scan on, only the answer text is scored, and that scan becomes the new baseline for ${engines}.`);
    },
    manualScans: (list: string) => `Manual scans this period (listed separately, not used for comparison): ${list}`,
    coreSection: 'Fixed key questions',
    coreLine: (q: number, uq: number, u: string, bq: number, b: string) => `${q} fixed questions · ${uq} without the brand name: ${u} · ${bq} with the brand name: ${b}`,
    corePrev: (v: string) => ` (previous ${v})`,
    panelNote: (used: number | string, core: number) => `This scan asked ${used} questions: ${core} fixed, the rest rotating. The index is computed on all of them; before/after comparison uses the fixed questions.`,
    coreSeries: (list: string) => `Recent scheduled scans (fixed questions without the brand name): ${list}`,
    coreEngines: (list: string) => `By engine (fixed questions without the brand name, one answer per question): ${list}`,
    coreGapsTitle: 'Key questions without the brand name: answers where the brand is absent', colQuestion: 'Question', colPresence: 'Present', colOthers: 'Other brands in the answers',
    srcType: 'Type', srcFit: 'Relation to this business', srcHi: 'High-intent citations',
    lanePresence: 'Sources where presence could be considered (media)', laneStudy: 'Sources to study only for the information structure AI uses', laneUnknown: 'Unclassified sources — type to be confirmed',
    lanesNote: 'A suggestion by source type; whether to pursue any of them is your decision.',
    engines: 'Per-engine performance',
    highIntent: 'High-intent score',
    topOfMind: 'Top-of-mind rate',
    citationSection: 'Citation sources', ownDomain: 'Brand-owned', thirdParty: 'Third-party',
    leverageSection: 'Source leverage',
    ivxSection: 'Actions and what moved', ivxAwaiting: 'awaiting the next scan', ivxPresence: 'brand present on the targeted question', ivxCited: 'times cited', ivxScans: (b: number, a: number) => `${b} scans before publishing · ${a} after`, ivxNote: 'Method: same question, same engine — answers naming the brand ÷ answers in the window before vs after the publish date; "times cited" counts the domain across all answer links.',
    collabSection: 'Collaboration alignment (last 28 days)',
    collabValue: (trust: number, n: number, on: number) => `${trust.toFixed(2)} · ${n} update(s) signed by your team, ${Math.round(on * 100)}% on the Core 20 questions`,
    collabNone: 'No actions or answer edits signed by your team on the platform in the last 28 days, so alignment cannot be computed yet. Logging each publication once ("Log an action") makes it count.',
    collabGovernance: (f: number, s: number) => `Governance updates: ${f} fact edit(s), ${s} prompt/competitor-set edit(s) (count as participation, not direction).`,
    collabNeglected: 'Largest gaps with no action yet',
    collabNote: 'Method: baseline = the last scan before the period; per Core 20 question, gap = 1 − answers naming the brand ÷ answers on that question; your team\'s signed actions and answer edits are counted per question; the score is the cosine of the two, negatives set to 0 (0 = unrelated direction, 1 = fully aligned). Your accounts only; MemeCMO proxy entries excluded.',
    methodChange: (list: string) => `Methodology change: the model behind one or more engines changed between the two scans compared (${list}). This is a provider-side model replacement, not a change in brand performance; that engine's score resets its baseline this issue and its movement is not interpreted.`,
    provenance: (checked: number, passed: number, removed: number) =>
      `Verification: ${checked} claims in this issue were each checked against this project's own scan data and citation index; ${passed} passed. Claims that could not be verified were demoted or removed and do not appear above.` +
      (removed ? ` A further ${removed} sentence(s) were deleted whole because they carried a figure found in neither the scan data nor your own material, cited outside research, named a period already past, or used wording that does not belong in a report.` : ''),
    leverageBasis: (domains: number, cites: number, since: string) =>
      `${domains} third-party domains in the cumulative index · ${cites} outcome-tagged citations · since ${since}`,
    carriersTitle: 'Sources that carry the brand',
    carriersNote: '[Observed] In answers that cite these sources the brand appears more often than average. This is co-occurrence, not cause.',
    gapsTitle: 'Pure citation gaps',
    gapsNote: '[Observed] Answers citing these sources name other brands and the brand appears zero times. This measures retrieval frequency; it says nothing about a source\'s authority or whether it is worth pursuing — see the source type on each row.',
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
    actionsSection: 'Nền tảng tạo trong kỳ (bản nháp và lần quét)',
    draftsNote: 'Đây là bản nháp và kết quả quét do nền tảng tạo, chưa được đăng. Chỉ nội dung do đội ngũ Quý công ty ghi lại ("Ghi một hành động" trên nền tảng, hoặc /hanhdong trong nhóm) mới được tính là hành động đã đăng.',
    attributionSection: 'Diễn giải của AI',
    strategySection: 'Gợi ý nội dung và phân phối',
    cooperationSection: 'Cần Quý công ty xác nhận hoặc cung cấp',
    partAudit: 'Phần 1 · Số đo (kiểm toán khách quan, không bên nào chỉnh tay)',
    partInterp: 'Phần 2 · Diễn giải của AI (từng luận điểm đã đối chiếu với dữ liệu quét, có nhãn mức bằng chứng)',
    partSuggest: 'Phần 3 · Gợi ý (Quý công ty quyết định)',
    suggestNote: 'Các gợi ý dưới đây do AI tạo từ số đo ở trên và dữ kiện Quý công ty đã cung cấp cho nền tảng. Quý công ty có thể chỉnh sửa hoặc không dùng; số đo ở Phần 1 không thay đổi theo lựa chọn này.',
    scheduled: 'định kỳ', manual: 'thủ công', scanWord: 'Lần quét',
    compareLine: (date: string, id: string, score: number) => `Mốc so sánh: lần quét định kỳ ${date} #${id} (${score})`,
    noBaseline: 'Chưa có lần quét định kỳ trước đó để so sánh, nên kỳ này không hiển thị mức tăng giảm.',
    withinNoise: `trong biên nhiễu lấy mẫu ±${NOISE_BAND}`,
    notInterpreted: 'có sai số đo lường, không diễn giải là tăng hay giảm (xem lưu ý bên dưới)',
    unread: (engine: string, a: number, n: number) => `${engine} chỉ trả về ${a}/${n} câu trả lời`,
    totalInvalid: 'điểm tổng không hợp lệ',
    fetchNote: (e: string, a: number, b: number, n: number) => `* Lưu ý thu thập: từ lần quét này, các câu trả lời của ${e} trước đây bị mất do giới hạn thời gian nay đã thu được (lần trước ${a}/${n} câu có nội dung, lần này ${b}/${n}). Vì vậy số đo của ${e} ở lần này chưa hoàn toàn so sánh được với lần trước, và kỳ này không diễn giải thay đổi của engine này là thay đổi về hiệu quả thương hiệu.`,
    emptyNote: (items: string, scope: 'both' | 'current' | 'previous') => {
      const w = scope === 'both' ? 'lần quét này và lần quét trước' : scope === 'current' ? 'lần quét này' : 'lần quét trước';
      return `* Lưu ý đo lường: ở ${w}, ${items}. Câu trả lời không nhận được bị tính là "thương hiệu không xuất hiện", nên số đo của engine này và điểm tổng ở ${w} không phản ánh thương hiệu; kỳ này không diễn giải biến động của chúng.`;
    },
    ingestNote: (engines: string, scope: 'both' | 'current' | 'previous') => {
      const w = scope === 'both' ? 'lần quét này và lần quét trước' : scope === 'current' ? 'lần quét này' : 'lần quét trước';
      return `* Lưu ý đo lường: câu trả lời của ${engines} mở đầu bằng nhật ký tìm kiếm của chính engine (từ khóa và các nguồn engine tìm được). Ở ${w}, phần chấm điểm đã đọc nhật ký này thay vì nội dung câu trả lời, nên các số đo về mức nổi bật, sắc thái và tỷ lệ xuất hiện của ${engines} ở ${w} chưa đáng tin cậy, và phần điểm tổng phụ thuộc vào các số đo đó cũng bị ảnh hưởng. Kỳ này không diễn giải biến động của ${engines} và của điểm tổng. ` +
        (scope === 'previous' ? `Lần quét này đã chỉ chấm trên nội dung câu trả lời và là mốc mới cho ${engines}.` : `Lỗi này đã được sửa: từ lần quét tới, hệ thống chỉ chấm trên nội dung câu trả lời và lấy lần quét đó làm mốc mới cho ${engines}.`);
    },
    manualScans: (list: string) => `Lần quét thủ công trong kỳ (ghi riêng, không dùng để so sánh): ${list}`,
    coreSection: 'Câu hỏi trọng điểm cố định',
    coreLine: (q: number, uq: number, u: string, bq: number, b: string) => `${q} câu cố định · ${uq} câu không nêu tên thương hiệu: ${u} · ${bq} câu có tên thương hiệu: ${b}`,
    corePrev: (v: string) => ` (lần trước ${v})`,
    panelNote: (used: number | string, core: number) => `Lần quét này có ${used} câu hỏi: ${core} câu cố định, còn lại luân phiên theo kỳ. Chỉ số tổng hợp tính trên toàn bộ câu hỏi; so sánh trước–sau dùng các câu cố định.`,
    coreSeries: (list: string) => `Các lần quét định kỳ gần nhất (câu cố định không nêu tên thương hiệu): ${list}`,
    coreEngines: (list: string) => `Theo engine (câu cố định không nêu tên thương hiệu, mỗi câu một câu trả lời): ${list}`,
    coreGapsTitle: 'Câu trọng điểm không nêu tên thương hiệu: các câu trả lời chưa có thương hiệu', colQuestion: 'Câu hỏi', colPresence: 'Xuất hiện', colOthers: 'Thương hiệu khác trong câu trả lời',
    srcType: 'Loại nguồn', srcFit: 'Quan hệ với ngành', srcHi: 'Trích dẫn ý định cao',
    lanePresence: 'Nguồn có thể cân nhắc hiện diện (báo chí, trang chuyên ngành)', laneStudy: 'Nguồn chỉ nên nghiên cứu cấu trúc thông tin AI đang dùng', laneUnknown: 'Nguồn chưa phân loại, cần xác nhận loại nguồn',
    lanesNote: 'Gợi ý theo loại nguồn; có theo đuổi hay không, và nguồn nào, do Quý công ty quyết định.',
    engines: 'Hiệu suất theo từng engine',
    highIntent: 'Điểm câu hỏi ý định cao',
    topOfMind: 'Tỷ lệ nhắc đến đầu tiên',
    citationSection: 'Nguồn trích dẫn', ownDomain: 'Tên miền thương hiệu', thirdParty: 'Nguồn bên thứ ba',
    leverageSection: 'Đòn bẩy nguồn trích dẫn',
    ivxSection: 'Hành động và kết quả', ivxAwaiting: 'chờ lần quét tiếp theo', ivxPresence: 'thương hiệu xuất hiện ở câu hỏi mục tiêu', ivxCited: 'lần được trích dẫn', ivxScans: (b: number, a: number) => `${b} lần quét trước khi đăng · ${a} lần sau`, ivxNote: 'Chuẩn đo: cùng câu hỏi, cùng engine — số câu trả lời có nhắc thương hiệu ÷ số câu trả lời trong cửa sổ trước và sau ngày đăng; "lần được trích dẫn" đếm tên miền trong mọi liên kết được trích.',
    collabSection: 'Mức đồng hướng phối hợp (28 ngày gần nhất)',
    collabValue: (trust: number, n: number, on: number) => `${trust.toFixed(2)} · ${n} cập nhật có ghi tên đội ngũ Quý công ty, ${Math.round(on * 100)}% thuộc 20 câu hỏi trọng tâm`,
    collabNone: 'Trong 28 ngày qua chưa có hành động hay chỉnh sửa câu trả lời nào do đội ngũ Quý công ty ghi trên nền tảng, nên chưa tính được. Mỗi lần đăng bài, ghi lại một lần ("Ghi một hành động") là được tính.',
    collabGovernance: (f: number, s: number) => `Cập nhật quản trị: ${f} chỉnh sửa dữ kiện, ${s} chỉnh sửa bộ câu hỏi/đối thủ (tính vào mức tham gia, không tính vào hướng).`,
    collabNeglected: 'Các câu hỏi có khoảng trống lớn nhất nhưng chưa có hành động',
    collabNote: 'Chuẩn đo: lấy lần quét gần nhất trước kỳ làm mốc; với mỗi câu trong 20 câu trọng tâm, khoảng trống = 1 − số câu trả lời nhắc thương hiệu ÷ số câu trả lời của câu đó; hành động và chỉnh sửa có ghi tên của Quý công ty được tính theo từng câu; điểm là cosin giữa hai vectơ, giá trị âm tính là 0 (0 = không cùng hướng, 1 = hoàn toàn cùng hướng). Chỉ tính tài khoản của Quý công ty, không tính phần MemeCMO ghi hộ.',
    methodChange: (list: string) => `Thay đổi phương pháp: mô hình nền của một hoặc nhiều engine đã thay đổi giữa hai lần quét được so sánh (${list}). Đây là việc nhà cung cấp thay mô hình, không phải thay đổi trong hiệu suất thương hiệu; điểm của engine đó lấy kỳ này làm mốc mới và không diễn giải biến động.`,
    provenance: (checked: number, passed: number, removed: number) =>
      `Kiểm chứng: ${checked} luận điểm trong kỳ này đã được đối chiếu với dữ liệu quét và kho nguồn trích dẫn của chính dự án; ${passed} luận điểm đạt. Những luận điểm không kiểm chứng được đã bị hạ cấp hoặc loại bỏ, không xuất hiện ở trên.` +
      (removed ? ` Ngoài ra, ${removed} câu đã bị xóa hẳn vì chứa số liệu không có trong dữ liệu quét lẫn tài liệu của Quý công ty, dẫn nghiên cứu bên ngoài, nêu mốc thời gian đã qua, hoặc dùng từ ngữ không thuộc về báo cáo.` : ''),
    leverageBasis: (domains: number, cites: number, since: string) =>
      `${domains} tên miền bên thứ ba trong kho nguồn tích lũy · ${cites} trích dẫn đã gắn kết quả · từ ${since}`,
    carriersTitle: 'Nguồn đang mang thương hiệu',
    carriersNote: '[Đo được] Ở các câu trả lời có trích dẫn những nguồn này, thương hiệu xuất hiện nhiều hơn mức trung bình. Đây là đồng xuất hiện, không phải quan hệ nhân quả.',
    gapsTitle: 'Khoảng trống trích dẫn hoàn toàn',
    gapsNote: '[Đo được] Các câu trả lời trích dẫn những nguồn này có nhắc thương hiệu khác, còn thương hiệu xuất hiện 0 lần. Đây là tần suất truy xuất, chưa nói lên uy tín của nguồn hay việc có nên giành hiện diện; xem loại nguồn ở từng dòng.',
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
  previous: any | null;  // the scheduled scan before it — null when nothing comparable exists
  // Scans run by hand since the baseline: reported on their own line, never compared.
  manualScans: { id: string; at: string | null; agent: string; score: number | null; unread: Unread[] }[];
  // Brand presence on the fixed key questions (the rest of the panel rotates).
  core: CoreSplit | null;
  coreSeries: { at: string | null; unbranded: Frac; flagged?: boolean }[]; // oldest first, scheduled scans only; flagged = scored on a search log
  // What each leverage domain IS — kept apart from how often it is cited.
  sourceTypes: Record<string, SourceType>;
  brandProfile: any | null;      // canonical facts + uploaded documents (the client's Business Truth)
  groups: CompetitorGroup[];     // who is the brand itself and who is a competitor
  // Engines whose underlying model differs between the two scans compared.
  // A provider retiring a bot (Poe: Gemini-2.5-Pro → 3.1-Pro, 2026-09-16)
  // changes the measurement, not the brand — the digest must say so, the
  // attribution model must not read it as movement, and the alert must not
  // fire on it.
  engineChange: string[];
  // Engines whose answers, in either scan compared, were scored on the engine's
  // search log instead of the answer (scans taken before lib/engines/ingest
  // removed the log). Same consequences as an engine change: the digest says
  // so, the model must not read the movement, the alert must not fire.
  ingestIssue: {
    engines: string[]; current: string[]; scope: Scope;
    log: { engines: string[]; scope: Scope } | null;      // scored on the engine's search log
    empty: { list: Unread[]; scope: Scope } | null;       // most answers never came back
  } | null;
  // The fixed questions counted on the engines that were read correctly in the
  // current scan — what the interpretation may reason from when one was not.
  coreReliable: CoreSplit | null;
  // Engines whose fetch was repaired between the two scans compared: more answers come back now.
  fetchRepaired: { engine: string; before: number; now: number; total: number }[];
  // What the client put into the world (last 90 days) and what the engines
  // did after — the causal half of the loop, computed from the scans.
  interventions: { list: Intervention[]; outcomes: Record<string, Outcome> };
  // Opt-in (schedule.collabMetric): client team's alignment with the measured gaps.
  collab: CollabAlignment | null;
  actions: { label: string; summary: string; at: string }[];
  latestReport: any | null; // Report-agent output completed within 7 days, if any
  brandDomains: Set<string>;
  leverage: LeverageInsight | null;
  indexTotals: { own: number; third: number } | null;
  truth: GroundTruth;
  sb: SupabaseClient;
  projectId: string;
}

type Scope = 'both' | 'current' | 'previous';
type Unread = { engine: string; answered: number; total: number };
const scopeOf = (cur: unknown[], prev: unknown[]): Scope => (cur.length && prev.length ? 'both' : cur.length ? 'current' : 'previous');

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

function ingestIssueOf(cur: any, prev: any): GatherResult['ingestIssue'] {
  const la = traceAffectedEngines(cur), lb = traceAffectedEngines(prev);
  const ea = mostlyEmptyEngines(cur), eb = mostlyEmptyEngines(prev);
  if (!la.length && !lb.length && !ea.length && !eb.length) return null;
  const current = [...new Set([...la, ...ea.map((x) => x.engine)])];
  const previous = [...new Set([...lb, ...eb.map((x) => x.engine)])];
  return {
    engines: [...new Set([...current, ...previous])],
    current,
    scope: scopeOf(current, previous),
    log: la.length || lb.length ? { engines: [...new Set([...la, ...lb])], scope: scopeOf(la, lb) } : null,
    // One line per engine: the current scan's count when it is affected, else the previous one's.
    empty: ea.length || eb.length ? { list: [...ea, ...eb.filter((x) => !ea.some((y) => y.engine === x.engine))], scope: scopeOf(ea, eb) } : null,
  };
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

  // Like for like: the weekly series is the SCHEDULED scans. 2026-10-03 the
  // digest took "the two latest scans" and compared a scheduled scan (66) with
  // one a client had run by hand four days earlier (60) — a "+6" that was +3
  // against the real baseline. A manual scan is listed, never compared.
  const scanQuery = () =>
    sb
      .from('agent_runs')
      .select('id, agent_id, output, completed_at, trigger_method')
      .eq('project_id', projectId)
      .in('agent_id', ['monitor', 'full_scan'])
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });
  const { data: series } = await scanQuery().eq('trigger_method', 'schedule').limit(5);
  let scorecards = (series ?? []).map((r) => ({ ...r, sc: toScorecard(r.output) })).filter((r) => r.sc);
  if (!scorecards.length) {
    // A project with no scheduled scan yet: show its latest scan, compare nothing.
    const { data: any1 } = await scanQuery().neq('trigger_method', 'diagnostic').limit(1);
    scorecards = (any1 ?? []).map((r) => ({ ...r, sc: toScorecard(r.output) })).filter((r) => r.sc);
  }
  const { count: scanCount } = await sb
    .from('agent_runs')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .in('agent_id', ['monitor', 'full_scan'])
    .eq('status', 'completed')
    .neq('trigger_method', 'diagnostic');
  // Spot checks are listed once: those run since the last digest went out. (Counting from the
  // previous scheduled scan listed the three re-scans of 2026-10-09 a second time a week later.)
  const baselineAt = schedule.lastDigestAt ?? scorecards[1]?.completed_at ?? new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: manual } = await sb
    .from('agent_runs')
    .select('id, agent_id, completed_at, trigger_method, score:output->aigvrScore, samples:output->rawSamples')
    .eq('project_id', projectId)
    .in('agent_id', ['monitor', 'full_scan'])
    .eq('status', 'completed')
    .not('trigger_method', 'in', '(schedule,diagnostic)')
    .gt('completed_at', baselineAt)
    .order('completed_at', { ascending: false })
    .limit(5);
  const manualScans = (manual ?? [])
    .filter((r: any) => r.id !== scorecards[0]?.id)
    .map((r: any) => ({ id: String(r.id), at: r.completed_at ?? null, agent: String(r.agent_id), score: typeof r.score === 'number' ? r.score : null, unread: mostlyEmptyEngines({ rawSamples: r.samples }) }));

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
      // recent is ascending → last write wins. Run summaries are English working
      // notes ("Drafted … (1096 words, 6 FAQ + FAQPage schema) in Vietnamese
      // targeting…"); in a non-English report only the quoted title is shown.
      summary: lang === 'en' ? String(r.summary || '').slice(0, 200) : (String(r.summary || '').match(/["“]([^"”]{8,160})["”]/)?.[1] ?? ''),
      at: r.completed_at,
    });
  }
  const actions = [...byAgent.entries()].map(([agentId, v]) => ({
    label: ACTION_LABELS[agentId][lang] + (v.count > 1 ? ` ×${v.count}` : ''),
    summary: v.summary,
    at: v.at,
  }));

  // Only the Report agent's own run. The report bundled in a manual full scan
  // describes that scan, not the series — folding it in put "AIGVR 60" next to
  // the digest's 66 with nothing to connect them (2026-10-03).
  const freshReport = (recent ?? []).find((r) => r.agent_id === 'report');
  const latestReport = freshReport ? freshReport.output : null;

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

  // What each leverage domain is, from the titles of its pages the engines
  // cited — never from how often it is cited.
  const groups: CompetitorGroup[] = ((project.metadata as any)?.competitorSet?.groups ?? []) as CompetitorGroup[];
  const sourceTypes: Record<string, SourceType> = {};
  if (leverage) {
    const hosts = [...leverage.carriers, ...leverage.gaps].map((r) => r.domain.replace(/^www\./, '').toLowerCase());
    const titles = new Map<string, string[]>();
    const { data: pages } = await sb.from('geo_pages').select('domain, title').in('domain', [...hosts, ...hosts.map((h) => `www.${h}`)]).eq('ok', true).limit(1500);
    for (const pg of pages ?? []) {
      const h = String((pg as any).domain || '').replace(/^www\./, '').toLowerCase();
      if ((pg as any).title) titles.set(h, [...(titles.get(h) ?? []), String((pg as any).title)]);
    }
    for (const h of hosts) {
      sourceTypes[h] = classifySource(h, titles.get(h) ?? [], { groups, brandDomains, overrides: (project.metadata as any)?.sourceTypes ?? null });
    }
  }

  const brandProfile = await loadBrandProfile(sb as any, projectId).catch(() => null);
  const corePrompts: string[] = Array.isArray((project.metadata as any)?.coreKeyPrompts) ? (project.metadata as any).coreKeyPrompts : [];
  const names = selfNames(project.brand_name, project.target_country, groups);
  const core = corePrompts.length ? coreSplit(scorecards[0]?.sc, scorecards[1]?.sc ?? null, corePrompts, names) : null;
  const ingestIssue = ingestIssueOf(scorecards[0]?.sc, scorecards[1]?.sc);
  const misread = new Set(ingestIssue?.current ?? []);
  const coreReliable = core && misread.size
    ? coreSplit({ rawSamples: ((scorecards[0]?.sc?.rawSamples ?? []) as any[]).filter((x) => !misread.has(String(x.engine))) }, null, corePrompts, names)
    : null;
  // One previous value invites a "4 → 9" reading that the series does not
  // support (FMVN: 7, 7, 9, 4, 9 — a dip and a return, not a rise).
  const coreSeries = core && scorecards.some((r) => isSeriesScan(r as any))
    ? scorecards
        .map((r) => ({ at: r.completed_at as string | null, split: coreSplit(r.sc, null, corePrompts, names), flagged: traceAffectedEngines(r.sc).length > 0 }))
        .filter((x) => x.split)
        .map((x) => ({ at: x.at, unbranded: x.split!.unbranded, flagged: x.flagged }))
        .reverse()
    : [];

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
  const collab = schedule.collabMetric
    ? await loadCollabAlignment(sb, projectId, new Date(Date.now() - 28 * 86400e3), new Date()).catch((e) => {
        console.error('[digest] collab alignment failed:', e instanceof Error ? e.message : e);
        return null;
      })
    : null;
  const truth: GroundTruth = {
    domains: new Set<string>(),
    engines: new Set<string>((current?.engines ?? (current?.metrics?.perEngine ?? []).map((e: any) => e.engine)) as string[]),
    // Outcome figures are legitimate observations — the gate must accept them.
    figures: figuresFromScorecard(current, [
      ...leverageFigures,
      ...outcomeFigures(actionOutcomes),
      ...(core ? [core.unbranded.present, core.unbranded.total, core.branded.present, core.branded.total, ...core.gaps.flatMap((x) => [x.now.present, x.now.total])] : []),
      ...(core?.before ? [core.before.unbranded.present, core.before.branded.present] : []),
      ...(core ? core.unbrandedByEngine.flatMap((e) => [e.present, e.total]) : []),
      ...(coreReliable ? [coreReliable.unbranded.present, coreReliable.unbranded.total, coreReliable.branded.present, coreReliable.branded.total, ...coreReliable.gaps.flatMap((x) => [x.now.present, x.now.total]), ...coreReliable.unbrandedByEngine.flatMap((e) => [e.present, e.total])] : []),
      // Figures of the comparable previous scan are observations as well.
      ...[...figuresFromScorecard(scorecards[1]?.sc ?? null)].map(Number),
    ]),
  };

  return {
    project,
    orgSlug: org?.slug || '',
    projectSlug: project.slug,
    scoreLabel: org?.metadata?.scoreLabel || 'AI Mindset Index',
    schedule,
    stage: deriveStage(schedule, scanCount ?? scorecards.length),
    current: scorecards[0]?.sc ?? null,
    previous: scorecards[1]?.sc ?? null,
    engineChange: engineModelChanges(scorecards[0]?.sc, scorecards[1]?.sc),
    ingestIssue,
    coreReliable,
    fetchRepaired: fetchRepairedEngines(scorecards[0]?.sc, scorecards[1]?.sc),
    interventions: { list: actionList, outcomes: actionOutcomes },
    collab,
    currentMeta: scorecards[0] ? { id: scorecards[0].id, at: scorecards[0].completed_at, trigger: (scorecards[0] as any).trigger_method } : null,
    previousMeta: scorecards[1] ? { id: scorecards[1].id, at: scorecards[1].completed_at, trigger: (scorecards[1] as any).trigger_method } : null,
    manualScans,
    core,
    coreSeries,
    sourceTypes,
    brandProfile,
    groups,
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

// How a suggestion may treat a source, by what the source is.
const SOURCE_USE = {
  presence: 'an editorial venue — publishing there may be suggested',
  study: 'study only — never suggest publishing, a listing or outreach there',
  unclassified: 'not yet classified — do not suggest anything about it',
} as const;

// The model likes to invent a fourth tag for facts from the client's material
// ("[Brand Facts]", "[theo Brand Facts]", "[Observed từ BRAND FACTS]"). One plain
// phrase instead, in the report's language.
const BRAND_FACT_TAG_RE = /\[\s*(?:(?:Observed|Inferred|Đo\s*được|Suy\s*luận|实测|推断)\s+)?(?:theo|từ|from|per|来自|根据|据)?\s*(?:the\s+)?brand\s*facts?[^\]]*\]/giu;
const FROM_CLIENT: Record<DigestLang, string> = { zh: '(据贵方资料)', en: '(per your own material)', vi: '(theo tài liệu của Quý công ty)' };

// Words that belong to this prompt, not to a client report. A sentence that
// repeats one of them is the model quoting its instructions (2026-10-03 preview:
// "presenceMayBeSuggested = false", "[Observed từ BRAND FACTS]").
const PROMPT_WORDS_RE = /sourcesCited\w*|otherBrandsInThoseAnswers|questionsWith\w*|lastScheduledScans\w*|everyQuestion\w*|presentOnEngines|exampleGaps|fixedQuestions|withoutBrandName|withBrandName|previousScan|perIntent|perEngine|brandHits|topCompetitors|topOfMind|presenceRate|overallRate|aigvr\w+|\b(?:high|mid|low)_intent\b|BRAND FACTS|SOURCE LEVERAGE|PLATFORM DRAFTS|CLIENT ACTIONS|FIXED KEY QUESTIONS|"use"|"kind"/u;

function buildInterpretationPrompt(g: GatherResult): { sys: string; user: string } {
  const lang = g.schedule.language || 'en';
  const cur = g.current;
  const prev = g.previous;
  const brief = (sc: any, mask: Set<string> = new Set()) =>
    sc
      ? {
          // Every all-engine aggregate contains the masked engine's answers.
          ...(mask.size
            ? { aggregates: 'overall score, dimension scores, intent-class scores and first-mention rate are withheld this scan: they include an engine whose reading is not reliable. Do not state or discuss them.' }
            : { score: sc.aigvrScore, dims: sc.metrics?.overall, perIntent: sc.metrics?.perIntent, topOfMind: sc.topOfMind?.overallRate }),
          perEngine: (sc.metrics?.perEngine ?? []).map((e: any) => (mask.has(e.engine) ? { engine: e.engine, note: UNRELIABLE } : { engine: e.engine, score: e.aigvr, presence: e.presenceRate })),
          ...(mask.size ? {} : { topCompetitors: (sc.competitors ?? sc.competitorAnalysis?.competitors ?? []).slice(0, 5) }),
          // A SAMPLE. Passed as "gaps", the model counted it ("6/6 gaps") and
          // concluded that engines missing from the sample had none.
          exampleGaps: mask.size ? undefined : { note: `first ${Math.min(6, (sc.gaps ?? []).length)} of ${(sc.gaps ?? []).length} — examples only`, items: (sc.gaps ?? []).slice(0, 6) },
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

  const today = new Date();
  const sys =
    'You are a senior GEO (Generative Engine Optimization) analyst writing two clearly separate parts of a client report: ' +
    'an INTERPRETATION of the measurements, and SUGGESTIONS. ' +
    `Write in ${LANG_NAME[lang]}. Detailed, specific, evidence-based prose — no hype, no vague consulting filler. ` +
    'Never mention internal tooling or vendors; refer to engines by their public names. ' +
    'EVIDENCE DISCIPLINE (client-agreed reporting standard): tag every claim with one of ' +
    '[Observed] (directly measured this scan), [Inferred] (reasoned from measured data), or [Hypothesis] (plausible, unverified). ' +
    `Score movements within ±${NOISE_BAND} points on an unchanged corpus are sampling noise — never present them as improvement or decline. ` +
    'NEVER attribute a metric change to a cause (PR, engine behavior change, competitor investment) unless the supporting evidence ' +
    'is itself in the data provided (e.g. named new cited sources); otherwise state it as [Hypothesis] with what evidence would confirm it. ' +
    'CLOSED WORLD (hard rule): use ONLY the data in this message. Do not use the web or your own knowledge for any fact, figure, ' +
    'market share, screen count, study, award, client name or event. Never cite third-party research (Kantar, Nielsen, Mordor Intelligence, ' +
    'Statista or similar) unless the exact statement is in the BRAND FACTS below. ' +
    'NO NUMERIC FORECASTS: do not predict scores, percentages, word counts, budgets or dates of results. ' +
    'Output strict JSON only.';

  const methodologyLine = g.engineChange.length
    ? `METHODOLOGY CHANGE (non-negotiable): the model behind ${g.engineChange.join('; ')} changed between the two scans. Any movement on that engine is a measurement artefact — state this explicitly, do NOT attribute it to actions or to competitors, and treat this scan as the new baseline for that engine.`
    : null;
  // A measurement error is handled by withholding, not by instruction alone:
  // the previous scan is not passed at all, and the affected engine's current
  // figures are replaced by a marker. (Told only "do not compare", the model
  // still wrote "43/45 in both scans" and "only on Perplexity".)
  const bad = new Set(g.ingestIssue?.engines ?? []);
  const badNow = new Set(g.ingestIssue?.current ?? []);
  // Counted without the misread engine, so the model quotes fractions and never subtracts.
  const fq = g.coreReliable ?? g.core;
  const UNRELIABLE = 'not reliable this scan — do not use';
  const ingestLine = g.ingestIssue
    ? `MEASUREMENT ERROR (non-negotiable): the reading of ${[...bad].join(', ')} is not valid (${g.ingestIssue.scope === 'both' ? 'this scan and the previous one' : g.ingestIssue.scope === 'current' ? 'this scan' : 'the previous scan'}) — ` +
      [g.ingestIssue.log ? `${g.ingestIssue.log.engines.join(', ')}: scored on the engine's search log instead of the answer` : '', g.ingestIssue.empty ? `${g.ingestIssue.empty.list.map((x) => `${x.engine}: only ${x.answered} of ${x.total} answers came back`).join(', ')}` : ''].filter(Boolean).join('; ') + '. ' +
      'The digest prints a note about it; do not restate it and do not write a paragraph about it. Because of it this issue describes the CURRENT scan only: ' +
      'no comparison with any earlier scan, no "up", "down", "unchanged", "both scans", "last time" or "trend", for any figure. ' +
      (badNow.size ? `Every figure given below for the fixed questions is counted on the other engines only (${[...badNow].join(', ')} left out) — say so once, quote the fractions exactly as given and do no arithmetic of your own. Anything marked "${UNRELIABLE}" must not be quoted or reasoned from.` : '')
    : null;
  const ivxLine = g.interventions.list.length
    ? 'CLIENT ACTIONS AND MEASURED OUTCOMES (observed; cite the fractions verbatim, attribute movement only to the specific action/engine/question shown):\n' +
      g.interventions.list.map((iv) => describeOutcome(iv, g.interventions.outcomes[iv.id] ?? { scansBefore: 0, scansAfter: 0, awaiting: true, prompts: [], domain: null })).join('\n')
    : 'CLIENT ACTIONS: the client has logged NO published action. Nothing was deployed, published or implemented by the client as far as the platform knows — never say or imply that it was, and never link a metric movement to an action.';
  const srcType = (domain: string): SourceType => g.sourceTypes[domain.replace(/^www\./, '').toLowerCase()] ?? 'unknown';
  const scanRef = (m: GatherResult['currentMeta']) => (m ? `scan ${(m.at || '').slice(0, 10)} #${m.id.slice(0, 8)} (${m.trigger === 'schedule' ? 'scheduled' : 'manual'})` : 'none');
  const self = g.groups.filter((x) => x.relationship === 'self').map((x) => [x.canonical, ...(x.aliases ?? [])].join(' / '));
  const rivals = g.groups.filter((x) => x.relationship !== 'self' && x.relationship !== 'directory').map((x) => x.canonical);
  const user = [
    `TODAY is ${today.toISOString().slice(0, 10)} (${quarterOf(today).label}). Any period you name must be this quarter or later.`,
    methodologyLine,
    ingestLine,
    g.fetchRepaired.length
      ? `RETRIEVAL CHANGE: from this scan, answers from ${g.fetchRepaired.map((x) => `${x.engine} (previous scan ${x.before} of ${x.total} with content, this scan ${x.now} of ${x.total})`).join(', ')} that used to be lost to a time limit are retrieved. A change on that engine is not movement of the brand — do not describe it as a rise or a fall.`
      : null,
    ivxLine,
    `Brand: ${g.project.brand_name} · Market: ${g.project.target_country} · Industry: ${g.project.industry || 'n/a'}`,
    `ENTITIES — the brand itself (never a competitor): ${[g.project.brand_name, ...self].join('; ')}. Competitors: ${rivals.join('; ') || 'n/a'}. ` +
      'These are different companies even when names overlap; never move a fact from one to another, and attach no fact to a name that is in neither list.',
    `Lifecycle stage: ${g.stage}. ${stageGuide[g.stage]}`,
    '',
    `CURRENT ${scanRef(g.currentMeta)}: ${JSON.stringify(brief(cur, badNow))}`,
    g.ingestIssue
      ? 'PREVIOUS: withheld this issue (measurement error, see above). Describe the current scan only.'
      : prev
      ? `PREVIOUS ${scanRef(g.previousMeta)} — the ONLY scan you may compare with: ${JSON.stringify(brief(prev))}`
      : 'PREVIOUS: there is no comparable earlier scheduled scan. Do not describe any movement.',
    g.manualScans.length
      ? `Manual scans this period (${g.manualScans.map((m) => `${(m.at || '').slice(0, 10)} #${m.id.slice(0, 8)}${m.score != null ? ` score ${Math.round(m.score)}` : ''}`).join('; ')}) are spot checks: do not compare with them or cite their figures.`
      : null,
    g.core && fq
      ? `FIXED KEY QUESTIONS (the like-for-like part of the panel; the other questions rotate)${g.coreReliable ? ` — COUNTED ON ${g.coreReliable.unbrandedByEngine.length} ENGINES, ${[...badNow].join(', ')} LEFT OUT` : ''}. There are ${fq.questions} fixed questions: ` +
        `${fq.unbrandedQuestions} do NOT name the brand (${fq.unbranded.total} answers) and ${fq.brandedQuestions} name it (${fq.branded.total} answers) — say "${fq.unbrandedQuestions} questions", never "${fq.questions}", when you mean the ones without the brand name. ${JSON.stringify({
          fixedQuestions: fq.questions,
          questionsWithoutBrandName: fq.unbrandedQuestions,
          questionsWithBrandName: fq.brandedQuestions,
          withoutBrandName: fq.unbranded,
          withoutBrandNameByEngine: fq.unbrandedByEngine.map((e) => (badNow.has(e.engine) ? `${e.engine}: ${UNRELIABLE}` : `${e.engine}: ${e.present}/${e.total}`)),
          withBrandName: fq.branded,
          previousScan: g.ingestIssue || !g.core.before ? undefined : { withoutBrandName: `${g.core.before.unbranded.present}/${g.core.before.unbranded.total}`, withBrandName: `${g.core.before.branded.present}/${g.core.before.branded.total}` },
          lastScheduledScansWithoutBrandName: g.ingestIssue ? undefined : g.coreSeries.map((x) => `${(x.at || '').slice(0, 10)}: ${x.unbranded.present}/${x.unbranded.total}`),
          // Complete for the questions without the brand name — the only list from which gaps may be counted.
          everyQuestionWithoutBrandName: fq.gaps.map((x) => ({ q: x.prompt, present: `${x.now.present}/${x.now.total}`, presentOnEngines: x.engines.map((e) => (badNow.has(e) ? `${e} (${UNRELIABLE})` : e)), previous: g.ingestIssue ? undefined : x.before ? `${x.before.present}/${x.before.total}` : null, others: x.competitors })),
        })}`
      : null,
    'When you state a figure from a scan, name the scan by its date and #id as given above.',
    'Write for the client: never show JSON field names, section titles or internal codes from this message, and never cite the title, author or date of a brand document or rule — follow it and state the fact plainly. ' +
      'The only tags are [Observed], [Inferred] and [Hypothesis], written exactly so; a fact taken from the client\'s own material is stated plainly, in the client\'s own wording.',
    `The ±${NOISE_BAND} band is for the overall index. One engine or one intent class rests on far fewer answers and swings more: give its movement as numbers only — no "clear", "marked", "significant", "notable" (rõ rệt, đáng kể, đáng chú ý, 明显, 显著) and never "beyond noise".`,
    lang === 'vi'
      ? 'VIETNAMESE: write the way Vietnamese marketers write. Never translate a brand concept name word for word (no "Bốn Can", "Tứ Khả" or similar coinages for an English or Chinese term) — keep the client\'s own term as it is written in their material, or describe the idea in plain words.'
      : null,
    g.ingestIssue ? null : 'A single previous value is not a trend: when you describe movement on the fixed questions, read it against lastScheduledScansWithoutBrandName.',
    'Per-engine presence on the questions without the brand name is given in withoutBrandNameByEngine — quote those fractions, do not recount them. ' +
    'exampleGaps is a sample: never count gaps from it and never conclude that an engine or a stage has no gaps. Where the brand is absent, and on which engines, comes only from the complete per-question list under FIXED KEY QUESTIONS.',
    `Name every metric and question group in plain ${LANG_NAME[lang]} words (how often the brand appears, how prominently, in what tone, questions asked close to a purchase…), never by an English or code name such as presence, prominence, sentiment, topOfMind or high_intent.`,
    'BRAND FACTS AND RULES are followed silently. Never tell the client what their own rules forbid or allow, never list figures or wordings to avoid, never mention internal approvals or who must confirm what — simply write nothing that breaks a rule.',
    `Write only in ${LANG_NAME[lang]} script: no words or glosses in another script (no Chinese characters in a Vietnamese or English report, even when the client\'s material has them).`,
    `PLATFORM DRAFTS produced this period (generated by the platform; NOT published, NOT client actions — never call them deployed, published or implemented, and never attribute a movement to them): ${JSON.stringify(g.actions.map((a) => ({ what: a.label, note: a.summary })))}`,
    g.leverage
      ? 'SOURCE LEVERAGE (cumulative citation index — deterministic, already shown to the client as a table; do NOT restate the numbers). ' +
        'A source being cited often says nothing about its authority or about whether the brand should seek presence there. ' +
        'Each source below is described as "kind" (what it is) and "use" (the only way a suggestion may treat it): ' +
        JSON.stringify({
          sourcesCitedAlongsideTheBrand: g.leverage.carriers.map((r) => ({ domain: r.domain, kind: SOURCE_TYPE_LABEL[srcType(r.domain)][lang], use: SOURCE_USE[sourceLane(srcType(r.domain))], questionsWithBrand: r.winPrompts, questionsWithout: r.lossPrompts })),
          sourcesCitedWhereTheBrandIsAbsent: g.leverage.gaps.map((r) => ({ domain: r.domain, kind: SOURCE_TYPE_LABEL[srcType(r.domain)][lang], use: SOURCE_USE[sourceLane(srcType(r.domain))], otherBrandsInThoseAnswers: r.competitors.slice(0, 3) })),
        })
      : null,
    g.latestReport ? `Latest monthly report highlights (background only; the rules above still apply to anything you reuse): ${JSON.stringify({ summary: (g.latestReport as any).executiveSummary ?? (g.latestReport as any).summary, recs: ((g.latestReport as any).recommendations ?? []).slice(0, 4) }).slice(0, 3000)}` : null,
    g.brandProfile ? `\nBRAND FACTS AND RULES (the client's own statements — the only source for facts about the brand, and binding where they state a policy):\n${brandProfileBlock(g.brandProfile).slice(0, 5000)}` : null,
    '',
    'Return ONLY this JSON:',
    '{ "attribution": ["detailed paragraph", ...], "strategy": [{ "title": "short", "detail": "detailed paragraph" }, ...], "cooperation": ["concrete ask", ...] }',
    `attribution: 2-4 paragraphs that INTERPRET the measurements only — what the engines said, where the brand is absent, which sources they used${g.ingestIssue ? '' : ', what changed against the previous scheduled scan'}. No advice in this part.`,
    'strategy: 2-4 SUGGESTIONS for content or distribution. The client decides what to produce and where; write options and the measured reason for each, not instructions. ' +
      'Respect every policy in BRAND FACTS AND RULES: where the client does not publish prices or does not sell a capability, suggest nothing that requires it. ' +
      'In strategy and cooperation give the measured reason as a fraction exactly as it appears in the data (e.g. 0/15), never as a percentage, ' +
      'and state no other figure unless it is in BRAND FACTS AND RULES.',
    'cooperation: 0-5 items (build stage: always ≥3) — facts only the client can confirm or provide.',
    g.leverage
      ? 'Sources: follow each source\'s "use" exactly — a venue may be suggested as a place to publish; a study-only source may at most be read for what information the engines take from it. ' +
        'Never suggest a listing, profile or outreach on a competitor, reseller, hardware-vendor or self-publishing source. ' +
        'Co-occurrence is not cause: never claim a source caused a score movement.'
      : null,
  ].filter(Boolean).join('\n');

  return { sys, user };
}

async function interpret(g: GatherResult): Promise<Interpretation | null> {
  const { sys, user } = buildInterpretationPrompt(g);
  const lang = g.schedule.language || 'en';
  const now = new Date();
  const figureCorpus = figureCorpusOf(g.truth.figures);
  const factsCorpus = brandFactsCorpus(g.brandProfile);

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
      const removedSentences: string[] = [];
      const clean = (text: string, forward: boolean) => {
        const r = scrub(text.replace(BRAND_FACT_TAG_RE, FROM_CLIENT[lang]), figureCorpus, factsCorpus, lang, now, { forwardLooking: forward });
        removedSentences.push(...r.removed);
        const kept = sentences(r.text).filter((sn) => {
          if (!PROMPT_WORDS_RE.test(sn)) return true;
          removedSentences.push(sn);
          return false;
        });
        return kept.join(' ');
      };
      const attribution = (parsed.attribution ?? []).filter((x: any) => typeof x === 'string').map((x: string) => clean(x, false)).filter(Boolean);
      const strategy = (parsed.strategy ?? [])
        .filter((x: any) => x?.title && x?.detail)
        .map((x: any) => ({ title: clean(String(x.title), true), detail: clean(String(x.detail), true) }))
        .filter((x: any) => x.title && x.detail);
      const cooperation = (parsed.cooperation ?? []).filter((x: any) => typeof x === 'string').map((x: string) => clean(x, true)).filter(Boolean);
      if (removedSentences.length) {
        console.warn(`[digest] scrub removed ${removedSentences.length} sentence(s):`, removedSentences.map((x) => x.slice(0, 600)));
      }

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
        removedSentences: removedSentences.length,
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
  // Inside the noise band the movement is shown as a number, never as a rise or
  // a fall: a green "▲ +3" reads as improvement, and it is not one.
  const deltaBadge =
    delta == null || g.stage === 'build'
      ? ''
      : g.ingestIssue
        ? `<span style="color:#9C8E8A;font-size:13px;"> ${delta > 0 ? '+' : ''}${delta} · ${esc(t.notInterpreted)}</span>`
      : Math.abs(delta) <= NOISE_BAND
        ? `<span style="color:#9C8E8A;font-size:13px;"> ${delta > 0 ? '+' : ''}${delta} · ${esc(t.withinNoise)}</span>`
        : delta > 0
          ? `<span style="color:#5B8266;font-size:15px;font-weight:600;"> ▲ +${delta}</span>`
          : `<span style="color:#A64B4B;font-size:15px;font-weight:600;"> ▼ ${delta}</span>`;
  const ref = (m: { id: string; at: string | null }) => ({ date: (m.at || '').slice(0, 10), id: m.id.slice(0, 8) });
  const frac = (f: Frac) => `${f.present}/${f.total}`;
  const part = (title: string) =>
    `<div style="margin-top:30px;padding-top:14px;border-top:2px solid #2A2024;font-size:13px;font-weight:700;color:#2A2024;line-height:1.5;">${esc(title)}</div>`;

  const sec = (title: string, inner: string) =>
    `<div style="margin-top:26px;"><div style="font-size:11px;letter-spacing:2px;color:#9C8E8A;text-transform:uppercase;margin-bottom:10px;">${esc(title)}</div>${inner}</div>`;

  const corePrev = g.core?.before ?? null;

  // Score block — concise by design (full data lives in the workspace PDF).
  let scoreBlock = '';
  if (cur) {
    const methodBlock = g.engineChange.length
      ? `<div style="margin:12px 0;padding:10px 12px;background:#FFF6E5;border-left:3px solid #B6863A;border-radius:6px;font-size:12px;color:#5A4A2A;line-height:1.6;">${esc(t.methodChange(g.engineChange.join('; ')))}</div>`
      : '';
    const flagged = new Set(g.ingestIssue?.engines ?? []);
    const star = (engine: string) => (flagged.has(engine) ? `${engine} *` : engine);
    const noteBox = (text: string) =>
      `<div style="margin:12px 0;padding:10px 12px;background:#FFF6E5;border-left:3px solid #B6863A;border-radius:6px;font-size:12px;color:#5A4A2A;line-height:1.6;">${esc(text)}</div>`;
    const ingestBlock =
      (g.ingestIssue?.log ? noteBox(t.ingestNote(g.ingestIssue.log.engines.join(', '), g.ingestIssue.log.scope)) : '') +
      (g.ingestIssue?.empty ? noteBox(t.emptyNote(g.ingestIssue.empty.list.map((x) => t.unread(x.engine, x.answered, x.total)).join('; '), g.ingestIssue.empty.scope)) : '') +
      g.fetchRepaired.map((x) => noteBox(t.fetchNote(x.engine, x.before, x.now, x.total))).join('');
    const engines = (cur.metrics?.perEngine ?? [])
      .map(
        (e: any) =>
          `<tr><td style="padding:5px 0;font-size:13px;color:#2A2024;">${esc(star(e.engine))}</td><td style="padding:5px 0;font-size:13px;color:#6E625F;text-align:right;font-variant-numeric:tabular-nums;">${Math.round(e.aigvr)}</td></tr>`,
      )
      .join('');
    const hi = (cur.metrics?.perIntent ?? []).find((i: any) => i.intent === 'high_intent');
    scoreBlock = sec(
      `${t.scoreSection} · ${t.stageLabels[g.stage]}`,
      `<div style="font-size:40px;font-weight:700;color:#2A2024;line-height:1;">${Math.round(cur.aigvrScore)}${deltaBadge}</div>
       <div style="font-size:12px;color:#9C8E8A;margin-top:4px;">${esc(g.scoreLabel)}</div>
       <div style="font-size:11.5px;color:#6E625F;margin-top:6px;">${g.previousMeta && prev ? esc(t.compareLine(ref(g.previousMeta).date, ref(g.previousMeta).id, Math.round(prev.aigvrScore))) : esc(t.noBaseline)}</div>
       ${g.core ? `<div style="margin-top:12px;padding:10px 12px;background:#F7F2EF;border-radius:8px;">
         <div style="font-size:10.5px;letter-spacing:1px;color:#9C8E8A;text-transform:uppercase;">${esc(t.coreSection)}</div>
         <div style="font-size:12.5px;color:#2A2024;margin-top:4px;line-height:1.6;">${esc(t.coreLine(g.core.questions, g.core.unbrandedQuestions, frac(g.core.unbranded) + (corePrev ? t.corePrev(frac(corePrev.unbranded)) : ''), g.core.brandedQuestions, frac(g.core.branded) + (corePrev ? t.corePrev(frac(corePrev.branded)) : '')))}</div>
         <div style="font-size:12px;color:#2A2024;margin-top:4px;line-height:1.6;">${esc(t.coreEngines(g.core.unbrandedByEngine.map((e) => `${star(e.engine)} ${e.present}/${e.total}`).join(' · ')))}</div>
         ${g.coreSeries.length > 2 ? `<div style="font-size:12px;color:#2A2024;margin-top:4px;line-height:1.6;">${esc(t.coreSeries(g.coreSeries.map((x) => `${(x.at || '').slice(5, 10)} ${frac(x.unbranded)}${x.flagged ? ' *' : ''}`).join(' · ')))}</div>` : ''}
         <div style="font-size:11px;color:#9C8E8A;margin-top:4px;line-height:1.5;">${esc(t.panelNote(cur?.sampled?.used ?? '–', g.core.questions))}</div>
       </div>` : ''}
       ${g.stage === 'build' ? `<p style="margin:12px 0 0;font-size:12.5px;color:#8A6D3B;background:#FBF3E4;border-radius:8px;padding:10px 12px;line-height:1.55;">${esc(t.baselineNote)}</p>` : ''}
       ${methodBlock}${ingestBlock}
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
    const typeLine = (domain: string) => {
      const ty = g.sourceTypes[domain.replace(/^www\./, '').toLowerCase()] ?? 'unknown';
      return `<div style="font-size:10.5px;color:#6E625F;margin-top:1px;">${esc(t.srcType)}: ${esc(SOURCE_TYPE_LABEL[ty][lang])} · ${esc(t.srcFit)}: ${esc(SOURCE_FIT_LABEL[ty][lang])}</div>`;
    };

    const carriersTable = L.carriers.length
      ? `<div style="font-size:12.5px;font-weight:600;color:#2A2024;margin-top:2px;">${esc(t.carriersTitle)}</div>
         <table style="width:100%;border-collapse:collapse;margin-top:6px;">
           ${head(['', t.colQuestions, t.colRatio])}
           ${L.carriers
             .map((r) =>
               row([
                 `${esc(r.domain)}${typeLine(r.domain)}`,
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
                   `${esc(r.domain)}${typeLine(r.domain)}<div style="font-size:10.5px;color:#9C8E8A;margin-top:1px;">${esc(t.colHolders)}: ${esc(r.competitors.slice(0, 2).join(', ') || '—')}</div>`,
                   `${r.hiLoss}/${r.loss}`,
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

  // Where the brand is absent on the fixed questions that do not name it — the
  // "where are the gaps" answer, straight from the samples.
  const coreGapsBlock = g.core?.gaps.length
    ? sec(
        t.coreGapsTitle,
        `<table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:0 0 4px;font-size:10.5px;letter-spacing:.5px;color:#9C8E8A;text-transform:uppercase;">${esc(t.colQuestion)}</td><td style="padding:0 0 4px 10px;font-size:10.5px;letter-spacing:.5px;color:#9C8E8A;text-transform:uppercase;text-align:right;white-space:nowrap;">${esc(t.colPresence)}</td></tr>
          ${g.core.gaps.slice(0, 11).map((x) =>
            `<tr><td style="padding:5px 0;font-size:12.5px;color:#2A2024;line-height:1.45;border-top:1px solid rgba(58,30,34,0.06);">${esc(x.prompt)}${x.competitors.length ? `<div style="font-size:10.5px;color:#9C8E8A;margin-top:1px;">${esc(t.colOthers)}: ${esc(x.competitors.join(', '))}</div>` : ''}</td>` +
            `<td style="padding:5px 0 5px 10px;font-size:12.5px;color:#2A2024;text-align:right;white-space:nowrap;vertical-align:top;font-variant-numeric:tabular-nums;border-top:1px solid rgba(58,30,34,0.06);"><strong>${frac(x.now)}</strong>${x.before ? `<div style="font-size:10.5px;color:#9C8E8A;">${esc(t.corePrev(frac(x.before)).trim())}</div>` : ''}${x.engines.length ? `<div style="font-size:10.5px;color:#9C8E8A;">${esc(x.engines.join(', '))}</div>` : ''}</td></tr>`,
          ).join('')}
        </table>`,
      )
    : '';

  // The platform's own output this period — drafts and scans, not actions.
  const actionsBlock = sec(
    t.actionsSection,
    (g.actions.length
      ? `<ul style="margin:0;padding-left:18px;">${g.actions
          .map((a) => `<li style="font-size:13px;color:#2A2024;margin-bottom:6px;line-height:1.5;"><strong>${esc(a.label)}</strong>${a.summary ? ` — <span style="color:#6E625F;">${esc(a.summary)}</span>` : ''} <span style="font-size:11px;color:#9C8E8A;">${esc((a.at || '').slice(0, 10))}</span></li>`)
          .join('')}</ul>`
      : `<p style="margin:0;font-size:13px;color:#6E625F;">${esc(t.noActions)}</p>`) +
      `<p style="margin:8px 0 0;font-size:11.5px;color:#6E625F;line-height:1.6;">${esc(t.draftsNote)}</p>`,
  );

  // Suggestion, not measurement: which gap sources are venues, and which are
  // only worth reading for what the engines take from them.
  const lanesBlock = (() => {
    if (!g.leverage?.gaps.length) return '';
    const by = { presence: [] as string[], study: [] as string[], unclassified: [] as string[] };
    for (const r of g.leverage.gaps) {
      const ty = g.sourceTypes[r.domain.replace(/^www\./, '').toLowerCase()] ?? 'unknown';
      by[sourceLane(ty)].push(`${r.domain} (${SOURCE_TYPE_LABEL[ty][lang]})`);
    }
    const line = (title: string, list: string[]) =>
      list.length ? `<div style="font-size:12.5px;color:#2A2024;margin-top:6px;line-height:1.55;"><strong>${esc(title)}</strong>: <span style="color:#6E625F;">${esc(list.join(', '))}</span></div>` : '';
    return `<div style="margin-top:14px;">${line(t.lanePresence, by.presence)}${line(t.laneStudy, by.study)}${line(t.laneUnknown, by.unclassified)}<div style="font-size:11px;color:#9C8E8A;margin-top:4px;">${esc(t.lanesNote)}</div></div>`;
  })();

  // The two deliberately DETAILED sections.
  const interpNotice = !interp
    ? `<div style="margin-top:22px;padding:10px 12px;background:#FBF3E4;border-radius:8px;font-size:12px;color:#8A6D3B;line-height:1.6;">${esc(t.interpUnavailable)}</div>`
    : '';
  const attributionBlock =
    interp && interp.attribution.length && g.stage !== 'build'
      ? `<div style="margin-top:14px;">${interp.attribution.map((p) => `<p style="margin:0 0 12px;font-size:13.5px;color:#2A2024;line-height:1.7;">${escProse(p)}</p>`).join('')}</div>`
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

  // Collaboration alignment (opt-in) — every figure is a count or a cosine from the
  // project's own records; no interpretation.
  const c = g.collab;
  const collabBlock = c
    ? `<div style="margin-top:22px;"><div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8A7F78;margin-bottom:8px;">${esc(t.collabSection)}</div>` +
      (c.trust != null
        ? `<div style="font-size:13px;color:#2B2B2B;"><strong>${esc(t.collabValue(c.trust, c.participation.actions + c.participation.answerEdits, c.onPlanShare ?? 0))}</strong></div>`
        : `<div style="font-size:12.5px;color:#4A4A4A;">${esc(t.collabNone)}</div>`) +
      (c.participation.factEdits || c.participation.setEdits
        ? `<div style="font-size:12px;color:#4A4A4A;margin-top:4px;">${esc(t.collabGovernance(c.participation.factEdits, c.participation.setEdits))}</div>`
        : '') +
      (c.neglected.length
        ? `<div style="font-size:12px;color:#4A4A4A;margin-top:6px;">${esc(t.collabNeglected)}:</div>` +
          c.neglected.map((d) => `<div style="font-size:12px;color:#4A4A4A;margin-top:2px;">“${esc(d.prompt.slice(0, 90))}” — ${d.present}/${d.total}</div>`).join('')
        : '') +
      `<div style="font-size:10.5px;color:#9A9A9A;margin-top:6px;">${esc(t.collabNote)}</div></div>`
    : '';

  const provenanceBlock =
    interp?.verification && interp.verification.checked
      ? `<div style="margin-top:22px;padding:10px 12px;background:#F3F6F3;border-left:3px solid #5B8266;border-radius:6px;font-size:11.5px;color:#4A5A4E;line-height:1.6;">${esc(
          t.provenance(interp.verification.checked, interp.verification.passed, interp.verification.removedSentences ?? 0),
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
      ${g.currentMeta ? `<div style="font-size:10.5px;color:#9C8E8A;margin-top:2px;line-height:1.6;">${esc(t.scanWord)} ${esc(ref(g.currentMeta).date)} · #${esc(ref(g.currentMeta).id)} · ${esc(g.currentMeta.trigger === 'schedule' ? t.scheduled : t.manual)} · n=${cur?.metrics?.overall?.queries ?? '–'}${
        g.manualScans.length
          ? `<br/>${esc(t.manualScans(g.manualScans.map((m) => `${(m.at || '').slice(0, 10)} #${m.id.slice(0, 8)}${m.score != null ? ` (${Math.round(m.score)}${m.unread.length ? ` · ${m.unread.map((x) => t.unread(x.engine, x.answered, x.total)).join(', ')} · ${t.totalInvalid}` : ''})` : ''}`).join('; ')))}`
          : ''
      }</div>` : ''}
      ${part(t.partAudit)}
      ${scoreBlock}
      ${coreGapsBlock}
      ${citationsBlock}
      ${leverageBlock}
      ${ivxBlock}
      ${collabBlock}
      ${attributionBlock || interpNotice ? part(t.partInterp) : ''}
      ${interpNotice}
      ${attributionBlock}
      ${provenanceBlock}
      ${part(t.partSuggest)}
      <p style="margin:10px 0 0;font-size:12px;color:#6E625F;line-height:1.6;">${esc(t.suggestNote)}</p>
      ${strategyBlock}
      ${lanesBlock}
      ${cooperationBlock}
      ${actionsBlock}
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
  if (res.sent) await stampSchedule(sb, projectId, { lastDigestAt: new Date().toISOString() });
  return res;
}

/** Set one or two reportSchedule keys on the metadata as it is NOW. Writing back
 *  the copy read at the start of the digest (seconds to minutes earlier, with a
 *  model call in between) would silently undo any edit made meanwhile — a
 *  recipients change, for one. */
async function stampSchedule(sb: SupabaseClient, projectId: string, patch: Partial<ReportSchedule>): Promise<void> {
  const { data } = await sb.from('projects').select('metadata').eq('id', projectId).maybeSingle();
  const fresh = ((data as any)?.metadata ?? {}) as Record<string, any>;
  await sb.from('projects').update({ metadata: { ...fresh, reportSchedule: { ...(fresh.reportSchedule ?? {}), ...patch } } }).eq('id', projectId);
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
  // Only a scan of the scheduled series can raise a movement alert; a scan
  // someone ran by hand is a spot check and is never compared.
  if (g.currentMeta?.id !== runId) return { sent: false, reason: 'not the latest scheduled scan' };
  if (!g.current || !g.previous) return { sent: false, reason: 'need two scans' };
  if (g.stage === 'build') return { sent: false, reason: 'baseline period — no movement alerts' };
  if (g.engineChange.length) return { sent: false, reason: `engine model changed (${g.engineChange.join('; ')}) — movement is a measurement artefact` };
  if (g.ingestIssue) return { sent: false, reason: `${g.ingestIssue.engines.join(', ')} scored on its search log (${g.ingestIssue.scope}) — movement is a measurement artefact` };

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
  if (res.sent) await stampSchedule(sb, projectId, { lastAlertRunId: runId });
  return res;
}
