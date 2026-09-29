'use client';

// Tri-lingual (zh / en / vi) product guide. Follows the workspace's stored
// language (localStorage 'memecmo-uilang') and theme ('memecmo-theme').
// Every constant here mirrors the implementation (lib/agents/monitor.ts,
// discovery.ts, lib/commerce.ts, lib/credits.ts, lib/plans-catalog.ts):
// if the page and the product disagree, one of them has a bug.
// Screenshots: public/guide/*.png, captured by scripts/capture-guide-shots.mjs
// on the root-org project only — never a client workspace.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';

type Lang = 'zh' | 'en' | 'vi';

const STANDARD_PDF = '/standard/MemeCMO_AI_Visibility_Measurement_Standard_v1.1.pdf';

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
    shotDashboard: '工作台:组织带 + 项目卡片(指数圆井、出现率轨道、最近扫描),右上「套餐与账单」「邀请」「+ New project」',
    shotWorkspace: '工作区:左侧交付物导航(准备 / 测量 / 执行)· 中央舞台 · 右栏最近扫描、Credit 与行动记录;手机端导航变为顶部标签',
    shotMonitor: '监测看板上半部:出现率走势(本品牌金色、竞品各自配色)、品牌可见度表(逐条回答,不可相加)、声量份额条(合计 100%)',
    shotSources: 'AI 引用的来源:域名 × 引用次数 × 引擎数 × 已读页面;下方引用画像给出被引页面的结构、更新日期与 schema 特征',
    shotPrompts: '各问题出现率:提示词 × 引擎的格子,点任意格子打开那条 AI 回答及其引用来源',
    shotReport: '报告:关键发现与建议默认收起、可逐条展开;站点覆盖(空白 / 已覆盖)与「与站点矛盾的 AI 回答」两个折叠块',
    shotSandbox: '内容沙箱:发布级目标语言成品稿 —— 直接编辑 / 复制,或用一句话让 AI 改写当前稿;人工修改在重跑后保留',
    shotSets: '竞对与提示词:给每个实体标关系(竞对 / 合作伙伴 / 目录平台 / 观察对象 / 自身);提示词可排除、可用 ✎ 改写成本地问法并留下理由',
    title: '使用说明与算法白皮书',
    subtitle: '系统怎么用 · 每个数字怎么算出来 · 出问题怎么办',
    updated: '与代码同源:本页所有常量取自实际实现,若与产品表现不符即为缺陷,请反馈。2026-09 版:监测看板、引用画像、行动核验、语言规则、Starter / Growth / Scale 套餐。',
    backToDashboard: '返回工作台',
    partnerCtaTitle: '渠道伙伴交付手册',
    partnerCtaDesc: 'P1 测评 ⇄ P2 实操修改的完整交付方法论:五个标准工作包、90 天路线图与可复制模板库 · 中/英/越/泰/阿五语',
    standardTitle: '《AI 可见度测量标准》v1.1',
    standardDesc: '每个指标的定义、样本量、置信标注、引用覆盖(4/5 引擎)、站点比对、行动核验与公开信源清单规则,全部写在公开标准里。套餐之间只差范围,不差口径。',
    standardCta: '阅读标准 v1.1(PDF)',
    sections: {
      quickstart: '快速上手',
      layout: '工作台与工作区布局',
      agents: '智能体参考(10 个)',
      monitor: '监测看板怎么读',
      sets: '竞对集与提示词库管理',
      language: '语言:提示词 / 交付物 / 界面',
      aigvr: 'AIGVR 五维算法',
      topofmind: '首位推荐率与重点 Prompt',
      surfaces: '真实界面 vs API 代理',
      authority: '引用索引与被引页面',
      trend: 'Day-0 基线、趋势与定期扫描',
      actions: '行动记录与自动核验',
      results: '结果操作:沙箱 / 顾问 / 翻译 / 导出',
      compliance: '合规与防编造',
      channel: '组织、邀请、配额与周报',
      plans: '套餐、Credit 与计费',
      faq: '常见问题排查',
    },
    quickstart: [
      ['1 · 建项目', '工作台 → 所属组织点「+ New project」:一个项目 = 一个品牌 × 一个市场(如 某品牌 × Vietnam)。品牌有多条产品线时每条线建一个项目并排对比——不同产品线的竞对集和分数完全独立,合并测会互相掩盖。'],
      ['2 · 建品牌档案', '进入工作区先跑 品牌画像(Profile):抓取官网生成一份公开事实库(定义 / 服务 / 差异化 / 量化事实 / NAP)。右栏「品牌资料」可上传品牌指南或定位文档(.txt / .md / 文本型 .pdf)。之后所有内容型智能体只引用这份事实库里的数字,库里没有的数字一律留空位。'],
      ['3 · 完整扫描', '完整扫描 串行执行 发现 → 监测 → 报告,约 4–6 分钟,任务在服务器运行,可离开页面。首次扫描自动成为 Day-0 基线;之后定期扫描按套餐节奏自动进行。'],
      ['4 · 读监测看板', '监测结果从上到下:出现率走势 → 品牌可见度 → 声量份额 → 各引擎出现率 → AI 引用的来源与引用画像 → 各问题出现率。每个格子都能点开看那条 AI 原答与引用。'],
      ['5 · 建设并记录', '按缺口依次跑 内容 / 主页 / 分发 / 百科,产出即成品交付物;发布后在右栏「记录一个行动」登记 URL,平台自动抓取核验,并在后续扫描里按问题、按引擎归因。'],
    ],
    layout: [
      ['工作台', '按组织分带:每个组织一行标题(套餐、状态、Invite、套餐与账单、+ New project / + New client),下面是项目卡片——指数圆井、出现率轨道、最近扫描时间,按最近活动排序。'],
      ['左栏 · 交付物导航', '按 准备(Setup)/ 测量(Measure)/ 执行(Act)分组的 10 个智能体;每项显示最近一次运行状态,点行查看,点「运行」重跑。底部输入框可给完整扫描下达聚焦指令(如「聚焦 F&B 客户」),会改变发现阶段的出题方向。手机与平板上这一栏变为顶部横向标签。'],
      ['中央 · 舞台', '当前选中交付物的完整结果;运行中显示分阶段进度与技术轨迹,完成后收敛为结果模块。报告与长结果默认收起,逐条展开。'],
      ['右栏 · 情报面板', '最近扫描(出现率 / 声量份额 / 品牌排名 / 高意图缺口)、AIGVR 趋势与月度环比、Credit 余额、品牌资料、行动记录、就绪清单。'],
      ['页头', '竞对与提示词 · 导出 PDF · 重跑 · 阅读语言(原文 / 中文 / EN)· 界面语言(中 / EN / VN)· 日 / 夜主题 · 使用说明 · 返回工作台。'],
    ],
    agentCols: ['智能体', '做什么', '前置', '时长'],
    agentDesc: {
      profile: ['品牌画像:抓官网 → 公开事实库(定义 / 服务 / 差异化 / 量化事实 / NAP)+ 你上传的品牌资料,全体执行智能体共用;数字只能来自这里', '约 45s'],
      discovery: ['发现:生成 110 条(买家旅程 5 阶段 × 22)买家会问 AI 的问题 + 标记 20 条重点;题库上限随套餐(60 / 110 / 150);支持意图聚焦', '约 60s'],
      answers: ['标准答案库:对 20 条重点各写一条「希望 AI 给出的答案」,市场语言 + 英文双语(英语市场单语),严格锚定品牌事实', '约 60s'],
      monitor: ['监测:抽样查询 5 引擎(Starter 4 引擎),评委模型逐条打分,产出五维指数 + 竞品基准 + 缺口 + 引用;所有引用链接落库并排队抓取页面', '约 2–4 分钟'],
      report: ['报告:把最新评分卡写成高管可读的发现 + 建议,用市场的报告语言;附站点覆盖与「与站点矛盾的回答」', '约 90–150s'],
      optimize: ['内容:把最大缺口写成发布级目标语言页面 + FAQ + FAQPage JSON-LD,按你市场的引用画像定结构与长度', '约 60s'],
      site: ['主页:抓你的真实主页,产出可直接粘贴的 schema.org JSON-LD + 具体修改清单', '约 60s'],
      distribute: ['分发:按引用排行的高权威域名逐个生成投递稿(目录 / PR / 评测),分 3 档优先级;竞对及其供应商域名自动排除;社区渠道只出「互动简报」', '约 60s'],
      encyclopedia: ['百科:诚实评估维基收录资格(notability),给出草稿或先建声量的现实路径;固定附合规提交路径,绝不直接发布', '约 60s'],
      full_scan: ['完整扫描:发现 → 监测 → 报告 一键串行,断点续跑', '约 4–6 分钟'],
    },
    monitorRows: [
      ['出现率走势', '每次扫描一个点,本品牌永远金色,每个竞品有自己固定的颜色。切到某个引擎时只显示本品牌那条线(竞品线保持全量扫描口径)。图下标出「变动最大」的品牌。'],
      ['品牌可见度', '每行 = 提到该品牌的回答 ÷ 全部回答。一条回答可以同时提到几个品牌,所以各行不可相加;这张表回答「出现在多少回答里」。附提及数与出现时情感。'],
      ['声量份额', '品牌提及次数 ÷ 所有被追踪品牌的提及次数,合计 100%,回答「被提到的份额有多大」。只有关系标为「竞对」的实体进分母。'],
      ['各引擎出现率', '同一品牌在 5 个引擎上的出现率并排(分母是该引擎的回答数),因为同一品牌在不同引擎间差异很大。点引擎名切换整个看板到该引擎视图。'],
      ['AI 引用的来源', '域名 × 引用次数 × 引擎数 × 已读页面。「页面」列显示我们已抓取的被引页面数(robots 拒绝会标出),悬停看词数、更新日期、schema。排行来自跨扫描的 SQL 聚合,不受 1000 行上限影响。'],
      ['引用画像', '每个引擎至少 8 个被引页面后生成:典型结构、长度、更新频率、schema 类型。内容与主页智能体据此定稿,而不是凭经验猜。'],
      ['各问题出现率', '提示词 × 引擎的格子:✓ 提到、· 未提、空 = 本次未抽到。点格子打开那条 AI 原答(含引用链接);表头「显示全部」看完整题库。'],
    ],
    setsRows: [
      ['入口', '工作区页头「竞对与提示词」,项目成员可用。所有修改存于项目配置;发现阶段的原始资产与历史扫描永不改动,可随时恢复。'],
      ['竞对集编辑', '给每个实体标关系:竞对 / 合作伙伴 / 目录平台 / 观察对象 / 自身——只有「竞对」进声量份额、基准与缺口计算,「观察对象」只画线不进分母。标记跨月度刷新自动继承:标过合作伙伴的实体不会再被识别成竞对。也可改名、删除、手动添加。'],
      ['提示词库编辑', '点击任意提示词排除 / 恢复(划线显示);点 ✎ 把一条题改写成更地道的本地问法,并写下「为什么这样改」——改写与理由都进入编辑日志,沉淀为训练数据。底部可逐行新增自定义提示词并归组。修改自下次扫描起生效。'],
      ['Core 基准冻结', '合同里的 Core 题目标为「已冻结」:界面不允许改动,修改需双方书面确认后由运营方执行。这是为了让逐期数据可比。'],
      ['为什么要人工编辑', 'AI 从真实回答提取竞对,但「谁算竞对」是商业判断——机器负责发现,人负责定性。每一次你的定性都被记录、被复用,这是你在系统里沉淀的资产。'],
    ],
    languageRows: [
      ['三种语言,各管各的', '提示词语言 = 买家真的用什么语言问 AI(越南 = 越南语,香港 = 繁體中文 + 粵語口語,美国 = 英语);交付物语言 = 报告、内容稿写给谁看(默认跟市场,可按项目改);界面语言 = 你操作平台的语言(中 / EN / VN),只影响按钮和标题。'],
      ['默认规则', '建项目时选市场即确定前两者;运营方可在项目设置里改交付物语言(如客户要求中文报告)。改动只影响之后的运行,历史交付物不变。'],
      ['页内翻译', '交付物保持市场语言不变;点页头「中文 / EN」在页内翻译阅读,原始资产不动。翻译只在交付物语言与阅读语言不同时出现。'],
      ['长输出的稳健性', '越南语、泰语等非英语输出更长,平台按语言给模型更大的输出预算与更长的超时;被截断的输出不会被当作成功保存,会自动重跑。'],
    ],
    aigvrIntro:
      '每次监测把 Prompt 库抽样后同题发给 5 个 AI 引擎,回答由评委模型(温度 0.1)逐条结构化打分,再聚合为五个维度(各 0–100)与一个综合分。界面展示名为「AI Mindset Index」(合同指标名为 AIGVR 的客户仍显示 AIGVR),算法相同。评分卡头部呈现六个互不重叠的指标:出现率 / 声量份额 / 出现时位置(首位推荐率为其重点过滤视图)/ 出现时情感 / 引用强度 / 高意图缺口数。',
    sampleTitle: '采样设计',
    sampleBody:
      '20 条重点 Prompt 每次全测,其余按阶段均衡抽样至套餐上限(每次 12 / 20 / 24 条);× 引擎数 ≈ 48–120 次真实查询。问题按意图二分呈现:高意图(谁提供 / 最好 / 价格 / 比较 / 品牌名 / 地点等购买信号)与教育型——教育型里 AI 很少点名品牌,出现率低属正常,这些问题输出为内容选题。缺口清单只统计高意图问题。为保证分数可比:prompt 库与竞品名单均冻结复用、每月刷新。置信标注:单元格 n≥12 高 · ≥6 中 · <6 低。',
    dimName: { presence: '出现率 Presence', prominence: '显著度 Prominence', competitiveShare: '声量份额 Share of Voice', sentiment: '情感 Sentiment', citation: '引用 Citation' },
    dimDef: {
      presence: '提及品牌的回答 ÷ 全部有效回答。',
      prominence: '被提及时的位置得分均值:0 未提 · 1 顺带 · 2 多选之一 · 3 首选 / 重点推荐;按 ÷3×100 归一。',
      competitiveShare: '品牌提及次数 ÷(品牌提及 + 竞品提及)。竞品从真实回答里提取,且只计关系标签为「竞对」的实体;评分卡会注明哪些实体被排除及原因。',
      sentiment: '被提及时的态度均值:正面 1 · 中性 0.5 · 负面 0。',
      citation: '回答中引用品牌自有域名链接的比例(AEO 信号,Perplexity 与 Google AIO 贡献最多)。标准 v1.1 §3.6 要求引用覆盖至少 4/5 引擎才报告该指标。',
    },
    formulaTitle: '综合分公式',
    judgeTitle: '评分为什么可信',
    judgeBody:
      '不数关键词——评委模型读完整回答后输出结构化判定(是否提及 / 位置 / 情感 / 竞品名单),温度 0.1、批量送审;竞品名单由第二个抽取器从回答文本中提取(温度 0.2),避免「猜竞品」带来的假阳性。每条判定的原答都能在看板里点开复核;人工纠正的标签永远不会被机器覆盖。',
    tomBody:
      '首位推荐率(合同 KPI)= 品牌作为首选 / 重点推荐(prominence = 3)的回答 ÷ 全部查询。评分卡同时给出整体值与 20 条重点 Prompt 的子集值(keySet 独立成线,n = 20 × 引擎数)。',
    surfacesBody:
      '五个引擎里,Google AI Overview 是「真实界面」——抓取真实 Google 搜索结果页(按市场本地化 gl/hl,越南 = vn/vi),用户真实看到什么就测什么;其余四个(ChatGPT / Gemini / Perplexity / Claude)走模型 API,是「API 代理」——同模型但非消费者界面,界面上有明确标注。某条查询 AIO 超时即记为「该题无 AIO」,不影响其他引擎;某引擎连续不可用会在报告注明并只按其余引擎计算。',
    authorityBody:
      '每次扫描把所有 AI 回答中的引用链接落库,跨扫描聚合出「AI 在这个市场真正引用哪些域名」的排行。从 2026-09 起平台还抓取被引页面本身(尊重 robots.txt,每域名有上限),记录结构、词数、更新日期与 schema 类型,汇成每个引擎的「引用画像」;客户自己的公开页面也纳入语料,报告据此给出站点覆盖(哪些问题官网是空白)与「与站点矛盾的 AI 回答」。分发智能体直接按引用排行选投放目标——在 AI 已经信任的域名上建设内容,而不是盲投;竞对及其供应商域名自动排除。越南市场的信源清单每月公开发布(/sources/vietnam,CC BY 4.0)。',
    trendBody:
      '项目的第一次监测自动成为 Day-0 基线,右栏趋势线展示 AIGVR / 可见度 / 缺口随每次扫描的变化。趋势图下方是「月度趋势 · 环比」:每个自然月取最后一次扫描为月度快照,跨月后自动生成。定期扫描按套餐节奏由平台自动执行(Starter 每月、Growth 每两周、Scale 每周,扫描日可按客户管理节奏设定),定期扫描不扣 credit。注意:引擎组合或竞对口径变化会打断严格可比性——趋势解读以同口径区间为准,口径变更处会注明。',
    actionsRows: [
      ['记录一个行动', '右栏「记录一个行动」或交付物上的「标记为已发布」:填 URL、类型(官网更新 / 文章 / 目录 / 百科 …)、发布日期与针对的问题。发布日期不能是未来。'],
      ['自动核验', '平台随后抓取该 URL:是否可达、标题、词数、内容哈希;之后每周重抓,内容变化会记下「变更时间」。记录上显示「✓ 已上线 · N 词」或「✗ 不可达」。'],
      ['归因', '每次新扫描后,系统按「发布日期之前 vs 之后」比较针对问题的出现率(逐引擎),以及该域名被引用次数的前后变化;写进周报的「行动与变化」段落。'],
      ['为什么重要', '这是把你的执行沉淀成系统资产的地方:哪类行动在哪个引擎上有效,只有记录下来才能被下一次计划复用。三个月以上的项目,这条记录就是最有价值的数据。'],
    ],
    resultsRows: [
      ['沙箱改写(内容 / 主页 / 分发 / 百科)', '每个创作型交付物是可编辑工作副本:直接改文本、按快捷指令或一句话让 AI 修订,版本栈可回退,复制即用。修订基于当前稿,不会推倒重来。'],
      ['人工修改优先', '你在任何交付物上做的编辑(标签、改写、删除)都记在编辑层,重跑时重新叠加在新结果之上——机器永远不会覆盖人的判断。'],
      ['顾问问答(监测 / 报告 / 完整扫描)', '在结果下方直接提问(「哪个缺口先打?」),回答锚定当前数据,并给出下一步智能体的一键入口。'],
      ['阅读语言', '交付物保持市场语言不变,点「中文 / EN」在页内翻译阅读,原始资产不动。'],
      ['重跑', '舞台头部「重跑」按钮;监测类重跑 = 新的趋势数据点;手动触发按 credit 计(完整扫描 / 监测 25,其余 10),失败自动退回。'],
      ['导出 PDF', '舞台头部「导出 PDF」(或 ⌘P):白底品牌页眉文档,自动展开全部折叠内容,隐藏界面元素。'],
    ],
    complianceRows: [
      ['数字只来自品牌事实', '内容、分发、主页智能体只能使用品牌画像与你上传资料里的数字;凡是找不到出处的数字一律替换为占位符,由你填入。这是对「AI 编数据」的硬性防线。'],
      ['竞对不做分发目标', '分发目标自动排除竞对集里的域名、竞对的供应商站点,以及你在项目里标注排除的域名。'],
      ['只产事实,不产体验', '所有智能体只能生成可验证的事实信息,任何第一人称用户体验口吻(中 / 英 / 越 / 泰 / 印尼 / 马来 / 菲语全覆盖检测)一律判为伪造证言并丢弃——体验只能来自真实顾客。'],
      ['本地问法而非直译', '越南语等输出会扫描汉越直译的生硬用语,改用市场里真实的说法;提示词库的 ✎ 改写与理由会反哺这一规则。'],
      ['社区渠道 = 互动简报', '论坛与社群(Reddit / Quora / Facebook 群组及本地论坛)不代写帖子,输出「互动简报」:去哪些社区、别人在问什么、我们能提供哪些经过验证的事实;参与必须用披露身份的官方账号。'],
      ['未经证实宣称标旗', '「行业领先」「用户数百万」类无出处宣称会被确定性扫描逐条标 ⚠,替换为品牌档案中的事实或删除后才发送。'],
      ['百科合规提交', '维基类内容仅由百科智能体产出,固定附:付费关系披露 → 草稿评审或编辑请求 → 独立编辑审核合入。绝不直接发布。'],
      ['真实评价', '顾客评价内容永不代写。报告只会建议「真实评价招揽」:给客户自己的顾客发邀请链接,评价由真实顾客撰写。'],
    ],
    channelRows: [
      ['组织三级', 'MemeCMO(总部)→ 渠道商 → 终端客户;数据行级隔离(Postgres RLS),互相不可见。'],
      ['开客户', '渠道商管理员在工作台点「+ New client」→ 总部审批队列 Approve → 客户组织激活并自动获得订阅。'],
      ['邀请成员', '组织标题行「Invite」→ 填邮箱与角色 → 自动发邮件(或复制链接);对方用被邀邮箱登录即入组。admin:组织、邀请、账单;editor:可运行智能体、记录行动、编辑交付物;viewer:只读、导出 PDF、就结果提问。席位免费不限量。'],
      ['扫描额度', '每月计量扫描(完整扫描 / 监测)上限:Starter 4 · Growth 12 · Scale 30,定期扫描计入;总部与渠道商不计量。超额返回明确提示,下期重置。'],
      ['自动周报邮件', '配置收件人后按项目的周报日(默认周二)自动发送:精简数字区(指数 / 分引擎 / 本期交付)+ 效果归因与策略建议 + 「行动与变化」;解读口径随项目阶段自动切换(建设期不解读分数波动)。完整数据始终在工作台下载 PDF。掉分 ≥5 或某引擎归零会即时告警,不等周期。'],
    ],
    plansRows: [
      ['三档套餐', 'Starter US$99 · Growth US$199 · Scale US$1,999+,按「品牌 × 市场」按月订阅。套餐决定定期扫描节奏、题库上限、引擎数、项目数、报告频率与内含 credit;完整服务项与计费规则见 /pricing。'],
      ['订阅买的是什么', '不是"若干次扫描",而是完整交付服务:冻结面板上可比的定期扫描、自动报告与告警、内容智能体、看板与席位。Starter / Growth 为自助服务;只有 Scale 含顾问会议。'],
      ['Credit 买的是什么', '"立即触发权"。定期扫描永远不耗 credit;你自己点「运行」的即时加跑才计(完整扫描 / 监测 25,其余 10)。Growth / Scale 每月赠 50 / 150;点包 250 / 1,150 / 3,900 credit 对应 US$250 / 1,000 / 3,000。'],
      ['两池记账', '赠送池(月度内含、活动赠送)优先扣减、不开票;购买池可开票。失败的运行自动退回。运营方替你做的交付运行不扣 credit。'],
      ['注册方式', '自助注册可获一次免费预览扫描(2 引擎 × 8 题),之后订阅;或由渠道商 / 组织邀请加入。每次扫描都是真实的引擎费用,所以没有无限免费扫描。'],
      ['欠费与退出', '订阅进入 past_due / canceled 后:扫描暂停,但看板、全部历史与 PDF 导出保留——数据归客户,终止后 12 个月内可要求导出。恢复订阅即恢复扫描。'],
    ],
    faqRows: [
      ['运行失败了', '舞台会显示具体原因;点「重跑」即可——执行层有断点续跑,已完成阶段不会重复计费,失败运行扣的 credit 自动退回。'],
      ['监测很久没动', '正常时长 2–4 分钟;各引擎并行,单引擎慢不阻塞整体。任务在服务器运行,可离开页面。若长时间停在同一进度,重跑一次。'],
      ['某引擎显示 0 样本', '多为该引擎当次全部超时(如 AIO 波动),不影响其他引擎;重扫通常恢复。连续不可用会在报告注明。'],
      ['提示配额已用完', '当月计量扫描(完整扫描 / 监测)达套餐上限;升级套餐或等周期重置,其他智能体不受限。'],
      ['提示 credit 不足', '手动加跑需要 credit;定期扫描与报告照常。工作台「套餐与账单」可购买点包,或等下月赠送。'],
      ['交付物语言不对', '交付物语言跟随项目的市场(建项目时选定),不是界面语言;要中文阅读用页头阅读语言切换;要改交付物语言请联系运营方改项目设置。'],
      ['报告说「与站点矛盾」但我们是对的', '矛盾判定只对照你官网已公开的页面;若官网未更新,先更新官网,再记录一个行动,下次扫描会重新比对。'],
      ['邀请链接打不开', '邀请与被邀邮箱绑定且 14 天有效;确认对方用该邮箱登录,过期就重发一条。'],
    ],
  },
  en: {
    langName: 'English',
    shotDashboard: 'Dashboard: one band per organization, project cards (score well, presence track, last scan), with Plan & billing, Invite and + New project at the top right',
    shotWorkspace: 'Workspace: deliverables rail on the left (Setup / Measure / Act) · the stage · the right rail with latest scan, credits and action log; on phones the rail becomes a tab strip',
    shotMonitor: 'Monitor, upper half: presence over time (your brand in gold, each competitor in its own colour), brand visibility (per answer, not additive), share of voice (sums to 100%)',
    shotSources: 'Sources AI cites: domain × citations × engines × pages read; below it the citation profile of the cited pages — structure, update dates, schema',
    shotPrompts: 'Presence by question: a prompt × engine grid; click any cell to open that AI answer and the sources it cited',
    shotReport: 'Report: findings and recommendations collapsed by default, expandable one by one; site coverage (vacuum / covered) and "AI answers that contradict the site" as folded blocks',
    shotSandbox: 'Content sandbox: a publish-ready draft in the market language — edit or copy directly, or rewrite with one sentence; your edits survive re-runs',
    shotSets: 'Competitors & prompts: tag each entity (competitor / partner / directory / observed / self); exclude prompts or reword them into natural local phrasing with a reason',
    title: 'User Guide & Algorithm White Paper',
    subtitle: 'How to use the system · how every number is computed · what to do when something breaks',
    updated: 'Same source as the code: every constant on this page is taken from the implementation; a mismatch with the product is a bug — please report it. 2026-09 edition: monitor views, citation profile, verified actions, language rules, Starter / Growth / Scale plans.',
    backToDashboard: 'Back to dashboard',
    partnerCtaTitle: 'Channel Partner Delivery Playbook',
    partnerCtaDesc: 'The full P1 assessment ⇄ P2 hands-on remediation methodology: five standard work packages, a 90-day roadmap and a reusable template library · 中/EN/VN/TH/AR',
    standardTitle: 'AI Visibility Measurement Standard v1.1',
    standardDesc: 'Metric definitions, sample sizes, confidence labels, citation coverage (4/5 engines), site comparison, action verification and the public source-list rule are all written in the public standard. Plans differ in scope, never in method.',
    standardCta: 'Read the standard v1.1 (PDF)',
    sections: {
      quickstart: 'Quick start',
      layout: 'Dashboard & workspace layout',
      agents: 'Agent reference (10)',
      monitor: 'How to read the monitor',
      sets: 'Competitor set & prompt library',
      language: 'Languages: prompts / deliverables / interface',
      aigvr: 'AIGVR five-dimension algorithm',
      topofmind: 'Top-of-mind rate & key prompts',
      surfaces: 'Real surface vs API proxy',
      authority: 'Citation index & cited pages',
      trend: 'Day-0 baseline, trend & scheduled scans',
      actions: 'Action log & automatic verification',
      results: 'Working with results: sandbox / advisor / translate / export',
      compliance: 'Compliance & anti-fabrication',
      channel: 'Organizations, invites, quotas & digests',
      plans: 'Plans, credits & billing',
      faq: 'Troubleshooting FAQ',
    },
    quickstart: [
      ['1 · Create a project', 'Dashboard → your organization → "+ New project": one project = one brand × one market (e.g. a brand × Vietnam). If the brand has several product lines, create one project per line and compare side by side; competitor sets and scores are fully independent, and merging them would hide each other.'],
      ['2 · Build the brand profile', 'In the workspace, run Profile first: it fetches your site and builds a public fact base (definition / services / differentiators / figures / NAP). "Brand documents" in the right rail takes guidelines or positioning docs (.txt / .md / text PDF). From then on every content agent may only use figures from this fact base; anything else becomes a placeholder.'],
      ['3 · Full scan', 'Full Scan runs Discovery → Monitor → Report in sequence, about 4–6 minutes, on the server — you can leave the page. The first scan becomes the Day-0 baseline; after that, scheduled scans run at your plan\'s cadence.'],
      ['4 · Read the monitor', 'Top to bottom: presence over time → brand visibility → share of voice → presence by engine → sources AI cites and the citation profile → presence by question. Every cell opens the underlying AI answer with its citations.'],
      ['5 · Build and log', 'Run Optimize / Site / Distribute / Encyclopedia against the gaps; each produces a finished deliverable. Once published, log the URL under "Log an action" in the right rail: the platform fetches and verifies it, and later scans attribute the change by question and engine.'],
    ],
    layout: [
      ['Dashboard', 'One band per organization: a title row (plan, status, Invite, Plan & billing, + New project / + New client) and project cards below — score well, presence track, last-scan time — sorted by recent activity.'],
      ['Left rail · deliverables', 'The 10 agents grouped as Setup / Measure / Act; each shows its last run status — click the row to view, "Run" to re-run. The input at the bottom gives Full Scan a focus ("focus on F&B customers"), which steers Discovery. On phones and tablets the rail becomes a horizontal tab strip.'],
      ['Center · stage', 'The full result of the selected deliverable; while running, phased progress and the technical trace; when done, the result modules. Reports and long results are collapsed by default and expand item by item.'],
      ['Right rail · context', 'Latest scan (presence / share of voice / brand rank / high-intent gaps), AIGVR trend and month-over-month, credit balance, brand documents, action log, readiness checklist.'],
      ['Header', 'Competitors & prompts · Export PDF · Re-run · reading language (original / 中文 / EN) · interface language (中 / EN / VN) · day / night theme · Guide · back to dashboard.'],
    ],
    agentCols: ['Agent', 'What it does', 'Needs', 'Time'],
    agentDesc: {
      profile: ['Brand profile: fetches your site → public fact base (definition / services / differentiators / figures / NAP) + your uploaded documents, shared by every execution agent; the only source of numbers', '~45s'],
      discovery: ['Discovery: 110 buyer questions (5 journey stages × 22) + 20 flagged as key; library cap follows the plan (60 / 110 / 150); supports an intent focus', '~60s'],
      answers: ['Standard answers: for each of the 20 key prompts, the answer we want AI to give — market language + English (English markets single-language), strictly grounded in brand facts', '~60s'],
      monitor: ['Monitor: samples the library, queries 5 engines (Starter: 4), a judge model scores every answer; five dimensions + competitor benchmark + gaps + citations; every cited link is stored and its page queued for fetching', '~2–4 min'],
      report: ['Report: the latest scorecard as executive-readable findings + recommendations in the market\'s report language; with site coverage and "answers that contradict the site"', '~90–150s'],
      optimize: ['Content: the biggest gap as a publish-ready page + FAQ + FAQPage JSON-LD in the target language, structured and sized to your market\'s citation profile', '~60s'],
      site: ['Site: fetches your real homepage, returns paste-in schema.org JSON-LD + a concrete edit list', '~60s'],
      distribute: ['Distribute: one pitch per high-authority domain from the citation ranking (directory / PR / review), 3 priority tiers; competitor and vendor domains excluded automatically; community channels get an engagement brief only', '~60s'],
      encyclopedia: ['Encyclopedia: an honest notability check, then a draft or the realistic path (build coverage first); always with a compliant submission path, never direct publishing', '~60s'],
      full_scan: ['Full scan: Discovery → Monitor → Report in one click, resumable', '~4–6 min'],
    },
    monitorRows: [
      ['Presence over time', 'One point per scan; your brand is always gold and every competitor keeps its own colour. In an engine view only your brand\'s line is shown for that engine (competitor lines stay whole-scan). The biggest mover is called out under the chart.'],
      ['Brand visibility', 'Each row = answers naming that brand ÷ all answers. One answer can name several brands, so rows do not add up; this table answers "in how many answers do I appear". With mention counts and sentiment when present.'],
      ['Share of voice', 'Brand mentions ÷ all tracked-brand mentions, summing to 100% — "how big is my share of what gets mentioned". Only entities tagged competitor enter the denominator.'],
      ['Presence by engine', 'The same brand across the 5 engines side by side (denominator = that engine\'s answers), because the same brand differs sharply between engines. Click an engine name to switch the whole board to that engine.'],
      ['Sources AI cites', 'Domain × citations × engines × pages read. The Pages column shows how many cited pages we have fetched (robots refusals are marked); hover for word count, update date and schema. The ranking is a SQL aggregate across scans, immune to the 1,000-row cap.'],
      ['Citation profile', 'Built once an engine has at least 8 fetched cited pages: typical structure, length, update frequency, schema types. The content and site agents write to it instead of guessing.'],
      ['Presence by question', 'A prompt × engine grid: ✓ mentioned, · not mentioned, blank = not sampled this scan. Click a cell to open the AI answer with its links; "Show all" in the header lists the full library.'],
    ],
    setsRows: [
      ['Where', '"Competitors & prompts" in the workspace header, available to project members. All edits live in the project configuration; Discovery\'s original asset and past scans are never modified and can be restored any time.'],
      ['Competitor set', 'Tag each entity: competitor / partner / directory / observed / self — only competitors enter share of voice, benchmarks and gaps; observed entities are plotted but stay out of the denominator. Tags are inherited across monthly refreshes: an entity tagged partner is never re-detected as a competitor. Rename, delete or add manually.'],
      ['Prompt library', 'Click any prompt to exclude / restore it (struck through); click ✎ to reword it into natural local phrasing and write down why — the rewrite and the reason go into the edit log and become training data. Add custom prompts line by line into a group. Changes apply from the next scan.'],
      ['Frozen Core benchmark', 'Contract Core prompts are marked frozen: the UI does not allow changes; edits need bilateral written sign-off and are applied by the operator, so periods stay comparable.'],
      ['Why edit by hand', 'AI extracts competitors from real answers, but "who counts as a competitor" is a business judgement — the machine discovers, a human qualifies. Every qualification you make is recorded and reused: it is the asset you accumulate inside the system.'],
    ],
    languageRows: [
      ['Three languages, three jobs', 'Prompt language = the language buyers really ask AI in (Vietnam = Vietnamese, Hong Kong = Traditional Chinese + spoken Cantonese, US = English); deliverable language = who reports and drafts are written for (defaults to the market, adjustable per project); interface language = the language you operate in (中 / EN / VN), affecting only buttons and titles.'],
      ['Defaults', 'Choosing the market when creating a project sets the first two; the operator can change the deliverable language in project settings (e.g. a client asking for Chinese reports). Changes affect future runs only; past deliverables stay.'],
      ['Translate in place', 'Deliverables keep the market language; "中文 / EN" in the header translates on the page for reading, the original asset untouched. The switch only appears when the deliverable language differs from your reading language.'],
      ['Long outputs', 'Vietnamese, Thai and other non-English outputs run longer; the platform gives the model a larger output budget and longer timeouts per language, and a truncated output is never saved as a success — it re-runs.'],
    ],
    aigvrIntro:
      'Each monitor samples the prompt library and sends the same questions to 5 AI engines; a judge model (temperature 0.1) scores every answer structurally, aggregated into five dimensions (0–100 each) and one composite. The UI calls it the "AI Mindset Index" (clients whose contract names AIGVR still see AIGVR); the algorithm is identical. The scorecard header shows six non-overlapping metrics: presence / share of voice / position when present (top-of-mind is its key-prompt filter) / sentiment when present / citation strength / high-intent gap count.',
    sampleTitle: 'Sampling design',
    sampleBody:
      'The 20 key prompts are measured every time; the rest are sampled stage-balanced up to the plan cap (12 / 20 / 24 per scan); × engines ≈ 48–120 real queries. Questions are split by intent: high-intent (who provides / best / price / compare / brand name / location) and educational — AI rarely names brands in educational answers, low presence there is normal and those prompts feed content topics. The gap list counts high-intent questions only. For comparability the prompt library and competitor list are frozen and reused, refreshed monthly. Confidence: cell n≥12 high · ≥6 medium · <6 low.',
    dimName: { presence: 'Presence', prominence: 'Prominence', competitiveShare: 'Share of Voice', sentiment: 'Sentiment', citation: 'Citation' },
    dimDef: {
      presence: 'Answers mentioning the brand ÷ all valid answers.',
      prominence: 'Mean position score when mentioned: 0 absent · 1 passing · 2 one of several · 3 first / featured; normalized ÷3×100.',
      competitiveShare: 'Brand mentions ÷ (brand + competitor mentions). Competitors are extracted from real answers and only entities tagged competitor count; the scorecard states what was excluded and why.',
      sentiment: 'Mean attitude when mentioned: positive 1 · neutral 0.5 · negative 0.',
      citation: 'Share of answers citing the brand\'s own domain (AEO signal; Perplexity and Google AIO contribute most). Standard v1.1 §3.6 requires citation coverage on at least 4/5 engines before the metric is reported.',
    },
    formulaTitle: 'Composite formula',
    judgeTitle: 'Why the scoring is trustworthy',
    judgeBody:
      'No keyword counting — the judge reads the full answer and returns a structured verdict (mentioned / position / sentiment / competitor list) at temperature 0.1 in batches; competitor names are extracted by a second extractor (temperature 0.2), avoiding false positives from "guessed" competitors. Every judged answer can be opened and checked in the board; a human correction is never overwritten by the machine.',
    tomBody:
      'Top-of-mind rate (contract KPI) = answers where the brand is the first / featured recommendation (prominence = 3) ÷ all queries. The scorecard gives both the overall value and the 20-key-prompt subset (keySet as its own line, n = 20 × engines).',
    surfacesBody:
      'Among the five engines, Google AI Overview is a real surface — the real Google results page, localized per market (Vietnam = vn/vi): what users actually see is what we measure. The other four (ChatGPT / Gemini / Perplexity / Claude) run through model APIs — same models, not the consumer interface — and are labelled as API proxies in the UI. An AIO timeout on one query is recorded as "no AIO for this prompt" without affecting other engines; an engine that stays unavailable is noted in the report and the rest are used.',
    authorityBody:
      'Every scan stores every link the AI answers cite and aggregates, across scans, "which domains AI really cites in this market". Since 2026-09 the platform also fetches the cited pages themselves (respecting robots.txt, capped per domain), records structure, word count, update date and schema types, and builds a citation profile per engine; the client\'s own public pages join the corpus, so the report can state site coverage (which questions the site leaves blank) and "AI answers that contradict the site". Distribute picks targets straight from the ranking — build on domains AI already trusts, not blindly — with competitor and vendor domains excluded. The Vietnam source list is published monthly (/sources/vietnam, CC BY 4.0).',
    trendBody:
      'A project\'s first monitor becomes its Day-0 baseline; the rail trend shows AIGVR / visibility / gaps per scan. Below it, "Monthly trend · MoM" takes the last scan of each calendar month as the monthly snapshot, generated automatically once a month boundary is crossed. Scheduled scans run at the plan\'s cadence (Starter monthly, Growth every two weeks, Scale weekly; the scan day follows the client\'s management rhythm) and never consume credits. Note: a change in the engine mix or the competitor definition breaks strict comparability — read trends within same-definition ranges; definition changes are annotated.',
    actionsRows: [
      ['Log an action', '"Log an action" in the right rail, or "Mark published" on a deliverable: URL, kind (site update / article / directory / encyclopedia …), publish date and the question it targets. The date cannot be in the future.'],
      ['Automatic verification', 'The platform then fetches the URL: reachable, title, word count, content hash; it re-fetches weekly and records a "changed" time when the content moves. The entry shows "✓ live · N words" or "✗ not reachable".'],
      ['Attribution', 'After every new scan, the system compares presence on the targeted questions before vs after the publish date (per engine) and the change in citations of that domain; it is written into the digest\'s "Actions and what moved" section.'],
      ['Why it matters', 'This is where your execution becomes a system asset: which kind of action works on which engine can only be reused by the next plan if it was recorded. Past three months, this log is the most valuable data in the project.'],
    ],
    resultsRows: [
      ['Sandbox (Content / Site / Distribute / Encyclopedia)', 'Every creative deliverable is an editable working copy: edit the text directly, use quick commands or one sentence to have the AI revise, roll back through the version stack, copy and use. Revisions build on the current draft; nothing is started over.'],
      ['Human edits win', 'Every edit you make on a deliverable (labels, rewrites, deletions) is kept in an edit layer and re-applied on top of a re-run — the machine never overwrites a human judgement.'],
      ['Advisor Q&A (Monitor / Report / Full Scan)', 'Ask directly under the result ("which gap first?"); the answer is anchored on the current data and offers a one-click entry to the next agent.'],
      ['Reading language', 'Deliverables keep the market language; "中文 / EN" translates on the page for reading, the original untouched.'],
      ['Re-run', 'The "Re-run" button in the stage header; a monitor re-run = a new trend point; manual triggers are paid in credits (full scan / monitor 25, others 10), refunded on failure.'],
      ['Export PDF', '"Export PDF" in the stage header (or ⌘P): a white, brand-headed document with all folded content expanded and UI chrome hidden.'],
    ],
    complianceRows: [
      ['Numbers only from brand facts', 'Content, Distribute and Site may only use figures from the brand profile and your uploaded documents; any figure without a source is replaced by a placeholder for you to fill. This is the hard line against invented data.'],
      ['Competitors are never targets', 'Distribution targets automatically exclude domains in the competitor set, competitors\' vendor sites, and domains you marked as excluded in the project.'],
      ['Facts only, never experiences', 'All agents may only generate verifiable facts; any first-person user-experience voice (detected across 中 / EN / VN / TH / ID / MS / FIL) is treated as a fabricated testimonial and dropped — experiences can only come from real customers.'],
      ['Local phrasing, not calques', 'Vietnamese and other outputs are scanned for stiff loan-translations and rewritten into what the market actually says; your ✎ rewrites and reasons in the prompt library feed this rule.'],
      ['Community channels = engagement brief', 'Forums and groups (Reddit / Quora / Facebook groups and local forums) never get ghost-written posts; the output is a brief: which communities, what people ask, which verified facts we can offer; participation must use a disclosed official account.'],
      ['Unverified claims flagged', '"Industry-leading", "millions of users" and similar sourceless claims are flagged ⚠ by a deterministic scan and must be replaced by profile facts or removed before sending.'],
      ['Compliant encyclopedia submission', 'Wiki-style content comes only from the Encyclopedia agent and always carries: paid-relationship disclosure → draft review or edit request → independent editor review. Never direct publishing.'],
      ['Real reviews', 'Customer reviews are never written. Reports only recommend "real review solicitation": invitation links to the client\'s own customers, reviews written by real customers.'],
    ],
    channelRows: [
      ['Three tiers', 'MemeCMO (head office) → channel partner → end client; data isolated row by row (Postgres RLS), invisible to each other.'],
      ['Provision a client', 'A partner admin clicks "+ New client" on the dashboard → head-office approval queue → the client organization is activated with a subscription.'],
      ['Invite members', '"Invite" in the organization title row → email and role → email sent automatically (or copy the link); they join by signing in with that email. admin: organization, invites, billing; editor: runs agents, logs actions, edits deliverables; viewer: read-only, PDF export, questions on results. Seats are free and unlimited.'],
      ['Scan quota', 'Metered scans per month (full scan / monitor): Starter 4 · Growth 12 · Scale 30, scheduled scans included; head office and partners are not metered. Over quota returns a clear message and resets next period.'],
      ['Automated digest email', 'With recipients configured, sent on the project\'s digest day (default Tuesday): a concise numbers block (index / per engine / this period\'s deliverables) + attribution and strategy + "Actions and what moved"; the reading switches with the project stage (no score-noise reading during the build phase). Full data is always the workspace PDF. A drop ≥5 or an engine going to zero alerts immediately, not on the schedule.'],
    ],
    plansRows: [
      ['Three plans', 'Starter US$99 · Growth US$199 · Scale US$1,999+, subscribed monthly per brand × market. The plan sets the scheduled cadence, library cap, engines, projects, report frequency and included credits; the full service items and billing rules are on /pricing.'],
      ['What a subscription buys', 'Not "a number of scans" but the whole delivery service: comparable scheduled scans on a frozen panel, automated reports and alerts, the content agents, the board and seats. Starter / Growth are self-serve; only Scale includes advisory calls.'],
      ['What credits buy', 'The right to run something now. Scheduled scans never consume credits; only a run you trigger yourself does (full scan / monitor 25, others 10). Growth / Scale receive 50 / 150 per month; packs of 250 / 1,150 / 3,900 credits cost US$250 / 1,000 / 3,000.'],
      ['Two pools', 'The granted pool (plan allowance, promotions) is spent first and never invoiced; the purchased pool is invoiceable. Failed runs are refunded automatically. Runs the operator performs for you consume no credits.'],
      ['Sign-up', 'Self-serve sign-up includes one free preview scan (2 engines × 8 prompts), then a subscription; or join by partner / organization invite. Every scan is a real engine cost, so there is no unlimited free scanning.'],
      ['Arrears and exit', 'Once a subscription is past_due / canceled: scans pause, but the board, full history and PDF export remain — the data is the client\'s, exportable up to 12 months after termination. Restoring the subscription restores scanning.'],
    ],
    faqRows: [
      ['A run failed', 'The stage shows the reason; click "Re-run" — the execution layer resumes from checkpoints, completed phases are not billed again, and credits spent on the failed run are refunded automatically.'],
      ['Monitor has not moved for a while', 'Normal duration 2–4 minutes; engines run in parallel, one slow engine does not block the rest. The job runs on the server, you can leave the page. If it sits on the same step for long, re-run once.'],
      ['An engine shows 0 samples', 'Usually every query on that engine timed out this scan (e.g. AIO volatility); other engines are unaffected and a re-scan normally recovers it. Persistent unavailability is noted in the report.'],
      ['"Quota reached"', 'This month\'s metered scans (full scan / monitor) hit the plan cap; upgrade or wait for the period reset. Other agents are not limited.'],
      ['"Insufficient credits"', 'Manual runs need credits; scheduled scans and reports continue as contracted. Buy a pack under "Plan & billing" on the dashboard, or wait for next month\'s allowance.'],
      ['Wrong deliverable language', 'Deliverables follow the project\'s market (chosen at creation), not the interface language; use the header reading-language switch to read in Chinese; to change the deliverable language, ask the operator to change the project setting.'],
      ['The report says "contradicts the site" but we are right', 'Contradictions are judged only against pages already public on your site; update the site first, then log an action, and the next scan re-compares.'],
      ['The invite link does not open', 'Invites are bound to the invited email and valid for 14 days; make sure they sign in with that email, and re-send if expired.'],
    ],
  },
  vi: {
    langName: 'Tiếng Việt',
    shotDashboard: 'Bảng điều khiển: mỗi tổ chức một dải, thẻ dự án (giếng điểm, thanh tỷ lệ xuất hiện, lần quét gần nhất), góc phải có Gói & thanh toán, Mời, + New project',
    shotWorkspace: 'Workspace: cột sản phẩm bên trái (Chuẩn bị / Đo lường / Hành động) · sân khấu · cột phải với lần quét gần nhất, credit và nhật ký hành động; trên điện thoại cột trái thành dải tab',
    shotMonitor: 'Nửa trên bảng giám sát: tỷ lệ xuất hiện theo thời gian (thương hiệu của bạn màu vàng, mỗi đối thủ một màu riêng), bảng hiển thị thương hiệu (theo câu trả lời, không cộng dồn), thị phần nhắc tên (tổng 100%)',
    shotSources: 'Nguồn AI trích dẫn: tên miền × lượt trích × số engine × trang đã đọc; bên dưới là hồ sơ trích dẫn của các trang được trích — cấu trúc, ngày cập nhật, schema',
    shotPrompts: 'Tỷ lệ xuất hiện theo câu hỏi: lưới câu hỏi × engine; bấm ô bất kỳ để mở câu trả lời AI đó và nguồn nó trích dẫn',
    shotReport: 'Báo cáo: phát hiện và khuyến nghị mặc định thu gọn, mở từng mục; hai khối gập "độ phủ website" (trống / đã có) và "câu trả lời AI mâu thuẫn với website"',
    shotSandbox: 'Sandbox nội dung: bản thảo sẵn xuất bản bằng ngôn ngữ thị trường — sửa / sao chép trực tiếp, hoặc viết lại bằng một câu; chỉnh sửa của bạn được giữ sau khi chạy lại',
    shotSets: 'Đối thủ & câu hỏi: gắn quan hệ cho từng thực thể (đối thủ / đối tác / danh bạ / quan sát / chính mình); loại trừ câu hỏi hoặc dùng ✎ viết lại theo cách hỏi bản địa kèm lý do',
    title: 'Hướng dẫn sử dụng & Sách trắng thuật toán',
    subtitle: 'Dùng hệ thống thế nào · từng con số tính ra sao · gặp sự cố xử lý thế nào',
    updated: 'Cùng nguồn với mã: mọi hằng số trên trang này lấy từ triển khai thực tế; sai lệch với sản phẩm là lỗi — xin phản hồi. Bản 2026-09: bảng giám sát, hồ sơ trích dẫn, xác minh hành động, quy tắc ngôn ngữ, gói Starter / Growth / Scale.',
    backToDashboard: 'Về bảng điều khiển',
    partnerCtaTitle: 'Sổ tay bàn giao cho đối tác kênh',
    partnerCtaDesc: 'Phương pháp bàn giao đầy đủ P1 đánh giá ⇄ P2 chỉnh sửa thực tế: năm gói công việc chuẩn, lộ trình 90 ngày và thư viện mẫu dùng lại · 中/EN/VN/TH/AR',
    standardTitle: 'Tiêu chuẩn đo lường khả năng hiển thị AI v1.1',
    standardDesc: 'Định nghĩa chỉ số, cỡ mẫu, nhãn độ tin cậy, độ phủ trích dẫn (4/5 engine), đối chiếu website, xác minh hành động và quy tắc công bố danh sách nguồn đều được viết trong tiêu chuẩn công khai. Các gói khác nhau về phạm vi, không khác về phương pháp.',
    standardCta: 'Đọc tiêu chuẩn v1.1 (PDF)',
    sections: {
      quickstart: 'Bắt đầu nhanh',
      layout: 'Bố cục bảng điều khiển & workspace',
      agents: 'Tham chiếu agent (10)',
      monitor: 'Đọc bảng giám sát thế nào',
      sets: 'Quản lý bộ đối thủ & thư viện câu hỏi',
      language: 'Ngôn ngữ: câu hỏi / sản phẩm / giao diện',
      aigvr: 'Thuật toán AIGVR năm chiều',
      topofmind: 'Tỷ lệ đề xuất đầu tiên & câu hỏi trọng điểm',
      surfaces: 'Giao diện thật vs proxy API',
      authority: 'Chỉ mục trích dẫn & trang được trích',
      trend: 'Đường cơ sở Ngày 0, xu hướng & quét định kỳ',
      actions: 'Nhật ký hành động & tự xác minh',
      results: 'Thao tác kết quả: sandbox / cố vấn / dịch / xuất',
      compliance: 'Tuân thủ & chống bịa đặt',
      channel: 'Tổ chức, lời mời, hạn mức & bản tin',
      plans: 'Gói, credit & tính phí',
      faq: 'Xử lý sự cố thường gặp',
    },
    quickstart: [
      ['1 · Tạo dự án', 'Bảng điều khiển → tổ chức của bạn → "+ New project": một dự án = một thương hiệu × một thị trường (ví dụ một thương hiệu × Việt Nam). Thương hiệu có nhiều dòng sản phẩm thì tạo mỗi dòng một dự án để so sánh song song; bộ đối thủ và điểm số hoàn toàn độc lập, gộp lại sẽ che lấp nhau.'],
      ['2 · Xây hồ sơ thương hiệu', 'Vào workspace, chạy Profile trước: tải website và xây kho dữ kiện công khai (định nghĩa / dịch vụ / khác biệt / số liệu / NAP). "Tài liệu thương hiệu" ở cột phải nhận hướng dẫn hoặc tài liệu định vị (.txt / .md / PDF dạng văn bản). Từ đó mọi agent nội dung chỉ được dùng số liệu trong kho này; số nào không có nguồn sẽ thành chỗ trống.'],
      ['3 · Quét đầy đủ', 'Full Scan chạy tuần tự Khám phá → Giám sát → Báo cáo, khoảng 4–6 phút, trên máy chủ — bạn có thể rời trang. Lần quét đầu tiên là đường cơ sở Ngày 0; sau đó quét định kỳ chạy theo nhịp của gói.'],
      ['4 · Đọc bảng giám sát', 'Từ trên xuống: tỷ lệ xuất hiện theo thời gian → hiển thị thương hiệu → thị phần nhắc tên → tỷ lệ theo engine → nguồn AI trích dẫn và hồ sơ trích dẫn → tỷ lệ theo câu hỏi. Mỗi ô đều mở được câu trả lời AI gốc kèm trích dẫn.'],
      ['5 · Xây dựng và ghi lại', 'Chạy lần lượt Nội dung / Website / Phân phối / Bách khoa theo khoảng trống; mỗi lần cho ra sản phẩm hoàn chỉnh. Sau khi đăng, ghi URL vào "Ghi một hành động" ở cột phải: nền tảng tự tải và xác minh, các lần quét sau quy kết thay đổi theo câu hỏi và engine.'],
    ],
    layout: [
      ['Bảng điều khiển', 'Mỗi tổ chức một dải: hàng tiêu đề (gói, trạng thái, Mời, Gói & thanh toán, + New project / + New client) và thẻ dự án bên dưới — giếng điểm, thanh tỷ lệ xuất hiện, thời gian quét gần nhất — xếp theo hoạt động mới nhất.'],
      ['Cột trái · sản phẩm', '10 agent nhóm theo Chuẩn bị / Đo lường / Hành động; mỗi mục hiển thị trạng thái lần chạy gần nhất — bấm hàng để xem, "Chạy" để chạy lại. Ô nhập bên dưới cho Full Scan một trọng tâm ("tập trung khách F&B"), điều hướng bước Khám phá. Trên điện thoại và máy tính bảng cột này thành dải tab ngang.'],
      ['Giữa · sân khấu', 'Kết quả đầy đủ của sản phẩm đang chọn; khi chạy hiển thị tiến độ theo giai đoạn và dấu vết kỹ thuật; xong thì gọn lại thành các khối kết quả. Báo cáo và kết quả dài mặc định thu gọn, mở từng mục.'],
      ['Cột phải · bối cảnh', 'Lần quét gần nhất (tỷ lệ xuất hiện / thị phần / xếp hạng / khoảng trống ý định cao), xu hướng AIGVR và so sánh tháng, số dư credit, tài liệu thương hiệu, nhật ký hành động, danh sách sẵn sàng.'],
      ['Đầu trang', 'Đối thủ & câu hỏi · Xuất PDF · Chạy lại · ngôn ngữ đọc (gốc / 中文 / EN) · ngôn ngữ giao diện (中 / EN / VN) · chủ đề ngày / đêm · Hướng dẫn · về bảng điều khiển.'],
    ],
    agentCols: ['Agent', 'Làm gì', 'Cần', 'Thời gian'],
    agentDesc: {
      profile: ['Hồ sơ thương hiệu: tải website → kho dữ kiện công khai (định nghĩa / dịch vụ / khác biệt / số liệu / NAP) + tài liệu bạn tải lên, dùng chung cho mọi agent thực thi; nguồn số liệu duy nhất', '~45s'],
      discovery: ['Khám phá: 110 câu hỏi người mua (5 giai đoạn × 22) + 20 câu trọng điểm; giới hạn thư viện theo gói (60 / 110 / 150); hỗ trợ trọng tâm ý định', '~60s'],
      answers: ['Câu trả lời chuẩn: với mỗi câu trọng điểm, câu trả lời chúng ta muốn AI đưa ra — ngôn ngữ thị trường + tiếng Anh, bám chặt dữ kiện thương hiệu', '~60s'],
      monitor: ['Giám sát: lấy mẫu thư viện, hỏi 5 engine (Starter: 4), mô hình giám khảo chấm từng câu; năm chiều + đối sánh đối thủ + khoảng trống + trích dẫn; mọi liên kết được lưu và xếp hàng tải trang', '~2–4 phút'],
      report: ['Báo cáo: bảng điểm mới nhất viết thành phát hiện + khuyến nghị cho lãnh đạo, bằng ngôn ngữ báo cáo của thị trường; kèm độ phủ website và "câu trả lời mâu thuẫn với website"', '~90–150s'],
      optimize: ['Nội dung: khoảng trống lớn nhất thành trang sẵn đăng + FAQ + FAQPage JSON-LD bằng ngôn ngữ đích, cấu trúc và độ dài theo hồ sơ trích dẫn của thị trường', '~60s'],
      site: ['Website: tải trang chủ thật, trả về JSON-LD schema.org dán sẵn + danh sách chỉnh sửa cụ thể', '~60s'],
      distribute: ['Phân phối: mỗi tên miền uy tín trong xếp hạng trích dẫn một bài gửi (danh bạ / PR / đánh giá), 3 mức ưu tiên; tự loại tên miền đối thủ và nhà cung cấp của họ; kênh cộng đồng chỉ có bản tóm tắt tương tác', '~60s'],
      encyclopedia: ['Bách khoa: đánh giá trung thực tiêu chí notability, rồi bản thảo hoặc lộ trình thực tế (xây độ phủ trước); luôn kèm lộ trình nộp hợp quy, không bao giờ đăng trực tiếp', '~60s'],
      full_scan: ['Quét đầy đủ: Khám phá → Giám sát → Báo cáo một cú bấm, chạy tiếp từ điểm dừng', '~4–6 phút'],
    },
    monitorRows: [
      ['Tỷ lệ xuất hiện theo thời gian', 'Mỗi lần quét một điểm; thương hiệu của bạn luôn màu vàng, mỗi đối thủ giữ màu riêng. Ở chế độ xem theo engine chỉ hiển thị đường của bạn cho engine đó (đường đối thủ giữ toàn bộ lần quét). Thương hiệu biến động lớn nhất được ghi dưới biểu đồ.'],
      ['Hiển thị thương hiệu', 'Mỗi hàng = câu trả lời nhắc thương hiệu đó ÷ tổng câu trả lời. Một câu có thể nhắc nhiều thương hiệu nên các hàng không cộng dồn; bảng này trả lời "tôi xuất hiện trong bao nhiêu câu". Kèm số lượt nhắc và cảm xúc khi xuất hiện.'],
      ['Thị phần nhắc tên', 'Lượt nhắc thương hiệu ÷ tổng lượt nhắc mọi thương hiệu theo dõi, tổng 100% — "phần của tôi trong những gì được nhắc lớn bao nhiêu". Chỉ thực thể gắn nhãn đối thủ vào mẫu số.'],
      ['Tỷ lệ theo engine', 'Cùng một thương hiệu trên 5 engine đặt cạnh nhau (mẫu số = câu trả lời của engine đó), vì cùng thương hiệu khác nhau rõ giữa các engine. Bấm tên engine để chuyển cả bảng sang chế độ xem engine đó.'],
      ['Nguồn AI trích dẫn', 'Tên miền × lượt trích × số engine × trang đã đọc. Cột Trang cho biết số trang được trích đã tải (từ chối robots được đánh dấu); rê chuột xem số từ, ngày cập nhật, schema. Xếp hạng là tổng hợp SQL qua các lần quét, không bị giới hạn 1.000 dòng.'],
      ['Hồ sơ trích dẫn', 'Tạo khi một engine có ít nhất 8 trang được trích đã tải: cấu trúc điển hình, độ dài, tần suất cập nhật, loại schema. Agent nội dung và website viết theo đó thay vì đoán.'],
      ['Tỷ lệ theo câu hỏi', 'Lưới câu hỏi × engine: ✓ có nhắc, · không nhắc, trống = lần này không lấy mẫu. Bấm ô để mở câu trả lời AI kèm liên kết; "Hiện tất cả" ở tiêu đề liệt kê toàn bộ thư viện.'],
    ],
    setsRows: [
      ['Ở đâu', '"Đối thủ & câu hỏi" ở đầu workspace, thành viên dự án dùng được. Mọi chỉnh sửa nằm trong cấu hình dự án; tài sản gốc của Khám phá và các lần quét cũ không bao giờ bị sửa, khôi phục được bất cứ lúc nào.'],
      ['Bộ đối thủ', 'Gắn quan hệ cho từng thực thể: đối thủ / đối tác / danh bạ / quan sát / chính mình — chỉ đối thủ vào thị phần, đối sánh và khoảng trống; thực thể quan sát chỉ được vẽ, không vào mẫu số. Nhãn được kế thừa qua các lần làm mới hàng tháng: thực thể đã gắn đối tác không bao giờ bị nhận lại là đối thủ. Có thể đổi tên, xóa, thêm thủ công.'],
      ['Thư viện câu hỏi', 'Bấm câu hỏi để loại trừ / khôi phục (gạch ngang); bấm ✎ để viết lại theo cách hỏi bản địa tự nhiên và ghi lý do — bản viết lại và lý do vào nhật ký chỉnh sửa, thành dữ liệu huấn luyện. Thêm câu hỏi tùy chỉnh từng dòng vào nhóm. Thay đổi áp dụng từ lần quét sau.'],
      ['Bộ Core đóng băng', 'Câu hỏi Core trong hợp đồng được đánh dấu đóng băng: giao diện không cho sửa; sửa cần xác nhận bằng văn bản hai bên và do vận hành thực hiện, để các kỳ so sánh được.'],
      ['Vì sao cần sửa tay', 'AI rút đối thủ từ câu trả lời thật, nhưng "ai là đối thủ" là phán đoán kinh doanh — máy phát hiện, người định tính. Mỗi lần bạn định tính đều được ghi và dùng lại: đó là tài sản bạn tích lũy trong hệ thống.'],
    ],
    languageRows: [
      ['Ba ngôn ngữ, ba việc', 'Ngôn ngữ câu hỏi = người mua thực sự hỏi AI bằng tiếng gì (Việt Nam = tiếng Việt, Hồng Kông = chữ Hán phồn thể + tiếng Quảng nói, Mỹ = tiếng Anh); ngôn ngữ sản phẩm = báo cáo và bản thảo viết cho ai (mặc định theo thị trường, chỉnh theo dự án); ngôn ngữ giao diện = bạn thao tác bằng tiếng gì (中 / EN / VN), chỉ ảnh hưởng nút và tiêu đề.'],
      ['Mặc định', 'Chọn thị trường khi tạo dự án là xác định hai ngôn ngữ đầu; vận hành có thể đổi ngôn ngữ sản phẩm trong cài đặt dự án (ví dụ khách yêu cầu báo cáo tiếng Trung). Thay đổi chỉ ảnh hưởng lần chạy sau; sản phẩm cũ giữ nguyên.'],
      ['Dịch ngay trên trang', 'Sản phẩm giữ ngôn ngữ thị trường; "中文 / EN" ở đầu trang dịch để đọc, tài sản gốc không đổi. Nút chỉ hiện khi ngôn ngữ sản phẩm khác ngôn ngữ đọc.'],
      ['Đầu ra dài', 'Đầu ra tiếng Việt, Thái và các tiếng không phải Anh dài hơn; nền tảng cấp cho mô hình ngân sách đầu ra lớn hơn và thời gian chờ dài hơn theo ngôn ngữ, đầu ra bị cắt không bao giờ được lưu là thành công — sẽ chạy lại.'],
    ],
    aigvrIntro:
      'Mỗi lần giám sát lấy mẫu thư viện câu hỏi và gửi cùng câu hỏi tới 5 AI engine; mô hình giám khảo (temperature 0.1) chấm cấu trúc từng câu trả lời, tổng hợp thành năm chiều (0–100 mỗi chiều) và một điểm tổng. Giao diện gọi là "AI Mindset Index" (khách có hợp đồng ghi AIGVR vẫn thấy AIGVR); thuật toán như nhau. Đầu bảng điểm có sáu chỉ số không chồng lấn: tỷ lệ xuất hiện / thị phần / vị trí khi xuất hiện (đề xuất đầu tiên là bộ lọc câu trọng điểm) / cảm xúc khi xuất hiện / cường độ trích dẫn / số khoảng trống ý định cao.',
    sampleTitle: 'Thiết kế lấy mẫu',
    sampleBody:
      '20 câu trọng điểm được đo mỗi lần; phần còn lại lấy mẫu cân bằng theo giai đoạn đến giới hạn của gói (12 / 20 / 24 mỗi lần); × số engine ≈ 48–120 lượt hỏi thật. Câu hỏi chia theo ý định: ý định cao (ai cung cấp / tốt nhất / giá / so sánh / tên thương hiệu / địa điểm) và giáo dục — ở câu giáo dục AI hiếm khi nêu tên thương hiệu, tỷ lệ thấp là bình thường và các câu này thành chủ đề nội dung. Danh sách khoảng trống chỉ tính câu ý định cao. Để so sánh được, thư viện và danh sách đối thủ được đóng băng và dùng lại, làm mới hàng tháng. Độ tin cậy: ô n≥12 cao · ≥6 trung bình · <6 thấp.',
    dimName: { presence: 'Tỷ lệ xuất hiện', prominence: 'Độ nổi bật', competitiveShare: 'Thị phần nhắc tên', sentiment: 'Cảm xúc', citation: 'Trích dẫn' },
    dimDef: {
      presence: 'Câu trả lời nhắc thương hiệu ÷ tổng câu trả lời hợp lệ.',
      prominence: 'Điểm vị trí trung bình khi được nhắc: 0 không · 1 thoáng qua · 2 một trong nhiều · 3 đầu tiên / nổi bật; chuẩn hóa ÷3×100.',
      competitiveShare: 'Lượt nhắc thương hiệu ÷ (thương hiệu + đối thủ). Đối thủ rút từ câu trả lời thật và chỉ thực thể gắn nhãn đối thủ được tính; bảng điểm nêu rõ đã loại gì và vì sao.',
      sentiment: 'Thái độ trung bình khi được nhắc: tích cực 1 · trung tính 0.5 · tiêu cực 0.',
      citation: 'Tỷ lệ câu trả lời trích dẫn tên miền riêng của thương hiệu (tín hiệu AEO; Perplexity và Google AIO đóng góp nhiều nhất). Tiêu chuẩn v1.1 §3.6 yêu cầu độ phủ trích dẫn ít nhất 4/5 engine mới báo cáo chỉ số này.',
    },
    formulaTitle: 'Công thức điểm tổng',
    judgeTitle: 'Vì sao chấm điểm đáng tin',
    judgeBody:
      'Không đếm từ khóa — giám khảo đọc toàn bộ câu trả lời rồi trả về phán quyết có cấu trúc (có nhắc / vị trí / cảm xúc / danh sách đối thủ) ở temperature 0.1 theo lô; tên đối thủ do bộ trích xuất thứ hai rút ra (temperature 0.2), tránh dương tính giả do "đoán đối thủ". Mỗi câu đã chấm đều mở và kiểm tra được trên bảng; sửa tay của con người không bao giờ bị máy ghi đè.',
    tomBody:
      'Tỷ lệ đề xuất đầu tiên (KPI hợp đồng) = câu trả lời mà thương hiệu là đề xuất đầu tiên / nổi bật (prominence = 3) ÷ tổng lượt hỏi. Bảng điểm cho cả giá trị tổng và tập con 20 câu trọng điểm (keySet là đường riêng, n = 20 × số engine).',
    surfacesBody:
      'Trong năm engine, Google AI Overview là giao diện thật — trang kết quả Google thật, bản địa hóa theo thị trường (Việt Nam = vn/vi): người dùng thấy gì thì đo cái đó. Bốn engine còn lại (ChatGPT / Gemini / Perplexity / Claude) chạy qua API mô hình — cùng mô hình, không phải giao diện người dùng — và được ghi rõ là proxy API trên giao diện. AIO hết giờ ở một câu được ghi "câu này không có AIO" mà không ảnh hưởng engine khác; engine không dùng được kéo dài sẽ được ghi trong báo cáo và tính theo phần còn lại.',
    authorityBody:
      'Mỗi lần quét lưu mọi liên kết mà câu trả lời AI trích dẫn và tổng hợp qua các lần quét "AI thực sự trích dẫn tên miền nào ở thị trường này". Từ 2026-09 nền tảng còn tải chính các trang được trích (tôn trọng robots.txt, giới hạn theo tên miền), ghi cấu trúc, số từ, ngày cập nhật và loại schema, xây hồ sơ trích dẫn cho từng engine; các trang công khai của chính khách hàng cũng vào kho ngữ liệu, nên báo cáo nêu được độ phủ website (câu hỏi nào website còn trống) và "câu trả lời AI mâu thuẫn với website". Phân phối chọn mục tiêu thẳng từ xếp hạng — xây trên tên miền AI đã tin, không đăng mù — loại tên miền đối thủ và nhà cung cấp. Danh sách nguồn Việt Nam công bố hàng tháng (/sources/vietnam, CC BY 4.0).',
    trendBody:
      'Lần giám sát đầu tiên của dự án là đường cơ sở Ngày 0; đường xu hướng ở cột phải cho thấy AIGVR / hiển thị / khoảng trống theo từng lần quét. Bên dưới là "Xu hướng tháng · so tháng trước": lấy lần quét cuối mỗi tháng làm ảnh chụp tháng, tự tạo khi qua tháng mới. Quét định kỳ chạy theo nhịp gói (Starter hàng tháng, Growth hai tuần một lần, Scale hàng tuần; ngày quét theo nhịp quản lý của khách) và không bao giờ trừ credit. Lưu ý: thay đổi tổ hợp engine hoặc định nghĩa đối thủ làm mất so sánh nghiêm ngặt — đọc xu hướng trong khoảng cùng định nghĩa; chỗ đổi định nghĩa được chú thích.',
    actionsRows: [
      ['Ghi một hành động', '"Ghi một hành động" ở cột phải, hoặc "Đánh dấu đã đăng" trên sản phẩm: URL, loại (cập nhật website / bài viết / danh bạ / bách khoa …), ngày đăng và câu hỏi nhắm tới. Ngày đăng không được ở tương lai.'],
      ['Tự xác minh', 'Nền tảng sau đó tải URL: có truy cập được không, tiêu đề, số từ, băm nội dung; tải lại hàng tuần và ghi "thời điểm thay đổi" khi nội dung đổi. Mục hiển thị "✓ đang hoạt động · N từ" hoặc "✗ không truy cập được".'],
      ['Quy kết', 'Sau mỗi lần quét mới, hệ thống so sánh tỷ lệ xuất hiện ở câu hỏi nhắm tới trước vs sau ngày đăng (theo engine) và thay đổi lượt trích dẫn của tên miền đó; ghi vào phần "Hành động và điều đã thay đổi" của bản tin.'],
      ['Vì sao quan trọng', 'Đây là nơi việc thực thi của bạn thành tài sản hệ thống: loại hành động nào hiệu quả trên engine nào chỉ được dùng lại cho kế hoạch sau nếu đã ghi. Qua ba tháng, nhật ký này là dữ liệu giá trị nhất của dự án.'],
    ],
    resultsRows: [
      ['Sandbox (Nội dung / Website / Phân phối / Bách khoa)', 'Mỗi sản phẩm sáng tạo là bản sao làm việc chỉnh sửa được: sửa trực tiếp, dùng lệnh nhanh hoặc một câu để AI chỉnh, quay lại theo ngăn phiên bản, sao chép dùng ngay. Chỉnh sửa dựa trên bản hiện tại, không làm lại từ đầu.'],
      ['Chỉnh sửa của người thắng', 'Mọi chỉnh sửa bạn làm trên sản phẩm (nhãn, viết lại, xóa) được giữ ở lớp chỉnh sửa và áp lại lên kết quả mới khi chạy lại — máy không bao giờ ghi đè phán đoán của người.'],
      ['Hỏi cố vấn (Giám sát / Báo cáo / Quét đầy đủ)', 'Hỏi ngay dưới kết quả ("khoảng trống nào trước?"); câu trả lời bám dữ liệu hiện tại và mở đường một cú bấm tới agent tiếp theo.'],
      ['Ngôn ngữ đọc', 'Sản phẩm giữ ngôn ngữ thị trường; "中文 / EN" dịch ngay trên trang để đọc, bản gốc không đổi.'],
      ['Chạy lại', 'Nút "Chạy lại" ở đầu sân khấu; chạy lại giám sát = điểm xu hướng mới; kích hoạt thủ công tính credit (quét đầy đủ / giám sát 25, còn lại 10), hoàn lại nếu lỗi.'],
      ['Xuất PDF', '"Xuất PDF" ở đầu sân khấu (hoặc ⌘P): tài liệu nền trắng có đầu trang thương hiệu, tự mở mọi nội dung gập, ẩn phần giao diện.'],
    ],
    complianceRows: [
      ['Số liệu chỉ từ dữ kiện thương hiệu', 'Nội dung, Phân phối và Website chỉ được dùng số liệu trong hồ sơ thương hiệu và tài liệu bạn tải lên; số không có nguồn được thay bằng chỗ trống để bạn điền. Đây là lằn ranh cứng chống dữ liệu bịa.'],
      ['Đối thủ không bao giờ là mục tiêu', 'Mục tiêu phân phối tự loại tên miền trong bộ đối thủ, website nhà cung cấp của đối thủ và tên miền bạn đánh dấu loại trừ trong dự án.'],
      ['Chỉ dữ kiện, không trải nghiệm', 'Mọi agent chỉ được tạo thông tin kiểm chứng được; giọng trải nghiệm ngôi thứ nhất (phát hiện trên 中 / EN / VN / TH / ID / MS / FIL) bị coi là lời chứng giả và loại bỏ — trải nghiệm chỉ đến từ khách hàng thật.'],
      ['Cách nói bản địa, không dịch cứng', 'Đầu ra tiếng Việt và các tiếng khác được quét từ ngữ dịch cứng Hán-Việt và viết lại theo cách thị trường thực sự nói; các bản viết lại ✎ và lý do trong thư viện câu hỏi nuôi quy tắc này.'],
      ['Kênh cộng đồng = bản tóm tắt tương tác', 'Diễn đàn và nhóm (Reddit / Quora / nhóm Facebook và diễn đàn địa phương) không bao giờ có bài viết hộ; đầu ra là bản tóm tắt: cộng đồng nào, mọi người hỏi gì, dữ kiện đã kiểm chứng nào ta có thể đưa; tham gia phải bằng tài khoản chính thức có công khai danh tính.'],
      ['Gắn cờ tuyên bố chưa kiểm chứng', '"Dẫn đầu ngành", "hàng triệu người dùng" và các tuyên bố không nguồn được quét xác định và gắn ⚠, phải thay bằng dữ kiện hồ sơ hoặc xóa trước khi gửi.'],
      ['Nộp bách khoa hợp quy', 'Nội dung kiểu wiki chỉ do agent Bách khoa tạo và luôn kèm: công khai quan hệ trả phí → duyệt bản thảo hoặc yêu cầu biên tập → biên tập viên độc lập duyệt. Không bao giờ đăng trực tiếp.'],
      ['Đánh giá thật', 'Không bao giờ viết đánh giá khách hàng. Báo cáo chỉ khuyến nghị "mời đánh giá thật": gửi liên kết mời cho khách hàng của chính khách hàng, đánh giá do khách thật viết.'],
    ],
    channelRows: [
      ['Ba cấp', 'MemeCMO (trụ sở) → đối tác kênh → khách hàng cuối; dữ liệu cách ly theo hàng (Postgres RLS), không thấy nhau.'],
      ['Mở khách hàng', 'Admin đối tác bấm "+ New client" trên bảng điều khiển → hàng đợi duyệt của trụ sở → tổ chức khách được kích hoạt kèm đăng ký.'],
      ['Mời thành viên', '"Mời" ở hàng tiêu đề tổ chức → email và vai trò → tự gửi email (hoặc sao chép liên kết); họ tham gia bằng cách đăng nhập với email đó. admin: tổ chức, lời mời, thanh toán; editor: chạy agent, ghi hành động, sửa sản phẩm; viewer: chỉ đọc, xuất PDF, hỏi về kết quả. Tài khoản miễn phí và không giới hạn.'],
      ['Hạn mức quét', 'Số lần quét tính phí mỗi tháng (quét đầy đủ / giám sát): Starter 4 · Growth 12 · Scale 30, gồm quét định kỳ; trụ sở và đối tác không tính. Vượt hạn mức trả về thông báo rõ và đặt lại kỳ sau.'],
      ['Email bản tin tự động', 'Khi đã cấu hình người nhận, gửi vào ngày bản tin của dự án (mặc định thứ Ba): khối số liệu gọn (chỉ số / theo engine / sản phẩm kỳ này) + quy kết và chiến lược + "Hành động và điều đã thay đổi"; cách đọc đổi theo giai đoạn dự án (giai đoạn xây dựng không diễn giải dao động điểm). Dữ liệu đầy đủ luôn ở PDF trong workspace. Sụt ≥5 điểm hoặc một engine về 0 sẽ cảnh báo ngay, không chờ lịch.'],
    ],
    plansRows: [
      ['Ba gói', 'Starter US$99 · Growth US$199 · Scale US$1,999+, đăng ký hàng tháng theo thương hiệu × thị trường. Gói quyết định nhịp quét định kỳ, giới hạn thư viện, số engine, số dự án, tần suất báo cáo và credit kèm theo; hạng mục dịch vụ và quy tắc tính phí đầy đủ ở /pricing.'],
      ['Đăng ký mua gì', 'Không phải "một số lần quét" mà là toàn bộ dịch vụ bàn giao: quét định kỳ so sánh được trên bộ câu hỏi cố định, báo cáo và cảnh báo tự động, agent nội dung, bảng và tài khoản. Starter / Growth tự phục vụ; chỉ Scale có họp tư vấn.'],
      ['Credit mua gì', 'Quyền chạy ngay. Quét định kỳ không bao giờ trừ credit; chỉ lần bạn tự bấm chạy mới tính (quét đầy đủ / giám sát 25, còn lại 10). Growth / Scale nhận 50 / 150 mỗi tháng; gói 250 / 1.150 / 3.900 credit giá US$250 / 1.000 / 3.000.'],
      ['Hai quỹ', 'Quỹ tặng (credit trong gói, khuyến mãi) trừ trước và không xuất hóa đơn; quỹ mua có hóa đơn. Lần chạy lỗi hoàn tự động. Lần chạy do vận hành làm cho bạn không trừ credit.'],
      ['Đăng ký', 'Tự đăng ký có một lần quét xem trước miễn phí (2 engine × 8 câu), sau đó đăng ký gói; hoặc tham gia qua lời mời của đối tác / tổ chức. Mỗi lần quét là chi phí engine thật nên không có quét miễn phí không giới hạn.'],
      ['Nợ phí và rời đi', 'Khi đăng ký ở trạng thái past_due / canceled: quét tạm dừng nhưng bảng, toàn bộ lịch sử và xuất PDF vẫn giữ — dữ liệu là của khách, xuất được trong 12 tháng sau khi chấm dứt. Khôi phục đăng ký là khôi phục quét.'],
    ],
    faqRows: [
      ['Lần chạy bị lỗi', 'Sân khấu hiển thị nguyên nhân; bấm "Chạy lại" — tầng thực thi chạy tiếp từ điểm dừng, giai đoạn đã xong không tính phí lại, credit của lần lỗi được hoàn tự động.'],
      ['Giám sát lâu không nhúc nhích', 'Thời gian bình thường 2–4 phút; các engine chạy song song, một engine chậm không chặn phần còn lại. Tác vụ chạy trên máy chủ, bạn có thể rời trang. Nếu đứng lâu ở cùng bước, chạy lại một lần.'],
      ['Một engine hiện 0 mẫu', 'Thường là mọi lượt hỏi trên engine đó hết giờ lần này (ví dụ AIO dao động); engine khác không ảnh hưởng, quét lại thường khôi phục. Không dùng được kéo dài sẽ được ghi trong báo cáo.'],
      ['"Đã hết hạn mức"', 'Số lần quét tính phí tháng này (quét đầy đủ / giám sát) chạm giới hạn gói; nâng gói hoặc chờ đặt lại kỳ. Agent khác không bị giới hạn.'],
      ['"Không đủ credit"', 'Chạy thủ công cần credit; quét và báo cáo định kỳ vẫn tiếp tục theo hợp đồng. Mua gói ở "Gói & thanh toán" trên bảng điều khiển, hoặc chờ credit tháng sau.'],
      ['Sai ngôn ngữ sản phẩm', 'Sản phẩm theo thị trường của dự án (chọn khi tạo), không phải ngôn ngữ giao diện; dùng nút ngôn ngữ đọc ở đầu trang để đọc tiếng Trung; muốn đổi ngôn ngữ sản phẩm hãy nhờ vận hành đổi cài đặt dự án.'],
      ['Báo cáo nói "mâu thuẫn với website" nhưng chúng tôi đúng', 'Mâu thuẫn chỉ được xét với trang đã công khai trên website; cập nhật website trước, rồi ghi một hành động, lần quét sau sẽ so lại.'],
      ['Liên kết mời không mở được', 'Lời mời gắn với email được mời và có hiệu lực 14 ngày; đảm bảo họ đăng nhập bằng email đó, hết hạn thì gửi lại.'],
    ],
  },
};

const AGENT_LABEL: Record<string, string> = {
  profile: 'Profile 品牌画像', discovery: 'Discovery 发现', answers: 'Answers 标准答案',
  monitor: 'Monitor 监测', report: 'Report 报告', optimize: 'Optimize 内容',
  site: 'Site 主页', distribute: 'Distribute 分发', encyclopedia: 'Encyclopedia 百科', full_scan: 'Full Scan 完整扫描',
};

function Shot({ src, caption }: { src: string; caption: string }) {
  return (
    <figure className="mc-card overflow-hidden">
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
        <div key={h} className="mc-card-soft p-4">
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
              className={`text-[11px] px-2 py-1 rounded transition ${lang === l ? 'mc-pill-active' : 'mc-btn-soft text-dim hover:text-ink'}`}>
              {l === 'zh' ? '中文' : l === 'en' ? 'EN' : 'VN'}
            </button>
          ))}
          <Link href="/dashboard" className="text-[11px] px-2.5 py-1 rounded mc-btn-soft text-dim hover:text-ink transition ml-2">
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
          <a href={STANDARD_PDF} target="_blank" rel="noreferrer"
            className="block mc-card mc-card-accent px-4 py-3 hover:brightness-[1.02] transition group">
            <span className="text-sm font-semibold text-brand">{t.standardTitle} →</span>
            <span className="block text-[12px] text-dim mt-0.5">{t.standardDesc}</span>
          </a>
          <Link href={`/guide/partner/${lang === 'zh' ? 'zh' : lang}`}
            className="block mc-card-soft px-4 py-3 transition group">
            <span className="text-sm font-semibold text-ink group-hover:text-brand">{t.partnerCtaTitle} →</span>
            <span className="block text-[12px] text-dim mt-0.5">{t.partnerCtaDesc}</span>
          </Link>
          {/* TOC */}
          <nav className="flex flex-wrap gap-2 pt-2">
            {Object.entries(t.sections).map(([id, label]) => (
              <a key={id} href={`#${id}`} className="text-[11px] px-2 py-1 rounded-full mc-btn-soft text-dim hover:text-brand transition">
                {label as string}
              </a>
            ))}
          </nav>
        </div>

        <Section id="quickstart" title={t.sections.quickstart}><Rows rows={t.quickstart} /><Shot src="/guide/dashboard.png" caption={t.shotDashboard} /></Section>
        <Section id="layout" title={t.sections.layout}><Shot src="/guide/workspace.png" caption={t.shotWorkspace} /><Rows rows={t.layout} /></Section>

        <Section id="agents" title={t.sections.agents}>
          <div className="overflow-x-auto mc-card">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left">
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
        </Section>

        <Section id="monitor" title={t.sections.monitor}>
          <Shot src="/guide/monitor.png" caption={t.shotMonitor} />
          <Rows rows={t.monitorRows.slice(0, 4)} />
          <Shot src="/guide/sources.png" caption={t.shotSources} />
          <Rows rows={t.monitorRows.slice(4, 6)} />
          <Shot src="/guide/prompts.png" caption={t.shotPrompts} />
          <Rows rows={t.monitorRows.slice(6)} />
        </Section>

        <Section id="sets" title={t.sections.sets}><Shot src="/guide/sets.png" caption={t.shotSets} /><Rows rows={t.setsRows} /></Section>
        <Section id="language" title={t.sections.language}><Rows rows={t.languageRows} /></Section>

        <Section id="aigvr" title={t.sections.aigvr}>
          <p className="text-[13px] text-dim leading-relaxed">{t.aigvrIntro}</p>
          <div className="mc-card-soft p-4">
            <div className="text-sm font-medium text-ink mb-1">{t.sampleTitle}</div>
            <p className="text-[13px] text-dim leading-relaxed">{t.sampleBody}</p>
          </div>
          <div className="space-y-2.5">
            {WEIGHTS.map(({ key, pct }) => (
              <div key={key} className="mc-card-soft p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-ink">{t.dimName[key]}</span>
                  <span className="text-xs font-semibold text-brand tabular-nums">{pct}%</span>
                </div>
                <div className="h-1.5 mc-track mb-2">
                  <div className="h-full rounded-full bg-brand/70" style={{ width: `${pct * 2.5}%` }} />
                </div>
                <p className="text-[12px] text-dim leading-relaxed">{t.dimDef[key]}</p>
              </div>
            ))}
          </div>
          <div className="mc-card mc-card-accent p-4">
            <div className="text-sm font-medium text-ink mb-1.5">{t.formulaTitle}</div>
            <code className="text-[12px] text-ink block leading-relaxed">
              AIGVR = 0.30·Presence + 0.25·Prominence + 0.20·CompetitiveShare + 0.15·Sentiment + 0.10·Citation
            </code>
          </div>
          <div className="mc-card-soft p-4">
            <div className="text-sm font-medium text-ink mb-1">{t.judgeTitle}</div>
            <p className="text-[13px] text-dim leading-relaxed">{t.judgeBody}</p>
          </div>
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
        <Section id="actions" title={t.sections.actions}><Rows rows={t.actionsRows} /></Section>

        <Section id="results" title={t.sections.results}>
          <Shot src="/guide/report.png" caption={t.shotReport} />
          <Shot src="/guide/sandbox.png" caption={t.shotSandbox} />
          <Rows rows={t.resultsRows} />
        </Section>
        <Section id="compliance" title={t.sections.compliance}><Rows rows={t.complianceRows} /></Section>
        <Section id="channel" title={t.sections.channel}><Rows rows={t.channelRows} /></Section>
        <Section id="plans" title={t.sections.plans}>
          <Rows rows={t.plansRows} />
          <Link href="/pricing" className="inline-block text-[12px] text-brand underline underline-offset-2">/pricing →</Link>
        </Section>
        <Section id="faq" title={t.sections.faq}><Rows rows={t.faqRows} /></Section>

        <footer className="pt-4 border-t border-edge text-[11px] text-faint">
          MemeCMO · GEO — engines: ChatGPT · Gemini · Perplexity · Claude · Google AI Overview (real surface) · Measurement Standard v1.1
        </footer>
      </main>
    </div>
  );
}
