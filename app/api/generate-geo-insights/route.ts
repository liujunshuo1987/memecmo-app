import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createGeoInsightGenerator } from '@/lib/geo-insight-generator';
import type { AggregationResult } from '@/lib/llm-aggregator';

interface InsightGenerationRequest {
  queryId: string;
  userId: string;
  brandName: string;
  aggregationResult: AggregationResult;
}

export async function POST(request: NextRequest) {
  try {
    // Verify internal API secret for background job
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.INTERNAL_API_SECRET;
    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      console.warn('GEO insight generation called without proper auth');
    }

    const body: InsightGenerationRequest = await request.json();

    if (!body.queryId || !body.brandName) {
      return NextResponse.json(
        { error: 'queryId and brandName are required' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Fetch query record to get context
    const { data: queryRecord, error: queryError } = await supabase
      .from('multi_model_queries_v2')
      .select('*')
      .eq('id', body.queryId)
      .single();

    if (queryError || !queryRecord) {
      return NextResponse.json(
        { error: 'Query not found' },
        { status: 404 }
      );
    }

    // Generate GEO insights using Claude
    const generator = createGeoInsightGenerator();
    const geoInsights = await generator.generateInsights(body.aggregationResult, {
      brandName: body.brandName,
      targetMarkets: queryRecord.region ? [queryRecord.region] : undefined,
      competitorAnalysisFocus: Boolean(queryRecord.competitor_names?.length),
    });

    // Find or create aggregation record
    let aggregationId = null;
    const { data: existingAgg } = await supabase
      .from('query_aggregations')
      .select('id')
      .eq('query_id', body.queryId)
      .single();

    aggregationId = existingAgg?.id;

    // Save generated insights
    const { data: insight, error: insertError } = await supabase
      .from('generated_insights')
      .insert({
        query_id: body.queryId,
        aggregation_id: aggregationId,
        executive_summary: geoInsights.executiveSummary,
        geo_optimization_strategy: geoInsights.geoOptimizationStrategy,
        model_specific_recommendations: geoInsights.modelSpecificRecommendations,
        content_strategies: geoInsights.contentStrategies,
        recommended_content_structure: geoInsights.recommendedContentStructure,
        cognitive_gap_repair: geoInsights.cognitiveGapRepair,
        generated_by_model: 'claude-3-5-sonnet',
        confidence_score: Math.min(
          (body.aggregationResult.consensusAnalysis.overallConsensus / 100) * 95 + 5,
          100
        ),
      })
      .select()
      .single();

    if (insertError || !insight) {
      console.error('Failed to save GEO insights:', insertError);
      return NextResponse.json(
        { error: 'Failed to save insights' },
        { status: 500 }
      );
    }

    // Update query status to completed
    await supabase
      .from('multi_model_queries_v2')
      .update({
        status: 'completed',
        geo_insights: geoInsights,
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq('id', body.queryId);

    // Cache the results if not already cached
    const queryHash = queryRecord.cache_key;
    if (queryHash) {
      try {
        await supabase.from('geo_analysis_cache').insert({
          query_hash: queryHash,
          question_set_hash: queryRecord.question_set
            ? require('crypto')
              .createHash('sha256')
              .update(JSON.stringify(queryRecord.question_set))
              .digest('hex')
            : null,
          model_set: queryRecord.models?.sort().join(',') || null,
          aggregation_result: body.aggregationResult,
          geo_insights: geoInsights,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      } catch (cacheError) {
        console.warn('Failed to cache results:', cacheError);
        // Don't fail the whole request if caching fails
      }
    }

    return NextResponse.json({
      success: true,
      insightId: insight.id,
      insights: geoInsights,
    });
  } catch (error) {
    console.error('GEO insight generation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
