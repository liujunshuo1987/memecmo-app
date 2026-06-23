/**
 * GEO Insight Generator
 * Uses Claude to generate Generative Engine Optimization recommendations
 * based on multi-model analysis results
 */

import { Anthropic } from '@anthropic-ai/sdk';
import type { AggregationResult } from './llm-aggregator';

export interface ModelOptimization {
  model: string;
  currentMentionRate: number;
  targetMentionRate: number;
  contentOptimization: {
    focusAreas: string[];
    languagePreferences: string[];
    structuringTips: string[];
  };
  riskFactors: string[];
  quickWins: Array<{
    change: string;
    estimatedMentionLift: string;
    implementationTime: string;
  }>;
}

export interface ContentStrategy {
  strategy: string;
  rationale: string;
  targetModels: string[];
  targetInformationGaps: string[];
  geoMetrics: {
    expectedMentionLift: number;
    expectedCitationGain: number;
    timeToTakeEffect: string;
  };
}

export interface CognitiveGapRepair {
  gap: string;
  currentMisperception: string;
  correctPerception: string;
  contentToEmphasis: string[];
  expectedGapClosureTime: string;
}

export interface GeneratedGEOInsights {
  executiveSummary: string;
  geoOptimizationStrategy: {
    overallStrategy: string;
    priorityLevel: 'critical' | 'high' | 'medium';
    expectedMentionLiftPercentage: number;
  };
  modelSpecificRecommendations: ModelOptimization[];
  contentStrategies: ContentStrategy[];
  recommendedContentStructure: {
    keyFactsToHighlight: string[];
    structuringPatterns: string[];
    linkingOpportunities: string[];
    thirdPartyValidation: string[];
  };
  cognitiveGapRepair: CognitiveGapRepair[];
}

export class GEOInsightGenerator {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    this.client = new Anthropic();
  }

  /**
   * Generate comprehensive GEO insights from aggregation results
   */
  async generateInsights(
    aggregationResult: AggregationResult,
    context: {
      brandName: string;
      targetMarkets?: string[];
      currentContentStrategy?: string;
      competitorAnalysisFocus?: boolean;
    }
  ): Promise<GeneratedGEOInsights> {
    // Build comprehensive context for Claude
    const analysisContext = this.buildAnalysisContext(aggregationResult, context);

    // Generate executive summary and strategy
    const summaryResponse = await this.generateExecutiveSummary(
      analysisContext,
      context.brandName
    );

    // Generate model-specific recommendations
    const modelRecommendations = await this.generateModelSpecificRecommendations(
      analysisContext,
      aggregationResult,
      context.brandName
    );

    // Generate content strategies
    const contentStrategies = await this.generateContentStrategies(
      analysisContext,
      context.brandName
    );

    // Generate content structure recommendations
    const contentStructure = await this.generateContentStructure(
      analysisContext,
      context.brandName
    );

    // Generate cognitive gap repair strategies
    const cognitiveGaps = await this.generateCognitiveGapRepair(
      analysisContext,
      context.brandName
    );

    return {
      executiveSummary: summaryResponse.summary,
      geoOptimizationStrategy: {
        overallStrategy: summaryResponse.strategy,
        priorityLevel: summaryResponse.priorityLevel,
        expectedMentionLiftPercentage: summaryResponse.expectedLift,
      },
      modelSpecificRecommendations: modelRecommendations,
      contentStrategies: contentStrategies,
      recommendedContentStructure: contentStructure,
      cognitiveGapRepair: cognitiveGaps,
    };
  }

  /**
   * Build analysis context string for Claude
   */
  private buildAnalysisContext(
    aggregationResult: AggregationResult,
    context: any
  ): string {
    const { consensusAnalysis, brandPerceptions, geoRelevantFindings, sentimentAnalysis } =
      aggregationResult;

    return `
# GEO Analysis Context for ${context.brandName}

## Consensus Metrics
- Overall Consensus Score: ${consensusAnalysis.overallConsensus}%
- Brand Perception Consensus: ${consensusAnalysis.brandPerceptionConsensus}%
- Divergence Index: ${consensusAnalysis.divergenceIndex}%

## Model-Specific Brand Perceptions
${Object.entries(brandPerceptions.byModel)
  .map(
    ([model, perception]: any) => `
### ${model}
- Positioning: ${perception.positioning.join(', ')}
- Key Strengths: ${perception.keyStrengths.join(', ')}
- Weaknesses: ${perception.weaknesses.join(', ')}
- Missing Information: ${perception.missingInformation.join(', ')}
- Tone: ${perception.tone}
- Confidence: ${perception.confidence}%
`
  )
  .join('\n')}

## Shared Perceptions (Consensus)
${brandPerceptions.sharedPerceptions.join('\n- ')}

## Divergent Perceptions
${brandPerceptions.divergentPerceptions
  .map((div: any) => `- ${div.perspective} (${div.models.join(', ')})`)
  .join('\n')}

## GEO-Relevant Findings
### Citation Likelihood by Model
${Object.entries(geoRelevantFindings.citationLikelihood)
  .map(([model, likelihood]: [string, any]) => `- ${model}: ${likelihood.toFixed(1)}%`)
  .join('\n')}

### Knowledge Gaps Identified
${geoRelevantFindings.knowledgeGaps.join('\n- ')}

### Content Preferences by Model
${Object.entries(geoRelevantFindings.contentPreferences)
  .map(([model, prefs]: [string, any]) => `- ${model}: ${prefs.join(', ')}`)
  .join('\n')}

## Overall Sentiment
- Sentiment: ${sentimentAnalysis.overall}
- Positive: ${sentimentAnalysis.breakdown.positive}%
- Neutral: ${sentimentAnalysis.breakdown.neutral}%
- Negative: ${sentimentAnalysis.breakdown.negative}%

## Context
- Target Markets: ${context.targetMarkets?.join(', ') || 'Global'}
- Competitor Analysis Focus: ${context.competitorAnalysisFocus ? 'Yes' : 'No'}
`;
  }

  /**
   * Generate executive summary using Claude
   */
  private async generateExecutiveSummary(
    analysisContext: string,
    brandName: string
  ): Promise<{
    summary: string;
    strategy: string;
    priorityLevel: 'critical' | 'high' | 'medium';
    expectedLift: number;
  }> {
    const prompt = `${analysisContext}

Based on this GEO analysis, provide:
1. A concise executive summary (2-3 sentences) of the brand's current standing in LLM awareness and perception
2. The overall GEO optimization strategy in 1-2 sentences
3. Priority level (critical/high/medium)
4. Expected mention lift percentage (0-100)

Format your response as JSON:
{
  "summary": "...",
  "strategy": "...",
  "priorityLevel": "high",
  "expectedLift": 25
}`;

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

    try {
      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse executive summary:', error);
    }

    return {
      summary: 'Unable to generate summary',
      strategy: 'Increase brand visibility in LLM contexts',
      priorityLevel: 'high',
      expectedLift: 20,
    };
  }

  /**
   * Generate model-specific recommendations
   */
  private async generateModelSpecificRecommendations(
    analysisContext: string,
    aggregationResult: AggregationResult,
    brandName: string
  ): Promise<ModelOptimization[]> {
    const models = Object.keys(aggregationResult.brandPerceptions.byModel);
    const recommendations: ModelOptimization[] = [];

    for (const model of models) {
      const perception = aggregationResult.brandPerceptions.byModel[model];
      const citationLikelihood =
        aggregationResult.geoRelevantFindings.citationLikelihood[model] || 0;

      const prompt = `${analysisContext}

For the model "${model}", which currently has a ${citationLikelihood.toFixed(1)}% citation likelihood for ${brandName}:

Provide specific, actionable recommendations in JSON format:
{
  "focusAreas": ["topic1", "topic2", ...],
  "languagePreferences": ["preference1", "preference2", ...],
  "structuringTips": ["tip1", "tip2", ...],
  "riskFactors": ["risk1", "risk2", ...],
  "quickWins": [
    {
      "change": "Specific change to make",
      "estimatedMentionLift": "5-10%",
      "implementationTime": "1-2 days"
    }
  ]
}

Consider this model's current perception: positioning as ${perception.positioning.join(', ')}, emphasizing ${perception.keyStrengths.join(', ')}.`;

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
          recommendations.push({
            model,
            currentMentionRate: citationLikelihood,
            targetMentionRate: Math.min(citationLikelihood + 15, 95),
            contentOptimization: {
              focusAreas: parsed.focusAreas || [],
              languagePreferences: parsed.languagePreferences || [],
              structuringTips: parsed.structuringTips || [],
            },
            riskFactors: parsed.riskFactors || [],
            quickWins: parsed.quickWins || [],
          });
        }
      } catch (error) {
        console.error(`Failed to generate recommendations for ${model}:`, error);
        // Provide fallback recommendation
        recommendations.push({
          model,
          currentMentionRate: citationLikelihood,
          targetMentionRate: Math.min(citationLikelihood + 15, 95),
          contentOptimization: {
            focusAreas: [],
            languagePreferences: [],
            structuringTips: [],
          },
          riskFactors: [],
          quickWins: [],
        });
      }
    }

    return recommendations;
  }

  /**
   * Generate content strategies
   */
  private async generateContentStrategies(
    analysisContext: string,
    brandName: string
  ): Promise<ContentStrategy[]> {
    const prompt = `${analysisContext}

Generate 3-4 high-level content strategies for improving ${brandName}'s visibility and citation likelihood in LLMs. Focus on structural/thematic improvements rather than tactical changes.

Format as JSON array:
[
  {
    "strategy": "Strategy name",
    "rationale": "Why this works",
    "targetModels": ["model1", "model2"],
    "targetInformationGaps": ["gap1", "gap2"],
    "geoMetrics": {
      "expectedMentionLift": 15,
      "expectedCitationGain": 20,
      "timeToTakeEffect": "2-4 weeks"
    }
  }
]`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1200,
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
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to generate content strategies:', error);
    }

    return [];
  }

  /**
   * Generate content structure recommendations
   */
  private async generateContentStructure(
    analysisContext: string,
    brandName: string
  ): Promise<{
    keyFactsToHighlight: string[];
    structuringPatterns: string[];
    linkingOpportunities: string[];
    thirdPartyValidation: string[];
  }> {
    const prompt = `${analysisContext}

Based on the analysis, recommend how to structure and present information about ${brandName} to optimize for LLM citation and accurate representation.

Format as JSON:
{
  "keyFactsToHighlight": ["fact1", "fact2", ...],
  "structuringPatterns": ["pattern1", "pattern2", ...],
  "linkingOpportunities": ["link1", "link2", ...],
  "thirdPartyValidation": ["source1", "source2", ...]
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
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to generate content structure:', error);
    }

    return {
      keyFactsToHighlight: [],
      structuringPatterns: [],
      linkingOpportunities: [],
      thirdPartyValidation: [],
    };
  }

  /**
   * Generate cognitive gap repair strategies
   */
  private async generateCognitiveGapRepair(
    analysisContext: string,
    brandName: string
  ): Promise<CognitiveGapRepair[]> {
    const prompt = `${analysisContext}

Identify misconceptions or gaps in how LLMs understand ${brandName}. For each significant gap, provide a repair strategy.

Format as JSON array:
[
  {
    "gap": "Description of the gap",
    "currentMisperception": "What LLMs currently think",
    "correctPerception": "What should be understood",
    "contentToEmphasis": ["content1", "content2"],
    "expectedGapClosureTime": "4-8 weeks"
  }
]`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1200,
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
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to generate cognitive gap repair:', error);
    }

    return [];
  }
}

export function createGeoInsightGenerator(): GEOInsightGenerator {
  return new GEOInsightGenerator();
}
