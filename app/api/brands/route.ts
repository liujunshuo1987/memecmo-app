import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
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

    // Fetch brands (public access for now)
    const { data: brands, error } = await supabase.from('brands').select('*').limit(100);

    if (error) {
      console.error('Failed to fetch brands:', error);
      return NextResponse.json(
        { error: 'Failed to fetch brands' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: brands || [],
    });
  } catch (error) {
    console.error('Brands endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
