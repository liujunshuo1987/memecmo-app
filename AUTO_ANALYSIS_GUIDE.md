# 自动品牌智能分析系统 - 使用指南

## 概述

**自动品牌智能分析系统**（Brand Intelligence Auto-Analyzer）根据 GEO（生成式引擎优化）原理自动为您的品牌生成测试问题，然后执行多模型LLM查询分析。

## 核心流程

```
用户输入品牌信息
    ↓
系统分析品牌（定位、优势、目标受众）
    ↓
根据 GEO 原理自动生成问题
    ↓
按类别分组问题（品牌定位、竞争对比、产品/服务等）
    ↓
可选：自动执行多模型查询
    ↓
显示结果和建议
```

## 使用步骤

### 1. 访问自动分析页面

打开: `http://localhost:3000/sov-dashboard`

点击: **"Auto Analysis"** 标签页

### 2. 输入品牌信息

以下字段可用：

| 字段 | 必需 | 说明 |
|---|---|---|
| **Brand Name** | ✅ | 品牌名称（中文/英文均可） |
| **Description** | ❌ | 品牌描述、核心业务 |
| **Website** | ❌ | 网站URL（用于提取额外信息） |
| **Industry** | ❌ | 行业类别（SaaS、AI、Finance等） |
| **Target Markets** | ❌ | 目标市场（逗号分隔：US, EU, APAC） |
| **Language** | ✅ | 输入信息的语言（中文、英文等） |

### 3. 选择 LLM 模型

选择要查询的模型：
- ✓ **GPT-4** - 最全面，成本较高
- ✓ **Claude Opus** - 强大推理能力
- ✓ **Gemini Pro** - 快速、成本有效
- Perplexity - 研究聚焦
- DeepSeek - 最经济

**推荐组合**: GPT-4 + Claude Opus + Gemini Pro

### 4. 选择分析模式

#### ✅ 启用自动执行（推荐）
- 系统自动运行生成的问题
- 无需手动触发
- 更快获得结果
- 45-85 秒内完成整个分析

#### ❌ 禁用自动执行
- 先查看生成的问题
- 手动验证和编辑问题（如需）
- 然后点击"运行多模型分析"按钮

### 5. 查看结果

#### Phase 1: GEO 智能报告
- **执行摘要** - 品牌在AI中的可见性概述
- **品牌定位** - 系统识别的定位维度
- **核心优势** - 识别的竞争优势
- **目标受众** - 确定的目标受众群体
- **市场位置** - 市场中的定位

#### Phase 2: 生成的 GEO 问题
按以下类别组织：

| 类别 | 用途 |
|---|---|
| **Brand Positioning** | 测试品牌定位认知 |
| **Competitive Comparison** | 与竞争对手的对比 |
| **Product/Service** | 产品/服务理解 |
| **Target Market** | 目标市场相关性 |
| **Social Proof** | 社会证明和验证 |
| **Other** | 其他相关问题 |

### 6. 查看多模型分析结果

自动执行时，系统会：
1. 生成 GEO 问题
2. 并行查询所有选定的 LLM
3. 聚合结果
4. 生成 GEO 优化建议

结果显示在 **"Multi-Model Analysis"** 标签页中

## 生成的问题示例

### 品牌定位类
- "What is [BRAND_NAME]'s primary market positioning?"
- "What are the key differentiators that set [BRAND_NAME] apart?"
- "How would you describe [BRAND_NAME] to a potential customer?"

### 竞争对比类
- "How does [BRAND_NAME] compare to industry competitors?"
- "What advantages does [BRAND_NAME] have over alternatives?"
- "In what areas is [BRAND_NAME] a market leader?"

### 产品/服务类
- "What are the main features and capabilities of [BRAND_NAME]?"
- "What problems does [BRAND_NAME] solve?"
- "What industries or use cases is [BRAND_NAME] best suited for?"

### 目标市场类
- "Who are the ideal customers for [BRAND_NAME]?"
- "What company sizes or industries use [BRAND_NAME]?"
- "In which geographic regions is [BRAND_NAME] most popular?"

## GEO 原理集成

### 问题设计遵循的 GEO 原理

1. **信息完整性**
   - 覆盖所有品牌关键信息
   - 测试不同上下文中的可见性

2. **多角度测试**
   - 品牌定位
   - 竞争优势
   - 产品/服务
   - 市场相关性
   - 社会证明

3. **多语言支持**
   - 支持中文输入
   - 生成多语言兼容问题
   - 评估全球可见性

4. **知识差距识别**
   - 哪些信息被AI模型遗漏
   - 哪些认知存在偏差
   - 需要强化的关键信息

5. **AI模型优化**
   - 针对每个模型的具体建议
   - 模型偏好的信息类型
   - 提高引用概率的策略

## API 端点

### POST `/api/auto-analyze-brand`

**请求：**
```json
{
  "brandName": "OpenAI",
  "description": "AI research and deployment company",
  "website": "https://openai.com",
  "industry": "AI",
  "targetMarkets": ["US", "EU", "APAC"],
  "language": "en",
  "autoExecute": true,
  "models": ["gpt-4", "claude-opus", "gemini-pro"]
}
```

**响应：**
```json
{
  "success": true,
  "intelligenceId": "uuid",
  "analysis": {
    "positioning": [...],
    "keyStrengths": [...],
    "targetAudience": [...],
    "marketPosition": "..."
  },
  "generatedQuestions": [...],
  "questionsByCategory": {...},
  "executiveContext": "...",
  "questionCount": 15,
  "autoExecuteStarted": true
}
```

## 数据存储

### 新表：`brand_intelligence_records`

存储品牌分析记录：
- 品牌基本信息
- 自动生成的问题
- GEO 分析结果
- 与多模型查询的关联

## 成本估算

### 典型分析成本

**Phase 1: 品牌智能生成**
- Claude 调用 2-3 次
- 成本: $0.01-0.02

**Phase 2: 多模型查询**
- 15 个问题 × 3 个模型
- 成本: $1.50-3.00（取决于模型选择）

**总成本**: $1.51-3.02 每个品牌分析

### 节省成本的技巧

1. **使用较便宜的模型组合**
   - 推荐: Gemini Pro + DeepSeek + Claude Opus
   - 成本: $0.50-1.00

2. **减少问题数量**
   - 系统默认生成 15 个问题
   - 可手动选择 5-10 个关键问题

3. **缓存利用**
   - 相同品牌的重复分析使用缓存
   - 成本降低 90%+

## 最佳实践

### 1. 输入完整的品牌信息
- **好**: 名称 + 描述 + 网站 + 行业 + 目标市场
- **不足**: 仅输入名称

更多信息 → 更相关的问题

### 2. 选择合适的模型
- **全面分析**: GPT-4 + Claude + Gemini（推荐）
- **快速检查**: Gemini Pro + DeepSeek
- **深度推理**: GPT-4 + Claude Opus

### 3. 迭代分析
1. **首次分析** - 了解整体情况
2. **深度分析** - 关注特定方面
3. **竞争对比** - 与竞争对手对比
4. **优化验证** - 验证改进效果

### 4. 采取行动
根据结果，采取以下行动：
- 更新网站内容
- 调整品牌信息结构
- 创建针对性内容
- 进行第三方背书
- 改进市场定位

## 使用场景

### 场景 1: 新产品发布
```
输入: 新产品名称 + 描述 + 目标市场
目标: 了解AI模型对新产品的认知
输出: 在各模型中改进可见性的建议
```

### 场景 2: 市场扩展
```
输入: 品牌名称 + 新目标市场
目标: 评估在新市场中的认知差距
输出: 针对新市场的优化建议
```

### 场景 3: 竞争分析
```
输入: 您的品牌 + 竞争对手（作为不同查询）
目标: 对比AI模型中的定位
输出: 竞争优势和劣势分析
```

### 场景 4: 品牌健康检查
```
输入: 品牌名称
目标: 定期评估品牌在AI中的健康状况
输出: 趋势分析和改进建议
```

## 故障排除

### "生成失败"
**原因**: ANTHROPIC_API_KEY 无效或无配额
**解决**: 
1. 检查 .env.local 中的 API Key
2. 确保有足够的配额
3. 稍后重试

### "自动执行未开始"
**原因**: 多模型查询 API 出现问题
**解决**:
1. 检查 Poe API Key
2. 查看浏览器控制台错误
3. 手动运行多模型分析

### "问题不相关"
**原因**: 品牌信息输入不完整
**解决**:
1. 提供更详细的描述
2. 添加网站和行业信息
3. 指定目标市场
4. 重新生成问题

## 高级功能（未来）

- [ ] 从网页自动提取品牌信息
- [ ] 批量分析多个品牌
- [ ] 定期自动化分析（每周/每月）
- [ ] 历史对比（跟踪改进）
- [ ] 竞争对手自动对比
- [ ] 自定义问题编辑
- [ ] 问题质量评分
- [ ] 导出报告（PDF/CSV）

## 支持和反馈

如有问题或建议，请：
1. 查看"Multi-Model Analysis"标签页了解详细结果
2. 检查生成的问题是否相关
3. 验证 LLM 答案的准确性
4. 根据建议采取行动

## 相关文档

- [多模型分析完整指南](./MULTI_MODEL_ANALYSIS.md)
- [GEO 原理](./GEO-PRINCIPLES.md)
- [快速开始指南](./QUICKSTART.md)
