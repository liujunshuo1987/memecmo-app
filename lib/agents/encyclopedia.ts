// Encyclopedia Agent (v1.4 — highest-authority citation surface)
//
// Wikipedia is the single source AI answer engines trust most. But it has hard
// rules — notability (independent coverage), neutral tone, verifiability, no
// self-promotion. A foolproof-but-HONEST agent does not spit out an article
// that would be deleted: it (1) assesses notability candidly, (2) if eligible,
// drafts a neutral, citation-scaffolded entry, (3) if not yet eligible, gives
// the realistic path — build coverage first (PR), and get mentioned in EXISTING
// relevant articles meanwhile.

import { poeChat, parseJsonFromLLM, DEFAULT_MODEL } from '@/lib/llm/poe';
import { brandProfileBlock } from './brand-facts';
import { stateFrameBlock } from './state-frames';

type EventEmitter = (event: {
  event_type: 'log' | 'tool_call' | 'tool_result' | 'progress' | 'output_chunk' | 'error' | 'milestone';
  payload: Record<string, unknown>;
}) => Promise<void>;

interface EncyclopediaInput {
  brandName: string;
  brandUrl?: string | null;
  targetCountry: string;
  targetLanguage?: string | null;
  industry?: string | null;
  sources?: { domain: string; citations: number; isBrand: boolean }[];
  brandProfile?: any;
}

const LANGUAGE_NAMES: Record<string, string> = {
  vi: 'Vietnamese', th: 'Thai', fil: 'Filipino (Tagalog)', tl: 'Filipino (Tagalog)',
  ms: 'Malay', id: 'Indonesian', zh: 'Chinese (Simplified)', en: 'English',
};
const WIKI_BY_LANG: Record<string, string> = {
  vi: 'vi.wikipedia.org', th: 'th.wikipedia.org', fil: 'tl.wikipedia.org', tl: 'tl.wikipedia.org',
  ms: 'ms.wikipedia.org', id: 'id.wikipedia.org', zh: 'zh.wikipedia.org', en: 'en.wikipedia.org',
};

interface EncyclopediaJson {
  notability: { verdict: 'likely' | 'borderline' | 'not_yet'; reasoning: string; evidenceNeeded: string[] };
  recommendedApproach: 'standalone_article' | 'contribute_to_existing' | 'build_notability_first';
  draftArticle: { title: string; lead: string; sections: { heading: string; content: string }[] };
  citationPlan: { claim: string; sourceType: string; status: 'have' | 'need' }[];
  existingArticleTargets: { article: string; howToGetMentioned: string }[];
}

export async function runEncyclopediaAgent(
  input: EncyclopediaInput,
  emit: EventEmitter,
): Promise<{ summary: string; output: Record<string, unknown> }> {
  const langCode = (input.targetLanguage || 'en').toLowerCase();
  const languageName = LANGUAGE_NAMES[langCode] || 'English';
  const targetWiki = WIKI_BY_LANG[langCode] || 'en.wikipedia.org';

  await emit({ event_type: 'milestone', payload: { label: 'Encyclopedia assessment started', step: 1, totalSteps: 3 } });

  // Independent coverage already citing the brand → notability evidence.
  const independent = (input.sources || []).filter((s) => !s.isBrand).slice(0, 12);
  await emit({
    event_type: 'log',
    payload: {
      text: independent.length
        ? `Weighing notability against ${independent.length} independent sources that cite ${input.brandName}.`
        : `Assessing ${input.brandName} notability for ${targetWiki}.`,
    },
  });

  const system =
    'You are a Wikipedia editor and AEO strategist. You uphold Wikipedia standards — ' +
    'notability (significant INDEPENDENT coverage), neutral point of view, verifiability, ' +
    'no promotion. You are HONEST: if a brand is not yet notable, you say so and give the ' +
    'realistic path instead of a deletion-bait article. Output strict JSON only.';

  const sourceLines = independent.length
    ? independent.map((s) => `- ${s.domain} (cited ${s.citations}×)`).join('\n')
    : '(no independent coverage data available — judge conservatively)';

  const user = [
    `Brand: ${input.brandName}` + (input.brandUrl ? ` (${input.brandUrl})` : ''),
    `Market: ${input.targetCountry}` + (input.industry ? ` · ${input.industry}` : ''),
    `Target encyclopedia: ${targetWiki}. Write the draft + prose in ${languageName}.`,
    '',
    'Independent sources observed citing this brand (notability signal):',
    sourceLines,
    '',
    brandProfileBlock(input.brandProfile) + stateFrameBlock(input.targetCountry, input.industry),
    '',
    'Assess and produce JSON of this exact shape:',
    '{',
    '  "notability": { "verdict": "likely|borderline|not_yet", "reasoning": "honest, per Wikipedia notability (independent significant coverage)", "evidenceNeeded": ["specific independent sources/coverage required to qualify"] },',
    '  "recommendedApproach": "standalone_article|contribute_to_existing|build_notability_first",',
    '  "draftArticle": { "title": "article title", "lead": "neutral lead paragraph (no promotion)", "sections": [{ "heading": "...", "content": "neutral encyclopedic prose" }] },',
    '  "citationPlan": [{ "claim": "statement in the draft", "sourceType": "what kind of independent source supports it", "status": "have|need" }],',
    '  "existingArticleTargets": [{ "article": "existing Wikipedia article where this brand could be neutrally mentioned (e.g. Out-of-home advertising in ' + input.targetCountry + ')", "howToGetMentioned": "the neutral, sourced addition to make" }]',
    '}',
    'Rules: be candid in the verdict. If not_yet/borderline, still provide a SHORT draft (so it is ready when notability is reached) but emphasize existingArticleTargets + build_notability_first. Keep the draft to a lead + 2-4 short sections. All prose in ' + languageName + '. Return ONLY the JSON.',
  ].join('\n');

  await emit({ event_type: 'tool_call', payload: { tool: 'engine.chat', args: { model: DEFAULT_MODEL, purpose: 'Encyclopedia notability + draft' } } });
  await emit({ event_type: 'progress', payload: { pct: 40 } });

  const res = await poeChat({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens: 7000,
    temperature: 0.4,
  });

  await emit({ event_type: 'tool_result', payload: { tool: 'engine.chat', tokens: res.usage?.total ?? null, latencyMs: res.latencyMs } });
  await emit({ event_type: 'progress', payload: { pct: 75 } });

  let parsed: EncyclopediaJson;
  try {
    parsed = parseJsonFromLLM<EncyclopediaJson>(res.content);
  } catch (e) {
    throw new Error(`Encyclopedia model returned unparseable output: ${e instanceof Error ? e.message : String(e)}`);
  }
  const verdict = parsed.notability?.verdict || 'not_yet';

  await emit({ event_type: 'milestone', payload: { label: 'Assembling entry + path', step: 2, totalSteps: 3 } });
  await emit({ event_type: 'output_chunk', payload: { kind: 'notability', value: { verdict, approach: parsed.recommendedApproach } } });

  const da = parsed.draftArticle || { title: input.brandName, lead: '', sections: [] };
  const md = [
    `# ${input.brandName} — Encyclopedia (${targetWiki})`,
    '',
    `**Notability: ${verdict.toUpperCase()}** · approach: ${parsed.recommendedApproach}`,
    '',
    parsed.notability?.reasoning || '',
    '',
    (parsed.notability?.evidenceNeeded?.length ? '## Evidence needed to qualify\n' + parsed.notability.evidenceNeeded.map((e) => `- ${e}`).join('\n') + '\n' : ''),
    `## Draft article — ${da.title}`,
    '',
    da.lead,
    '',
    ...(da.sections || []).flatMap((s) => [`### ${s.heading}`, s.content, '']),
    '## Citation plan',
    ...(parsed.citationPlan || []).map((c) => `- [${c.status === 'have' ? 'x' : ' '}] **${c.claim}** — ${c.sourceType} (${c.status})`),
    '',
    '## Get mentioned in existing articles (works before standalone notability)',
    ...(parsed.existingArticleTargets || []).flatMap((t) => [`### ${t.article}`, t.howToGetMentioned, '']),
  ].join('\n');

  await emit({ event_type: 'progress', payload: { pct: 100 } });
  await emit({ event_type: 'milestone', payload: { label: 'Encyclopedia plan ready', step: 3, totalSteps: 3 } });

  const needCount = (parsed.citationPlan || []).filter((c) => c.status === 'need').length;
  return {
    summary: `Encyclopedia: notability ${verdict} → ${parsed.recommendedApproach}. Draft + ${(parsed.citationPlan || []).length} citations (${needCount} to source) + ${(parsed.existingArticleTargets || []).length} existing-article targets, for ${targetWiki}.`,
    output: {
      targetWiki,
      language: langCode,
      notability: parsed.notability,
      recommendedApproach: parsed.recommendedApproach,
      draftArticle: da,
      citationPlan: parsed.citationPlan || [],
      existingArticleTargets: parsed.existingArticleTargets || [],
      fullMarkdown: md,
      generatedBy: `${res.model}`,
    },
  };
}
