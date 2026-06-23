import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createBrandIntelligenceGenerator } from '@/lib/brand-intelligence-generator';

interface AnalyzeBrandCompleteRequest {
  brandId: string;
  analysisName: string;
  targetModels?: string[];
  targetMarkets?: string[];
  language?: string;
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

    const body: AnalyzeBrandCompleteRequest = await request.json();

    if (!body.brandId || !body.analysisName) {
      return NextResponse.json(
        { error: 'brandId and analysisName are required' },
        { status: 400 }
      );
    }

    // Fetch brand info
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('*')
      .eq('id', body.brandId)
      .single();

    if (brandError || !brand) {
      return NextResponse.json(
        { error: 'Brand not found' },
        { status: 404 }
      );
    }

    const targetModels = body.targetModels || ['gpt-4', 'claude-opus', 'gemini-pro'];
    const language = body.language || 'en';

    // Generate questions using brand intelligence generator
    const generator = createBrandIntelligenceGenerator();
    const intelligence = await generator.generateBrandIntelligence({
      brandName: brand.name,
      description: brand.website_url,
      industry: '',
      targetMarkets: body.targetMarkets,
      language,
    });

    // Create brand_analyses record
    const { data: analysis, error: analysisError } = await supabase
      .from('brand_analyses')
      .insert({
        user_id: user.id,
        brand_id: body.brandId,
        analysis_name: body.analysisName,
        status: 'analyzing',
        analysis_metadata: {
          questions: intelligence.generatedQuestions,
          models: targetModels,
          strategies: [],
        },
        target_models: targetModels,
        target_markets: body.targetMarkets || [],
        language,
        analysis_started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (analysisError || !analysis) {
      console.error('Failed to create analysis record:', analysisError);
      return NextResponse.json(
        { error: 'Failed to create analysis' },
        { status: 500 }
      );
    }

    // Trigger background analysis workflow
    // This should be done in the background, not blocking the response
    triggerAnalysisWorkflow(
      analysis.id,
      body.brandId,
      user.id,
      brand.name,
      intelligence.generatedQuestions,
      targetModels,
      language
    ).catch((error) => {
      console.error('Background analysis workflow error:', error);
    });

    return NextResponse.json({
      success: true,
      analysisId: analysis.id,
      message: 'Analysis initiated. Results will be available shortly.',
    });
  } catch (error) {
    console.error('Analyze brand complete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Background workflow to execute the complete analysis pipeline
 */
async function triggerAnalysisWorkflow(
  analysisId: string,
  brandId: string,
  userId: string,
  brandName: string,
  questions: any[],
  models: string[],
  language: string
) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const internalSecret = process.env.INTERNAL_API_SECRET || '';

    // Step 1: Create auto brand intelligence record and trigger multi-model query
    console.log(`[Analysis ${analysisId}] Step 1: Creating brand intelligence and questions...`);

    const questionsText = questions
      .map((q) => q.question.replace('[BRAND_NAME]', brandName))
      .slice(0, 15);

    // Step 2: Trigger multi-model query
    console.log(`[Analysis ${analysisId}] Step 2: Starting multi-model query...`);

    const multiModelResponse = await fetch(
      `${baseUrl}/api/multi-model-query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${internalSecret}`,
        },
        body: JSON.stringify({
          questionSet: questionsText,
          brandName,
          models,
          priority: 'quality',
          language,
        }),
      }
    );

    if (!multiModelResponse.ok) {
      console.error(
        `[Analysis ${analysisId}] Failed to trigger multi-model query:`,
        await multiModelResponse.text()
      );
      return;
    }

    const multiModelData = await multiModelResponse.json();
    const queryId = multiModelData.queryId;

    console.log(
      `[Analysis ${analysisId}] Multi-model query started with queryId: ${queryId}`
    );

    // Step 3: Link the query to the analysis
    const supabase = createClient();
    await supabase
      .from('brand_analyses')
      .update({
        multi_model_query_id: queryId,
      })
      .eq('id', analysisId);

    // Note: The actual aggregation and GEO insights generation should be triggered
    // by the multi-model query completion webhook or polling mechanism.
    // For now, we're just initiating the flow.

    console.log(`[Analysis ${analysisId}] Workflow initiated successfully`);
  } catch (error) {
    console.error(`[Analysis ${analysisId}] Workflow error:`, error);

    // Update analysis status to failed
    try {
      const supabase = createClient();
      await supabase
        .from('brand_analyses')
        .update({ status: 'failed' })
        .eq('id', analysisId);
    } catch (updateError) {
      console.error('Failed to update analysis status:', updateError);
    }
  }
}

