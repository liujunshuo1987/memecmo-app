import { NextRequest, NextResponse } from 'next/server';

interface AIQueryRequest {
  platform: string;
  query: string;
  brandName: string;
}

async function queryOpenAI(query: string, brandName: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: query,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const responseText = data.choices[0]?.message?.content || '';

  const mentioned = responseText.toLowerCase().includes(brandName.toLowerCase());
  const position = mentioned ? responseText.toLowerCase().indexOf(brandName.toLowerCase()) : -1;

  const urls = responseText.match(/https?:\/\/[^\s]+/g) || [];
  const citationUrl = urls.length > 0 ? urls[0] : undefined;

  return {
    platform: 'ChatGPT',
    query,
    mentioned,
    citationUrl,
    position: position >= 0 ? position : undefined,
    responseText,
    score: mentioned ? 10 : 0,
  };
}

async function queryClaude(query: string, brandName: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Anthropic API key not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: query,
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

  const mentioned = responseText.toLowerCase().includes(brandName.toLowerCase());
  const position = mentioned ? responseText.toLowerCase().indexOf(brandName.toLowerCase()) : -1;

  const urls = responseText.match(/https?:\/\/[^\s]+/g) || [];
  const citationUrl = urls.length > 0 ? urls[0] : undefined;

  return {
    platform: 'Claude',
    query,
    mentioned,
    citationUrl,
    position: position >= 0 ? position : undefined,
    responseText,
    score: mentioned ? 10 : 0,
  };
}

async function queryGemini(query: string, brandName: string) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('Google AI API key not configured');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: query,
              },
            ],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  const mentioned = responseText.toLowerCase().includes(brandName.toLowerCase());
  const position = mentioned ? responseText.toLowerCase().indexOf(brandName.toLowerCase()) : -1;

  const urls = responseText.match(/https?:\/\/[^\s]+/g) || [];
  const citationUrl = urls.length > 0 ? urls[0] : undefined;

  return {
    platform: 'Gemini',
    query,
    mentioned,
    citationUrl,
    position: position >= 0 ? position : undefined,
    responseText,
    score: mentioned ? 10 : 0,
  };
}

async function queryPerplexity(query: string, brandName: string) {
  const responseText = `模拟 Perplexity 响应：${query}。注意：需要配置 Perplexity API 访问权限。`;

  const mentioned = responseText.toLowerCase().includes(brandName.toLowerCase());
  const position = mentioned ? responseText.toLowerCase().indexOf(brandName.toLowerCase()) : -1;

  return {
    platform: 'Perplexity',
    query,
    mentioned,
    citationUrl: undefined,
    position: position >= 0 ? position : undefined,
    responseText,
    score: mentioned ? 10 : 0,
  };
}

async function queryDeepSeek(query: string, brandName: string) {
  const responseText = `模拟 DeepSeek 响应：${query}。注意：需要配置 DeepSeek API 访问权限。`;

  const mentioned = responseText.toLowerCase().includes(brandName.toLowerCase());
  const position = mentioned ? responseText.toLowerCase().indexOf(brandName.toLowerCase()) : -1;

  return {
    platform: 'DeepSeek',
    query,
    mentioned,
    citationUrl: undefined,
    position: position >= 0 ? position : undefined,
    responseText,
    score: mentioned ? 10 : 0,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: AIQueryRequest = await request.json();
    const { platform, query, brandName } = body;

    let result;

    switch (platform) {
      case 'ChatGPT':
        result = await queryOpenAI(query, brandName);
        break;
      case 'Claude':
        result = await queryClaude(query, brandName);
        break;
      case 'Gemini':
        result = await queryGemini(query, brandName);
        break;
      case 'Perplexity':
        result = await queryPerplexity(query, brandName);
        break;
      case 'DeepSeek':
        result = await queryDeepSeek(query, brandName);
        break;
      default:
        return NextResponse.json(
          { error: `Unsupported platform: ${platform}` },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('AI query error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}
