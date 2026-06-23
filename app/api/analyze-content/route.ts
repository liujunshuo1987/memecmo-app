import { NextRequest, NextResponse } from 'next/server';

interface ContentAnalysisRequest {
  content: string;
}

async function analyzeContentWithClaude(content: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Anthropic API key not configured');
  }

  const analysisPrompt = `分析以下内容的GEO优化指标，以JSON格式返回：

内容：
${content.substring(0, 4000)}

请提取：
1. wordCount: 总字数
2. sentenceCount: 句子数量
3. avgSentenceLength: 平均句子长度（字数）
4. claims: 可验证的声明列表（数组，最多10个）
5. entities: 命名实体列表（人名、地名、组织、产品等，数组，最多15个）
6. semanticTriples: 语义三元组列表（格式：{subject, predicate, object}，数组，最多10个）

只返回JSON，不要其他解释。`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: analysisPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json();
  const responseText = data.content[0]?.text || '';

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    return JSON.parse(jsonMatch[0]);
  } catch (parseError) {
    console.error('Failed to parse Claude response:', responseText);
    throw new Error('Failed to parse AI response as JSON');
  }
}

function fallbackAnalysis(content: string) {
  const sentences = content.split(/[。！？.!?]+/).filter(s => s.trim().length > 0);
  const words = content.split(/\s+/).filter(w => w.length > 0);

  const entities = Array.from(
    new Set(
      content.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || []
    )
  ).slice(0, 15);

  const claims = sentences
    .filter(s => s.includes('是') || s.includes('有') || s.includes('能') || s.includes('可以'))
    .slice(0, 10);

  const semanticTriples = sentences.slice(0, 10).map((sentence, idx) => {
    const parts = sentence.split(/[，,]/);
    return {
      subject: parts[0] || `主语${idx + 1}`,
      predicate: '关联',
      object: parts[1] || `宾语${idx + 1}`,
    };
  });

  return {
    wordCount: words.length,
    sentenceCount: sentences.length,
    avgSentenceLength: words.length / sentences.length,
    claims,
    entities,
    semanticTriples,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: ContentAnalysisRequest = await request.json();
    const { content } = body;

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    let analysis;
    try {
      analysis = await analyzeContentWithClaude(content);
    } catch (error) {
      console.warn('Claude analysis failed, using fallback:', error);
      analysis = fallbackAnalysis(content);
    }

    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Content analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}
