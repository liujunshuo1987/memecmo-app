# GEO/AEO 算法参考手册

> 本文档解释 Guanlan 看板背后的算法依据 —— 我们如何实证地分析大模型、解析答案、
> 评估可信来源。写作目的是让阅读者能在翻代码前就理解每个指标**怎么算、为什么这么算**。
>
> 所有公式/阈值/正则在文中直接给出，均可在源码中对齐核验；出处标注了文件与行号。

---

## 0. 为什么 GEO 不是 SEO 的延伸

传统 SEO 评估的是"网页在搜索引擎结果页里的排名位置"。GEO（Generative Engine
Optimization）评估的是**不同的东西**：

| 维度 | SEO | GEO |
|---|---|---|
| 查询者 | 人类用户 | 人类 → LLM 代答 |
| 观察对象 | 结果页链接列表 | 生成的自然语言段落 |
| 可衡量信号 | 点击/排名/CTR | **被提及 / 被引用 / 回答位置** |
| 失败模式 | 排不上首页 | 模型不知道 / 说错 / 不推荐 |

这个区别决定了我们所有看板的指标必须围绕**"LLM 把这个品牌写进了答案里吗？
写在哪？怎么说的？"** 这三件事，而不是围绕网页排名。

因此我们系统里的"单一 LLM 回答"是原料、"多模型交叉"是测量、"Schema/权威来源"是
施力点。下文拆成六层讲。

---

## 1. 单次大模型调用：Poe 多 bot 回退

**文件：** `lib/poe-client.ts`, `app/api/brand-probes/route.ts`, `app/api/sea-orchestrator/route.ts`

我们不绑定任何一家模型厂的 SDK，所有 LLM 调用统一走 Poe
（`https://api.poe.com/v1/chat/completions`，OpenAI 兼容协议）。原因：

1. 用户是 Poe 付费订户，一把 key 打遍 ChatGPT / Claude / Gemini / Perplexity /
   DeepSeek，避免多家计费集成。
2. Poe 的 bot 名字会漂（`Claude-Sonnet-4.5` 可能换成 `Claude-Sonnet-4`），
   每个逻辑模型都带**回退链**（fallback chain）。

```
claude  ← Claude-Sonnet-4.5 → Claude-Sonnet-4 → Claude-3.7-Sonnet → Claude-3.5-Sonnet
gpt     ← GPT-4o → GPT-4.1 → GPT-4-Turbo
gemini  ← Gemini-2.5-Pro → Gemini-2.0-Pro → Gemini-2.0-Flash → Gemini-1.5-Pro
```

回退规则：
- 遇到 401/403 **整条链立刻中止**（凭证错了，换 bot 也没用）。
- 其他错误/超时 → 尝试下一个 bot。
- 5xx/`ECONNABORTED` 指数退避：`2^attempt × 1000 + jitter`。

超时分层（`poe-client.ts` L105-116）：speed=10s / quality=30s / cost=8s / default=20s。
探针专用调用用 45s（推理更长）。

每次调用都会返回 `{ ok, content, bot, latencyMs, error }`，看板上
`[PROBE] Claude-Sonnet-4.5/identity ✓ mentioned@12%` 里的 bot 名就是链上**实际命中**
的那个，不是你在 UI 上选的那个 —— 这样运维可见。

---

## 2. 实证测量层：Brand Probe Runner

**文件：** `app/api/brand-probes/route.ts`

这是整个系统的**测量基石**。它解决了一个很早期就暴露出来的哲学问题：

> 如果一个 agent 告诉我"Claude 会怎么看这个品牌"，那它其实是在让**一个 LLM 替我
> 臆测另一个 LLM 的世界模型**。这循环自指。

所以探针跑的是实证测量：**真去问三个模型，再量化它们的答案**。

### 2.1 Probe Bank — 6 阶段 × 5 国母语

每次会话都要回答 6 个探针问题，覆盖品牌认知漏斗：

| stage | 问题意图 | 与 GEO 的对应 |
|---|---|---|
| `identity` | "X 是什么公司？" | E6 答案率最直接的信号 |
| `attributes` | "X 的优缺点？" | 语义锚 E4 |
| `domain` | "X 在哪个领域？" | 实体规范性 E1 |
| `category` | "同赛道前 5 名？" | SOV E3（品类召回） |
| `comparison` | "X vs 竞品" | SOV E3（对比召回） |
| `recommendation` | "是否推荐 X？" | 引用权威 E5（推理链） |

每条问题都有**两份模板**：当地母语版（发给模型）和中文版（给运营看）。已支持
越南语 / 印尼语 / 泰语 / 英语（新加坡）/ 马来语。

### 2.2 答案解析 — `analyzeAnswer()`

收到 LLM 的自然语言回答后，我们在**JS 侧**做确定性解析，不再走二次 LLM —— 这是
测量层必须可复现的基础。

```ts
brand_mentioned  = new RegExp(escapeRegex(brand.toLowerCase()), 'g').test(answer.toLowerCase())
mention_count    = matches.length
first_position_pct = round(firstIdx / answer.length × 100)   // 0% = 开头，100% = 结尾
```

**Candidate entity extraction**（候选竞品抽取）用一条关键正则：

```
/\b([A-Z][a-zA-Z0-9]{1,}(?:\s+[A-Z][a-zA-Z0-9]+){0,2})\b/g
```

匹配"首字母大写、1–3 词"的拉丁实体，再剔除：
- 长度 < 3
- 在 STOPWORDS 黑名单里（`The/A/In/Vietnam/Indonesia/...` 加国名语言名）
- 包含品牌自身字符串

每份答案取频次 Top 10 候选实体。

### 2.3 跨模型聚合

18 次调用（3 模型 × 6 探针）跑完后，做三轮聚合：

**(a) coverageByModel** —— 每个模型的命中画像：
```
mentionRate        = mentioned / total          (%)
avgFirstPositionPct= avg(first_position_pct) over mentioned only
firstPositionShare = |{ first_position_pct ≤ 20 }| / mentioned     # "Hero mention" 比例
avgMentionCount    = Σmention_count / total     (1 位小数)
```

`firstPositionShare` 是我们自己造的概念：在被提及的答案里，品牌出现在前 20%
的比例。意义在于：LLM 把品牌放首段 vs 放结尾 P.S.，**影响下游引用概率天差地别**。

**(b) competitorFrequency** —— 实证竞品发现：

对每条候选实体，追踪它出现在哪些 `{stage::modelId}` 单元格里：
```
cross_model    = 出现过的模型数          // 独立去重
coverage_cells = 出现过的 (stage, model) 组合数
mentions       = 总出现次数
```

**入围条件：** `cross_model ≥ 2 OR coverage_cells ≥ 3`
**排序：** `cross_model DESC, mentions DESC`，取 Top 10。

为什么是这两个阈值？因为**一家公司要成为真竞品，必须能在"多个模型×多个不同问法"
下被独立召回**。单一模型的一次答案里出现 3 次（比如该模型碎碎念）不算数；
2 个模型各说一次才算数 —— 这就是把信号从"单一 LLM 的执念"中洗出来。

**(c) stageBreakdown** —— AEO 漏斗：
```
stage.mentionRate = answersWithBrand / total × 100
```

**(d) 两个头条指标：**
```
overallMentionRate   = 所有成功调用中的命中率     // 总体提及率
answerInclusionRate  = stageBreakdown.identity.mentionRate
```

我们把 `answerInclusionRate` 等同于 AEO Answer Inclusion Rate（E6），因为
"X 是什么公司？"这个问句最贴近真实用户把 LLM 当百科用的场景，命中与否最能反映
品牌是否进入了模型的"答题默认语料"。

### 2.4 一次会话的成本画像

- 总调用：18 次，并发
- 并发控制：`Promise.allSettled`，单次失败不影响其他
- 数据结构化产物：3 个模型 × 4 指标 + 6 阶段 × 1 指标 + Top10 实证竞品
- 总耗时（quality 策略）：~15–40 秒（看 bot 响应）

---

## 3. 语料聚合层：多模型共识 / 分歧

**文件：** `lib/llm-aggregator.ts`

探针给了我们"命中没命中"，这一层回答"几家模型之间说的是不是一回事"。

### 3.1 语义相似度 — Jaccard

```ts
tokens(t) = t.toLowerCase().split(/\W+/).filter(w => w.length > 3)
sim(a, b) = |tokens(a) ∩ tokens(b)| / |tokens(a) ∪ tokens(b)|
```

刻意不上 embedding。Jaccard 便宜、确定性、可解释 —— 对 LLM 答案这种
"同义改写多、长尾词少"的文本，词面重叠就是最朴素的共识代理。

### 3.2 共识矩阵与指标

对一个问题下 N 个模型的答案：
```
agreementMatrix[i][j] = sim(ans[i], ans[j]) × 100        // 对称、对角=100
overallConsensus      = mean(upper triangle)
divergenceIndex       = 100 - overallConsensus
brandPerceptionConsensus = 100 - (max(mentionRate) - min(mentionRate)) / 2
```

`brandPerceptionConsensus` 低 → 说明模型们对品牌的**了解程度**分歧大，
比"答案文本分歧"更值得预警 —— 那是信息缺口（E1 实体规范性差）。

### 3.3 定位 / 强弱项 / 盲点 — 关键词启发式

我们用双语正则而非 LLM 做提取，为的是指标可稳定重现：

- **强项词库：** innovative/创新, reliable/可靠, advanced/先进, leading/领先,
  cutting-edge/尖端, excellent/优秀, strong/强大, powerful/强力, effective/有效
- **弱项词库：** expensive/昂贵, complex/复杂, limited/限制, slow/缓慢,
  outdated/过时, poor/差, weak/弱
- **定位桶：** `enterprise` → Enterprise/B2B；`startup|small` → SMB；
  `consumer|individual` → Consumer/Individual
- **缺席信息：** `partnership, pricing, ecosystem, community` — 哪些词库关键词
  在该模型的答案里**没**出现

### 3.4 情感倾向

计数法：
```
positive 词 = good/great/excellent/best/strong/innovative + 好/优秀/最好/强大
negative 词 = bad/poor/weak/limited/outdated + 差/弱/过时
```
规则：
- `pos > neg × 1.5` → positive
- `neg > pos × 1.5` → negative
- 都 > 0 → mixed
- 否则 neutral

### 3.5 GEO 维度指标（计算层）

```
citationLikelihood[model] = mentionCount[model] / answers[model] × 100
knowledgeGaps = missing ∈ { pricing, partnership, security, compliance, integration }
contentPreferences[model] = which of {
    Data-driven / Case studies / Feature descriptions / Benefits / Social proof
  } shows up in that model's answers via regex buckets
```

`contentPreferences` 是"该模型最吃哪种内容形态"的画像 —— 后面 Insight 层会据此
告诉你"给 Claude 多写数据、给 Gemini 多写案例"。

---

## 4. 策略生成层：GEO Insight Generator

**文件：** `lib/geo-insight-generator.ts`

到这一层数据已经足够干净，可以交给 LLM（Claude 3.5 Sonnet）"上升"成自然语言
建议。一次会话共 **5 次 Claude 调用**，结构化顺序：

| # | 函数 | max_tokens | 输出结构 |
|---|---|---:|---|
| 1 | `generateExecutiveSummary` | 500 | `{summary, strategy, priorityLevel: critical\|high\|medium, expectedLift}` |
| 2 | `generateModelSpecificRecommendations` × N 模型 | 800 | `{focusAreas, languagePreferences, structuringTips, riskFactors, quickWins[]}` |
| 3 | `generateContentStrategies` | 1200 | `[{strategy, rationale, targetModels, targetInformationGaps, geoMetrics}]` |
| 4 | `generateContentStructure` | 800 | `{keyFactsToHighlight, structuringPatterns, linkingOpportunities, thirdPartyValidation}` |
| 5 | `generateCognitiveGapRepair` | 1200 | `[{gap, currentMisperception, correctPerception, contentToEmphasis, expectedGapClosureTime}]` |

所有 JSON 解析走保底正则 `/\{[\s\S]*\}/` / `/\[[\s\S]*\]/`，解析失败时走类型化
fallback（而不是抛错）—— 生成失败不该卡住看板渲染。

Target mention rate 策略：
```
target = min(current + 15, 95)
```
把目标设在"当前 + 15 个百分点封顶 95"是经验值，既避免画大饼，又不让已经 80 分
的品牌显示"0 改进空间"。

---

## 5. 网页可信度层：Brand Audit

**文件：** `app/api/brand-audit/route.ts`

LLM 答案里被提及还不够 —— 我们还要看**承载品牌信息的那个网页本身**，是否
对 LLM 爬虫友好、能否作为"可信来源"被引用。

### 5.1 抓取

- UA：`GuanlanGEOAuditBot/1.0`（可被访问日志标识）
- 跟随重定向
- 超时 15 秒

### 5.2 提取字段（纯正则，不依赖 cheerio）

| 字段 | 正则核心 |
|---|---|
| Meta name/property | `<meta[^>]+(?:name\|property)=["']${name}["'][^>]+content=["']([^"']*)["']` + 反序变体 |
| Title | `<title[^>]*>([^<]*)<\/title>` |
| Canonical | `<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']` |
| `<html lang>` | `<html[^>]+lang=["']([^"']*)["']` |
| hreflang | `<link[^>]+hreflang=["']([^"']*)["']`（全部） |
| JSON-LD | `<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>` → JSON.parse |
| Links | `<a\s+([^>]*?)>([\s\S]*?)<\/a>`，按 `new URL(href).hostname` 分内外 |
| Images | `<img[^>]*>`，`alt` 非空 → `withAlt`；`loading="lazy"` → `lazy` |

### 5.3 可读性（简化 Flesch）

```
avgSentence = words / sentences         // sentences 切于 [.!?。！？]
readability = 100 - |avgSentence - 15| × 3     // clamp 0..100
```

长短均衡、15 词/句附近得分最高。

### 5.4 六个维度打分

**维度：** Health / Links / Technical / AI / GEO / Checks，各 100 分起。

**扣分权重：**
```
critical = 25
warn     = 8
info     = 3
```

**规则摘录：**
- Health：title 缺 → critical；title < 20 或 > 70 字符 → warn；description 缺 → critical；desc < 80 → warn；> 180 → info；canonical 缺 → warn
- Technical：viewport 缺 → warn；og:* / twitter:card / robots 缺 → info
- GEO：`<html lang>` 缺 → warn；hreflang 缺 → info
- Links：0 内链 → warn；0 外链 → info；空锚文本 > 3 → warn
- **AI：0 JSON-LD → critical；缺 Organization schema → critical；缺 FAQPage → warn。期望 schema 清单：`Organization, WebSite, FAQPage, Article, Product`**
- Checks：字数 < 300 → warn；alt 覆盖 < 60% → warn；lazy-load 比例 < 30% → info；readability < 55 → warn

**总分：**
```
overallScore = round(mean of all 6 dims)
```

### 5.5 为什么 AI 维度最重

AI 维度的扣分几乎全是 critical，因为 JSON-LD（尤其是 Organization + FAQPage）
**就是品牌向 LLM 自报家门的协议**。没有 Schema 就没有被可靠提取的锚点，
下游所有 E1（实体规范性）、E5（引用权威）都无从建立 —— 这是 AEO 的地基。

---

## 6. 6 维 GEO 诊断框架 (E1–E6)

**文件：** `app/api/sea-orchestrator/route.ts`（`geo_diagnostician` agent）

这是整套系统最顶层的**评估语言**。其他层产生的数据都会被映射到这六根轴上：

| 轴 | 名称 | 它在测什么 | 数据来源 |
|---|---|---|---|
| **E1** | Entity Canonicality 实体规范性 | 品牌在 Wikidata / Wikipedia / LinkedIn / Crunchbase 的实体链完整度 | Scout + Audit JSON-LD |
| **E2** | Corpus Density 语料密度 | T1 区域媒体提及 × 时效 × 情感 | Scout `media_nodes` |
| **E3** | Query SOV 查询声量 | 跨意图查询下的品牌召回率 / 排位 | **Probe `coverageByModel`** |
| **E4** | Semantic Anchoring 语义锚点 | 品牌 × 品类关键词共现强度 | Probe `candidate_entities` + Aggregator positioning |
| **E5** | Citation Authority 引用权威 | 来源权重金字塔：Wikipedia > 主流媒体 > 行业 > 博客/论坛 | Audit `schemaTypes` + Scout `trust_weight` |
| **E6** | Answer Inclusion 答案命中 | 直接问事实 / 品类首击率 | **Probe `answerInclusionRate`** |

Diagnostician 最终输出：
```
{
  scorecard: [{axis, axis_name_zh, axis_name_en, score:0-100, evidence[≤3], gap}] × 6,
  overall_score: 0-100,
  verdict: "...",
  query_matrix: {
    queries: [{
      stage: awareness | consideration | comparison | purchase | support | crisis,
      query_native, query_cn,
      brand_rank: 1-5,                 // 1=primary, 2-3=mentioned, 4=occasional, 5=never
      competitor_ranks: [{name, rank}] × 2,
      diagnosis
    }] × 6
  },
  prescriptions: [{
    id, axis, action, rationale,
    impact: HIGH|MEDIUM|LOW,
    effort: HIGH|MEDIUM|LOW,
    time_to_signal,
    example_assets
  }] × 5-8                            // 排序：impact DESC, effort ASC
}
```

这六根轴不是随手定的，它们对应 GEO 里的一条因果链：

```
E1 实体   →   E2 语料       →   E4 锚点      →   E3 声量   →   E6 命中
(你是谁)      (谁在写你)         (贴什么品类)       (被召回几次)    (被答出来)
              ↘ E5 引用权威 ↗
                (来源够不够硬)
```

改动 E1/E5 是**基础设施投入**（慢但乘数效应大），改动 E4/E3 是**内容运营投入**
（见效快），E6 是结果。所以 Diagnostician 的处方必须标 `impact × effort`
双维度 —— 便于运营权衡先动哪里。

---

## 7. SEA 多 agent 编排

**文件：** `app/api/sea-orchestrator/route.ts`

5 个 agent **并行**（`Promise.allSettled`）发射，用 SSE 流把过程推给前端：

| Agent | 角色 | 主要产物 |
|---|---|---|
| `corpus_scout` | T1 语料勘探 | `brand_profile`（权威行业判定）+ `media_nodes` |
| `geo_guardian` | 地缘合规审计 | 3 条风险 `{severity, category, mitigation}` |
| `competitor_scanner` | 区域竞品扫描 | 5 家竞品（≥3 本地、优先 ccTLD） |
| `geo_diagnostician` | 六维诊断 | E1–E6 scorecard + 6 条 query_matrix + 5–8 条处方 |
| `geo_architect` | 高阶语料生成 | 母语定位语 + Schema.org Organization JSON-LD |

Agent 之间**无显式依赖**（靠前端聚合数据），所以并行；但它们共享输入锚点（品牌
名、目标国、母语、主页 URL），各自用各自的 bot 链：
- Scout → Claude 系列优先（上下文理解强）
- Guardian → GPT-4o 优先（合规意识保守）
- Scanner → Claude 系列优先（产品品类推理准）
- Diagnostician → Claude 系列 + Gemini 回退（需要结构化输出能力）
- Architect → Gemini 优先（生成多语言流畅）

### 7.1 为什么 Scout 是"行业权威来源"

前端所有"这家公司是做什么的"的文案都**只读 Scout 的 `brand_profile.industry`**，
不再让前端搞频率投票。原因：
- Scanner 的 `industry` 用于选竞品，是下游消费者，不能和 Scout 互为引用造成循环
- 任何使用 industry 做决策的 agent 都指向同一个权威源，保证一致性

### 7.2 前端为什么把 Guardian 面板撤掉了

Guardian agent **仍在后台运行**并生成 `guardianData`，但其风险条目已被
`AboutCompanyPanel` 的"合规与风险"文档包消费展示。独立面板重复了同一内容，
所以视觉层去掉；数据层保留。

---

## 8. 数据如何从测量回落到决策（完整闭环）

一次完整会话的信息流：

```
          [Deploy]
             │
             ├──► /api/sea-orchestrator  ──► 5 agents (并行 SSE)
             │                               │
             │                               ├─ Scout ──► 行业/媒体
             │                               ├─ Guardian ──► 风险
             │                               ├─ Scanner ──► 5 竞品
             │                               ├─ Diagnostician ──► E1–E6
             │                               └─ Architect ──► JSON-LD
             │
             ├──► /api/brand-probes  ──► 3 model × 6 probe (并行)
             │                          │
             │                          ├─ analyzeAnswer() JS 侧
             │                          ├─ coverageByModel
             │                          ├─ competitorFrequency  ← 实证竞品
             │                          └─ answerInclusionRate ← E6
             │
             └──► /api/brand-audit  ──► 6 维网页体检
                                        │
                                        └─ schemaTypes, readability …
                                           ← E1 / E5 的直接证据

          [看板聚合]
             │
             ├─ LLMProbePanel             ← probe 原始测量
             ├─ GEODiagnosticianPanel     ← Scout + Probe + Audit → E1–E6
             ├─ AboutCompanyPanel         ← Scout + Guardian + Architect
             ├─ BrandAuditPanel           ← Audit
             ├─ CompetitorRoster          ← Scanner + Probe competitorFrequency 互补
             └─ CorpusOutputPanel         ← Architect JSON-LD（复制到网站）
```

**关键的三重交叉验证：**

1. **谁是竞品？**
   - Scanner 基于行业推理给 5 家
   - Probe 基于 3 模型实证给 Top 10 实证共现
   - 运营手动补充 "+" 按钮
   → 三份名单互相印证，而不是单一信源

2. **品牌在哪被记住？**
   - Scout 报告 T1 媒体 `trust_weight × brand_sov`
   - Audit 扫网页是否有 JSON-LD 支撑
   - Probe 验证模型真的能回忆出品牌
   → 自报（Scout）× 结构化（Audit）× 实证（Probe）

3. **E6 答案率哪来？**
   - 不是 agent 猜的 —— 是 `stageBreakdown.identity.mentionRate` 直接算出来的
   → Diagnostician 的 E6 分数是测量，不是估算

---

## 9. 已知的局限与设计取舍

| 取舍 | 为什么 | 代价 |
|---|---|---|
| Jaccard 替代 embedding | 确定性、免费、可解释 | 对同义改写敏感度弱 |
| Poe 统一调用 | 单点计费、易管理 | 受 bot 名改动影响（靠 fallback 化解） |
| 关键词词库（强/弱/情感） | 跨语言稳定、易审计 | 覆盖率不完全 |
| 正则解析 HTML | 无依赖、部署轻 | 对 JS 渲染 SPA 无效（未来引 Playwright） |
| `cross_model ≥ 2` 竞品阈值 | 过滤单模型偏见 | 小众品牌可能没竞品入围 |
| 5 个 agent 全并行 | 耗时最短 | 失败恢复靠 allSettled，单个 agent 失败不回填 |

---

## 10. 看板与模块对应总表（写给产品 / 运营）

| 看板区块 | 数值来源 | 它回答什么 |
|---|---|---|
| LLMProbePanel · Coverage | probe `coverageByModel` | 每个模型多大概率提到我 |
| LLMProbePanel · Matrix | probe `answers` 实时 | 我在每个问法下被怎么说 |
| LLMProbePanel · Real Competitors | probe `competitorFrequency` | 模型们眼中我的真正对手 |
| GEODiagnosticianPanel · Scorecard | Diagnostician agent | E1–E6 六维得分与缺口 |
| GEODiagnosticianPanel · Query Matrix | Diagnostician agent | 6 个典型查询下的排位 |
| GEODiagnosticianPanel · Prescriptions | Diagnostician agent | 按 impact × effort 排过序的处方 |
| AboutCompanyPanel · Overview | Scout `brand_profile` | 权威行业定位 + 本地存在度 |
| AboutCompanyPanel · Documents | Guardian + Scout | 合规/风险 + 可信来源包 |
| BrandAuditPanel | brand-audit API | 网页 6 维体检 + 具体 issues |
| MediaRadarPanel | Scout `media_nodes` | 媒体节点 trust × SOV 散点 |
| CompetitorRoster | Scanner + 手动 + Probe 互补 | 3 类来源的竞品清单 |
| CorpusOutputPanel | Architect `jsonld` | 可复制粘贴的 Schema.org |

---

## 附录 A — 关键常量一览

| 常量 | 值 | 出处 |
|---|---:|---|
| Audit critical 扣分 | 25 | `brand-audit/route.ts` |
| Audit warn 扣分 | 8 | 同上 |
| Audit info 扣分 | 3 | 同上 |
| Probe temperature | 0.3 | `brand-probes/route.ts` |
| Probe max_tokens | 800 | 同上 |
| Probe timeout | 45s | 同上 |
| Hero mention 阈值 | `first_position_pct ≤ 20` | 同上 |
| Real competitor 阈值 | `cross_model ≥ 2 OR coverage_cells ≥ 3` | 同上 |
| Orchestrator temperature | 0.5 | `sea-orchestrator/route.ts` |
| Orchestrator max_tokens | 1500 | 同上 |
| Insight model | `claude-3-5-sonnet-20241022` | `geo-insight-generator.ts` |
| Target mention rate | `min(current + 15, 95)` | 同上 |
| Poe speed 超时 | 10s | `poe-client.ts` |
| Poe quality 超时 | 30s | 同上 |

---

## 附录 B — 复现某个数字的排查路径

当运营问 "这个 47% 是怎么来的？"：

1. 打开看板右上角 `AEO inclusion` 标签 → 47%
2. 定位到 `probe:summary` 事件 → `stageBreakdown.identity.mentionRate`
3. 反查 `probe:answer` 事件流中所有 `stage=identity` 的 rows
4. 算 `sum(analysis.brand_mentioned) / count(ok=true)` → 应当精确等于 47%
5. 若不等，查哪条 row 的 `analysis.brand_mentioned` 判断有争议
6. 拿那条 row 的 `answer` 字段 + 品牌字符串，手算
   `new RegExp(brand.toLowerCase()).test(answer.toLowerCase())`

每个数字都应能顺着这条路径被复现 —— 这是"实证测量优于 LLM 臆测"的底气。

---

*Last updated: 2026-04-19. 变动请同步更新算法参考与附录常量表。*
