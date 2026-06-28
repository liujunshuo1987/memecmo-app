// Real-surface measurement: Google AI Overviews (AIO) via SerpApi.
//
// The Poe engines proxy the model APIs. AIO is the actual top-of-Google AI
// answer a buyer sees — the biggest obtainable real GEO surface. Activates only
// when SERPAPI_KEY is set (paid SERP API); otherwise Monitor skips it.

const SERP_URL = 'https://serpapi.com/search.json';

export interface AioResult {
  text: string;
  citations: string[]; // reference links
  triggered: boolean;  // whether an AI Overview was shown for this query
}

interface AioBlock {
  snippet?: string;
  list?: { snippet?: string }[];
}

function blocksToText(blocks: AioBlock[] | undefined): string {
  if (!blocks) return '';
  return blocks
    .map((b) => b.snippet || (b.list || []).map((li) => li.snippet).filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n');
}

function refsToLinks(refs: { link?: string }[] | undefined): string[] {
  if (!refs) return [];
  return Array.from(new Set(refs.map((r) => r.link).filter((l): l is string => !!l)));
}

// Fetch the AI Overview for one query in a given locale. Returns triggered=false
// when Google showed no AI Overview (a real signal: no AI surface for that query).
export async function fetchGoogleAio(
  query: string,
  opts: { gl: string; hl: string; key: string; signal?: AbortSignal },
): Promise<AioResult> {
  const params = new URLSearchParams({
    engine: 'google',
    q: query,
    gl: opts.gl,
    hl: opts.hl,
    api_key: opts.key,
  });
  const res = await fetch(`${SERP_URL}?${params.toString()}`, {
    signal: opts.signal ?? AbortSignal.timeout(50_000),
  });
  if (!res.ok) throw new Error(`SerpApi ${res.status}`);
  const json: any = await res.json();
  const aio = json?.ai_overview;
  if (!aio) return { text: '', citations: [], triggered: false };

  // Inline AI Overview.
  if (aio.text_blocks) {
    return { text: blocksToText(aio.text_blocks), citations: refsToLinks(aio.references), triggered: true };
  }

  // Collapsed AI Overview → second call with its page_token.
  if (aio.page_token) {
    const p2 = new URLSearchParams({ engine: 'google_ai_overview', page_token: aio.page_token, api_key: opts.key });
    const r2 = await fetch(`${SERP_URL}?${p2.toString()}`, { signal: opts.signal ?? AbortSignal.timeout(50_000) });
    if (r2.ok) {
      const j2: any = await r2.json();
      const a2 = j2?.ai_overview;
      if (a2?.text_blocks) return { text: blocksToText(a2.text_blocks), citations: refsToLinks(a2.references), triggered: true };
    }
  }

  return { text: '', citations: [], triggered: false };
}

// Country → Google gl/hl locale.
const LOCALE: Record<string, { gl: string; hl: string }> = {
  Vietnam: { gl: 'vn', hl: 'vi' },
  Thailand: { gl: 'th', hl: 'th' },
  Indonesia: { gl: 'id', hl: 'id' },
  Philippines: { gl: 'ph', hl: 'en' },
  Malaysia: { gl: 'my', hl: 'ms' },
  Singapore: { gl: 'sg', hl: 'en' },
};
export function localeFor(country: string, lang?: string | null): { gl: string; hl: string } {
  return LOCALE[country] || { gl: 'us', hl: lang || 'en' };
}
