// Brand Profile Agent (v1.5 — the canonical fact base)
//
// Builds ONE authoritative brand profile (identity, services, differentiators,
// quantitative facts, NAP, audience) by fetching the homepage and synthesizing.
// Every execution agent (Optimize / Site / Distribute / Encyclopedia / Report)
// then pulls these canonical facts so deliverables stay consistent instead of
// each agent independently inventing brand facts. The foundation of the suite.

import { poeChat, parseJsonFromLLM, DEFAULT_MODEL } from '@/lib/llm/poe';
import { fetchSite, type FetchedSite } from './site';

type EventEmitter = (event: {
  event_type: 'log' | 'tool_call' | 'tool_result' | 'progress' | 'output_chunk' | 'error' | 'milestone';
  payload: Record<string, unknown>;
}) => Promise<void>;

interface ProfileInput {
  brandName: string;
  brandUrl?: string | null;
  targetCountry: string;
  targetLanguage?: string | null;
  industry?: string | null;
  hints?: { subVerticals?: string[]; competitors?: string[] };
}

export interface BrandProfile {
  definition: string; // one-line "what it is" for AI entity clarity
  description: string; // 2-3 sentence neutral description
  category: string;
  services: string[];
  differentiators: string[];
  facts: { label: string; value: string }[];
  nap: { name?: string; address?: string; phone?: string; email?: string; website?: string };
  audience: string;
  subVerticals: string[];
  competitors: string[];
  confidence: string; // what's verified from the site vs inferred
}

export async function runProfileAgent(
  input: ProfileInput,
  emit: EventEmitter,
): Promise<{ summary: string; output: Record<string, unknown> }> {
  await emit({ event_type: 'milestone', payload: { label: 'Brand profile started', step: 1, totalSteps: 3 } });

  let site: FetchedSite = { ok: false, title: '', metaDesc: '', existingSchema: [], text: '' };
  if (input.brandUrl) {
    await emit({ event_type: 'tool_call', payload: { tool: 'web.fetch', args: { url: input.brandUrl } } });
    site = await fetchSite(input.brandUrl);
    await emit({ event_type: 'tool_result', payload: site.ok ? { tool: 'web.fetch', title: site.title, chars: site.text.length } : { tool: 'web.fetch', error: site.error } });
  }
  await emit({
    event_type: 'log',
    payload: { text: site.ok ? `Synthesizing canonical profile from ${input.brandUrl}.` : `No homepage fetched — building profile from brand knowledge.` },
  });
  await emit({ event_type: 'progress', payload: { pct: 40 } });

  const system =
    'You are a brand analyst. Build a single canonical brand profile that other ' +
    'agents will reuse, so every output is factually consistent. Prefer facts ' +
    'verifiable from the homepage; clearly separate inferred items. Use neutral, ' +
    'precise language. Output strict JSON only.';

  const user = [
    `Brand: ${input.brandName}` + (input.brandUrl ? ` (${input.brandUrl})` : ''),
    `Market: ${input.targetCountry}` + (input.industry ? ` · ${input.industry}` : ''),
    input.hints?.subVerticals?.length ? `Known sub-verticals: ${input.hints.subVerticals.join(', ')}` : null,
    input.hints?.competitors?.length ? `Known competitors: ${input.hints.competitors.join(', ')}` : null,
    '',
    'Homepage signal:',
    site.ok ? `Title: ${site.title}\nMeta: ${site.metaDesc}\nText (truncated):\n${site.text}` : '(homepage not fetched — infer from brand/industry, mark as inferred)',
    '',
    'Return the canonical profile as JSON of this exact shape (write values in English; ' +
      'keep proper nouns, brand names, addresses, and service names as they actually appear):',
    '{',
    '  "definition": "one precise sentence: what the brand IS",',
    '  "description": "2-3 neutral sentences",',
    '  "category": "primary category",',
    '  "services": ["core service/product"],',
    '  "differentiators": ["what sets it apart"],',
    '  "facts": [{ "label": "e.g. Founded / Coverage / Scale", "value": "the fact" }],',
    '  "nap": { "name": "", "address": "", "phone": "", "email": "", "website": "" },',
    '  "audience": "who it serves",',
    '  "subVerticals": ["..."],',
    '  "competitors": ["..."],',
    '  "confidence": "one line: what is verified from the site vs inferred"',
    '}',
    'Rules: only include facts/NAP you can support from the homepage or that are well-established; ' +
      'leave NAP fields empty if unknown rather than inventing. Return ONLY the JSON.',
  ]
    .filter(Boolean)
    .join('\n');

  await emit({ event_type: 'tool_call', payload: { tool: 'engine.chat', args: { model: DEFAULT_MODEL, purpose: 'Synthesize brand profile' } } });
  await emit({ event_type: 'progress', payload: { pct: 60 } });

  const res = await poeChat({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens: 2500,
    temperature: 0.3,
  });

  await emit({ event_type: 'tool_result', payload: { tool: 'engine.chat', tokens: res.usage?.total ?? null, latencyMs: res.latencyMs } });
  await emit({ event_type: 'progress', payload: { pct: 85 } });

  let p: BrandProfile;
  try {
    p = parseJsonFromLLM<BrandProfile>(res.content);
  } catch (e) {
    throw new Error(`Profile model returned unparseable output: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!p.definition && !(p.services || []).length) throw new Error('Profile produced no usable facts.');

  await emit({ event_type: 'milestone', payload: { label: 'Profile compiled', step: 2, totalSteps: 3 } });
  await emit({ event_type: 'output_chunk', payload: { kind: 'profile', value: { definition: p.definition, services: (p.services || []).length } } });

  await emit({ event_type: 'progress', payload: { pct: 100 } });
  await emit({ event_type: 'milestone', payload: { label: 'Brand profile ready', step: 3, totalSteps: 3 } });

  return {
    summary: `Canonical brand profile: ${p.definition} (${(p.services || []).length} services, ${(p.facts || []).length} facts). ${site.ok ? 'Verified against homepage.' : 'From brand knowledge.'}`,
    output: { ...p, sourcedFromHomepage: site.ok, generatedBy: `${res.model}` },
  };
}
