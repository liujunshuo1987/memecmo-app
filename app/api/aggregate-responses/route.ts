import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LLMAggregator } from '@/lib/llm-aggregator';
import type { LLMModel } from '@/lib/poe-client';

interface AggregationRequest {
  queryId: string;
  userId: string;
}

export async function POST(request: NextRequest) {
  try {
    // Verify internal API secret for background job
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.INTERNAL_API_SECRET;
    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      // For now, allow internal calls without strict auth (can be tightened)
      console.warn('Aggregation called without proper auth');
    }

    const body: AggregationRequest = await request.json();

    if (!body.queryId) {
      return NextResponse.json(
        { error: 'queryId is required' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Fetch query record
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

    // Parse raw responses into the format LLMAggregator expects
    const rawResponses = queryRecord.raw_responses as Record<LLMModel, Array<{ content: string }>>;

    // Transform to Record<LLMModel, string[]> format
    const modelResponses: Record<string, string[]> = {};
    for (const [model, responses] of Object.entries(rawResponses)) {
      modelResponses[model] = responses
        .map((r: any) => r.content)
        .filter((content: string) => content && content.length > 0);
    }

    // Run aggregation
    const aggregator = new LLMAggregator();
    const aggregationResult = aggregator.aggregate(
      modelResponses,
      queryRecord.brand_name
    );

    // Save aggregation results
    const { data: aggregation, error: aggregationError } = await supabase
      .from('query_aggregations')
      .insert({
        query_id: body.queryId,
        overall_consensus: aggregationResult.consensusAnalysis.overallConsensus,
        brand_perception_consensus: aggregationResult.consensusAnalysis.brandPerceptionConsensus,
        information_completeness: aggregationResult.consensusAnalysis.informationCompleteness,
        brand_perceptions: aggregationResult.brandPerceptions,
        shared_perceptions: aggregationResult.brandPerceptions.sharedPerceptions,
        divergent_perceptions: aggregationResult.brandPerceptions.divergentPerceptions,
        citation_likelihood: aggregationResult.geoRelevantFindings.citationLikelihood,
        knowledge_gaps: aggregationResult.geoRelevantFindings.knowledgeGaps,
        content_preferences: aggregationResult.geoRelevantFindings.contentPreferences,
      })
      .select()
      .single();

    if (aggregationError || !aggregation) {
      console.error('Failed to save aggregation:', aggregationError);
      return NextResponse.json(
        { error: 'Failed to save aggregation results' },
        { status: 500 }
      );
    }

    // Update query record with aggregation reference
    await supabase
      .from('multi_model_queries_v2')
      .update({
        aggregation_result: aggregationResult,
        consensus_score: aggregationResult.consensusAnalysis.overallConsensus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.queryId);

    // Trigger GEO insight generation
    await triggerGeoInsightGeneration(
      body.queryId,
      body.userId,
      queryRecord.brand_name,
      aggregationResult
    ).catch((error) => {
      console.error('Failed to trigger GEO insight generation:', error);
      // Don't fail the aggregation request even if insights fail
    });

    return NextResponse.json({
      success: true,
      aggregationId: aggregation.id,
      consensusScore: aggregationResult.consensusAnalysis.overallConsensus,
    });
  } catch (error) {
    console.error('Aggregation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Trigger GEO insight generation
 */
async function triggerGeoInsightGeneration(
  queryId: string,
  userId: string,
  brandName: string,
  aggregationResult: any
) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/generate-geo-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INTERNAL_API_SECRET || ''}`,
      },
      body: JSON.stringify({
        queryId,
        userId,
        brandName,
        aggregationResult,
      }),
    });

    if (!response.ok) {
      console.error('GEO insight trigger failed:', await response.text());
    }
  } catch (error) {
    console.error('Failed to trigger GEO insight generation:', error);
  }
}
