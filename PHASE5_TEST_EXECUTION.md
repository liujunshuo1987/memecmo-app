# Phase 5 测试执行指南

## ✅ 预检查结果

**文件完整性验证:** ✅ 通过
```
- 数据库迁移文件: ✅ 存在 (3.7 KB)
- Brand Home 页面: ✅ 存在 (308 行, 12 KB)
- Answer Dashboard 页面: ✅ 存在 (527 行, 17.5 KB)
- API 端点: ✅ 10 个端点文件存在
- TypeScript 导入: ✅ 所有导入有效
```

**数据库表:**
- ✅ `brand_analyses` - 中央聚合表
- ✅ `brand_analysis_history` - 历史追踪表

---

## 🚀 完整测试流程

### 第一步：环境准备

#### 1.1 启动开发服务器

```bash
cd /Users/sx/Downloads/09_GEO企业出海/guanlan
npm run dev
```

**预期输出:**
```
> next dev
▲ Next.js 15.x.x
- Local:        http://localhost:3000
- Environments: .env.local
```

⏱️ 等待直到看到 "ready - started server on 0.0.0.0:3000"

---

#### 1.2 打开新终端应用数据库迁移

```bash
# 在新的终端窗口
cd /Users/sx/Downloads/09_GEO企业出海/guanlan
supabase db push
```

**预期输出:**
```
Applying migration 20260418_create_brand_analyses_aggregation.sql
✓ Finished `db push`
```

✅ 如果出错，参考"常见问题"部分

---

### 第二步：浏览器测试

#### 2.1 打开浏览器并登录

```
访问: http://localhost:3000/brand-home
```

1. 如果看到登录页面，请登录
2. 登录后自动重定向到 Brand Home

**验证:**
- [ ] 页面标题显示 "Brand Intelligence"
- [ ] 页面加载时间 < 2 秒
- [ ] 没有控制台错误（F12 打开 DevTools → Console）

---

#### 2.2 验证 Brand Home 页面

**预期看到:**
```
┌─────────────────────────────────────┐
│  Brand Intelligence              │
│  Analyze your brands with GEO      │
│                           [New Brand] │
├─────────────────────────────────────┤
│  Your Brands (X)  │  Recent Analyses │
│                   │                  │
│ [Brand Card 1]    │ [Analysis 1]    │
│ - Analyze Btn     │ [Analysis 2]    │
│ - View Dashboard  │                  │
│                   │                  │
│ [Brand Card 2]    │                  │
│ - Analyze Btn     │                  │
│ - View Dashboard  │                  │
└─────────────────────────────────────┘
```

**检查项:**
- [ ] "Your Brands" 显示品牌列表
  - [ ] 品牌名称正确显示
  - [ ] 行业信息显示（如有）
  - [ ] 网站URL显示
  - [ ] 关键词标签显示
- [ ] "Recent Analyses" 显示最近的分析
  - [ ] 分析名称显示
  - [ ] 状态 Badge 显示
  - [ ] Consensus Score 显示（如果完成）
- [ ] 每个品牌卡片有两个按钮：
  - [ ] "View Dashboard" - 链接到 Answer Dashboard
  - [ ] "Analyze" - 启动新分析

---

#### 2.3 点击 "Analyze" 按钮发起新分析

```
1. 点击任意品牌的 "Analyze" 按钮
2. 页面应自动重定向到 Answer Dashboard
3. URL 变为: http://localhost:3000/answer-dashboard/[brand-id]
```

**预期看到:**
```
重定向到 Answer Dashboard 并显示：
- 品牌名称作为标题
- 分析状态 Badge (status: "analyzing")
- Consensus Score 显示（如果有数据）
- 8个标签页
```

⏱️ 重定向应该在 1-2 秒内完成

---

#### 2.4 验证 Answer Dashboard 页面

**URL:** http://localhost:3000/answer-dashboard/[任意-brand-id]

**检查项:**

1. **顶部头部区域:**
   - [ ] 品牌名称显示
   - [ ] 品牌行业显示
   - [ ] 分析状态 Badge 显示
   - [ ] Consensus Score 显示（右上角）

2. **标签页导航:**
   应该看到 8 个标签页：
   - [ ] ◼ Overview (图表图标)
   - [ ] 💬 Responses (消息图标)
   - [ ] 📈 Consensus (趋势图标)
   - [ ] ⚡ GEO Insights (闪电图标)
   - [ ] 🎯 Market (目标图标)
   - [ ] 👥 Competitors (用户图标)
   - [ ] 💡 Content (灯泡图标)
   - [ ] 📊 History (历史图标)

3. **Overview 标签页 (默认打开):**
   - [ ] 显示 3 个指标卡片：
     1. "Consensus Score" - 显示百分比
     2. "Brand Mention Rate" - 显示百分比
     3. "GEO Score" - 显示百分比
   - [ ] 卡片显示清晰，无格式错误
   - [ ] 页面加载时间 < 3 秒

4. **切换标签页:**
   点击每个标签页，验证内容更新：
   - [ ] Responses 标签页 - 显示 LLM 响应信息
   - [ ] Consensus 标签页 - 显示共识分析
   - [ ] GEO Insights 标签页 - 显示优化建议
   - [ ] Market 标签页 - 显示市场情报
   - [ ] Competitors 标签页 - 显示竞争分析
   - [ ] Content 标签页 - 显示内容优化
   - [ ] History 标签页 - 显示分析历史

✅ **标签页切换应该 < 500ms**

---

### 第三步：API 端点测试

#### 3.1 获取认证信息

```bash
# 在浏览器中：
# 1. F12 打开 DevTools
# 2. 进入 Application/Storage → Cookies
# 3. 找到 auth-related cookie（通常是 sb-auth-token 或类似）
# 4. 复制其值

# 或者从 DevTools → Network 标签查看请求头中的 Authorization token
```

#### 3.2 测试 API 端点

**使用 curl 或 Postman 测试以下端点：**

**Test A: 获取品牌列表**
```bash
curl -X GET http://localhost:3000/api/brands \
  -H "Content-Type: application/json"
```

**预期响应 (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-here",
      "name": "Brand Name",
      "website_url": "https://...",
      "industry": "AI/SaaS/etc",
      "target_keywords": ["key1", "key2"],
      "created_at": "2026-04-18T...",
      "updated_at": "2026-04-18T..."
    }
  ]
}
```

✅ 检查:
- [ ] Status Code: 200
- [ ] Response format: JSON
- [ ] 数据包含多个品牌

---

**Test B: 获取最近分析**
```bash
curl -X GET "http://localhost:3000/api/analyses/recent?limit=10" \
  -H "Content-Type: application/json"
```

**预期响应 (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "analysis-uuid",
      "brand_id": "brand-uuid",
      "analysis_name": "GEO Analysis - Apr 18",
      "status": "completed|analyzing|pending",
      "consensus_score": 78.5,
      "brand_mention_rate": 85.0,
      "overall_geo_score": 72.3,
      "created_at": "2026-04-18T...",
      ...
    }
  ]
}
```

✅ 检查:
- [ ] Status Code: 200
- [ ] 返回分析列表（可能为空）
- [ ] 分析包含所有必要字段

---

**Test C: 发起新分析（关键测试）**

```bash
# 首先获取任意品牌的ID（从Test A获取）
BRAND_ID="[从上面获取的UUID]"

curl -X POST http://localhost:3000/api/analyze-brand-complete \
  -H "Content-Type: application/json" \
  -d "{
    \"brandId\": \"$BRAND_ID\",
    \"analysisName\": \"GEO Analysis - Apr 18\",
    \"targetModels\": [\"gpt-4\", \"claude-opus\", \"gemini-pro\"],
    \"language\": \"en\"
  }"
```

**预期响应 (200):**
```json
{
  "success": true,
  "analysisId": "new-analysis-uuid",
  "message": "Analysis initiated. Results will be available shortly."
}
```

✅ 检查:
- [ ] Status Code: 200
- [ ] Response 包含 analysisId
- [ ] analysisId 是有效的 UUID 格式

---

**Test D: 获取分析详情**

```bash
# 使用上面获得的 analysisId
ANALYSIS_ID="[从Test C获取]"

curl -X GET "http://localhost:3000/api/analyses/$ANALYSIS_ID" \
  -H "Content-Type: application/json"
```

**预期响应 (200):**
```json
{
  "success": true,
  "data": {
    "id": "[ANALYSIS_ID]",
    "brand_id": "[BRAND_ID]",
    "status": "analyzing",
    "analysis_name": "GEO Analysis - Apr 18",
    "consensus_score": null,  // 初期可能为空
    "analysis_metadata": {
      "questions": [...],
      "models": ["gpt-4", "claude-opus", "gemini-pro"],
      ...
    },
    "created_at": "2026-04-18T...",
    ...
  }
}
```

✅ 检查:
- [ ] Status Code: 200
- [ ] Status 为 "analyzing"
- [ ] analysis_metadata 包含问题列表

---

**Test E: 对比分析**

```bash
# 需要至少2个分析ID
ANALYSIS_ID_1="[第一个分析]"
ANALYSIS_ID_2="[第二个分析（或同一个两次）]"

curl -X POST http://localhost:3000/api/compare-analyses \
  -H "Content-Type: application/json" \
  -d "{
    \"analysisIds\": [\"$ANALYSIS_ID_1\", \"$ANALYSIS_ID_2\"]
  }"
```

**预期响应 (200):**
```json
{
  "success": true,
  "data": {
    "brandId": "...",
    "analysisCount": 2,
    "timeRange": {
      "earliest": "2026-04-18T...",
      "latest": "2026-04-18T..."
    },
    "trends": {
      "consensusScore": {
        "values": [78.5, 82.3],
        "trend": "improving"  // "improving" | "declining" | "stable"
      },
      ...
    },
    "improvements": {
      "consensusScoreChange": 3.8,
      ...
    }
  }
}
```

✅ 检查:
- [ ] Status Code: 200
- [ ] 趋势数据正确计算
- [ ] 改进指标显示

---

### 第四步：完整端到端流程验证

**完整场景测试:**

```
┌─────────────────────────────────────────┐
│  步骤 1: Brand Home                   │
│  • 访问 http://localhost:3000/brand-home │
│  • 查看品牌列表                          │
│  ✅ 验证页面加载 < 2s                     │
└─────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  步骤 2: 发起分析                       │
│  • 点击品牌卡片的 "Analyze" 按钮         │
│  • 后台 API 调用 /analyze-brand-complete  │
│  ✅ 验证重定向 < 1s                       │
│  ✅ 验证返回 analysisId                   │
└─────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  步骤 3: Answer Dashboard                │
│  • 自动重定向到 /answer-dashboard/[id]    │
│  • 显示分析状态: "analyzing"              │
│  ✅ 验证 8 个标签页都显示                  │
│  ✅ 验证页面加载 < 3s                     │
└─────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  步骤 4: 后台处理                       │
│  • 浏览器 DevTools → Network 观察         │
│  • 应该看到 /api/multi-model-query 调用   │
│  • 然后是 /aggregate-responses           │
│  • 然后是 /generate-geo-insights         │
│  ✅ 验证后台流程被触发                    │
│  ✅ 验证状态逐步更新                      │
└─────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│  步骤 5: 验证数据完整性                  │
│  • 刷新页面                              │
│  • Overview 标签页显示实际的分数          │
│  • 其他标签页有适当的数据                │
│  ✅ 验证所有数据正确聚合                  │
│  ✅ 验证 RLS 隔离正常工作                 │
└─────────────────────────────────────────┘
```

---

## 🔍 诊断技巧

### 打开 DevTools 查看详细信息

```
F12 或 Cmd+Option+I (Mac)
```

**Console 标签页:**
- 查看 JavaScript 错误
- 查看 console.log 输出

**Network 标签页:**
- 监控 API 调用
- 查看请求/响应
- 检查 auth headers

**Application 标签页:**
- 查看 LocalStorage（登录状态）
- 查看 SessionStorage
- 查看 Cookies

### 服务器日志

在运行 `npm run dev` 的终端查看：
- [Analysis {id}] 前缀的日志表示后台工作流
- 任何错误信息都会显示

### 查看数据库

```bash
# 查看 brand_analyses 表中的数据
supabase db remote set logs

# 或使用 Supabase Dashboard
# 登录 https://supabase.com → 选择项目 → SQL Editor
SELECT * FROM brand_analyses LIMIT 10;
SELECT * FROM brand_analysis_history LIMIT 10;
```

---

## 🚨 如果遇到问题

**问题 1: 页面显示空白**
- [ ] 检查浏览器 console 中是否有错误
- [ ] 查看网络标签中的 API 调用是否失败
- [ ] 验证是否已登录

**问题 2: API 返回 401**
- [ ] 确保已登录
- [ ] 检查是否有有效的 auth token
- [ ] 尝试刷新页面重新登录

**问题 3: 分析卡在 "analyzing" 状态**
- [ ] 检查服务器日志中是否有错误
- [ ] 验证 Poe API key 配置
- [ ] 检查后台工作流是否被触发

**问题 4: 数据库迁移失败**
- [ ] 运行 `supabase db remote set logs` 查看详细错误
- [ ] 检查迁移文件语法
- [ ] 确保 Supabase 连接正常

---

## ✅ 最终验收清单

完成以下所有检查才能认为 Phase 5 通过：

**页面加载:**
- [ ] Brand Home 加载成功且显示品牌列表
- [ ] Answer Dashboard 加载成功且显示 8 个标签页
- [ ] 没有明显的 JavaScript 错误

**API 功能:**
- [ ] GET /api/brands 返回品牌列表
- [ ] GET /api/analyses/recent 返回分析列表
- [ ] POST /api/analyze-brand-complete 成功创建分析
- [ ] GET /api/analyses/[id] 返回分析详情

**用户流程:**
- [ ] 能够从 Brand Home 导航到 Answer Dashboard
- [ ] 能够点击 "Analyze" 按钮启动新分析
- [ ] 分析能够在后台处理（观察网络活动）
- [ ] Answer Dashboard 正确显示分析结果

**数据完整性:**
- [ ] brand_analyses 表有数据
- [ ] 所有必要的字段都有值
- [ ] RLS 策略正常工作（用户只能看到自己的数据）

---

**如果所有检查都通过，恭喜！Phase 5 验证成功！** 🎉

**下一步:** 进入 Phase 6 - 测试和优化

