import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createPoeClient } from '@/lib/poe-client';
import type { LLMModel } from '@/lib/poe-client';
import crypto from 'crypto';

interface MultiModelQueryRequest {
  questionSet: string[];
  brandName: string;
  competitorNames?: string[];
  models: LLMModel[];
  priority: 'speed' | 'quality' | 'cost';
  region?: string;
  language?: string;
  cacheKey?: string;
}

interface QuickAnalysis {
  brandMentionCount: number;
  avgMentionRatePerModel: number;
  sentimentBreakdown: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

/**
 * Generate cache key for query deduplication
 */
function generateQueryHash(
  questionSet: string[],
  models: string[],
  brandName: string
): string {
  const key = `${questionSet.join('|||')}::${models.sort().join(',')}::${brandName}`;
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Perform quick sentiment analysis on responses
 */
function analyzeQuickSentiment(answers: string[]): QuickAnalysis['sentimentBreakdown'] {
  const positiveWords = ['good', 'great', 'excellent', 'best', 'strong', 'innovative', '好', '优秀', '最好', '强大'];
  const negativeWords = ['bad', 'poor', 'weak', 'limited', 'outdated', '差', '弱', '过时'];

  let positiveCount = 0;
  let negativeCount = 0;

  for (const answer of answers) {
    const lower = answer.toLowerCase();
    for (const word of positiveWords) {
      if (lower.includes(word)) positiveCount++;
    }
    for (const word of negativeWords) {
      if (lower.includes(word)) negativeCount++;
    }
  }

  const total = positiveCount + negativeCount || 1;
  const positive = Math.round((positiveCount / total) * 100);
  const negative = Math.round((negativeCount / total) * 100);
  const neutral = Math.max(0, 100 - positive - negative);

  return { positive, negative, neutral };
}

/**
 * Check cache for existing query results
 */
async function checkCache(
  supabase: any,
  queryHash: string
): Promise<{ aggregationResult: any; geoInsights: any } | null> {
  try {
    const { data, error } = await supabase
      .from('geo_analysis_cache')
      .select('aggregation_result, geo_insights')
      .eq('query_hash', queryHash)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) return null;

    // Update hit count
    await supabase
      .from('geo_analysis_cache')
      .update({
        hit_count: (data.hit_count || 0) + 1,
        last_accessed_at: new Date().toISOString(),
      })
      .eq('query_hash', queryHash);

    return {
      aggregationResult: data.aggregation_result,
      geoInsights: data.geo_insights,
    };
  } catch (error) {
    console.error('Cache lookup error:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request
    const body: MultiModelQueryRequest = await request.json();

    // Validation
    if (!body.questionSet || body.questionSet.length === 0) {
      return NextResponse.json(
        { error: 'Question set is required' },
        { status: 400 }
      );
    }

    if (body.questionSet.length > 50) {
      return NextResponse.json(
        { error: 'Maximum 50 questions allowed' },
        { status: 400 }
      );
    }

    if (!body.brandName) {
      return NextResponse.json(
        { error: 'Brand name is required' },
        { status: 400 }
      );
    }

    if (!body.models || body.models.length === 0) {
      return NextResponse.json(
        { error: 'At least one model must be selected' },
        { status: 400 }
      );
    }

    // Generate cache key
    const queryHash = generateQueryHash(body.questionSet, body.models, body.brandName);

    // Check cache first
    const cachedResult = await checkCache(supabase, queryHash);
    if (cachedResult) {
      console.log('Cache hit for query:', queryHash);

      // If we have cached results, also return them but mark as cached
      const { data: savedQuery } = await supabase
        .from('multi_model_queries_v2')
        .insert({
          user_id: user.id,
          question_set: body.questionSet,
          brand_name: body.brandName,
          competitor_names: body.competitorNames || [],
          models: body.models,
          region: body.region,
          language: body.language || 'en',
          priority: body.priority,
          status: 'completed',
          aggregation_result: cachedResult.aggregationResult,
          geo_insights: cachedResult.geoInsights,
          cache_key: queryHash,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (savedQuery) {
        return NextResponse.json({
          queryId: savedQuery.id,
          status: 'completed',
          isCached: true,
          quickAnalysis: {
            brandMentionCount: 0,
            avgMentionRatePerModel: 0,
            sentimentBreakdown: cachedResult.aggregationResult?.sentimentAnalysis?.breakdown || {
              positive: 0,
              negative: 0,
              neutral: 100,
            },
          },
          aggregationTaskId: null,
        });
      }
    }

    // Initialize query record
    const { data: queryRecord, error: queryError } = await supabase
      .from('multi_model_queries_v2')
      .insert({
        user_id: user.id,
        question_set: body.questionSet,
        brand_name: body.brandName,
        competitor_names: body.competitorNames || [],
        models: body.models,
        region: body.region,
        language: body.language || 'en',
        priority: body.priority,
        status: 'processing',
        cache_key: queryHash,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (queryError || !queryRecord) {
      console.error('Failed to create query record:', queryError);
      return NextResponse.json(
        { error: 'Failed to create query record' },
        { status: 500 }
      );
    }

    // Estimate cost
    const poeClient = createPoeClient();
    const costEstimate = poeClient.estimateCost(body.models, body.questionSet);

    // Check quota (simplified - just check if total cost is reasonable)
    const quotaStatus = await poeClient.getQuotaStatus();
    if (costEstimate.totalCostCents > quotaStatus.remainingRequests * 10) {
      // Very rough check - in production, integrate with actual Poe quota API
      console.warn('Approaching quota limits');
    }

    // Execute parallel queries (don't await - run in background)
    void executeParallelQueries(
      queryRecord.id,
      body.questionSet,
      body.models,
      body.brandName,
      body.priority,
      user.id
    ).catch((error) => {
      console.error('Parallel query execution failed:', error);
      // Update query status to failed (fire and forget)
      void supabase
        .from('multi_model_queries_v2')
        .update({ status: 'failed' })
        .eq('id', queryRecord.id);
    });

    return NextResponse.json({
      queryId: queryRecord.id,
      status: 'processing',
      isCached: false,
      quickAnalysis: {
        brandMentionCount: 0,
        avgMentionRatePerModel: 0,
        sentimentBreakdown: {
          positive: 0,
          negative: 0,
          neutral: 100,
        },
      },
      costEstimate: {
        totalCostCents: costEstimate.totalCostCents,
        costBreakdown: costEstimate.costBreakdown,
      },
      aggregationTaskId: queryRecord.id, // Use query ID as polling key
    });
  } catch (error) {
    console.error('Multi-model query error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Execute queries in background
 */
async function executeParallelQueries(
  queryId: string,
  questions: string[],
  models: LLMModel[],
  brandName: string,
  priority: 'speed' | 'quality' | 'cost',
  userId: string
) {
  const supabase = createClient();

  try {
    const poeClient = createPoeClient();

    // Execute parallel queries to all models
    const modelResponses = await poeClient.parallelQuery(questions, models, priority);

    // Convert to record format
    const rawResponses: Record<string, any> = {};
    for (const [model, responses] of modelResponses.entries()) {
      rawResponses[model] = responses.map((r) => ({
        content: r.content,
        success: r.success,
        error: r.error,
        processingTimeMs: r.processingTimeMs,
        usage: r.usage,
      }));
    }

    // Calculate quick metrics
    const allAnswers = Array.from(modelResponses.values()).flat();
    const brandMentions = allAnswers.filter((response) =>
      response.content.toLowerCase().includes(brandName.toLowerCase())
    ).length;

    // Update query with raw responses
    const { error: updateError } = await supabase
      .from('multi_model_queries_v2')
      .update({
        status: 'processing',
        raw_responses: rawResponses,
        brand_mention_count: brandMentions,
        updated_at: new Date().toISOString(),
      })
      .eq('id', queryId);

    if (updateError) {
      console.error('Failed to update query with responses:', updateError);
      return;
    }

    // Trigger aggregation
    await triggerAggregation(queryId, userId);
  } catch (error) {
    console.error('Parallel query execution error:', error);

    // Mark query as failed
    try {
      await supabase
        .from('multi_model_queries_v2')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', queryId);
    } catch (err) {
      console.error('Failed to update query status:', err);
    }
  }
}

/**
 * Trigger aggregation analysis
 */
async function triggerAggregation(queryId: string, userId: string) {
  try {
    // Call the aggregation endpoint
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/aggregate-responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INTERNAL_API_SECRET || ''}`,
      },
      body: JSON.stringify({
        queryId,
        userId,
      }),
    });

    if (!response.ok) {
      console.error('Aggregation trigger failed:', await response.text());
    }
  } catch (error) {
    console.error('Failed to trigger aggregation:', error);
  }
}
