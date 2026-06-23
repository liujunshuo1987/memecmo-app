import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { scanId, name, email, company, phone, message } = body;

    if (!name || !email) {
      return NextResponse.json(
        { error: '姓名和郵箱為必填項' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: '請提供有效的郵箱地址' },
        { status: 400 }
      );
    }

    const { data: leadData, error: leadError } = await supabase
      .from('lead_contacts')
      .insert({
        scan_id: scanId || null,
        name,
        email,
        company: company || null,
        phone: phone || null,
        message: message || null,
        status: 'new',
      })
      .select()
      .maybeSingle();

    if (leadError) {
      console.error('Error saving lead to database:', leadError);
      return NextResponse.json(
        { error: '提交失敗，請稍後重試' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, leadId: leadData?.id },
      { status: 200 }
    );

  } catch (error) {
    console.error('Lead submission error:', error);
    return NextResponse.json(
      { error: '系統錯誤，請稍後重試' },
      { status: 500 }
    );
  }
}
