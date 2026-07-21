// Site Optimization Agent (v1.3 — homepage AEO + Google rich media)
//
// Foolproof AEO for the brand's OWN site: it fetches the real homepage, audits
// how retrievable/citable it is by AI answer engines, and produces concrete,
// ready-to-apply changes — paste-in JSON-LD (Organization / LocalBusiness /
// FAQ / Service, which also drives Google rich results), entity-clarity and
// content-structure edits, and an AEO checklist. The "主页修改代理": the brand
// doesn't learn SEO tools — the agent hands back exactly what to change.

import { poeChat, parseJsonFromLLM, DEFAULT_MODEL } from '@/lib/llm/poe';
import { brandProfileBlock } from './brand-facts';
import { stateFrameBlock } from './state-frames';

type EventEmitter = (event: {
  event_type: 'log' | 'tool_call' | 'tool_result' | 'progress' | 'output_chunk' | 'error' | 'milestone';
  payload: Record<string, unknown>;
}) => Promise<void>;

interface SiteInput {
  brandName: string;
  brandUrl?: string | null;
  targetCountry: string;
  targetLanguage?: string | null;
  industry?: string | null;
  brandProfile?: any;
}

const LANGUAGE_NAMES: Record<string, string> = {
  vi: 'Vietnamese', th: 'Thai', fil: 'Filipino (Tagalog)', tl: 'Filipino (Tagalog)',
  ms: 'Malay', id: 'Indonesian', zh: 'Chinese (Simplified)', en: 'English',
};

export interface FetchedSite {
  ok: boolean;
  title: string;
  metaDesc: string;
  existingSchema: string[];
  text: string;
  error?: string;
}

export async function fetchSite(url: string): Promise<FetchedSite> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MemeCMO-GEO/1.0)' },
    });
    const html = await res.text();
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
    const metaDesc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || '').trim();
    const existingSchema = Array.from(new Set([...html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((m) => m[1])));
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
    return { ok: true, title, metaDesc, existingSchema, text };
  } catch (e) {
    return { ok: false, title: '', metaDesc: '', existingSchema: [], text: '', error: e instanceof Error ? e.message : String(e) };
  }
}

interface SiteAuditJson {
  aeoChecklist: { item: string; status: 'missing' | 'weak' | 'ok'; fix: string }[];
  homepageEdits: { section: string; change: string }[];
  schema: { type: string; jsonld: Record<string, unknown> }[];
}

export async function runSiteAgent(
  input: SiteInput,
  emit: EventEmitter,
): Promise<{ summary: string; output: Record<string, unknown> }> {
  const langCode = (input.targetLanguage || 'en').toLowerCase();
  const languageName = LANGUAGE_NAMES[langCode] || 'English';

  await emit({ event_type: 'milestone', payload: { label: 'Site audit started', step: 1, totalSteps: 3 } });

  let site: FetchedSite = { ok: false, title: '', metaDesc: '', existingSchema: [], text: '' };
  if (input.brandUrl) {
    await emit({ event_type: 'tool_call', payload: { tool: 'web.fetch', args: { url: input.brandUrl } } });
    site = await fetchSite(input.brandUrl);
    await emit({
      event_type: 'tool_result',
      payload: site.ok
        ? { tool: 'web.fetch', title: site.title, existingSchema: site.existingSchema, chars: site.text.length }
        : { tool: 'web.fetch', error: site.error },
    });
  }
  await emit({
    event_type: 'log',
    payload: {
      text: site.ok
        ? `Fetched homepage. Existing schema: ${site.existingSchema.length ? site.existingSchema.join(', ') : 'none detected'}.`
        : `Could not fetch homepage${input.brandUrl ? ` (${input.brandUrl})` : ' (no URL set)'} — auditing from brand knowledge.`,
    },
  });
  await emit({ event_type: 'progress', payload: { pct: 35 } });

  const system =
    'You are an AEO (Answer Engine Optimization) engineer. You make a brand homepage ' +
    'maximally retrievable and citable by AI answer engines (ChatGPT/Gemini/Perplexity) ' +
    'and eligible for Google rich results. You produce concrete, ready-to-apply changes ' +
    'and valid schema.org JSON-LD — never vague advice. Output strict JSON only.';

  const siteBlock = site.ok
    ? [
        `Homepage title: ${site.title}`,
        `Meta description: ${site.metaDesc || '(none)'}`,
        `Existing JSON-LD @types: ${site.existingSchema.length ? site.existingSchema.join(', ') : 'NONE'}`,
        `Homepage text (truncated):`,
        site.text,
      ].join('\n')
    : '(homepage could not be fetched — base recommendations on the brand/industry)';

  const user = [
    `Brand: ${input.brandName}` + (input.brandUrl ? ` (${input.brandUrl})` : ''),
    `Market: ${input.targetCountry}` + (input.industry ? ` · ${input.industry}` : ''),
    `Write all prose (checklist items, fixes, edits) in ${languageName}; keep JSON-LD values appropriate (brand facts in ${languageName} where natural).`,
    '',
    'Current homepage:',
    siteBlock,
    '',
    brandProfileBlock(input.brandProfile) + stateFrameBlock(input.targetCountry, input.industry),
    '',
    'Produce an AEO upgrade as JSON of this shape:',
    '{',
    '  "aeoChecklist": [{ "item": "what AI engines need (e.g. clear entity definition, NAP, FAQ, factual specifics)", "status": "missing|weak|ok", "fix": "the concrete change" }],',
    '  "homepageEdits": [{ "section": "e.g. above-the-fold / about / services", "change": "exact copy or structural change to make" }],',
    '  "schema": [{ "type": "Organization|LocalBusiness|Service|FAQPage|BreadcrumbList", "jsonld": { ...valid schema.org JSON-LD object ready to paste into <head>... } }]',
    '}',
    'Rules: 5-7 checklist items (one sentence each), 3-4 homepage edits (concise), ' +
      'EXACTLY 2-3 schema blocks (always Organization; add LocalBusiness or FAQPage if ' +
      'clearly useful) — keep each JSON-LD compact, only essential fields. Be specific to ' +
      'this brand. Return ONLY the JSON, nothing after it.',
  ].join('\n');

  await emit({ event_type: 'tool_call', payload: { tool: 'engine.chat', args: { model: DEFAULT_MODEL, purpose: 'AEO site audit' } } });
  await emit({ event_type: 'progress', payload: { pct: 55 } });

  const res = await poeChat({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens: 8000,
    temperature: 0.4,
  });

  await emit({ event_type: 'tool_result', payload: { tool: 'engine.chat', tokens: res.usage?.total ?? null, latencyMs: res.latencyMs } });
  await emit({ event_type: 'progress', payload: { pct: 80 } });

  let parsed: SiteAuditJson;
  try {
    parsed = parseJsonFromLLM<SiteAuditJson>(res.content);
  } catch (e) {
    throw new Error(`Site model returned unparseable output: ${e instanceof Error ? e.message : String(e)}`);
  }
  const checklist = parsed.aeoChecklist || [];
  const edits = parsed.homepageEdits || [];
  const schema = parsed.schema || [];
  if (!schema.length && !edits.length) throw new Error('Site audit produced no actionable output.');

  await emit({ event_type: 'milestone', payload: { label: 'Compiling fixes', step: 2, totalSteps: 3 } });
  for (const s of schema) await emit({ event_type: 'output_chunk', payload: { kind: 'schema_block', value: { type: s.type } } });

  // Assemble a ready-to-apply Markdown brief.
  const md = [
    `# ${input.brandName} — Homepage AEO Upgrade`,
    '',
    site.ok ? `Audited: ${input.brandUrl}  ·  existing schema: ${site.existingSchema.join(', ') || 'none'}` : `Brand: ${input.brandName} (homepage not fetched)`,
    '',
    '## AEO Checklist',
    ...checklist.map((c) => `- [${c.status === 'ok' ? 'x' : ' '}] **${c.item}** (${c.status}) — ${c.fix}`),
    '',
    '## Homepage Edits',
    ...edits.flatMap((e) => [`### ${e.section}`, e.change, '']),
    '## Paste-in Structured Data (JSON-LD)',
    ...schema.flatMap((s) => [`### ${s.type}`, '```json', JSON.stringify(s.jsonld, null, 2), '```', '']),
  ].join('\n');

  await emit({ event_type: 'progress', payload: { pct: 100 } });
  await emit({ event_type: 'milestone', payload: { label: 'Site upgrade ready', step: 3, totalSteps: 3 } });

  const missing = checklist.filter((c) => c.status === 'missing').length;
  return {
    summary: `Homepage AEO upgrade: ${schema.length} JSON-LD blocks, ${edits.length} edits, ${checklist.length} checklist items (${missing} missing). ${site.ok ? `Existing schema: ${site.existingSchema.join(', ') || 'none'}.` : 'Homepage not reachable — audited from brand knowledge.'}`,
    output: {
      siteAudited: site.ok ? input.brandUrl : null,
      existingSchema: site.existingSchema,
      language: langCode,
      aeoChecklist: checklist,
      homepageEdits: edits,
      schema,
      fullMarkdown: md,
      generatedBy: `${res.model}`,
    },
  };
}
