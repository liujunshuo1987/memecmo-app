/**
 * LLM Aggregator
 * 分析多个 LLM 的答案，计算共识、分歧、品牌定位等
 */

import { PoeResponse, LLMModel } from './poe-client';

export interface ConsensusMetrics {
  overallConsensus: number;           // 0-100: 所有模型的意见一致度
  brandPerceptionConsensus: number;   // 品牌定位的一致度
  informationCompleteness: Record<string, number>; // 每个模型的信息完整度
  divergenceIndex: number;            // 0-100: 模型间的分歧程度
  modelAgreementMatrix: Record<string, Record<string, number>>; // 模型对的一致度
}

export interface BrandPerception {
  model: string;
  positioning: string[];             // 如何定位该品牌
  keyStrengths: string[];
  weaknesses: string[];
  missingInformation: string[];      // 遗漏的重要信息
  tone: 'positive' | 'neutral' | 'negative' | 'mixed';
  confidence: number;                // 0-100
}

export interface BrandPerceptions {
  byModel: Record<string, BrandPerception>;
  sharedPerceptions: string[];       // 所有模型都同意的
  divergentPerceptions: Array<{
    perspective: string;
    models: string[];
    confidence: number;
  }>;
}

export interface GEORelevantFindings {
  citationLikelihood: Record<string, number>; // 各模型引用品牌的概率
  knowledgeGaps: string[];          // 模型对品牌的认知gaps
  contentPreferences: Record<string, string[]>; // 各模型偏好的信息类型
}

export interface AggregationResult {
  consensusAnalysis: ConsensusMetrics;
  brandPerceptions: BrandPerceptions;
  geoRelevantFindings: GEORelevantFindings;
  extractedEntities: {
    brands: Array<{ name: string; frequency: number }>;
    competitors: Array<{ name: string; frequency: number }>;
    concepts: Array<{ name: string; frequency: number }>;
  };
  sentimentAnalysis: {
    overall: 'positive' | 'neutral' | 'negative' | 'mixed';
    breakdown: {
      positive: number;
      neutral: number;
      negative: number;
    };
    byModel: Record<string, string>;
  };
}

export class LLMAggregator {
  /**
   * 计算两个文本的语义相似度（0-1）
   * 使用简化算法：基于共同词汇
   */
  private calculateSemanticSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;

    const words1 = new Set(
      text1.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
    );
    const words2 = new Set(
      text2.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
    );

    const intersection = Array.from(words1).filter((w) => words2.has(w)).length;
    const union = words1.size + words2.size - intersection;

    return union === 0 ? 0 : intersection / union;
  }

  /**
   * 计算所有模型间的共识强度
   */
  calculateConsensus(
    modelResponses: Record<string, string[]>, // Model -> [answer1, answer2, ...]
    brandName: string
  ): ConsensusMetrics {
    const models = Object.keys(modelResponses);
    const allAnswers: string[] = [];
    const modelCompleteness: Record<string, number> = {};

    // 收集所有答案并计算完整度
    for (const model of models) {
      const answers = modelResponses[model];
      allAnswers.push(...answers);

      // 计算完整度：提及品牌、长度、信息丰富度
      const mentionCount = answers.filter((a) =>
        a.toLowerCase().includes(brandName.toLowerCase())
      ).length;
      const avgLength = answers.reduce((sum, a) => sum + a.length, 0) / answers.length;
      const completeness = Math.min(100, (mentionCount / answers.length) * 50 + (avgLength / 500) * 50);
      modelCompleteness[model] = completeness;
    }

    // 计算模型对之间的相似度
    const modelAgreementMatrix: Record<string, Record<string, number>> = {};

    for (let i = 0; i < models.length; i++) {
      modelAgreementMatrix[models[i]] = {};
      for (let j = 0; j < models.length; j++) {
        if (i === j) {
          modelAgreementMatrix[models[i]][models[j]] = 100;
        } else {
          // 计算两个模型的平均答案相似度
          const model1Answers = modelResponses[models[i]];
          const model2Answers = modelResponses[models[j]];
          let totalSimilarity = 0;

          for (const answer1 of model1Answers) {
            for (const answer2 of model2Answers) {
              totalSimilarity += this.calculateSemanticSimilarity(answer1, answer2);
            }
          }

          const avgSimilarity =
            (totalSimilarity / (model1Answers.length * model2Answers.length)) * 100;
          modelAgreementMatrix[models[i]][models[j]] = avgSimilarity;
        }
      }
    }

    // 计算整体共识
    let totalAgreement = 0;
    let pairCount = 0;

    for (const model1 of models) {
      for (const model2 of models) {
        if (model1 < model2) {
          totalAgreement += modelAgreementMatrix[model1][model2];
          pairCount++;
        }
      }
    }

    const overallConsensus = pairCount > 0 ? totalAgreement / pairCount : 50;
    const divergenceIndex = 100 - overallConsensus;

    // 品牌定位共识（基于品牌提及率）
    const mentionRates = models.map(
      (model) =>
        (modelResponses[model].filter((a) =>
          a.toLowerCase().includes(brandName.toLowerCase())
        ).length / modelResponses[model].length) * 100
    );
    const brandPerceptionConsensus =
      100 -
      (Math.max(...mentionRates) - Math.min(...mentionRates)) / 2;

    return {
      overallConsensus: Math.round(overallConsensus * 10) / 10,
      brandPerceptionConsensus: Math.round(brandPerceptionConsensus * 10) / 10,
      informationCompleteness: modelCompleteness,
      divergenceIndex: Math.round(divergenceIndex * 10) / 10,
      modelAgreementMatrix,
    };
  }

  /**
   * 提取品牌定位信息
   */
  extractBrandPositioning(
    modelResponses: Record<string, string[]>,
    brandName: string
  ): BrandPerceptions {
    const models = Object.keys(modelResponses) as LLMModel[];
    const byModel: Record<string, BrandPerception> = {};

    // 关键词定义（用于分析）
    const strengthKeywords = [
      'innovative', '创新', 'reliable', '可靠', 'advanced', '先进',
      'leading', '领先', 'cutting-edge', '尖端', 'excellent', '优秀',
      'strong', '强大', 'powerful', '强力', 'effective', '有效',
    ];

    const weaknessKeywords = [
      'expensive', '昂贵', 'complex', '复杂', 'limited', '限制',
      'slow', '缓慢', 'outdated', '过时', 'poor', '差', 'weak', '弱',
    ];

    for (const model of models) {
      const answers = modelResponses[model];
      const combinedText = answers.join(' ').toLowerCase();

      // 检测定位
      const positioning: string[] = [];
      if (combinedText.includes('enterprise')) positioning.push('Enterprise/B2B');
      if (combinedText.includes('startup') || combinedText.includes('small'))
        positioning.push('SMB');
      if (combinedText.includes('consumer') || combinedText.includes('individual'))
        positioning.push('Consumer/Individual');

      // 检测强势
      const strengths = strengthKeywords.filter((kw) =>
        combinedText.includes(kw)
      );

      // 检测弱点
      const weaknesses = weaknessKeywords.filter((kw) =>
        combinedText.includes(kw)
      );

      // 品牌提及率（用于置信度）
      const brandMentions = answers.filter((a) =>
        a.toLowerCase().includes(brandName.toLowerCase())
      ).length;
      const confidence = (brandMentions / answers.length) * 100;

      // 检测缺失信息（简化版本）
      const missingKeywords = ['partnership', 'pricing', 'ecosystem', 'community'];
      const missingInformation = missingKeywords.filter(
        (kw) => !combinedText.includes(kw)
      );

      // 情感分析（简化版本）
      const positiveCount = answers.filter((a) =>
        /good|great|excellent|best|strong|innovative/i.test(a)
      ).length;
      const negativeCount = answers.filter((a) =>
        /bad|poor|weak|limited|outdated/i.test(a)
      ).length;

      let tone: 'positive' | 'neutral' | 'negative' | 'mixed' = 'neutral';
      if (positiveCount > negativeCount * 1.5) tone = 'positive';
      else if (negativeCount > positiveCount * 1.5) tone = 'negative';
      else if (positiveCount > 0 && negativeCount > 0) tone = 'mixed';

      byModel[model] = {
        model,
        positioning,
        keyStrengths: strengths,
        weaknesses,
        missingInformation,
        tone,
        confidence: Math.round(confidence * 10) / 10,
      };
    }

    // 提取共识定位
    const positioningSets = models.map((m) => new Set(byModel[m].positioning));
    const sharedPositioning: string[] = Array.from(
      positioningSets.reduce((intersection: Set<string>, set) =>
        new Set([...intersection].filter((x) => set.has(x)))
      ) || new Set()
    ) as string[];

    // 提取分歧观点
    const divergentViews: Array<{ perspective: string; models: string[]; confidence: number }> = [];

    // 简化：如果某个模型有独特的定位，列为分歧
    for (const model of models) {
      const unique = byModel[model].positioning.filter(
        (pos) => !sharedPositioning.includes(pos)
      );
      if (unique.length > 0) {
        divergentViews.push({
          perspective: unique.join(', '),
          models: [model],
          confidence: byModel[model].confidence,
        });
      }
    }

    return {
      byModel,
      sharedPerceptions: sharedPositioning,
      divergentPerceptions: divergentViews,
    };
  }

  /**
   * 计算 GEO 相关指标
   */
  calculateGEOMetrics(
    modelResponses: Record<string, string[]>,
    brandName: string
  ): GEORelevantFindings {
    const models = Object.keys(modelResponses) as LLMModel[];

    // 计算每个模型的品牌提及率（Citation Likelihood）
    const citationLikelihood: Record<string, number> = {};
    for (const model of models) {
      const answers = modelResponses[model];
      const mentionCount = answers.filter((a) =>
        a.toLowerCase().includes(brandName.toLowerCase())
      ).length;
      citationLikelihood[model] = (mentionCount / answers.length) * 100;
    }

    // 识别知识 gaps
    const knowledgeGaps: string[] = [];
    const allText = Object.values(modelResponses)
      .flat()
      .join(' ')
      .toLowerCase();

    // 检查缺失的常见品牌相关信息
    const importantTopics = [
      { topic: 'pricing', present: allText.includes('pricing') || allText.includes('price') },
      { topic: 'partnerships', present: allText.includes('partnership') },
      { topic: 'security', present: allText.includes('security') || allText.includes('safe') },
      { topic: 'compliance', present: allText.includes('compliance') || allText.includes('gdpr') },
      { topic: 'integration', present: allText.includes('integration') || allText.includes('integrate') },
    ];

    for (const item of importantTopics) {
      if (!item.present) {
        knowledgeGaps.push(`Information about ${item.topic} is missing`);
      }
    }

    // 识别内容偏好
    const contentPreferences: Record<string, string[]> = {};

    for (const model of models) {
      const answers = modelResponses[model];
      const combinedText = answers.join(' ').toLowerCase();

      const preferences: string[] = [];

      // 检测内容类型偏好
      if (/data|statistic|number|percent/.test(combinedText))
        preferences.push('Data-driven');
      if (/case study|example|client/.test(combinedText))
        preferences.push('Case studies & examples');
      if (/feature|capability|function/.test(combinedText))
        preferences.push('Feature descriptions');
      if (/benefit|advantage|impact/.test(combinedText))
        preferences.push('Benefits & impacts');
      if (/award|recognition|leader/.test(combinedText))
        preferences.push('Social proof & awards');

      contentPreferences[model] = preferences;
    }

    return {
      citationLikelihood,
      knowledgeGaps,
      contentPreferences,
    };
  }

  /**
   * 分析整体情感
   */
  analyzeSentiment(
    modelResponses: Record<string, string[]>
  ): {
    overall: 'positive' | 'neutral' | 'negative' | 'mixed';
    breakdown: { positive: number; neutral: number; negative: number };
    byModel: Record<string, string>;
  } {
    const models = Object.keys(modelResponses) as LLMModel[];
    const allAnswers = Object.values(modelResponses).flat();

    const positiveWords = ['good', 'great', 'excellent', 'best', 'strong', 'innovative', '好', '优秀', '最好', '强大'];
    const negativeWords = ['bad', 'poor', 'weak', 'limited', 'outdated', '差', '弱', '过时'];

    let positiveCount = 0;
    let negativeCount = 0;

    for (const answer of allAnswers) {
      const lower = answer.toLowerCase();
      for (const word of positiveWords) {
        if (lower.includes(word)) positiveCount++;
      }
      for (const word of negativeWords) {
        if (lower.includes(word)) negativeCount++;
      }
    }

    const total = positiveCount + negativeCount || 1;
    const positiveRatio = (positiveCount / total) * 100;
    const negativeRatio = (negativeCount / total) * 100;
    const neutralRatio = 100 - positiveRatio - negativeRatio;

    let overall: 'positive' | 'neutral' | 'negative' | 'mixed' = 'neutral';
    if (positiveRatio > 50) overall = 'positive';
    else if (negativeRatio > 50) overall = 'negative';
    else if (positiveRatio > 20 && negativeRatio > 20) overall = 'mixed';

    // 按模型的情感
    const byModel: Record<string, string> = {};
    for (const model of models) {
      const answers = modelResponses[model];
      const text = answers.join(' ').toLowerCase();

      let modelPos = 0,
        modelNeg = 0;
      for (const word of positiveWords) {
        if (text.includes(word)) modelPos++;
      }
      for (const word of negativeWords) {
        if (text.includes(word)) modelNeg++;
      }

      if (modelPos > modelNeg) byModel[model] = 'positive';
      else if (modelNeg > modelPos) byModel[model] = 'negative';
      else byModel[model] = 'neutral';
    }

    return {
      overall,
      breakdown: {
        positive: Math.round(positiveRatio),
        neutral: Math.round(neutralRatio),
        negative: Math.round(negativeRatio),
      },
      byModel,
    };
  }

  /**
   * 执行完整的聚合分析
   */
  aggregate(
    modelResponses: Record<string, string[]>,
    brandName: string
  ): AggregationResult {
    const models = Object.keys(modelResponses) as LLMModel[];

    return {
      consensusAnalysis: this.calculateConsensus(modelResponses, brandName),
      brandPerceptions: this.extractBrandPositioning(modelResponses, brandName),
      geoRelevantFindings: this.calculateGEOMetrics(modelResponses, brandName),
      extractedEntities: {
        brands: [{ name: brandName, frequency: models.length }],
        competitors: [],
        concepts: [],
      },
      sentimentAnalysis: this.analyzeSentiment(modelResponses),
    };
  }
}

// 导出工厂函数
export function createAggregator(): LLMAggregator {
  return new LLMAggregator();
}
