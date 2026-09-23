// Partner Delivery Playbook — five-language structured content.
// Path-based language routes (/guide/partner/[lang]); codes P1/P2/WP1–WP5 are
// shared across all editions so cross-country teams reference the same things.
// Document twin: 《MemeCMO_GEO服务方法论_渠道伙伴交付手册_v1.1》(ZH master).

export const LANGS = ['zh', 'en', 'vi', 'th', 'ar'] as const;
export type PlaybookLang = (typeof LANGS)[number];

export const LANG_NAMES: Record<PlaybookLang, string> = {
  zh: '中文', en: 'English', vi: 'Tiếng Việt', th: 'ไทย', ar: 'العربية',
};

export interface PTable { cols: string[]; rows: string[][] }

export interface PlaybookContent {
  rtl?: boolean;
  htmlLang: string;
  docType: string;
  title: string;
  subtitle: string;
  oneLiner: string;
  figCaps: [string, string, string, string];
  s0: { h: string; t: PTable };
  s1: { h: string; t: PTable; promise: string };
  s2: { h: string; intro: string; t: PTable; key: string };
  s3: { h: string; para: string; cols: string[]; note: string };
  s4: { h: string; t: PTable };
  s5: { h: string; t: PTable; success: string };
  s6: { h: string; t: PTable };
  s7: { h: string; items: string[] };
  foot: string;
}

export const PLAYBOOK: Record<PlaybookLang, PlaybookContent> = {
  zh: {
    htmlLang: 'zh-CN',
    docType: 'Partner Playbook · 渠道交付手册 v1.1',
    title: 'MemeCMO GEO 服务方法论 · 渠道伙伴交付手册',
    subtitle: '两阶段闭环:P1 测评 ⇄ P2 实操修改 · 任何渠道商为任何品牌客户复制同一套商业流程',
    oneLiner: 'GEO 服务 = 一个循环跑到底:P1 用 memecmo.ai 量出品牌在 AI 答案中的位置与偏差(定期报告),P2 按标准工作包修改现实世界的语料源,下一次 P1 扫描验证效果。测评告诉你差在哪,修改把差补上,再测评证明补上了——循环本身就是服务,也就是续费理由。方法层对所有客户相同;内容层每个品牌重做——这个分层就是商业模式。',
    figCaps: [
      '图 1 · 方法论主循环:P1 测评 ⇄ P2 修改——循环即服务,也即续费理由',
      '图 2 · P1 测评流水线(W0–W2):事实签认与口径冻结是两道硬门槛',
      '图 3 · P2 五管道 → 同一套权威语料 → AI 引擎(检索型 2–6 周先动,模型训练以月计)',
      '图 4 · 90 天标准路线:三次月度复盘逐行开奖,W12 = 90 天验收',
    ],
    s0: {
      h: '〇、四条底层原则(先于一切流程)',
      t: {
        cols: ['原则', '含义', '流程中的体现'],
        rows: [
          ['① 尺子先焊死,再读数', '题库、竞品名单、判分基准、扫描节奏必须先锁定,涨跌才可信、才可验收', 'P1-4 口径冻结是 P1 的验收门槛;锁定前的数字一律标"校准期"'],
          ['② 事实先治理,再生产', '品牌事实(名称/规模/NAP/定位语/禁用项)必须有唯一权威版本 + 分级(公开/内控/禁发)', 'P1-3 品牌事实档案是客户唯一必须深度参与的环节;无签认版不进 P2'],
          ['③ AI 用捡到的东西填真空', 'AI 不针对谁;权威语料缺位处,它就用错误热线、竞品口径、幻觉价格填空。谁供给语料,谁拥有答案', 'P2 全部五个工作包都是"往真空里放权威语料"的不同管道'],
          ['④ 显效有物理周期,不许超卖', '检索型引擎 2–6 周显效;参数型(模型训练)以月计;单次波动 ±3 属噪音', '报告全部标注噪音带与证据等级;归因只认"超噪音+同口径+连续"'],
        ],
      },
    },
    s1: {
      h: '一、P1 测评阶段:让客户知道自己在 AI 答案里的位置',
      t: {
        cols: ['步骤', '动作', '标准做法', '产出物(模板现成)', '执行方', '时点'],
        rows: [
          ['P1-1', 'Day-0 基线扫描', '销售现场即可发起:建项目→全局扫描,分钟级出首份评分卡。这是最强获客动作——客户第一次看到"AI 怎么说我"', 'Day-0 评分卡 + PDF 启动报告', '渠道商销售(平台自助)', '提案现场'],
          ['P1-2', '开户建项', '渠道商组织下建客户子组织;角色分层:渠道商=editor(可跑扫描)、客户=viewer(只读看板);信用点按包配置', '账号台账 + 角色矩阵', '渠道商运营', '签约周'],
          ['P1-3', '品牌事实档案(客户唯一重参与环节)', '向客户收集并签认:官方名称(全语言)/定位语/规模量词(唯一化)/NAP/差异化事实/禁发项(价格数字、内部指标);按 PUBLIC-READY / INTERNAL-CONTROLLED / HOLD 三级标注,录入 brand_profile 作系统判分与生成的唯一基准', '品牌统一口径表 + Fact Sheet(客户签认)', '渠道商客户经理 + 客户', '第 1 周'],
          ['P1-4', '口径冻结', '核心题库(Core 20)按买家真实提问语言定稿并永久锁定;竞品名单人工核定并 locked(防自动轮换);判分基准=签认版事实;扫描节奏对齐客户例会(如周五扫/周六报,服务周一会)', '口径冻结确认单(Scan Manifest 首期)', 'MemeCMO + 渠道商', '第 1–2 周'],
          ['P1-5', '定期报告节奏上线', '三层交付:周报(自动,含引用源明细/新增来源/竞品动态)→ 月度复盘(叙事+归因表)→ 季度/里程碑解读会。首刊安排 30 分钟评分卡讲解会', '周报(自动)+ 月报模板 + 解读会纲要', '系统自动 + 渠道商', '第 2 周起'],
        ],
      },
      promise: 'P1 的交付承诺:基线分数与三语位置、偏差清单(哪些问题 AI 答错/漏掉/推荐了别人)、内容影响建议,以及从此每周更新的位置追踪。P1 单独可售(诊断+监测订阅),也是 P2 的销售漏斗:偏差清单里的每一条,都是 P2 的报价项。',
    },
    s2: {
      h: '二、P2 实操修改层:五个标准工作包(WP)',
      intro: 'P2 的本质:把 P1 发现的语料真空,用五条管道逐一填上。每个 WP 都有现成模板,新客户只换参数。',
      t: {
        cols: ['工作包', '内容', '标准动作', '模板资产(已验证)', '执行方', '显效周期'],
        rows: [
          ['WP1 官网 GEO 改造', '技术基线 + 内容池', '技术八项:SSR 真文本 / robots 放行 / Schema 三件套(Organization·Service·FAQPage)/ hreflang / 301 保引用 / NAP 一致 / 无访问墙 / 性能。内容池:FAQ、价格逻辑页(零金额+CTA)、事实页、buyer’s guide', '《新官网 GEO 技术需求清单》+《爬虫放行与验收单》+ Schema 包', '客户站点方执行,MemeCMO 审计放行', '2–6 周'],
          ['WP2 爬虫与索引开关', 'AI 收录的四个开关', 'robots.txt 放行 8 个 UA(GPTBot/OAI-SearchBot/ClaudeBot/PerplexityBot/Google-Extended/Googlebot/Bingbot/CCBot)→ GSC 验证+提交 sitemap → Bing Webmaster 一键导入 + IndexNow → 商家档案', '《48 小时冲刺操作单》§D2', '渠道商助理照单执行', '1–4 周'],
          ['WP3 外部权威数据源', '知识图谱与第三方背书', 'Wikidata 条目(10 字段挂来源)→ Wikipedia(合规代编不代发,COI 披露)→ 行业目录/协会 → 一切外源 NAP 与官网逐字一致', '《Wikipedia/Wikidata 发布操作包》+ 条目草稿模板', '渠道商/客户发布,MemeCMO 备稿', '2–8 周'],
          ['WP4 平台动态内容', '社媒统一 + 媒体供给', '素材卡机制(名称/Tagline/Bio/NAP 唯一文案源,只粘贴不改写)统一 FB/LinkedIn/YouTube;媒体发文按频密度基线:每月 2–4 篇深度(答问式标题,直答买家题库),节奏稳定优于爆发', '《48 小时冲刺操作单》§D1 + 素材卡 A–D + 频密度表', '渠道商内容团队', '2–6 周'],
          ['WP5 语料纠偏', '打掉 AI 正在说的错话', '从 P1 准确率判词提取三类靶点:错误事实(错热线/旧地址)、竞品失实对比、幻觉信息(编造价格)→ 逐条产出纠偏内容(官网权威页+媒体佐证),下期扫描验证消除', '偏差清单 → 纠偏内容映射表', 'MemeCMO 起草,客户审,渠道商发布', '2–6 周/条'],
        ],
      },
      key: '关键句:P2 五包没有一项是"玄学优化"——每一项都是往一个具体管道里放权威语料,且都能在 P1 的下一次扫描里指名道姓地验证。任一方面的修改都会切实影响各引擎:检索型先动(引用/出现率),参数型后动(训练语料以月计)——这也是持续订阅的物理依据。',
    },
    s3: {
      h: '三、闭环:P2 的每个动作,预登记到 P1 的验证指标',
      para: '每启动一个 WP,同时在归因表登记一行——先写"预期动哪个指标",再等扫描开奖。这是渠道商向客户证明价值的标准语言(源自 FMVN 实战,已被客户方法论审计三轮验收)。',
      cols: ['措施(WP)', '针对问题', '前值', '后值', '达标?', '可复制?'],
      note: '六列固定;"达标?"只认超噪音带(±3)+ 同口径 + 可溯源(扫描编号);允许出现"未达成"行——诚实是这张表可信度的锚。预期映射:WP1/WP2 → 引用强度、出现率;WP3 → 新增来源栏、知识图谱类准确率;WP4 → 声量占比、情感;WP5 → 准确率、首位推荐率。',
    },
    s4: {
      h: '四、角色分工(RACI 摘要)',
      t: {
        cols: ['环节', 'MemeCMO', '渠道商', '品牌客户', '第三方(站点等)'],
        rows: [
          ['平台/扫描/报告/判分', 'R+A', 'I', 'I(只读看板)', '—'],
          ['客户关系/售卖/执行协调', 'C(方案支持)', 'R+A', 'I', '—'],
          ['品牌事实签认/禁发项', 'C(模板与审计)', 'R(收集)', 'A(签认)', '—'],
          ['WP1 站改执行', 'C(需求清单+验收审计)', 'R(协调)', 'A', 'R(施工)'],
          ['WP2–WP4 执行', 'C(操作单+核验)', 'R', 'A(授权/审批)', '视情'],
          ['WP5 纠偏内容', 'R(起草)', 'R(发布)', 'A(审)', '—'],
        ],
      },
    },
    s5: {
      h: '五、90 天标准时间表',
      t: {
        cols: ['周', '里程碑', '验收'],
        rows: [
          ['W0', '提案现场 Day-0 扫描(P1-1)', '首份评分卡当场展示'],
          ['W1–W2', '开户、事实档案签认、口径冻结、周报上线(P1-2~5);WP2 爬虫开关 48 小时冲刺', '口径冻结确认单;首期周报送达'],
          ['W2–W6', 'WP1 站改施工 + WP3 外源建设 + WP4 平台统一与内容供给启动', '站改验收单通过;Wikidata 上线;素材卡三平台一致'],
          ['W4 / W8 / W12', '三次月度复盘:归因表逐行开奖;WP5 纠偏滚动', 'W12 复盘 = 90 天验收报告(对比 Day-0,只认超噪音改善)'],
        ],
      },
      success: '90 天成功判据(渠道商内部):复现"引用先行、出现率跟随"的曲线形态,即方法论在新客户身上成立;此后转入常态订阅循环。(参考实测:首个完整周期 AIGVR 61→65、引用 +82%、出现率 +7pt,全部超噪音带。)',
    },
    s6: {
      h: '六、可复制资产清单(模板库,新客户只换参数)',
      t: {
        cols: ['模板', '用途', '对应环节'],
        rows: [
          ['品牌统一口径表 + Fact Sheet 签认模板', '事实治理与判分基准', 'P1-3'],
          ['口径冻结确认单(Scan Manifest)', '测量可信度的合同化', 'P1-4'],
          ['周报(系统自动)/ 月度复盘模板 / 解读会纲要', '三层定期报告', 'P1-5'],
          ['新官网 GEO 技术需求清单 + 爬虫放行与验收单', '站改施工与放行审计', 'WP1/WP2'],
          ['48 小时冲刺操作单(素材卡 A–D 机制)', '全网统一与索引开关', 'WP2/WP4'],
          ['Wikipedia/Wikidata 发布操作包', '知识图谱建设(合规代编不代发)', 'WP3'],
          ['渠道运营指引(频率/密度基线)', '内容供给节奏', 'WP4'],
          ['归因表(六列)+ 偏差→纠偏映射表', '价值证明与纠偏管理', '§三/WP5'],
          ['迁移保护包(301/被引 URL 清单)', '客户换站/换供应商时保住已有 AI 资产', 'WP1 变体'],
        ],
      },
    },
    s7: {
      h: '七、新客户启动检查单(渠道商销售随身页)',
      items: [
        'Day-0 扫描已跑,评分卡已给客户看过',
        '商务包已定(P1 订阅 / P1+P2 全包),信用点已配置',
        '客户指定了事实签认人(有权拍板名称/规模/禁发项的人)',
        '品牌事实档案已签认,禁发项(价格等)已列明',
        'Core 题库语言 = 买家真实提问语言(不一定是客户内部语言)',
        '竞品名单客户确认并锁定(区分 competitor / partner / self)',
        '扫描/报告节奏对齐客户管理例会',
        '客户站点方(agency)联系人已接入,收到技术需求清单',
        '渠道商执行助理收到 48 小时冲刺操作单(本地语言版)',
        '归因表建档,P2 每个动作先登记预期指标再执行',
      ],
    },
    foot: 'MemeCMO Tech Limited · v1.1 · 编号 P1/P2/WP1–WP5 五语版共用 · 方法论实证来源:首个完整交付周期(2026-07/08),20 次扫描全程可溯',
  },

  en: {
    htmlLang: 'en',
    docType: 'Partner Playbook v1.1',
    title: 'MemeCMO GEO Service Methodology · Channel Partner Delivery Playbook',
    subtitle: 'Two-phase closed loop: P1 Assessment ⇄ P2 Implementation · One replicable business process for any channel partner serving any brand client',
    oneLiner: 'GEO service = one loop, run continuously: P1 measures where the brand stands in AI answers and what deviates (with periodic reports); P2 modifies the real-world corpus sources through five standard work packages; the next P1 scan verifies the effect. Assessment shows where the gap is, implementation closes it, re-assessment proves it — the loop itself is the service, and the renewal rationale. The method layer is identical for every client; the content layer is rebuilt per brand — that split is the business model.',
    figCaps: [
      'Fig. 1 · The master loop: P1 Assess ⇄ P2 Modify — the loop is the service, and the reason to renew',
      'Fig. 2 · The P1 pipeline (W0–W2): fact sign-off and panel freeze are the two hard gates',
      'Fig. 3 · Five pipes → one authoritative corpus → the AI engines (retrieval moves first in 2–6 weeks; model training follows in months)',
      'Fig. 4 · The 90-day route: three monthly reviews settle the attribution table row by row; W12 = 90-day acceptance',
    ],
    s0: {
      h: '0. Four Ground Principles (before any process)',
      t: {
        cols: ['Principle', 'Meaning', 'Where it shows up'],
        rows: [
          ['① Weld the ruler shut before reading it', 'Prompt panel, competitor set, judging baseline and scan cadence must be locked first — only then are movements credible and fit for acceptance', "P1-4 freeze is P1's gate; any pre-lock number is labeled “calibration period”"],
          ['② Govern facts before producing content', 'Brand facts (names / scale / NAP / tagline / forbidden items) need one authoritative version, classified PUBLIC-READY / INTERNAL-CONTROLLED / HOLD', "P1-3 fact sheet is the client's only deep-involvement step; no signed sheet, no P2"],
          ['③ AI fills vacuum with whatever it finds', 'AI targets no one. Where authoritative corpus is missing, it fills the gap with wrong hotlines, rivals’ inflated claims, hallucinated prices. Whoever supplies the corpus owns the answer', 'All five P2 work packages are different pipes feeding the same vacuum'],
          ['④ Effects have physical lead times — never oversell', 'Retrieval engines respond in 2–6 weeks; parametric engines (model training) in months; single-scan swings within ±3 are noise', 'Every report carries noise bands and evidence tags; attribution accepts only “beyond noise + same baseline + consecutive”'],
        ],
      },
    },
    s1: {
      h: 'Phase P1 — Assessment: show the client where they stand in AI answers',
      t: {
        cols: ['Step', 'Action', 'Standard practice', 'Deliverable (template exists)', 'Owner', 'When'],
        rows: [
          ['P1-1', 'Day-0 baseline scan', 'Launched in the sales meeting itself: create project → full scan → first scorecard in minutes. The strongest acquisition move — the client sees “what AI says about me” for the first time', 'Day-0 scorecard + PDF kick-off report', 'Partner sales (self-serve)', 'Pitch meeting'],
          ['P1-2', 'Accounts & roles', 'Client sub-organization under the partner org; partner = editor (can run scans), client = read-only viewer; credits configured per package', 'Account ledger + role matrix', 'Partner ops', 'Contract week'],
          ['P1-3', 'Brand fact sheet (the client’s only deep-involvement step)', 'Collect and get signed: official names (all languages) / tagline / the one canonical scale term / NAP / differentiating facts / forbidden items (price figures, internal metrics); classify PUBLIC-READY / INTERNAL-CONTROLLED / HOLD; load into brand_profile as the single grounding for judging and generation', 'Brand alignment table + signed Fact Sheet', 'Partner account manager + client', 'Week 1'],
          ['P1-4', 'Freeze the measurement', 'Core prompt set (20) finalized in the buyers’ real query language and permanently locked; competitor set manually curated and locked (no auto-rotation); judging baseline = the signed facts; scan cadence aligned to the client’s management meeting', 'Freeze confirmation sheet (first Scan Manifest)', 'MemeCMO + partner', 'Weeks 1–2'],
          ['P1-5', 'Reporting cadence live', 'Three delivery layers: weekly report (automatic) → monthly review (narrative + attribution table) → quarterly / milestone walkthroughs. First issue comes with a 30-minute scorecard walkthrough', 'Weekly (auto) + monthly template + walkthrough agenda', 'System + partner', 'Week 2 on'],
        ],
      },
      promise: 'What P1 promises the client: baseline score and cross-language position, a deviation list (which questions AI answers wrongly / misses / hands to competitors), content-influence recommendations, and weekly position tracking from then on. P1 sells on its own (diagnosis + monitoring subscription) — and it is P2’s sales funnel: every line in the deviation list is a quotable P2 item.',
    },
    s2: {
      h: 'Phase P2 — Implementation: five standard work packages (WP)',
      intro: 'P2 in essence: take every vacuum P1 found, and fill it through five pipes. Each WP has a proven template — a new client only swaps the parameters.',
      t: {
        cols: ['Package', 'Scope', 'Standard actions', 'Template asset (field-proven)', 'Executed by', 'Effect window'],
        rows: [
          ['WP1 Website GEO rebuild', 'Technical baseline + content pool', 'Eight technical items: SSR real text / robots allowlist / Schema trio (Organization · Service · FAQPage) / hreflang / 301s preserving cited URLs / NAP consistency / no access walls / performance. Content pool: FAQ, pricing-logic page (zero figures + CTA), facts page, buyer’s guide', 'Website GEO Technical Requirements + Crawler & Acceptance Checklist + Schema pack', 'Client’s web agency builds; MemeCMO audits & releases', '2–6 weeks'],
          ['WP2 Crawler & index switches', 'The four AI-ingestion switches', 'robots.txt allowing 8 UAs (GPTBot / OAI-SearchBot / ClaudeBot / PerplexityBot / Google-Extended / Googlebot / Bingbot / CCBot) → GSC verify + sitemap → Bing Webmaster one-click import + IndexNow → business profiles', '48-Hour Sprint Runbook §D2', 'Partner assistant, checklist-driven', '1–4 weeks'],
          ['WP3 External authority sources', 'Knowledge graph + third-party endorsement', 'Wikidata entry (10 fields, each sourced) → Wikipedia (compliant drafting, client publishes, COI disclosed) → industry directories → every external NAP identical to the website, word for word', 'Wikipedia / Wikidata Publishing Pack + entry drafts', 'Partner / client publish; MemeCMO drafts', '2–8 weeks'],
          ['WP4 Platform dynamic content', 'Unified social presence + media supply', 'Content-card mechanism (names / tagline / bio / NAP as the single wording source — paste, never rewrite) unifying FB / LinkedIn / YouTube; media publishing at baseline density: 2–4 deep articles per month (question-shaped titles answering the buyer prompt panel); steady beats bursts', '48-Hour Sprint Runbook §D1 + Content Cards A–D + density table', 'Partner content team', '2–6 weeks'],
          ['WP5 Corpus correction', 'Kill what AI is saying wrong', 'From P1 accuracy verdicts, extract three target classes: wrong facts (hotlines, old addresses), false competitor comparisons, hallucinations (invented prices) → corrective content per item (authoritative site page + media corroboration); verify elimination in the next scan', 'Deviation list → corrective-content mapping table', 'MemeCMO drafts, client approves, partner publishes', '2–6 weeks / item'],
        ],
      },
      key: 'Key sentence: nothing in P2 is mystical optimization — every item places authoritative corpus into one specific pipe, and every item can be verified by name in the next P1 scan. Any one of these modifications tangibly moves the engines: retrieval first (citation, presence), parametric later (training cycles run in months) — which is also the physical argument for a continuous subscription.',
    },
    s3: {
      h: 'Closing the loop: pre-register every P2 action against a P1 metric',
      para: 'When a WP starts, register a row in the attribution table at the same time — write the expected metric first, then let the scan settle it. This is the standard language a partner uses to prove value to their client (born in a real engagement; survived three rounds of the client’s methodology audits).',
      cols: ['Action (WP)', 'Problem targeted', 'Before', 'After', 'Met?', 'Replicable?'],
      note: 'Six fixed columns. “Met?” accepts only beyond-noise (±3) + same baseline + scan-ID traceable. “Not met” rows are allowed — honesty anchors the table’s credibility. Expected mappings: WP1/WP2 → citation strength, presence; WP3 → new-sources column, knowledge-graph accuracy; WP4 → share of voice, sentiment; WP5 → accuracy, top-of-mind.',
    },
    s4: {
      h: 'Roles (RACI summary)',
      t: {
        cols: ['Workstream', 'MemeCMO', 'Channel partner', 'Brand client', 'Third party'],
        rows: [
          ['Platform / scans / reports / judging', 'R+A', 'I', 'I (read-only)', '—'],
          ['Client relationship / sales / coordination', 'C (solution support)', 'R+A', 'I', '—'],
          ['Fact sign-off / forbidden items', 'C (templates & audit)', 'R (collect)', 'A (sign)', '—'],
          ['WP1 website build', 'C (requirements + acceptance audit)', 'R (coordinate)', 'A', 'R (build)'],
          ['WP2–WP4 execution', 'C (runbooks + verification)', 'R', 'A (authorize / approve)', 'as needed'],
          ['WP5 corrective content', 'R (draft)', 'R (publish)', 'A (approve)', '—'],
        ],
      },
    },
    s5: {
      h: 'The standard 90-day timeline',
      t: {
        cols: ['Week', 'Milestone', 'Acceptance'],
        rows: [
          ['W0', 'Day-0 scan in the pitch meeting (P1-1)', 'First scorecard shown live'],
          ['W1–W2', 'Accounts, fact sheet signed, measurement frozen, weekly report live (P1-2…5); WP2 crawler switches via 48-hour sprint', 'Freeze confirmation sheet; first weekly report delivered'],
          ['W2–W6', 'WP1 website build + WP3 authority sources + WP4 platform unification and content supply', 'Website acceptance passed; Wikidata live; content cards consistent on all platforms'],
          ['W4 / W8 / W12', 'Three monthly reviews: attribution rows settled; WP5 corrections rolling', 'W12 review = 90-day acceptance report vs Day-0 (beyond-noise improvements only)'],
        ],
      },
      success: '90-day success criterion (partner-internal): reproduce the curve shape “citation leads, presence follows” — that is the methodology holding on a new client; then switch to the steady subscription loop. (Field reference: first full cycle — AIGVR 61→65, citation +82%, presence +7 pts, all beyond the noise band.)',
    },
    s6: {
      h: 'The replicable asset library (swap parameters only)',
      t: {
        cols: ['Template', 'Purpose', 'Used in'],
        rows: [
          ['Brand alignment table + Fact Sheet sign-off', 'Fact governance and judging baseline', 'P1-3'],
          ['Freeze confirmation sheet (Scan Manifest)', 'Contract-grade measurement credibility', 'P1-4'],
          ['Weekly (auto) / monthly review template / walkthrough agenda', 'Three-layer periodic reporting', 'P1-5'],
          ['Website GEO Technical Requirements + Crawler & Acceptance Checklist', 'Web build and release audit', 'WP1 / WP2'],
          ['48-Hour Sprint Runbook (content-card mechanism)', 'Network-wide unification and index switches', 'WP2 / WP4'],
          ['Wikipedia / Wikidata Publishing Pack', 'Knowledge-graph building (compliant: we draft, client publishes)', 'WP3'],
          ['Channel Operations Guide (frequency / density baseline)', 'Content supply cadence', 'WP4'],
          ['Attribution table (six columns) + deviation → correction map', 'Value proof and correction management', '§3 / WP5'],
          ['Migration Protection Pack (301 / cited-URL inventory)', 'Preserving AI assets when a client changes site or vendor', 'WP1 variant'],
        ],
      },
    },
    s7: {
      h: 'New-client launch checklist (the salesperson’s pocket page)',
      items: [
        'Day-0 scan run; scorecard shown to the client',
        'Commercial package agreed (P1 subscription / P1+P2 full); credits configured',
        'Client named a fact signer (empowered to rule on names, scale, forbidden items)',
        'Brand fact sheet signed; forbidden items (prices etc.) listed',
        'Core prompt language = the buyers’ real query language (not necessarily the client’s internal language)',
        'Competitor set confirmed by the client and locked (competitor / partner / self distinguished)',
        'Scan / report cadence aligned to the client’s management meeting',
        'Client’s web agency contact onboarded; technical requirements delivered',
        'Partner’s executing assistant holds the 48-Hour Sprint Runbook (local-language edition)',
        'Attribution table opened; every P2 action pre-registered against an expected metric before execution',
      ],
    },
    foot: 'MemeCMO Tech Limited · v1.1 · Codes P1/P2/WP1–WP5 shared across all language editions · Methodology evidenced by a first full delivery cycle (2026-07/08), 20 scans fully traceable',
  },

  vi: {
    htmlLang: 'vi',
    docType: 'Partner Playbook · Sổ tay đối tác v1.1',
    title: 'Phương pháp luận dịch vụ GEO của MemeCMO · Sổ tay triển khai cho Đối tác kênh',
    subtitle: 'Vòng khép kín hai giai đoạn: P1 Đánh giá ⇄ P2 Thực thi · Một quy trình kinh doanh nhân rộng được cho mọi đối tác kênh phục vụ mọi khách hàng thương hiệu',
    oneLiner: 'Dịch vụ GEO = một vòng lặp chạy liên tục: P1 đo thương hiệu đang đứng ở đâu trong câu trả lời của AI và lệch những gì (kèm báo cáo định kỳ); P2 sửa các nguồn ngữ liệu trong thế giới thực qua năm gói công việc chuẩn; lần quét P1 kế tiếp kiểm chứng hiệu quả. Đánh giá chỉ ra khoảng trống, thực thi lấp nó, tái đánh giá chứng minh nó — bản thân vòng lặp chính là dịch vụ, và là lý do gia hạn. Tầng phương pháp giống hệt nhau cho mọi khách hàng; tầng nội dung làm mới theo từng thương hiệu — chính sự phân tầng đó là mô hình kinh doanh.',
    figCaps: [
      'Hình 1 · Vòng lặp chủ đạo: P1 Đánh giá ⇄ P2 Sửa đổi — vòng lặp là dịch vụ, cũng là lý do gia hạn',
      'Hình 2 · Dây chuyền P1 (W0–W2): ký duyệt dữ kiện và khóa bộ đo là hai cổng cứng',
      'Hình 3 · Năm đường ống → một kho ngữ liệu chính thống → các engine AI (truy xuất chuyển động trước trong 2–6 tuần; huấn luyện mô hình theo sau, tính bằng tháng)',
      'Hình 4 · Lộ trình 90 ngày: ba kỳ tổng kết tháng phân xử bảng quy kết từng dòng; W12 = nghiệm thu 90 ngày',
    ],
    s0: {
      h: '0. Bốn nguyên tắc nền (trước mọi quy trình)',
      t: {
        cols: ['Nguyên tắc', 'Ý nghĩa', 'Thể hiện trong quy trình'],
        rows: [
          ['① Hàn chết cây thước trước khi đọc số', 'Bộ câu hỏi, danh sách đối thủ, chuẩn chấm điểm và nhịp quét phải khóa trước — khi đó biến động mới đáng tin và đủ tư cách nghiệm thu', 'P1-4 là cổng của P1; mọi con số trước khi khóa đều dán nhãn “giai đoạn hiệu chỉnh”'],
          ['② Quản trị dữ kiện trước khi sản xuất nội dung', 'Dữ kiện thương hiệu (tên / quy mô / NAP / tagline / mục cấm) cần một phiên bản chính thống duy nhất, phân cấp PUBLIC-READY / INTERNAL-CONTROLLED / HOLD', 'P1-3 là bước duy nhất khách hàng phải tham gia sâu; chưa ký Fact Sheet thì chưa vào P2'],
          ['③ AI lấp chỗ trống bằng bất cứ thứ gì nhặt được', 'AI không nhắm vào ai. Nơi ngữ liệu chính thống còn trống, nó dùng hotline sai, khẩu độ thổi phồng của đối thủ, giá bịa. Ai cung cấp ngữ liệu, người đó sở hữu câu trả lời', 'Cả năm gói P2 đều là những đường ống khác nhau đổ vào cùng một chỗ trống'],
          ['④ Hiệu quả có chu kỳ vật lý — không được hứa quá', 'Engine truy xuất phản hồi trong 2–6 tuần; engine tham số (huấn luyện mô hình) tính bằng tháng; dao động một lần quét trong ±3 là nhiễu', 'Mọi báo cáo mang biên nhiễu và nhãn bằng chứng; quy kết chỉ nhận “vượt nhiễu + cùng chuẩn + liên tiếp”'],
        ],
      },
    },
    s1: {
      h: 'Giai đoạn P1 — Đánh giá: cho khách hàng thấy vị trí của mình trong câu trả lời AI',
      t: {
        cols: ['Bước', 'Hành động', 'Cách làm chuẩn', 'Sản phẩm bàn giao (có mẫu sẵn)', 'Chủ trì', 'Thời điểm'],
        rows: [
          ['P1-1', 'Quét baseline Day-0', 'Khởi động ngay tại buổi chào hàng: tạo dự án → quét toàn diện → bảng điểm đầu tiên trong vài phút. Động tác thu hút khách mạnh nhất — lần đầu khách thấy “AI nói gì về mình”', 'Bảng điểm Day-0 + báo cáo khởi động PDF', 'Sales đối tác (tự thao tác)', 'Buổi chào hàng'],
          ['P1-2', 'Tài khoản & phân quyền', 'Tổ chức con của khách dưới tổ chức đối tác; đối tác = editor (chạy được quét), khách = viewer chỉ đọc; credit cấu hình theo gói', 'Sổ tài khoản + ma trận vai trò', 'Vận hành đối tác', 'Tuần ký hợp đồng'],
          ['P1-3', 'Hồ sơ dữ kiện thương hiệu (bước duy nhất khách tham gia sâu)', 'Thu thập và lấy chữ ký duyệt: tên chính thức (mọi ngôn ngữ) / tagline / một lượng từ quy mô duy nhất / NAP / dữ kiện khác biệt / mục cấm phát (số giá, chỉ số nội bộ); phân cấp PUBLIC-READY / INTERNAL-CONTROLLED / HOLD; nạp vào brand_profile làm chuẩn duy nhất cho chấm điểm và sinh nội dung', 'Bảng chuẩn hóa thương hiệu + Fact Sheet có chữ ký', 'AM đối tác + khách hàng', 'Tuần 1'],
          ['P1-4', 'Khóa bộ đo', 'Bộ câu hỏi lõi (20) chốt theo ngôn ngữ hỏi thật của người mua và khóa vĩnh viễn; danh sách đối thủ do người duyệt và locked (không tự xoay vòng); chuẩn chấm = dữ kiện đã ký; nhịp quét khớp lịch họp quản lý của khách', 'Phiếu xác nhận khóa chuẩn (Scan Manifest kỳ đầu)', 'MemeCMO + đối tác', 'Tuần 1–2'],
          ['P1-5', 'Nhịp báo cáo vận hành', 'Ba tầng bàn giao: báo cáo tuần (tự động) → tổng kết tháng (phân tích + bảng quy kết) → trao đổi quý / mốc lớn. Kỳ đầu kèm 30 phút hướng dẫn đọc bảng điểm', 'Tuần (tự động) + mẫu báo cáo tháng + đề cương buổi hướng dẫn', 'Hệ thống + đối tác', 'Từ tuần 2'],
        ],
      },
      promise: 'Cam kết của P1 với khách hàng: điểm baseline và vị trí theo từng ngôn ngữ, danh sách sai lệch (câu hỏi nào AI trả lời sai / bỏ sót / nhường cho đối thủ), khuyến nghị nội dung, và theo dõi vị trí hằng tuần từ đó về sau. P1 bán được độc lập (gói chẩn đoán + giám sát) — và là phễu bán hàng của P2: mỗi dòng trong danh sách sai lệch là một hạng mục báo giá P2.',
    },
    s2: {
      h: 'Giai đoạn P2 — Thực thi: năm gói công việc chuẩn (WP)',
      intro: 'Bản chất P2: lấy từng chỗ trống P1 tìm ra, lấp qua năm đường ống. Mỗi WP có mẫu đã kiểm chứng — khách mới chỉ thay tham số.',
      t: {
        cols: ['Gói', 'Phạm vi', 'Hành động chuẩn', 'Tài sản mẫu (đã dùng thực chiến)', 'Người thực hiện', 'Chu kỳ hiệu quả'],
        rows: [
          ['WP1 Cải tạo website theo GEO', 'Chuẩn kỹ thuật + kho nội dung', 'Tám hạng mục kỹ thuật: SSR chữ thật / robots allowlist / bộ ba Schema (Organization · Service · FAQPage) / hreflang / 301 giữ URL được trích dẫn / NAP nhất quán / không tường chắn / hiệu năng. Kho nội dung: FAQ, trang logic giá (không số + CTA), trang dữ kiện, buyer’s guide', 'Danh mục yêu cầu kỹ thuật GEO + Phiếu crawler & nghiệm thu + gói Schema', 'Agency web của khách xây; MemeCMO audit & phát hành', '2–6 tuần'],
          ['WP2 Công tắc crawler & index', 'Bốn công tắc thu nhận của AI', 'robots.txt mở 8 UA (GPTBot / OAI-SearchBot / ClaudeBot / PerplexityBot / Google-Extended / Googlebot / Bingbot / CCBot) → GSC xác minh + sitemap → Bing Webmaster nhập một chạm + IndexNow → hồ sơ doanh nghiệp', 'Phiếu thao tác 48 giờ §D2', 'Trợ lý đối tác làm theo phiếu', '1–4 tuần'],
          ['WP3 Nguồn uy tín bên ngoài', 'Đồ thị tri thức + chứng thực bên thứ ba', 'Mục Wikidata (10 trường, kèm nguồn) → Wikipedia (soạn hợp quy, khách tự đăng, khai báo COI) → danh bạ ngành → mọi NAP bên ngoài giống website từng chữ', 'Bộ tài liệu phát hành Wikipedia / Wikidata + bản nháp mục từ', 'Đối tác / khách đăng; MemeCMO soạn', '2–8 tuần'],
          ['WP4 Nội dung động trên nền tảng', 'Thống nhất mạng xã hội + nguồn cung báo chí', 'Cơ chế thẻ nội dung (tên / tagline / bio / NAP là nguồn văn bản duy nhất — chỉ dán, không viết lại) thống nhất FB / LinkedIn / YouTube; đăng bài theo mật độ chuẩn: 2–4 bài sâu mỗi tháng (tiêu đề dạng câu hỏi); đều đặn thắng bùng nổ', 'Phiếu thao tác 48 giờ §D1 + Thẻ nội dung A–D + bảng mật độ', 'Đội nội dung đối tác', '2–6 tuần'],
          ['WP5 Sửa lỗi ngữ liệu', 'Dập những gì AI đang nói sai', 'Từ phán quyết độ chính xác của P1, rút ba nhóm mục tiêu: dữ kiện sai (hotline, địa chỉ cũ), so sánh đối thủ sai lệch, ảo giác (giá bịa) → nội dung đính chính từng mục (trang chính thống + bài báo chứng thực); kiểm chứng đã xóa ở lần quét sau', 'Bảng ánh xạ sai lệch → nội dung đính chính', 'MemeCMO soạn, khách duyệt, đối tác đăng', '2–6 tuần / mục'],
        ],
      },
      key: 'Câu chốt: không có gì trong P2 là “tối ưu huyền bí” — mỗi hạng mục đặt ngữ liệu chính thống vào một đường ống cụ thể, và đều kiểm chứng được đích danh ở lần quét P1 kế tiếp. Bất kỳ sửa đổi nào cũng thực sự lay chuyển các engine: truy xuất trước (trích dẫn, hiện diện), tham số sau (chu kỳ huấn luyện tính bằng tháng) — đó cũng là lập luận vật lý cho thuê bao liên tục.',
    },
    s3: {
      h: 'Khép vòng: đăng ký trước mỗi hành động P2 với một chỉ số P1',
      para: 'Khi một WP khởi động, lập ngay một dòng trong bảng quy kết — viết trước “kỳ vọng chỉ số nào chuyển động”, rồi để lần quét phân xử. Đây là ngôn ngữ chuẩn để đối tác chứng minh giá trị với khách hàng của mình (ra đời từ dự án thực; đã vượt qua ba vòng kiểm toán phương pháp luận của chính khách hàng).',
      cols: ['Hành động (WP)', 'Vấn đề nhắm tới', 'Trước', 'Sau', 'Đạt?', 'Nhân rộng?'],
      note: 'Sáu cột cố định. “Đạt?” chỉ nhận vượt nhiễu (±3) + cùng chuẩn + truy vết được theo mã quét. Cho phép dòng “chưa đạt” — trung thực là mỏ neo uy tín của bảng. Ánh xạ kỳ vọng: WP1/WP2 → trích dẫn, hiện diện; WP3 → cột nguồn mới, độ chính xác tri thức; WP4 → SOV, cảm xúc; WP5 → độ chính xác, đề xuất đầu tiên.',
    },
    s4: {
      h: 'Phân vai (tóm tắt RACI)',
      t: {
        cols: ['Luồng việc', 'MemeCMO', 'Đối tác kênh', 'Khách hàng thương hiệu', 'Bên thứ ba'],
        rows: [
          ['Nền tảng / quét / báo cáo / chấm điểm', 'R+A', 'I', 'I (chỉ đọc)', '—'],
          ['Quan hệ khách / bán / điều phối', 'C (hỗ trợ giải pháp)', 'R+A', 'I', '—'],
          ['Ký duyệt dữ kiện / mục cấm', 'C (mẫu & audit)', 'R (thu thập)', 'A (ký)', '—'],
          ['WP1 xây website', 'C (yêu cầu + audit nghiệm thu)', 'R (điều phối)', 'A', 'R (thi công)'],
          ['WP2–WP4 thực thi', 'C (phiếu thao tác + kiểm chứng)', 'R', 'A (ủy quyền / duyệt)', 'tùy nhu cầu'],
          ['WP5 nội dung đính chính', 'R (soạn)', 'R (đăng)', 'A (duyệt)', '—'],
        ],
      },
    },
    s5: {
      h: 'Lộ trình chuẩn 90 ngày',
      t: {
        cols: ['Tuần', 'Cột mốc', 'Nghiệm thu'],
        rows: [
          ['W0', 'Quét Day-0 tại buổi chào hàng (P1-1)', 'Bảng điểm đầu tiên trình chiếu tại chỗ'],
          ['W1–W2', 'Tài khoản, ký Fact Sheet, khóa bộ đo, báo cáo tuần vận hành (P1-2…5); WP2 công tắc crawler qua sprint 48 giờ', 'Phiếu xác nhận khóa chuẩn; báo cáo tuần kỳ đầu gửi đi'],
          ['W2–W6', 'WP1 thi công website + WP3 nguồn uy tín + WP4 thống nhất nền tảng và nguồn cung nội dung', 'Nghiệm thu website đạt; Wikidata lên; thẻ nội dung nhất quán mọi nền tảng'],
          ['W4 / W8 / W12', 'Ba kỳ tổng kết tháng: các dòng quy kết được phân xử; WP5 đính chính cuốn chiếu', 'Kỳ W12 = báo cáo nghiệm thu 90 ngày so với Day-0 (chỉ nhận cải thiện vượt nhiễu)'],
        ],
      },
      success: 'Tiêu chí thành công 90 ngày (nội bộ đối tác): tái hiện hình dạng đường cong “trích dẫn đi trước, hiện diện theo sau” — tức phương pháp luận đứng vững trên khách hàng mới; sau đó chuyển sang vòng thuê bao ổn định. (Tham chiếu thực chiến: chu kỳ đầy đủ đầu tiên — AIGVR 61→65, trích dẫn +82%, hiện diện +7 điểm, đều vượt biên nhiễu.)',
    },
    s6: {
      h: 'Thư viện tài sản nhân rộng (chỉ thay tham số)',
      t: {
        cols: ['Mẫu', 'Công dụng', 'Dùng ở'],
        rows: [
          ['Bảng chuẩn hóa thương hiệu + mẫu ký Fact Sheet', 'Quản trị dữ kiện và chuẩn chấm điểm', 'P1-3'],
          ['Phiếu xác nhận khóa chuẩn (Scan Manifest)', 'Độ tin cậy phép đo ở cấp hợp đồng', 'P1-4'],
          ['Báo cáo tuần (tự động) / mẫu tổng kết tháng / đề cương hướng dẫn', 'Báo cáo định kỳ ba tầng', 'P1-5'],
          ['Danh mục yêu cầu kỹ thuật GEO + Phiếu crawler & nghiệm thu', 'Thi công web và audit phát hành', 'WP1 / WP2'],
          ['Phiếu thao tác 48 giờ (cơ chế thẻ nội dung)', 'Thống nhất toàn mạng và công tắc index', 'WP2 / WP4'],
          ['Bộ tài liệu phát hành Wikipedia / Wikidata', 'Xây đồ thị tri thức (hợp quy: ta soạn, khách đăng)', 'WP3'],
          ['Hướng dẫn vận hành kênh (chuẩn tần suất / mật độ)', 'Nhịp cung nội dung', 'WP4'],
          ['Bảng quy kết (6 cột) + bảng ánh xạ sai lệch → đính chính', 'Chứng minh giá trị và quản lý đính chính', '§3 / WP5'],
          ['Gói bảo vệ di trú (301 / danh mục URL được trích dẫn)', 'Giữ tài sản AI khi khách đổi website hoặc nhà cung cấp', 'Biến thể WP1'],
        ],
      },
    },
    s7: {
      h: 'Checklist khởi động khách mới (trang bỏ túi của sales)',
      items: [
        'Đã chạy quét Day-0; đã cho khách xem bảng điểm',
        'Đã chốt gói thương mại (thuê bao P1 / trọn gói P1+P2); đã cấu hình credit',
        'Khách đã chỉ định người ký dữ kiện (đủ quyền quyết tên, quy mô, mục cấm)',
        'Fact Sheet đã ký; mục cấm phát (giá…) đã liệt kê',
        'Ngôn ngữ bộ câu hỏi lõi = ngôn ngữ hỏi thật của người mua',
        'Danh sách đối thủ được khách xác nhận và khóa (competitor / partner / self)',
        'Nhịp quét / báo cáo khớp lịch họp quản lý của khách',
        'Đầu mối agency web của khách đã kết nối; đã nhận yêu cầu kỹ thuật',
        'Trợ lý thực thi của đối tác đã cầm Phiếu thao tác 48 giờ (bản ngôn ngữ địa phương)',
        'Đã mở bảng quy kết; mỗi hành động P2 đăng ký trước chỉ số kỳ vọng rồi mới thực hiện',
      ],
    },
    foot: 'MemeCMO Tech Limited · v1.1 · Mã P1/P2/WP1–WP5 dùng chung mọi bản ngôn ngữ · Phương pháp luận được chứng thực bởi chu kỳ triển khai đầy đủ đầu tiên (07–08/2026), 20 lần quét truy vết đầy đủ',
  },

  th: {
    htmlLang: 'th',
    docType: 'Partner Playbook v1.1',
    title: 'ระเบียบวิธีบริการ GEO ของ MemeCMO · คู่มือการส่งมอบสำหรับพันธมิตรช่องทาง',
    subtitle: 'วงจรปิดสองเฟส: P1 ประเมิน ⇄ P2 ลงมือแก้ไข · กระบวนการธุรกิจที่ทำซ้ำได้ สำหรับพันธมิตรช่องทางทุกรายที่ให้บริการลูกค้าแบรนด์',
    oneLiner: 'บริการ GEO = วงจรเดียวที่หมุนต่อเนื่อง: P1 วัดว่าแบรนด์อยู่ตรงไหนในคำตอบของ AI และมีอะไรคลาดเคลื่อน (พร้อมรายงานตามรอบ); P2 แก้ไขแหล่งคลังข้อมูลในโลกจริงผ่านแพ็กเกจงานมาตรฐานห้าชุด; การสแกน P1 รอบถัดไปพิสูจน์ผลลัพธ์ การประเมินชี้ช่องว่าง การลงมือปิดช่องว่าง การประเมินซ้ำพิสูจน์ว่าปิดแล้ว — ตัววงจรเองคือบริการ และคือเหตุผลของการต่ออายุ ชั้นระเบียบวิธีเหมือนกันทุกลูกค้า; ชั้นเนื้อหาสร้างใหม่ทุกแบรนด์ — การแบ่งชั้นนี้เองคือโมเดลธุรกิจ',
    figCaps: [
      'ภาพที่ 1 · วงจรหลัก: P1 ประเมิน ⇄ P2 แก้ไข — วงจรคือบริการ และคือเหตุผลของการต่ออายุ',
      'ภาพที่ 2 · สายพาน P1 (W0–W2): การเซ็นรับรองข้อเท็จจริงและการล็อกชุดวัดคือสองประตูแข็ง',
      'ภาพที่ 3 · ห้าท่อ → คลังข้อมูลทางการหนึ่งเดียว → เอนจิน AI (สืบค้นขยับก่อนใน 2–6 สัปดาห์; เทรนโมเดลตามมาเป็นหลักเดือน)',
      'ภาพที่ 4 · เส้นทาง 90 วัน: สรุปรายเดือนสามรอบตัดสินตารางระบุเหตุ-ผลทีละบรรทัด; W12 = ตรวจรับ 90 วัน',
    ],
    s0: {
      h: '0. หลักการพื้นฐานสี่ข้อ (มาก่อนทุกกระบวนการ)',
      t: {
        cols: ['หลักการ', 'ความหมาย', 'ปรากฏตรงไหนในกระบวนการ'],
        rows: [
          ['① เชื่อมไม้บรรทัดให้ตายก่อนอ่านค่า', 'ชุดคำถาม รายชื่อคู่แข่ง เกณฑ์การให้คะแนน และจังหวะการสแกน ต้องล็อกก่อน — ความเคลื่อนไหวจึงเชื่อถือได้และใช้ตรวจรับได้', 'P1-4 คือประตูของ P1; ตัวเลขก่อนล็อกติดป้าย “ช่วงสอบเทียบ” เสมอ'],
          ['② จัดระเบียบข้อเท็จจริงก่อนผลิตเนื้อหา', 'ข้อเท็จจริงของแบรนด์ (ชื่อ / ขนาด / NAP / แท็กไลน์ / รายการต้องห้าม) ต้องมีฉบับทางการเดียว จัดชั้น PUBLIC-READY / INTERNAL-CONTROLLED / HOLD', 'P1-3 คือขั้นตอนเดียวที่ลูกค้าต้องมีส่วนร่วมลึก; ไม่มีลายเซ็นก็ไม่เข้า P2'],
          ['③ AI เติมช่องว่างด้วยสิ่งที่มันเก็บได้', 'AI ไม่ได้เจาะจงใคร ที่ใดคลังข้อมูลทางการยังว่าง มันจะเติมด้วยเบอร์โทรผิด คำอ้างเกินจริงของคู่แข่ง ราคาที่กุขึ้น ใครป้อนคลังข้อมูล คนนั้นเป็นเจ้าของคำตอบ', 'แพ็กเกจ P2 ทั้งห้าคือท่อคนละเส้นที่เทลงช่องว่างเดียวกัน'],
          ['④ ผลลัพธ์มีรอบเวลาทางกายภาพ — ห้ามขายเกินจริง', 'เอนจินสืบค้นตอบสนองใน 2–6 สัปดาห์; เอนจินพารามิเตอร์ (เทรนโมเดล) เป็นหลักเดือน; การแกว่งครั้งเดียวภายใน ±3 คือสัญญาณรบกวน', 'ทุกรายงานมีแถบสัญญาณรบกวนและป้ายหลักฐาน; การระบุเหตุ-ผลรับเฉพาะ “เกินแถบ + เกณฑ์เดียวกัน + ต่อเนื่อง”'],
        ],
      },
    },
    s1: {
      h: 'เฟส P1 — ประเมิน: ให้ลูกค้าเห็นตำแหน่งของตัวเองในคำตอบ AI',
      t: {
        cols: ['ขั้น', 'การกระทำ', 'วิธีปฏิบัติมาตรฐาน', 'สิ่งส่งมอบ (มีแม่แบบแล้ว)', 'ผู้รับผิดชอบ', 'เมื่อใด'],
        rows: [
          ['P1-1', 'สแกนฐาน Day-0', 'เริ่มได้ในห้องขายเลย: สร้างโปรเจกต์ → สแกนเต็ม → สกอร์การ์ดแรกในไม่กี่นาที นี่คือท่าดึงลูกค้าที่แรงที่สุด — ลูกค้าเห็น “AI พูดถึงฉันว่าอย่างไร” เป็นครั้งแรก', 'สกอร์การ์ด Day-0 + รายงานเริ่มต้น PDF', 'ฝ่ายขายพันธมิตร (ทำเองได้)', 'ห้องนำเสนอ'],
          ['P1-2', 'บัญชีและสิทธิ์', 'องค์กรย่อยของลูกค้าใต้องค์กรพันธมิตร; พันธมิตร = editor (สั่งสแกนได้), ลูกค้า = viewer อ่านอย่างเดียว; เครดิตตั้งตามแพ็กเกจ', 'สมุดบัญชีผู้ใช้ + ตารางบทบาท', 'ฝ่ายปฏิบัติการพันธมิตร', 'สัปดาห์เซ็นสัญญา'],
          ['P1-3', 'เอกสารข้อเท็จจริงแบรนด์ (ขั้นเดียวที่ลูกค้าต้องร่วมลึก)', 'เก็บและให้เซ็นรับรอง: ชื่อทางการ (ทุกภาษา) / แท็กไลน์ / คำบอกขนาดทางการหนึ่งเดียว / NAP / ข้อเท็จจริงสร้างความต่าง / รายการต้องห้าม (ตัวเลขราคา ตัวชี้วัดภายใน); จัดชั้น PUBLIC-READY / INTERNAL-CONTROLLED / HOLD; โหลดเข้า brand_profile เป็นฐานเดียวของการให้คะแนนและการสร้างเนื้อหา', 'ตารางมาตรฐานแบรนด์ + Fact Sheet ที่เซ็นแล้ว', 'AM พันธมิตร + ลูกค้า', 'สัปดาห์ 1'],
          ['P1-4', 'ล็อกชุดวัด', 'ชุดคำถามหลัก (20 ข้อ) สรุปตามภาษาที่ผู้ซื้อถามจริงและล็อกถาวร; รายชื่อคู่แข่งคัดด้วยมือและ locked (ไม่หมุนอัตโนมัติ); เกณฑ์ให้คะแนน = ข้อเท็จจริงที่เซ็นแล้ว; จังหวะสแกนจัดให้ตรงประชุมผู้บริหารของลูกค้า', 'ใบยืนยันการล็อกเกณฑ์ (Scan Manifest ฉบับแรก)', 'MemeCMO + พันธมิตร', 'สัปดาห์ 1–2'],
          ['P1-5', 'เดินเครื่องรายงานตามรอบ', 'สามชั้นส่งมอบ: รายงานสัปดาห์ (อัตโนมัติ) → สรุปรายเดือน (บทวิเคราะห์ + ตารางระบุเหตุ-ผล) → ทบทวนรายไตรมาส / วาระสำคัญ ฉบับแรกมาพร้อมสอนอ่านสกอร์การ์ด 30 นาที', 'รายสัปดาห์ (อัตโนมัติ) + แม่แบบรายเดือน + วาระการสอนอ่าน', 'ระบบ + พันธมิตร', 'ตั้งแต่สัปดาห์ 2'],
        ],
      },
      promise: 'สิ่งที่ P1 สัญญากับลูกค้า: คะแนนฐานและตำแหน่งข้ามภาษา, รายการคลาดเคลื่อน (คำถามไหน AI ตอบผิด / ตกหล่น / ยกให้คู่แข่ง), คำแนะนำเนื้อหา และการติดตามตำแหน่งรายสัปดาห์ตั้งแต่นั้นไป P1 ขายเดี่ยวได้ (แพ็กวินิจฉัย + เฝ้าติดตาม) — และเป็นกรวยการขายของ P2: ทุกบรรทัดในรายการคลาดเคลื่อนคือรายการเสนอราคา P2 ได้ทันที',
    },
    s2: {
      h: 'เฟส P2 — ลงมือแก้ไข: แพ็กเกจงานมาตรฐานห้าชุด (WP)',
      intro: 'แก่นของ P2: เอาช่องว่างทุกจุดที่ P1 พบ มาเติมผ่านห้าท่อ ทุก WP มีแม่แบบที่พิสูจน์แล้ว — ลูกค้าใหม่แค่เปลี่ยนพารามิเตอร์',
      t: {
        cols: ['แพ็กเกจ', 'ขอบเขต', 'การกระทำมาตรฐาน', 'แม่แบบ (ผ่านสนามจริง)', 'ผู้ปฏิบัติ', 'รอบเห็นผล'],
        rows: [
          ['WP1 ปรับเว็บไซต์ตาม GEO', 'ฐานเทคนิค + คลังเนื้อหา', 'งานเทคนิคแปดข้อ: SSR ตัวอักษรจริง / robots allowlist / Schema สามชุด (Organization · Service · FAQPage) / hreflang / 301 รักษา URL ที่ถูกอ้าง / NAP สอดคล้อง / ไม่มีกำแพงเข้าถึง / ประสิทธิภาพ คลังเนื้อหา: FAQ, หน้าตรรกะราคา (ไม่มีตัวเลข + CTA), หน้าข้อเท็จจริง, buyer’s guide', 'ข้อกำหนดเทคนิค GEO + ใบตรวจรับ crawler + ชุด Schema', 'เอเจนซีเว็บของลูกค้าสร้าง; MemeCMO ตรวจและปล่อยผ่าน', '2–6 สัปดาห์'],
          ['WP2 สวิตช์ crawler และดัชนี', 'สวิตช์รับเข้า AI สี่ตัว', 'robots.txt เปิด 8 UA (GPTBot / OAI-SearchBot / ClaudeBot / PerplexityBot / Google-Extended / Googlebot / Bingbot / CCBot) → ยืนยัน GSC + sitemap → Bing Webmaster นำเข้าคลิกเดียว + IndexNow → โปรไฟล์ธุรกิจ', 'คู่มือสปรินต์ 48 ชั่วโมง §D2', 'ผู้ช่วยพันธมิตรทำตามใบงาน', '1–4 สัปดาห์'],
          ['WP3 แหล่งอ้างอิงภายนอก', 'กราฟความรู้ + การรับรองบุคคลที่สาม', 'รายการ Wikidata (10 ฟิลด์ มีแหล่งอ้าง) → Wikipedia (ร่างตามกติกา ลูกค้าเผยแพร่เอง เปิดเผย COI) → ไดเรกทอรีอุตสาหกรรม → NAP ภายนอกทุกที่ตรงกับเว็บไซต์ทุกตัวอักษร', 'ชุดเผยแพร่ Wikipedia / Wikidata + ร่างรายการ', 'พันธมิตร / ลูกค้าเผยแพร่; MemeCMO ร่าง', '2–8 สัปดาห์'],
          ['WP4 เนื้อหาบนแพลตฟอร์ม', 'โซเชียลเป็นหนึ่งเดียว + ป้อนสื่อ', 'กลไกการ์ดเนื้อหา (ชื่อ / แท็กไลน์ / ไบโอ / NAP เป็นแหล่งถ้อยคำเดียว — วางอย่างเดียว ห้ามเขียนใหม่) รวม FB / LinkedIn / YouTube; เผยแพร่สื่อตามความหนาแน่นฐาน: บทความลึก 2–4 ชิ้นต่อเดือน (พาดหัวรูปคำถาม); สม่ำเสมอชนะการระเบิดเป็นช่วง', 'คู่มือสปรินต์ 48 ชั่วโมง §D1 + การ์ดเนื้อหา A–D + ตารางความหนาแน่น', 'ทีมเนื้อหาพันธมิตร', '2–6 สัปดาห์'],
          ['WP5 แก้คลังข้อมูลที่ผิด', 'ดับสิ่งที่ AI กำลังพูดผิด', 'จากคำตัดสินความแม่นยำของ P1 สกัดเป้าสามชั้น: ข้อเท็จจริงผิด (เบอร์โทร ที่อยู่เก่า), การเทียบคู่แข่งที่เท็จ, อาการหลอน (ราคาที่กุ) → เนื้อหาแก้ไขรายข้อ (หน้าทางการ + บทความสื่อยืนยัน); พิสูจน์ว่าหายไปในการสแกนรอบถัดไป', 'ตารางจับคู่ คลาดเคลื่อน → เนื้อหาแก้ไข', 'MemeCMO ร่าง, ลูกค้าอนุมัติ, พันธมิตรเผยแพร่', '2–6 สัปดาห์ / ข้อ'],
        ],
      },
      key: 'ประโยคหลัก: ไม่มีอะไรใน P2 เป็น “การปรับแต่งลึกลับ” — ทุกข้อคือการวางคลังข้อมูลทางการลงท่อที่เจาะจง และทุกข้อพิสูจน์ได้โดยระบุชื่อในการสแกน P1 รอบถัดไป การแก้ไขด้านใดด้านหนึ่งล้วนขยับเอนจินจริง: สืบค้นก่อน (การอ้างอิง การปรากฏ) พารามิเตอร์ทีหลัง (รอบเทรนเป็นหลักเดือน) — นี่คือเหตุผลทางกายภาพของการสมัครสมาชิกต่อเนื่อง',
    },
    s3: {
      h: 'ปิดวงจร: ลงทะเบียนล่วงหน้าทุกการกระทำ P2 กับตัวชี้วัด P1',
      para: 'เมื่อ WP ใดเริ่ม ให้ลงบรรทัดในตารางระบุเหตุ-ผลพร้อมกัน — เขียน “คาดว่าตัวชี้วัดไหนจะขยับ” ก่อน แล้วให้การสแกนตัดสิน นี่คือภาษามาตรฐานที่พันธมิตรใช้พิสูจน์คุณค่ากับลูกค้าของตน (เกิดจากโปรเจกต์จริง; ผ่านการตรวจระเบียบวิธีของลูกค้าเองสามรอบ)',
      cols: ['การกระทำ (WP)', 'ปัญหาเป้าหมาย', 'ก่อน', 'หลัง', 'ผ่าน?', 'ทำซ้ำได้?'],
      note: 'หกคอลัมน์คงที่ “ผ่าน?” รับเฉพาะเกินแถบรบกวน (±3) + เกณฑ์เดิม + ตามรอยได้ด้วยรหัสสแกน อนุญาตให้มีบรรทัด “ไม่ผ่าน” — ความซื่อตรงคือสมอความน่าเชื่อถือของตาราง การจับคู่ที่คาด: WP1/WP2 → การอ้างอิง การปรากฏ; WP3 → คอลัมน์แหล่งใหม่ ความแม่นกราฟความรู้; WP4 → ส่วนแบ่งเสียง อารมณ์; WP5 → ความแม่นยำ การถูกแนะนำเป็นอันดับแรก',
    },
    s4: {
      h: 'บทบาทหน้าที่ (สรุป RACI)',
      t: {
        cols: ['สายงาน', 'MemeCMO', 'พันธมิตรช่องทาง', 'ลูกค้าแบรนด์', 'บุคคลที่สาม'],
        rows: [
          ['แพลตฟอร์ม / สแกน / รายงาน / ให้คะแนน', 'R+A', 'I', 'I (อ่านอย่างเดียว)', '—'],
          ['ความสัมพันธ์ลูกค้า / ขาย / ประสาน', 'C (สนับสนุนโซลูชัน)', 'R+A', 'I', '—'],
          ['เซ็นรับรองข้อเท็จจริง / รายการต้องห้าม', 'C (แม่แบบและตรวจ)', 'R (รวบรวม)', 'A (เซ็น)', '—'],
          ['WP1 สร้างเว็บ', 'C (ข้อกำหนด + ตรวจรับ)', 'R (ประสาน)', 'A', 'R (ก่อสร้าง)'],
          ['WP2–WP4 ปฏิบัติ', 'C (ใบงาน + พิสูจน์)', 'R', 'A (มอบอำนาจ / อนุมัติ)', 'ตามความจำเป็น'],
          ['WP5 เนื้อหาแก้ไข', 'R (ร่าง)', 'R (เผยแพร่)', 'A (อนุมัติ)', '—'],
        ],
      },
    },
    s5: {
      h: 'เส้นทางมาตรฐาน 90 วัน',
      t: {
        cols: ['สัปดาห์', 'หมุดหมาย', 'ตรวจรับ'],
        rows: [
          ['W0', 'สแกน Day-0 ในห้องนำเสนอ (P1-1)', 'โชว์สกอร์การ์ดแรกสด ๆ'],
          ['W1–W2', 'บัญชี, เซ็น Fact Sheet, ล็อกชุดวัด, รายงานสัปดาห์เดินเครื่อง (P1-2…5); WP2 สวิตช์ crawler ด้วยสปรินต์ 48 ชั่วโมง', 'ใบยืนยันล็อกเกณฑ์; รายงานสัปดาห์ฉบับแรกส่งถึง'],
          ['W2–W6', 'WP1 สร้างเว็บ + WP3 แหล่งอ้างอิง + WP4 รวมแพลตฟอร์มและป้อนเนื้อหา', 'ตรวจรับเว็บผ่าน; Wikidata ขึ้น; การ์ดเนื้อหาตรงกันทุกแพลตฟอร์ม'],
          ['W4 / W8 / W12', 'สรุปรายเดือนสามรอบ: ตัดสินบรรทัดระบุเหตุ-ผล; WP5 แก้ไขหมุนต่อเนื่อง', 'รอบ W12 = รายงานตรวจรับ 90 วัน เทียบ Day-0 (รับเฉพาะการดีขึ้นที่เกินแถบรบกวน)'],
        ],
      },
      success: 'เกณฑ์ความสำเร็จ 90 วัน (ภายในพันธมิตร): ทำซ้ำรูปทรงเส้นโค้ง “การอ้างอิงนำ การปรากฏตาม” — คือระเบียบวิธียืนได้บนลูกค้าใหม่; จากนั้นเข้าสู่วงจรสมาชิกภาพปกติ (อ้างอิงสนามจริง: รอบเต็มแรก — AIGVR 61→65, การอ้างอิง +82%, การปรากฏ +7 จุด ล้วนเกินแถบรบกวน)',
    },
    s6: {
      h: 'คลังทรัพย์สินทำซ้ำได้ (เปลี่ยนแค่พารามิเตอร์)',
      t: {
        cols: ['แม่แบบ', 'ประโยชน์', 'ใช้ที่'],
        rows: [
          ['ตารางมาตรฐานแบรนด์ + แบบเซ็น Fact Sheet', 'จัดระเบียบข้อเท็จจริงและเกณฑ์ให้คะแนน', 'P1-3'],
          ['ใบยืนยันล็อกเกณฑ์ (Scan Manifest)', 'ความน่าเชื่อถือของการวัดระดับสัญญา', 'P1-4'],
          ['รายสัปดาห์ (อัตโนมัติ) / แม่แบบรายเดือน / วาระสอนอ่าน', 'รายงานตามรอบสามชั้น', 'P1-5'],
          ['ข้อกำหนดเทคนิค GEO ของเว็บ + ใบตรวจรับ crawler', 'ก่อสร้างเว็บและตรวจปล่อยผ่าน', 'WP1 / WP2'],
          ['คู่มือสปรินต์ 48 ชั่วโมง (กลไกการ์ดเนื้อหา)', 'รวมทุกช่องทางและสวิตช์ดัชนี', 'WP2 / WP4'],
          ['ชุดเผยแพร่ Wikipedia / Wikidata', 'สร้างกราฟความรู้ (ตามกติกา: เราร่าง ลูกค้าเผยแพร่)', 'WP3'],
          ['คู่มือปฏิบัติการช่องทาง (ฐานความถี่ / ความหนาแน่น)', 'จังหวะป้อนเนื้อหา', 'WP4'],
          ['ตารางระบุเหตุ-ผล (6 คอลัมน์) + ตารางจับคู่คลาดเคลื่อน → แก้ไข', 'พิสูจน์คุณค่าและบริหารการแก้ไข', 'ข้อ 3 / WP5'],
          ['ชุดคุ้มครองการย้ายระบบ (301 / บัญชี URL ที่ถูกอ้าง)', 'รักษาทรัพย์สิน AI เมื่อลูกค้าเปลี่ยนเว็บหรือผู้ให้บริการ', 'WP1 แบบแปร'],
        ],
      },
    },
    s7: {
      h: 'เช็กลิสต์เริ่มลูกค้าใหม่ (หน้าพกพาของฝ่ายขาย)',
      items: [
        'สแกน Day-0 แล้ว; โชว์สกอร์การ์ดให้ลูกค้าดูแล้ว',
        'ตกลงแพ็กเกจการค้าแล้ว (สมาชิก P1 / เต็มชุด P1+P2); ตั้งเครดิตแล้ว',
        'ลูกค้าระบุผู้เซ็นข้อเท็จจริงแล้ว (ผู้มีอำนาจชี้ขาดชื่อ ขนาด รายการต้องห้าม)',
        'Fact Sheet เซ็นแล้ว; รายการต้องห้าม (ราคา ฯลฯ) ระบุแล้ว',
        'ภาษาชุดคำถามหลัก = ภาษาที่ผู้ซื้อถามจริง',
        'รายชื่อคู่แข่งลูกค้ายืนยันและล็อกแล้ว (competitor / partner / self)',
        'จังหวะสแกน / รายงานตรงกับประชุมผู้บริหารของลูกค้า',
        'ผู้ติดต่อเอเจนซีเว็บของลูกค้าเชื่อมแล้ว; ส่งข้อกำหนดเทคนิคแล้ว',
        'ผู้ช่วยปฏิบัติการของพันธมิตรถือคู่มือสปรินต์ 48 ชั่วโมง (ฉบับภาษาท้องถิ่น) แล้ว',
        'เปิดตารางระบุเหตุ-ผลแล้ว; ทุกการกระทำ P2 ลงทะเบียนตัวชี้วัดที่คาดก่อนแล้วจึงลงมือ',
      ],
    },
    foot: 'MemeCMO Tech Limited · v1.1 · รหัส P1/P2/WP1–WP5 ใช้ร่วมกันทุกฉบับภาษา · ระเบียบวิธียืนยันด้วยรอบส่งมอบเต็มรอบแรก (07–08/2026) สแกน 20 ครั้งตามรอยได้ครบ',
  },

  ar: {
    rtl: true,
    htmlLang: 'ar',
    docType: 'Partner Playbook · دليل الشريك v1.1',
    title: 'منهجية خدمات GEO من MemeCMO · دليل التسليم لشركاء القنوات',
    subtitle: 'حلقة مغلقة من مرحلتين: P1 التقييم ⇄ P2 التنفيذ · عملية تجارية قابلة للتكرار لأي شريك قناة يخدم أي علامة تجارية',
    oneLiner: 'خدمة GEO = حلقة واحدة تعمل باستمرار: تقيس المرحلة P1 موقع العلامة التجارية في إجابات الذكاء الاصطناعي وما فيها من انحرافات (مع تقارير دورية)؛ وتعدّل المرحلة P2 مصادر المحتوى في العالم الحقيقي عبر خمس حزم عمل قياسية؛ ثم يتحقق المسح التالي من الأثر. التقييم يكشف الفجوة، والتنفيذ يسدّها، وإعادة التقييم تثبت ذلك — الحلقة نفسها هي الخدمة، وهي مبرر التجديد. طبقة المنهجية واحدة لكل العملاء؛ وطبقة المحتوى تُبنى من جديد لكل علامة — وهذا الفصل هو نموذج العمل التجاري نفسه.',
    figCaps: [
      'الشكل 1 · الحلقة الرئيسية: P1 تقييم ⇄ P2 تعديل — الحلقة هي الخدمة وهي مبرر التجديد (تسميات الأشكال بالإنجليزية والرموز موحّدة في جميع النسخ)',
      'الشكل 2 · خط سير P1 (الأسابيع W0–W2): توقيع الحقائق وقفل المعايير هما البوابتان الصلبتان',
      'الشكل 3 · خمسة أنابيب ← محتوى رسمي واحد ← محركات الذكاء الاصطناعي (الاسترجاع يتحرك أولاً خلال 2–6 أسابيع؛ وتدريب النماذج يتبع خلال أشهر)',
      'الشكل 4 · مسار التسعين يوماً: ثلاث مراجعات شهرية تحسم جدول الإسناد سطراً سطراً؛ W12 = استلام التسعين يوماً',
    ],
    s0: {
      h: '0. المبادئ الأربعة الأساسية (قبل أي إجراء)',
      t: {
        cols: ['المبدأ', 'المعنى', 'أين يظهر في العملية'],
        rows: [
          ['① ثبّت المسطرة قبل أن تقرأها', 'يجب قفل لوحة الأسئلة وقائمة المنافسين ومعيار التحكيم وإيقاع المسح أولاً — عندها فقط تصبح التغيرات موثوقة وصالحة للاعتماد', 'قفل المعايير (P1-4) هو بوابة المرحلة الأولى؛ وأي رقم قبل القفل يوسم بأنه «فترة معايرة»'],
          ['② نظّم الحقائق قبل إنتاج المحتوى', 'حقائق العلامة (الأسماء / الحجم / بيانات الاتصال NAP / الشعار / البنود المحظورة) تحتاج نسخة رسمية واحدة مصنّفة: PUBLIC-READY / INTERNAL-CONTROLLED / HOLD', 'وثيقة الحقائق (P1-3) هي الخطوة الوحيدة بمشاركة عميقة من العميل؛ لا توقيع = لا مرحلة P2'],
          ['③ الذكاء الاصطناعي يملأ الفراغ بما يجده', 'الذكاء الاصطناعي لا يستهدف أحداً. حيث يغيب المحتوى الرسمي، يملأ الفراغ بأرقام هواتف خاطئة وادعاءات المنافسين المبالغ فيها وأسعار مختلَقة. من يورّد المحتوى يملك الإجابة', 'حزم العمل الخمس في P2 كلها أنابيب مختلفة تصبّ في الفراغ نفسه'],
          ['④ للنتائج دورات زمنية فيزيائية — لا تبالغ في الوعود', 'محركات الاسترجاع تستجيب خلال 2–6 أسابيع؛ والمحركات البارامترية (تدريب النماذج) خلال أشهر؛ والتذبذب ضمن ±3 في مسح واحد ضوضاء إحصائية', 'كل تقرير يحمل نطاقات الضوضاء ووسوم الأدلة؛ ولا يُقبل في الإسناد إلا «تجاوز الضوضاء + نفس المعيار + استمرارية»'],
        ],
      },
    },
    s1: {
      h: 'المرحلة P1 — التقييم: أرِ العميل موقعه في إجابات الذكاء الاصطناعي',
      t: {
        cols: ['الخطوة', 'الإجراء', 'الممارسة القياسية', 'المخرَج (نموذج جاهز)', 'المسؤول', 'التوقيت'],
        rows: [
          ['P1-1', 'مسح خط الأساس Day-0', 'يُطلق في اجتماع البيع نفسه: إنشاء المشروع ← مسح كامل ← أول بطاقة نتائج خلال دقائق. أقوى حركة لاكتساب العملاء — يرى العميل لأول مرة «ماذا يقول الذكاء الاصطناعي عني»', 'بطاقة نتائج Day-0 + تقرير انطلاق PDF', 'مبيعات الشريك (خدمة ذاتية)', 'اجتماع العرض'],
          ['P1-2', 'الحسابات والأدوار', 'منظمة فرعية للعميل تحت منظمة الشريك؛ الشريك = محرر (يشغّل المسوح)، العميل = مطالعة فقط؛ الأرصدة حسب الباقة', 'سجل الحسابات + مصفوفة الأدوار', 'عمليات الشريك', 'أسبوع التعاقد'],
          ['P1-3', 'وثيقة حقائق العلامة (الخطوة الوحيدة بمشاركة عميقة من العميل)', 'اجمع ووقّع: الأسماء الرسمية (بكل اللغات) / الشعار / مصطلح الحجم الرسمي الواحد / بيانات الاتصال NAP / حقائق التمايز / البنود المحظورة (أرقام الأسعار، المؤشرات الداخلية)؛ صنّف PUBLIC-READY / INTERNAL-CONTROLLED / HOLD؛ حمّل في brand_profile كمرجع وحيد للتحكيم والتوليد', 'جدول توحيد العلامة + وثيقة حقائق موقّعة', 'مدير حساب الشريك + العميل', 'الأسبوع 1'],
          ['P1-4', 'قفل منظومة القياس', 'لوحة الأسئلة الأساسية (20) تُعتمد بلغة استفسارات المشترين الحقيقية وتُقفل نهائياً؛ قائمة المنافسين تُنتقى يدوياً وتُقفل (بلا تدوير تلقائي)؛ معيار التحكيم = الحقائق الموقّعة؛ إيقاع المسح يُضبط على اجتماع إدارة العميل', 'وثيقة تأكيد القفل (أول Scan Manifest)', 'MemeCMO + الشريك', 'الأسبوعان 1–2'],
          ['P1-5', 'تشغيل إيقاع التقارير', 'ثلاث طبقات تسليم: تقرير أسبوعي (آلي) ← مراجعة شهرية (تحليل + جدول إسناد) ← جلسات ربع سنوية وعند المحطات الكبرى. العدد الأول يرافقه شرح 30 دقيقة لبطاقة النتائج', 'أسبوعي (آلي) + نموذج شهري + جدول أعمال جلسة الشرح', 'النظام + الشريك', 'من الأسبوع 2'],
        ],
      },
      promise: 'ما تعِد به P1 العميل: درجة خط الأساس والموقع عبر اللغات، قائمة الانحرافات (أي الأسئلة يجيب عنها الذكاء الاصطناعي خطأً / يغفلها / يمنحها للمنافسين)، توصيات المحتوى، وتتبع أسبوعي للموقع من ذلك الحين. تُباع P1 مستقلةً (اشتراك تشخيص + مراقبة) — وهي قمع مبيعات P2: كل سطر في قائمة الانحرافات بند قابل للتسعير في P2.',
    },
    s2: {
      h: 'المرحلة P2 — التنفيذ: خمس حزم عمل قياسية (WP)',
      intro: 'جوهر P2: خذ كل فراغ كشفته P1 واملأه عبر خمسة أنابيب. لكل حزمة نموذج مجرَّب — العميل الجديد يبدّل المعاملات فقط.',
      t: {
        cols: ['الحزمة', 'النطاق', 'الإجراءات القياسية', 'النموذج (مجرَّب ميدانياً)', 'المنفّذ', 'نافذة الأثر'],
        rows: [
          ['WP1 إعادة بناء الموقع وفق GEO', 'الأساس التقني + مخزون المحتوى', 'ثمانية بنود تقنية: عرض نصي حقيقي من الخادم / قائمة سماح robots / ثلاثية Schema (Organization · Service · FAQPage) / hreflang / تحويلات 301 تحفظ الروابط المستشهد بها / اتساق NAP / لا جدران وصول / الأداء. مخزون المحتوى: أسئلة شائعة، صفحة منطق التسعير (بلا أرقام + دعوة لطلب عرض)، صفحة حقائق، دليل المشتري', 'متطلبات GEO التقنية للموقع + قائمة الزواحف والاستلام + حزمة Schema', 'وكالة الويب لدى العميل تبني؛ MemeCMO تدقق وتجيز', '2–6 أسابيع'],
          ['WP2 مفاتيح الزحف والفهرسة', 'مفاتيح الاستيعاب الأربعة', 'ملف robots.txt يسمح بثمانية زواحف (GPTBot / OAI-SearchBot / ClaudeBot / PerplexityBot / Google-Extended / Googlebot / Bingbot / CCBot) ← توثيق GSC + خريطة الموقع ← استيراد Bing Webmaster بنقرة + IndexNow ← الملفات التجارية', 'دليل سباق الـ48 ساعة §D2', 'مساعد الشريك وفق القائمة', '1–4 أسابيع'],
          ['WP3 مصادر الموثوقية الخارجية', 'الرسم المعرفي + إسناد الطرف الثالث', 'مدخل Wikidata (عشرة حقول بمصادرها) ← ويكيبيديا (صياغة ملتزمة، والعميل ينشر بنفسه مع إفصاح تضارب المصالح) ← أدلة القطاع ← كل NAP خارجي مطابق للموقع حرفياً', 'حزمة نشر Wikipedia / Wikidata + مسودات المداخل', 'الشريك / العميل ينشران؛ MemeCMO تصيغ', '2–8 أسابيع'],
          ['WP4 المحتوى الديناميكي على المنصات', 'حضور اجتماعي موحّد + إمداد إعلامي', 'آلية بطاقات المحتوى (الاسم / الشعار / النبذة / NAP مصدر صياغة وحيد — الصق ولا تُعِد الكتابة) لتوحيد FB / LinkedIn / YouTube؛ النشر بكثافة أساسية: 2–4 مقالات معمّقة شهرياً (عناوين بصيغة أسئلة)؛ الانتظام يتفوق على الدفقات', 'دليل سباق الـ48 ساعة §D1 + بطاقات المحتوى A–D + جدول الكثافة', 'فريق محتوى الشريك', '2–6 أسابيع'],
          ['WP5 تصحيح المحتوى الخاطئ', 'أوقف ما يقوله الذكاء الاصطناعي خطأً', 'من أحكام الدقة في P1 تُستخرج ثلاث فئات: حقائق خاطئة (هواتف، عناوين قديمة)، مقارنات منافسين زائفة، هلوسات (أسعار مختلَقة) ← محتوى تصحيحي لكل بند (صفحة رسمية + مقال إعلامي مساند)؛ والتحقق من الزوال في المسح التالي', 'جدول ربط الانحراف ← المحتوى التصحيحي', 'MemeCMO تصيغ، العميل يعتمد، الشريك ينشر', '2–6 أسابيع / بند'],
        ],
      },
      key: 'الجملة المفتاحية: لا شيء في P2 «تحسين غامض» — كل بند يضع محتوى رسمياً في أنبوب محدد، وكل بند يمكن التحقق منه بالاسم في مسح P1 التالي. أي تعديل من هذه يحرّك المحركات فعلياً: الاسترجاع أولاً (الاستشهاد، الحضور)، والبارامترية لاحقاً (دورات التدريب بالأشهر) — وهذه هي الحجة الفيزيائية للاشتراك المستمر.',
    },
    s3: {
      h: 'إغلاق الحلقة: سجّل كل إجراء P2 مسبقاً مقابل مؤشر P1',
      para: 'عند انطلاق أي حزمة عمل، سجّل سطراً في جدول الإسناد في الوقت نفسه — اكتب أولاً «أي مؤشر نتوقع أن يتحرك»، ثم دع المسح يحكم. هذه هي اللغة القياسية التي يثبت بها الشريك القيمة لعميله (وُلدت في مشروع حقيقي؛ واجتازت ثلاث جولات من تدقيق العميل المنهجي).',
      cols: ['الإجراء (WP)', 'المشكلة المستهدفة', 'قبل', 'بعد', 'تحقق؟', 'قابل للتكرار؟'],
      note: 'ستة أعمدة ثابتة. «تحقق؟» لا يقبل إلا تجاوز الضوضاء (±3) + نفس المعيار + إمكانية التتبع برمز المسح. يُسمح بسطور «لم يتحقق» — فالصدق هو مرساة مصداقية الجدول. الربط المتوقع: WP1/WP2 ← قوة الاستشهاد والحضور؛ WP3 ← عمود المصادر الجديدة ودقة الرسم المعرفي؛ WP4 ← حصة الصوت والمشاعر؛ WP5 ← الدقة والتوصية الأولى.',
    },
    s4: {
      h: 'الأدوار (ملخص RACI)',
      t: {
        cols: ['مسار العمل', 'MemeCMO', 'شريك القناة', 'العميل (العلامة)', 'طرف ثالث'],
        rows: [
          ['المنصة / المسوح / التقارير / التحكيم', 'R+A', 'I', 'I (مطالعة فقط)', '—'],
          ['علاقة العميل / البيع / التنسيق', 'C (دعم الحلول)', 'R+A', 'I', '—'],
          ['توقيع الحقائق / البنود المحظورة', 'C (نماذج وتدقيق)', 'R (جمع)', 'A (توقيع)', '—'],
          ['بناء الموقع WP1', 'C (متطلبات + تدقيق استلام)', 'R (تنسيق)', 'A', 'R (تنفيذ)'],
          ['تنفيذ WP2–WP4', 'C (أدلة تشغيل + تحقق)', 'R', 'A (تفويض / اعتماد)', 'حسب الحاجة'],
          ['المحتوى التصحيحي WP5', 'R (صياغة)', 'R (نشر)', 'A (اعتماد)', '—'],
        ],
      },
    },
    s5: {
      h: 'الجدول الزمني القياسي: 90 يوماً',
      t: {
        cols: ['الأسبوع', 'المحطة', 'الاستلام'],
        rows: [
          ['W0', 'مسح Day-0 في اجتماع العرض (P1-1)', 'عرض أول بطاقة نتائج مباشرة'],
          ['W1–W2', 'الحسابات، توقيع وثيقة الحقائق، قفل القياس، تشغيل التقرير الأسبوعي (P1-2…5)؛ مفاتيح الزحف WP2 عبر سباق الـ48 ساعة', 'وثيقة تأكيد القفل؛ وصول أول تقرير أسبوعي'],
          ['W2–W6', 'بناء الموقع WP1 + مصادر الموثوقية WP3 + توحيد المنصات وإمداد المحتوى WP4', 'اجتياز استلام الموقع؛ صعود Wikidata؛ اتساق بطاقات المحتوى على كل المنصات'],
          ['W4 / W8 / W12', 'ثلاث مراجعات شهرية: حسم سطور الإسناد؛ تصحيحات WP5 المتواصلة', 'مراجعة W12 = تقرير استلام التسعين يوماً مقابل Day-0 (لا يُقبل إلا التحسن المتجاوز للضوضاء)'],
        ],
      },
      success: 'معيار نجاح التسعين يوماً (داخلي للشريك): إعادة إنتاج شكل المنحنى «الاستشهاد يتقدم، والحضور يتبع» — أي أن المنهجية صمدت على عميل جديد؛ ثم الانتقال إلى حلقة الاشتراك المستقرة. (مرجع ميداني: أول دورة كاملة — المؤشر 61←65، الاستشهاد +82%، الحضور +7 نقاط، كلها متجاوزة لنطاق الضوضاء.)',
    },
    s6: {
      h: 'مكتبة الأصول القابلة للتكرار (بدّل المعاملات فقط)',
      t: {
        cols: ['النموذج', 'الغرض', 'يُستخدم في'],
        rows: [
          ['جدول توحيد العلامة + نموذج توقيع وثيقة الحقائق', 'حوكمة الحقائق ومعيار التحكيم', 'P1-3'],
          ['وثيقة تأكيد القفل (Scan Manifest)', 'مصداقية قياس بمستوى تعاقدي', 'P1-4'],
          ['أسبوعي (آلي) / نموذج المراجعة الشهرية / جدول جلسة الشرح', 'تقارير دورية بثلاث طبقات', 'P1-5'],
          ['متطلبات GEO التقنية للموقع + قائمة الزواحف والاستلام', 'بناء الويب وتدقيق الإجازة', 'WP1 / WP2'],
          ['دليل سباق الـ48 ساعة (آلية بطاقات المحتوى)', 'التوحيد الشامل ومفاتيح الفهرسة', 'WP2 / WP4'],
          ['حزمة نشر Wikipedia / Wikidata', 'بناء الرسم المعرفي (نحن نصيغ والعميل ينشر)', 'WP3'],
          ['دليل تشغيل القنوات (أساس التواتر / الكثافة)', 'إيقاع إمداد المحتوى', 'WP4'],
          ['جدول الإسناد (ستة أعمدة) + جدول ربط الانحراف ← التصحيح', 'إثبات القيمة وإدارة التصحيح', 'البند 3 / WP5'],
          ['حزمة حماية الترحيل (301 / جرد الروابط المستشهد بها)', 'حفظ أصول الذكاء الاصطناعي عند تغيير الموقع أو المورّد', 'صيغة من WP1'],
        ],
      },
    },
    s7: {
      h: 'قائمة إطلاق عميل جديد (صفحة الجيب لمندوب المبيعات)',
      items: [
        'أُجري مسح Day-0؛ وعُرضت بطاقة النتائج على العميل',
        'اتُّفق على الباقة التجارية (اشتراك P1 / الحزمة الكاملة P1+P2)؛ وضُبطت الأرصدة',
        'سمّى العميل موقّع الحقائق (مخوّل بالبتّ في الأسماء والحجم والبنود المحظورة)',
        'وُقّعت وثيقة الحقائق؛ وأُدرجت البنود المحظورة (الأسعار وغيرها)',
        'لغة لوحة الأسئلة الأساسية = لغة استفسارات المشترين الحقيقية',
        'قائمة المنافسين أكّدها العميل وأُقفلت (منافس / شريك / ذات)',
        'إيقاع المسح / التقارير مضبوط على اجتماع إدارة العميل',
        'جهة اتصال وكالة الويب لدى العميل مربوطة؛ وسُلّمت المتطلبات التقنية',
        'مساعد التنفيذ لدى الشريك يحمل دليل سباق الـ48 ساعة (نسخة اللغة المحلية)',
        'فُتح جدول الإسناد؛ وكل إجراء P2 يُسجَّل مسبقاً بمؤشره المتوقع قبل التنفيذ',
      ],
    },
    foot: 'MemeCMO Tech Limited · v1.1 · الرموز P1/P2/WP1–WP5 موحّدة في جميع النسخ اللغوية · المنهجية مثبتة بأول دورة تسليم كاملة (07–08/2026) عبر عشرين مسحاً قابلة للتتبع بالكامل',
  },
};
