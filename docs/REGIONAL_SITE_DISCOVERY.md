# 区域站点发现算法 (Regional Site Discovery)

> 版本 v0.1 · 2026-04-20

## 问题陈述

一个全球品牌对东南亚市场的 AEO/GEO 健康度，**不能**通过审计其全球主站（如 `apple.com`）来衡量。真正起作用的是：
- `apple.com/id/` 的印尼站
- `apple.com/vn/` 的越南站
- `apple.com.sg` 的新加坡站

AEO 视角下，**LLM 在回答 "印尼最好的智能手机品牌" 时引用的是哪个 URL**，决定了这个品牌在印尼市场的 AEO 表现。

因此，"AEO 体检" 必须是**区域化**的：针对目标市场定位最相关的区域站点，审计其本地化健康度。

## 一、第一性原理

一个区域站点 URL 在 AEO 里是否"有效"，看三个维度：

1. **可达性**：HTTP 200 返回，且不是全球主站的简单 301 重定向到同一内容。
2. **本地化真实性**：
   - `<html lang>` 或 `hreflang` 声明了目标地区语言
   - 实际内容以目标语言呈现（字数 > 阈值的目标语言文本）
3. **实体桥接**：该页面的 JSON-LD 应通过 `sameAs` 或 `parentOrganization` 链接回全球品牌实体，形成 entity graph 的连续性。

## 二、发现流水线

### Step 1 · 候选 URL 生成（离线、无网络调用）

输入：`(brand_homepage, target_country)` — 例：`(https://apple.com, "ID")`

按优先级生成候选：

**A. 子路径模式**（全球站的本地子目录）：
```
https://apple.com/id/
https://apple.com/en-id/
https://apple.com/id-id/
```

**B. 子域名模式**：
```
https://id.apple.com
https://apple.id  （ccTLD 变体）
```

**C. ccTLD 独立域**：
```
https://apple.co.id
https://apple.com.id
```

每个国家有一张**模式表**（见 `COUNTRY_URL_PATTERNS`），按偏好排序。

### Step 2 · hreflang 探嗅（一次网络调用）

抓取 `brand_homepage`，解析所有 `<link rel="alternate" hreflang="xx-YY">`。这是 W3C 规范的**权威发现机制** — 品牌自己声明了它在某地区的规范 URL。

hreflang 命中时，**绝对优先**于 Step 1 的猜测 URL。

### Step 3 · 候选审计（并行 HEAD → 条件 GET）

对每个候选 URL：
1. HEAD 请求，超时 5s
2. 记录 `http_status`、`final_url`（跟随重定向后的）、`content-length`
3. 如 `final_url` 与全球主站相同 → 标记为 **echo**（同一页伪装），不算独立区域站
4. 如 200 且 final_url 不同 → **valid candidate**，进入 Step 4

### Step 4 · 区域匹配评分

对每个 valid candidate：
```
regional_fit =
    0.40 · lang_match       (lang 与 COUNTRY_LANG[country].primary 匹配?)
  + 0.30 · url_signal       (URL 路径/域名里含 country code / 本地语言标识?)
  + 0.20 · content_lang     (全文字符分布检测 → 目标语言?)
  + 0.10 · hreflang_source  (是否来自 hreflang 声明?)
```

`regional_fit ≥ 0.6` → 视为该国的规范站点，进入完整 AEO 审计（调用现有 `/api/brand-audit`）。
多个候选达标时，取 `regional_fit` 最高者，其余作为"同站兄弟"登记。

### Step 5 · 区域 AEO 审计

对入选站点，运行标准 `brand-audit`，额外加 6 项区域性检查：

| 检查项 | 及格线 | 说明 |
|---|---|---|
| `html_lang_matches_country` | target_country.primary 匹配 | 最基础 |
| `hreflang_cluster_complete` | ≥3 个 hreflang 且含 `x-default` | 形成区域集群 |
| `json_ld_sameAs_links` | 至少一条指向品牌全球站 | entity bridge |
| `has_LocalBusiness_schema` | JSON-LD 包含 LocalBusiness | 地理锚定 |
| `has_address_local_format` | 含本地格式地址/电话 | 地理锚定 |
| `content_wordcount_native` | 目标语言字数 ≥ 300 | 内容真实 |

加权合成 `regional_aeo_score`（0–100）。

## 三、多语种/多国码映射表

```ts
{
  ID: { primary: ['id'],          tlds: ['co.id', 'id', 'com'],    pathHints: ['id', 'id-id', 'en-id'] },
  VN: { primary: ['vi'],          tlds: ['vn', 'com.vn'],          pathHints: ['vn', 'vi', 'vi-vn'] },
  TH: { primary: ['th'],          tlds: ['co.th', 'th'],           pathHints: ['th', 'th-th', 'en-th'] },
  MY: { primary: ['ms','en'],     tlds: ['com.my', 'my'],          pathHints: ['my', 'ms-my', 'en-my'] },
  SG: { primary: ['en'],          tlds: ['com.sg', 'sg'],          pathHints: ['sg', 'en-sg'] },
  PH: { primary: ['en','fil'],    tlds: ['com.ph', 'ph'],          pathHints: ['ph', 'en-ph'] },
  KH: { primary: ['km'],          tlds: ['com.kh', 'kh'],          pathHints: ['kh', 'km-kh'] },
  MM: { primary: ['my'],          tlds: ['com.mm', 'mm'],          pathHints: ['mm', 'my-mm'] },
  LA: { primary: ['lo'],          tlds: ['la'],                    pathHints: ['la', 'lo-la'] },
  BN: { primary: ['ms'],          tlds: ['com.bn'],                pathHints: ['bn'] },
}
```

## 四、边界情况

### Case 1 · 品牌只有全球站
hreflang 空、所有候选都重定向回主站。
→ 结论：**"该品牌在 `target_country` 没有官方本地站点"**
→ AEO 建议：建一个最小可行区域 landing（含 LocalBusiness + hreflang + 本地语言描述）

### Case 2 · 第三方分销商伪装
有时品牌在某国由代理商 `apple-dealer-id.com` 运营，URL 非官方所有。
→ 通过 JSON-LD 的 `sameAs` 检测是否指回官方；不指回 → 标记为 **"unofficial_local"**，AEO 视为弱信号。

### Case 3 · SPA 动态语言切换
如 `apple.com` 靠 JS 根据 IP 渲染不同语言。我们的无头 fetch 看到的是"服务器初始渲染"，可能是英文默认。
→ 检测 `<meta http-equiv="content-language">` 或 `<html lang>` 动态脚本占位符，退一步至 `hreflang` 声明。

### Case 4 · 拼写错误/山寨站
候选里出现高相似度的 `app1e.com` → URL 编辑距离检查，过滤。

## 五、实现映射

- `lib/regional-site-discovery.ts` · 纯逻辑：候选生成 + 评分 + 语言检测
- `app/api/regional-audit/route.ts` · 编排：hreflang 抓取 + 并行候选探嗅 + 最佳站点完整审计
- UI: `RegionalAEOPanel`（在 SEA 指挥中心右栏，位于 BrandAuditPanel 之上）

## 六、与 6 轴 AEO 诊断的接口

`regional-audit` 返回的 `regional_aeo_score` 和 `regional_fields` 会**取代**全局站的 `BrandAuditResult`，成为 E1、E2、E5 评分的主要数据源。

这样，当用户选择 `targetCountry = "ID"` 时，六轴诊断里的 E1 "native_language_fidelity" 实际检查的是**印尼站**的 `html lang`，不是全球站的英文。

## 七、测量效果

| 指标 | 目标 |
|---|---|
| 候选生成召回率 | 已知拥有本地站的品牌中，≥ 85% 被首轮候选命中 |
| hreflang 优先级正确 | 有 hreflang 时 100% 采用而非猜测 |
| 误判率（echo 识别） | < 5% |
| 审计耗时 | 总 < 12s（hreflang 2s + 候选并行 5s + 审计 5s）|

---

相关文件：
- 实现：`lib/regional-site-discovery.ts`, `app/api/regional-audit/route.ts`
- 框架：[COMPUTATIONAL_PR_FRAMEWORK.md](./COMPUTATIONAL_PR_FRAMEWORK.md)
- 变更日志：[GEO_AEO_ALGORITHM_LOG.md](./GEO_AEO_ALGORITHM_LOG.md)
