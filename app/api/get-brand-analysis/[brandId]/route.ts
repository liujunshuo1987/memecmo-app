import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { brandId: string } }
) {
  try {
    const supabase = createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the analysis ID from query params if provided
    const url = new URL(request.url);
    const analysisId = url.searchParams.get('analysisId');

    let analysisQuery = supabase
      .from('brand_analyses')
      .select('*')
      .eq('brand_id', params.brandId)
      .eq('user_id', user.id);

    if (analysisId) {
      analysisQuery = analysisQuery.eq('id', analysisId);
    } else {
      // Get the latest analysis
      analysisQuery = analysisQuery.order('created_at', { ascending: false }).limit(1);
    }

    const { data: analyses, error } = await analysisQuery;

    if (error) {
      console.error('Failed to fetch brand analysis:', error);
      return NextResponse.json(
        { error: 'Failed to fetch analysis' },
        { status: 500 }
      );
    }

    if (!analyses || analyses.length === 0) {
      return NextResponse.json(
        { error: 'No analysis found' },
        { status: 404 }
      );
    }

    const analysis = analyses[0];

    // Fetch related data for comprehensive analysis view
    const { data: brand } = await supabase
      .from('brands')
      .select('*')
      .eq('id', params.brandId)
      .single();

    const { data: multiModelData } = analysis.multi_model_query_id
      ? await supabase
          .from('multi_model_queries_v2')
          .select('*')
          .eq('id', analysis.multi_model_query_id)
          .single()
      : { data: null };

    return NextResponse.json({
      success: true,
      data: {
        analysis,
        brand,
        multiModelQuery: multiModelData,
      },
    });
  } catch (error) {
    console.error('Get brand analysis error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
