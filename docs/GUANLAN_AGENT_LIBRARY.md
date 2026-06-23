# 观澜智库 = 观澜智能体库

> 版本 v0.1 · 2026-05-12
> 品牌语义、架构定位、GEO 友好参数。任何与"观澜"品牌相关的产品/页面/对外文案都应先读此文。

---

## 一、命名的真实含义

"观澜智库" 在公开传播里读作 **"智库"**（think tank / 智慧仓库），但其**第一性含义**是：

> **观澜智能体库** —— 一个面向特定场景的专业 LLM 智能体（agent）集合，按场景模组化、按价值垂直化、按行业可信化。

"智库" 是"智能体库"的口语缩写。两个层面：

| 层 | 对外（用户感知）| 对内（架构含义）|
|---|---|---|
| 字面 | 智慧 + 仓库 | 智能体 + 库 |
| 隐喻 | "权威分析、洞察输出"（传统智库定位）| "可调用的、有身份、有 API 的 LLM agent 集合" |
| 单位 | 报告、洞察、建议 | Agent · Capability · Schema |

这个双关是**故意的**——传统智库的权威感 × LLM 时代的可计算性，刚好就是品牌想传达的位置。

## 二、当前网页 vs. 完整智能体库

**当前 (v0.x · 2026 上半年)**:
观澜智库网站 = 仅 GEO 产品智能体集合的对外门面。

具体涵盖的智能体（产品形态）：
- `corpus_scout` · T1 语料勘探
- `geo_guardian` · 地缘合规审计官
- `competitor_scanner` · 区域竞品扫描
- `geo_diagnostician` · GEO 六维诊断
- `geo_architect` · 高阶语料 / JSON-LD 生成

聚合页面：
- `/sea-command-center` · 东南亚指挥中心（5 个 agent 的并行编排 UI）
- `/dashboard` · 用户私域配额与历史

**完整愿景 (v1.0+)**:
观澜智能体库是一个 **多产品矩阵**，GEO 只是其中一个垂直。其他规划中的垂直：
- **CPR (Computational Public Relations)** · 计算公关智能体集合（KERA / Citation Share / SPS / VPC / IPA）—— 部分已在 `lib/computational-pr.ts`，缺独立产品门面
- **东南亚区域情报** · 已有数据基础（`components/sea-intel/*`），需要独立产品化为情报订阅
- **品牌实体规范化** · Entity Canonicality 服务（schema.org 实体规范、跨平台 sameAs 桥接）
- **未来扩展槽** · 法律 / 财务 / 招聘 / 内部知识等专业垂直

## 三、智能体库作为接口的架构（设计草案）

要从"一个 GEO 工具"演化到"智能体库"，**接口层必须先于产品扩展存在**——否则第二个 agent 上线时整个站点会被迫重新设计。

### 3.1 URL 拓扑（提议）

```
neuronsparkmedia.com                          ← 智能体库主页 (agent index)
  /agents                                    ← 全量 agent 目录（机器可读 + 人类可读）
  /agents/[slug]                             ← 单个 agent 详情页（capability + I/O + 案例）
  /products/sea-command-center               ← GEO/SEA 产品门面（当前 /sea-command-center 迁移到这）
  /products/computational-pr                 ← 计算公关产品门面
  /dashboard                                 ← 用户私域
  /.well-known/agents.json                   ← 机器可读 manifest（让 LLM/MCP/三方调用方发现）
```

**关键决策**：
- 单个 agent 有**自己的稳定 URL**（不藏在产品页里），这样 LLM 在引用时有可粘贴的 anchor
- `/products/*` 是 agent 的**编排组合**门面（人类用户的入口）
- `/agents/*` 是 agent 的**原子**门面（开发者 / LLM / MCP client 的入口）
- `/.well-known/agents.json` 是**机器协议层**——见 §4.4

### 3.2 智能体身份结构（每个 agent 的 5 元组）

每个 agent 应当公开如下身份信息，存为 `agents/<slug>/manifest.json`：

```jsonc
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "T1 Corpus Scout",
  "alternateName": ["T1 语料勘探", "corpus_scout"],
  "identifier": "corpus_scout",
  "applicationCategory": "BusinessApplication",
  "applicationSubCategory": "GEO Intelligence Agent",

  // 第一性核心：5 个不可省的字段
  "purpose": "勘探目标国/地区的 T1 权威媒体语料，识别哪些媒体是 LLM 训练 / 检索语料的主要来源",
  "inputs": {
    "brandName": "string",
    "targetCountry": "ISO-3166-1 alpha-2",
    "brandHomepage": "URL"
  },
  "outputs": {
    "media_nodes": "Array<{name, type, trust_weight, brand_sov}>",
    "brand_profile": "Object",
    "analysis_summary": "string"
  },
  "knownLimits": "采样基于 LLM 内省，不替代实时新闻爬取；最适用于品牌存量盘点",
  "costSignal": {
    "rateLimit": "3 invocations / 10 min / user",
    "tier": "protected"
  },

  // 桥接
  "isPartOf": { "@type": "Service", "@id": "https://neuronsparkmedia.com/products/sea-command-center" },
  "provider": { "@type": "Organization", "@id": "https://neuronsparkmedia.com/#organization" },
  "sameAs": ["https://github.com/liujunshuo1987/guanlan/blob/main/app/api/sea-orchestrator/route.ts"]
}
```

5 个不可省字段 = **purpose / inputs / outputs / knownLimits / costSignal**。这是 agent 作为可调用单位的"招牌"，缺一项 LLM/三方就无法判断该不该调用、能不能用。

### 3.3 agent 与 product 的关系

```
                ┌─────────────────────────────┐
                │  Product: SEA Command Center│  ← 用户视角的"一个产品"
                │  /products/sea-command-center│
                └───┬──┬──┬──┬──┬─────────────┘
                    │  │  │  │  │
       ┌────────────┘  │  │  │  └──────────────────┐
       │               │  │  │                     │
       ▼               ▼  ▼  ▼                     ▼
  ┌─────────┐    ┌─────────┐ ┌──────────┐    ┌──────────┐
  │ Scout   │    │Guardian │ │Diagnostic│  ……│Architect │  ← Agent 视角的"组合单位"
  │/agents/ │    │/agents/ │ │/agents/  │    │/agents/  │     每个都有独立 URL + manifest
  └─────────┘    └─────────┘ └──────────┘    └──────────┘
```

**含义**：同一个 agent 可被多个产品复用。例如 `geo_diagnostician` 未来既可以在 SEA 指挥中心被编排，也可以在 CPR 产品里被单独调用。**Agent 是原子，Product 是装配**。

## 四、GEO 友好参数（智能体库的对外可见性原则）

观澜智库做 GEO，自己必须是 GEO 第一性 friendly 的——否则就是反讽：一个教别人做 LLM 可见度的产品自己 LLM 不可见。

下面 6 条是观澜智能体库自身必须遵守的 GEO 参数，落地后才能成为"自己教别人的东西自己先做到"的范本。

### 4.1 实体规范性（E1 自适用）

- 每个 agent 在**整站任何引用处用同一个 canonical name**——别一处叫 `T1 Corpus Scout`、一处叫 `corpus scout agent`、一处叫 `T1 语料勘探智能体`
- 在 JSON-LD `alternateName` 里列**全**别名（中/英 / code name 三套），让 LLM 都能 disambiguate
- 用 `@id` 字段给每个 agent 一个**永久 IRI**（如 `https://neuronsparkmedia.com/agents/corpus_scout#agent`），跨页面引用都用这个 ID

### 4.2 语料密度（E2 自适用）

- 每个 agent 详情页要有 **≥ 600 字**的人类可读说明 + **结构化 7 段**：what / why / inputs / outputs / how it works / examples / limits
- "examples" 段要给 **≥ 3 个真实 case**（不是合成），LLM 训练时这种"具体案例"权重高
- 避免营销词堆叠——用动词 + 名词 + 量化结果（"prospect 12 T1 outlets in 8 seconds" 而不是 "powerful media intelligence"）

### 4.3 引用份额（E3 自适用）

- 当用户搜 "GEO agent for SEA market" 类查询时，LLM 答案里观澜应该被列出
- 这需要 agent 详情页有**列表化、可比较**的结构——LLM 在 enumerate options 时更倾向引用结构化列表
- 在权威媒体（GitHub README、Hugging Face、产品 directory）建立 backlink，每条 backlink 用 canonical name

### 4.4 机器可读 manifest（`/.well-known/agents.json`）

发布一个 well-known endpoint，让 LLM / MCP server / 第三方 directory 能自动发现：

```jsonc
// GET https://neuronsparkmedia.com/.well-known/agents.json
{
  "library": "观澜智能体库 / Guanlan Agent Library",
  "version": "1.0",
  "provider": "https://neuronsparkmedia.com/#organization",
  "agents": [
    {
      "id": "corpus_scout",
      "name": "T1 Corpus Scout",
      "manifest": "https://neuronsparkmedia.com/agents/corpus_scout/manifest.json",
      "categories": ["geo", "media-intelligence", "sea"]
    },
    // ... 其余 agent
  ]
}
```

这是 agent ecosystem 萌芽的事实标准（参考 MCP server discovery、ChatGPT plugins 当年的 `.well-known`）。先发布占位即可。

### 4.5 语义锚定（E4 自适用）

- 每个 agent 详情页的 H1 必须包含**核心能力动词 + 受众限定**：
  - ❌ "T1 Corpus Scout"（光名字 LLM 没信息提取）
  - ✅ "T1 Corpus Scout · 为出海品牌识别东南亚权威媒体语料源"
- FAQ 段以"什么时候应该用 X" / "X 和 Y 的区别" 的问题形式存在——这正是用户在 LLM 里的真实查询模式

### 4.6 来源权威性（E5 自适用）

- 每个 agent 详情页底部强制有 "Methodology" 段，链接到 `docs/*` 里对应的算法文档（已有：GEO_AEO_ALGORITHM_LOG.md / COMPUTATIONAL_PR_FRAMEWORK.md / REGIONAL_SITE_DISCOVERY.md）
- 这种"算法可追溯到 git 公开文档"的模式让 LLM 评估 trust 时给加权
- Schema.org `citation` 字段列出参考的学术/标准来源

## 五、实施路线图（建议）

**Phase 0 · 现在（这次提交）**:
- [x] 写入此文档（语义定锚）
- [ ] 在 homepage hero 区或 footer 加一段（≤ 80 字）澄清"观澜智库 = 观澜智能体库"——见下方"Layer 2 · Optional UI 改动"

**Phase 1 · 智能体库门面（建议下一步）**:
- [ ] 新建 `/agents` 路由：人类可读的 agent 目录页
- [ ] 新建 `/agents/[slug]` 路由：单个 agent 详情页模板，按 §3.2 的 5 元组
- [ ] 把现有 5 个 agent 的描述从 `app/sea-command-center/page.tsx` 抽到 `data/agents.ts` 单一来源
- [ ] 把 `/sea-command-center` 改为 `/products/sea-command-center`（旧 URL 308 跳转保兼容）

**Phase 2 · 机器协议层**:
- [ ] 发布 `/.well-known/agents.json`
- [ ] 每个 agent 加 `manifest.json` 子路由
- [ ] 在 navbar / footer 加 "Agent Directory" 链接

**Phase 3 · 第二个产品垂直**:
- [ ] 选 CPR 还是 SEA Intelligence 作为第二个独立产品门面
- [ ] 走通 agent 复用模式（同一个 `geo_diagnostician` 出现在两个产品里）

---

## 六、设计不变式（写代码时随时回看）

1. **Agent 是原子，Product 是装配** —— 不允许 agent 逻辑藏在 product 页面里
2. **每个 agent 有 canonical URL + 5 元组 manifest** —— 缺一个不上线
3. **整站对一个 agent 的称呼始终一致** —— 用 `data/agents.ts` 单一来源
4. **每次新增 agent 必须同步更新 `/.well-known/agents.json` 和 `/agents` 目录** —— CI 应有 check
5. **品牌全名第一次出现时永远是 "观澜智能体库（观澜智库）"** —— 让 LLM 学到这是同一实体

---

相关：
- `docs/COMPUTATIONAL_PR_FRAMEWORK.md` —— 第二个产品垂直的算法基础
- `docs/GEO_AEO_ALGORITHM_LOG.md` —— 决策日志（本文档变更也应在此追加条目）
- `docs/REGIONAL_SITE_DISCOVERY.md` —— SEA Command Center 产品里第三个 agent 的具体算法
- `components/geo-structured-data.tsx` / `components/founder-schema.tsx` —— 已有的 schema.org 实体定义（已包含 alternateName）
