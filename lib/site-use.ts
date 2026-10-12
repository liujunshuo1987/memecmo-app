// "Is it on the page?" and "does AI use it?" are two questions with two kinds
// of evidence. The site audit answers the first by reading the homepage. Only
// the scans can speak to the second: which engines' answers cite the brand's
// own pages. This module computes that second view, by rule, from a scorecard.
//
// It says nothing about whether an engine states a given fact correctly —
// that is not measured here.

// Engines that fetch web pages while answering, as measured by this platform
// (the same set whose citations the digest treats as verified). The others
// answer from what they learned in training and return no sources through
// the route we use.
export const WEB_READING_ENGINES = new Set(['Perplexity', 'Google AI Overview']);

export interface SiteUseRow {
  engine: string;
  readsWeb: boolean;
  answers: number;     // answers that came back with text
  citingSite: number;  // of those, answers citing at least one page of the brand's site
  homepage: number;    // of those, answers citing the homepage itself
}

const hostOf = (u: string): string => { try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

export function siteUseByEngine(sc: any, siteUrl: string | null | undefined): SiteUseRow[] {
  const site = hostOf(siteUrl ?? '');
  if (!site) return [];
  const by = new Map<string, SiteUseRow>();
  for (const s of (sc?.rawSamples ?? []) as any[]) {
    if (!s?.engine || typeof s.snippet !== 'string' || !s.snippet.trim()) continue;
    const row = by.get(s.engine) ?? { engine: String(s.engine), readsWeb: WEB_READING_ENGINES.has(String(s.engine)), answers: 0, citingSite: 0, homepage: 0 };
    row.answers++;
    let own = false, home = false;
    for (const u of (s.citations ?? []) as string[]) {
      let url: URL;
      try { url = new URL(u); } catch { continue; }
      const h = url.hostname.replace(/^www\./, '').toLowerCase();
      if (h !== site && !h.endsWith(`.${site}`)) continue;
      own = true;
      if (url.pathname.replace(/\/+$/, '') === '') home = true;
    }
    if (own) row.citingSite++;
    if (home) row.homepage++;
    by.set(row.engine, row);
  }
  return [...by.values()].sort((a, b) => Number(b.readsWeb) - Number(a.readsWeb) || b.citingSite - a.citingSite || a.engine.localeCompare(b.engine));
}
