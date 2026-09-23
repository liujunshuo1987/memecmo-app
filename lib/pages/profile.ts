// "What gets cited here": page features of the urls each engine cited in this
// project, and how the heavily-cited pages differ from the lightly-cited.
// Computed in SQL (geo_citation_profile); rendered on the dashboard and
// injected into the content / site / report agents as a measured brief.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProfileRow {
  engine: string;
  bucket: 'all' | 'heavy' | 'light';
  pages: number;
  schemaShare: number;   // 0..1
  faqShare: number;
  datedShare: number;
  recentShare: number;   // dated within 180 days
  brandShare: number;    // brand-owned pages among cited
  medianWords: number | null;
  medianAgeDays: number | null;
  topSchemaTypes: string[];
}

export const MIN_PAGES_FOR_PROFILE = 8;

export async function loadCitationProfile(sb: SupabaseClient, projectId: string): Promise<ProfileRow[]> {
  const { data, error } = await sb.rpc('geo_citation_profile', { p_project_id: projectId });
  if (error) throw new Error(`geo_citation_profile: ${error.message}`);
  return ((data ?? []) as any[]).map((r) => ({
    engine: String(r.engine), bucket: r.bucket, pages: Number(r.pages),
    schemaShare: Number(r.schema_share ?? 0), faqShare: Number(r.faq_share ?? 0), datedShare: Number(r.dated_share ?? 0),
    recentShare: Number(r.recent_share ?? 0), brandShare: Number(r.brand_share ?? 0),
    medianWords: r.median_words == null ? null : Math.round(Number(r.median_words)),
    medianAgeDays: r.median_age_days == null ? null : Math.round(Number(r.median_age_days)),
    topSchemaTypes: Array.isArray(r.top_schema_types) ? r.top_schema_types.filter((x: unknown) => typeof x === 'string') : [],
  }));
}

const pc = (x: number) => `${Math.round(x * 100)}%`;

// English brief for agent prompts. Only engines with enough read pages; says
// what was measured and how, never a guess.
export function citationBrief(rows: ProfileRow[]): string {
  const all = rows.filter((r) => r.bucket === 'all' && r.pages >= MIN_PAGES_FOR_PROFILE).sort((a, b) => b.pages - a.pages);
  if (!all.length) return '';
  const lines = all.map((r) => {
    const heavy = rows.find((x) => x.engine === r.engine && x.bucket === 'heavy');
    const light = rows.find((x) => x.engine === r.engine && x.bucket === 'light');
    const base = `- ${r.engine} (${r.pages} cited pages read): schema.org markup on ${pc(r.schemaShare)}${r.topSchemaTypes.length ? ` (${r.topSchemaTypes.slice(0, 4).join(', ')})` : ''}; FAQ block on ${pc(r.faqShare)}; ${pc(r.recentShare)} updated within 6 months${r.medianAgeDays != null ? ` (median age ${r.medianAgeDays} days)` : ''}; median length ${r.medianWords ?? '?'} words; brand-owned pages ${pc(r.brandShare)}.`;
    const contrast = heavy && light && heavy.pages >= 5 && light.pages >= 5
      ? ` Pages cited 3+ times vs once/twice: FAQ ${pc(heavy.faqShare)} vs ${pc(light.faqShare)}, updated<6mo ${pc(heavy.recentShare)} vs ${pc(light.recentShare)}, median ${heavy.medianWords ?? '?'} vs ${light.medianWords ?? '?'} words.`
      : '';
    return base + contrast;
  });
  return [
    'MARKET CITATION PROFILE (measured by our fetcher on the pages these engines actually cited in this project\'s scans — observed facts, not assumptions):',
    ...lines,
    'Use it as the bar: match or beat the profile of the heavily-cited pages on structure (schema, FAQ), freshness and depth. Never pad length; depth means answering the buyer question completely.',
  ].join('\n');
}
