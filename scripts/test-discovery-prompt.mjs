// Local validation of the Discovery prompt against real Poe (via the dev
// proxy, since local DNS poisons api.poe.com). Mirrors lib/agents/discovery.ts
// buildPrompt + parseJsonFromLLM so we can iterate on prompt quality without a
// deploy. Production uses plain fetch (no proxy needed there).

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const TARGET_CATEGORIES = 5;
const PROMPTS_PER_CATEGORY = 6;
const DEFAULT_MODEL = 'Claude-Sonnet-4.5';

const input = {
  brandName: 'Focus Media Vietnam',
  brandUrl: null,
  targetCountry: 'Vietnam',
  industry: 'Elevator media / OOH digital signage',
};
const languageName = 'Vietnamese';

const system =
  'You are a senior Generative Engine Optimization (GEO) strategist. You design ' +
  'the exact set of natural-language questions that real buyers ask AI assistants ' +
  '(ChatGPT, Gemini, Perplexity, Claude) during their journey, so a brand can be ' +
  'measured and optimized for visibility in AI answers. You think like a local ' +
  'buyer in the target market, not like a marketer. Output strict JSON only.';

const user = [
  `Brand: ${input.brandName}`,
  input.brandUrl ? `Website: ${input.brandUrl}` : null,
  `Target market: ${input.targetCountry}`,
  `Output language for all prompts: ${languageName}`,
  input.industry ? `Known industry: ${input.industry}` : 'Industry: infer it yourself from the brand.',
  '',
  'Task: produce a GEO prompt set for this brand in this market.',
  '',
  'Requirements:',
  `- ${TARGET_CATEGORIES} funnel-stage categories covering: awareness/discovery, ` +
    'consideration/research, evaluation/decision, competitive comparison, and ' +
    'trust/local-intent (reviews, reliability, local presence).',
  `- About ${PROMPTS_PER_CATEGORY} prompts per category.`,
  `- EVERY prompt MUST be written in ${languageName}, phrased exactly how a real ` +
    `person in ${input.targetCountry} would type or speak it to an AI assistant — natural, ` +
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

function parseJsonFromLLM(text) {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const s = Math.min(
      ...[candidate.indexOf('{'), candidate.indexOf('[')].filter((i) => i !== -1),
    );
    const e = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
    return JSON.parse(candidate.slice(s, e + 1));
  }
}

const payload = JSON.stringify({
  model: DEFAULT_MODEL,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ],
  max_tokens: 3000,
  temperature: 0.6,
});

console.log('Calling Poe (via proxy)…');
const t0 = Date.now();
const raw = execFileSync(
  'curl',
  [
    '-s', '-x', 'http://127.0.0.1:7890', '--max-time', '90',
    'https://api.poe.com/v1/chat/completions',
    '-H', `Authorization: Bearer ${env.POE_API_KEY}`,
    '-H', 'Content-Type: application/json',
    '-d', payload,
  ],
  { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
);
const latency = Date.now() - t0;

const api = JSON.parse(raw);
const content = api?.choices?.[0]?.message?.content ?? '';
console.log(`HTTP ok in ${latency}ms, ${api?.usage?.total_tokens ?? '?'} tokens\n`);

const parsed = parseJsonFromLLM(content);
const count = (parsed.promptSet || []).reduce((n, c) => n + (c.prompts?.length || 0), 0);

console.log('industry   :', parsed.industry);
console.log('subVerticals:', (parsed.subVerticals || []).join(', '));
console.log('audience   :', parsed.audienceNote);
console.log(`categories : ${parsed.promptSet?.length}, total prompts: ${count}\n`);
for (const c of parsed.promptSet || []) {
  console.log(`▶ [${c.category}] ${c.label} (${c.prompts?.length})`);
  for (const p of (c.prompts || []).slice(0, 2)) console.log(`    · ${p}`);
}

// Shape assertions
const ok =
  typeof parsed.industry === 'string' &&
  Array.isArray(parsed.subVerticals) &&
  Array.isArray(parsed.promptSet) &&
  parsed.promptSet.length >= 3 &&
  count >= 15;
console.log(`\n${ok ? '✔ shape OK' : '✗ shape FAILED'} (categories>=3, prompts>=15)`);
process.exit(ok ? 0 : 2);
