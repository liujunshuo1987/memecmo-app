import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface CompareAnalysesRequest {
  analysisIds: string[];
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CompareAnalysesRequest = await request.json();

    if (!body.analysisIds || body.analysisIds.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 analysisIds are required for comparison' },
        { status: 400 }
      );
    }

    // Fetch all analyses
    const { data: analyses, error } = await supabase
      .from('brand_analyses')
      .select('*')
      .in('id', body.analysisIds)
      .eq('user_id', user.id);

    if (error || !analyses) {
      console.error('Failed to fetch analyses for comparison:', error);
      return NextResponse.json(
        { error: 'Failed to fetch analyses' },
        { status: 500 }
      );
    }

    // Validate all analyses belong to the same brand
    const brandIds = new Set(analyses.map((a) => a.brand_id));
    if (brandIds.size > 1) {
      return NextResponse.json(
        { error: 'All analyses must be from the same brand' },
        { status: 400 }
      );
    }

    // Prepare comparison data
    const comparison = {
      brandId: analyses[0].brand_id,
      analysisCount: analyses.length,
      timeRange: {
        earliest: analyses.reduce((min, a) =>
          new Date(a.created_at) < new Date(min.created_at) ? a : min
        ).created_at,
        latest: analyses.reduce((max, a) =>
          new Date(a.created_at) > new Date(max.created_at) ? a : max
        ).created_at,
      },
      analyses: analyses.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
      trends: calculateTrends(analyses),
      improvements: calculateImprovements(analyses),
    };

    return NextResponse.json({
      success: true,
      data: comparison,
    });
  } catch (error) {
    console.error('Compare analyses error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function calculateTrends(analyses: any[]) {
  if (analyses.length < 2) return null;

  const sorted = analyses.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const consensusScores = sorted.map((a) => a.consensus_score);
  const mentionRates = sorted.map((a) => a.brand_mention_rate);
  const geoScores = sorted.map((a) => a.overall_geo_score);

  return {
    consensusScore: {
      values: consensusScores,
      trend: calculateTrend(consensusScores),
    },
    mentionRate: {
      values: mentionRates,
      trend: calculateTrend(mentionRates),
    },
    geoScore: {
      values: geoScores,
      trend: calculateTrend(geoScores),
    },
  };
}

function calculateImprovements(analyses: any[]) {
  if (analyses.length < 2) return null;

  const sorted = analyses.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const firstAnalysis = sorted[0];
  const lastAnalysis = sorted[sorted.length - 1];

  return {
    consensusScoreChange:
      (lastAnalysis.consensus_score || 0) - (firstAnalysis.consensus_score || 0),
    mentionRateChange:
      (lastAnalysis.brand_mention_rate || 0) - (firstAnalysis.brand_mention_rate || 0),
    geoScoreChange:
      (lastAnalysis.overall_geo_score || 0) - (firstAnalysis.overall_geo_score || 0),
  };
}

function calculateTrend(values: (number | null)[]) {
  const validValues = values.filter((v) => v !== null) as number[];
  if (validValues.length < 2) return 'stable';

  const firstHalf = validValues.slice(0, Math.floor(validValues.length / 2));
  const secondHalf = validValues.slice(Math.floor(validValues.length / 2));

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const change = secondAvg - firstAvg;

  if (change > 5) return 'improving';
  if (change < -5) return 'declining';
  return 'stable';
}
