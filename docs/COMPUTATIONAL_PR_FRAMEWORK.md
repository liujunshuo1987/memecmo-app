# 计算公关 (Computational Public Relations) — 方法论框架

> 版本 v0.1 · 初稿 2026-04-20
> 本文档为"可计算公关"的第一性原理定义和指标规范。持续更新。

## 一、核心命题 (First Principle)

**公关的本质是"可受众感知的叙事市占率"。**

在大模型（LLM）成为信息中介的时代，受众感知不再只由搜索引擎决定，而是由训练语料、检索增强、模型推理三者叠加后的**模型输出**决定。

**可计算公关（Computational PR, CPR）** = 将品牌在 LLM 输出中的**被认知程度**转化为可重复测量的定量指标，并基于这些指标驱动内容、媒体、实体结构优化。

与传统 PR 的差异：
| 维度 | 传统 PR | 计算公关 |
|---|---|---|
| 衡量对象 | 媒体曝光量 (impressions) | LLM 答案中的实体召回 |
| 衡量方法 | 媒体剪报、AVE | 多模型探针 + 确定性算法 |
| 时间反馈 | 月/季 | 分钟级（实时探针） |
| 失败模式 | "报道了但没人看" | "模型没学到 / 没调出" |

## 二、五大核心指标

所有指标均为 **确定性可重现** — 相同输入产出相同输出，无 LLM 二次评分。LLM 仅作为**测量仪器**（生成答案），评分由算法完成。

### 1. KERA · Key Entity Recognition Accuracy（关键实体识别准确度）

**衡量**：当 LLM 描述品牌时，对品牌"事实性属性"的识别准确率。

**属性清单**（基线 7 项）：
1. 规范名称（`canonical_name`）— 与用户官方表述一致
2. 总部/发源地（`headquarters`）
3. 所属行业（`industry`）
4. 核心品类（`primary_category`）
5. 创立年份（`founded_year`）
6. 创始人（`founder`，如果有）
7. 目标市场定位（`target_market`）

**算法**：
```
KERA = Σ(attr_i 正确的模型数 / 总模型数) / |已测属性数|
```

每项属性的判定：
- 如果 LLM 答案中的字符串 N-gram 与 `ground_truth` 规范写法有 ≥0.6 字符级重合，或归一化后完全相等 → correct
- 未提及 → absent（不计入分母，除非在强制 probe 提问里）
- 提及但错误 → incorrect（计入分母，0 分）

**数据来源**：
- `ground_truth`：优先来自 `brand_audit.fields.schemaTypes` 中 JSON-LD 的 Organization 节点；其次用户填写。
- 测试问题：CPR 专用 probe 的 `identity` 阶段（如 "What is Brand X? Where are they based? When were they founded?"）

### 2. Citation Share（引用份额）— 位置加权 SOV

**问题**：简单 mention rate 把"第一名"和"第五名"等同对待，这在 AEO 里是错误的。

**定义**：在 LLM 对比/枚举类回答中，品牌占据位置 `rank_i` 的位置权重总和占**应得总权重**的比例。

**公式**（使用 Zipf-style 位置衰减）：
```
w(rank) = 1 / rank
CS_per_query = w(brand_rank) / Σ w(i) for i=1..N
CitationShare = mean(CS_per_query across all queries)
```

其中 `N` = 该答案里列举的实体总数。

**直观理解**：
- 第 1 名占全列 N=5 的权重 = 1/(1+1/2+1/3+1/4+1/5) ≈ **43.8%**
- 第 3 名占全列 N=5 的权重 ≈ **14.6%**
- 第 5 名 ≈ **8.8%**

**数据来源**：从 probe answer 里解析列表结构（编号列表、bullet、"first...second..." 等），调用 `extractRankings()`。

### 3. SPS · Sentiment Polarity Score（情感傾向性得分）

**定义**：品牌被提及时所在上下文的情感极性，`[-1, +1]`。

**实现层级**（按精度/成本递增，MVP 用 Lexicon）：
1. **词典法（MVP）**：多语种情感词典（en/zh/id/vi/th），加窗口扫描（品牌名 ±15 词）统计正负词加权和。
2. **嵌入相似度法**（后续）：sentence embedding vs 正向锚点句、负向锚点句的余弦差。
3. **LLM 评分法**（可选回退）：只有当前两层产出低置信度时才调用，且结果缓存。

**输出**：
```
SPS_overall = mean(polarity_i) across mentions
SPS_byModel = per-model breakdown
SPS_drift = max - min 跨模型（分歧度）
```

**警戒值**：`SPS_drift ≥ 0.6` 意味着某个模型认知偏负 — 值得深挖。

### 4. Value Proposition Consistency（核心价值主张一致度）

**定义**：多个 LLM 对"品牌独特价值"的表述是否收敛。

**算法**：
1. 对每个模型的 "What makes Brand X unique?" 类答案，抽取名词短语 + 动宾结构（`keyPhrases`）。
2. 计算跨模型 keyPhrases 的 **平均成对 Jaccard**。
3. VPC = `mean_pairwise_jaccard × 100`。

高 VPC = 全球语料已经有清晰共识；低 VPC = 价值主张叙事碎片化，需统一的 hero message。

### 5. Industry Position Alignment（行业地位对齐度）

**定义**：LLM 给出的竞品列表与用户/Scout 提供的官方竞品清单的重合度。

**算法**：
```
peer_set_llm = union(competitors mentioned by all models)
peer_set_truth = Scout T1 competitor list ∪ user-provided
IPA = |peer_set_llm ∩ peer_set_truth| / |peer_set_truth|
```

低 IPA = 模型把品牌归错档（"Apple" 被归为零售商而非科技品牌），是严重的 entity confusion 信号。

## 三、CPR 指标与 6 轴 AEO 的关系

CPR 指标不是替代 E1–E6，而是**深化**：

| AEO 轴 | CPR 深化指标 |
|---|---|
| E1 Entity Canonicality | **KERA**, **IPA** |
| E2 Corpus Density | **VPC**（多模型观点丰富度） |
| E3 Query SOV | **Citation Share**（位置加权版本） |
| E4 Semantic Anchoring | **Citation Share** 在决策阶段的分布 |
| E5 Citation Authority | 不直接深化（靠 Scout T1 交叉） |
| E6 Answer Inclusion | **SPS**（不仅包含，还要看情感） |

## 四、对首页"计算公关"承诺的映射

首页宣言：
> 链接大模型本身钩沉出企業的核心價值主張、產品優勢、行業地位等信息

映射：
| 首页承诺 | 对应指标 | 实现状态 |
|---|---|---|
| 核心价值主张 | VPC + Value Proposition Extraction | ✅ v0.1 |
| 产品优势 | Product Advantage Extraction（probe + keyPhrase） | ✅ v0.1 |
| 行业地位 | IPA（Industry Position Alignment） | ✅ v0.1 |
| 关键实体识别准确度 | **KERA** | ✅ v0.1 |
| 引用份额 | **Citation Share**（Zipf 加权） | ✅ v0.1 |
| 情感倾向性得分 | **SPS** | ✅ v0.1（lexicon）|

## 五、版本里程碑

### v0.1 (当前 · 2026-04-20)
- [x] KERA（N-gram 匹配）
- [x] Citation Share（Zipf 权重）
- [x] SPS（多语种 lexicon）
- [x] VPC（keyPhrase Jaccard）
- [x] IPA（peer set 交集）
- [x] Value Prop / Product Advantage / Peer extraction

### v0.2（计划中）
- [ ] KERA ground_truth 自动化（从 Wikipedia/Wikidata 抽取）
- [ ] SPS 升级到 embedding 相似度
- [ ] Citation Share 增加模态权重（mention vs recommend vs compare）
- [ ] 跨时间趋势（delta vs 上次探针）
- [ ] 竞品 CPR 同步测量 → CPR 相对位置

### v0.3（规划）
- [ ] 引入 retrieval-augmented 探针（不只测生成，也测 RAG 召回）
- [ ] "公关事件" 触发器（新闻爆发后触发即时探针 + 与基线对比）
- [ ] LLM "失忆检测"（事实属性随时间漂移的告警）

## 六、算法不变式（设计守则）

1. **确定性优先**：任何指标必须在相同输入下产出相同分数。LLM 只负责生成文本，不负责打分。
2. **数据来源可追溯**：每个分数必须能回溯到具体 probe answer ID + 文本片段。
3. **渐进退化**：当某数据源缺失（如 Scout 未跑）时，指标应退化而非崩溃，并标注 `PARTIAL`。
4. **跨语言同构**：英文、中文、越南文、印尼文、泰文 — 同一个算法给出可比较分数。
5. **可审计**：所有权重、窗口大小、阈值写在同一个 config 常量里，不散落在业务代码中。

---

相关文件：
- 实现：`lib/computational-pr.ts`
- 指标消费：`app/sea-command-center/page.tsx` → `ComputationalPRPanel`
- 算法变更日志：[GEO_AEO_ALGORITHM_LOG.md](./GEO_AEO_ALGORITHM_LOG.md)
