import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createBrandIntelligenceGenerator } from '@/lib/brand-intelligence-generator';
import type { BrandInput } from '@/lib/brand-intelligence-generator';

interface AutoAnalyzeBrandRequest {
  brandName: string;
  description?: string;
  website?: string;
  targetMarkets?: string[];
  industry?: string;
  language?: string;
  autoExecute?: boolean; // 自动执行多模型查询
  models?: ('gpt-4' | 'claude-opus' | 'gemini-pro' | 'perplexity' | 'deepseek')[];
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

    const body: AutoAnalyzeBrandRequest = await request.json();

    if (!body.brandName) {
      return NextResponse.json(
        { error: 'Brand name is required' },
        { status: 400 }
      );
    }

    // Generate brand intelligence and questions
    const generator = createBrandIntelligenceGenerator();
    const brandInput: BrandInput = {
      brandName: body.brandName,
      description: body.description,
      website: body.website,
      targetMarkets: body.targetMarkets,
      industry: body.industry,
      language: body.language || 'en',
    };

    console.log('Generating brand intelligence for:', body.brandName);
    const intelligence = await generator.generateBrandIntelligence(brandInput);

    // Extract questions for multi-model query
    const questions = intelligence.generatedQuestions
      .slice(0, 15) // 限制在15个问题以控制成本
      .map((q) => q.question.replace('[BRAND_NAME]', body.brandName));

    const models = body.models || ['gpt-4', 'claude-opus', 'gemini-pro'];

    // Save intelligence record
    const { data: savedIntelligence, error: saveError } = await supabase
      .from('brand_intelligence_records')
      .insert({
        user_id: user.id,
        brand_name: body.brandName,
        description: body.description,
        website: body.website,
        target_markets: body.targetMarkets || [],
        industry: body.industry,
        language: body.language || 'en',
        analysis: intelligence.analysis,
        generated_questions: intelligence.generatedQuestions,
        questions_by_category: intelligence.questionsByCategory,
        executive_context: intelligence.executiveContext,
        status: body.autoExecute ? 'auto-analyzing' : 'ready-for-analysis',
      })
      .select()
      .single();

    if (saveError || !savedIntelligence) {
      console.error('Failed to save intelligence:', saveError);
      return NextResponse.json(
        { error: 'Failed to save brand intelligence' },
        { status: 500 }
      );
    }

    // If autoExecute is true, trigger multi-model query automatically
    if (body.autoExecute) {
      console.log('Auto-executing multi-model query...');
      void executeAutoAnalysis(
        savedIntelligence.id,
        body.brandName,
        questions,
        models,
        user.id
      ).catch((error) => {
        console.error('Auto-analysis failed:', error);
      });
    }

    return NextResponse.json({
      success: true,
      intelligenceId: savedIntelligence.id,
      brandName: body.brandName,
      analysis: intelligence.analysis,
      generatedQuestions: intelligence.generatedQuestions,
      questionsByCategory: intelligence.questionsByCategory,
      executiveContext: intelligence.executiveContext,
      questionCount: questions.length,
      autoExecuteStarted: body.autoExecute || false,
    });
  } catch (error) {
    console.error('Auto-analyze brand error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Auto-execute multi-model analysis in background
 */
async function executeAutoAnalysis(
  intelligenceId: string,
  brandName: string,
  questions: string[],
  models: string[],
  userId: string
) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Trigger multi-model query
    const response = await fetch(`${baseUrl}/api/multi-model-query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INTERNAL_API_SECRET || ''}`,
      },
      body: JSON.stringify({
        questionSet: questions,
        brandName: brandName,
        models: models,
        priority: 'quality',
      }),
    });

    if (!response.ok) {
      console.error('Failed to trigger multi-model query:', await response.text());
      return;
    }

    const data = await response.json();
    console.log('Multi-model query started:', data.queryId);

    // Link intelligence to multi-model query
    const supabase = createClient();
    await supabase
      .from('brand_intelligence_records')
      .update({
        multi_model_query_id: data.queryId,
        status: 'auto-analyzing',
      })
      .eq('id', intelligenceId);

  } catch (error) {
    console.error('Error executing auto-analysis:', error);
  }
}
