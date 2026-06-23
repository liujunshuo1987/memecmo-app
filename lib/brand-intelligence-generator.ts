/**
 * Brand Intelligence Generator
 * 根据GEO原理自动生成品牌分析问题和策略
 */

import { Anthropic } from '@anthropic-ai/sdk';

export interface BrandInput {
  brandName: string;
  description?: string;
  website?: string;
  targetMarkets?: string[];
  industry?: string;
  language?: string; // 用户提供信息的语言
}

export interface GeneratedQuestion {
  category: string;
  subcategory: string;
  question: string;
  geoRelevance: string; // 为什么这个问题对GEO很重要
}

export interface BrandIntelligence {
  brandName: string;
  analysis: {
    positioning: string[];
    keyStrengths: string[];
    targetAudience: string[];
    marketPosition: string;
  };
  generatedQuestions: GeneratedQuestion[];
  questionsByCategory: Record<string, GeneratedQuestion[]>;
  executiveContext: string;
}

export class BrandIntelligenceGenerator {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    this.client = new Anthropic();
  }

  /**
   * 从品牌信息生成GEO分析问题
   */
  async generateBrandIntelligence(brandInput: BrandInput): Promise<BrandIntelligence> {
    // 首先分析品牌信息
    const brandAnalysis = await this.analyzeBrand(brandInput);

    // 然后生成GEO相关的问题
    const questions = await this.generateGEOQuestions(brandInput, brandAnalysis);

    // 按类别分组问题
    const questionsByCategory = this.groupQuestionsByCategory(questions);

    return {
      brandName: brandInput.brandName,
      analysis: brandAnalysis.analysis,
      generatedQuestions: questions,
      questionsByCategory,
      executiveContext: brandAnalysis.context,
    };
  }

  /**
   * 分析品牌信息
   */
  private async analyzeBrand(
    brandInput: BrandInput
  ): Promise<{ analysis: any; context: string }> {
    const prompt = `请分析以下品牌信息，并从GEO（生成式引擎优化）的角度提供见解：

品牌名称: ${brandInput.brandName}
${brandInput.description ? `描述: ${brandInput.description}` : ''}
${brandInput.website ? `网站: ${brandInput.website}` : ''}
${brandInput.targetMarkets ? `目标市场: ${brandInput.targetMarkets.join(', ')}` : ''}
${brandInput.industry ? `行业: ${brandInput.industry}` : ''}

请返回 JSON 格式：
{
  "analysis": {
    "positioning": ["定位1", "定位2", ...],
    "keyStrengths": ["优势1", "优势2", ...],
    "targetAudience": ["受众1", "受众2", ...],
    "marketPosition": "市场定位描述"
  },
  "context": "对该品牌在 AI 模型中的可见性的执行总结"
}`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 800,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          analysis: parsed.analysis,
          context: parsed.context,
        };
      }
    } catch (error) {
      console.error('Failed to analyze brand:', error);
    }

    return {
      analysis: {
        positioning: [],
        keyStrengths: [],
        targetAudience: [],
        marketPosition: '',
      },
      context: '品牌分析上下文',
    };
  }

  /**
   * 根据GEO原理生成问题
   */
  private async generateGEOQuestions(
    brandInput: BrandInput,
    brandAnalysis: any
  ): Promise<GeneratedQuestion[]> {
    const prompt = `作为 GEO（生成式引擎优化）专家，请为以下品牌生成优化 AI 模型可见性的问题：

品牌: ${brandInput.brandName}
定位: ${brandAnalysis.analysis.positioning.join(', ')}
优势: ${brandAnalysis.analysis.keyStrengths.join(', ')}
目标受众: ${brandAnalysis.analysis.targetAudience.join(', ')}

根据 GEO 原理，生成 20-30 个问题，这些问题应该：
1. 测试 AI 模型对该品牌的理解和认知
2. 识别知识差距
3. 评估品牌在不同上下文中的可见性
4. 测试品牌与竞争对手的定位对比
5. 验证品牌关键信息的传达

按以下 JSON 格式返回（数组）：
[
  {
    "category": "品牌定位|竞争对比|产品/服务|目标市场|社会证明|其他",
    "subcategory": "具体子类别",
    "question": "问题",
    "geoRelevance": "为什么这对 GEO 很重要"
  }
]

确保问题：
- 使用 [BRAND_NAME] 占位符
- 具有全局适用性（多语言受众）
- 涵盖品牌认知的所有关键方面`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 3000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.map((q: any) => ({
          category: q.category || 'other',
          subcategory: q.subcategory || '',
          question: q.question.replace(/\[BRAND_NAME\]/g, `[BRAND_NAME]`),
          geoRelevance: q.geoRelevance,
        }));
      }
    } catch (error) {
      console.error('Failed to generate GEO questions:', error);
    }

    return [];
  }

  /**
   * 按类别分组问题
   */
  private groupQuestionsByCategory(questions: GeneratedQuestion[]): Record<string, GeneratedQuestion[]> {
    const grouped: Record<string, GeneratedQuestion[]> = {};

    for (const question of questions) {
      if (!grouped[question.category]) {
        grouped[question.category] = [];
      }
      grouped[question.category].push(question);
    }

    return grouped;
  }

  /**
   * 从网页URL提取信息（模拟实现）
   */
  async extractBrandInfoFromWebsite(url: string): Promise<Partial<BrandInput>> {
    // 注：实际应用中应使用网页爬虫或API
    // 这里为演示目的返回基本信息
    const prompt = `给定这个网址: ${url}

请预测该网站可能包含的品牌信息类型：
- 品牌名称可能是什么？
- 主要行业/类别是什么？
- 可能的目标市场/地区？
- 核心价值主张可能是什么？

返回 JSON 格式：
{
  "brandName": "预期品牌名称",
  "industry": "行业",
  "targetMarkets": ["市场1", "市场2"],
  "description": "基于URL推断的描述"
}`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to extract brand info from website:', error);
    }

    return {};
  }

  /**
   * 获取推荐的问题数量
   */
  getRecommendedQuestionCount(brandInput: BrandInput): number {
    // 根据品牌信息的完整性推荐问题数量
    let score = 5; // 基础分数
    if (brandInput.description) score += 3;
    if (brandInput.website) score += 2;
    if (brandInput.targetMarkets) score += 2;
    if (brandInput.industry) score += 2;

    // 推荐 10-30 个问题
    return Math.min(30, Math.max(10, score * 2));
  }

  /**
   * 从文本中提取关键信息（多语言）
   */
  async extractBrandInfoFromText(text: string, language: string = 'auto'): Promise<Partial<BrandInput>> {
    const prompt = `从以下文本中提取品牌信息（语言: ${language}）：

"${text}"

返回 JSON 格式：
{
  "brandName": "品牌名称",
  "description": "品牌描述",
  "industry": "行业",
  "targetMarkets": ["市场1", "市场2"],
  "language": "检测到的语言"
}`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const respText = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = respText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to extract brand info from text:', error);
    }

    return {};
  }
}

export function createBrandIntelligenceGenerator(): BrandIntelligenceGenerator {
  return new BrandIntelligenceGenerator();
}
