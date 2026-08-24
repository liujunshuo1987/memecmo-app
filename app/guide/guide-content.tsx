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
      sets: '竞对集与提示词库管理',
      aigvr: 'AIGVR 五维算法',
      topofmind: '首位推荐率与重点 Prompt',
      surfaces: '真实界面 vs API 代理',
      authority: 'Source-Authority 引用索引',
      trend: 'Day-0 基线、趋势与月度环比',
      results: '结果操作:沙箱 / 顾问 / 翻译 / 导出',
      compliance: '合规模型:事实与体验的边界',
      channel: '组织、邀请、配额与周报',
      plans: '注册、会员与计费机制',
      faq: '常见问题排查',
    },
    quickstart: [
      ['1 · 建项目', '工作台(Dashboard)→ 所属组织点「+ New project」:一个项目 = 一个品牌 × 一个市场(如 Focus Media × Vietnam)。品牌有多条产品线时填「产品线」字段(可选),每条线建一个项目并排对比——不同产品线的竞对集和分数完全独立,合并测会互相掩盖。'],
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
      answers: ['标准答案库:对 20 条重点各写一条「希望 AI 给出的答案」,非英语市场为市场语言+英文双语(英语市场单语),严格锚定品牌事实', '约 60s'],
      monitor: ['AIGVR 监测:抽样查询 5 引擎,评委模型逐条打分,产出五维指数+竞品基准+缺口+引用', '约 2–4 分钟'],
      report: ['报告:把最新评分卡写成高管可读的发现+建议(周报/月报体)', '约 90s'],
      optimize: ['内容优化:把最大缺口写成发布级目标语言页面 + FAQ + FAQPage JSON-LD', '约 60s'],
      site: ['官网改造:抓你的真实主页,产出可直接粘贴的 schema.org JSON-LD + 具体修改清单', '约 60s'],
      distribute: ['媒体投放:按引用索引的高权威域名逐个生成投递稿(目录/PR/评测),分 3 档优先级;社区渠道(论坛/Facebook 群组)只出「互动简报」不代写帖子;未经证实的宣称会被逐条标旗', '约 60s'],
      encyclopedia: ['百科:诚实评估维基收录资格(notability),给出草稿或先建声量的现实路径;每份输出固定附合规提交路径(付费关系披露 + 编辑请求,绝不直接发布)', '约 60s'],
      full_scan: ['全扫描:发现 → 监测 → 报告 一键串行,断点续跑(Inngest checkpoint)', '约 4–6 分钟'],
    },
    aigvrIntro:
      '每次监测把 Prompt 库抽样后同题发给 5 个 AI 引擎,回答由评委模型(温度 0.1)逐条结构化打分,再聚合为五个维度(各 0–100)与一个综合分。界面展示名为「AI Mindset Index」(合同指标名为 AIGVR 的客户仍显示 AIGVR),算法相同。评分卡头部呈现六个互不重叠的指标:出现率 / 声量份额 / 出现时位置(首位推荐率为其重点过滤视图)/ 出现时情感 / 引用强度 / 高意图缺口数。',
    sampleTitle: '采样设计',
    sampleBody:
      '110 条库中,20 条重点 Prompt 每次全测,其余按阶段均衡抽样至上限 24 条;× 5 引擎 ≈ 120 次真实查询。问题按意图二分呈现:高意图(谁提供/最好/价格/比较/品牌名/地点等购买信号)与教育型——教育型里 AI 很少点名品牌,出现率低属正常,这些问题输出为内容选题。缺口清单只统计高意图问题。为保证分数可比:prompt 库与竞品名单均冻结复用、每月刷新。置信标注:单元格 n≥12 高 · ≥6 中 · <6 低。',
    dimName: { presence: '出现率 Presence', prominence: '显著度 Prominence', competitiveShare: '声量份额 Share of Voice', sentiment: '情感 Sentiment', citation: '引用 Citation' },
    dimDef: {
      presence: '提及品牌的回答占全部查询的百分比。',
      prominence: '被提及时的位置得分均值:0 未提 · 1 顺带 · 2 多选之一 · 3 首选/重点推荐;按 ÷3×100 归一。',
      competitiveShare: '品牌提及次数 ÷(品牌提及 + 竞品提及)。竞品从真实回答里提取,且只计关系标签为「竞对」的实体——标为合作伙伴/目录平台的(如 Payoneer 场景下的 Upwork)不进分母,评分卡会注明哪些实体被排除及原因。',
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
      '项目的第一次监测自动成为 Day-0 基线,右栏趋势线展示 AIGVR/可见度/缺口随每次扫描的变化,合同的「较基线增长 ≥50%」即以此核验。趋势图下方是「月度趋势 · 环比」:每个自然月取最后一次扫描为月度快照,逐月显示分数与环比变化(绝对值 + 百分比),跨月后自动生成。注意:引擎组合或竞对口径变化(如新增 Google AIO、竞对改标合作伙伴)会打断严格可比性——趋势解读以同口径区间为准,口径变更处会注明。',
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
      ['自动周报邮件', '配置收件人后,每周二上午自动发送 GEO 摘要邮件:精简数字区(指数/分引擎/本期交付)+ 详细的效果归因与策略建议;解读口径随项目阶段自动切换(建设期不解读分数波动)。完整数据始终在工作台下载 PDF。掉分 ≥5 或某引擎归零会即时告警,不等周期。'],
    ],
    plansRows: [
      ['注册方式', '平台不开放公开注册,入口只有两个:官网 waitlist(运营方审核后发邀请)与组织邀请(渠道商可为终端客户开组织并邀请成员)。这是成本设计而非姿态——每次扫描消耗真实的引擎调用费用,开放注册+免费扫描会把获客变成不可控的滥用面。'],
      ['席位与角色', 'admin(组织/邀请/账单)· editor(可触发执行)· viewer(只读:全部交付物、导出 PDF、就结果提问)。席位免费且不限量——查看者越多,报告在客户组织内传播越广,这是有意的分发设计。'],
      ['订阅买的是什么', '不是"若干次扫描",而是完整交付服务:冻结面板上可比的定期扫描节奏(月/双周/周)、自动周报与告警、内容智能体、看板与席位。SEA 区:$299(2 扫/月·1 项目·4 引擎)/ $799(8 扫·3 项目·5 引擎含真实 Google AI Overview)/ $1,999(30 扫·10 项目·全功能)。US 区因州级定位与真实界面成本上浮约 50%。'],
      ['信用点买的是什么', '"立即触发权"。合同节奏内的定期扫描永远不耗点;客户自己点 ▶ 的即时加跑才计点(全量扫描/监测 25 点,内容与报告类 10 点)。Standard/Premium 每月内含 50/150 点;点包:250 点 $250 · 1,150 点 $1,000(约 13% 加赠)· 3,900 点 $3,000(约 30% 加赠)。'],
      ['为什么这样拆', '第一性原理:语料未变时的短期分数波动是噪音,反复加扫既烧成本又诱导对噪音过度解读。定期节奏保证可比性(同面板同口径),信用点单独为"等不及"定价——两类需求分开计费,双方激励都对齐。'],
      ['双池记账', '信用点分两池:granted(赠送/月度内含,优先扣减,不开票)与 purchased(购买点包,可开票)。渠道伙伴的售前演示扫描按渠道协议由运营方发放 granted 点覆盖——售前成本不挤占客户的付费池。'],
      ['欠费与退出', '订阅进入 past_due/canceled 后:扫描暂停,但看板、全部历史与 PDF 导出保留——数据归客户(协议 §9),平台不做数据劫持。恢复订阅即恢复扫描。'],
    ],
    setsRows: [
      ['入口', '工作区页头「竞对与提示词」按钮,项目管理员可用。所有修改存于项目配置,Discovery 原始资产与历史扫描永不改动,可随时恢复。'],
      ['竞对集编辑', '给每个实体标关系:竞对 / 合作伙伴 / 目录平台 / 自身——只有「竞对」进声量份额、基准与缺口计算。标记会跨月度刷新自动继承:标过 partner 的实体永远不会被重新识别成竞对。也可改名、删除、手动添加。'],
      ['提示词库编辑', '点击任意提示词排除/恢复(划线显示);底部文本框逐行添加自定义提示词。修改自下次扫描/答案生成起生效,重点 Prompt 同样受排除影响。'],
      ['为什么要人工编辑', 'AI 从真实回答提取竞对,但「谁算竞对」是商业判断——机器负责发现,人负责定性(实测案例:AI 把 Payoneer 的合作伙伴 Upwork/Fiverr 列进了竞对)。'],
    ],
    complianceRows: [
      ['通用规则:只产事实,不产体验', '所有智能体只能生成可验证的事实信息,任何第一人称用户体验口吻(中/英/越/泰/印尼/马来/菲语全覆盖检测)一律判为伪造证言并丢弃——体验只能来自真实顾客。'],
      ['社区渠道 = 互动简报', '论坛与社群(Reddit/Quora/Facebook 群组及 Pantip/Voz/Tinhte/Kaskus 等本地论坛)不代写帖子,输出「互动简报」:去哪些社区、别人在问什么、我们能提供哪些经过验证的事实;参与必须用披露身份的官方账号。'],
      ['未经证实宣称标旗', '「trusted by millions」「行业领先」类无出处宣称会被确定性扫描逐条标 ⚠,操作者替换为品牌档案中的事实或删除后才发送。'],
      ['百科合规提交', '维基类内容仅由百科智能体产出,每份输出固定附:付费关系披露({{paid}})→ AfC 草稿评审或 Talk 页编辑请求 → 独立编辑审核合入。绝不直接发布。'],
      ['真实评价', '顾客评价内容永不代写。报告智能体只会建议「真实评价招揽」:给客户自己的顾客发邀请链接,评价由真实顾客撰写。'],
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
      sets: 'Managing the competitor set & prompt library',
      aigvr: 'The AIGVR five-dimension algorithm',
      topofmind: 'Top-of-Mind rate & key prompts',
      surfaces: 'Real surface vs API proxy',
      authority: 'Source-Authority citation index',
      trend: 'Day-0 baseline, trend & monthly MoM',
      results: 'Working with results: sandbox / advisor / translate / export',
      compliance: 'The compliance model: facts vs experiences',
      channel: 'Organizations, invites, quotas & weekly digests',
      plans: 'Registration, membership & billing model',
      faq: 'Troubleshooting',
    },
    quickstart: [
      ['1 · Create a project', 'Dashboard → “+ New project” under your organization. One project = one brand × one market (e.g. Focus Media × Vietnam). Multi-line brands: fill the optional Product line field and create one project per line — each line gets its own competitor set and score, so lines compare side by side instead of masking each other.'],
      ['2 · Build the brand profile', 'Run 🪪 Profile first: it fetches the official site and produces one canonical fact base (definition / services / differentiators / NAP). Every content agent grounds on it — consistent, no invention.'],
      ['3 · Run a Full Scan', '⚡ Full Scan chains Discovery → Monitor → Report, ~4–6 minutes. Your first scan automatically becomes the Day-0 baseline.'],
      ['4 · Read the results', 'Center stage: AIGVR scorecard and report. Right rail: trend, share of voice, gaps, cited sources.'],
      ['5 · Execute', 'Work the gaps with ✍️ Optimize / 🏗️ Site / 📣 Distribute / 📚 Encyclopedia — each output is a ready deliverable. Re-scan to prove the lift.'],
    ],
    layout: [
      ['Left · Deliverables', '10 agents grouped Setup / Measure / Act, each showing its latest run. The intent box at the bottom steers Full Scan (e.g. “focus on F&B buyers”) — it changes what Discovery asks.'],
      ['Center · Stage', 'The selected deliverable in full; live phase progress and process log while running, converging to result modules on completion.'],
      ['Right · Context', 'AIGVR trend (Δ vs last), presence, brand rank, high-intent gaps, AI-cited sources, deliverables-ready checklist.'],
      ['Top bar', 'Reading language (original/中文/EN) · UI language (中/EN/VN) · back to dashboard.'],
    ],
    agentCols: ['Agent', 'What it does', 'Needs', 'Duration'],
    agentDesc: {
      profile: ['Brand Profile: fetches the site → one canonical fact base shared by all execution agents (prevents invention)', '~45s'],
      discovery: ['Prompt Discovery: 110 buyer questions (5 funnel stages × 22) + 20 designated key prompts; supports intent focus', '~60s'],
      answers: ['Standard Answer Library: for each key prompt, the answer we want AI to give — market language + English for non-English markets (single-language for English markets), strictly grounded', '~60s'],
      monitor: ['AIGVR Monitor: samples the prompt set across 5 engines, judge-scores every answer, outputs the 5-dimension index + competitor benchmark + gaps + citations', '~2–4 min'],
      report: ['Report: turns the latest scorecard into executive findings + prioritized recommendations', '~90s'],
      optimize: ['Content Optimize: turns the top measured gap into a publish-ready page + FAQ + FAQPage JSON-LD in the market language', '~60s'],
      site: ['Site: fetches your real homepage, returns paste-in schema.org JSON-LD + a concrete edit list', '~60s'],
      distribute: ['Distribute: placement drafts (directory / PR / review) for each high-authority domain from the citation index, in 3 priority tiers; community channels get engagement BRIEFS (never ghostwritten posts); unverified claims are flagged per item', '~60s'],
      encyclopedia: ['Encyclopedia: honest Wikipedia notability check; a draft or the realistic build-coverage-first path; every output ships with the compliant submission path (paid-COI disclosure + edit request — never direct posting)', '~60s'],
      full_scan: ['Full Scan: Discovery → Monitor → Report in one click, checkpointed (resumes, never double-runs)', '~4–6 min'],
    },
    aigvrIntro:
      'Each Monitor run samples the prompt library, sends identical queries to 5 AI engines, judge-scores every answer (temperature 0.1, structured output), then aggregates five dimensions (0–100 each) and one composite. Displayed as "AI Mindset Index" (clients whose contract names the metric see AIGVR — same algorithm). The scorecard headline shows six non-overlapping KPIs: presence / share of voice / position-when-present (top-of-mind is its key-prompt filtered view) / sentiment-when-present / citation strength / high-intent gap count.',
    sampleTitle: 'Sampling design',
    sampleBody:
      'All 20 key prompts are always measured; the rest are stage-balanced up to a cap of 24 prompts, × 5 engines ≈ 120 live queries per scan. Questions are presented by INTENT: high-intent (buying signals — who provides / best / price / compare / brand names / location) vs educational, where AI rarely names brands (low presence is normal; those prompts become content topics). The gap list counts high-intent questions only. For comparability, both the prompt library and the competitor set are frozen and reused, refreshed monthly. Per-cell confidence: n≥12 high · n≥6 medium · below low.',
    dimName: { presence: 'Presence', prominence: 'Prominence', competitiveShare: 'Share of Voice (competitive)', sentiment: 'Sentiment', citation: 'Citation' },
    dimDef: {
      presence: '% of all queries whose answer mentions the brand.',
      prominence: 'Average position score when mentioned: 0 absent · 1 passing · 2 one-of-several · 3 featured/top; normalized ÷3 ×100.',
      competitiveShare: 'Brand mentions ÷ (brand + competitor mentions). Competitors are extracted from the real answers, and only entities tagged “competitor” count — partners and directories (e.g. Upwork in the Payoneer case) stay out of the denominator; the scorecard states who is excluded and why.',
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
      'The first Monitor run becomes the Day-0 baseline; the right-rail trend tracks AIGVR / presence / gaps per scan — this is how the contract’s “≥50% growth vs baseline” is verified. Below the trend line sits Monthly trend · MoM: the last scan of each calendar month is that month’s snapshot, each row showing the score and its month-over-month delta (absolute + %) — it unlocks automatically once scans span two months. Note: changes to the engine mix or the competitor definition (e.g. adding Google AIO, re-tagging a competitor as partner) break strict comparability; read trends within a consistent window — definition changes are annotated.',
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
      ['Automatic weekly digest', 'With recipients configured, a GEO digest email goes out every Tuesday morning: a concise numbers block (index / per-engine / deliverables shipped) plus deliberately detailed effect-attribution and strategy sections. The interpretation switches with the project lifecycle stage (build phase never over-reads score movement). Full data always lives in the workspace PDF. A score drop ≥5 or an engine collapsing to zero triggers an immediate alert — no waiting for the cycle.'],
    ],
    plansRows: [
      ['How registration works', 'No open self-serve signup. The two doors are the homepage waitlist (operator-reviewed invite) and organization invites (channel partners provision end-client orgs and invite members). This is cost design, not gatekeeping — every scan spends real engine-call money; open signup plus free scanning would turn acquisition into an uncontrolled abuse surface.'],
      ['Seats & roles', 'admin (org / invites / billing) · editor (can trigger runs) · viewer (read-only: all deliverables, PDF export, ask-about-this-result). Seats are free and unlimited — more viewers means wider internal distribution of the reports, which is deliberate.'],
      ['What a subscription buys', 'Not "N scans" but the full delivery service: a comparable scan cadence on frozen panels (monthly / biweekly / weekly), automatic digests and alerts, content agents, dashboard and seats. SEA: $299 (2 scans/mo · 1 project · 4 engines) / $799 (8 · 3 · 5 engines incl. the real Google AI Overview surface) / $1,999 (30 · 10 · everything). The US region runs ~50% higher for state-level targeting and real-surface costs.'],
      ['What credits buy', 'The right to trigger now. Contracted scheduled scans never cost credits; client-initiated on-demand runs do (full scan / monitor 25 · content & report agents 10). Standard/Premium include 50/150 credits monthly; packs: 250 for $250 · 1,150 for $1,000 (~13% bonus) · 3,900 for $3,000 (~30% bonus).'],
      ['Why this split', 'First principles: short-term score movement without corpus change is noise; repeated re-scanning burns cost and invites over-reading. The scheduled cadence guarantees comparability (same panel, same method); credits price impatience separately. Both sides’ incentives point the right way.'],
      ['Two credit pools', 'granted (gifts / monthly allowance — spent first, never invoiced) vs purchased (Stripe packs, invoiceable). Channel-partner demo scans are covered by operator-granted credits under the channel agreement — pre-sales cost never eats the client’s paid pool.'],
      ['Past-due & exit', 'When a subscription goes past_due / canceled: scanning pauses, but the dashboard, all history and PDF export remain available — the data belongs to the client (contract §9); no data hostage-taking. Resume billing and scanning resumes.'],
    ],
    setsRows: [
      ['Where', 'The “Sets” button in the workspace header, for project admins. Edits live in project config — the Discovery asset and scan history are never touched, everything is reversible.'],
      ['Competitor set', 'Tag each entity: competitor / partner / directory / self — only “competitor” enters share of voice, the benchmark and gaps. Tags survive the monthly set refresh: an entity marked partner is never re-discovered as a competitor. Rename, delete and manual add are supported.'],
      ['Prompt library', 'Click any prompt to exclude / restore it (struck through when excluded); add custom prompts one per line. Edits apply from the next scan / answer generation; key prompts respect exclusions too.'],
      ['Why manual editing exists', 'AI extracts competitors from real answers, but “who counts as a competitor” is a business judgment — the machine discovers, a human qualifies (real case: AI listed Payoneer’s partners Upwork/Fiverr as competitors).'],
    ],
    complianceRows: [
      ['Universal rule: facts, never experiences', 'Agents generate verifiable factual information only. Any first-person user-experience voice (detected across EN/VI/TH/ID/MS/FIL) is treated as a fabricated testimonial and dropped — experiences belong to real customers.'],
      ['Community channels = engagement briefs', 'Forums and groups (Reddit, Quora, Facebook Groups, and local forums like Pantip, Voz, Tinhte, Kaskus) never get ghostwritten posts. They get an engagement brief: where to engage, what people ask, which verified facts to contribute — always from a disclosed official account.'],
      ['Unverified claims are flagged', '“Trusted by millions” / “industry-leading” style claims with no source are deterministically flagged ⚠ per item; replace with a fact from the brand profile or delete before sending.'],
      ['Encyclopedia compliance', 'Wiki content is produced only by the Encyclopedia agent, and every output carries the compliant path: paid-relationship disclosure ({{paid}}) → AfC draft review or Talk-page edit request → independent editors merge. Never direct posting.'],
      ['Genuine reviews only', 'Review content is never ghostwritten. The Report agent may recommend a genuine review-solicitation program — invitation links sent to the client’s real customers, who write the reviews themselves.'],
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
      sets: 'Quản lý bộ đối thủ & thư viện prompt',
      aigvr: 'Thuật toán AIGVR 5 chiều',
      topofmind: 'Tỷ lệ đề xuất đầu tiên & prompt trọng điểm',
      surfaces: 'Bề mặt thật vs API proxy',
      authority: 'Chỉ mục trích dẫn Source-Authority',
      trend: 'Đường cơ sở Day-0, xu hướng & so sánh theo tháng',
      results: 'Thao tác kết quả: sandbox / cố vấn / dịch / xuất',
      compliance: 'Mô hình tuân thủ: sự kiện vs trải nghiệm',
      channel: 'Tổ chức, lời mời, hạn mức & bản tin tuần',
      plans: 'Đăng ký, hội viên & cơ chế tính phí',
      faq: 'Xử lý sự cố',
    },
    quickstart: [
      ['1 · Tạo dự án', 'Dashboard → “+ New project”. Một dự án = một thương hiệu × một thị trường (VD: Focus Media × Việt Nam). Thương hiệu nhiều dòng sản phẩm: điền ô “Product line” (tùy chọn) và tạo một dự án cho mỗi dòng — mỗi dòng có bộ đối thủ và điểm số riêng, so sánh song song thay vì che lấp nhau.'],
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
      distribute: ['Phân phối: bản thảo đăng tải (danh bạ / PR / đánh giá) cho từng domain uy tín, chia 3 bậc ưu tiên; kênh cộng đồng (diễn đàn / nhóm Facebook) chỉ nhận “bản tóm tắt tương tác”, không viết hộ bài đăng; tuyên bố thiếu nguồn bị gắn cờ từng mục', '~60s'],
      encyclopedia: ['Bách khoa: đánh giá trung thực khả năng lên Wikipedia; bản nháp hoặc lộ trình xây độ phủ trước; mỗi đầu ra kèm lộ trình nộp tuân thủ (công khai quan hệ trả phí + yêu cầu chỉnh sửa — không bao giờ đăng trực tiếp)', '~60s'],
      full_scan: ['Full Scan: Khám phá → Giám sát → Báo cáo một chạm, có checkpoint (chạy tiếp, không chạy trùng)', '~4–6 phút'],
    },
    aigvrIntro:
      'Mỗi lần giám sát lấy mẫu thư viện prompt, gửi cùng câu hỏi tới 5 công cụ AI, mô hình giám khảo chấm từng câu trả lời (temperature 0.1, đầu ra có cấu trúc), rồi tổng hợp 5 chiều (0–100) và một điểm tổng. Tên hiển thị là "AI Mindset Index" (khách có hợp đồng ghi AIGVR vẫn thấy AIGVR — cùng thuật toán). Bảng điểm hiển thị sáu KPI không trùng lặp: hiện diện / thị phần giọng nói / vị trí khi xuất hiện (đề xuất đầu tiên là góc nhìn lọc theo prompt trọng điểm) / cảm xúc / trích dẫn / số khoảng trống ý định cao.',
    sampleTitle: 'Thiết kế lấy mẫu',
    sampleBody:
      '20 prompt trọng điểm luôn được đo đủ; phần còn lại lấy mẫu cân bằng theo giai đoạn tới trần 24 prompt; × 5 công cụ ≈ 120 truy vấn thật mỗi lần quét. Độ tin cậy theo ô: n≥12 cao · n≥6 trung bình · thấp hơn là thấp.',
    dimName: { presence: 'Hiện diện', prominence: 'Nổi bật', competitiveShare: 'Thị phần giọng nói (SoV)', sentiment: 'Cảm xúc', citation: 'Trích dẫn' },
    dimDef: {
      presence: '% truy vấn có câu trả lời nhắc tới thương hiệu.',
      prominence: 'Điểm vị trí trung bình khi được nhắc: 0 vắng · 1 thoáng qua · 2 một-trong-nhiều · 3 đề xuất hàng đầu; chuẩn hóa ÷3 ×100.',
      competitiveShare: 'Lượt nhắc thương hiệu ÷ (thương hiệu + đối thủ). Đối thủ trích từ câu trả lời thật, và chỉ thực thể gắn nhãn “đối thủ” mới được tính — đối tác/danh bạ (VD Upwork trong trường hợp Payoneer) không vào mẫu số; bảng điểm ghi rõ ai bị loại và vì sao.',
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
      'Lần giám sát đầu tiên là đường cơ sở Day-0; cột phải theo dõi AIGVR / hiện diện / khoảng trống qua từng lần quét — căn cứ nghiệm thu “tăng ≥50% so với cơ sở”. Dưới đường xu hướng là “Xu hướng tháng · so với tháng trước”: lần quét cuối mỗi tháng là ảnh chụp của tháng đó, từng dòng hiển thị điểm và mức thay đổi (tuyệt đối + %) — tự mở khi dữ liệu trải qua hai tháng. Lưu ý: thay đổi tổ hợp công cụ hoặc định nghĩa đối thủ sẽ phá vỡ tính so sánh tuyệt đối; đọc xu hướng trong cùng một cấu hình, chỗ đổi định nghĩa có ghi chú.',
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
      ['Bản tin tuần tự động', 'Khi đã cấu hình người nhận, email tóm tắt GEO gửi mỗi sáng thứ Ba: khối số liệu gọn (chỉ số / theo công cụ / đã bàn giao) + phần phân tích hiệu quả và khuyến nghị chiến lược chi tiết; cách diễn giải tự đổi theo giai đoạn dự án. Dữ liệu đầy đủ luôn ở workspace (PDF). Điểm giảm ≥5 hoặc một công cụ về 0 sẽ cảnh báo ngay.'],
    ],
    plansRows: [
      ['Đăng ký hoạt động thế nào', 'Không có đăng ký tự do. Hai cửa duy nhất: waitlist trên trang chủ (vận hành duyệt rồi mời) và lời mời từ tổ chức (đối tác kênh tạo tổ chức khách hàng và mời thành viên). Đây là thiết kế chi phí, không phải rào cản — mỗi lần quét tiêu chi phí gọi engine thật; đăng ký mở + quét miễn phí sẽ thành bề mặt lạm dụng không kiểm soát được.'],
      ['Ghế & vai trò', 'admin (tổ chức / mời / thanh toán) · editor (được kích hoạt tác vụ) · viewer (chỉ xem: toàn bộ sản phẩm, xuất PDF, hỏi về kết quả). Ghế miễn phí, không giới hạn — càng nhiều người xem, báo cáo càng lan tỏa trong tổ chức khách hàng, đây là chủ đích.'],
      ['Gói thuê bao mua gì', 'Không phải "N lần quét" mà là dịch vụ trọn gói: nhịp quét so sánh được trên bộ câu hỏi đóng băng (tháng / 2 tuần / tuần), bản tin và cảnh báo tự động, các agent nội dung, bảng điều khiển và ghế. Khu vực SEA: $299 (2 quét/tháng · 1 dự án · 4 engine) / $799 (8 · 3 · 5 engine gồm Google AI Overview thật) / $1,999 (30 · 10 · đầy đủ). Khu vực US cao hơn ~50% do nhắm mục tiêu cấp bang.'],
      ['Credit mua gì', 'Quyền kích hoạt ngay. Quét định kỳ theo hợp đồng không bao giờ tốn credit; lần chạy do khách tự bấm mới tốn (quét đầy đủ / giám sát 25 · agent nội dung & báo cáo 10). Gói Standard/Premium tặng 50/150 credit mỗi tháng; gói mua: 250 = $250 · 1.150 = $1.000 (~13% tặng) · 3.900 = $3.000 (~30% tặng).'],
      ['Vì sao tách như vậy', 'Nguyên lý gốc: điểm dao động ngắn hạn khi ngữ liệu chưa đổi là nhiễu; quét lại liên tục vừa đốt chi phí vừa dẫn tới diễn giải quá đà. Nhịp định kỳ bảo đảm tính so sánh (cùng bộ câu hỏi, cùng phương pháp); credit định giá riêng cho sự không-chờ-được. Động lực hai bên đều đúng hướng.'],
      ['Hai quỹ credit', 'granted (tặng / hạn mức tháng — trừ trước, không xuất hóa đơn) và purchased (mua qua Stripe, xuất hóa đơn được). Quét demo bán hàng của đối tác kênh dùng credit granted do vận hành cấp theo thỏa thuận kênh — chi phí tiền-bán-hàng không ăn vào quỹ trả phí của khách.'],
      ['Quá hạn & rời đi', 'Khi thuê bao past_due / canceled: tạm dừng quét, nhưng bảng điều khiển, toàn bộ lịch sử và xuất PDF vẫn còn — dữ liệu thuộc về khách hàng (hợp đồng §9); không giữ dữ liệu làm con tin. Nối lại thanh toán là quét tiếp.'],
    ],
    setsRows: [
      ['Ở đâu', 'Nút “Sets” trên đầu workspace, dành cho quản trị viên dự án. Mọi chỉnh sửa nằm trong cấu hình dự án — tài sản Discovery và lịch sử quét không bị đụng tới, có thể hoàn tác.'],
      ['Bộ đối thủ', 'Gắn nhãn từng thực thể: đối thủ / đối tác / danh bạ / chính mình — chỉ “đối thủ” vào thị phần giọng nói, đối sánh và khoảng trống. Nhãn giữ nguyên qua kỳ làm mới hàng tháng: thực thể đã đánh dấu đối tác không bao giờ bị nhận nhầm lại thành đối thủ. Hỗ trợ đổi tên, xóa, thêm thủ công.'],
      ['Thư viện prompt', 'Bấm vào prompt bất kỳ để loại trừ / khôi phục (gạch ngang khi loại); thêm prompt tùy chỉnh mỗi dòng một câu. Có hiệu lực từ lần quét / lần tạo câu trả lời kế tiếp.'],
      ['Vì sao cần chỉnh tay', 'AI trích đối thủ từ câu trả lời thật, nhưng “ai là đối thủ” là phán đoán kinh doanh — máy phát hiện, người định tính (ca thực tế: AI xếp đối tác Upwork/Fiverr của Payoneer vào đối thủ).'],
    ],
    complianceRows: [
      ['Quy tắc chung: sự kiện, không trải nghiệm', 'Agent chỉ tạo thông tin sự kiện kiểm chứng được. Mọi giọng văn trải nghiệm ngôi thứ nhất (phát hiện đa ngôn ngữ EN/VI/TH/ID/MS/FIL) bị coi là chứng thực bịa đặt và loại bỏ — trải nghiệm thuộc về khách hàng thật.'],
      ['Kênh cộng đồng = bản tóm tắt tương tác', 'Diễn đàn và nhóm (Reddit, Quora, nhóm Facebook, Pantip, Voz, Tinhte, Kaskus…) không bao giờ nhận bài viết hộ. Thay vào đó là bản tóm tắt: tương tác ở đâu, người ta hỏi gì, đóng góp sự kiện đã kiểm chứng nào — luôn bằng tài khoản chính thức công khai danh tính.'],
      ['Gắn cờ tuyên bố thiếu nguồn', 'Các tuyên bố kiểu “hàng triệu người tin dùng” / “dẫn đầu ngành” không nguồn bị quét xác định và gắn cờ ⚠ từng mục; thay bằng sự kiện trong hồ sơ thương hiệu hoặc xóa trước khi gửi.'],
      ['Bách khoa tuân thủ', 'Nội dung wiki chỉ do agent Bách khoa tạo, mỗi đầu ra kèm lộ trình: công khai quan hệ trả phí ({{paid}}) → duyệt nháp AfC hoặc yêu cầu chỉnh sửa trên trang Thảo luận → biên tập viên độc lập hợp nhất. Không bao giờ đăng trực tiếp.'],
      ['Đánh giá thật', 'Nội dung đánh giá không bao giờ được viết hộ. Agent Báo cáo chỉ khuyến nghị chương trình mời đánh giá chân thực — gửi link mời tới khách hàng thật, họ tự viết.'],
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
  useEffect(() => {
    try {
      const l = localStorage.getItem('memecmo-uilang');
      if (l === 'zh' || l === 'en' || l === 'vi') setLang(l);
    } catch { /* ignore */ }
  }, []);
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

        <Section id="sets" title={t.sections.sets}><Rows rows={t.setsRows} /></Section>

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
        <Section id="compliance" title={t.sections.compliance}><Rows rows={t.complianceRows} /></Section>
        <Section id="channel" title={t.sections.channel}><Rows rows={t.channelRows} /></Section>
        <Section id="plans" title={t.sections.plans}><Rows rows={t.plansRows} /></Section>
        <Section id="faq" title={t.sections.faq}><Rows rows={t.faqRows} /></Section>

        <footer className="pt-4 border-t border-edge text-[11px] text-faint">
          MemeCMO · GEO — engines: ChatGPT (GPT-4o) · Gemini 2.5 Pro · Perplexity Sonar · Claude Sonnet 4.5 · Google AI Overview (real surface)
        </footer>
      </main>
    </div>
  );
}
