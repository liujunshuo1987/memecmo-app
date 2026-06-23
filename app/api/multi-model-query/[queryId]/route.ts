import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface QueryStatusResponse {
  queryId: string;
  status: 'processing' | 'completed' | 'partial' | 'failed';
  progress?: {
    stage: string;
    percentage: number;
  };
  results?: {
    modelResponses: any;
    aggregationResult: any;
    geoInsights: any;
  };
  error?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { queryId: string } }
) {
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

    // Fetch query record
    const { data: query, error: queryError } = await supabase
      .from('multi_model_queries_v2')
      .select('*')
      .eq('id', params.queryId)
      .eq('user_id', user.id)
      .single();

    if (queryError || !query) {
      return NextResponse.json(
        { error: 'Query not found' },
        { status: 404 }
      );
    }

    // Determine progress based on status
    const progressMap = {
      processing: { stage: 'Querying LLMs...', percentage: 40 },
      partial: { stage: 'Analyzing results...', percentage: 70 },
      completed: { stage: 'Complete', percentage: 100 },
      failed: { stage: 'Failed', percentage: 0 },
    };

    const response: QueryStatusResponse = {
      queryId: query.id,
      status: query.status,
      progress: progressMap[query.status as keyof typeof progressMap],
    };

    // Include results if completed
    if (query.status === 'completed') {
      response.results = {
        modelResponses: query.raw_responses,
        aggregationResult: query.aggregation_result,
        geoInsights: query.geo_insights,
      };
    }

    if (query.status === 'failed') {
      response.error = 'Query execution failed. Please try again.';
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Query status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
