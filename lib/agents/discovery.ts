// Discovery Agent (v0.6 — real LLM implementation via Poe)
//
// Generates a GEO "prompt set": the real-world queries a buyer in the target
// market would type into ChatGPT / Gemini / Perplexity, organized by funnel
// stage and written in the target language. This prompt set is the input the
// Monitor agent later runs against each engine to measure share-of-voice.

import { poeChat, parseJsonFromLLM, DEFAULT_MODEL } from '@/lib/llm/poe';

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

interface DiscoveryInput {
  brandName: string;
  brandUrl?: string | null;
  targetCountry: string;
  targetLanguage?: string | null;
  industry?: string | null;
  userPrompt?: string;
}

// Map ISO-ish language codes to names the model understands unambiguously.
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

interface PromptCategory {
  category: string;
  label: string;
  prompts: string[];
}

interface DiscoveryParsed {
  industry: string;
  subVerticals: string[];
  audienceNote?: string;
  promptSet: PromptCategory[];
}

const TARGET_CATEGORIES = 5;
const PROMPTS_PER_CATEGORY = 6;

function buildPrompt(input: DiscoveryInput, languageName: string) {
  const { brandName, brandUrl, targetCountry, industry, userPrompt } = input;

  const system =
    'You are a senior Generative Engine Optimization (GEO) strategist. You design ' +
    'the exact set of natural-language questions that real buyers ask AI assistants ' +
    '(ChatGPT, Gemini, Perplexity, Claude) during their journey, so a brand can be ' +
    'measured and optimized for visibility in AI answers. You think like a local ' +
    'buyer in the target market, not like a marketer. Output strict JSON only.';

  const user = [
    `Brand: ${brandName}`,
    brandUrl ? `Website: ${brandUrl}` : null,
    `Target market: ${targetCountry}`,
    `Output language for all prompts: ${languageName}`,
    industry ? `Known industry: ${industry}` : 'Industry: infer it yourself from the brand.',
    userPrompt ? `Extra context from the user: ${userPrompt}` : null,
    '',
    'Task: produce a GEO prompt set for this brand in this market.',
    '',
    'Requirements:',
    `- ${TARGET_CATEGORIES} funnel-stage categories covering: awareness/discovery, ` +
      'consideration/research, evaluation/decision, competitive comparison, and ' +
      'trust/local-intent (reviews, reliability, local presence).',
    `- About ${PROMPTS_PER_CATEGORY} prompts per category.`,
    `- EVERY prompt MUST be written in ${languageName}, phrased exactly how a real ` +
      `person in ${targetCountry} would type or speak it to an AI assistant — natural, ` +
      'colloquial, specific. Do NOT translate stiffly from English.',
    '- Prompts should be answerable by an AI and relevant to whether this brand ' +
      'would surface (mix branded and non-branded/category queries; non-branded ' +
      'queries are where GEO visibility is won).',
    '- Infer 3-6 sub-verticals the brand competes in.',
    '',
    'Return ONLY this JSON shape, no prose, no markdown fences:',
    '{',
    '  "industry": "string",',
    '  "subVerticals": ["string"],',
    '  "audienceNote": "one sentence on who the buyer is",',
    '  "promptSet": [',
    '    { "category": "discovery|consideration|evaluation|competitive|trust",',
    '      "label": "short human label", "prompts": ["string"] }',
    '  ]',
    '}',
  ]
    .filter(Boolean)
    .join('\n');

  return { system, user };
}

export async function runDiscoveryAgent(
  input: DiscoveryInput,
  emit: EventEmitter,
): Promise<{ summary: string; output: Record<string, unknown> }> {
  const { brandName, targetCountry } = input;
  const langCode = (input.targetLanguage || 'en').toLowerCase();
  const languageName = LANGUAGE_NAMES[langCode] || 'English';

  await emit({
    event_type: 'milestone',
    payload: { label: 'Discovery started', step: 1, totalSteps: 4 },
  });
  await emit({
    event_type: 'log',
    payload: {
      text: `Profiling ${brandName} for ${targetCountry} — generating prompts in ${languageName}.`,
    },
  });

  const { system, user } = buildPrompt(input, languageName);

  await emit({
    event_type: 'tool_call',
    payload: {
      tool: 'poe.chat',
      args: { model: DEFAULT_MODEL, purpose: 'Generate GEO prompt set' },
    },
  });
  await emit({ event_type: 'progress', payload: { pct: 15 } });

  const result = await poeChat({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens: 3000,
    temperature: 0.6,
  });

  await emit({
    event_type: 'tool_result',
    payload: {
      tool: 'poe.chat',
      model: result.model,
      latencyMs: result.latencyMs,
      tokens: result.usage?.total ?? null,
    },
  });
  await emit({ event_type: 'progress', payload: { pct: 55 } });

  // Parse — fail loudly if the model returned something unusable.
  let parsed: DiscoveryParsed;
  try {
    parsed = parseJsonFromLLM<DiscoveryParsed>(result.content);
  } catch (e) {
    throw new Error(
      `Discovery model returned unparseable output: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const promptSet = Array.isArray(parsed.promptSet) ? parsed.promptSet : [];
  if (promptSet.length === 0) {
    throw new Error('Discovery produced an empty prompt set.');
  }

  await emit({
    event_type: 'milestone',
    payload: { label: 'Prompt set generated', step: 2, totalSteps: 4 },
  });
  await emit({
    event_type: 'log',
    payload: {
      text: `Industry: ${parsed.industry}. Sub-verticals: ${(parsed.subVerticals || []).join(', ')}.`,
    },
  });

  // Stream each category to the UI activity feed.
  for (const cat of promptSet) {
    await emit({
      event_type: 'output_chunk',
      payload: { kind: 'prompt_category', value: cat },
    });
  }

  const promptCount = promptSet.reduce(
    (n, c) => n + (Array.isArray(c.prompts) ? c.prompts.length : 0),
    0,
  );

  await emit({ event_type: 'progress', payload: { pct: 85 } });
  await emit({
    event_type: 'milestone',
    payload: { label: 'Persisting asset', step: 3, totalSteps: 4 },
  });

  const finalOutput = {
    brand: brandName,
    country: targetCountry,
    language: langCode,
    industry: parsed.industry,
    subVerticals: parsed.subVerticals || [],
    audienceNote: parsed.audienceNote || null,
    promptSet,
    promptCount,
    model: result.model,
    usage: result.usage || null,
    generatedBy: `poe:${result.model}`,
  };

  await emit({ event_type: 'progress', payload: { pct: 100 } });
  await emit({
    event_type: 'milestone',
    payload: { label: 'Discovery complete', step: 4, totalSteps: 4 },
  });

  return {
    summary: `Generated ${promptCount} GEO prompts across ${promptSet.length} funnel stages in ${languageName}. Industry: ${parsed.industry}.`,
    output: finalOutput,
  };
}
