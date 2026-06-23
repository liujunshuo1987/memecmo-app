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

    const { data: analysis, error } = await supabase
      .from('brand_analyses')
      .select('*')
      .eq('brand_id', params.brandId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "no rows found"
      console.error('Failed to fetch latest analysis:', error);
      return NextResponse.json(
        { error: 'Failed to fetch analysis' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: analysis || null,
    });
  } catch (error) {
    console.error('Latest analysis endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
