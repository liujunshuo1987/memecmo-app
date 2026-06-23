/**
 * Brand URL audit — fetches the user's brand homepage and runs a
 * regex-based SEO / GEO / AEO health check across multiple dimensions.
 *
 * Dimensions returned:
 *  - Health (meta title/desc/canonical/lang/viewport)
 *  - Links  (internal / external / broken-anchor stats)
 *  - Technical (structured data, robots, hreflang, open graph, viewport)
 *  - AI (JSON-LD coverage, Organization / FAQPage / Article schema, llm-visibility)
 *  - GEO (language, geo targeting, hreflang, author / brand entity anchors)
 *  - Checks (image alt coverage, word count, readability, issues list)
 */

import { NextRequest } from 'next/server';
import { requireRateLimit } from '@/lib/api-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public tier — anonymous allowed, IP throttled (10 audits / 5 min / IP)
const RATE_LIMIT = { scope: 'brand-audit', limit: 10, windowMs: 5 * 60_000 };

// ─── Helpers ───────────────────────────────────────────────────────────────────

function normalizeUrl(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s;
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

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : null;
}

function extractCanonical(html: string): string | null {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
  return m ? m[1] : null;
}

function extractLang(html: string): string | null {
  const m = html.match(/<html[^>]+lang=["']([^"']*)["']/i);
  return m ? m[1] : null;
}

function extractHreflang(html: string): string[] {
  const out: string[] = [];
  const re = /<link[^>]+hreflang=["']([^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
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
    } catch {
      /* ignore unparseable ld+json */
    }
  }
  return out;
}

function countAndExtractLinks(html: string, origin: string): {
  internal: number;
  external: number;
  nofollow: number;
  anchorsEmpty: number;
} {
  let internal = 0;
  let external = 0;
  let nofollow = 0;
  let anchorsEmpty = 0;
  const re = /<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const body = m[2].replace(/<[^>]+>/g, '').trim();
    if (!body) anchorsEmpty++;
    const hrefMatch = attrs.match(/href=["']([^"']*)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    if (/rel=["'][^"']*nofollow/i.test(attrs)) nofollow++;
    if (/^https?:\/\//i.test(href)) {
      try {
        const u = new URL(href);
        const o = new URL(origin);
        if (u.hostname === o.hostname) internal++;
        else external++;
      } catch {
        /* ignore */
      }
    } else if (/^\//.test(href) || /^#/.test(href) || /^\?/.test(href)) {
      internal++;
    }
  }
  return { internal, external, nofollow, anchorsEmpty };
}

function countImages(html: string): { total: number; withAlt: number; lazy: number } {
  const imgs = html.match(/<img[^>]*>/gi) || [];
  let withAlt = 0;
  let lazy = 0;
  for (const img of imgs) {
    const altMatch = img.match(/alt=["']([^"']*)["']/i);
    if (altMatch && altMatch[1].trim().length > 0) withAlt++;
    if (/loading=["']lazy["']/i.test(img)) lazy++;
  }
  return { total: imgs.length, withAlt, lazy };
}

function extractTextAndCount(html: string): { wordCount: number; sampleSentence: string } {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = stripped.split(/\s+/).filter(Boolean);
  const sampleSentence = stripped.split(/[.!?。！？]/).find((s) => s.length > 40) ?? '';
  return { wordCount: words.length, sampleSentence: sampleSentence.trim().slice(0, 220) };
}

// Flesch-ish readability approximation (language-agnostic, returns 0-100)
function estimateReadability(text: string): number {
  const sentences = text.split(/[.!?。！？]/).filter((s) => s.trim().length > 0).length || 1;
  const words = text.split(/\s+/).filter(Boolean).length || 1;
  const avgSentence = words / sentences;
  // punishment for long sentences; 15 is sweet-spot
  let score = 100 - Math.abs(avgSentence - 15) * 3;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const blocked = await requireRateLimit(req, RATE_LIMIT);
  if (blocked) return blocked;

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.url) {
    return Response.json({ error: 'url is required' }, { status: 400 });
  }

  const url = normalizeUrl(body.url);
  const started = Date.now();

  let html = '';
  let httpStatus = 0;
  let contentType = '';
  let fetchError: string | null = null;

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; GuanlanGEOAuditBot/1.0; +https://memecmo.ai/)',
      },
      signal: AbortSignal.timeout(15_000),
    });
    httpStatus = res.status;
    contentType = res.headers.get('content-type') ?? '';
    html = await res.text();
  } catch (err) {
    fetchError = (err as Error).message;
  }

  const latencyMs = Date.now() - started;

  if (fetchError || !html) {
    return Response.json(
      {
        url,
        fetched: false,
        error: fetchError ?? 'empty response',
        httpStatus,
        latencyMs,
      },
      { status: 200 },
    );
  }

  const title = extractTitle(html);
  const description =
    extractMeta(html, 'description') ?? extractMeta(html, 'og:description');
  const canonical = extractCanonical(html);
  const lang = extractLang(html);
  const viewport = extractMeta(html, 'viewport');
  const robots = extractMeta(html, 'robots');
  const ogTitle = extractMeta(html, 'og:title');
  const ogImage = extractMeta(html, 'og:image');
  const twitterCard = extractMeta(html, 'twitter:card');
  const author = extractMeta(html, 'author');
  const hreflang = extractHreflang(html);
  const jsonld = extractJsonLd(html);
  const images = countImages(html);
  const links = countAndExtractLinks(html, url);
  const { wordCount, sampleSentence } = extractTextAndCount(html);
  const readability = estimateReadability(html.replace(/<[^>]+>/g, ' '));

  const schemaTypes = jsonld
    .map((o) => (o as any)['@type'])
    .filter(Boolean)
    .flatMap((t) => (Array.isArray(t) ? t : [t]));

  // ─── Scoring per dimension ─────────────────────────────────────────────
  const issues: Array<{ severity: 'critical' | 'warn' | 'info'; dimension: string; message: string }> = [];

  // Health
  if (!title) issues.push({ severity: 'critical', dimension: 'Health', message: 'Missing <title> tag' });
  else if (title.length < 20) issues.push({ severity: 'warn', dimension: 'Health', message: `<title> too short (${title.length} chars)` });
  else if (title.length > 70) issues.push({ severity: 'warn', dimension: 'Health', message: `<title> exceeds 70 chars` });

  if (!description) issues.push({ severity: 'critical', dimension: 'Health', message: 'Missing meta description' });
  else if (description.length < 80) issues.push({ severity: 'warn', dimension: 'Health', message: 'meta description too short (<80 chars)' });
  else if (description.length > 180) issues.push({ severity: 'info', dimension: 'Health', message: 'meta description longer than 180 chars — may truncate' });

  if (!canonical) issues.push({ severity: 'warn', dimension: 'Health', message: 'No canonical URL declared' });
  if (!viewport) issues.push({ severity: 'warn', dimension: 'Technical', message: 'No viewport meta — likely not mobile-friendly' });
  if (!lang) issues.push({ severity: 'warn', dimension: 'GEO', message: '<html lang> not set' });

  // Links
  if (links.internal === 0) issues.push({ severity: 'warn', dimension: 'Links', message: 'No internal links found — weak site graph' });
  if (links.external === 0) issues.push({ severity: 'info', dimension: 'Links', message: 'No external links — may appear non-authoritative to LLMs' });
  if (links.anchorsEmpty > 3) issues.push({ severity: 'warn', dimension: 'Links', message: `${links.anchorsEmpty} empty anchor texts detected` });

  // Technical
  if (!ogTitle || !ogImage) issues.push({ severity: 'info', dimension: 'Technical', message: 'Incomplete Open Graph tags (og:title / og:image)' });
  if (!twitterCard) issues.push({ severity: 'info', dimension: 'Technical', message: 'Missing twitter:card meta' });
  if (!robots) issues.push({ severity: 'info', dimension: 'Technical', message: 'No meta robots declaration' });

  // AI / GEO
  if (jsonld.length === 0) {
    issues.push({ severity: 'critical', dimension: 'AI', message: 'No JSON-LD structured data — LLMs will struggle to extract facts' });
  } else {
    const expected = ['Organization', 'WebSite', 'FAQPage', 'Article', 'Product'];
    const missing = expected.filter((t) => !schemaTypes.includes(t));
    if (missing.includes('Organization')) issues.push({ severity: 'critical', dimension: 'AI', message: 'No Organization schema — brand entity invisible to AI' });
    if (missing.includes('FAQPage')) issues.push({ severity: 'warn', dimension: 'AI', message: 'No FAQPage schema — missing high-citation asset' });
  }
  if (hreflang.length === 0) issues.push({ severity: 'info', dimension: 'GEO', message: 'No hreflang links — single-region targeting only' });

  // Checks
  if (wordCount < 300) issues.push({ severity: 'warn', dimension: 'Checks', message: `Thin content (${wordCount} words)` });
  if (images.total > 0 && images.withAlt / images.total < 0.6)
    issues.push({
      severity: 'warn',
      dimension: 'Checks',
      message: `Only ${Math.round((images.withAlt / images.total) * 100)}% of images have alt text`,
    });
  if (images.total > 0 && images.lazy / images.total < 0.3)
    issues.push({ severity: 'info', dimension: 'Checks', message: 'Most images not lazy-loaded — potential perf issue' });
  if (readability < 55) issues.push({ severity: 'warn', dimension: 'Checks', message: `Readability low (${readability}/100) — sentences may be too long` });

  // dimension scores (100 - weighted penalties)
  const penaltyBy = { critical: 25, warn: 8, info: 3 } as const;
  const dims: Record<string, number> = {
    Health: 100,
    Links: 100,
    Technical: 100,
    AI: 100,
    GEO: 100,
    Checks: 100,
  };
  for (const i of issues) {
    if (dims[i.dimension] !== undefined) dims[i.dimension] -= penaltyBy[i.severity];
  }
  for (const k of Object.keys(dims)) dims[k] = Math.max(0, dims[k]);

  const overallScore = Math.round(
    Object.values(dims).reduce((a, b) => a + b, 0) / Object.keys(dims).length,
  );

  return Response.json({
    url,
    fetched: true,
    httpStatus,
    contentType,
    latencyMs,
    overallScore,
    dims,
    fields: {
      title,
      description,
      canonical,
      lang,
      viewport,
      robots,
      ogTitle,
      ogImage,
      twitterCard,
      author,
      hreflang,
      schemaTypes,
      jsonldCount: jsonld.length,
      wordCount,
      readability,
      sampleSentence,
      images,
      links,
    },
    issues,
  });
}
