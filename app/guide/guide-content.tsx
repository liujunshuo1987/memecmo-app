'use client';

// Tri-lingual (zh / en / vi) product guide. Follows the workspace's stored
// language (localStorage 'memecmo-uilang') and theme ('memecmo-theme').
// All numbers here mirror the implementation — see page.tsx note.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';

type Lang = 'zh' | 'en' | 'vi';

const WEIGHTS = [
  { key: 'presence', pct: 30 },
  { key: 'prominence', pct: 25 },
  { key: 'competitiveShare', pct: 20 },
  { key: 'sentiment', pct: 15 },
  { key: 'citation', pct: 10 },
];

const AGENT_ROWS: { id: string; dep: string }[] = [
  { id: 'profile', dep: '—' },
  { id: 'discovery', dep: '—' },
  { id: 'answers', dep: 'discovery' },
  { id: 'monitor', dep: 'discovery' },
  { id: 'report', dep: 'monitor' },
  { id: 'optimize', dep: 'monitor' },
  { id: 'site', dep: '—' },
  { id: 'distribute', dep: 'monitor' },
  { id: 'encyclopedia', dep: '—' },
  { id: 'full_scan', dep: '—' },
];

const T: Record<Lang, any> = {
  zh: {
    langName: '中文',
    shotDashboard: '工作台:组织与项目卡片、套餐配额徽章、开客户与邀请入口',
    shotWorkspace: '工作区三栏:左侧交付物导航 · 中央 AIGVR 评分卡(仪表盘 / 首位推荐率 / 五维雷达 / 分引擎)· 右侧趋势与情报面板',
    shotDetail: '评分卡下半部:竞品声量基准 + 高意图缺口清单(每条标注引擎 / 漏斗阶段 / 出现的竞品)',
    shotAnswers: '标准答案库:20 条重点 Prompt 的越 / 英双语标准答案,逐条可复制,可导出 PDF',
    shotSandbox: '内容沙箱:发布级越南语成品稿 —— 直接编辑 / 复制,或用对话让 AI 修订当前稿',
    title: '使用说明与算法白皮书',
    subtitle: '系统怎么用 · 每个数字怎么算出来 · 出问题怎么办',
    updated: '与代码同源:本页所有常量取自实际实现,若与产品表现不符即为缺陷,请反馈。',
    backToDashboard: '返回工作台',
    sections: {
      quickstart: '快速上手',
      layout: '工作区布局',
      agents: '智能体参考(10 个)',
      aigvr: 'AIGVR 五维算法',
      topofmind: '首位推荐率与重点 Prompt',
      surfaces: '真实界面 vs API 代理',
      authority: 'Source-Authority 引用索引',
      trend: 'Day-0 基线与趋势',
      results: '结果操作:沙箱 / 顾问 / 翻译 / 导出',
      channel: '组织、邀请与配额',
      faq: '常见问题排查',
    },
    quickstart: [
      ['1 · 建项目', '工作台(Dashboard)→ 所属组织点「+ New project」:一个项目 = 一个品牌 × 一个市场(如 Focus Media × Vietnam)。'],
      ['2 · 建品牌档案', '进入项目工作区,先跑 🪪 品牌画像(Profile):抓取官网生成一份规范事实库(定义/服务/差异化/NAP),之后所有内容型智能体都以它为准,保证口径一致、不编造。'],
      ['3 · 一键全扫描', '⚡ Full Scan 串行执行 发现 → 监测 → 报告,约 4–6 分钟。首次扫描自动成为 Day-0 基线。'],
      ['4 · 读结果', '中央区看 AIGVR 评分卡与报告;右栏看趋势、声量、缺口与引用来源。'],
      ['5 · 执行建设', '按缺口依次跑 ✍️ 内容优化 / 🏗️ 官网改造 / 📣 媒体投放 / 📚 百科,产出即成品交付物;之后再扫描,验证提升。'],
    ],
    layout: [
      ['左栏 · 交付物导航', '按 建设(Setup)/ 测量(Measure)/ 执行(Act)分组的 10 个智能体;每项显示最近一次运行状态,点击查看或重跑。底部意图输入框可给 Full Scan 下达聚焦指令(如「聚焦 F&B 客户」),会改变 Discovery 的出题方向。'],
      ['中央 · 舞台', '当前选中交付物的完整结果;运行中显示分阶段进度与过程日志,完成后收敛为结果模块(可折叠过程日志)。'],
      ['右栏 · 情报面板', 'AIGVR 趋势(对比上次 Δ)、可见度、品牌排名、高意图缺口、AI 引用来源、交付物就绪清单。'],
      ['顶栏', '阅读语言(原文/中文/EN)· 界面语言(中/EN/VN)· 日/夜主题 · 返回工作台。'],
    ],
    agentCols: ['智能体', '做什么', '前置', '时长'],
    agentDesc: {
      profile: ['品牌画像:抓官网→规范事实库(定义/服务/差异化/量化事实/NAP),全体执行智能体共用,防编造', '约 45s'],
      discovery: ['Prompt 发现:生成 110 条(5 阶段×22)买家会问 AI 的问题 + 标记 20 条重点;支持意图聚焦', '约 60s'],
      answers: ['标准答案库:对 20 条重点各写一条「希望 AI 给出的答案」,市场语言+英文双语,严格锚定品牌事实', '约 60s'],
      monitor: ['AIGVR 监测:抽样查询 5 引擎,评委模型逐条打分,产出五维指数+竞品基准+缺口+引用', '约 2–4 分钟'],
      report: ['报告:把最新评分卡写成高管可读的发现+建议(周报/月报体)', '约 90s'],
      optimize: ['内容优化:把最大缺口写成发布级目标语言页面 + FAQ + FAQPage JSON-LD', '约 60s'],
      site: ['官网改造:抓你的真实主页,产出可直接粘贴的 schema.org JSON-LD + 具体修改清单', '约 60s'],
      distribute: ['媒体投放:按引用索引的高权威域名逐个生成投递稿(目录/PR/评测),分 3 档优先级', '约 60s'],
      encyclopedia: ['百科:诚实评估维基收录资格(notability),给出草稿或先建声量的现实路径', '约 60s'],
      full_scan: ['全扫描:发现 → 监测 → 报告 一键串行,断点续跑(Inngest checkpoint)', '约 4–6 分钟'],
    },
    aigvrIntro:
      '每次监测把 Prompt 库抽样后同题发给 5 个 AI 引擎,回答由评委模型(温度 0.1)逐条结构化打分,再聚合为五个维度(各 0–100)与一个综合分。',
    sampleTitle: '采样设计',
    sampleBody:
      '110 条库中,20 条重点 Prompt 每次全测,其余按阶段均衡抽样至上限 24 条;× 5 引擎 ≈ 120 次真实查询。单元格样本数决定置信标注:≥12 高 · ≥6 中 · <6 低。',
    dimName: { presence: '可见度 Presence', prominence: '显著度 Prominence', competitiveShare: '竞争声量 Competitive Share', sentiment: '情感 Sentiment', citation: '引用 Citation' },
    dimDef: {
      presence: '提及品牌的回答占全部查询的百分比。',
      prominence: '被提及时的位置得分均值:0 未提 · 1 顺带 · 2 多选之一 · 3 首选/重点推荐;按 ÷3×100 归一。',
      competitiveShare: '品牌提及次数 ÷(品牌提及 + 全部竞品提及)。竞品不是预设的——从真实回答里提取。',
      sentiment: '被提及时的态度均值:正面 1 · 中性 0.5 · 负面 0。',
      citation: '回答中引用品牌自有域名链接的比例(AEO 信号,Perplexity 与 Google AIO 贡献最多)。',
    },
    formulaTitle: '综合分公式',
    judgeTitle: '评分为什么可信',
    judgeBody:
      '不数关键词——评委模型读完整回答后输出结构化判定(是否提及/位置/情感/竞品名单),温度 0.1、批量送审;竞品名单由第二个抽取器从回答文本中提取(温度 0.2),避免「猜竞品」带来的假阳性。',
    tomBody:
      '首位推荐率(合同 KPI)= 品牌作为首选/重点推荐(prominence = 3)的回答 ÷ 全部查询。评分卡同时给出整体值与 20 条重点 Prompt 的子集值(keySet 独立成线,n = 20 × 5 引擎 = 100)。',
    surfacesBody:
      '五个引擎里,Google AI Overview 是「真实界面」——经 SerpApi 抓取真实 Google 搜索结果页(按市场本地化 gl/hl,越南 = vn/vi),用户真实看到什么就测什么;其余四个(ChatGPT/Gemini/Perplexity/Claude)走官方模型 API,是「API 代理」——同模型但非消费者界面,界面上有明确标注。某条查询 AIO 超时即记为「该题无 AIO」,不影响其他引擎。',
    authorityBody:
      '每次扫描把所有 AI 回答中的引用链接落库(geo_citations),跨扫描聚合出「AI 在这个市场真正引用哪些域名」的排行。这是平台的专有数据资产:📣 媒体投放直接按它选投放目标——在 AI 已经信任的域名上建设内容,而不是盲投。',
    trendBody:
      '项目的第一次监测自动成为 Day-0 基线,右栏趋势线展示 AIGVR/可见度/缺口随每次扫描的变化,合同的「较基线增长 ≥50%」即以此核验。注意:接入 Google AIO 后口径变化(多了一个引擎),新旧数据点不完全可比——趋势解读以同口径区间为准。',
    resultsRows: [
      ['沙箱 Refine(B 类:内容/官网/投放/百科)', '每个创作型交付物是可编辑工作副本:直接改文本、按快捷指令或自由对话让 AI 修订,版本栈可回退,复制即用。修订基于当前稿,不会推倒重来。'],
      ['顾问问答(A 类:监测/报告/全扫描)', '在结果下方直接提问(「哪个缺口先打?」),回答锚定当前数据,并给出下一步智能体的一键入口。'],
      ['阅读语言', '交付物保持市场语言(如越南语)不变,点「中文/EN」在页内翻译阅读,原始资产不动。'],
      ['重跑', '舞台头部 ↻ 按钮;监测类重跑 = 新的趋势数据点。'],
      ['导出 PDF', '舞台头部 ⤓ 按钮(或 ⌘P):白底品牌页眉文档,自动展开全部折叠内容,隐藏界面元素。'],
    ],
    channelRows: [
      ['组织三级', 'MemeCMO(总部)→ 渠道商(如 FMVN)→ 终端客户;数据行级隔离(Postgres RLS),互相不可见。'],
      ['开客户', '渠道商管理员在工作台点「+ New client」→ 总部审批队列 Approve → 客户组织激活并自动获得订阅。'],
      ['邀请成员', '组织卡片「Invite」→ 填邮箱与角色(viewer 只读 / editor 可跑 / admin 管理)→ 自动发邮件(或复制链接);对方用被邀邮箱注册/登录即入组。'],
      ['套餐配额', 'Basic 2 次 / Standard 8 次 / Premium 30 次扫描每月(计量 full_scan 与 monitor;总部与渠道商不计量)。超额返回明确提示,次月重置。'],
    ],
    faqRows: [
      ['运行失败了', '舞台会显示具体原因;点 ↻ 重跑即可——执行层有断点续跑,已完成阶段不会重复计费。'],
      ['监测很久没动', '正常时长 2–4 分钟;各引擎并行,单引擎慢不阻塞整体。若长时间停在同一进度,重跑一次。'],
      ['某引擎显示 0 样本', '多为该引擎当次全部超时(如 AIO 波动),不影响其他引擎;重扫通常恢复。'],
      ['提示配额已用完', '当月计量扫描(全扫描/监测)达套餐上限;升级套餐或等周期重置,其他智能体不受限。'],
      ['交付物语言不对', '交付物语言跟随项目的目标市场(建项目时选定),不是界面语言;要中文阅读用顶部阅读语言切换。'],
      ['邀请链接打不开', '邀请与被邀邮箱绑定且 14 天有效;确认对方用该邮箱登录,过期就重发一条。'],
    ],
  },
  en: {
    langName: 'English',
    shotDashboard: 'Dashboard: organization & project cards, plan-quota badge, client provisioning and invites',
    shotWorkspace: 'The 3-zone workspace: deliverables rail · AIGVR scorecard center stage (gauge / Top-of-Mind / radar / per-engine) · trend & context rail',
    shotDetail: 'Scorecard, lower half: competitor share-of-voice benchmark + high-intent gap list (each tagged engine / funnel stage / competitors present)',
    shotAnswers: 'Standard Answer Library: bilingual VI/EN canonical answers for the 20 key prompts — copy per item or export PDF',
    shotSandbox: 'Content sandbox: a publish-ready Vietnamese draft — edit or copy directly, or revise via dialogue',
    title: 'User Guide & Algorithm Notes',
    subtitle: 'How to use the system · how every number is computed · what to do when something breaks',
    updated: 'Source-of-truth: every constant on this page is extracted from the implementation. If the product disagrees with this page, that is a bug — please report it.',
    backToDashboard: 'Back to dashboard',
    sections: {
      quickstart: 'Quickstart',
      layout: 'Workspace layout',
      agents: 'Agent reference (10)',
      aigvr: 'The AIGVR five-dimension algorithm',
      topofmind: 'Top-of-Mind rate & key prompts',
      surfaces: 'Real surface vs API proxy',
      authority: 'Source-Authority citation index',
      trend: 'Day-0 baseline & trend',
      results: 'Working with results: sandbox / advisor / translate / export',
      channel: 'Organizations, invites & quotas',
      faq: 'Troubleshooting',
    },
    quickstart: [
      ['1 · Create a project', 'Dashboard → “+ New project” under your organization. One project = one brand × one market (e.g. Focus Media × Vietnam).'],
      ['2 · Build the brand profile', 'Run 🪪 Profile first: it fetches the official site and produces one canonical fact base (definition / services / differentiators / NAP). Every content agent grounds on it — consistent, no invention.'],
      ['3 · Run a Full Scan', '⚡ Full Scan chains Discovery → Monitor → Report, ~4–6 minutes. Your first scan automatically becomes the Day-0 baseline.'],
      ['4 · Read the results', 'Center stage: AIGVR scorecard and report. Right rail: trend, share of voice, gaps, cited sources.'],
      ['5 · Execute', 'Work the gaps with ✍️ Optimize / 🏗️ Site / 📣 Distribute / 📚 Encyclopedia — each output is a ready deliverable. Re-scan to prove the lift.'],
    ],
    layout: [
      ['Left · Deliverables', '10 agents grouped Setup / Measure / Act, each showing its latest run. The intent box at the bottom steers Full Scan (e.g. “focus on F&B buyers”) — it changes what Discovery asks.'],
      ['Center · Stage', 'The selected deliverable in full; live phase progress and process log while running, converging to result modules on completion.'],
      ['Right · Context', 'AIGVR trend (Δ vs last), presence, brand rank, high-intent gaps, AI-cited sources, deliverables-ready checklist.'],
      ['Top bar', 'Reading language (original/中文/EN) · UI language (中/EN/VN) · day/night theme · back to dashboard.'],
    ],
    agentCols: ['Agent', 'What it does', 'Needs', 'Duration'],
    agentDesc: {
      profile: ['Brand Profile: fetches the site → one canonical fact base shared by all execution agents (prevents invention)', '~45s'],
      discovery: ['Prompt Discovery: 110 buyer questions (5 funnel stages × 22) + 20 designated key prompts; supports intent focus', '~60s'],
      answers: ['Standard Answer Library: for each key prompt, the answer we want AI to give — market language + English, strictly grounded', '~60s'],
      monitor: ['AIGVR Monitor: samples the prompt set across 5 engines, judge-scores every answer, outputs the 5-dimension index + competitor benchmark + gaps + citations', '~2–4 min'],
      report: ['Report: turns the latest scorecard into executive findings + prioritized recommendations', '~90s'],
      optimize: ['Content Optimize: turns the top measured gap into a publish-ready page + FAQ + FAQPage JSON-LD in the market language', '~60s'],
      site: ['Site: fetches your real homepage, returns paste-in schema.org JSON-LD + a concrete edit list', '~60s'],
      distribute: ['Distribute: placement drafts (directory / PR / review) for each high-authority domain from the citation index, in 3 priority tiers', '~60s'],
      encyclopedia: ['Encyclopedia: honest Wikipedia notability check; a draft or the realistic build-coverage-first path', '~60s'],
      full_scan: ['Full Scan: Discovery → Monitor → Report in one click, checkpointed (resumes, never double-runs)', '~4–6 min'],
    },
    aigvrIntro:
      'Each Monitor run samples the prompt library, sends identical queries to 5 AI engines, judge-scores every answer (temperature 0.1, structured output), then aggregates five dimensions (0–100 each) and one composite.',
    sampleTitle: 'Sampling design',
    sampleBody:
      'All 20 key prompts are always measured; the rest are stage-balanced up to a cap of 24 prompts, × 5 engines ≈ 120 live queries per scan. Per-cell confidence: n≥12 high · n≥6 medium · below low.',
    dimName: { presence: 'Presence', prominence: 'Prominence', competitiveShare: 'Competitive Share', sentiment: 'Sentiment', citation: 'Citation' },
    dimDef: {
      presence: '% of all queries whose answer mentions the brand.',
      prominence: 'Average position score when mentioned: 0 absent · 1 passing · 2 one-of-several · 3 featured/top; normalized ÷3 ×100.',
      competitiveShare: 'Brand mentions ÷ (brand + all competitor mentions). Competitors are extracted from the real answers, not guessed.',
      sentiment: 'Average stance when mentioned: positive 1 · neutral 0.5 · negative 0.',
      citation: '% of answers citing the brand’s own domain (the AEO signal; mostly from Perplexity and Google AIO).',
    },
    formulaTitle: 'Composite formula',
    judgeTitle: 'Why the scoring is trustworthy',
    judgeBody:
      'No keyword counting. A judge model reads each full answer and returns a structured verdict (mentioned? position? sentiment? competitors?) at temperature 0.1, in audited batches. The competitor list itself is extracted from answer text by a separate pass (temperature 0.2) — no preset guesses, no false positives from wrong rivals.',
    tomBody:
      'Top-of-Mind rate (a contract KPI) = answers where the brand is the featured/top recommendation (prominence = 3) ÷ all queries. The scorecard reports it overall and for the 20-key-prompt subset (its own series, n = 20 × 5 engines = 100).',
    surfacesBody:
      'Google AI Overview is a real surface: fetched from actual Google result pages via SerpApi, market-localized (gl/hl; Vietnam = vn/vi) — we measure what users actually see. The other four (ChatGPT / Gemini / Perplexity / Claude) run through official model APIs and are labeled API proxies: same models, not the consumer UI. An AIO timeout counts as “no AIO for this query” and never blocks other engines.',
    authorityBody:
      'Every scan persists all citation links found in AI answers (geo_citations), aggregated across scans into a ranking of the domains AI actually cites in this market. This is proprietary data: 📣 Distribute targets exactly these domains — build presence where AI already trusts, instead of spraying.',
    trendBody:
      'The first Monitor run becomes the Day-0 baseline; the right-rail trend tracks AIGVR / presence / gaps per scan — this is how the contract’s “≥50% growth vs baseline” is verified. Note: adding Google AIO changed the engine mix, so points before/after that change aren’t strictly comparable; read trends within a consistent window.',
    resultsRows: [
      ['Sandbox refine (creative deliverables)', 'Each creative output is an editable working copy: edit inline, use quick chips or free-form dialogue to revise (revisions build on the current draft), step back through versions, copy out.'],
      ['Advisor Q&A (measurement results)', 'Ask questions right under the result (“which gap first?”); answers are grounded in the current data and end with a one-click next-agent action.'],
      ['Reading language', 'Deliverables stay in the market language; the reading toggle translates in-view without touching the canonical asset.'],
      ['Re-run', '↻ in the stage header; re-running Monitor adds a new trend point.'],
      ['Export PDF', '⤓ in the stage header (or ⌘P): white-paper document with branded header, collapsed sections auto-expanded, UI chrome removed.'],
    ],
    channelRows: [
      ['Three-tier orgs', 'MemeCMO (HQ) → channel partner (e.g. FMVN) → end clients. Row-level security (Postgres RLS) isolates tenants.'],
      ['Provisioning', 'Channel admin clicks “+ New client” → HQ approval queue → org activates with a subscription attached automatically.'],
      ['Invites', '“Invite” on the org card → email + role (viewer / editor / admin) → email auto-sends (or copy the link). The invitee must sign in with the invited email.'],
      ['Plans & quota', 'Basic 2 / Standard 8 / Premium 30 scans per month (full_scan and monitor are metered; HQ and channel partners are never metered). Over-quota returns a clear message; resets monthly.'],
    ],
    faqRows: [
      ['A run failed', 'The stage shows the reason; hit ↻. Execution is checkpointed — completed phases never re-run or double-meter.'],
      ['Monitor seems stuck', 'Normal duration is 2–4 minutes; engines run in parallel so one slow engine doesn’t block. If progress freezes for long, re-run.'],
      ['An engine shows 0 samples', 'Usually all its queries timed out that run (e.g. AIO variance); other engines are unaffected. Re-scan usually recovers.'],
      ['Quota exceeded', 'Metered scans (Full Scan / Monitor) hit the plan cap. Upgrade or wait for the period reset; other agents keep working.'],
      ['Deliverable is in the “wrong” language', 'Deliverables follow the project’s target market (chosen at creation), not the UI language. Use the reading-language toggle to read in Chinese/English.'],
      ['Invite link doesn’t work', 'Invites are bound to the invited email and expire in 14 days. Sign in with that exact email, or send a fresh invite.'],
    ],
  },
  vi: {
    langName: 'Tiếng Việt',
    shotDashboard: 'Bảng điều khiển: thẻ tổ chức & dự án, huy hiệu hạn mức gói, mở khách hàng và lời mời',
    shotWorkspace: 'Không gian làm việc 3 cột: điều hướng sản phẩm · bảng điểm AIGVR ở giữa (đồng hồ / đề xuất đầu tiên / radar / theo công cụ) · cột xu hướng & tình báo',
    shotDetail: 'Nửa dưới bảng điểm: đối sánh thị phần đối thủ + danh sách khoảng trống ý định cao (gắn nhãn công cụ / giai đoạn / đối thủ)',
    shotAnswers: 'Thư viện câu trả lời chuẩn: đáp án song ngữ Việt/Anh cho 20 prompt trọng điểm — sao chép từng mục hoặc xuất PDF',
    shotSandbox: 'Sandbox nội dung: bản thảo tiếng Việt sẵn xuất bản — sửa/sao chép trực tiếp, hoặc hội thoại để AI chỉnh tiếp',
    title: 'Hướng dẫn sử dụng & Thuật toán',
    subtitle: 'Cách dùng hệ thống · mỗi con số được tính thế nào · xử lý sự cố',
    updated: 'Đồng nguồn với mã: mọi hằng số trên trang này trích từ mã nguồn thực tế. Nếu sản phẩm khác với trang này, đó là lỗi — hãy báo cho chúng tôi.',
    backToDashboard: 'Về bảng điều khiển',
    sections: {
      quickstart: 'Bắt đầu nhanh',
      layout: 'Bố cục không gian làm việc',
      agents: 'Danh mục 10 agent',
      aigvr: 'Thuật toán AIGVR 5 chiều',
      topofmind: 'Tỷ lệ đề xuất đầu tiên & prompt trọng điểm',
      surfaces: 'Bề mặt thật vs API proxy',
      authority: 'Chỉ mục trích dẫn Source-Authority',
      trend: 'Đường cơ sở Day-0 & xu hướng',
      results: 'Thao tác kết quả: sandbox / cố vấn / dịch / xuất',
      channel: 'Tổ chức, lời mời & hạn mức',
      faq: 'Xử lý sự cố',
    },
    quickstart: [
      ['1 · Tạo dự án', 'Dashboard → “+ New project”. Một dự án = một thương hiệu × một thị trường (VD: Focus Media × Việt Nam).'],
      ['2 · Hồ sơ thương hiệu', 'Chạy 🪪 Profile trước: hệ thống đọc website chính thức và tạo một bộ dữ kiện chuẩn (định nghĩa / dịch vụ / khác biệt / NAP). Mọi agent nội dung đều bám vào đó — nhất quán, không bịa.'],
      ['3 · Full Scan', '⚡ Full Scan chạy Khám phá → Giám sát → Báo cáo, khoảng 4–6 phút. Lần quét đầu tiên tự động là đường cơ sở Day-0.'],
      ['4 · Đọc kết quả', 'Khu trung tâm: bảng điểm AIGVR và báo cáo. Cột phải: xu hướng, thị phần giọng nói, khoảng trống, nguồn được trích dẫn.'],
      ['5 · Thực thi', 'Xử lý khoảng trống bằng ✍️ Nội dung / 🏗️ Website / 📣 Truyền thông / 📚 Bách khoa — mỗi đầu ra là sản phẩm bàn giao sẵn dùng. Quét lại để chứng minh mức tăng.'],
    ],
    layout: [
      ['Trái · Sản phẩm bàn giao', '10 agent nhóm theo Setup / Measure / Act, hiển thị lần chạy gần nhất. Ô ý định phía dưới điều hướng Full Scan (VD “tập trung khách F&B”) — thay đổi hướng đặt câu hỏi của Discovery.'],
      ['Giữa · Sân khấu', 'Kết quả đầy đủ của mục đang chọn; khi chạy hiển thị tiến độ theo giai đoạn và nhật ký, xong thì gọn lại thành các khối kết quả.'],
      ['Phải · Bảng tình báo', 'Xu hướng AIGVR (Δ so với lần trước), độ hiện diện, thứ hạng, khoảng trống ý định cao, nguồn AI trích dẫn.'],
      ['Thanh trên', 'Ngôn ngữ đọc (gốc/中文/EN) · ngôn ngữ giao diện (中/EN/VN) · giao diện ngày/đêm · về dashboard.'],
    ],
    agentCols: ['Agent', 'Chức năng', 'Cần', 'Thời gian'],
    agentDesc: {
      profile: ['Hồ sơ thương hiệu: đọc website → bộ dữ kiện chuẩn dùng chung cho mọi agent (chống bịa đặt)', '~45s'],
      discovery: ['Khám phá Prompt: 110 câu hỏi người mua (5 giai đoạn × 22) + 20 prompt trọng điểm; hỗ trợ tập trung ý định', '~60s'],
      answers: ['Thư viện câu trả lời chuẩn: với mỗi prompt trọng điểm, câu trả lời ta muốn AI đưa ra — tiếng Việt + tiếng Anh, bám chặt dữ kiện', '~60s'],
      monitor: ['Giám sát AIGVR: truy vấn 5 công cụ AI, chấm điểm từng câu trả lời, xuất chỉ số 5 chiều + đối sánh đối thủ + khoảng trống + trích dẫn', '~2–4 phút'],
      report: ['Báo cáo: chuyển bảng điểm mới nhất thành phát hiện + khuyến nghị ưu tiên cho lãnh đạo', '~90s'],
      optimize: ['Tối ưu nội dung: biến khoảng trống lớn nhất thành trang sẵn xuất bản + FAQ + JSON-LD FAQPage', '~60s'],
      site: ['Website: đọc trang chủ thật của bạn, trả về JSON-LD schema.org dán-là-chạy + danh sách chỉnh sửa cụ thể', '~60s'],
      distribute: ['Phân phối: bản thảo đăng tải (danh bạ / PR / đánh giá) cho từng domain uy tín từ chỉ mục trích dẫn, chia 3 bậc ưu tiên', '~60s'],
      encyclopedia: ['Bách khoa: đánh giá trung thực khả năng lên Wikipedia; bản nháp hoặc lộ trình xây độ phủ trước', '~60s'],
      full_scan: ['Full Scan: Khám phá → Giám sát → Báo cáo một chạm, có checkpoint (chạy tiếp, không chạy trùng)', '~4–6 phút'],
    },
    aigvrIntro:
      'Mỗi lần giám sát lấy mẫu thư viện prompt, gửi cùng câu hỏi tới 5 công cụ AI, mô hình giám khảo chấm từng câu trả lời (temperature 0.1, đầu ra có cấu trúc), rồi tổng hợp 5 chiều (0–100) và một điểm tổng.',
    sampleTitle: 'Thiết kế lấy mẫu',
    sampleBody:
      '20 prompt trọng điểm luôn được đo đủ; phần còn lại lấy mẫu cân bằng theo giai đoạn tới trần 24 prompt; × 5 công cụ ≈ 120 truy vấn thật mỗi lần quét. Độ tin cậy theo ô: n≥12 cao · n≥6 trung bình · thấp hơn là thấp.',
    dimName: { presence: 'Hiện diện', prominence: 'Nổi bật', competitiveShare: 'Thị phần cạnh tranh', sentiment: 'Cảm xúc', citation: 'Trích dẫn' },
    dimDef: {
      presence: '% truy vấn có câu trả lời nhắc tới thương hiệu.',
      prominence: 'Điểm vị trí trung bình khi được nhắc: 0 vắng · 1 thoáng qua · 2 một-trong-nhiều · 3 đề xuất hàng đầu; chuẩn hóa ÷3 ×100.',
      competitiveShare: 'Lượt nhắc thương hiệu ÷ (thương hiệu + toàn bộ đối thủ). Đối thủ được trích từ câu trả lời thật, không đoán trước.',
      sentiment: 'Thái độ trung bình khi được nhắc: tích cực 1 · trung lập 0.5 · tiêu cực 0.',
      citation: '% câu trả lời dẫn link domain của thương hiệu (tín hiệu AEO; chủ yếu từ Perplexity và Google AIO).',
    },
    formulaTitle: 'Công thức điểm tổng',
    judgeTitle: 'Vì sao điểm số đáng tin',
    judgeBody:
      'Không đếm từ khóa. Mô hình giám khảo đọc toàn bộ câu trả lời và trả về phán định có cấu trúc (có nhắc? vị trí? cảm xúc? đối thủ?) ở temperature 0.1, theo lô. Danh sách đối thủ do một lượt trích xuất riêng lấy từ chính văn bản trả lời (temperature 0.2) — không đặt sẵn, không dương tính giả.',
    tomBody:
      'Tỷ lệ đề xuất đầu tiên (KPI hợp đồng) = số câu trả lời trong đó thương hiệu là đề xuất hàng đầu (prominence = 3) ÷ toàn bộ truy vấn. Bảng điểm báo cả giá trị tổng thể và riêng cho 20 prompt trọng điểm (chuỗi riêng, n = 20 × 5 = 100).',
    surfacesBody:
      'Google AI Overview là bề mặt thật: lấy từ trang kết quả Google thực qua SerpApi, bản địa hóa theo thị trường (gl/hl; Việt Nam = vn/vi) — đo đúng cái người dùng nhìn thấy. Bốn công cụ còn lại (ChatGPT / Gemini / Perplexity / Claude) chạy qua API mô hình chính thức, được dán nhãn API proxy. AIO quá hạn = “câu này không có AIO”, không ảnh hưởng công cụ khác.',
    authorityBody:
      'Mỗi lần quét lưu toàn bộ link trích dẫn trong câu trả lời AI (geo_citations), tổng hợp xuyên các lần quét thành bảng xếp hạng domain mà AI thật sự trích dẫn ở thị trường này. Đây là tài sản dữ liệu độc quyền: 📣 Phân phối nhắm đúng các domain đó — xây hiện diện nơi AI đã tin tưởng.',
    trendBody:
      'Lần giám sát đầu tiên là đường cơ sở Day-0; cột phải theo dõi AIGVR / hiện diện / khoảng trống qua từng lần quét — căn cứ nghiệm thu “tăng ≥50% so với cơ sở” của hợp đồng. Lưu ý: từ khi thêm Google AIO, hỗn hợp công cụ thay đổi nên điểm trước/sau không so sánh tuyệt đối; đọc xu hướng trong cùng một cấu hình.',
    resultsRows: [
      ['Sandbox chỉnh sửa (sản phẩm sáng tạo)', 'Mỗi đầu ra sáng tạo là bản làm việc chỉnh được: sửa trực tiếp, dùng nút nhanh hoặc hội thoại để AI sửa tiếp (dựa trên bản hiện tại), quay lui theo phiên bản, sao chép dùng ngay.'],
      ['Hỏi cố vấn (kết quả đo lường)', 'Đặt câu hỏi ngay dưới kết quả (“đánh khoảng trống nào trước?”); trả lời bám dữ liệu hiện tại và kèm nút hành động tiếp theo.'],
      ['Ngôn ngữ đọc', 'Sản phẩm giữ nguyên tiếng thị trường; nút chuyển ngữ dịch tại chỗ, tài sản gốc không đổi.'],
      ['Chạy lại', 'Nút ↻ trên đầu sân khấu; chạy lại Monitor tạo thêm một điểm xu hướng.'],
      ['Xuất PDF', 'Nút ⤓ (hoặc ⌘P): tài liệu nền trắng có tiêu đề thương hiệu, tự mở các mục gập, ẩn giao diện.'],
    ],
    channelRows: [
      ['Ba cấp tổ chức', 'MemeCMO (HQ) → đối tác kênh (VD FMVN) → khách hàng cuối. Cách ly dữ liệu hàng-mức (Postgres RLS).'],
      ['Mở khách hàng', 'Admin kênh bấm “+ New client” → hàng chờ duyệt của HQ → tổ chức kích hoạt kèm gói thuê bao tự động.'],
      ['Mời thành viên', '“Invite” trên thẻ tổ chức → email + vai trò (viewer / editor / admin) → email tự gửi (hoặc sao chép link). Người được mời phải đăng nhập đúng email đó.'],
      ['Gói & hạn mức', 'Basic 2 / Standard 8 / Premium 30 lần quét mỗi tháng (tính full_scan và monitor; HQ và đối tác kênh không bị tính). Vượt hạn mức có thông báo rõ; đặt lại hàng tháng.'],
    ],
    faqRows: [
      ['Lần chạy thất bại', 'Sân khấu hiển thị lý do; bấm ↻. Có checkpoint — giai đoạn đã xong không chạy lại, không tính phí trùng.'],
      ['Monitor có vẻ đứng yên', 'Bình thường 2–4 phút; các công cụ chạy song song. Nếu đứng lâu một chỗ, chạy lại.'],
      ['Một công cụ hiển thị 0 mẫu', 'Thường do toàn bộ truy vấn của nó quá hạn lần đó (VD AIO dao động); công cụ khác không ảnh hưởng. Quét lại thường ổn.'],
      ['Báo hết hạn mức', 'Quét có tính phí (Full Scan / Monitor) chạm trần gói. Nâng gói hoặc chờ chu kỳ mới; các agent khác vẫn dùng được.'],
      ['Sản phẩm “sai” ngôn ngữ', 'Sản phẩm theo thị trường mục tiêu của dự án (chọn khi tạo), không theo ngôn ngữ giao diện. Dùng nút ngôn ngữ đọc để dịch.'],
      ['Link mời không mở được', 'Lời mời gắn với email được mời, hiệu lực 14 ngày. Đăng nhập đúng email đó, hoặc gửi lời mời mới.'],
    ],
  },
};

const AGENT_LABEL: Record<string, string> = {
  profile: 'Profile 品牌画像', discovery: 'Discovery 发现', answers: 'Answers 标准答案',
  monitor: 'Monitor 监测', report: 'Report 报告', optimize: 'Optimize 内容',
  site: 'Site 官网', distribute: 'Distribute 投放', encyclopedia: 'Encyclopedia 百科', full_scan: 'Full Scan 全扫描',
};

function Shot({ src, caption }: { src: string; caption: string }) {
  return (
    <figure className="rounded-xl border border-edge overflow-hidden bg-surface">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={caption} loading="lazy" className="w-full block" />
      <figcaption className="px-4 py-2 text-[11px] text-faint border-t border-edge">{caption}</figcaption>
    </figure>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-4 scroll-mt-24">
      <h2 className="text-lg font-semibold text-ink border-b border-edge pb-2">{title}</h2>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="space-y-3">
      {rows.map(([h, b]) => (
        <div key={h} className="rounded-lg border border-edge bg-surface p-4">
          <div className="text-sm font-medium text-ink mb-1">{h}</div>
          <p className="text-[13px] text-dim leading-relaxed">{b}</p>
        </div>
      ))}
    </div>
  );
}

export default function GuideContent() {
  const [lang, setLang] = useState<Lang>('zh');
  const [theme, setTheme] = useState<'night' | 'day'>('night');

  useEffect(() => {
    try {
      const l = localStorage.getItem('memecmo-uilang');
      if (l === 'zh' || l === 'en' || l === 'vi') setLang(l);
      setTheme(localStorage.getItem('memecmo-theme') === 'day' ? 'day' : 'night');
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    document.documentElement.classList.remove('theme-night', 'theme-day');
    document.documentElement.classList.add(theme === 'day' ? 'theme-day' : 'theme-night');
  }, [theme]);

  const t = T[lang];
  const changeLang = (l: Lang) => { setLang(l); try { localStorage.setItem('memecmo-uilang', l); } catch { /* ignore */ } };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="print-hide sticky top-0 z-10 border-b border-edge bg-canvas/95 backdrop-blur px-6 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="text-xs tracking-[0.2em] text-dim uppercase hover:text-ink">MemeCMO.ai</Link>
        <div className="flex items-center gap-2">
          {(['zh', 'en', 'vi'] as Lang[]).map((l) => (
            <button key={l} onClick={() => changeLang(l)}
              className={`text-[11px] px-2 py-1 rounded border transition ${lang === l ? 'border-brand/60 text-brand bg-brand-soft' : 'border-edge text-dim hover:text-ink'}`}>
              {l === 'zh' ? '中文' : l === 'en' ? 'EN' : 'VN'}
            </button>
          ))}
          <Link href="/dashboard" className="text-[11px] px-2.5 py-1 rounded border border-edge text-dim hover:text-ink transition ml-2">
            {t.backToDashboard}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-12">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-brand"><Icon name="report" size={22} /><span className="text-[11px] uppercase tracking-[0.25em]">User Guide</span></div>
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-sm text-dim">{t.subtitle}</p>
          <p className="text-[12px] text-faint border-l-2 border-brand/50 pl-3">{t.updated}</p>
          {/* TOC */}
          <nav className="flex flex-wrap gap-2 pt-2">
            {Object.entries(t.sections).map(([id, label]) => (
              <a key={id} href={`#${id}`} className="text-[11px] px-2 py-1 rounded-full border border-edge text-dim hover:text-brand hover:border-brand/50 transition">
                {label as string}
              </a>
            ))}
          </nav>
        </div>

        <Section id="quickstart" title={t.sections.quickstart}><Rows rows={t.quickstart} /><Shot src="/guide/dashboard.png" caption={t.shotDashboard} /></Section>
        <Section id="layout" title={t.sections.layout}><Shot src="/guide/workspace-monitor.png" caption={t.shotWorkspace} /><Rows rows={t.layout} /></Section>

        <Section id="agents" title={t.sections.agents}>
          <div className="overflow-x-auto rounded-lg border border-edge">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-raised text-left">
                  {t.agentCols.map((c: string) => (<th key={c} className="px-3 py-2 font-medium text-dim whitespace-nowrap">{c}</th>))}
                </tr>
              </thead>
              <tbody>
                {AGENT_ROWS.map(({ id, dep }) => (
                  <tr key={id} className="border-t border-edge align-top">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-ink"><span className="text-brand"><Icon name={id} size={14} /></span>{AGENT_LABEL[id]}</span>
                    </td>
                    <td className="px-3 py-2.5 text-dim leading-relaxed">{t.agentDesc[id][0]}</td>
                    <td className="px-3 py-2.5 text-faint whitespace-nowrap">{dep === '—' ? '—' : AGENT_LABEL[dep]?.split(' ')[0]}</td>
                    <td className="px-3 py-2.5 text-faint whitespace-nowrap">{t.agentDesc[id][1]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Shot src="/guide/answers.png" caption={t.shotAnswers} />
        </Section>

        <Section id="aigvr" title={t.sections.aigvr}>
          <p className="text-[13px] text-dim leading-relaxed">{t.aigvrIntro}</p>
          <div className="rounded-lg border border-edge bg-surface p-4">
            <div className="text-sm font-medium text-ink mb-1">{t.sampleTitle}</div>
            <p className="text-[13px] text-dim leading-relaxed">{t.sampleBody}</p>
          </div>
          <div className="space-y-2.5">
            {WEIGHTS.map(({ key, pct }) => (
              <div key={key} className="rounded-lg border border-edge bg-surface p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-ink">{t.dimName[key]}</span>
                  <span className="text-xs font-semibold text-brand tabular-nums">{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-raised overflow-hidden mb-2">
                  <div className="h-full bg-brand/70" style={{ width: `${pct * 2.5}%` }} />
                </div>
                <p className="text-[12px] text-dim leading-relaxed">{t.dimDef[key]}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-brand/40 bg-brand-soft p-4">
            <div className="text-sm font-medium text-ink mb-1.5">{t.formulaTitle}</div>
            <code className="text-[12px] text-ink block leading-relaxed">
              AIGVR = 0.30·Presence + 0.25·Prominence + 0.20·CompetitiveShare + 0.15·Sentiment + 0.10·Citation
            </code>
          </div>
          <div className="rounded-lg border border-edge bg-surface p-4">
            <div className="text-sm font-medium text-ink mb-1">{t.judgeTitle}</div>
            <p className="text-[13px] text-dim leading-relaxed">{t.judgeBody}</p>
          </div>
          <Shot src="/guide/scorecard-detail.png" caption={t.shotDetail} />
        </Section>

        <Section id="topofmind" title={t.sections.topofmind}>
          <p className="text-[13px] text-dim leading-relaxed">{t.tomBody}</p>
        </Section>
        <Section id="surfaces" title={t.sections.surfaces}>
          <p className="text-[13px] text-dim leading-relaxed">{t.surfacesBody}</p>
        </Section>
        <Section id="authority" title={t.sections.authority}>
          <p className="text-[13px] text-dim leading-relaxed">{t.authorityBody}</p>
        </Section>
        <Section id="trend" title={t.sections.trend}>
          <p className="text-[13px] text-dim leading-relaxed">{t.trendBody}</p>
        </Section>

        <Section id="results" title={t.sections.results}><Shot src="/guide/sandbox.png" caption={t.shotSandbox} /><Rows rows={t.resultsRows} /></Section>
        <Section id="channel" title={t.sections.channel}><Rows rows={t.channelRows} /></Section>
        <Section id="faq" title={t.sections.faq}><Rows rows={t.faqRows} /></Section>

        <footer className="pt-4 border-t border-edge text-[11px] text-faint">
          MemeCMO · GEO — engines: ChatGPT (GPT-4o) · Gemini 2.5 Pro · Perplexity Sonar · Claude Sonnet 4.5 · Google AI Overview (real surface)
        </footer>
      </main>
    </div>
  );
}
