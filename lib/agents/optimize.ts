// Content Optimize Agent (v1.1 — execution pillar)
//
// Turns a measured GEO gap (a high-intent query where the brand is absent) into
// a publish-ready content asset engineered for AI-answer retrieval: an
// authoritative, structured page in the target language + a FAQ + valid
// JSON-LD (FAQPage) schema. This is the agent that MAKES the content that moves
// GEO — the step beyond measure/recommend.

import { poeChat, parseJsonFromLLM, DEFAULT_MODEL } from '@/lib/llm/poe';
import { brandProfileBlock } from './brand-facts';

type EventEmitter = (event: {
  event_type:
    | 'log'
    | 'tool_call'
    | 'tool_result'
    | 'progress'
    | 'output_chunk'
    | 'error'
    | 'milestone';
  payload: Record<string, unknown>;
}) => Promise<void>;

interface OptimizeInput {
  brandName: string;
  brandUrl?: string | null;
  targetCountry: string;
  targetLanguage?: string | null;
  industry?: string | null;
  target: { query: string; stage: string; competitors?: string[] };
  brandProfile?: any;
}

const LANGUAGE_NAMES: Record<string, string> = {
  vi: 'Vietnamese',
  th: 'Thai',
  fil: 'Filipino (Tagalog)',
  tl: 'Filipino (Tagalog)',
  ms: 'Malay',
  id: 'Indonesian',
  zh: 'Chinese (Simplified)',
  en: 'English',
};

interface ContentJson {
  title: string;
  metaDescription: string;
  articleMarkdown: string;
  faq: { question: string; answer: string }[];
}

function buildFaqSchema(faq: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

export async function runOptimizeAgent(
  input: OptimizeInput,
  emit: EventEmitter,
): Promise<{ summary: string; output: Record<string, unknown> }> {
  const langCode = (input.targetLanguage || 'en').toLowerCase();
  const languageName = LANGUAGE_NAMES[langCode] || 'English';
  const { query, stage } = input.target;

  await emit({ event_type: 'milestone', payload: { label: 'Optimize started', step: 1, totalSteps: 3 } });
  await emit({
    event_type: 'log',
    payload: { text: `Creating ${languageName} content for the ${stage}-stage gap: "${query}"` },
  });

  const system =
    'You are a senior GEO content strategist and native-level copywriter. You write ' +
    'pages that AI answer engines (ChatGPT, Gemini, Perplexity, Claude) will retrieve ' +
    'and cite: directly answer the buyer question up front, use clear question-style ' +
    'headings, concise factual paragraphs, concrete specifics/data, and a FAQ. Mention ' +
    'the brand naturally only where genuinely relevant — never keyword-stuff. ' +
    'Output strict JSON only.';

  const user = [
    `Brand: ${input.brandName}` + (input.brandUrl ? ` (${input.brandUrl})` : ''),
    `Market: ${input.targetCountry}` + (input.industry ? ` · ${input.industry}` : ''),
    `Write everything in ${languageName}.`,
    input.target.competitors?.length ? `Competitors currently winning this query: ${input.target.competitors.join(', ')}.` : null,
    brandProfileBlock(input.brandProfile) || null,
    '',
    `Target buyer query to win (write the page that should rank/be-cited for it):`,
    `"${query}"`,
    '',
    'Produce a publish-ready page as JSON with this exact shape:',
    '{',
    '  "title": "compelling, search-aligned page title",',
    '  "metaDescription": "≤160 char summary",',
    '  "articleMarkdown": "600-900 word article in Markdown. Open with a direct answer to the query. Use ## question-style headings. Be specific and factual; include the brand where genuinely relevant.",',
    '  "faq": [{ "question": "...", "answer": "concise 1-3 sentence answer" }]',
    '}',
    'Rules: 4-6 FAQ items, all content in ' + languageName + '. Return ONLY the JSON.',
  ]
    .filter(Boolean)
    .join('\n');

  await emit({ event_type: 'tool_call', payload: { tool: 'poe.chat', args: { model: DEFAULT_MODEL, purpose: 'Draft GEO content' } } });
  await emit({ event_type: 'progress', payload: { pct: 25 } });

  const res = await poeChat({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens: 4500,
    temperature: 0.6,
  });

  await emit({ event_type: 'tool_result', payload: { tool: 'poe.chat', tokens: res.usage?.total ?? null, latencyMs: res.latencyMs } });
  await emit({ event_type: 'progress', payload: { pct: 70 } });

  let parsed: ContentJson;
  try {
    parsed = parseJsonFromLLM<ContentJson>(res.content);
  } catch (e) {
    throw new Error(`Optimize model returned unparseable output: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!parsed.articleMarkdown) throw new Error('Optimize produced no article.');

  const faq = Array.isArray(parsed.faq) ? parsed.faq : [];
  const schema = buildFaqSchema(faq);

  await emit({ event_type: 'milestone', payload: { label: 'Assembling page', step: 2, totalSteps: 3 } });
  await emit({ event_type: 'output_chunk', payload: { kind: 'content_title', value: parsed.title } });

  // Assemble a complete, publish-ready Markdown document.
  const faqMd = faq.length
    ? '\n\n## FAQ\n\n' + faq.map((f) => `**${f.question}**\n\n${f.answer}`).join('\n\n')
    : '';
  const schemaBlock = '\n\n---\n\n<!-- JSON-LD: paste into the page <head> for AEO -->\n```json\n' + JSON.stringify(schema, null, 2) + '\n```';
  const fullMarkdown = `# ${parsed.title}\n\n${parsed.articleMarkdown}${faqMd}${schemaBlock}`;

  await emit({ event_type: 'progress', payload: { pct: 100 } });
  await emit({ event_type: 'milestone', payload: { label: 'Content draft ready', step: 3, totalSteps: 3 } });

  const wordCount = parsed.articleMarkdown.split(/\s+/).filter(Boolean).length;
  return {
    summary: `Drafted "${parsed.title}" (${wordCount} words, ${faq.length} FAQ + FAQPage schema) in ${languageName} targeting: ${query}`,
    output: {
      targetQuery: query,
      stage,
      language: langCode,
      title: parsed.title,
      metaDescription: parsed.metaDescription,
      articleMarkdown: parsed.articleMarkdown,
      faq,
      schemaJsonLd: schema,
      fullMarkdown,
      generatedBy: `poe:${res.model}`,
    },
  };
}
