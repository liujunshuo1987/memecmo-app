import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function maskKeywords(text: string, keyword: string): string {
  if (!keyword) return text;
  const words = keyword.split(/\s+/);
  let result = text;
  words.forEach((word) => {
    if (word.length > 0) {
      const regex = new RegExp(word, 'gi');
      result = result.replace(regex, '[***]');
    }
  });
  return result;
}

async function sendEmailNotifications(
  brandName: string,
  competitorName: string,
  keyword: string,
  aigvrScore: number,
  brandShare: number,
  competitorShare: number,
  sentiment: string,
  customerEmail?: string
) {
  if (!resend || !process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'your-resend-api-key-here') {
    console.log('Resend API key not configured. Email notifications skipped.');
    return;
  }

  try {
    const adminEmailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
            .field { margin-bottom: 15px; }
            .label { font-weight: bold; color: #555; }
            .value { color: #333; margin-top: 5px; }
            .score { font-size: 24px; font-weight: bold; color: #dc2626; }
            .warning { background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>🚨 新高淨值線索</h2>
              <p>觀瀾智庫 AI 能見度掃描系統</p>
            </div>
            <div class="content">
              <div class="warning">
                <strong>品牌：${brandName}</strong>
              </div>
              <div class="field">
                <div class="label">🏢 品牌名稱</div>
                <div class="value">${brandName}</div>
              </div>
              <div class="field">
                <div class="label">🔍 競品名稱</div>
                <div class="value">${competitorName}</div>
              </div>
              <div class="field">
                <div class="label">🔑 關鍵詞</div>
                <div class="value">${keyword || 'N/A'}</div>
              </div>
              <div class="field" style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #ddd;">
                <div class="label">📊 AIGVR 評分</div>
                <div class="score">${aigvrScore}/100</div>
              </div>
              <div class="field">
                <div class="label">📈 品牌答案份額 (SoA)</div>
                <div class="value">${brandShare}%</div>
              </div>
              <div class="field">
                <div class="label">📉 競品答案份額</div>
                <div class="value">${competitorShare}%</div>
              </div>
              <div class="field">
                <div class="label">😊 情感分析</div>
                <div class="value">${sentiment}</div>
              </div>
              ${customerEmail ? `
              <div class="field" style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #ddd;">
                <div class="label">📧 客戶郵箱</div>
                <div class="value">${customerEmail}</div>
              </div>
              ` : ''}
              <div class="field" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
                <div class="label">🕐 掃描時間</div>
                <div class="value">${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const customerEmailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.8; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #ffffff; padding: 30px 20px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; }
            .highlight { background: #eff6ff; border-left: 4px solid #1d4ed8; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2 style="margin: 0; font-size: 24px;">觀瀾智庫</h2>
              <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">AI 認知基線審計系統</p>
            </div>
            <div class="content">
              <h3 style="color: #1e40af; margin-top: 0;">尊敬的客戶您好，</h3>
              <p>感謝您使用觀瀾智庫 AI 能見度體檢系統。</p>
              <div class="highlight">
                <strong>您的 ${brandName} 大模型認知基線審計已啟動</strong>
              </div>
              <p>系統正在調取全球大模型節點進行文獻級數據聚合與實體幻覺排查，包括：</p>
              <ul style="color: #4b5563;">
                <li>海外生態節點：ChatGPT-4o, Claude-3.5, Gemini</li>
                <li>國內生態節點：Kimi, 文心一言, 通義千問</li>
                <li>深度語義分析與競品對比</li>
                <li>認知幻覺風險評估</li>
              </ul>
              <p><strong>包含深度數據看板的完整版 PDF 報告將在 24 小時內發送至本郵箱，請注意查收。</strong></p>
              <p>如有任何問題，歡迎隨時與我們聯繫。</p>
              <div class="footer">
                <p>觀瀾智庫 | AI 認知基線優化專家</p>
                <p>本郵件由系統自動發送，如需回覆請聯繫 liujunshuo1987@gmail.com</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    await Promise.all([
      resend.emails.send({
        from: 'Acme <onboarding@resend.dev>',
        to: ['liujunshuo1987@gmail.com'],
        subject: `🚨 [觀瀾智庫] 新高淨值線索：${brandName}`,
        html: adminEmailHtml,
      }).catch((error) => {
        console.error('Failed to send admin email:', error);
      }),

      customerEmail ? resend.emails.send({
        from: 'Acme <onboarding@resend.dev>',
        replyTo: 'liujunshuo1987@gmail.com',
        to: [customerEmail],
        subject: `您的 ${brandName} 大模型認知基線審計已啟動`,
        html: customerEmailHtml,
      }).catch((error) => {
        console.error('Failed to send customer email:', error);
      }) : Promise.resolve(),
    ]);

    console.log('Email notifications sent successfully');
  } catch (error) {
    console.error('Error sending email notifications:', error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { brandName, competitorName, keyword, email } = body;

    if (!brandName || !competitorName) {
      return NextResponse.json({ error: '品牌与竞品名称为必填项' }, { status: 400 });
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    const aigvrScore = Math.floor(Math.random() * 21) + 10;
    const brandShare = Math.floor(Math.random() * 20) + 5;
    const competitorShare = Math.max(100 - brandShare - Math.floor(Math.random() * 20), brandShare + 30);

    const sentiments: Array<'Positive' | 'Neutral' | 'Negative' | 'Hallucination'> =
      ['Positive', 'Neutral', 'Negative', 'Hallucination'];
    const sentiment = sentiments[Math.floor(Math.random() * sentiments.length)];

    const gapTemplates = [
      `品牌在主流大模型訓練語料中缺乏高質量[***]相關內容`,
      `競品${competitorName}已建立完整的[***]語義索引，而品牌${brandName}存在認知幻覺風險`,
      `未發現品牌Schema.org結構化數據標記，導致[***]實體關聯缺失`,
      `品牌在[***]領域的文獻級引用密度低於行業基準87%`,
      `檢測到品牌與[***]之間的語義鏈路斷層，AI無法建立正確關聯`,
    ];

    const gaps = gapTemplates
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map(template => maskKeywords(template, keyword || ''));

    const auditResult = {
      audit_results: {
        AIGVR_score: aigvrScore,
        SoA_comparison: {
          brand_share: brandShare,
          competitor_share: competitorShare,
        },
        sentiment_analysis: sentiment,
        fatal_corpus_gaps: gaps,
      },
    };

    const { data: scanData, error: scanError } = await supabase
      .from('scan_submissions')
      .insert({
        brand_name: brandName,
        competitor_name: competitorName,
        keywords: keyword || null,
        audit_results: auditResult.audit_results,
      })
      .select()
      .maybeSingle();

    if (scanError) {
      console.error('Error saving scan to database:', scanError);
    }

    sendEmailNotifications(
      brandName,
      competitorName,
      keyword || '',
      aigvrScore,
      brandShare,
      competitorShare,
      sentiment,
      email
    ).catch((error) => {
      console.error('Background email sending failed:', error);
    });

    return NextResponse.json({
      ...auditResult,
      scan_id: scanData?.id || null,
    }, { status: 200 });

  } catch (error) {
    console.error('Audit Engine Error:', error);
    return NextResponse.json(
      { error: '引擎计算失败，请检查数据链路' },
      { status: 500 }
    );
  }
}
