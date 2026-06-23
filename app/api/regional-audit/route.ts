/**
 * POST /api/regional-audit
 *
 * Given a global brand homepage and a target country (ISO-3166 alpha-2),
 * discover the brand's canonical regional site and run a full AEO health
 * audit on it.
 *
 * Pipeline (see docs/REGIONAL_SITE_DISCOVERY.md):
 *   1) Fetch global homepage → parse hreflang entries (authoritative).
 *   2) Generate pattern-based candidate URLs for the country.
 *   3) Probe each candidate in parallel (HEAD-ish: small GET with byte cap).
 *   4) Score each candidate's regional fit; pick the best (≥0.5).
 *   5) Fetch the winner in full and run the AEO audit inline
 *      (same logic as /api/brand-audit plus regional-specific checks).
 */

import { NextRequest } from 'next/server';
import { requireRateLimit } from '@/lib/api-guard';
import {
  generateCandidates,
  parseHreflang,
  pickHreflangForCountry,
  scoreRegionalFit,
  computeRegionalAEOChecks,
  detectLanguageSignal,
  COUNTRY_PATTERNS,
  type CandidateURL,
  type CandidateProbe,
  type RegionalFitResult,
} from '@/lib/regional-site-discovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public tier — runs N parallel HEAD-ish fetches; throttle harder than brand-audit
const RATE_LIMIT = { scope: 'regional-audit', limit: 6, windowMs: 5 * 60_000 };

const FETCH_UA =
  'Mozilla/5.0 (compatible; MemeCMORegionalAuditBot/1.0; +https://memecmo.ai/)';

// ─── Small helpers (duplicated from brand-audit to keep this route self-contained) ─
function normalizeUrl(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s;
}
function extractLang(html: string): string | null {
  const m = html.match(/<html[^>]+lang=["']([^"']*)["']/i);
  return m ? m[1] : null;
}
function extractContentLang(html: string): string | null {
  const m = html.match(/<meta[^>]+http-equiv=["']content-language["'][^>]+content=["']([^"']*)["']/i);
  return m ? m[1] : null;
}
function extractJsonLd(html: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) out.push(...parsed);
      else if (parsed && typeof parsed === 'object') out.push(parsed);
    } catch { /* ignore */ }
  }
  return out;
}
function extractMeta(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`,
    'i',
  );
  const m = html.match(re) || html.match(
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`,
      'i',
    ),
  );
  return m ? m[1] : null;
}
function extractTextSample(html: string, maxChars = 2500): { wordCount: number; sample: string } {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = stripped.split(/\s+/).filter(Boolean).length;
  return { wordCount, sample: stripped.slice(0, maxChars) };
}

// Network: fetch with size cap to keep candidate probes cheap
async function fetchLimited(url: string, byteLimit: number, timeoutMs: number): Promise<{
  html: string;
  finalUrl: string;
  httpStatus: number;
  contentType: string;
  error?: string;
}> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': FETCH_UA, 'Accept-Language': '*' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const buf = new Uint8Array(byteLimit);
    const reader = res.body?.getReader();
    let off = 0;
    if (reader) {
      while (off < byteLimit) {
        const { value, done } = await reader.read();
        if (done) break;
        const take = Math.min(value.byteLength, byteLimit - off);
        buf.set(value.subarray(0, take), off);
        off += take;
        if (off >= byteLimit) {
          try { await reader.cancel(); } catch { /* ignore */ }
          break;
        }
      }
    }
    const html = new TextDecoder('utf-8').decode(buf.subarray(0, off));
    return {
      html,
      finalUrl: res.url,
      httpStatus: res.status,
      contentType: res.headers.get('content-type') ?? '',
    };
  } catch (err) {
    return {
      html: '',
      finalUrl: url,
      httpStatus: 0,
      contentType: '',
      error: (err as Error).message,
    };
  }
}

// ─── Main route ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const blocked = await requireRateLimit(req, RATE_LIMIT);
  if (blocked) return blocked;

  let body: { brandHomepage?: string; targetCountry?: string };
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.brandHomepage || !body.targetCountry) {
    return Response.json({ error: 'brandHomepage and targetCountry are required' }, { status: 400 });
  }

  const brandHomepage = normalizeUrl(body.brandHomepage);
  const country = body.targetCountry.toUpperCase();
  const pattern = COUNTRY_PATTERNS[country];
  if (!pattern) {
    return Response.json({
      error: `Country ${country} not in pattern table`,
      supported: Object.keys(COUNTRY_PATTERNS),
    }, { status: 400 });
  }

  const started = Date.now();

  // 1) Fetch global homepage to get hreflang entries
  const root = await fetchLimited(brandHomepage, 400_000, 12_000);
  const hrefEntries = root.html ? parseHreflang(root.html) : [];
  const hreflangPick = pickHreflangForCountry(hrefEntries, country);

  // 2) Generate candidates (hreflang pick → first, then pattern-based)
  const candidates: CandidateURL[] = [];
  if (hreflangPick.match) {
    try {
      // Resolve relative hrefs against the brand homepage
      const resolved = new URL(hreflangPick.match.href, brandHomepage).toString();
      candidates.push({
        url: resolved,
        source: 'hreflang' as unknown as CandidateURL['source'],
        rationale: hreflangPick.reason,
      });
    } catch { /* ignore malformed href */ }
  }
  for (const c of generateCandidates(brandHomepage, country)) candidates.push(c);

  // Dedup by final URL string
  const seen = new Set<string>();
  const dedupCandidates = candidates.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url); return true;
  }).slice(0, 10); // cap parallelism

  // 3) Probe each candidate in parallel
  const brandHomeNorm = brandHomepage.replace(/\/$/, '').toLowerCase();
  const probeResults: Array<{ candidate: CandidateURL; probe: CandidateProbe; fit: RegionalFitResult }> = [];

  await Promise.all(
    dedupCandidates.map(async (c) => {
      const r = await fetchLimited(c.url, 80_000, 7_000);
      const finalNorm = (r.finalUrl || c.url).replace(/\/$/, '').toLowerCase();
      const isEcho = finalNorm === brandHomeNorm;

      const htmlLang = r.html ? extractLang(r.html) : null;
      const contentLang = r.html ? extractContentLang(r.html) : null;
      const { sample } = r.html ? extractTextSample(r.html, 2500) : { sample: '' };

      const probe: CandidateProbe = {
        url: c.url,
        finalUrl: r.finalUrl,
        httpStatus: r.httpStatus,
        source: c.source === ('hreflang' as unknown as CandidateURL['source']) ? 'hreflang' : c.source,
        htmlLang: htmlLang ?? contentLang,
        contentLang,
        bodySample: sample,
        isEcho,
      };
      const fit = scoreRegionalFit(probe, country);
      probeResults.push({ candidate: c, probe, fit });
    }),
  );

  // 4) Pick winner
  const ranked = probeResults.sort((a, b) => b.fit.score - a.fit.score);
  const winner = ranked.find((r) => r.fit.score >= 50 && !r.probe.isEcho) ?? null;

  if (!winner) {
    return Response.json({
      started,
      elapsedMs: Date.now() - started,
      brandHomepage,
      targetCountry: country,
      verdict: 'no_regional_site_found',
      message: `No regional presence detected for ${country}. The brand likely serves this market from its global site only.`,
      candidates: ranked.map((r) => ({
        url: r.candidate.url,
        finalUrl: r.probe.finalUrl,
        source: r.candidate.source,
        httpStatus: r.probe.httpStatus,
        isEcho: r.probe.isEcho,
        fit: r.fit,
      })),
      hreflangEntriesFound: hrefEntries.length,
    });
  }

  // 5) Full audit on the winner
  const full = await fetchLimited(winner.candidate.url, 600_000, 15_000);
  const fullHtml = full.html;

  const htmlLang = extractLang(fullHtml);
  const hreflang = parseHreflang(fullHtml);
  const jsonld = extractJsonLd(fullHtml);
  const { wordCount, sample } = extractTextSample(fullHtml, 3000);
  const bodyLanguageSignal = detectLanguageSignal(sample, [...pattern.primary, ...pattern.acceptable]);

  const checks = computeRegionalAEOChecks({
    country,
    htmlLang,
    hreflangEntries: hreflang,
    jsonld,
    wordCount,
    bodyLanguageSignal,
  });

  // Quick extraction of key audit fields (subset of /api/brand-audit response)
  const fields = {
    title: (fullHtml.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim() ?? null,
    description: extractMeta(fullHtml, 'description'),
    lang: htmlLang,
    hreflang: hreflang.map((e) => e.hreflang),
    schemaTypes: jsonld
      .map((o) => (o as any)['@type'])
      .filter(Boolean)
      .flatMap((t) => (Array.isArray(t) ? t : [t])),
    jsonldCount: jsonld.length,
    wordCount,
    bodyLanguageSignal: Math.round(bodyLanguageSignal),
  };

  return Response.json({
    started,
    elapsedMs: Date.now() - started,
    brandHomepage,
    targetCountry: country,
    verdict: 'regional_site_identified',
    regionalUrl: winner.candidate.url,
    finalUrl: winner.probe.finalUrl,
    source: winner.candidate.source,
    sourceRationale: winner.candidate.rationale,
    fit: winner.fit,
    regionalChecks: checks,
    fields,
    alternatives: ranked
      .filter((r) => r !== winner)
      .slice(0, 5)
      .map((r) => ({
        url: r.candidate.url,
        source: r.candidate.source,
        fit: r.fit.score,
        verdict: r.fit.verdict,
        isEcho: r.probe.isEcho,
      })),
    hreflangEntriesFound: hrefEntries.length,
  });
}
