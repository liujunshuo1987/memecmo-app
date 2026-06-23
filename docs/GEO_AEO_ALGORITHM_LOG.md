# GEO/AEO 算法决策日志

> 追加式日志。每次算法或指标改动都追加一条。**不要**修改历史记录。
> 目的：让"为什么这个公式"、"为什么这个阈值"有可追溯的来源。

格式：
```
## YYYY-MM-DD · 作者/模块 · [NEW | CHANGE | DEPRECATE | FIX]
- 决策：...
- 动机：...
- 影响：...
- 回滚方案：...
```

---

## 2026-04-20 · AEO 6-axis scoring engine · [NEW]

- **决策**：把 6 轴 GEO 诊断从 LLM 自评改为确定性算法 + LLM 叙事注解。
- **公式初版**：
  - E1 = 0.4·cross_model_identity_jaccard + 0.3·schema_org + 0.3·native_language
  - E2 = 0.6·(1 − max_pairwise_answer_jaccard) + 0.4·min(wordCount/1500, 1)
  - E3 = probeSummary.overallMentionRate × 100
  - E4 = 0.6·mean(mention_rate on {awareness, consideration, comparison}) + 0.4·(100 − mean_first_position_pct)
  - E5 = 0.5·own_url_citation_rate + 0.5·T1_co_occurrence_rate
  - E6 = probeSummary.answerInclusionRate × 100
- **总分权重**：E3、E6 × 2（实测锚），其余 × 1。
- **动机**：之前 6 轴全是 LLM 脑补，无法审计、不稳定；且已经跑出来的 probe 数据被白白浪费。
- **影响**：`lib/aeo-scoring.ts` 新增；`GEODiagnosticianPanel` 显示 `MEASURED`/`PARTIAL` 徽章和 "show math" 展开面板。
- **回滚方案**：删除 `computeAEODiagnostic` 调用，`GEODiagnosticianPanel` 直接吃 LLM payload（历史行为）。

---

## 2026-04-20 · Computational PR metrics · [NEW]

- **决策**：在现有 probe 数据之上派生 5 个"计算公关"指标：KERA / Citation Share / SPS / VPC / IPA。
- **核心选择**：
  - **Citation Share** 使用 **Zipf 位置权重** `w(rank) = 1/rank`，而非线性权重。理由：LLM 输出中第一个被列出的选项被用户采纳的概率在实证研究里显示接近 Zipf 分布。
  - **SPS** 使用**多语种 lexicon** + 窗口 ±15 词做 MVP。LLM 评分回退仅用于低置信度样本。理由：避免"用 LLM 评分 LLM 输出"的循环论证。
  - **KERA** 使用**字符级 N-gram 相似度阈值 0.6**。理由：允许 "Apple Inc." 匹配 "Apple Inc"、"苹果公司" 匹配 "Apple (苹果)"，但拒绝 "Orange" 匹配 "Apple"。
- **动机**：首页"计算公关"承诺需要落到具体指标；单纯的 mention_rate 不够细粒度。
- **影响**：`lib/computational-pr.ts` 新增；GEO 诊断面板新增 "CPR" 标签。
- **回滚方案**：隐藏 CPR 标签；`computational-pr.ts` 是纯 lib，无副作用。
- **待定阈值**：
  - KERA 通过线 = 70（待实测调整）
  - SPS drift 警戒 = 0.6（跨模型情感分歧）
  - VPC 及格线 = 50（价值主张共识度）

---

## 2026-05-22 · 反转 canonical 域名: neurosparkmedia → neuronsparkmedia · [CHANGE]

- **决策**：把 canonical 域名从 `www.neurosparkmedia.com`（历史"少一个 n"域）反转为 `www.neuronsparkmedia.com`（与品牌名 "NeuronSpark" 拼写一致）。`neurosparkmedia.com` 现在变成 308 typo-catcher，与 2026-05-07 那次注册的方向**正好相反**。
- **动机** — 应用我们自己 6 轴评分的 E1 实体规范性原理到自己：
  - 站内 schema.org 19 块 + content 都写品牌名 = "NeuronSpark"（双 n）
  - 历史 canonical 域名 = "neurospark.com"（单 n）
  - LLM 引用时 brand name 和 URL 拼写不一致 → entity canonicality 置信度打折 → E1 损害
  - 之前在 /llms.txt 里写了"未来可能反转"的注脚——今天就是"未来"
- **触发**：用户让 Claude 审计自家站 GEO 情况时被指出（虽然审计还误诊了 SSR 和 schema.org 两项，但这一条是真问题）
- **代价**：
  - 1-3 个月 Google 重索引；现有 backlink 通过 308 保留
  - 用户需手动在 Google Search Console 提交 change of address
  - Supabase Site URL + Redirect URLs 需更新（OAuth 流程）
- **代码变动范围**：73 处 hardcoded URL 跨 12 文件，全部更新（除本日志的历史条目和当时真实发生的 redirect 描述）。
  - 8 文件盲替（schema 组件 / API UA 字符串 / robots.txt 等）
  - `next.config.js` redirect rule 方向交换
  - `public/llms.txt` 品牌段措辞调整
- **基础设施变动**（不在 git 内）：
  - Vercel project canonical domain 切换（dashboard）
  - Supabase Site URL: https://www.neurosparkmedia.com → https://www.neuronsparkmedia.com
  - Supabase Redirect URLs 白名单：add `https://www.neuronsparkmedia.com/**`（保留旧域 grace period 2 周）
  - Google Search Console: 添加新 property + 提交 change of address
- **回滚方案**：所有 sed 替换都可逆向跑（neuronsparkmedia → neurosparkmedia），next.config.js 的 redirect 规则再交换一次；Supabase Site URL 改回旧值。**但回滚 = 又一次 1-3 个月重索引，慎用**。
- **不变式更新**：今后任何新代码中**禁止**出现 `neurosparkmedia.com`（旧域），出现即视为 lint 错误。新 canonical 永远是 `https://www.neuronsparkmedia.com`。

---

## 2026-05-12 · 品牌语义定锚：观澜智库 = 观澜智能体库 · [NEW]

- **决策**：把"观澜智库"的隐含双关含义（智库 ↔ 智能体库）正式写入项目文档，作为后续多产品扩展的语义基础。
- **动机**：
  - 当前网站只是 GEO 产品智能体集，但"观澜智库"品牌容量远大于此
  - 第二个产品垂直即将上线（计算公关 / 东南亚情报）时需要明确的接口架构，避免被迫推倒重来
  - 自己做 GEO 业务，自己的智能体库本身必须先满足 GEO 可见性原则，否则反讽
- **文件**：`docs/GUANLAN_AGENT_LIBRARY.md`，含 6 章：
  1. 命名真实含义（智库/智能体库双关的有意性）
  2. 当前网页 vs. 完整智能体库（GEO 产品 5 个 agent → 多产品矩阵愿景）
  3. 智能体库接口架构（URL 拓扑、agent 身份 5 元组、agent vs. product 关系）
  4. GEO 友好参数（自适用 E1-E5 + `/.well-known/agents.json` 协议层）
  5. 三阶段实施路线
  6. 6 条设计不变式
- **关键架构决策**：
  - URL 拓扑分两层：`/agents/[slug]`（原子，机器/LLM 入口）vs. `/products/[slug]`（装配，用户入口）
  - Agent 身份 5 元组必填：purpose / inputs / outputs / knownLimits / costSignal —— 缺一不上线
  - 发布 `/.well-known/agents.json` 作为 LLM / MCP / 三方 directory 的发现协议
- **未提交的 UI 改动建议**（等用户确认）：
  - homepage hero 或 footer 加 ≤ 80 字段落："观澜智库（观澜智能体库），通过专业 LLM 智能体矩阵......"
  - 这能让首次访客和首次抓取的 LLM 都立刻学到"智库 = 智能体库"的桥接
- **回滚方案**：本文档为纯文档，删除即回滚。代码层尚未改动。

---

## 2026-05-07 · Brand-defense domain redirect (neuron → neuro) · [NEW]

- **决策**：新注册的 `neuronsparkmedia.com`（"neuron" 多一个字母 n，typo-catcher / 品牌防护备用域）做 308 永久重定向到规范域 `https://www.neurosparkmedia.com`，而非作为对等 alias 服务相同内容。
- **动机**：
  - 两个域名服务相同内容会被 Google 判 duplicate content，外链权重分散
  - typo 流量需要正确导回正版
  - canonical 集中 → 一处更新，全局生效
- **实现**：
  - `vercel domains add www.neuronsparkmedia.com`（apex 注册时已自动挂到 guanlan）
  - `next.config.js::redirects()` 加两条 host-matched 规则，匹配 apex 和 www，destination 用 `:path*` 通配以保 path/query 完整透传
  - 308 而非 301：Next.js `permanent: true` 默认发 308（保留 HTTP method），Google 文档明确视为 301 等价
  - DNS 走 `ns1/ns2.vercel-dns.com`（Vercel 注册域默认配置，无需手动改）
- **上线后实测**（部署 dpl_d7581f6）：

  | 入口 | 链路 | 终点 |
  |---|---|---|
  | `https://neuronsparkmedia.com` | 308 直达 | ✓ www.neurosparkmedia.com |
  | `https://www.neuronsparkmedia.com` | 308 直达 | ✓ www.neurosparkmedia.com |
  | `http://neuronsparkmedia.com` | 308→https→308 | ✓ www.neurosparkmedia.com |
  | `http://www.neuronsparkmedia.com` | 308→https→308 | ✓ www.neurosparkmedia.com |

  路径 + query 透传验证：`/founder?utm=test` → `https://www.neurosparkmedia.com/founder?utm=test` (200)
- **回滚方案**：删除 `next.config.js` 中两条 host-matched 重定向；`vercel domains rm www.neuronsparkmedia.com` 可解绑 www 子域。
- **注意事项**：
  - Vercel 注册的域名 `expiration_date = 2027-05-07`，到期前需 renew（年费 $11.25）
  - 若将来 `neuronsparkmedia.com` 要做独立站点，需先撤销这两条 redirect

---

## 2026-05-06 · Upstash Redis backend for rate limiter · [CHANGE]

- **决策**：把 `lib/api-guard.ts` 的限流后端从进程内 `Map` 升级为 Upstash Redis sliding-window（`@upstash/ratelimit`）。
- **实现**：
  - 安装 `@upstash/ratelimit` + `@upstash/redis`
  - `lib/api-guard.ts` 检测 `UPSTASH_REDIS_REST_URL/TOKEN` 或 `KV_REST_API_URL/TOKEN`（Vercel Marketplace 集成默认用后者命名）
  - 配置就用 Upstash；未配置回退内存（仅本地 dev 路径）
  - Upstash 调用失败时（网络抖动/限额）fail-open 回内存，避免把 503 透给用户
  - Response 增加 `X-RateLimit-Backend: upstash | memory` 头，让 verify 脚本能确认实际后端
  - `requireRateLimit` 改为 async（Upstash 是网络调用），更新 `brand-audit` `regional-audit` 两处 await
- **基础设施**：
  - 通过 Vercel Marketplace 安装 Upstash for Redis（`upstash-kv-bistre-fence` 资源），账户终端用户接受了 marketplace addendum / Upstash EULA / privacy
  - 集成把 5 个 env 自动注入：`KV_REST_API_URL` `KV_REST_API_TOKEN` `KV_REST_API_READ_ONLY_TOKEN` `KV_URL` `REDIS_URL`
- **上线后实测**（2026-05-06 部署 dpl_fh9wt461z）：
  - `scripts/verify-tiering.sh` 10/10 全部通过
  - 第 11 次 brand-audit 命中 429，`Retry-After: 243`，**`X-RateLimit-Backend: upstash`** ✓
  - 跨 lambda 实例计数共享，限流首次成为真正的全局上限
- **回滚方案**：把 `KV_REST_API_URL` / `KV_REST_API_TOKEN` 在 Vercel 上 unset → 代码自动退回内存模式；不需要改一行代码。

---

## 2026-05-04 · API access tiering · [NEW]

- **决策**：把 API 路由分为 PUBLIC 和 PROTECTED 两个等级；前端 SEA Command Center 维持公开访问，但高成本的 LLM 调用必须登录。
- **分级**：
  - **PUBLIC**（匿名 + IP 限流）
    - `/api/brand-audit` — 单页 HTML 审计 · 10 req / 5min / IP
    - `/api/regional-audit` — 多并发候选探嗅 · 6 req / 5min / IP
  - **PROTECTED**（要求 Supabase 登录 + 按 user_id 限流）
    - `/api/sea-orchestrator` — 多 agent 并行 Poe 调用 · 3 req / 10min / user
    - `/api/brand-probes` — 18 路并行 Poe SOV 探针 · 3 req / 10min / user
    - `/api/multi-model-query` — 已有 auth.getUser 校验，保留
- **实现**：
  - `lib/api-guard.ts` 新增 `requireRateLimit()` / `requireAuth()` / `requireAuthAndRateLimit()`
  - 限流器：进程内 sliding-window Map（per-instance）。Vercel 多实例下实际上限 = 配置 × 实例数。
  - 已知缺陷：冷启动后内存清空，限流复位。可接受作为成本一线防线；要严格全局限额需引入 Upstash Redis（见 Backlog）。
- **中间件改造**：
  - `middleware.ts` matcher 改为 catch-all（`/((?!api/|_next/|...).*)`），让所有 page 请求都进 middleware
  - 这样新增受保护页面只需要在 `lib/supabase/middleware.ts::protectedPaths` 加一行，**不再可能**因为忘配 matcher 而漏守
  - 历史白名单 matcher 是双层白名单陷阱（matcher 漏 → protectedPaths 配了也没用）
- **前端改动**：
  - `app/sea-command-center/page.tsx` 用 `useAuth()` 判断登录态
  - 未登录时 Deploy 按钮变灰链到 `/login?redirect=/sea-command-center`，鼠标提示 "登录后解锁完整探针"
  - 顶栏新增提示行：`Brand Audit · Regional AEO 匿名可用 · 多智能体 + 多 LLM 探针 需要登录`
- **删除**：`/audit` 孤儿页（功能已被首页 `<AIVisibilityScanner>` 内联组件替代；dashboard 内 3 处 `Link href="/audit"` 改为指向 `/sea-command-center`）
- **动机**：之前 SEA 指挥中心 + 两个高成本 API 完全公开 ≈ 任何人都能烧 Poe 配额；同时 `/dashboard` 显示的"配额已用 X/Y"和实际消耗脱钩（配额逻辑只对登录用户生效，但能跑分析的入口根本不查配额）。
- **验证清单**（已上线后跑）：
  - [ ] 未登录访问 SEA 指挥中心 → 看到提示行 + Deploy 按钮变灰
  - [ ] 未登录访问时点 Deploy → 跳到 `/login?redirect=/sea-command-center`
  - [ ] 未登录直接 POST `/api/brand-probes` → 401
  - [ ] 未登录直接 POST `/api/brand-audit` → 200（在 IP 限额内）
  - [ ] 同一 IP 5 分钟内调 `/api/brand-audit` 第 11 次 → 429 + `Retry-After`
  - [ ] 已登录用户 10 分钟内调 `/api/sea-orchestrator` 第 4 次 → 429 + per-user 限流
- **回滚方案**：
  - 想完全恢复匿名访问：删除 4 个 route 头部的 `requireAuthAndRateLimit` / `requireRateLimit` 调用即可
  - 想反向"完全锁仓"：把 `/sea-command-center` 加进 `protectedPaths`

### 上线后实测（2026-05-04 部署 dpl_jkg0vmyy1）
跑 `scripts/verify-tiering.sh https://www.neurosparkmedia.com`：
- ✓ `/api/brand-probes` `/api/sea-orchestrator` `/api/multi-model-query` 匿名 → 401
- ✓ `/api/brand-audit` `/api/regional-audit` 匿名 → 200
- ✓ `/sea-command-center` 公开 200，`/dashboard` 307 → /login，`/audit` 404
- ◐ **限流：行为依赖 Vercel lambda 调度**
  - 第一次跑（冷分散）：12 次 brand-audit 全部 200，限流没触发
  - 第二次跑（同 lambda 热缓存）：第 11 次 429 + `Retry-After: 279s`，公式正确

**结论**：
- auth 守卫本身（401）是可靠的——它走 Supabase cookie 校验，与内存无关
- 限流是"软上限"——同一 warm lambda 内严格生效；跨 lambda 实例失守。换言之，理论上限 = `配置 × 同时活跃的 lambda 实例数`
- 实际意义：可挡住 **同源单进程暴力刷请求**（脚本攻击、循环 bug）；**挡不住**真正的分布式或多 IP 滥用

**升级路径（提到 P0 backlog）**：换成 Upstash Redis（`@upstash/ratelimit`）做全局共享计数器。改动量约 30 行（替换 `lib/api-guard.ts` 的 `Map` 实现），需 2 个新 env：`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`。Upstash 免费额度 10K cmd/day，足够覆盖目前的流量。

---

## 2026-04-20 · Regional site discovery · [NEW]

- **决策**：增加 `/api/regional-audit` 端点，按目标国别自动找出品牌区域站点并做 AEO 体检。
- **流水线**：
  1. hreflang 权威抓取（优先）
  2. 按国别候选 URL 模式表生成猜测
  3. 并行 HEAD 请求验证可达性 + final_url 去 echo
  4. `regional_fit = 0.40·lang_match + 0.30·url_signal + 0.20·content_lang + 0.10·hreflang_source`
  5. `regional_fit ≥ 0.6` 入选，跑完整 brand-audit
- **动机**：之前审计只吃用户输入的一个 URL，对"全球站" vs "印尼站"没有区分，导致 E1/E2/E5 的语言保真度永远评不准。
- **影响**：新 API、新 lib、新 UI 面板。现有 `brand-audit` 不变（作为子程序被调用）。
- **回滚方案**：UI 面板隐藏；`/api/regional-audit` 不被调用时无副作用。
- **已知限制**：
  - 对 IP-redirect 型站（同一 URL 按 IP 渲染不同内容）无法从无头 fetch 里看到 real locale → 依赖 hreflang 声明
  - 山寨/代理商站点识别依赖 `sameAs` 反查，未实现 Wikidata 交叉验证

---

## 变更模板（复制用）

```
## YYYY-MM-DD · <模块> · [NEW | CHANGE | DEPRECATE | FIX]
- **决策**：
- **动机**：
- **影响**：
- **回滚方案**：
- **关联 PR / commit**：
```

---

## 待记录的议题（Backlog）

- [x] ~~**P0** · 把 `lib/api-guard.ts` 的内存限流换成 Upstash Redis~~（已完成 2026-05-06）
- [ ] SPS lexicon 在低资源语言（高棉语、缅甸语）覆盖率评估
- [ ] KERA 的 ground_truth 自动化抽取（Wikipedia/Wikidata）
- [ ] Citation Share 跨模型一致性的置信区间计算
- [ ] 区域站 hreflang 循环检测（hreflang 指向的 URL 是否反向声明？）
- [ ] 周期性探针 & 漂移检测（事实属性随时间的变化告警）
