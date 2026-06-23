'use client';

/**
 * Southeast Asia GEO Multi-Agent Command Center
 * Palantir-style cyber-intelligence dashboard for the SEA orchestrator.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Radar,
  Terminal,
  ShieldAlert,
  Satellite,
  Cpu,
  Activity,
  Play,
  Loader2,
  Copy,
  Check,
  Swords,
  Plus,
  ExternalLink,
  Languages,
  ChevronDown,
  ChevronRight,
  Building2,
  FileText,
  Stethoscope,
  Search,
  Globe,
  Sparkles,
  Link2,
  Wrench,
  ClipboardList,
  Brain,
  Target,
  TrendingUp,
} from 'lucide-react';
import { SEAIntelBriefing } from '@/components/sea-command-center/sea-intel-briefing';
import {
  computeAEODiagnostic,
  type AxisDerivation,
  type AxisResult,
  type ComputedDiagnostic,
} from '@/lib/aeo-scoring';
import { computeCPR, type CPRReport } from '@/lib/computational-pr';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';

interface RegionalAuditResponse {
  verdict: 'regional_site_identified' | 'no_regional_site_found' | 'error';
  error?: string;
  message?: string;
  brandHomepage?: string;
  targetCountry?: string;
  regionalUrl?: string;
  finalUrl?: string;
  source?: string;
  sourceRationale?: string;
  hreflangEntriesFound?: number;
  fit?: {
    score: number;
    components: { langMatch: number; urlSignal: number; contentLang: number; hreflangSource: number };
    verdict: 'strong' | 'moderate' | 'weak' | 'echo';
    reasons: string[];
  };
  regionalChecks?: {
    html_lang_matches_country: boolean;
    hreflang_cluster_complete: boolean;
    has_x_default: boolean;
    json_ld_sameAs_links: boolean;
    has_LocalBusiness_schema: boolean;
    content_wordcount_native_ok: boolean;
    regional_aeo_score: number;
  };
  fields?: {
    title: string | null;
    description: string | null;
    lang: string | null;
    hreflang: string[];
    schemaTypes: string[];
    jsonldCount: number;
    wordCount: number;
    bodyLanguageSignal: number;
  };
  candidates?: Array<{
    url: string;
    finalUrl: string;
    source: string;
    httpStatus: number;
    isEcho: boolean;
    fit: { score: number; verdict: string; reasons: string[] };
  }>;
  alternatives?: Array<{
    url: string;
    source: string;
    fit: number;
    verdict: string;
    isEcho: boolean;
  }>;
}

type AugmentedDiagnostic = {
  scorecard: Array<ScorecardItem & { derivation?: AxisDerivation }>;
  overall_score: number;
  verdict: string;
  query_matrix: DiagnosticianPayload['query_matrix'];
  prescriptions: DiagnosticianPayload['prescriptions'];
};

// ─── i18n ──────────────────────────────────────────────────────────────────────

type Locale = 'zh' | 'en' | 'vi' | 'id' | 'th';

const LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'en', label: 'EN', flag: '🇺🇸' },
  { code: 'vi', label: 'VI', flag: '🇻🇳' },
  { code: 'id', label: 'ID', flag: '🇮🇩' },
  { code: 'th', label: 'TH', flag: '🇹🇭' },
];

const I18N: Record<Locale, Record<string, string>> = {
  zh: {
    subtitle: 'MemeCMO ◆ 东南亚指挥',
    title: '东南亚 GEO 多智能体指挥中心',
    grid: '网格',
    risk: '风险',
    live: '在线',
    standby: '待机',
    awaiting: '等待指令',
    brandLabel: '品牌代号',
    brandPlaceholder: '例：Shopee、字节、华为…',
    homepageLabel: '品牌官网（留空则自动推断）',
    homepagePlaceholder: 'https://your-brand.vn',
    auditRunning: '正在体检官网…',
    auditAutoHint: '已根据品牌官网自动触发 SEO/GEO/AEO 体检。',
    localPresence: '本地存在感',
    localPresenceNone: '尚未进入',
    localPresenceEntering: '试探期',
    localPresenceEstablished: '已立足',
    localPresenceLeader: '领导者',
    theaterLabel: '目标战区',
    deploy: '部署 SEA 矩阵',
    deploying: '部署中…',
    abort: '中止',
    agentRoster: '智能体编组',
    terminalStream: '智能体终端流',
    events: '事件',
    awaitingDeploy: '// 等待 `部署 SEA 矩阵` — 需要指挥官输入。',
    guardianTitle: '地缘 · 文化风险警报',
    guardianIdle: '// 审计官待命 — 部署矩阵后接收威胁遥测。',
    mitigation: '⟶ 缓解动作：',
    mediaRadar: 'T1 媒体雷达 · 权威 × 品牌声量',
    radarIdle: '// 雷达关闭 — 语料勘探尚未回传。',
    execSummary: '执行摘要',
    priorityNodes: '重点节点',
    competitorTitle: '区域竞品雷达 · 本地 & 跨国',
    competitorIdle: '// 竞品扫描待命 — 部署矩阵以识别赛道玩家。',
    marketSummary: '市场格局',
    addCompetitor: '添加自定义竞品',
    corpusOutput: '授权语料输出 · JSON-LD',
    corpusIdle: '// 建筑师待命 — JSON-LD 载荷将在此具现。',
    nativeStatement: '母语声明',
    englishGloss: '英文直译',
    copied: '已复制',
    copy: '复制',
    brandRequired: '[SYSTEM] ⚠ 需要品牌名',
    aborted: '[SYSTEM] ⧖ 指挥官中止',
    collapse: '收起',
    expand: '展开',
    aboutCompany: '品牌档案',
    companyOverview: '公司概览',
    industryPeers: '同赛道玩家',
    documentPack: '文档资料包',
    docBrand: '品牌资产',
    docCompliance: '合规与风险',
    docLocal: '本地化语料',
    docMedia: 'T1 媒体清单',
    analyticsLabel: '品牌 GEO/AEO 体检',
    analyticsHint: '输入品牌官网 URL，运行 SEO / GEO / AEO 多维体检',
    runAudit: '开始体检',
    auditing: '体检中…',
    overallScore: '综合评分',
    dimHealth: 'SEO Health',
    dimLinks: 'Links',
    dimTechnical: 'Technical',
    dimAI: 'AI / LLM',
    dimGEO: 'GEO',
    dimChecks: 'Checks',
    fieldTitle: 'Meta Title',
    fieldDesc: 'Meta Description',
    fieldCanonical: 'Canonical URL',
    fieldLang: 'Language',
    fieldViewport: 'Mobile / Viewport',
    fieldRobots: 'Robots',
    fieldHreflang: 'Hreflang',
    fieldSchema: 'Schema Types',
    fieldWords: 'Word Count',
    fieldReadability: 'Readability',
    fieldImages: 'Image Alt Coverage',
    fieldLinks: 'Internal / External Links',
    issues: '发现的问题',
    noIssues: '未发现问题',
    auditIdle: '// 尚未体检 —— 输入 URL 后点击开始。',
    geoDiag: 'GEO/AEO 六维诊断',
    geoDiagIdle: '// 诊断师待命 —— 部署后输出 E1-E6 六维记分卡。',
    scorecardLabel: '六维记分卡 · LLM 可见度体检',
    evidenceLabel: '证据',
    gapLabel: '差距',
    queryMatrixLabel: '区域意图查询矩阵 · Regional Query SOV',
    queryMatrixHint: '每行一个典型本地意图查询，列出品牌与主要竞品在主流 LLM 答案中的位次。',
    prescriptionsLabel: '处方清单 · 按 影响力 × 易执行性 排序',
    axisE1: 'E1 实体权威性',
    axisE2: 'E2 语料密度',
    axisE3: 'E3 问题声量',
    axisE4: 'E4 语义锚定',
    axisE5: 'E5 引用信任',
    axisE6: 'E6 答案命中',
    impactLabel: '影响',
    effortLabel: '成本',
    timeToSignal: '见效周期',
    exampleAssets: '产物示例',
    rankOwn: '首位',
    rankMentioned: '被提及',
    rankOccasional: '偶尔',
    rankAbsent: '缺席',
    overallVerdict: '总体判决',
    stageAwareness: '认知',
    stageConsideration: '考虑',
    stageComparison: '对比',
    stagePurchase: '购买',
    stageSupport: '支持',
    stageCrisis: '危机',
  },
  en: {
    subtitle: 'MemeCMO ◆ SEA Command',
    title: 'SOUTHEAST ASIA GEO MULTI-AGENT COMMAND CENTER',
    grid: 'GRID',
    risk: 'RISK',
    live: 'LIVE',
    standby: 'STANDBY',
    awaiting: 'AWAITING OPS',
    brandLabel: 'Brand Callsign',
    brandPlaceholder: 'e.g. Shopee, ByteDance, Huawei…',
    homepageLabel: 'Brand Homepage (blank = auto-guess)',
    homepagePlaceholder: 'https://your-brand.vn',
    auditRunning: 'Auditing homepage…',
    auditAutoHint: 'Auto-audit fired against the resolved homepage.',
    localPresence: 'Local Presence',
    localPresenceNone: 'Not Entered',
    localPresenceEntering: 'Entering',
    localPresenceEstablished: 'Established',
    localPresenceLeader: 'Leader',
    theaterLabel: 'Target Theater',
    deploy: 'Deploy SEA Matrix',
    deploying: 'Deploying…',
    abort: 'Abort',
    agentRoster: 'Agent Roster',
    terminalStream: 'Agent Terminal Stream',
    events: 'events',
    awaitingDeploy: '// Awaiting `Deploy SEA Matrix` — operator input required.',
    guardianTitle: 'Geopolitical & Cultural Risk Alert',
    guardianIdle: '// Guardian idle — deploy matrix to receive threat telemetry.',
    mitigation: '⟶ mitigation:',
    mediaRadar: 'T1 Media Radar · Trust Weight × Brand SOV',
    radarIdle: '// Radar dark — corpus scout has not yet reported.',
    execSummary: 'Executive Summary',
    priorityNodes: 'Priority Nodes',
    competitorTitle: 'Regional Competitor Radar · Local & MNC',
    competitorIdle: '// Competitor scanner idle — deploy matrix to map rivals.',
    marketSummary: 'Market Landscape',
    addCompetitor: 'Add custom competitor',
    corpusOutput: 'Authorized Corpus Output · JSON-LD',
    corpusIdle: '// Architect standing by. JSON-LD payload will materialize here.',
    nativeStatement: 'Native Statement',
    englishGloss: 'English Gloss',
    copied: 'Copied',
    copy: 'Copy',
    brandRequired: '[SYSTEM] ⚠ brand name required',
    aborted: '[SYSTEM] ⧖ aborted by operator',
    collapse: 'Collapse',
    expand: 'Expand',
    aboutCompany: 'About Company',
    companyOverview: 'Overview',
    industryPeers: 'Industry Peers',
    documentPack: 'Document Packs',
    docBrand: 'Brand Assets',
    docCompliance: 'Compliance & Risk',
    docLocal: 'Localization Corpus',
    docMedia: 'T1 Media Targets',
    analyticsLabel: 'Brand GEO/AEO Audit',
    analyticsHint: 'Enter brand URL to run SEO / GEO / AEO multi-dimensional audit',
    runAudit: 'Run Audit',
    auditing: 'Auditing…',
    overallScore: 'Overall Score',
    dimHealth: 'SEO Health',
    dimLinks: 'Links',
    dimTechnical: 'Technical',
    dimAI: 'AI / LLM',
    dimGEO: 'GEO',
    dimChecks: 'Checks',
    fieldTitle: 'Meta Title',
    fieldDesc: 'Meta Description',
    fieldCanonical: 'Canonical URL',
    fieldLang: 'Language',
    fieldViewport: 'Mobile / Viewport',
    fieldRobots: 'Robots',
    fieldHreflang: 'Hreflang',
    fieldSchema: 'Schema Types',
    fieldWords: 'Word Count',
    fieldReadability: 'Readability',
    fieldImages: 'Image Alt Coverage',
    fieldLinks: 'Internal / External Links',
    issues: 'Issues Detected',
    noIssues: 'No issues detected',
    auditIdle: '// No audit yet — enter URL and click Run.',
    geoDiag: 'GEO/AEO Six-Axis Diagnostics',
    geoDiagIdle: '// Diagnostician idle — deploy to compute E1-E6 scorecard.',
    scorecardLabel: 'Scorecard · LLM Visibility Physical',
    evidenceLabel: 'Evidence',
    gapLabel: 'Gap',
    queryMatrixLabel: 'Regional Intent Query Matrix · SOV by Query',
    queryMatrixHint: 'Each row is a typical local-language intent query; cells show brand vs competitor rank in mainstream LLM answers.',
    prescriptionsLabel: 'Prescriptions · Ranked by Impact × Ease',
    axisE1: 'E1 Entity Canonicality',
    axisE2: 'E2 Corpus Density',
    axisE3: 'E3 Query SOV',
    axisE4: 'E4 Semantic Anchoring',
    axisE5: 'E5 Citation Authority',
    axisE6: 'E6 Answer Inclusion',
    impactLabel: 'Impact',
    effortLabel: 'Effort',
    timeToSignal: 'Time-to-Signal',
    exampleAssets: 'Example Assets',
    rankOwn: 'Owns',
    rankMentioned: 'Mentioned',
    rankOccasional: 'Occasional',
    rankAbsent: 'Absent',
    overallVerdict: 'Verdict',
    stageAwareness: 'Awareness',
    stageConsideration: 'Consideration',
    stageComparison: 'Comparison',
    stagePurchase: 'Purchase',
    stageSupport: 'Support',
    stageCrisis: 'Crisis',
  },
  vi: {
    subtitle: 'MemeCMO ◆ Chỉ huy ĐNA',
    title: 'TRUNG TÂM CHỈ HUY GEO ĐA TÁC TỬ ĐÔNG NAM Á',
    grid: 'LƯỚI',
    risk: 'RỦI RO',
    live: 'TRỰC TUYẾN',
    standby: 'CHỜ',
    awaiting: 'CHỜ LỆNH',
    brandLabel: 'Mã Thương Hiệu',
    brandPlaceholder: 'VD: Shopee, ByteDance, Huawei…',
    theaterLabel: 'Chiến Trường',
    deploy: 'Triển khai Ma Trận',
    deploying: 'Đang triển khai…',
    abort: 'Hủy',
    agentRoster: 'Danh Sách Tác Tử',
    terminalStream: 'Luồng Terminal Tác Tử',
    events: 'sự kiện',
    awaitingDeploy: '// Chờ `Triển khai Ma Trận` — cần đầu vào.',
    guardianTitle: 'Cảnh Báo Địa Chính Trị & Văn Hóa',
    guardianIdle: '// Giám hộ chờ — triển khai để nhận dữ liệu.',
    mitigation: '⟶ giảm thiểu:',
    mediaRadar: 'Radar Truyền Thông T1 · Trọng Số × SOV',
    radarIdle: '// Radar tắt — chưa có báo cáo.',
    execSummary: 'Tóm Tắt Điều Hành',
    priorityNodes: 'Nút Ưu Tiên',
    competitorTitle: 'Radar Đối Thủ Khu Vực',
    competitorIdle: '// Quét đối thủ chờ.',
    marketSummary: 'Bối Cảnh Thị Trường',
    addCompetitor: 'Thêm đối thủ tùy chỉnh',
    corpusOutput: 'Đầu Ra Ngữ Liệu · JSON-LD',
    corpusIdle: '// Kiến trúc sư chờ.',
    nativeStatement: 'Tuyên Bố Bản Ngữ',
    englishGloss: 'Diễn Giải Tiếng Anh',
    copied: 'Đã sao chép',
    copy: 'Sao chép',
    brandRequired: '[SYSTEM] ⚠ cần tên thương hiệu',
    aborted: '[SYSTEM] ⧖ đã hủy',
  },
  id: {
    subtitle: 'MemeCMO ◆ Komando ASEAN',
    title: 'PUSAT KOMANDO GEO MULTI-AGEN ASIA TENGGARA',
    grid: 'GRID',
    risk: 'RISIKO',
    live: 'LIVE',
    standby: 'SIAGA',
    awaiting: 'MENUNGGU OPS',
    brandLabel: 'Kode Merek',
    brandPlaceholder: 'mis. Shopee, ByteDance, Huawei…',
    theaterLabel: 'Medan Target',
    deploy: 'Deploy Matriks SEA',
    deploying: 'Men-deploy…',
    abort: 'Batalkan',
    agentRoster: 'Daftar Agen',
    terminalStream: 'Aliran Terminal Agen',
    events: 'peristiwa',
    awaitingDeploy: '// Menunggu `Deploy Matriks SEA`.',
    guardianTitle: 'Peringatan Geopolitik & Budaya',
    guardianIdle: '// Guardian siaga.',
    mitigation: '⟶ mitigasi:',
    mediaRadar: 'Radar Media T1 · Bobot Kepercayaan × SOV',
    radarIdle: '// Radar padam.',
    execSummary: 'Ringkasan Eksekutif',
    priorityNodes: 'Node Prioritas',
    competitorTitle: 'Radar Kompetitor Regional',
    competitorIdle: '// Pemindai kompetitor siaga.',
    marketSummary: 'Lanskap Pasar',
    addCompetitor: 'Tambah kompetitor',
    corpusOutput: 'Output Korpus · JSON-LD',
    corpusIdle: '// Arsitek siaga.',
    nativeStatement: 'Pernyataan Asli',
    englishGloss: 'Gloss Inggris',
    copied: 'Tersalin',
    copy: 'Salin',
    brandRequired: '[SYSTEM] ⚠ nama merek wajib',
    aborted: '[SYSTEM] ⧖ dibatalkan',
  },
  th: {
    subtitle: 'MemeCMO ◆ ศูนย์บัญชาการอาเซียน',
    title: 'ศูนย์บัญชาการ GEO หลายเอเจนต์เอเชียตะวันออกเฉียงใต้',
    grid: 'กริด',
    risk: 'ความเสี่ยง',
    live: 'ออนไลน์',
    standby: 'เตรียมพร้อม',
    awaiting: 'รอคำสั่ง',
    brandLabel: 'รหัสแบรนด์',
    brandPlaceholder: 'เช่น Shopee, ByteDance…',
    theaterLabel: 'พื้นที่เป้าหมาย',
    deploy: 'ปรับใช้เมทริกซ์',
    deploying: 'กำลังปรับใช้…',
    abort: 'ยกเลิก',
    agentRoster: 'รายชื่อเอเจนต์',
    terminalStream: 'สตรีมเทอร์มินัล',
    events: 'เหตุการณ์',
    awaitingDeploy: '// รอการปรับใช้',
    guardianTitle: 'แจ้งเตือนภูมิรัฐศาสตร์และวัฒนธรรม',
    guardianIdle: '// ผู้พิทักษ์เตรียมพร้อม',
    mitigation: '⟶ บรรเทา:',
    mediaRadar: 'เรดาร์สื่อ T1',
    radarIdle: '// เรดาร์ปิด',
    execSummary: 'สรุปผู้บริหาร',
    priorityNodes: 'โหนดสำคัญ',
    competitorTitle: 'เรดาร์คู่แข่งภูมิภาค',
    competitorIdle: '// สแกนเนอร์เตรียมพร้อม',
    marketSummary: 'ภูมิทัศน์ตลาด',
    addCompetitor: 'เพิ่มคู่แข่ง',
    corpusOutput: 'เอาต์พุตคอร์ปัส · JSON-LD',
    corpusIdle: '// สถาปนิกเตรียมพร้อม',
    nativeStatement: 'ข้อความภาษาแม่',
    englishGloss: 'คำแปลอังกฤษ',
    copied: 'คัดลอกแล้ว',
    copy: 'คัดลอก',
    brandRequired: '[SYSTEM] ⚠ ต้องระบุชื่อแบรนด์',
    aborted: '[SYSTEM] ⧖ ยกเลิก',
  },
};

// ─── Types matching the SSE backend ────────────────────────────────────────────

type AgentId =
  | 'corpus_scout'
  | 'geo_guardian'
  | 'competitor_scanner'
  | 'geo_diagnostician'
  | 'geo_architect';

interface AgentMeta {
  id: AgentId;
  displayName: string;
  codeName: string;
  bot: string;
}

type AgentStatus = 'idle' | 'running' | 'done' | 'error';

interface AgentState {
  meta: AgentMeta;
  status: AgentStatus;
  latencyMs?: number;
  parsed?: unknown;
  raw?: string;
  error?: string;
  botUsed?: string;
}

interface TerminalLine {
  id: number;
  agent?: AgentId;
  level: 'info' | 'warn' | 'error' | 'done';
  text: string;
  time: string;
}

interface MediaNode {
  name: string;
  type: string;
  trust_weight: number;
  brand_sov: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  injection_strategy: string;
}

interface BrandProfile {
  industry: string;
  industry_en: string;
  sub_category: string;
  description_native: string;
  description_cn: string;
  local_presence: 'NONE' | 'ENTERING' | 'ESTABLISHED' | 'LEADER';
  local_presence_reason: string;
}

interface ScoutPayload {
  brand_profile?: BrandProfile;
  analysis_summary: string;
  media_nodes: MediaNode[];
}

interface RiskItem {
  title: string;
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  description: string;
  mitigation: string;
}

interface GuardianPayload {
  risk_level: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'UNKNOWN';
  executive_verdict: string;
  risks: RiskItem[];
}

interface ArchitectPayload {
  language: string;
  native_statement: string;
  english_gloss: string;
  jsonld: Record<string, unknown>;
}

interface CompetitorItem {
  name: string;
  origin: '本地' | '跨国' | string;
  homepage: string;
  domain: string;
  category: string;
  threat_level: 'HIGH' | 'MEDIUM' | 'LOW';
  local_positioning: string;
  key_strength: string;
}

interface CompetitorPayload {
  industry?: string;
  industry_en?: string;
  sub_category?: string;
  market_summary: string;
  competitors: CompetitorItem[];
}

// ─── GEO Diagnostician 六维诊断 ────────────────────────────────────────────
type GEOAxis = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6';

interface ScorecardItem {
  axis: GEOAxis;
  axis_name_zh: string;
  axis_name_en: string;
  score: number;
  evidence: string[];
  gap: string;
}

interface QueryMatrixRow {
  stage: 'awareness' | 'consideration' | 'comparison' | 'purchase' | 'support' | 'crisis';
  query_native: string;
  query_cn: string;
  brand_rank: number;
  competitor_ranks: Array<{ name: string; rank: number }>;
  diagnosis: string;
}

interface Prescription {
  id: string;
  axis: GEOAxis;
  action: string;
  rationale: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  effort: 'HIGH' | 'MEDIUM' | 'LOW';
  time_to_signal: string;
  example_assets: string[];
}

interface DiagnosticianPayload {
  scorecard: ScorecardItem[];
  overall_score: number;
  verdict: string;
  query_matrix: { queries: QueryMatrixRow[] };
  prescriptions: Prescription[];
}

type AuditTab = 'Health' | 'Links' | 'Technical' | 'AI' | 'GEO' | 'Checks';

interface BrandAuditResult {
  url: string;
  fetched: boolean;
  error?: string;
  httpStatus?: number;
  contentType?: string;
  latencyMs?: number;
  overallScore?: number;
  dims?: Record<string, number>;
  fields?: {
    title: string | null;
    description: string | null;
    canonical: string | null;
    lang: string | null;
    viewport: string | null;
    robots: string | null;
    ogTitle: string | null;
    ogImage: string | null;
    twitterCard: string | null;
    author: string | null;
    hreflang: string[];
    schemaTypes: string[];
    jsonldCount: number;
    wordCount: number;
    readability: number;
    sampleSentence: string;
    images: { total: number; withAlt: number; lazy: number };
    links: { internal: number; external: number; nofollow: number; anchorsEmpty: number };
  };
  issues?: Array<{ severity: 'critical' | 'warn' | 'info'; dimension: string; message: string }>;
}

// ─── Probe types (empirical multi-LLM measurement) ──────────────────────────
interface ProbeAnalysis {
  brand_mentioned: boolean;
  mention_count: number;
  first_position_pct: number | null;
  candidate_entities: string[];
  answer_length: number;
}
interface ProbeAnswer {
  stage: string;
  modelId: string;
  modelDisplayName: string;
  botUsed?: string;
  ok: boolean;
  answer: string;
  error?: string;
  latencyMs: number;
  analysis: ProbeAnalysis;
}
interface ProbeCoverage {
  displayName: string;
  totalAnswered: number;
  mentionRate: number;
  avgFirstPositionPct: number | null;
  avgMentionCount: number;
  firstPositionShare: number;
}
interface ProbeCompetitorItem {
  name: string;
  mentions: number;
  coverage_cells: number;
  cross_model: number;
}
interface ProbeSummary {
  brandName: string;
  targetCountry: string;
  totalCalls: number;
  successfulCalls: number;
  overallMentionRate: number;
  answerInclusionRate: number;
  coverageByModel: Record<string, ProbeCoverage>;
  stageBreakdown: Record<string, { mentionRate: number; answersWithBrand: number; total: number }>;
  competitorFrequency: ProbeCompetitorItem[];
  completedAt: string;
}
interface ProbeBoot {
  brandName: string;
  targetCountry: string;
  probes: Array<{ stage: string; native: string; cn: string }>;
  models: Array<{ id: string; displayName: string }>;
  totalCalls: number;
  startedAt: string;
}

// ─── Agent presets ─────────────────────────────────────────────────────────────

const DEFAULT_AGENTS: AgentState[] = [
  {
    meta: {
      id: 'corpus_scout',
      displayName: 'T1 语料勘探',
      codeName: 'T1 Corpus Scout',
      bot: 'Claude-3.5-Sonnet',
    },
    status: 'idle',
  },
  {
    meta: {
      id: 'geo_guardian',
      displayName: '地缘合规审计官',
      codeName: 'Geopolitical Guardian',
      bot: 'GPT-4o',
    },
    status: 'idle',
  },
  {
    meta: {
      id: 'competitor_scanner',
      displayName: '区域竞品扫描',
      codeName: 'Competitor Scanner',
      bot: 'Claude-Sonnet-4.5',
    },
    status: 'idle',
  },
  {
    meta: {
      id: 'geo_diagnostician',
      displayName: 'GEO 六维诊断',
      codeName: 'GEO Diagnostician',
      bot: 'Claude-Sonnet-4.5',
    },
    status: 'idle',
  },
  {
    meta: {
      id: 'geo_architect',
      displayName: '高阶语料生成',
      codeName: 'GEO Architect',
      bot: 'Gemini-1.5-Pro',
    },
    status: 'idle',
  },
];

const COUNTRIES = [
  { code: 'Vietnam', label: 'Vietnam / 越南' },
  { code: 'Indonesia', label: 'Indonesia / 印尼' },
  { code: 'Thailand', label: 'Thailand / 泰国' },
  { code: 'Philippines', label: 'Philippines / 菲律宾' },
  { code: 'Singapore', label: 'Singapore / 新加坡' },
  { code: 'Malaysia', label: 'Malaysia / 马来西亚' },
];

// ISO-3166-1 alpha-2 mapping for regional audit
const COUNTRY_ISO: Record<string, string> = {
  Vietnam: 'VN',
  Indonesia: 'ID',
  Thailand: 'TH',
  Singapore: 'SG',
  Malaysia: 'MY',
  Philippines: 'PH',
  Cambodia: 'KH',
  Myanmar: 'MM',
  Laos: 'LA',
  Brunei: 'BN',
};

// ─── Page ──────────────────────────────────────────────────────────────────────

// Guess a plausible homepage when user leaves the field blank.
// Not authoritative — agents will self-correct using the declared industry,
// but this gives them a grounding hint.
function guessHomepage(brand: string, country: string): string {
  const slug = brand
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
  if (!slug) return '';
  const tld =
    country === 'Vietnam' ? '.vn' :
    country === 'Indonesia' ? '.co.id' :
    country === 'Thailand' ? '.co.th' :
    country === 'Philippines' ? '.ph' :
    country === 'Singapore' ? '.sg' :
    country === 'Malaysia' ? '.com.my' :
    '.com';
  return `https://${slug}${tld}`;
}

export default function SEACommandCenterPage() {
  const { user, loading: authLoading } = useAuth();
  const isAuthed = !!user;
  const [brandName, setBrandName] = useState('');
  const [brandHomepage, setBrandHomepage] = useState('');
  const [targetCountry, setTargetCountry] = useState('Vietnam');
  const [locale, setLocale] = useState<Locale>('zh');
  const [agents, setAgents] = useState<AgentState[]>(DEFAULT_AGENTS);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [riskLevel, setRiskLevel] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [customCompetitors, setCustomCompetitors] = useState<CompetitorItem[]>([]);
  const [probeBoot, setProbeBoot] = useState<ProbeBoot | null>(null);
  const [probeAnswers, setProbeAnswers] = useState<ProbeAnswer[]>([]);
  const [probeSummary, setProbeSummary] = useState<ProbeSummary | null>(null);
  const [probing, setProbing] = useState(false);
  // Merge with English fallback so any missing key in vi/id/th gracefully resolves.
  const t = useMemo(
    () => ({ ...I18N.en, ...I18N[locale] }),
    [locale],
  );
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const lineIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const pushLine = useCallback(
    (line: Omit<TerminalLine, 'id' | 'time'> & { time?: string }) => {
      setTerminalLines((prev) => [
        ...prev,
        {
          id: ++lineIdRef.current,
          time: line.time ?? new Date().toISOString().slice(11, 19),
          ...line,
        },
      ]);
    },
    [],
  );

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLines]);

  // Fallback SSE parser over fetch() — works on Vercel edge + node.
  const streamOrchestrator = useCallback(
    async (signal: AbortSignal) => {
      const effectiveHomepage = brandHomepage.trim() || guessHomepage(brandName, targetCountry);
      const res = await fetch('/api/sea-orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName, targetCountry, brandHomepage: effectiveHomepage }),
        signal,
      });

      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => 'Unknown error');
        pushLine({ level: 'error', text: `[SYSTEM] orchestrator failed: ${msg}` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const lines = chunk.split('\n');
          let event = 'message';
          let dataLine = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataLine += line.slice(6);
          }
          if (!dataLine) continue;

          let data: any;
          try {
            data = JSON.parse(dataLine);
          } catch {
            continue;
          }
          handleEvent(event, data);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brandName, targetCountry],
  );

  // Stream the empirical probe runner in parallel with the orchestrator.
  const streamProbes = useCallback(
    async (signal: AbortSignal) => {
      setProbing(true);
      setProbeBoot(null);
      setProbeAnswers([]);
      setProbeSummary(null);
      try {
        const res = await fetch('/api/brand-probes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandName, targetCountry }),
          signal,
        });
        if (!res.ok || !res.body) {
          const msg = await res.text().catch(() => 'Unknown error');
          pushLine({ level: 'error', text: `[PROBE] runner failed: ${msg}` });
          setProbing(false);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const lines = chunk.split('\n');
            let event = 'message';
            let dataLine = '';
            for (const line of lines) {
              if (line.startsWith('event: ')) event = line.slice(7).trim();
              else if (line.startsWith('data: ')) dataLine += line.slice(6);
            }
            if (!dataLine) continue;
            let data: any;
            try { data = JSON.parse(dataLine); } catch { continue; }
            if (event === 'probe:boot') {
              setProbeBoot(data as ProbeBoot);
              pushLine({
                level: 'info',
                text: `[PROBE] ⟶ ${data.totalCalls} empirical calls (${data.models.length} models × ${data.probes.length} probes)`,
              });
            } else if (event === 'probe:answer') {
              const row = data as ProbeAnswer;
              setProbeAnswers((prev) => [...prev, row]);
              const pos = row.analysis.first_position_pct;
              pushLine({
                level: row.ok ? (row.analysis.brand_mentioned ? 'done' : 'warn') : 'error',
                text: `[PROBE] ${row.modelDisplayName}/${row.stage} ${row.ok ? (row.analysis.brand_mentioned ? `✓ mentioned@${pos}%` : '○ no mention') : `✗ ${row.error ?? 'error'}`}`,
              });
            } else if (event === 'probe:summary') {
              const s = data as ProbeSummary;
              setProbeSummary(s);
              pushLine({
                level: 'done',
                text: `[PROBE] ✓ overall mention ${s.overallMentionRate}% · AEO inclusion ${s.answerInclusionRate}% · ${s.competitorFrequency.length} real competitors detected`,
              });
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          pushLine({ level: 'error', text: `[PROBE] stream error: ${String(err)}` });
        }
      } finally {
        setProbing(false);
      }
    },
    [brandName, targetCountry, pushLine],
  );

  function handleEvent(event: string, data: any) {
    switch (event) {
      case 'boot': {
        pushLine({
          level: 'info',
          text: `[SYSTEM] SEA Matrix online — brand="${data.brandName}", theater="${data.targetCountry}"`,
        });
        pushLine({
          level: 'info',
          text: `[SYSTEM] ${data.agents.length} agents authorized.`,
        });
        return;
      }
      case 'agent:start': {
        setAgents((prev) =>
          prev.map((a) => (a.meta.id === data.id ? { ...a, status: 'running' } : a)),
        );
        pushLine({ agent: data.id, level: 'info', text: data.message });
        return;
      }
      case 'agent:log': {
        pushLine({ agent: data.id, level: 'info', text: data.line });
        return;
      }
      case 'agent:done': {
        setAgents((prev) =>
          prev.map((a) =>
            a.meta.id === data.id
              ? {
                  ...a,
                  status: 'done',
                  latencyMs: data.latencyMs,
                  parsed: data.parsed,
                  raw: data.raw,
                  botUsed: data.bot,
                }
              : a,
          ),
        );
        pushLine({
          agent: data.id,
          level: 'done',
          text: `[${data.codeName}] ✓ mission complete — ${data.latencyMs}ms`,
        });
        return;
      }
      case 'agent:error': {
        setAgents((prev) =>
          prev.map((a) =>
            a.meta.id === data.id ? { ...a, status: 'error', error: data.error } : a,
          ),
        );
        pushLine({
          agent: data.id,
          level: 'error',
          text: `[${data.codeName}] ✗ FAILED — ${data.error}`,
        });
        return;
      }
      case 'complete': {
        setRiskLevel(data.riskLevel ?? 'UNKNOWN');
        setCompletedAt(data.completedAt);
        pushLine({
          level: 'done',
          text: `[SYSTEM] Orchestration complete — geopolitical risk: ${data.riskLevel}`,
        });
        setIsDeploying(false);
        return;
      }
    }
  }

  const handleDeploy = async () => {
    if (!brandName.trim()) {
      pushLine({ level: 'error', text: t.brandRequired });
      return;
    }
    if (!isAuthed) {
      pushLine({
        level: 'error',
        text: '[AUTH] Multi-agent + multi-LLM probes are invite-only. Join the waitlist at /waitlist. Brand Audit / Regional AEO remain anonymously accessible.',
      });
      return;
    }
    // reset
    setAgents(DEFAULT_AGENTS.map((a) => ({ ...a, status: 'idle' })));
    setTerminalLines([]);
    setRiskLevel(null);
    setCompletedAt(null);
    setAuditResult(null);
    setIsDeploying(true);

    // Auto-fire brand audit against the resolved homepage in parallel with the
    // orchestrator stream — user no longer has to type the URL twice.
    const effectiveHomepage = brandHomepage.trim() || guessHomepage(brandName, targetCountry);
    if (effectiveHomepage) {
      pushLine({
        level: 'info',
        text: `[AUDIT] ⟶ scanning ${effectiveHomepage} (SEO/GEO/AEO)`,
      });
      runAudit(effectiveHomepage);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    // Probe runner streams independently — empirical ground truth.
    const probeTask = streamProbes(controller.signal);
    try {
      await streamOrchestrator(controller.signal);
      await probeTask;
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        pushLine({ level: 'error', text: `[SYSTEM] stream error: ${String(err)}` });
      }
    } finally {
      setIsDeploying(false);
    }
  };

  const handleAbort = () => {
    abortRef.current?.abort();
    setIsDeploying(false);
    pushLine({ level: 'warn', text: t.aborted });
  };

  // Derive widget data
  const scoutData = useMemo<ScoutPayload | null>(() => {
    const a = agents.find((x) => x.meta.id === 'corpus_scout');
    return (a?.parsed as ScoutPayload) ?? null;
  }, [agents]);

  const guardianData = useMemo<GuardianPayload | null>(() => {
    const a = agents.find((x) => x.meta.id === 'geo_guardian');
    return (a?.parsed as GuardianPayload) ?? null;
  }, [agents]);

  const architectData = useMemo<ArchitectPayload | null>(() => {
    const a = agents.find((x) => x.meta.id === 'geo_architect');
    return (a?.parsed as ArchitectPayload) ?? null;
  }, [agents]);

  const competitorData = useMemo<CompetitorPayload | null>(() => {
    const a = agents.find((x) => x.meta.id === 'competitor_scanner');
    return (a?.parsed as CompetitorPayload) ?? null;
  }, [agents]);

  const diagnosticianData = useMemo<DiagnosticianPayload | null>(() => {
    const a = agents.find((x) => x.meta.id === 'geo_diagnostician');
    return (a?.parsed as DiagnosticianPayload) ?? null;
  }, [agents]);

  // ─── Brand Audit ─────────────────────────────────────────────────────
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<BrandAuditResult | null>(null);
  const [auditTab, setAuditTab] = useState<AuditTab>('Health');

  const runAudit = useCallback(async (url: string) => {
    if (!url.trim()) return;
    setAuditing(true);
    try {
      const res = await fetch('/api/brand-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const json = (await res.json()) as BrandAuditResult;
      setAuditResult(json);
    } catch (err) {
      setAuditResult({ url, fetched: false, error: String(err) } as BrandAuditResult);
    } finally {
      setAuditing(false);
    }
  }, []);

  // ─── Regional AEO Audit ──────────────────────────────────────────────
  const [regionalAudit, setRegionalAudit] = useState<RegionalAuditResponse | null>(null);
  const [regionalLoading, setRegionalLoading] = useState(false);

  const runRegionalAudit = useCallback(async () => {
    const homepage = brandHomepage.trim() || guessHomepage(brandName, targetCountry);
    const iso = COUNTRY_ISO[targetCountry];
    if (!homepage || !iso) return;
    setRegionalLoading(true);
    try {
      const res = await fetch('/api/regional-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandHomepage: homepage, targetCountry: iso }),
      });
      const json = (await res.json()) as RegionalAuditResponse;
      setRegionalAudit(json);
    } catch (err) {
      setRegionalAudit({ verdict: 'error', error: String(err) } as RegionalAuditResponse);
    } finally {
      setRegionalLoading(false);
    }
  }, [brandHomepage, brandName, targetCountry]);

  const handleAddCompetitor = () => {
    const name = typeof window !== 'undefined' ? window.prompt('Competitor name') : null;
    if (!name) return;
    const homepage = window.prompt('Homepage URL (https://...)') ?? '';
    let domain = homepage;
    try {
      if (homepage) domain = new URL(homepage).hostname.replace(/^www\./, '');
    } catch {
      /* ignore */
    }
    setCustomCompetitors((prev) => [
      ...prev,
      {
        name,
        origin: '本地',
        homepage: homepage || `https://${domain}`,
        domain,
        category: 'Custom',
        threat_level: 'MEDIUM',
        local_positioning: 'Operator-curated entry',
        key_strength: '—',
      },
    ]);
  };

  const handleCopy = async () => {
    if (!architectData) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(architectData.jsonld, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-screen bg-[#05080d] text-[#c6fbd1] font-mono relative overflow-hidden">
      {/* ambient scanline + grid */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] bg-[linear-gradient(rgba(0,255,140,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,140,.35)_1px,transparent_1px)] bg-[size:42px_42px]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] bg-[repeating-linear-gradient(180deg,transparent_0,transparent_2px,rgba(0,255,140,.22)_3px,transparent_4px)]" />

      {/* ─── Top Control Bar ──────────────────────────────────────────────── */}
      <header className="relative border-b border-[#103928] bg-[#050b0a]/80 backdrop-blur">
        <div className="max-w-[1500px] mx-auto px-6 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Satellite className="w-5 h-5 text-[#00ff88]" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.35em] text-[#00ff88]/70">
                {t.subtitle}
              </div>
              <div className="text-sm font-bold tracking-wider text-[#d8ffe6]">
                {t.title}
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <LanguageSwitcher locale={locale} onChange={setLocale} />
            <StatusPill
              label={t.grid}
              value={isDeploying ? t.live : t.standby}
              color={isDeploying ? '#00ff88' : '#6b8a82'}
              pulse={isDeploying}
            />
            <StatusPill
              label={t.risk}
              value={riskLevel ?? '—'}
              color={colorForRisk(riskLevel)}
              pulse={riskLevel === 'CRITICAL' || riskLevel === 'HIGH'}
            />
            <div className="text-[10px] uppercase tracking-widest text-[#4f8a70]">
              {completedAt ? `T+ ${new Date(completedAt).toLocaleTimeString()}` : t.awaiting}
            </div>
          </div>
        </div>

        {/* Input Row */}
        <div className="max-w-[1500px] mx-auto px-6 py-3 border-t border-[#0d2a1f] bg-[#040908] grid grid-cols-[1fr_1.2fr_200px_auto] gap-3 items-end">
          <div>
            <label className="text-[10px] uppercase tracking-[0.3em] text-[#4f8a70] block mb-1">
              {t.brandLabel}
            </label>
            <input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder={t.brandPlaceholder}
              disabled={isDeploying}
              className="w-full bg-[#07100d] border border-[#164d33] focus:border-[#00ff88] outline-none text-[#d8ffe6] px-3 py-2 text-sm font-mono tracking-wide placeholder-[#2e6650]"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.3em] text-[#4f8a70] block mb-1">
              {t.homepageLabel}
            </label>
            <input
              value={brandHomepage}
              onChange={(e) => setBrandHomepage(e.target.value)}
              placeholder={brandName ? guessHomepage(brandName, targetCountry) : t.homepagePlaceholder}
              disabled={isDeploying}
              className="w-full bg-[#07100d] border border-[#164d33] focus:border-[#00ff88] outline-none text-[#d8ffe6] px-3 py-2 text-sm font-mono tracking-wide placeholder-[#2e6650]"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.3em] text-[#4f8a70] block mb-1">
              {t.theaterLabel}
            </label>
            <select
              value={targetCountry}
              onChange={(e) => setTargetCountry(e.target.value)}
              disabled={isDeploying}
              className="w-full bg-[#07100d] border border-[#164d33] focus:border-[#00ff88] outline-none text-[#d8ffe6] px-3 py-2 text-sm font-mono"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code} className="bg-[#07100d]">
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              {isAuthed || authLoading ? (
                <button
                  onClick={handleDeploy}
                  disabled={isDeploying || !brandName.trim() || authLoading}
                  className="relative px-5 py-2 text-sm font-bold tracking-[0.25em] uppercase bg-[#00ff88] text-[#05080d] hover:bg-[#33ffa0] disabled:bg-[#1d3a2d] disabled:text-[#4f8a70] transition border border-[#00ff88] disabled:border-[#1d3a2d] shadow-[0_0_18px_rgba(0,255,140,0.35)] disabled:shadow-none"
                >
                  {isDeploying ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> {t.deploying}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Play className="w-4 h-4" /> {t.deploy}
                    </span>
                  )}
                </button>
              ) : (
                <Link
                  href="/waitlist?source=sea_command_center_cta"
                  className="relative px-5 py-2 text-sm font-bold tracking-[0.25em] uppercase bg-[#1d3a2d] text-[#4f8a70] hover:bg-[#244c3a] hover:text-[#8ff5b5] transition border border-[#164d33] hover:border-[#00ff88] flex items-center gap-2"
                  title="加入等待列表 → 解锁完整探针"
                >
                  <Play className="w-4 h-4" /> {t.deploy}
                </Link>
              )}
              {isDeploying && (
                <button
                  onClick={handleAbort}
                  className="px-3 py-2 text-xs tracking-widest uppercase border border-[#ff3b3b] text-[#ff7676] hover:bg-[#ff3b3b]/10"
                >
                  {t.abort}
                </button>
              )}
            </div>
            {!isAuthed && !authLoading && (
              <div className="text-[9px] tracking-widest uppercase text-[#6b8a82] leading-snug">
                ⓘ <span className="text-[#b2ffb2]">Brand Audit · Regional AEO</span> 匿名可用 ·
                {' '}
                <span className="text-[#ffe066]">多智能体 + 多 LLM 探针</span> 需 <Link href="/waitlist?source=sea_command_center_banner" className="underline hover:text-[#00ff88]">加入名单</Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ─── Main Grid ────────────────────────────────────────────────────── */}
      <main className="relative max-w-[1500px] mx-auto grid grid-cols-[minmax(320px,0.75fr)_1.7fr] gap-3 p-3">
        {/* LEFT: Agent Terminal */}
        <section className="flex flex-col gap-3">
          <AgentRoster agents={agents} t={t} />
          <TerminalPanel lines={terminalLines} scrollRef={terminalRef} t={t} />
        </section>

        {/* RIGHT: Widgets */}
        <section className="flex flex-col gap-3">
          {/* GuardianAlertPanel removed — the compliance/risk content is already
              surfaced inside AboutCompanyPanel's document pack, so this panel
              was duplicative. The geo_guardian agent still runs and feeds that
              document pack via `guardianData`. */}
          <LLMProbePanel
            boot={probeBoot}
            answers={probeAnswers}
            summary={probeSummary}
            probing={probing}
          />
          <GEODiagnosticianPanel
            data={diagnosticianData}
            probeAnswers={probeAnswers}
            probeSummary={probeSummary}
            scout={scoutData}
            competitor={competitorData}
            audit={auditResult}
            brandName={brandName}
            brandUrl={auditResult?.url || brandHomepage}
            targetCountry={targetCountry}
            t={t}
          />
          <RegionalAEOPanel
            data={regionalAudit}
            loading={regionalLoading}
            onRun={runRegionalAudit}
            country={targetCountry}
            countryIso={COUNTRY_ISO[targetCountry]}
          />
          <AboutCompanyPanel
            brand={brandName}
            country={targetCountry}
            scout={scoutData}
            guardian={guardianData}
            architect={architectData}
            competitor={competitorData}
            t={t}
          />
          <BrandAuditPanel
            auditing={auditing}
            result={auditResult}
            tab={auditTab}
            onTabChange={setAuditTab}
            t={t}
          />
          <MediaRadarPanel data={scoutData} t={t} />
          <CompetitorRoster
            data={competitorData}
            custom={customCompetitors}
            onAdd={handleAddCompetitor}
            t={t}
          />
          <CorpusOutputPanel
            data={architectData}
            copied={copied}
            onCopy={handleCopy}
            t={t}
          />
        </section>

        {/* 东南亚市场情报简报 — 静态宏观底图（前身 /sea-intelligence） */}
        <SEAIntelBriefing />
      </main>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({
  label,
  value,
  color,
  pulse,
}: {
  label: string;
  value: string;
  color: string;
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1 border border-[#164d33] bg-[#050e0a]">
      <span
        className={`w-1.5 h-1.5 rounded-full ${pulse ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }}
      />
      <span className="text-[9px] uppercase tracking-[0.35em] text-[#4f8a70]">{label}</span>
      <span className="text-xs font-bold tracking-widest" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function colorForRisk(risk: string | null): string {
  switch (risk) {
    case 'CRITICAL':
      return '#ff3b3b';
    case 'HIGH':
      return '#ff8a00';
    case 'MODERATE':
      return '#ffe066';
    case 'UNKNOWN':
      return '#6b8a82';
    default:
      return '#00ff88';
  }
}

function LanguageSwitcher({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (l: Locale) => void;
}) {
  return (
    <div className="flex items-center gap-1 border border-[#164d33] bg-[#050e0a] px-1.5 py-0.5">
      <Languages className="w-3 h-3 text-[#4f8a70]" />
      {LOCALES.map((l) => (
        <button
          key={l.code}
          onClick={() => onChange(l.code)}
          className={`text-[10px] tracking-widest uppercase px-1.5 py-0.5 transition ${
            locale === l.code
              ? 'bg-[#00ff88] text-[#05080d] font-bold'
              : 'text-[#6b8a82] hover:text-[#b2ffb2]'
          }`}
          title={l.label}
        >
          {l.code}
        </button>
      ))}
    </div>
  );
}

function AgentRoster({ agents, t }: { agents: AgentState[]; t: Record<string, string> }) {
  return (
    <div className="border border-[#103928] bg-[#050b0a]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#103928] bg-[#07100d]">
        <Cpu className="w-3.5 h-3.5 text-[#00ff88]" />
        <span className="text-[10px] tracking-[0.3em] uppercase text-[#00ff88]">{t.agentRoster}</span>
      </div>
      <div className="divide-y divide-[#0d2a1f]">
        {agents.map((a) => (
          <div key={a.meta.id} className="px-3 py-2 flex items-center gap-3">
            <StatusDot status={a.status} />
            <div className="flex-1">
              <div className="text-xs font-bold tracking-wider text-[#d8ffe6]">
                {a.meta.codeName}
              </div>
              <div className="text-[10px] text-[#4f8a70] tracking-wide">
                {a.meta.displayName} ·{' '}
                {a.botUsed && a.botUsed !== a.meta.bot ? (
                  <span>
                    <span className="line-through text-[#2e6650]">{a.meta.bot}</span>{' '}
                    <span className="text-[#b2ffb2]">→ {a.botUsed}</span>
                  </span>
                ) : (
                  a.botUsed ?? a.meta.bot
                )}
              </div>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-right min-w-[72px]">
              {a.status === 'idle' && <span className="text-[#4f8a70]">idle</span>}
              {a.status === 'running' && (
                <span className="text-[#00ff88] animate-pulse">running</span>
              )}
              {a.status === 'done' && (
                <span className="text-[#b2ffb2]">{a.latencyMs}ms</span>
              )}
              {a.status === 'error' && <span className="text-[#ff3b3b]">error</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: AgentStatus }) {
  const color =
    status === 'done'
      ? '#00ff88'
      : status === 'running'
        ? '#00ff88'
        : status === 'error'
          ? '#ff3b3b'
          : '#2e6650';
  return (
    <span
      className={`w-2 h-2 rounded-full ${status === 'running' ? 'animate-pulse' : ''}`}
      style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
    />
  );
}

function TerminalPanel({
  lines,
  scrollRef,
  t,
}: {
  lines: TerminalLine[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  t: Record<string, string>;
}) {
  return (
    <div className="border border-[#103928] bg-[#030806] flex flex-col h-[240px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#103928] bg-[#07100d]">
        <Terminal className="w-3.5 h-3.5 text-[#00ff88]" />
        <span className="text-[10px] tracking-[0.3em] uppercase text-[#00ff88]">
          {t.terminalStream}
        </span>
        <span className="ml-auto text-[10px] tracking-widest text-[#4f8a70]">
          {lines.length} {t.events}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 text-[11px] leading-relaxed font-mono"
      >
        {lines.length === 0 ? (
          <div className="text-[#2e6650] italic">
            {t.awaitingDeploy}
          </div>
        ) : (
          lines.map((line) => (
            <div
              key={line.id}
              className={`whitespace-pre-wrap break-words ${colorForLine(line.level)}`}
            >
              <span className="text-[#2e6650] mr-2">[{line.time}]</span>
              {line.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function colorForLine(level: TerminalLine['level']): string {
  switch (level) {
    case 'error':
      return 'text-[#ff6b6b]';
    case 'warn':
      return 'text-[#ffa94d]';
    case 'done':
      return 'text-[#b2ffb2]';
    default:
      return 'text-[#8ff5b5]';
  }
}

// Widget 1: Geopolitical alert (red box) — collapsible
function GuardianAlertPanel({ data, t }: { data: GuardianPayload | null; t: Record<string, string> }) {
  const level = data?.risk_level ?? 'PENDING';
  const color =
    level === 'CRITICAL' ? '#ff3b3b' : level === 'HIGH' ? '#ff8a00' : level === 'MODERATE' ? '#ffe066' : '#4f8a70';
  // Start collapsed once data arrives — so it doesn't dominate the viewport.
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="border-2 bg-[#0a0403] relative"
      style={{
        borderColor: color,
        boxShadow: data ? `0 0 24px ${color}55` : undefined,
      }}
    >
      <button
        onClick={() => data && setExpanded((v) => !v)}
        disabled={!data}
        className="w-full flex items-center gap-2 px-3 py-2 border-b bg-[#150706] text-left hover:bg-[#1f0707] disabled:cursor-default transition"
        style={{ borderColor: color }}
      >
        {data ? (
          expanded ? (
            <ChevronDown className="w-3.5 h-3.5" style={{ color }} />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" style={{ color }} />
          )
        ) : null}
        <ShieldAlert className="w-4 h-4" style={{ color }} />
        <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color }}>
          {t.guardianTitle}
        </span>
        {data && (
          <span className="text-xs font-bold truncate" style={{ color }}>
            · {data.executive_verdict}
          </span>
        )}
        <span
          className="ml-auto text-[10px] font-bold tracking-widest px-2 py-0.5 border"
          style={{ color, borderColor: color }}
        >
          {level}
        </span>
        {data && (
          <span className="text-[9px] uppercase tracking-widest text-[#8a5050] ml-1">
            {data.risks.length}
          </span>
        )}
      </button>
      {!data && (
        <div className="p-3 text-[#4f8a70] text-xs italic">{t.guardianIdle}</div>
      )}
      {data && expanded && (
        <div className="p-3">
          <>
            <div className="flex items-start gap-2 mb-3 p-3 border border-[#3a0c0c] bg-[#180404]">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} />
              <div className="text-sm font-bold tracking-wide" style={{ color }}>
                {data.executive_verdict}
              </div>
            </div>
            <div className="space-y-2">
              {data.risks.map((r, i) => (
                <div
                  key={i}
                  className="border border-[#2a0a0a] bg-[#0f0303] p-3 hover:border-[#6b1313] transition"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 border"
                        style={{
                          color: r.severity === 'CRITICAL' ? '#ff3b3b' : r.severity === 'HIGH' ? '#ff8a00' : '#ffe066',
                          borderColor:
                            r.severity === 'CRITICAL' ? '#ff3b3b' : r.severity === 'HIGH' ? '#ff8a00' : '#ffe066',
                        }}
                      >
                        {r.severity}
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.25em] text-[#8a5050]">
                        {r.category}
                      </span>
                    </div>
                  </div>
                  <div className="text-sm font-bold text-[#ffbaba] mb-1">{r.title}</div>
                  <div className="text-xs text-[#d9a0a0] leading-relaxed mb-2">{r.description}</div>
                  <div className="text-[11px] text-[#8ff5b5] border-t border-[#2a0a0a] pt-1.5">
                    <span className="text-[#4f8a70] mr-2">{t.mitigation}</span>
                    {r.mitigation}
                  </div>
                </div>
              ))}
            </div>
          </>
        </div>
      )}
    </div>
  );
}

// Widget 2: T1 Media Radar (trust weight vs. brand SOV scatter)
function MediaRadarPanel({ data, t }: { data: ScoutPayload | null; t: Record<string, string> }) {
  return (
    <div className="border border-[#103928] bg-[#050b0a]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#103928] bg-[#07100d]">
        <Radar className="w-3.5 h-3.5 text-[#00ff88]" />
        <span className="text-[10px] tracking-[0.3em] uppercase text-[#00ff88]">
          {t.mediaRadar}
        </span>
      </div>
      <div className="p-3">
        {!data ? (
          <div className="text-[#4f8a70] text-xs italic py-12 text-center">
            {t.radarIdle}
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_300px] gap-3">
            <MediaScatterPlot nodes={data.media_nodes} />
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-[#4f8a70] mb-1">
                {t.execSummary}
              </div>
              <div className="text-xs text-[#b2ffb2] border border-[#0d2a1f] p-2 bg-[#03110a] leading-relaxed max-h-[110px] overflow-y-auto">
                {data.analysis_summary}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-[#4f8a70] pt-2">
                {t.priorityNodes}
              </div>
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                {data.media_nodes.map((n, i) => (
                  <div
                    key={i}
                    className="text-[11px] border border-[#0d2a1f] p-2 bg-[#03110a]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#d8ffe6]">{n.name}</span>
                      <span
                        className={`text-[9px] tracking-widest px-1.5 py-0.5 ${
                          n.priority === 'HIGH'
                            ? 'text-[#ff3b3b] border border-[#ff3b3b]'
                            : n.priority === 'MEDIUM'
                              ? 'text-[#ffe066] border border-[#ffe066]'
                              : 'text-[#4f8a70] border border-[#4f8a70]'
                        }`}
                      >
                        {n.priority}
                      </span>
                    </div>
                    <div className="text-[#4f8a70] mt-0.5">{n.type}</div>
                    <div className="flex items-center gap-3 mt-1 text-[#8ff5b5]">
                      <span>TRUST {n.trust_weight}</span>
                      <span className="text-[#2e6650]">·</span>
                      <span>SOV {n.brand_sov}</span>
                    </div>
                    <div className="text-[10px] text-[#b2ffb2]/80 mt-1 leading-relaxed">
                      ⟶ {n.injection_strategy}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MediaScatterPlot({ nodes }: { nodes: MediaNode[] }) {
  // 0–100 on both axes. x = brand_sov, y = trust_weight.
  const W = 360;
  const H = 260;
  const pad = 28;
  const px = (v: number) => pad + (v / 100) * (W - pad * 2);
  const py = (v: number) => H - pad - (v / 100) * (H - pad * 2);

  const colorForPriority = (p: MediaNode['priority']) =>
    p === 'HIGH' ? '#ff3b3b' : p === 'MEDIUM' ? '#ffe066' : '#00ff88';

  return (
    <div className="relative border border-[#0d2a1f] bg-[#030806]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[260px]">
        {/* grid */}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={`gx-${v}`}>
            <line
              x1={px(v)}
              y1={pad}
              x2={px(v)}
              y2={H - pad}
              stroke="#103928"
              strokeDasharray="3 4"
            />
            <text
              x={px(v)}
              y={H - pad + 12}
              fontSize="8"
              fill="#2e6650"
              textAnchor="middle"
            >
              {v}
            </text>
          </g>
        ))}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={`gy-${v}`}>
            <line
              x1={pad}
              y1={py(v)}
              x2={W - pad}
              y2={py(v)}
              stroke="#103928"
              strokeDasharray="3 4"
            />
            <text
              x={pad - 4}
              y={py(v) + 3}
              fontSize="8"
              fill="#2e6650"
              textAnchor="end"
            >
              {v}
            </text>
          </g>
        ))}

        {/* axis labels */}
        <text x={W / 2} y={H - 4} fontSize="9" fill="#4f8a70" textAnchor="middle" letterSpacing="2">
          BRAND SOV →
        </text>
        <text
          x={8}
          y={H / 2}
          fontSize="9"
          fill="#4f8a70"
          textAnchor="middle"
          letterSpacing="2"
          transform={`rotate(-90 8 ${H / 2})`}
        >
          TRUST WEIGHT →
        </text>

        {/* quadrant label: upper-left = high trust, low sov = injection target */}
        <rect
          x={pad}
          y={pad}
          width={(W - pad * 2) / 2}
          height={(H - pad * 2) / 2}
          fill="url(#target)"
          opacity="0.18"
        />
        <defs>
          <linearGradient id="target" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#ff3b3b" />
            <stop offset="100%" stopColor="#00ff88" />
          </linearGradient>
        </defs>
        <text x={pad + 6} y={pad + 12} fontSize="8" fill="#ff7676" letterSpacing="1">
          ◆ INJECTION TARGET ZONE
        </text>

        {/* points */}
        {nodes.map((n, i) => {
          const c = colorForPriority(n.priority);
          return (
            <g key={i}>
              <circle
                cx={px(n.brand_sov)}
                cy={py(n.trust_weight)}
                r="6"
                fill={c}
                opacity="0.85"
              />
              <circle
                cx={px(n.brand_sov)}
                cy={py(n.trust_weight)}
                r="11"
                fill="none"
                stroke={c}
                strokeOpacity="0.4"
              />
              <text
                x={px(n.brand_sov) + 9}
                y={py(n.trust_weight) - 8}
                fontSize="9"
                fill="#d8ffe6"
              >
                {n.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Widget 2.5: Regional Competitor Radar
function CompetitorRoster({
  data,
  custom,
  onAdd,
  t,
}: {
  data: CompetitorPayload | null;
  custom: CompetitorItem[];
  onAdd: () => void;
  t: Record<string, string>;
}) {
  const merged: CompetitorItem[] = [...(data?.competitors ?? []), ...custom];
  const threatColor = (lvl: string) =>
    lvl === 'HIGH' ? '#ff3b3b' : lvl === 'MEDIUM' ? '#ffe066' : '#00ff88';

  return (
    <div className="border border-[#103928] bg-[#050b0a]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#103928] bg-[#07100d]">
        <Swords className="w-3.5 h-3.5 text-[#00ff88]" />
        <span className="text-[10px] tracking-[0.3em] uppercase text-[#00ff88]">
          {t.competitorTitle}
        </span>
        {data && (
          <span className="ml-auto text-[10px] tracking-widest text-[#4f8a70]">
            {merged.length} targets
          </span>
        )}
      </div>
      <div className="p-3">
        {!data && custom.length === 0 ? (
          <div className="text-[#4f8a70] text-xs italic py-6 text-center">
            {t.competitorIdle}
          </div>
        ) : (
          <>
            {data?.market_summary && (
              <div className="mb-3 text-xs text-[#b2ffb2] border border-[#0d2a1f] bg-[#03110a] p-2 leading-relaxed">
                <span className="text-[#4f8a70] text-[10px] uppercase tracking-widest mr-2">
                  {t.marketSummary}:
                </span>
                {data.market_summary}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {merged.map((c, i) => (
                <a
                  key={`${c.name}-${i}`}
                  href={c.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group border border-[#0d2a1f] bg-[#03110a] p-2.5 hover:border-[#00ff88]/50 hover:bg-[#07160f] transition flex flex-col gap-1.5"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-[#07100d] border border-[#164d33] flex items-center justify-center shrink-0 overflow-hidden">
                      {c.domain ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${c.domain}&sz=64`}
                          alt={c.name}
                          className="w-5 h-5"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <span className="text-[9px] text-[#4f8a70]">{c.name.slice(0, 2)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-[#d8ffe6] truncate">{c.name}</div>
                      <div className="text-[9px] uppercase tracking-widest text-[#4f8a70] truncate">
                        {c.origin} · {c.category}
                      </div>
                    </div>
                    <span
                      className="text-[8px] font-bold tracking-widest px-1 py-0.5 border shrink-0"
                      style={{ color: threatColor(c.threat_level), borderColor: threatColor(c.threat_level) }}
                    >
                      {c.threat_level}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#8ff5b5]/80 leading-snug line-clamp-2">
                    {c.local_positioning}
                  </div>
                  <div className="flex items-center justify-between text-[9px] pt-1 border-t border-[#0d2a1f]">
                    <span className="text-[#4f8a70] truncate">{c.domain}</span>
                    <ExternalLink className="w-3 h-3 text-[#4f8a70] group-hover:text-[#00ff88] shrink-0" />
                  </div>
                </a>
              ))}

              {/* Add Competitor Button */}
              <button
                onClick={onAdd}
                className="border border-dashed border-[#164d33] bg-[#020604] hover:border-[#00ff88]/50 hover:bg-[#03110a] transition flex flex-col items-center justify-center gap-1.5 p-4 text-[#4f8a70] hover:text-[#00ff88] min-h-[110px]"
              >
                <Plus className="w-5 h-5" />
                <span className="text-[10px] uppercase tracking-widest">{t.addCompetitor}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Widget 3: Authorized Corpus Output
function CorpusOutputPanel({
  data,
  copied,
  onCopy,
  t,
}: {
  data: ArchitectPayload | null;
  copied: boolean;
  onCopy: () => void;
  t: Record<string, string>;
}) {
  const jsonString = data ? JSON.stringify(data.jsonld, null, 2) : '';
  return (
    <div className="border border-[#103928] bg-[#050b0a]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#103928] bg-[#07100d]">
        <Activity className="w-3.5 h-3.5 text-[#00ff88]" />
        <span className="text-[10px] tracking-[0.3em] uppercase text-[#00ff88]">
          {t.corpusOutput}
        </span>
        {data && (
          <button
            onClick={onCopy}
            className="ml-auto flex items-center gap-1 text-[10px] tracking-widest uppercase text-[#b2ffb2] border border-[#164d33] px-2 py-1 hover:bg-[#0a1b14]"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? t.copied : t.copy}
          </button>
        )}
      </div>

      {!data ? (
        <div className="p-6 text-[#4f8a70] text-xs italic">
          {t.corpusIdle}
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_1.1fr]">
          <div className="p-3 border-r border-[#0d2a1f]">
            <div className="text-[10px] uppercase tracking-widest text-[#4f8a70] mb-2">
              {t.nativeStatement} [{data.language}]
            </div>
            <div className="text-sm leading-relaxed text-[#d8ffe6] mb-3 font-sans">
              {data.native_statement}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-[#4f8a70] mb-1">
              {t.englishGloss}
            </div>
            <div className="text-xs italic text-[#8ff5b5]/80 leading-relaxed font-sans">
              {data.english_gloss}
            </div>
          </div>

          <pre className="p-3 text-[11px] text-[#b2ffb2] overflow-x-auto bg-[#030806] leading-relaxed">
            <code>{jsonString}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Widget 4: About Company (summary + doc packs) ────────────────────────────
function AboutCompanyPanel({
  brand,
  country,
  scout,
  guardian,
  architect,
  competitor,
  t,
}: {
  brand: string;
  country: string;
  scout: ScoutPayload | null;
  guardian: GuardianPayload | null;
  architect: ArchitectPayload | null;
  competitor: CompetitorPayload | null;
  t: Record<string, string>;
}) {
  // Industry is DECLARED by the agents (Scout is authoritative, Competitor
  // Scanner is secondary). No more frequency-voting from competitor categories.
  const industry = scout?.brand_profile?.industry ?? competitor?.industry ?? '—';
  const subCategory = scout?.brand_profile?.sub_category ?? competitor?.sub_category ?? '';
  const descriptionNative = scout?.brand_profile?.description_native;
  const descriptionCn = scout?.brand_profile?.description_cn;
  const localPresence = scout?.brand_profile?.local_presence;
  const localPresenceReason = scout?.brand_profile?.local_presence_reason;

  const peers = (competitor?.competitors ?? []).slice(0, 6);

  const presenceMap: Record<string, { label: string; color: string }> = {
    NONE: { label: t.localPresenceNone, color: '#ff3b3b' },
    ENTERING: { label: t.localPresenceEntering, color: '#ff8a00' },
    ESTABLISHED: { label: t.localPresenceEstablished, color: '#ffe066' },
    LEADER: { label: t.localPresenceLeader, color: '#00ff88' },
  };

  // Build document packs from the various agent outputs.
  const docs = {
    brand: [
      architect?.jsonld ? 'JSON-LD Organization payload' : null,
      architect?.native_statement ? `Native statement (${architect.language})` : null,
      architect?.english_gloss ? 'English gloss' : null,
    ].filter(Boolean) as string[],
    compliance: (guardian?.risks ?? []).map((r) => `${r.severity} · ${r.title}`),
    local: [
      scout?.analysis_summary ? 'T1 media analysis summary' : null,
      competitor?.market_summary ? 'Market landscape brief' : null,
    ].filter(Boolean) as string[],
    media: (scout?.media_nodes ?? []).map((n) => `${n.name} · TRUST ${n.trust_weight} · SOV ${n.brand_sov}`),
  };

  return (
    <div className="border border-[#103928] bg-[#050b0a]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#103928] bg-[#07100d]">
        <Building2 className="w-3.5 h-3.5 text-[#00ff88]" />
        <span className="text-[10px] tracking-[0.3em] uppercase text-[#00ff88]">
          {t.aboutCompany}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1.4fr] divide-y md:divide-y-0 md:divide-x divide-[#0d2a1f]">
        {/* Overview column */}
        <div className="p-3">
          <div className="text-[10px] uppercase tracking-widest text-[#4f8a70] mb-2">
            {t.companyOverview}
          </div>
          <div className="text-sm font-bold text-[#d8ffe6] tracking-wide">
            {brand || '—'}
          </div>
          <div className="text-[11px] text-[#4f8a70] tracking-widest uppercase mt-0.5">
            {industry}
            {subCategory && <span className="text-[#2e6650]"> · {subCategory}</span>}
            <span className="text-[#2e6650]"> · {country}</span>
          </div>

          {/* Local presence badge */}
          {localPresence && presenceMap[localPresence] && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[9px] uppercase tracking-widest text-[#4f8a70]">
                {t.localPresence}:
              </span>
              <span
                className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 border"
                style={{
                  color: presenceMap[localPresence].color,
                  borderColor: presenceMap[localPresence].color,
                }}
              >
                {presenceMap[localPresence].label}
              </span>
              {localPresenceReason && (
                <span className="text-[10px] text-[#8ff5b5]/70 leading-snug">
                  — {localPresenceReason}
                </span>
              )}
            </div>
          )}

          {/* Native-language brand description (authoritative) + CN gloss */}
          {descriptionNative && (
            <div className="mt-3 border border-[#0d2a1f] bg-[#03110a] p-2 space-y-1">
              <div className="text-sm text-[#d8ffe6] leading-relaxed font-sans">
                {descriptionNative}
              </div>
              {descriptionCn && (
                <div className="text-[10px] text-[#8ff5b5]/70 leading-relaxed italic border-t border-[#0d2a1f] pt-1">
                  {descriptionCn}
                </div>
              )}
            </div>
          )}

          {/* Media-ecosystem summary */}
          <div className="text-xs text-[#b2ffb2] leading-relaxed mt-3 border border-[#0d2a1f] bg-[#03110a] p-2 max-h-[110px] overflow-y-auto">
            {scout?.analysis_summary
              ? scout.analysis_summary
              : `// ${brand || 'brand'} intelligence will appear here after deployment.`}
          </div>

          <div className="text-[10px] uppercase tracking-widest text-[#4f8a70] mt-3 mb-1.5">
            {t.industryPeers}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {peers.length === 0 ? (
              <span className="text-[10px] text-[#2e6650] italic">—</span>
            ) : (
              peers.map((p, i) => (
                <a
                  key={i}
                  href={p.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[10px] border border-[#0d2a1f] bg-[#03110a] px-1.5 py-0.5 hover:border-[#00ff88]/50 text-[#b2ffb2]"
                  title={p.local_positioning}
                >
                  {p.domain && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${p.domain}&sz=32`}
                      alt=""
                      className="w-3 h-3"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  {p.name}
                </a>
              ))
            )}
          </div>
        </div>

        {/* Document pack column */}
        <div className="p-3">
          <div className="text-[10px] uppercase tracking-widest text-[#4f8a70] mb-2">
            {t.documentPack}
          </div>
          <div className="space-y-2">
            <DocPack icon="brand" label={t.docBrand} items={docs.brand} count={docs.brand.length} />
            <DocPack icon="compliance" label={t.docCompliance} items={docs.compliance} count={docs.compliance.length} />
            <DocPack icon="local" label={t.docLocal} items={docs.local} count={docs.local.length} />
            <DocPack icon="media" label={t.docMedia} items={docs.media} count={docs.media.length} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DocPack({
  icon,
  label,
  items,
  count,
}: {
  icon: 'brand' | 'compliance' | 'local' | 'media';
  label: string;
  items: string[];
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const color =
    icon === 'compliance' ? '#ff8a00' : icon === 'media' ? '#ffe066' : '#00ff88';
  return (
    <div className="border border-[#0d2a1f] bg-[#03110a]">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={count === 0}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[#071613] disabled:cursor-default transition"
      >
        {count > 0 ? (
          open ? (
            <ChevronDown className="w-3 h-3" style={{ color }} />
          ) : (
            <ChevronRight className="w-3 h-3" style={{ color }} />
          )
        ) : (
          <span className="w-3 h-3" />
        )}
        <FileText className="w-3 h-3" style={{ color }} />
        <span className="text-[11px] tracking-widest uppercase text-[#d8ffe6] flex-1">{label}</span>
        <span
          className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 border"
          style={{ color, borderColor: color }}
        >
          {count}
        </span>
      </button>
      {open && count > 0 && (
        <ul className="border-t border-[#0d2a1f] bg-[#02100a] px-3 py-2 space-y-1">
          {items.map((it, i) => (
            <li key={i} className="text-[10px] text-[#b2ffb2] leading-snug">
              <span className="text-[#2e6650] mr-1.5">▸</span>
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Widget 5: Brand GEO/AEO Audit (Okara-style dashboard, auto-triggered) ────
function BrandAuditPanel({
  auditing,
  result,
  tab,
  onTabChange,
  t,
}: {
  auditing: boolean;
  result: BrandAuditResult | null;
  tab: AuditTab;
  onTabChange: (t: AuditTab) => void;
  t: Record<string, string>;
}) {
  const tabs: Array<{ id: AuditTab; label: string; icon: any }> = [
    { id: 'Health', label: t.dimHealth, icon: Stethoscope },
    { id: 'Links', label: t.dimLinks, icon: Link2 },
    { id: 'Technical', label: t.dimTechnical, icon: Wrench },
    { id: 'AI', label: t.dimAI, icon: Sparkles },
    { id: 'GEO', label: t.dimGEO, icon: Globe },
    { id: 'Checks', label: t.dimChecks, icon: ClipboardList },
  ];

  const scoreColor = (s: number) =>
    s >= 80 ? '#00ff88' : s >= 55 ? '#ffe066' : s >= 30 ? '#ff8a00' : '#ff3b3b';

  const issuesInTab = (result?.issues ?? []).filter((i) => i.dimension === tab);

  return (
    <div className="border border-[#103928] bg-[#050b0a]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#103928] bg-[#07100d]">
        <Stethoscope className="w-3.5 h-3.5 text-[#00ff88]" />
        <span className="text-[10px] tracking-[0.3em] uppercase text-[#00ff88]">
          {t.analyticsLabel}
        </span>
        {result?.overallScore !== undefined && (
          <span
            className="ml-auto text-[10px] font-bold tracking-widest px-2 py-0.5 border"
            style={{
              color: scoreColor(result.overallScore),
              borderColor: scoreColor(result.overallScore),
            }}
          >
            {t.overallScore}: {result.overallScore}
          </span>
        )}
      </div>

      {/* Auto-audit status banner — no manual URL input */}
      <div className="px-3 py-2 border-b border-[#0d2a1f] bg-[#03110a] flex items-center gap-2 text-[10px]">
        <Search className="w-3 h-3 text-[#4f8a70] shrink-0" />
        {auditing ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-[#00ff88]" />
            <span className="text-[#00ff88] tracking-widest uppercase">{t.auditRunning}</span>
          </>
        ) : result?.url ? (
          <>
            <span className="text-[#4f8a70] tracking-widest uppercase">Target:</span>
            <span className="text-[#d8ffe6] font-mono truncate">{result.url}</span>
            {result.fetched && result.httpStatus ? (
              <span className="ml-auto text-[#8ff5b5]">HTTP {result.httpStatus} · {result.latencyMs}ms</span>
            ) : null}
          </>
        ) : (
          <span className="text-[#4f8a70] italic">{t.auditAutoHint}</span>
        )}
      </div>

      {/* Body */}
      {!result ? (
        <div className="p-6 text-[#4f8a70] text-xs italic">{t.auditIdle}</div>
      ) : !result.fetched ? (
        <div className="p-4 text-[#ff6b6b] text-xs font-mono">
          ✗ {result.error ?? 'fetch failed'} {result.httpStatus ? `(${result.httpStatus})` : ''}
        </div>
      ) : (
        <>
          {/* Dimension score strip */}
          <div className="grid grid-cols-6 border-b border-[#0d2a1f]">
            {tabs.map(({ id, label, icon: Icon }) => {
              const score = result.dims?.[id] ?? 0;
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => onTabChange(id)}
                  className={`flex flex-col items-center gap-1 px-2 py-3 border-r border-[#0d2a1f] last:border-r-0 transition ${
                    active ? 'bg-[#071613]' : 'bg-[#03110a] hover:bg-[#051812]'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-3 h-3" style={{ color: scoreColor(score) }} />
                    <span
                      className={`text-[9px] tracking-widest uppercase ${
                        active ? 'text-[#d8ffe6]' : 'text-[#6b8a82]'
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                  <div
                    className="text-base font-bold font-mono"
                    style={{ color: scoreColor(score) }}
                  >
                    {score}
                  </div>
                  <div className="w-full h-0.5 bg-[#0d2a1f]">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${score}%`, backgroundColor: scoreColor(score) }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Tab body */}
          <div className="p-3 space-y-2">
            <AuditTabBody tab={tab} result={result} t={t} />

            {/* Issues list for this tab */}
            <div className="pt-2 border-t border-[#0d2a1f]">
              <div className="text-[10px] uppercase tracking-widest text-[#4f8a70] mb-1.5">
                {t.issues} · {tab}
              </div>
              {issuesInTab.length === 0 ? (
                <div className="text-[11px] text-[#4f8a70] italic">✓ {t.noIssues}</div>
              ) : (
                <ul className="space-y-1">
                  {issuesInTab.map((it, i) => {
                    const c =
                      it.severity === 'critical'
                        ? '#ff3b3b'
                        : it.severity === 'warn'
                          ? '#ff8a00'
                          : '#4f8a70';
                    return (
                      <li key={i} className="flex items-start gap-2 text-[11px] leading-snug">
                        <span
                          className="mt-0.5 text-[8px] font-bold tracking-widest px-1 py-0.5 border uppercase shrink-0"
                          style={{ color: c, borderColor: c }}
                        >
                          {it.severity}
                        </span>
                        <span className="text-[#d8ffe6]">{it.message}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AuditField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border border-[#0d2a1f] bg-[#03110a] p-2">
      <div className="text-[9px] uppercase tracking-widest text-[#4f8a70]">{label}</div>
      <div className="text-[11px] text-[#d8ffe6] font-mono break-all mt-0.5">
        {value || <span className="text-[#ff6b6b]">— missing</span>}
      </div>
    </div>
  );
}

function AuditTabBody({
  tab,
  result,
  t,
}: {
  tab: AuditTab;
  result: BrandAuditResult;
  t: Record<string, string>;
}) {
  const f = result.fields;
  if (!f) return null;

  if (tab === 'Health') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <AuditField label={t.fieldTitle} value={f.title} />
        <AuditField label={t.fieldCanonical} value={f.canonical} />
        <AuditField
          label={t.fieldDesc}
          value={f.description ? `${f.description} (${f.description.length} chars)` : null}
        />
        <AuditField label={t.fieldLang} value={f.lang} />
      </div>
    );
  }
  if (tab === 'Links') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <AuditField label="Internal" value={f.links.internal} />
        <AuditField label="External" value={f.links.external} />
        <AuditField label="Nofollow" value={f.links.nofollow} />
        <AuditField label="Empty anchors" value={f.links.anchorsEmpty} />
      </div>
    );
  }
  if (tab === 'Technical') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <AuditField label={t.fieldViewport} value={f.viewport} />
        <AuditField label={t.fieldRobots} value={f.robots} />
        <AuditField label="og:title" value={f.ogTitle} />
        <AuditField label="og:image" value={f.ogImage} />
        <AuditField label="twitter:card" value={f.twitterCard} />
        <AuditField label="author" value={f.author} />
      </div>
    );
  }
  if (tab === 'AI') {
    return (
      <div className="space-y-2">
        <AuditField
          label={`JSON-LD blocks (${f.jsonldCount})`}
          value={f.schemaTypes.length ? f.schemaTypes.join(' · ') : null}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {['Organization', 'WebSite', 'FAQPage', 'Article', 'Product', 'BreadcrumbList'].map((type) => {
            const present = f.schemaTypes.includes(type);
            return (
              <div
                key={type}
                className={`text-[10px] tracking-widest uppercase border p-2 text-center ${
                  present
                    ? 'text-[#00ff88] border-[#00ff88]/50 bg-[#03110a]'
                    : 'text-[#6b8a82] border-[#0d2a1f] bg-[#02080a]'
                }`}
              >
                {present ? '✓' : '—'} {type}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (tab === 'GEO') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <AuditField label={t.fieldLang} value={f.lang} />
        <AuditField
          label={t.fieldHreflang}
          value={f.hreflang.length ? f.hreflang.join(', ') : null}
        />
        <AuditField
          label="Schema · Organization"
          value={f.schemaTypes.includes('Organization') ? '✓ present' : null}
        />
        <AuditField
          label="Schema · LocalBusiness"
          value={f.schemaTypes.includes('LocalBusiness') ? '✓ present' : null}
        />
      </div>
    );
  }
  // Checks
  const altPct = f.images.total > 0 ? Math.round((f.images.withAlt / f.images.total) * 100) : 0;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <AuditField label={t.fieldWords} value={f.wordCount} />
      <AuditField label={t.fieldReadability} value={`${f.readability}/100`} />
      <AuditField
        label={t.fieldImages}
        value={`${f.images.withAlt}/${f.images.total} (${altPct}%)`}
      />
      <AuditField
        label="Lazy images"
        value={`${f.images.lazy}/${f.images.total}`}
      />
    </div>
  );
}

// ─── Widget: GEO/AEO Six-Axis Diagnostician ───────────────────────────────────

const STAGE_LABEL_KEY: Record<QueryMatrixRow['stage'], string> = {
  awareness: 'stageAwareness',
  consideration: 'stageConsideration',
  comparison: 'stageComparison',
  purchase: 'stagePurchase',
  support: 'stageSupport',
  crisis: 'stageCrisis',
};

function scoreColor(s: number) {
  return s >= 80 ? '#00ff88' : s >= 55 ? '#ffe066' : s >= 30 ? '#ff8a00' : '#ff3b3b';
}

function rankColor(r: number) {
  // 1 = own (green), 2-3 = present (cyan), 4 = weak (orange), 5 = absent (dark red)
  return r <= 1 ? '#00ff88' : r <= 3 ? '#66d9c8' : r === 4 ? '#ff8a00' : '#5a1a1a';
}

// ─── LLMProbePanel — empirical multi-LLM measurement ─────────────────────────
function LLMProbePanel({
  boot,
  answers,
  summary,
  probing,
}: {
  boot: ProbeBoot | null;
  answers: ProbeAnswer[];
  summary: ProbeSummary | null;
  probing: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [tab, setTab] = useState<'coverage' | 'matrix' | 'competitors'>('coverage');

  const hasData = !!boot || answers.length > 0 || !!summary;
  const progress = boot ? Math.min(100, Math.round((answers.length / boot.totalCalls) * 100)) : 0;

  // Index answers by stage+modelId for fast matrix lookup
  const cellMap = useMemo(() => {
    const m = new Map<string, ProbeAnswer>();
    for (const a of answers) m.set(`${a.stage}::${a.modelId}`, a);
    return m;
  }, [answers]);

  const stages = boot?.probes.map((p) => p.stage) ?? [];
  const models = boot?.models ?? [];

  return (
    <div className="border border-[#164d33] bg-[#050e0a]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-[#103928] text-left hover:bg-[#081612] transition"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-[#00ff88]" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[#00ff88]" />
        )}
        <Brain className="w-4 h-4 text-[#00ff88]" />
        <span className="text-[10px] uppercase tracking-[0.35em] text-[#00ff88]">
          LLM Share-of-Voice Probe · Empirical Multi-Model SOV Measurement
        </span>
        {summary && (
          <span className="ml-auto flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-widest text-[#4f8a70]">
              Brand SOV
            </span>
            <span
              className="text-sm font-bold"
              style={{ color: summary.overallMentionRate >= 60 ? '#00ff88' : summary.overallMentionRate >= 30 ? '#ffce00' : '#ff7676' }}
            >
              {summary.overallMentionRate}%
            </span>
            <span className="text-[10px] uppercase tracking-widest text-[#4f8a70]">
              AEO inclusion
            </span>
            <span
              className="text-sm font-bold"
              style={{ color: summary.answerInclusionRate >= 60 ? '#00ff88' : summary.answerInclusionRate >= 30 ? '#ffce00' : '#ff7676' }}
            >
              {summary.answerInclusionRate}%
            </span>
          </span>
        )}
        {!summary && probing && boot && (
          <span className="ml-auto text-[10px] tracking-widest text-[#66d9c8]">
            {answers.length}/{boot.totalCalls} · {progress}%
          </span>
        )}
      </button>

      {!hasData && (
        <div className="p-5 text-[11px] tracking-widest uppercase text-[#4f8a70]">
          Awaiting deploy — probes 3 LLMs with 6 native-language questions to measure real mention rate.
        </div>
      )}

      {hasData && expanded && (
        <div className="p-4 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-[#103928]">
            {(['coverage', 'matrix', 'competitors'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.25em] transition ${
                  tab === k
                    ? 'text-[#00ff88] border-b-2 border-[#00ff88]'
                    : 'text-[#4f8a70] hover:text-[#66d9c8]'
                }`}
              >
                {k === 'coverage' ? 'SOV by Model' : k === 'matrix' ? 'SOV × Probe Matrix' : 'Interception (Real Competitors)'}
              </button>
            ))}
          </div>

          {/* Coverage tab */}
          {tab === 'coverage' && (
            <div className="space-y-3">
              {summary ? (
                Object.entries(summary.coverageByModel).map(([id, cov]) => (
                  <div key={id} className="border border-[#103928] bg-[#040b08] p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-[#d8ffe6]">{cov.displayName}</span>
                      <span className="text-[10px] tracking-widest text-[#4f8a70]">
                        n={cov.totalAnswered}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-[10px]">
                      <Metric label="Mention" value={`${cov.mentionRate}%`} good={cov.mentionRate >= 60} mid={cov.mentionRate >= 30} />
                      <Metric label="Avg Pos" value={cov.avgFirstPositionPct != null ? `${cov.avgFirstPositionPct}%` : '—'} good={cov.avgFirstPositionPct != null && cov.avgFirstPositionPct <= 20} mid={cov.avgFirstPositionPct != null && cov.avgFirstPositionPct <= 50} />
                      <Metric label="Hero %" value={`${cov.firstPositionShare}%`} good={cov.firstPositionShare >= 60} mid={cov.firstPositionShare >= 30} />
                      <Metric label="Avg Count" value={cov.avgMentionCount.toFixed(1)} good={cov.avgMentionCount >= 2} mid={cov.avgMentionCount >= 1} />
                    </div>
                    {/* Bar */}
                    <div className="mt-2 h-1.5 bg-[#0a1f15] overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${cov.mentionRate}%`,
                          background: cov.mentionRate >= 60 ? '#00ff88' : cov.mentionRate >= 30 ? '#ffce00' : '#ff7676',
                          boxShadow: `0 0 12px ${cov.mentionRate >= 60 ? '#00ff88' : cov.mentionRate >= 30 ? '#ffce00' : '#ff7676'}`,
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-[11px] text-[#4f8a70] tracking-widest uppercase">
                  Collecting responses… {answers.length}/{boot?.totalCalls ?? 0}
                </div>
              )}

              {summary && (
                <div className="mt-3 border-t border-[#103928] pt-3">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-[#4f8a70] mb-2">
                    Stage Breakdown (AEO funnel)
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(summary.stageBreakdown).map(([stage, s]) => (
                      <div key={stage} className="border border-[#103928] bg-[#040b08] p-2">
                        <div className="text-[9px] uppercase tracking-widest text-[#4f8a70]">{stage}</div>
                        <div
                          className="text-sm font-bold"
                          style={{ color: s.mentionRate >= 60 ? '#00ff88' : s.mentionRate >= 30 ? '#ffce00' : '#ff7676' }}
                        >
                          {s.mentionRate}%
                        </div>
                        <div className="text-[9px] text-[#4f8a70]">
                          {s.answersWithBrand}/{s.total}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Matrix tab */}
          {tab === 'matrix' && boot && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr>
                    <th className="text-left p-2 border border-[#103928] text-[#4f8a70] uppercase tracking-widest">
                      Stage
                    </th>
                    {models.map((m) => (
                      <th key={m.id} className="text-left p-2 border border-[#103928] text-[#4f8a70] uppercase tracking-widest">
                        {m.displayName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stages.map((st) => (
                    <tr key={st}>
                      <td className="p-2 border border-[#103928] text-[#66d9c8] uppercase tracking-widest font-bold align-top">
                        {st}
                      </td>
                      {models.map((m) => {
                        const cell = cellMap.get(`${st}::${m.id}`);
                        if (!cell) {
                          return (
                            <td key={m.id} className="p-2 border border-[#103928] text-[#2e6650]">
                              ⟳ pending
                            </td>
                          );
                        }
                        const mentioned = cell.analysis.brand_mentioned;
                        const pos = cell.analysis.first_position_pct;
                        return (
                          <td key={m.id} className="p-2 border border-[#103928] align-top max-w-xs">
                            <div className="flex items-center gap-1 mb-1">
                              {cell.ok ? (
                                mentioned ? (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/40">
                                    ✓ @ {pos}%
                                  </span>
                                ) : (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-[#ff7676]/10 text-[#ff7676] border border-[#ff7676]/40">
                                    ○ no mention
                                  </span>
                                )
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.5 bg-[#ff3b3b]/10 text-[#ff3b3b] border border-[#ff3b3b]/40">
                                  ✗ failed
                                </span>
                              )}
                              <span className="text-[9px] text-[#4f8a70]">×{cell.analysis.mention_count}</span>
                            </div>
                            <div className="text-[10px] text-[#a8dcc0] leading-snug line-clamp-3">
                              {cell.answer.slice(0, 180)}{cell.answer.length > 180 ? '…' : ''}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Competitors tab */}
          {tab === 'competitors' && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#4f8a70] mb-3">
                Competitor SOV interception — entities the LLMs surface in answers where this brand should have appeared. Ranked by cross-model co-occurrence.
              </div>
              {summary?.competitorFrequency.length ? (
                <div className="space-y-1.5">
                  {summary.competitorFrequency.map((c, i) => (
                    <div
                      key={c.name}
                      className="flex items-center gap-3 p-2 border border-[#103928] bg-[#040b08]"
                    >
                      <span className="text-[10px] text-[#4f8a70] w-6">#{i + 1}</span>
                      <span className="text-sm font-bold text-[#d8ffe6] flex-1">{c.name}</span>
                      <span className="text-[9px] uppercase tracking-widest text-[#4f8a70]">
                        cross-model
                      </span>
                      <span className="text-xs font-bold text-[#00ff88]">{c.cross_model}</span>
                      <span className="text-[9px] uppercase tracking-widest text-[#4f8a70]">
                        cells
                      </span>
                      <span className="text-xs font-bold text-[#66d9c8]">{c.coverage_cells}</span>
                      <span className="text-[9px] uppercase tracking-widest text-[#4f8a70]">
                        mentions
                      </span>
                      <span className="text-xs font-bold text-[#66d9c8]">{c.mentions}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-[#4f8a70] tracking-widest uppercase">
                  {summary ? 'No cross-model entities detected — brand may be too niche or not yet probed.' : 'Awaiting probe summary…'}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, good, mid }: { label: string; value: string; good?: boolean; mid?: boolean }) {
  const color = good ? '#00ff88' : mid ? '#ffce00' : '#ff7676';
  return (
    <div className="border border-[#103928] bg-[#050e0a] p-1.5">
      <div className="text-[9px] uppercase tracking-widest text-[#4f8a70]">{label}</div>
      <div className="text-sm font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function GEODiagnosticianPanel({
  data,
  probeAnswers,
  probeSummary,
  scout,
  competitor,
  audit,
  brandName,
  brandUrl,
  targetCountry,
  t,
}: {
  data: DiagnosticianPayload | null;
  probeAnswers: ProbeAnswer[];
  probeSummary: ProbeSummary | null;
  scout: ScoutPayload | null;
  competitor: CompetitorPayload | null;
  audit: BrandAuditResult | null;
  brandName: string;
  brandUrl: string;
  targetCountry: string;
  t: Record<string, string>;
}) {
  const [section, setSection] = useState<'scorecard' | 'matrix' | 'prescriptions' | 'cpr'>(
    'scorecard',
  );

  // Computational PR metrics derived from the same probe data
  const cpr = useMemo<CPRReport | null>(() => {
    if (probeAnswers.length === 0) return null;
    const truthPeers = competitor?.competitors?.map((c) => c.name) ?? [];
    // Build ground truth from audit JSON-LD if present
    const schemaTypes = audit?.fields?.schemaTypes ?? [];
    const groundTruth = {
      canonical_name: brandName,
      industry: scout?.brand_profile?.industry_en || scout?.brand_profile?.industry,
      primary_category: scout?.brand_profile?.sub_category,
      // headquarters/founded/founder left undefined unless provided — KERA will skip them
    };
    return computeCPR(probeAnswers.map((a) => ({
      stage: a.stage,
      modelId: a.modelId,
      modelDisplayName: a.modelDisplayName,
      ok: a.ok,
      answer: a.answer,
      analysis: a.analysis,
    })), {
      brand: brandName,
      aliases: [],
      groundTruth,
      truthPeers,
    });
  }, [probeAnswers, competitor, audit, brandName, scout]);

  // ── Deterministic AEO scoring engine ──
  // Reality: the LLM diagnostician speculates. Whenever probe data is present
  // we overlay the measured scores on top of the LLM payload so what users see
  // is reproducible and auditable.
  const computed = useMemo<ComputedDiagnostic | null>(() => {
    if (probeAnswers.length === 0 && !probeSummary) return null;
    return computeAEODiagnostic({
      brandName,
      brandUrl,
      targetCountry,
      probeAnswers,
      probeSummary,
      scout,
      audit,
    });
  }, [probeAnswers, probeSummary, scout, audit, brandName, brandUrl, targetCountry]);

  // Merge: prefer computed scores/derivations; fall back to LLM payload fields
  // (verdict, query_matrix, prescriptions) which aren't covered by the engine.
  const merged = useMemo(() => {
    if (!computed && !data) return null;
    const computedByAxis = new Map<string, AxisResult>();
    computed?.scorecard.forEach((a) => computedByAxis.set(a.axis, a));

    const llmByAxis = new Map<string, ScorecardItem>();
    data?.scorecard.forEach((s) => llmByAxis.set(s.axis, s));

    const allAxes: GEOAxis[] = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'];
    const mergedScorecard = allAxes.map<ScorecardItem & { derivation?: AxisResult['derivation'] }>((ax) => {
      const c = computedByAxis.get(ax);
      const llm = llmByAxis.get(ax);
      if (c) {
        return {
          axis: c.axis,
          axis_name_zh: c.name_zh,
          axis_name_en: c.name_en,
          score: Math.round(c.score),
          // Evidence: derivation evidence first (measured), then LLM evidence as narrative color
          evidence: [
            ...c.derivation.evidence.slice(0, 2),
            ...(llm?.evidence || []).slice(0, 1),
          ].filter(Boolean),
          gap: c.gap,
          derivation: c.derivation,
        };
      }
      // No measured data — fall back to LLM-only (rare: means probe hasn't run)
      return llm ?? {
        axis: ax,
        axis_name_zh: ax,
        axis_name_en: ax,
        score: 0,
        evidence: ['Probe data pending'],
        gap: 'Run the SOV probe to measure this axis.',
      };
    });

    const overall = computed
      ? Math.round(computed.overall_score)
      : data?.overall_score ?? 0;
    return {
      scorecard: mergedScorecard,
      overall_score: overall,
      verdict: data?.verdict ?? (computed ? synthVerdict(computed) : ''),
      query_matrix: data?.query_matrix ?? { queries: [] },
      prescriptions: data?.prescriptions ?? [],
    };
  }, [computed, data]);

  return (
    <div className="border border-[#103928] bg-[#050b0a]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#103928] bg-[#07100d]">
        <Brain className="w-3.5 h-3.5 text-[#00ff88]" />
        <span className="text-[10px] tracking-[0.3em] uppercase text-[#00ff88]">
          {t.geoDiag}
        </span>
        {computed && (
          <span className="text-[9px] uppercase tracking-widest text-[#4f8a70]">
            · {computed.dataCoverage.probeAnswers} answers · {computed.dataCoverage.modelsObserved} models
          </span>
        )}
        {merged && (
          <span
            className="ml-auto text-[10px] font-bold tracking-widest px-2 py-0.5 border"
            style={{
              color: scoreColor(merged.overall_score),
              borderColor: scoreColor(merged.overall_score),
            }}
          >
            {merged.overall_score} / 100
          </span>
        )}
      </div>

      {!merged ? (
        <div className="p-4 text-[#4f8a70] text-xs italic">{t.geoDiagIdle}</div>
      ) : (
        <>
          {/* Verdict banner */}
          {merged.verdict && (
            <div className="px-3 py-2 border-b border-[#0d2a1f] bg-[#03110a] flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-[#00ff88] shrink-0" />
              <span className="text-[9px] uppercase tracking-widest text-[#4f8a70] shrink-0">
                {t.overallVerdict}
              </span>
              <span className="text-xs font-bold text-[#d8ffe6] leading-snug">
                {merged.verdict}
              </span>
            </div>
          )}

          {/* Empirical-scoring banner */}
          {computed && (
            <div className="px-3 py-1.5 border-b border-[#0d2a1f] bg-[#020806] text-[9px] tracking-widest uppercase text-[#4f8a70] flex items-center gap-2 flex-wrap">
              <span className="text-[#00ff88]">◆ DETERMINISTIC</span>
              <span>E3·E6 measured from {computed.dataCoverage.probeAnswers} probes</span>
              <span>·</span>
              <span>E1·E2·E4·E5 derived from evidence</span>
              {!computed.dataCoverage.hasAudit && <span className="text-[#ffbaba]">· audit pending</span>}
              {!computed.dataCoverage.hasScout && <span className="text-[#ffbaba]">· scout pending</span>}
            </div>
          )}

          {/* Section tabs */}
          <div className="grid grid-cols-4 border-b border-[#0d2a1f] text-[10px] tracking-widest uppercase">
            {[
              { id: 'scorecard' as const, label: 'Scorecard', icon: Activity },
              { id: 'matrix' as const, label: 'Query Matrix', icon: Target },
              { id: 'prescriptions' as const, label: 'Prescriptions', icon: TrendingUp },
              { id: 'cpr' as const, label: 'CPR', icon: Brain },
            ].map(({ id, label, icon: Icon }) => {
              const active = section === id;
              return (
                <button
                  key={id}
                  onClick={() => setSection(id)}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 border-r border-[#0d2a1f] last:border-r-0 transition ${
                    active
                      ? 'bg-[#071613] text-[#00ff88]'
                      : 'bg-[#03110a] text-[#6b8a82] hover:text-[#b2ffb2]'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              );
            })}
          </div>

          {section === 'scorecard' && <ScorecardSection data={merged} t={t} />}
          {section === 'matrix' && <QueryMatrixSection data={merged} t={t} />}
          {section === 'prescriptions' && <PrescriptionsSection data={merged} t={t} />}
          {section === 'cpr' && <CPRSection data={cpr} />}
        </>
      )}
    </div>
  );
}

function synthVerdict(c: ComputedDiagnostic): string {
  const weakest = [...c.scorecard].sort((a, b) => a.score - b.score)[0];
  const strongest = [...c.scorecard].sort((a, b) => b.score - a.score)[0];
  return `Overall ${Math.round(c.overall_score)}/100 — strongest on ${strongest.axis} ${strongest.name_en} (${Math.round(strongest.score)}), weakest on ${weakest.axis} ${weakest.name_en} (${Math.round(weakest.score)}).`;
}

// ─── Section 1: Scorecard (6-axis radar + per-axis cards) ─────────────────────

function ScorecardSection({
  data,
  t,
}: {
  data: AugmentedDiagnostic;
  t: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-3 p-3">
      {/* Radar */}
      <div className="border border-[#0d2a1f] bg-[#030806] p-2">
        <RadarChart scorecard={data.scorecard} />
      </div>

      {/* Per-axis cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {data.scorecard.map((item) => (
          <AxisCard key={item.axis} item={item} t={t} />
        ))}
      </div>
    </div>
  );
}

function AxisCard({
  item,
  t,
}: {
  item: ScorecardItem & { derivation?: AxisDerivation };
  t: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const c = scoreColor(item.score);
  const d = item.derivation;
  const measured = !!d;
  const insufficient = d && !d.dataSufficient;

  return (
    <div
      className="border border-[#0d2a1f] bg-[#03110a] p-2.5"
      style={{ borderLeft: `2px solid ${c}` }}
    >
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="text-[10px] tracking-widest uppercase text-[#d8ffe6] font-bold flex items-center gap-1.5 min-w-0">
          <span className="truncate">{item.axis} · {item.axis_name_en}</span>
          {measured && (
            <span
              className="text-[8px] tracking-widest px-1 border shrink-0"
              style={{ color: insufficient ? '#ffbaba' : '#00ff88', borderColor: insufficient ? '#ffbaba' : '#00ff88' }}
              title={insufficient ? 'Partial data — score may be unstable' : 'Deterministic measurement'}
            >
              {insufficient ? 'PARTIAL' : 'MEASURED'}
            </span>
          )}
        </div>
        <div className="text-sm font-bold font-mono shrink-0" style={{ color: c }}>
          {item.score}
        </div>
      </div>
      <div className="text-[10px] text-[#6b8a82] mb-1.5">{item.axis_name_zh}</div>

      {/* evidence */}
      <ul className="space-y-0.5 mb-1.5">
        {item.evidence.slice(0, 3).map((e, i) => (
          <li key={i} className="text-[10px] text-[#b2ffb2] leading-snug">
            <span className="text-[#4f8a70] mr-1">▸</span>
            {e}
          </li>
        ))}
      </ul>

      <div className="text-[10px] leading-snug pt-1 border-t border-[#0d2a1f]">
        <span className="text-[#4f8a70] uppercase tracking-widest mr-1">
          {t.gapLabel}:
        </span>
        <span className="text-[#ffbaba]">{item.gap}</span>
      </div>

      {d && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            className="mt-1.5 w-full text-left text-[9px] tracking-widest uppercase text-[#4f8a70] hover:text-[#00ff88] flex items-center justify-between"
          >
            <span>{open ? '▾ hide math' : '▸ show math'}</span>
            <span className="font-mono text-[8px] text-[#2e6650]">{d.formula.slice(0, 28)}…</span>
          </button>
          {open && (
            <div className="mt-1.5 pt-1.5 border-t border-[#0d2a1f] space-y-1.5">
              {/* Formula */}
              <div className="text-[9px] font-mono text-[#7fd9aa] leading-snug bg-[#020806] p-1.5 border border-[#0d2a1f]">
                {d.formula}
              </div>
              {/* Components */}
              <div className="space-y-1">
                {d.components.map((cmp, i) => {
                  const cc = scoreColor(cmp.value);
                  return (
                    <div key={i} className="text-[9px] leading-snug">
                      <div className="flex items-center justify-between">
                        <span className="text-[#d8ffe6]">
                          <span className="text-[#4f8a70]">×{cmp.weight.toFixed(2)}</span>{' '}
                          {cmp.label}
                        </span>
                        <span className="font-mono font-bold" style={{ color: cc }}>
                          {cmp.value.toFixed(1)}
                        </span>
                      </div>
                      {/* Bar */}
                      <div className="h-1 bg-[#0d2a1f] mt-0.5 relative">
                        <div
                          className="h-full"
                          style={{ width: `${Math.min(cmp.value, 100)}%`, backgroundColor: cc, opacity: 0.8 }}
                        />
                      </div>
                      {cmp.detail && (
                        <div className="text-[8px] text-[#6b8a82] mt-0.5 font-mono truncate" title={cmp.detail}>
                          {cmp.detail}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Raw inputs */}
              <div className="text-[8px] font-mono text-[#4f8a70] leading-snug pt-1 border-t border-[#0d2a1f]">
                {Object.entries(d.inputs).map(([k, v]) => (
                  <span key={k} className="mr-2">
                    {k}=<span className="text-[#7fd9aa]">{v === null ? '—' : String(v)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Hexagonal radar for 6 axes
function RadarChart({ scorecard }: { scorecard: ScorecardItem[] }) {
  const W = 280;
  const H = 260;
  const cx = W / 2;
  const cy = H / 2;
  const R = 90;
  // 6 axes at 60° apart, starting top
  const axes = scorecard.slice(0, 6);
  const pointAt = (i: number, r: number) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / 6;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  };

  const gridLevels = [20, 40, 60, 80, 100];
  const polygonFor = (r: number) =>
    axes
      .map((_, i) => {
        const [x, y] = pointAt(i, r);
        return `${x},${y}`;
      })
      .join(' ');

  const dataPoly = axes
    .map((a, i) => {
      const [x, y] = pointAt(i, (a.score / 100) * R);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[240px]">
      {/* grid */}
      {gridLevels.map((v) => (
        <polygon
          key={v}
          points={polygonFor((v / 100) * R)}
          fill="none"
          stroke="#103928"
          strokeDasharray="2 3"
        />
      ))}
      {/* axes */}
      {axes.map((_, i) => {
        const [x, y] = pointAt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#103928" />;
      })}
      {/* data polygon */}
      <polygon
        points={dataPoly}
        fill="rgba(0,255,136,0.18)"
        stroke="#00ff88"
        strokeWidth="1.5"
      />
      {/* data points */}
      {axes.map((a, i) => {
        const [x, y] = pointAt(i, (a.score / 100) * R);
        return (
          <g key={a.axis}>
            <circle cx={x} cy={y} r="3" fill={scoreColor(a.score)} />
            <circle cx={x} cy={y} r="6" fill="none" stroke={scoreColor(a.score)} strokeOpacity="0.4" />
          </g>
        );
      })}
      {/* labels */}
      {axes.map((a, i) => {
        const [x, y] = pointAt(i, R + 18);
        return (
          <text
            key={`l-${a.axis}`}
            x={x}
            y={y}
            fontSize="10"
            fill="#d8ffe6"
            textAnchor="middle"
            dominantBaseline="middle"
            fontWeight="bold"
          >
            {a.axis}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Section 2: Query Matrix (heatmap) ────────────────────────────────────────

function QueryMatrixSection({
  data,
  t,
}: {
  data: AugmentedDiagnostic;
  t: Record<string, string>;
}) {
  const rows = data.query_matrix.queries;
  if (!rows.length) {
    return (
      <div className="p-4 text-[10px] text-[#4f8a70] italic">
        Query matrix pending — the LLM diagnostician will populate this once it finishes analyzing probe results.
      </div>
    );
  }
  const allCompetitors = Array.from(
    new Set(rows.flatMap((r) => r.competitor_ranks.map((c) => c.name))),
  ).slice(0, 4);

  const rankLabel = (r: number) =>
    r <= 1 ? t.rankOwn : r <= 3 ? t.rankMentioned : r === 4 ? t.rankOccasional : t.rankAbsent;

  return (
    <div className="p-3">
      <div className="text-[10px] text-[#6b8a82] mb-2 leading-snug">
        {t.queryMatrixHint}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="border-b border-[#164d33]">
              <th className="text-left p-2 text-[9px] tracking-widest uppercase text-[#4f8a70] w-[40%]">
                Query
              </th>
              <th className="p-2 text-[9px] tracking-widest uppercase text-[#00ff88]">Brand</th>
              {allCompetitors.map((c) => (
                <th
                  key={c}
                  className="p-2 text-[9px] tracking-widest uppercase text-[#6b8a82] truncate max-w-[80px]"
                  title={c}
                >
                  {c.length > 10 ? c.slice(0, 10) + '…' : c}
                </th>
              ))}
              <th className="p-2 text-[9px] tracking-widest uppercase text-[#4f8a70] text-left">
                Diagnosis
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              return (
                <tr key={i} className="border-b border-[#0d2a1f] hover:bg-[#071613]">
                  <td className="p-2 align-top">
                    <div className="text-[8px] uppercase tracking-widest text-[#4f8a70] mb-0.5">
                      {t[STAGE_LABEL_KEY[row.stage]] ?? row.stage}
                    </div>
                    <div className="text-[11px] text-[#d8ffe6] leading-snug">
                      {row.query_native}
                    </div>
                    <div className="text-[10px] text-[#6b8a82] italic leading-snug">
                      {row.query_cn}
                    </div>
                  </td>
                  <td className="p-1.5 text-center align-top">
                    <RankCell rank={row.brand_rank} label={rankLabel(row.brand_rank)} isBrand />
                  </td>
                  {allCompetitors.map((c) => {
                    const hit = row.competitor_ranks.find((x) => x.name === c);
                    return (
                      <td key={c} className="p-1.5 text-center align-top">
                        {hit ? (
                          <RankCell rank={hit.rank} label={rankLabel(hit.rank)} />
                        ) : (
                          <span className="text-[#2e6650] text-[10px]">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-2 align-top text-[10px] text-[#b2ffb2] leading-snug">
                    {row.diagnosis}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 pt-2 border-t border-[#0d2a1f] text-[9px] tracking-widest uppercase text-[#4f8a70] flex-wrap">
        {[1, 2, 4, 5].map((r) => (
          <div key={r} className="flex items-center gap-1.5">
            <span
              className="w-6 h-4 border"
              style={{
                backgroundColor: `${rankColor(r)}33`,
                borderColor: rankColor(r),
              }}
            />
            <span style={{ color: rankColor(r) }}>
              rank {r} · {rankLabel(r)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankCell({
  rank,
  label,
  isBrand,
}: {
  rank: number;
  label: string;
  isBrand?: boolean;
}) {
  const c = rankColor(rank);
  return (
    <div
      className="inline-flex flex-col items-center justify-center border min-w-[48px] px-1 py-1"
      style={{
        backgroundColor: `${c}22`,
        borderColor: c,
        boxShadow: isBrand ? `0 0 8px ${c}55` : undefined,
      }}
      title={label}
    >
      <span className="text-sm font-bold font-mono" style={{ color: c }}>
        {rank}
      </span>
      <span className="text-[8px] tracking-widest uppercase" style={{ color: c }}>
        {label}
      </span>
    </div>
  );
}

// ─── Section 3: Prescriptions (prioritized actions) ───────────────────────────

function PrescriptionsSection({
  data,
  t,
}: {
  data: AugmentedDiagnostic;
  t: Record<string, string>;
}) {
  if (!data.prescriptions.length) {
    return (
      <div className="p-4 text-[10px] text-[#4f8a70] italic">
        Prescriptions pending — waiting for the LLM diagnostician to generate actionable recommendations.
      </div>
    );
  }
  const axisLabel: Record<GEOAxis, string> = {
    E1: t.axisE1,
    E2: t.axisE2,
    E3: t.axisE3,
    E4: t.axisE4,
    E5: t.axisE5,
    E6: t.axisE6,
  };

  const impactOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  const effortOrder = { LOW: 1, MEDIUM: 2, HIGH: 3 };
  const sorted = [...data.prescriptions].sort((a, b) => {
    const d = impactOrder[b.impact] - impactOrder[a.impact];
    return d !== 0 ? d : effortOrder[a.effort] - effortOrder[b.effort];
  });

  const pillColor = (v: 'HIGH' | 'MEDIUM' | 'LOW', isEffort: boolean) => {
    // high impact = green; high effort = red
    if (isEffort) return v === 'LOW' ? '#00ff88' : v === 'MEDIUM' ? '#ffe066' : '#ff8a00';
    return v === 'HIGH' ? '#00ff88' : v === 'MEDIUM' ? '#ffe066' : '#4f8a70';
  };

  return (
    <div className="p-3 space-y-2">
      <div className="text-[10px] text-[#6b8a82]">{t.prescriptionsLabel}</div>
      {sorted.map((p, i) => (
        <div
          key={p.id ?? i}
          className="border border-[#0d2a1f] bg-[#03110a] p-3 hover:border-[#00ff88]/40 transition"
          style={{ borderLeft: `3px solid ${scoreColor(data.scorecard.find((s) => s.axis === p.axis)?.score ?? 50)}` }}
        >
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[9px] font-bold tracking-widest text-[#05080d] bg-[#00ff88] px-1.5 py-0.5">
              {p.id ?? `P${i + 1}`}
            </span>
            <span className="text-[9px] tracking-widest uppercase text-[#b2ffb2] border border-[#164d33] px-1.5 py-0.5">
              {axisLabel[p.axis] ?? p.axis}
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <span
                className="text-[8px] font-bold tracking-widest px-1.5 py-0.5 border"
                style={{ color: pillColor(p.impact, false), borderColor: pillColor(p.impact, false) }}
              >
                {t.impactLabel}: {p.impact}
              </span>
              <span
                className="text-[8px] font-bold tracking-widest px-1.5 py-0.5 border"
                style={{ color: pillColor(p.effort, true), borderColor: pillColor(p.effort, true) }}
              >
                {t.effortLabel}: {p.effort}
              </span>
            </span>
          </div>
          <div className="text-sm font-bold text-[#d8ffe6] leading-snug mb-1">
            {p.action}
          </div>
          <div className="text-[11px] text-[#b2ffb2]/80 leading-snug mb-2">
            <span className="text-[#4f8a70] mr-1">⟶</span>
            {p.rationale}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-[10px] pt-2 border-t border-[#0d2a1f]">
            <div>
              <span className="text-[#4f8a70] uppercase tracking-widest mr-1">
                {t.timeToSignal}:
              </span>
              <span className="text-[#8ff5b5]">{p.time_to_signal}</span>
            </div>
            {p.example_assets?.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[#4f8a70] uppercase tracking-widest">
                  {t.exampleAssets}:
                </span>
                {p.example_assets.map((a, j) => (
                  <span
                    key={j}
                    className="text-[10px] text-[#b2ffb2] border border-[#0d2a1f] bg-[#02080a] px-1.5 py-0.5"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Section 4: Computational PR (KERA / Citation Share / SPS / VPC / IPA) ───

function CPRSection({ data }: { data: CPRReport | null }) {
  if (!data) {
    return (
      <div className="p-4 text-[10px] text-[#4f8a70] italic">
        Computational PR metrics require probe data. Launch the SOV probe first.
      </div>
    );
  }

  const { kera, citationShare, sps, vpc, ipa, dataCoverage } = data;

  const metricCard = (
    title: string,
    subtitle: string,
    score: number,
    scoreRange: [number, number],
    body: React.ReactNode,
    tag?: string,
    tagColor?: string,
  ) => {
    const [lo, hi] = scoreRange;
    const norm = Math.max(0, Math.min(100, ((score - lo) / (hi - lo)) * 100));
    const c = scoreColor(norm);
    return (
      <div className="border border-[#0d2a1f] bg-[#03110a] p-2.5" style={{ borderLeft: `2px solid ${c}` }}>
        <div className="flex items-center justify-between mb-1 gap-2">
          <div className="text-[10px] tracking-widest uppercase text-[#d8ffe6] font-bold flex items-center gap-1.5 min-w-0">
            <span className="truncate">{title}</span>
            {tag && (
              <span
                className="text-[8px] tracking-widest px-1 border shrink-0"
                style={{ color: tagColor || '#00ff88', borderColor: tagColor || '#00ff88' }}
              >
                {tag}
              </span>
            )}
          </div>
          <div className="text-sm font-bold font-mono shrink-0" style={{ color: c }}>
            {score >= 0 ? score : `${score}`}
          </div>
        </div>
        <div className="text-[9px] text-[#6b8a82] mb-1.5 font-mono">{subtitle}</div>
        {body}
      </div>
    );
  };

  return (
    <div className="p-3 space-y-2">
      {/* Header strip */}
      <div className="px-2 py-1.5 border border-[#0d2a1f] bg-[#020806] text-[9px] tracking-widest uppercase text-[#4f8a70] flex items-center gap-2 flex-wrap">
        <span className="text-[#00ff88]">◆ COMPUTATIONAL PR</span>
        <span>{dataCoverage.answersWithBrand}/{dataCoverage.answersTotal} brand-mention answers</span>
        <span>·</span>
        <span>{dataCoverage.modelsObserved} models</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* KERA */}
        {kera && metricCard(
          'KERA · Entity Recognition Accuracy',
          `N-gram match on ${kera.perAttribute.filter(p => p.tested).length}/${kera.perAttribute.length} attrs`,
          kera.score,
          [0, 100],
          <div className="space-y-1">
            {kera.perAttribute.filter(p => p.tested).map((a, i) => {
              const pct = a.totalModels ? (a.correctModels / a.totalModels) * 100 : 0;
              return (
                <div key={i} className="text-[9px] leading-snug">
                  <div className="flex items-center justify-between">
                    <span className="text-[#d8ffe6]">{a.attribute}</span>
                    <span className="font-mono font-bold" style={{ color: scoreColor(pct) }}>
                      {a.correctModels}/{a.totalModels}
                    </span>
                  </div>
                  <div className="h-1 bg-[#0d2a1f] mt-0.5 relative">
                    <div className="h-full" style={{ width: `${pct}%`, backgroundColor: scoreColor(pct), opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}
            {kera.perAttribute.filter(p => !p.tested).length > 0 && (
              <div className="text-[8px] text-[#4f8a70] pt-1 border-t border-[#0d2a1f]">
                Skipped (no ground truth): {kera.perAttribute.filter(p => !p.tested).map(p => p.attribute).join(', ')}
              </div>
            )}
          </div>,
          'MEASURED',
        )}

        {/* Citation Share */}
        {metricCard(
          'Citation Share (Zipf-weighted)',
          `w(r)=1/r · ranked ${citationShare.rankedAnswers} answers`,
          citationShare.score,
          [0, 100],
          <div className="space-y-1">
            <div className="text-[9px] text-[#b2ffb2] leading-snug mb-1">Per model</div>
            {Object.entries(citationShare.perModel).slice(0, 4).map(([mid, m]) => (
              <div key={mid} className="text-[9px] leading-snug">
                <div className="flex items-center justify-between">
                  <span className="text-[#d8ffe6] truncate">{mid}</span>
                  <span className="font-mono text-[#7fd9aa]">{m.share}% · n={m.samples}</span>
                </div>
                <div className="h-1 bg-[#0d2a1f] mt-0.5">
                  <div className="h-full" style={{ width: `${m.share}%`, backgroundColor: scoreColor(m.share), opacity: 0.7 }} />
                </div>
              </div>
            ))}
            {Object.keys(citationShare.perStage).length > 0 && (
              <div className="text-[8px] text-[#4f8a70] pt-1 border-t border-[#0d2a1f] font-mono">
                by stage: {Object.entries(citationShare.perStage).map(([s, v]) => `${s}=${v.share}%`).join(' · ')}
              </div>
            )}
          </div>,
          'MEASURED',
        )}

        {/* SPS */}
        {metricCard(
          'SPS · Sentiment Polarity',
          `lexicon-based · ±15 word window · drift=${sps.drift}`,
          sps.score,
          [-100, 100],
          <div className="space-y-1">
            {Object.entries(sps.perModel).map(([mid, v]) => (
              <div key={mid} className="text-[9px] leading-snug flex items-center justify-between">
                <span className="text-[#d8ffe6] truncate">{mid}</span>
                <span className="font-mono" style={{ color: v.polarity > 0.15 ? '#00ff88' : v.polarity < -0.15 ? '#ff6b6b' : '#ffe066' }}>
                  {v.polarity > 0 ? '+' : ''}{v.polarity.toFixed(2)} · +{v.positives}/-{v.negatives}
                </span>
              </div>
            ))}
            {sps.excerpts.length > 0 && (
              <div className="pt-1 border-t border-[#0d2a1f] space-y-0.5">
                {sps.excerpts.slice(0, 2).map((e, i) => (
                  <div key={i} className="text-[8px] text-[#b2ffb2] leading-snug">
                    <span className="font-mono" style={{ color: e.polarity > 0 ? '#00ff88' : '#ff6b6b' }}>
                      {e.polarity > 0 ? '+' : ''}{e.polarity.toFixed(2)}
                    </span>{' '}
                    <span className="text-[#6b8a82]">{e.modelId}:</span> {e.text}
                  </div>
                ))}
              </div>
            )}
            {sps.warnings.length > 0 && (
              <div className="text-[8px] text-[#ffbaba] pt-1 border-t border-[#0d2a1f]">
                ⚠ {sps.warnings[0]}
              </div>
            )}
          </div>,
          'MEASURED',
        )}

        {/* VPC */}
        {metricCard(
          'VPC · Value Proposition Consistency',
          `pairwise keyphrase jaccard = ${vpc.pairwiseJaccard}`,
          vpc.score,
          [0, 100],
          <div className="space-y-1">
            {vpc.sharedPhrases.length > 0 ? (
              <div className="text-[9px] leading-snug">
                <div className="text-[#4f8a70] mb-0.5">Shared across all models:</div>
                <div className="flex flex-wrap gap-1">
                  {vpc.sharedPhrases.slice(0, 10).map((p, i) => (
                    <span key={i} className="text-[8px] px-1 py-0.5 border border-[#00ff88]/40 text-[#b2ffb2] bg-[#071613]">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-[9px] text-[#ffbaba]">No value-prop phrases shared across all models — fragmented narrative.</div>
            )}
          </div>,
          'MEASURED',
        )}

        {/* IPA */}
        {ipa && metricCard(
          'IPA · Industry Position Alignment',
          `LLM peers ∩ truth peers / |truth|`,
          ipa.score,
          [0, 100],
          <div className="space-y-1 text-[9px] leading-snug">
            <div>
              <span className="text-[#4f8a70]">Matched:</span>{' '}
              <span className="text-[#b2ffb2]">{ipa.intersection.length > 0 ? ipa.intersection.join(', ') : '—'}</span>
            </div>
            {ipa.missingInLLM.length > 0 && (
              <div>
                <span className="text-[#4f8a70]">LLMs miss:</span>{' '}
                <span className="text-[#ffbaba]">{ipa.missingInLLM.slice(0, 6).join(', ')}</span>
              </div>
            )}
            {ipa.onlyInLLM.length > 0 && (
              <div>
                <span className="text-[#4f8a70]">Phantom peers (LLM-only):</span>{' '}
                <span className="text-[#ffe066]">{ipa.onlyInLLM.slice(0, 6).join(', ')}</span>
              </div>
            )}
          </div>,
          'MEASURED',
        )}
      </div>

      <div className="text-[8px] text-[#4f8a70] font-mono pt-2 border-t border-[#0d2a1f]">
        Methodology: docs/COMPUTATIONAL_PR_FRAMEWORK.md · All scores deterministic from probe data.
      </div>
    </div>
  );
}

// ─── Regional AEO Panel ──────────────────────────────────────────────────

function RegionalAEOPanel({
  data,
  loading,
  onRun,
  country,
  countryIso,
}: {
  data: RegionalAuditResponse | null;
  loading: boolean;
  onRun: () => void;
  country: string;
  countryIso?: string;
}) {
  return (
    <div className="border border-[#103928] bg-[#050b0a]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#103928] bg-[#07100d]">
        <Globe className="w-3.5 h-3.5 text-[#00ff88]" />
        <span className="text-[10px] tracking-[0.3em] uppercase text-[#00ff88]">
          Regional AEO Audit
        </span>
        <span className="text-[9px] tracking-widest uppercase text-[#4f8a70]">
          · {country} {countryIso && `(${countryIso})`}
        </span>
        <button
          onClick={onRun}
          disabled={loading || !countryIso}
          className="ml-auto text-[9px] tracking-widest uppercase border border-[#00ff88] text-[#00ff88] px-2 py-0.5 hover:bg-[#00ff88] hover:text-[#05080d] disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {loading ? 'Scanning…' : data ? 'Re-scan' : 'Discover Regional Site'}
        </button>
      </div>

      {!data ? (
        <div className="p-4 text-[#4f8a70] text-xs italic leading-snug">
          Global site audit isn't enough for AEO — a brand's LLM visibility in {country} depends on its
          <span className="text-[#b2ffb2]"> localized site</span>. Click "Discover Regional Site" to find the {country} canonical URL and score its native-market AEO health.
        </div>
      ) : data.verdict === 'error' ? (
        <div className="p-4 text-[#ffbaba] text-xs font-mono">{data.error}</div>
      ) : data.verdict === 'no_regional_site_found' ? (
        <div className="p-3 space-y-2">
          <div className="px-2 py-1.5 border border-[#4a1f1f] bg-[#1a0808] text-[10px] text-[#ffbaba] leading-snug">
            <span className="font-bold tracking-widest uppercase mr-2">⚠ NO REGIONAL PRESENCE</span>
            {data.message}
          </div>
          <div className="text-[9px] text-[#6b8a82] leading-snug">
            AEO recommendation: build a minimal-viable regional landing page with LocalBusiness schema,
            hreflang cluster (incl. x-default), and ≥300 words of native-language copy.
          </div>
          {data.candidates && data.candidates.length > 0 && (
            <details className="text-[9px] text-[#4f8a70]">
              <summary className="cursor-pointer hover:text-[#00ff88] tracking-widest uppercase">
                Show {data.candidates.length} failed candidates
              </summary>
              <div className="mt-1 space-y-0.5 font-mono">
                {data.candidates.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate">{c.url}</span>
                    <span className="shrink-0 text-[#6b8a82]">
                      {c.isEcho ? 'echo' : `http ${c.httpStatus}`} · fit {c.fit.score}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      ) : (
        // regional_site_identified
        <div className="p-3 space-y-3">
          {/* Winner */}
          <div className="border border-[#0d2a1f] bg-[#03110a] p-2.5" style={{ borderLeft: `3px solid ${scoreColor(data.regionalChecks?.regional_aeo_score ?? 0)}` }}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[8px] font-bold tracking-widest uppercase text-[#05080d] bg-[#00ff88] px-1.5 py-0.5">
                  {data.source?.toUpperCase()}
                </span>
                <span className="text-[10px] text-[#d8ffe6] truncate font-mono">{data.regionalUrl}</span>
              </div>
              <span
                className="text-sm font-bold font-mono shrink-0"
                style={{ color: scoreColor(data.regionalChecks?.regional_aeo_score ?? 0) }}
              >
                {data.regionalChecks?.regional_aeo_score ?? 0}
              </span>
            </div>
            <div className="text-[9px] text-[#6b8a82] leading-snug italic mb-1">
              {data.sourceRationale}
            </div>

            {/* Fit components */}
            {data.fit && (
              <div className="pt-1.5 border-t border-[#0d2a1f] space-y-0.5">
                <div className="text-[8px] tracking-widest uppercase text-[#4f8a70] mb-0.5">
                  Regional Fit {data.fit.score} · {data.fit.verdict}
                </div>
                {Object.entries(data.fit.components).map(([k, v]) => (
                  <div key={k} className="text-[9px] leading-snug">
                    <div className="flex items-center justify-between">
                      <span className="text-[#d8ffe6] font-mono">{k}</span>
                      <span className="font-mono text-[#7fd9aa]">{v}</span>
                    </div>
                    <div className="h-0.5 bg-[#0d2a1f] mt-0.5">
                      <div className="h-full" style={{ width: `${v}%`, backgroundColor: scoreColor(v), opacity: 0.7 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Regional AEO checks */}
          {data.regionalChecks && (
            <div className="border border-[#0d2a1f] bg-[#03110a] p-2.5">
              <div className="text-[9px] tracking-widest uppercase text-[#4f8a70] mb-1.5">
                Regional AEO Checks
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1 text-[9px]">
                {[
                  ['html lang matches country', data.regionalChecks.html_lang_matches_country],
                  ['hreflang cluster complete', data.regionalChecks.hreflang_cluster_complete],
                  ['x-default present', data.regionalChecks.has_x_default],
                  ['JSON-LD sameAs links', data.regionalChecks.json_ld_sameAs_links],
                  ['LocalBusiness schema', data.regionalChecks.has_LocalBusiness_schema],
                  ['native-lang content ≥300w', data.regionalChecks.content_wordcount_native_ok],
                ].map(([label, pass]) => (
                  <div key={String(label)} className="flex items-center gap-1.5">
                    <span className="font-bold" style={{ color: pass ? '#00ff88' : '#ff6b6b' }}>
                      {pass ? '✓' : '✗'}
                    </span>
                    <span className={pass ? 'text-[#b2ffb2]' : 'text-[#ffbaba]'}>{String(label)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key fields */}
          {data.fields && (
            <div className="text-[9px] text-[#6b8a82] font-mono leading-snug space-y-0.5 pt-1 border-t border-[#0d2a1f]">
              <div>lang=<span className="text-[#b2ffb2]">{data.fields.lang || '—'}</span> · hreflang=[{data.fields.hreflang.slice(0, 6).join(',')}{data.fields.hreflang.length > 6 ? '…' : ''}]</div>
              <div>schema=[{data.fields.schemaTypes.slice(0, 6).join(',')}] · jsonld={data.fields.jsonldCount} · wc={data.fields.wordCount} · nativeSig={data.fields.bodyLanguageSignal}</div>
              <div>title: <span className="text-[#b2ffb2]">{data.fields.title?.slice(0, 80) || '—'}</span></div>
            </div>
          )}

          {/* Alternatives */}
          {data.alternatives && data.alternatives.length > 0 && (
            <details className="text-[9px] text-[#4f8a70]">
              <summary className="cursor-pointer hover:text-[#00ff88] tracking-widest uppercase">
                {data.alternatives.length} alternative candidates
              </summary>
              <div className="mt-1 space-y-0.5 font-mono">
                {data.alternatives.map((a, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate">{a.url}</span>
                    <span className="shrink-0">fit {a.fit} · {a.verdict}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
