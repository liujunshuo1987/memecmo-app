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

interface Framing {
  industry: string;
  subVerticals: string[];
  audienceNote?: string;
}

// Contract (FMVN §4.2): ≥100 core prompts, of which 20 are designated "key"
// for close monitoring. We generate per funnel stage (≥22 each × 5 ≥ 100) so
// each stage is focused and non-redundant, and the model flags the highest-
// value prompts per stage → ~20 key total.
const STAGES: { category: string; label: string; intent: string; keyPerStage: number }[] = [
  { category: 'discovery', label: 'Awareness / discovery', keyPerStage: 5,
    intent: 'broad NON-branded questions a buyer asks when they first realize a need — category education, "how / what / best way to", no specific brand in mind yet' },
  { category: 'consideration', label: 'Consideration / research', keyPerStage: 5,
    intent: 'comparing approaches and vendor types, "best <category> in <market>", shortlist-building, mostly non-branded' },
  { category: 'evaluation', label: 'Evaluation / decision', keyPerStage: 4,
    intent: 'narrowing to a choice — pricing, capabilities, proof, ROI, "is X good for Y"' },
  { category: 'competitive', label: 'Competitive comparison', keyPerStage: 4,
    intent: 'head-to-head and "alternatives to" queries that name the category leaders in this market' },
  { category: 'trust', label: 'Trust / local intent', keyPerStage: 2,
    intent: 'reviews, reliability, local presence, contact, reputation, "is <brand> legit / reliable in <market>"' },
];
const PROMPTS_PER_STAGE = 22; // 5 × 22 = 110 ≥ 100 (headroom for dedup)
const KEY_TARGET = 20;

const SYSTEM =
  'You are a senior Generative Engine Optimization (GEO) strategist. You design ' +
  'the exact set of natural-language questions that real buyers ask AI assistants ' +
  '(ChatGPT, Gemini, Perplexity, Claude) during their journey, so a brand can be ' +
  'measured and optimized for visibility in AI answers. You think like a local ' +
  'buyer in the target market, not like a marketer. Output strict JSON only.';

function framingPrompt(input: DiscoveryInput) {
  const { brandName, brandUrl, targetCountry, industry, userPrompt } = input;
  return [
    `Brand: ${brandName}`,
    brandUrl ? `Website: ${brandUrl}` : null,
    `Target market: ${targetCountry}`,
    industry ? `Known industry: ${industry}` : 'Industry: infer it yourself from the brand.',
    userPrompt ? `Extra context from the user: ${userPrompt}` : null,
    '',
    'Infer the strategic frame for a GEO prompt library. Return ONLY this JSON:',
    '{ "industry": "string", "subVerticals": ["3-6 sub-verticals the brand competes in"],',
    '  "audienceNote": "one sentence on who the buyer is" }',
  ].filter(Boolean).join('\n');
}

function stagePrompt(input: DiscoveryInput, languageName: string, framing: Framing, stage: typeof STAGES[number]) {
  const { brandName, targetCountry, userPrompt } = input;
  return [
    `Brand: ${brandName}`,
    `Target market: ${targetCountry}`,
    `Output language for all prompts: ${languageName}`,
    `Industry: ${framing.industry}`,
    `Sub-verticals: ${(framing.subVerticals || []).join(', ')}`,
    userPrompt ? `Extra context from the user: ${userPrompt}` : null,
    '',
    `Funnel stage: ${stage.label} — ${stage.intent}`,
    '',
    `Task: write EXACTLY ${PROMPTS_PER_STAGE} natural-language prompts a real buyer in ` +
      `${targetCountry} would type or speak to an AI assistant at THIS funnel stage.`,
    '',
    'Requirements:',
    `- EVERY prompt MUST be in ${languageName}, phrased how a real local person would ask — natural, colloquial, specific. Do NOT translate stiffly from English.`,
    '- Non-redundant: no two prompts may be paraphrases of each other.',
    '- Span the sub-verticals listed above.',
    `- Then mark the ${stage.keyPerStage} MOST commercially important of them (where being recommended by the AI matters most to revenue) as "key".`,
    '',
    'Return ONLY this JSON, no prose, no markdown fences:',
    '{ "prompts": ["string", ...], "key": ["the exact subset of prompts that are most important"] }',
  ].filter(Boolean).join('\n');
}

function normPrompt(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
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
      text: `Profiling ${brandName} for ${targetCountry} — building a ≥100-prompt library in ${languageName}.`,
    },
  });

  // ── Phase 1: framing (industry, sub-verticals, audience) ──────────────────
  await emit({ event_type: 'tool_call', payload: { tool: 'poe.chat', args: { model: DEFAULT_MODEL, purpose: 'Frame GEO library' } } });
  await emit({ event_type: 'progress', payload: { pct: 10 } });
  const framingRes = await poeChat({
    model: DEFAULT_MODEL,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: framingPrompt(input) }],
    maxTokens: 500,
    temperature: 0.4,
  });
  let framing: Framing;
  try {
    framing = parseJsonFromLLM<Framing>(framingRes.content);
  } catch {
    framing = { industry: input.industry || 'unknown', subVerticals: [], audienceNote: undefined };
  }
  if (!framing.industry) framing.industry = input.industry || 'unknown';

  await emit({
    event_type: 'milestone',
    payload: { label: 'Framed — generating prompts per stage', step: 2, totalSteps: 4 },
  });
  await emit({
    event_type: 'log',
    payload: { text: `Industry: ${framing.industry}. Sub-verticals: ${(framing.subVerticals || []).join(', ')}.` },
  });

  // ── Phase 2: per-stage generation (parallel, bounded) ─────────────────────
  let staged = 0;
  async function genStage(stage: typeof STAGES[number]): Promise<PromptCategory & { keyLocal: string[] }> {
    let prompts: string[] = [];
    let key: string[] = [];
    try {
      const res = await poeChat({
        model: DEFAULT_MODEL,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: stagePrompt(input, languageName, framing, stage) }],
        maxTokens: 2200,
        temperature: 0.6,
        retries: 1,
      });
      const parsed = parseJsonFromLLM<{ prompts?: string[]; key?: string[] }>(res.content);
      prompts = Array.isArray(parsed.prompts) ? parsed.prompts.filter((p) => typeof p === 'string' && p.trim()) : [];
      key = Array.isArray(parsed.key) ? parsed.key.filter((p) => typeof p === 'string' && p.trim()) : [];
    } catch {
      /* a failed stage yields no prompts; others still produce a usable library */
    }
    staged++;
    await emit({ event_type: 'progress', payload: { pct: 20 + Math.round((staged / STAGES.length) * 60) } });
    const cat: PromptCategory & { keyLocal: string[] } = {
      category: stage.category,
      label: stage.label,
      prompts,
      keyLocal: key,
    };
    await emit({ event_type: 'output_chunk', payload: { kind: 'prompt_category', value: { category: cat.category, label: cat.label, prompts: cat.prompts } } });
    return cat;
  }

  // Concurrency 3 keeps load gentle while ~halving wall-clock vs sequential.
  const results: (PromptCategory & { keyLocal: string[] })[] = new Array(STAGES.length);
  let si = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, STAGES.length) }, async () => {
      while (si < STAGES.length) {
        const idx = si++;
        results[idx] = await genStage(STAGES[idx]);
      }
    }),
  );

  // ── Assemble: dedupe across stages, collect ~20 key prompts ───────────────
  const seen = new Set<string>();
  const promptSet: PromptCategory[] = [];
  const keyAll: string[] = [];
  for (const cat of results) {
    if (!cat) continue;
    const deduped: string[] = [];
    const localKeySet = new Set(cat.keyLocal.map(normPrompt));
    for (const p of cat.prompts) {
      const n = normPrompt(p);
      if (n.length < 4 || seen.has(n)) continue;
      seen.add(n);
      deduped.push(p);
      // Collect key prompts (weighted: top stages already get more keyPerStage).
      if (localKeySet.has(n) && keyAll.length < KEY_TARGET * 2) keyAll.push(p);
    }
    if (deduped.length) promptSet.push({ category: cat.category, label: cat.label, prompts: deduped });
  }

  if (promptSet.length === 0) throw new Error('Discovery produced an empty prompt set.');

  // Cap key prompts to KEY_TARGET; if the model under-flagged, top up with the
  // first prompts of the highest-intent stages so we always designate ~20.
  let keyPrompts = Array.from(new Set(keyAll.map((p) => p))).slice(0, KEY_TARGET);
  if (keyPrompts.length < KEY_TARGET) {
    const keyNorm = new Set(keyPrompts.map(normPrompt));
    outer: for (const cat of promptSet) {
      for (const p of cat.prompts) {
        if (keyPrompts.length >= KEY_TARGET) break outer;
        if (!keyNorm.has(normPrompt(p))) { keyPrompts.push(p); keyNorm.add(normPrompt(p)); }
      }
    }
  }

  const promptCount = promptSet.reduce((n, c) => n + c.prompts.length, 0);

  await emit({ event_type: 'progress', payload: { pct: 85 } });
  await emit({ event_type: 'milestone', payload: { label: 'Persisting asset', step: 3, totalSteps: 4 } });
  await emit({
    event_type: 'log',
    payload: { text: `Library: ${promptCount} prompts across ${promptSet.length} stages · ${keyPrompts.length} key prompts for close monitoring.` },
  });

  const finalOutput = {
    brand: brandName,
    country: targetCountry,
    language: langCode,
    industry: framing.industry,
    subVerticals: framing.subVerticals || [],
    audienceNote: framing.audienceNote || null,
    promptSet,
    promptCount,
    keyPrompts,
    keyCount: keyPrompts.length,
    model: framingRes.model,
    generatedBy: `poe:${framingRes.model}`,
  };

  await emit({ event_type: 'progress', payload: { pct: 100 } });
  await emit({ event_type: 'milestone', payload: { label: 'Discovery complete', step: 4, totalSteps: 4 } });

  return {
    summary: `Generated a ${promptCount}-prompt GEO library across ${promptSet.length} funnel stages in ${languageName} (${keyPrompts.length} key prompts for close monitoring). Industry: ${framing.industry}.`,
    output: finalOutput,
  };
}
