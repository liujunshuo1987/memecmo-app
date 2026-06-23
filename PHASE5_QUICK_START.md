# Phase 5 快速开始指南

## 🚀 立即开始

### 1. 部署数据库迁移

```bash
# 应用数据库迁移
supabase db push

# 验证tables已创建
supabase db list
```

### 2. 验证新pages和APIs

```bash
# 启动开发服务器
npm run dev

# 在浏览器中测试
http://localhost:3000/brand-home      # Brand Home页面
http://localhost:3000/answer-dashboard/[任意-brand-id]  # Answer Dashboard
```

### 3. 测试API端点

使用curl或Postman测试（需要先登录获取auth token）：

```bash
# 获取品牌列表
curl http://localhost:3000/api/brands

# 获取单个品牌
curl http://localhost:3000/api/brands/[brandId]

# 获取最近分析
curl http://localhost:3000/api/analyses/recent

# 发起新分析
curl -X POST http://localhost:3000/api/analyze-brand-complete \
  -H "Content-Type: application/json" \
  -d '{
    "brandId": "[brandId]",
    "analysisName": "GEO Analysis - Apr 18",
    "targetModels": ["gpt-4", "claude-opus", "gemini-pro"],
    "language": "en"
  }'
```

---

## 📋 核心组件清单

### 已实现的页面
- ✅ `/app/brand-home/page.tsx` - 品牌主页
- ✅ `/app/answer-dashboard/[brandId]/page.tsx` - 答案仪表板（8标签页）

### 已实现的API端点
- ✅ `GET /api/brands` - 品牌列表
- ✅ `GET /api/brands/[brandId]` - 单个品牌
- ✅ `GET /api/brands/[brandId]/latest-analysis` - 最新分析
- ✅ `GET /api/brands/[brandId]/analysis-history` - 分析历史
- ✅ `GET /api/analyses/[analysisId]` - 分析详情
- ✅ `GET /api/analyses/recent` - 最近分析
- ✅ `POST /api/analyze-brand-complete` - 启动完整分析
- ✅ `GET /api/get-brand-analysis/[brandId]` - 获取完整分析
- ✅ `POST /api/compare-analyses` - 对比分析

### 已实现的数据库表
- ✅ `brand_analyses` - 中央聚合表
- ✅ `brand_analysis_history` - 分析历史追踪

---

## 🔍 测试场景

### 场景 1: Brand Home 基础功能
```
1. 访问 /brand-home
2. 验证品牌列表加载
3. 点击任意品牌的 "Analyze" 按钮
4. 验证重定向到 /answer-dashboard/[brandId]
5. 验证分析状态为 "analyzing"
```

### 场景 2: Answer Dashboard 基础功能
```
1. 访问 /answer-dashboard/[任意-brand-id]
2. 验证8个标签页都显示：
   - Overview
   - LLM Responses
   - Consensus & Divergence
   - GEO Insights
   - Market Intelligence
   - Competitor Analysis
   - Content Optimization
   - History & Trends
3. 切换不同标签页，验证内容正确更新
4. 查看右上角的Status Badge和Consensus Score
```

### 场景 3: API 完整流程
```
1. GET /api/brands → 获取所有品牌
2. POST /api/analyze-brand-complete → 创建新分析
3. 获得 analysisId
4. GET /api/analyses/[analysisId] → 查看分析详情（初期状态: analyzing）
5. 等待后台处理完成
6. GET /api/get-brand-analysis/[brandId] → 查看完整分析（包括关联数据）
```

### 场景 4: 分析历史对比
```
1. 创建第一个分析
2. 等待完成
3. 创建第二个分析（修改后的品牌信息）
4. 等待完成
5. GET /api/brands/[brandId]/analysis-history → 查看历史
6. POST /api/compare-analyses → 对比两个分析
7. 查看趋势：改进/下降/稳定
```

---

## 🔧 调试技巧

### 1. 查看浏览器控制台
```
Open DevTools (F12) → Console
查看任何错误信息
```

### 2. 查看Network标签
```
Open DevTools → Network
观察API调用和响应
确保认证token被正确传递
```

### 3. 查看Supabase数据
```
登录 supabase.com
选择你的项目
查看 brand_analyses 表中的数据
验证RLS策略是否工作
```

### 4. 查看日志
```
npm run dev 窗口中查看服务器日志
查看 [Analysis {id}] 前缀的日志
了解后台工作流执行情况
```

---

## 🎯 验收标准

### Phase 5 完成标准

**数据库**
- [ ] brand_analyses 表成功创建
- [ ] brand_analysis_history 表成功创建
- [ ] RLS 策略生效
- [ ] 所有索引创建成功

**Brand Home 页面**
- [ ] 页面加载 < 2秒
- [ ] 品牌列表正确显示
- [ ] 最近分析面板显示最多10条
- [ ] "Analyze" 按钮正常工作
- [ ] 响应式设计工作正常（mobile/tablet/desktop）

**Answer Dashboard**
- [ ] 页面加载 < 3秒
- [ ] 8个标签页都能渲染
- [ ] 标签页切换流畅（无闪烁）
- [ ] 数据正确显示
- [ ] 状态Badge正确显示
- [ ] Consensus Score准确显示

**API 端点**
- [ ] 所有端点都能响应200/404（不是500）
- [ ] 认证正确（401 for unauth）
- [ ] 数据格式正确（JSON）
- [ ] 错误消息清晰
- [ ] 分页/limit 参数工作正常

**端到端流程**
- [ ] Brand Home → Analyze → Answer Dashboard（完整路径）
- [ ] 分析状态正确转换
- [ ] 数据聚合正确
- [ ] 没有数据不一致

---

## 📞 常见问题

### Q: 分析卡在 "analyzing" 状态不动
**A:** 这可能是后台工作流未完成。检查：
1. 服务器日志中是否有错误
2. `/api/multi-model-query` 是否被触发
3. Poe API key 是否有效
4. 配额是否足够

### Q: Brand Home 显示空品牌列表
**A:** 
1. 确保brands表中有数据
2. 验证RLS策略（brands表没有严格的用户隔离）
3. 检查浏览器console中的错误

### Q: Answer Dashboard 标签页显示空内容
**A:**
1. 该分析是否已完成（status = 'completed'）
2. 相应的JSON字段是否有数据
3. 查看浏览器console中的错误

### Q: API 返回 401 Unauthorized
**A:**
1. 确保已登录
2. 在浏览器中打开 /brand-home 确保有有效的session
3. 检查auth.uid()是否返回有效的user ID

---

## 🚀 下一步

### 立即可做
1. ✅ 部署迁移
2. ✅ 测试Brand Home页面
3. ✅ 测试Answer Dashboard
4. ✅ 测试API端点

### 短期（本周）
1. 验证后台工作流（aggregation + GEO insights）
2. 集成existing分析数据
3. 测试完整的端到端流程

### 中期（下周）
1. 从existing dashboards迁移逻辑到Answer Dashboard tabs
2. 优化性能（缓存、查询）
3. 改进UI/UX

---

## 📊 性能基准

**目标指标：**
- Brand Home 加载时间: < 2s
- Answer Dashboard 加载时间: < 3s
- 标签页切换: < 500ms
- API 响应时间: < 1s

**监控方法：**
```javascript
// 在浏览器console中
console.time('brand-home-load');
// ... 页面加载
console.timeEnd('brand-home-load');
```

---

## 💬 反馈和问题

如果遇到问题：
1. 检查浏览器console错误
2. 查看服务器日志
3. 查看Supabase数据
4. 参考常见问题部分
5. 检查PHASE5_IMPLEMENTATION_SUMMARY.md中的详细信息

---

**准备好了？让我们开始测试Phase 5吧！** 🎉
