// Distribution Agent (v1.2 — closes the execution loop)
//
// AI answer engines cite authoritative THIRD-PARTY sources — directories,
// industry media, review/comparison sites, social, Wikipedia. The Source-
// Authority Index already tells us which domains the engines actually cite for
// this brand/market. This agent turns those targets into ready-to-send
// submission assets (a listing/pitch per source, in the target language), so
// the brand can get featured/cited where it currently isn't. Measure → Report
// → Optimize (own content) → Distribute (third-party citations).

import { poeChat, parseJsonFromLLM, DEFAULT_MODEL } from '@/lib/llm/poe';
import { brandProfileBlock } from './brand-facts';
import { stateFrameBlock } from './state-frames';

type EventEmitter = (event: {
  event_type: 'log' | 'tool_call' | 'tool_result' | 'progress' | 'output_chunk' | 'error' | 'milestone';
  payload: Record<string, unknown>;
}) => Promise<void>;

interface DistributeInput {
  brandName: string;
  brandUrl?: string | null;
  targetCountry: string;
  targetLanguage?: string | null;
  industry?: string | null;
  sources: { domain: string; citations: number; isBrand: boolean }[];
  competitors?: string[];
  brandProfile?: any;
}

const LANGUAGE_NAMES: Record<string, string> = {
  vi: 'Vietnamese', th: 'Thai', fil: 'Filipino (Tagalog)', tl: 'Filipino (Tagalog)',
  ms: 'Malay', id: 'Indonesian', zh: 'Chinese (Simplified)', en: 'English',
};

interface Target {
  domain: string;
  channelType: string; // directory | industry_media | review_site | social | video | encyclopedia | other
  tier: number; // 1 = national/mainstream (highest authority, hardest) · 2 = industry/trade · 3 = directory/listing (quick win)
  effort: string; // 'quick' | 'medium' | 'high'
  title: string;
  draft: string;
  why: string;
}

export async function runDistributeAgent(
  input: DistributeInput,
  emit: EventEmitter,
): Promise<{ summary: string; output: Record<string, unknown> }> {
  const langCode = (input.targetLanguage || 'en').toLowerCase();
  const languageName = LANGUAGE_NAMES[langCode] || 'English';

  // Target the highest-authority THIRD-PARTY domains (exclude the brand's own).
  const targets = (input.sources || []).filter((s) => !s.isBrand).slice(0, 6);

  await emit({ event_type: 'milestone', payload: { label: 'Distribution started', step: 1, totalSteps: 3 } });
  await emit({
    event_type: 'log',
    payload: {
      text: targets.length
        ? `Drafting placements for ${targets.length} high-authority sources: ${targets.map((t) => t.domain).join(', ')}`
        : 'No third-party citation sources indexed yet — using standard GEO placement targets.',
    },
  });

  const system =
    'You are a GEO distribution & PR strategist. AI answer engines cite authoritative ' +
    'third-party sources (industry directories, trade media, review/comparison sites, ' +
    'social, video, Wikipedia). Your job: produce ready-to-send submission assets that ' +
    'get a brand featured/cited on the given target sources. Write native-quality copy ' +
    'in the target language, specific to the brand — no fluff. Output strict JSON only.';

  const sourceList = targets.length
    ? targets.map((t) => `- ${t.domain} (cited ${t.citations}× by AI engines)`).join('\n')
    : '(none indexed — recommend standard high-authority placements for this market/industry)';

  const user = [
    `Brand: ${input.brandName}` + (input.brandUrl ? ` (${input.brandUrl})` : ''),
    `Market: ${input.targetCountry}` + (input.industry ? ` · ${input.industry}` : ''),
    `Write all submission copy in ${languageName}.`,
    input.competitors?.length ? `Competitors already present on these sources: ${input.competitors.join(', ')}.` : null,
    (brandProfileBlock(input.brandProfile) + stateFrameBlock(input.targetCountry, input.industry)) || null,
    '',
    'Target sources (the domains AI engines actually cite for this category — get the brand featured here):',
    sourceList,
    '',
    'For each target (plus 1-2 universal high-value GEO placements like a relevant ' +
      'industry directory or Wikipedia if appropriate), produce a ready-to-send asset, ' +
      'and TIER each by authority/difficulty: tier 1 = national/mainstream media ' +
      '(highest authority, hardest to land), tier 2 = industry/trade media & strong ' +
      'platforms, tier 3 = directories/listings (quick wins). Return ONLY JSON of this shape:',
    '{',
    '  "targets": [',
    '    { "domain": "the source", "channelType": "directory|industry_media|review_site|social|video|encyclopedia|other",',
    '      "tier": 1, "effort": "quick|medium|high",',
    '      "title": "listing title / PR angle", "draft": "the actual submission/listing/pitch body in ' + languageName + ', 120-180 words, ready to send", "why": "one line: why this source moves AI visibility" }',
    '  ]',
    '}',
    'Rules: 5-8 targets spanning all three tiers (include at least one tier-3 quick win ' +
      'and one tier-1 aspirational target), each draft concrete and publishable, all copy in ' + languageName + '.',
  ]
    .filter(Boolean)
    .join('\n');

  await emit({ event_type: 'tool_call', payload: { tool: 'engine.chat', args: { model: DEFAULT_MODEL, purpose: 'Draft distribution kit' } } });
  await emit({ event_type: 'progress', payload: { pct: 30 } });

  const res = await poeChat({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens: 5000,
    temperature: 0.5,
  });

  await emit({ event_type: 'tool_result', payload: { tool: 'engine.chat', tokens: res.usage?.total ?? null, latencyMs: res.latencyMs } });
  await emit({ event_type: 'progress', payload: { pct: 70 } });

  let parsed: { targets: Target[] };
  try {
    parsed = parseJsonFromLLM<{ targets: Target[] }>(res.content);
  } catch (e) {
    throw new Error(`Distribute model returned unparseable output: ${e instanceof Error ? e.message : String(e)}`);
  }
  const list = (Array.isArray(parsed.targets) ? parsed.targets : []).sort((a, b) => (a.tier || 9) - (b.tier || 9));
  if (!list.length) throw new Error('Distribution produced no targets.');

  await emit({ event_type: 'milestone', payload: { label: 'Assembling kit', step: 2, totalSteps: 3 } });
  for (const t of list) {
    await emit({ event_type: 'output_chunk', payload: { kind: 'placement', value: { domain: t.domain, channelType: t.channelType } } });
  }

  // Assemble a publish-ready Markdown distribution kit, grouped by tier.
  const tierLabel = (n: number) => (n === 1 ? 'Tier 1 — National / mainstream media' : n === 2 ? 'Tier 2 — Industry / trade media' : 'Tier 3 — Directories / listings (quick wins)');
  const md = [`# ${input.brandName} — GEO Distribution Kit`, '', `Market: ${input.targetCountry} · language: ${languageName}`, ''];
  let curTier = 0;
  for (const t of list) {
    const tier = t.tier || 3;
    if (tier !== curTier) { md.push(`\n## ${tierLabel(tier)}\n`); curTier = tier; }
    md.push(`### ${t.domain}  _(${t.channelType} · ${t.effort || 'medium'} effort)_`, `**${t.title}**`, '', t.draft, '', `> Why: ${t.why}`, '');
  }
  const mdStr = md.join('\n');

  await emit({ event_type: 'progress', payload: { pct: 100 } });
  await emit({ event_type: 'milestone', payload: { label: 'Distribution kit ready', step: 3, totalSteps: 3 } });

  return {
    summary: `Distribution kit: ${list.length} ready-to-send placements (${list.map((t) => t.domain).slice(0, 4).join(', ')}${list.length > 4 ? '…' : ''}) in ${languageName}.`,
    output: {
      language: langCode,
      targets: list,
      fullMarkdown: mdStr,
      generatedBy: `${res.model}`,
    },
  };
}
