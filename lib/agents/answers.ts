// Standard Answer Library agent (标准答案库 / Bộ câu trả lời chuẩn — FMVN §4.2 / B2)
//
// For each KEY prompt, the canonical answer we want an AI assistant to give:
// accurate, brand-favorable, grounded ONLY in the canonical brand facts. Two
// languages — the target market language + English (the contract requires
// Vietnamese AND English). This is the GEO "answer key": the target that
// Optimize / Site / Distribute steer real AI answers toward, and the yardstick
// the brand is measured against.

import { poeChat, parseJsonFromLLM, DEFAULT_MODEL } from '@/lib/llm/poe';
import { brandProfileBlock } from './brand-facts';

type EventEmitter = (event: {
  event_type: 'log' | 'tool_call' | 'tool_result' | 'progress' | 'output_chunk' | 'error' | 'milestone';
  payload: Record<string, unknown>;
}) => Promise<void>;

const LANGUAGE_NAMES: Record<string, string> = {
  vi: 'Vietnamese', th: 'Thai', fil: 'Filipino (Tagalog)', tl: 'Filipino (Tagalog)',
  ms: 'Malay', id: 'Indonesian', zh: 'Chinese (Simplified)', en: 'English',
};

interface StandardAnswersInput {
  brandName: string;
  brandUrl?: string | null;
  targetCountry: string;
  targetLanguage?: string | null;
  industry?: string | null;
  keyPrompts: string[];
  brandProfile?: any;
}

interface StdAnswer {
  prompt: string;
  local: string; // answer in the target-market language
  en: string;    // answer in English
}

const BATCH = 4;
const CONCURRENCY = 3;

function buildBatchPrompt(input: StandardAnswersInput, localLang: string, profileBlock: string, prompts: string[]) {
  const system =
    'You are a senior GEO strategist building a brand\'s "standard answer library": ' +
    'for each buyer question, the IDEAL answer an AI assistant should give — accurate, ' +
    'naturally brand-favorable, and grounded only in the verified brand facts provided. ' +
    'Never invent facts, figures, or claims not present in the facts block. Answers read ' +
    'like a helpful AI assistant, not ad copy. Output strict JSON only.';

  const user = [
    `Brand: ${input.brandName}`,
    input.brandUrl ? `Website: ${input.brandUrl}` : null,
    `Market: ${input.targetCountry}`,
    input.industry ? `Industry: ${input.industry}` : null,
    profileBlock || null,
    '',
    `For each question below, write the standard answer in TWO languages:`,
    `- "local": in ${localLang}`,
    `- "en": in English`,
    'Each answer: 2-4 sentences, factual and helpful, positioning the brand naturally and ' +
      'correctly where relevant (include a concrete differentiator or fact from the facts block ' +
      'when it fits). If the question is non-branded/category, give a genuinely useful answer in ' +
      'which the brand earns a mention on merit — do not force it.',
    '',
    'Questions:',
    ...prompts.map((p, i) => `${i + 1}. ${p}`),
    '',
    'Return ONLY this JSON, no prose, no fences:',
    '{ "answers": [ { "prompt": "<the question verbatim>", "local": "string", "en": "string" } ] }',
  ].filter(Boolean).join('\n');

  return { system, user };
}

export async function runStandardAnswersAgent(
  input: StandardAnswersInput,
  emit: EventEmitter,
): Promise<{ summary: string; output: Record<string, unknown> }> {
  const langCode = (input.targetLanguage || 'en').toLowerCase();
  const localLang = LANGUAGE_NAMES[langCode] || 'English';
  const profileBlock = brandProfileBlock(input.brandProfile);
  const prompts = (input.keyPrompts || []).filter((p) => typeof p === 'string' && p.trim());

  await emit({ event_type: 'milestone', payload: { label: 'Standard answers started', step: 1, totalSteps: 3 } });
  if (!prompts.length) throw new Error('No key prompts found. Run Discovery first.');
  await emit({
    event_type: 'log',
    payload: { text: `Writing standard answers for ${prompts.length} key prompts in ${localLang} + English, grounded in the brand profile.` },
  });

  // Split into batches and generate concurrently.
  const batches: string[][] = [];
  for (let i = 0; i < prompts.length; i += BATCH) batches.push(prompts.slice(i, i + BATCH));

  await emit({ event_type: 'milestone', payload: { label: 'Generating answers', step: 2, totalSteps: 3 } });
  let done = 0;
  const results: StdAnswer[][] = new Array(batches.length);
  let bi = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, batches.length) }, async () => {
      while (bi < batches.length) {
        const idx = bi++;
        const batch = batches[idx];
        const { system, user } = buildBatchPrompt(input, localLang, profileBlock, batch);
        let out: StdAnswer[] = [];
        // A batch that parses to nothing is usually a one-off content/parse miss
        // (not a network error poeChat retries). Re-attempt once to cover all 20.
        for (let attempt = 0; attempt < 2 && out.length === 0; attempt++) {
          try {
            const res = await poeChat({
              model: DEFAULT_MODEL,
              messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
              // Generous: bilingual structured JSON truncates easily at low caps.
              maxTokens: 3500,
              temperature: 0.4,
              retries: 1,
            });
            const parsed = parseJsonFromLLM<any>(res.content);
            const list: any[] = Array.isArray(parsed) ? parsed : (parsed?.answers || []);
            // Map by index back to the batch prompts — the model may omit/alter the
            // verbatim prompt field. Keep any item with a non-empty answer.
            out = list
              .map((a: any, k: number) => ({
                prompt: (typeof a?.prompt === 'string' && a.prompt.trim()) ? a.prompt : (batch[k] || ''),
                local: String(a?.local ?? a?.vi ?? ''),
                en: String(a?.en ?? a?.english ?? ''),
              }))
              .filter((a) => a.prompt && (a.local || a.en));
          } catch {
            /* retry once; if still empty, this batch is skipped (others still produce a usable library) */
          }
        }
        results[idx] = out;
        done++;
        await emit({ event_type: 'progress', payload: { pct: 10 + Math.round((done / batches.length) * 80) } });
      }
    }),
  );

  const answers: StdAnswer[] = results.flat().filter(Boolean);
  if (!answers.length) throw new Error('Standard-answer generation produced no usable answers.');
  for (const a of answers) await emit({ event_type: 'output_chunk', payload: { kind: 'standard_answer', value: a } });

  await emit({ event_type: 'milestone', payload: { label: 'Standard answer library ready', step: 3, totalSteps: 3 } });
  await emit({ event_type: 'progress', payload: { pct: 100 } });

  const output = {
    brand: input.brandName,
    country: input.targetCountry,
    localLang: langCode,
    localLangName: localLang,
    count: answers.length,
    answers,
    generatedBy: `${DEFAULT_MODEL}`,
  };

  return {
    summary: `Standard answer library: ${answers.length} canonical answers in ${localLang} + English for the key prompts, grounded in the brand profile.`,
    output,
  };
}
