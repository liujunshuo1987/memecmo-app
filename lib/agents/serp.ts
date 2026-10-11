// Real-surface measurement: Google AI Overviews (AIO) via SerpApi.
//
// The Poe engines proxy the model APIs. AIO is the actual top-of-Google AI
// answer a buyer sees — the biggest obtainable real GEO surface. Activates only
// when SERPAPI_KEY is set (paid SERP API); otherwise Monitor skips it.

const SERP_URL = 'https://serpapi.com/search.json';

// What came back for one question. The three are different facts and are
// recorded as such: until 2026-10 a follow-up that returned nothing, a timeout
// and "Google shows no overview" were all stored as an empty answer, and an
// empty answer is scored as "brand absent" (re-scans of 2026-10-09: 17, 11 and
// 7 of 24 lost that way in one evening).
export type AioOutcome = 'answered' | 'no_overview' | 'failed';

export interface AioResult {
  text: string;
  citations: string[]; // reference links
  triggered: boolean;  // whether Google showed, or announced, an AI Overview for this query
  outcome: AioOutcome;
  reason?: string;     // why it failed — set only when outcome is 'failed'
  searchId?: string;   // the provider's id of the last request; it keeps the raw response
  ms: number;          // wall time spent on this question, retries included
  attempts: number;
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

type Attempt = Omit<AioResult, 'ms' | 'attempts'>;
const failed = (reason: string, searchId?: string, triggered = false): Attempt =>
  ({ text: '', citations: [], triggered, outcome: 'failed', reason: reason.slice(0, 160), searchId });

interface AioOptions {
  gl: string; hl: string; key: string; location?: string;
  signal?: AbortSignal;    // the caller's overall deadline
  callTimeoutMs?: number;  // each request gets its own clock (default 25 s)
  retries?: number;        // further attempts after a failed one (default 1)
}

async function getJson(params: URLSearchParams, opts: AioOptions): Promise<any> {
  const own = AbortSignal.timeout(opts.callTimeoutMs ?? 25_000);
  const res = await fetch(`${SERP_URL}?${params.toString()}`, { signal: opts.signal ? AbortSignal.any([opts.signal, own]) : own });
  if (!res.ok) throw new Error(`SerpApi ${res.status}`);
  return res.json();
}

async function attemptAio(query: string, opts: AioOptions): Promise<Attempt> {
  // Always a fresh search. The provider caches a result page for an hour, and
  // a cached page carries an overview token that has long expired — the
  // follow-up then returns nothing for a question Google does answer.
  const params = new URLSearchParams({ engine: 'google', q: query, gl: opts.gl, hl: opts.hl, api_key: opts.key, no_cache: 'true' });
  if (opts.location) params.set('location', opts.location);
  const json = await getJson(params, opts);
  const id: string | undefined = json?.search_metadata?.id;
  const aio = json?.ai_overview;
  if (!aio) return { text: '', citations: [], triggered: false, outcome: 'no_overview', searchId: id };

  const answered = (a: any, searchId?: string): Attempt => {
    const text = blocksToText(a.text_blocks);
    return text
      ? { text, citations: refsToLinks(a.references), triggered: true, outcome: 'answered', searchId }
      : failed('overview returned without readable text', searchId, true);
  };

  // Inline AI Overview.
  if (aio.text_blocks) return answered(aio, id);

  // Deferred AI Overview: Google generates it after the page, and its text has
  // to be asked for separately with the page's token. Timed on its own clock —
  // the two requests used to share 30 s and either can take 15–20 s.
  if (aio.page_token) {
    const j2 = await getJson(new URLSearchParams({ engine: 'google_ai_overview', page_token: aio.page_token, api_key: opts.key, no_cache: 'true' }), opts);
    const a2 = j2?.ai_overview;
    const id2: string | undefined = j2?.search_metadata?.id ?? id;
    if (a2?.text_blocks) return answered(a2, id2);
    return failed(`overview announced, text not returned: ${a2?.error || j2?.error || 'empty response'}`, id2, true);
  }

  return aio.error ? failed(`overview error: ${aio.error}`, id, true) : { text: '', citations: [], triggered: false, outcome: 'no_overview', searchId: id };
}

// Fetch the AI Overview for one query in a given locale. Never throws: a
// request that could not be completed comes back as outcome 'failed' with its
// reason. 'no_overview' is a real signal — no AI surface for that query.
export async function fetchGoogleAio(query: string, opts: AioOptions): Promise<AioResult> {
  const t0 = Date.now();
  const max = 1 + Math.max(0, opts.retries ?? 1);
  let last: Attempt = failed('not attempted');
  let attempts = 0;
  while (attempts < max && !opts.signal?.aborted) {
    attempts++;
    try {
      last = await attemptAio(query, opts);
    } catch (e) {
      last = failed(opts.signal?.aborted ? 'time budget for this engine ran out' : e instanceof Error ? e.message : String(e));
    }
    if (last.outcome !== 'failed') break;
  }
  if (!attempts) last = failed('time budget for this engine ran out');
  return { ...last, ms: Date.now() - t0, attempts };
}

// The whole panel for one scan, inside one time budget. Every question gets a
// first attempt before any question gets a second one, so a slow evening costs
// retries, not coverage of the later questions.
export async function fetchAioPanel(
  queries: string[],
  opts: AioOptions & { concurrency: number; budgetMs: number },
): Promise<AioResult[]> {
  const budget = AbortSignal.timeout(opts.budgetMs);
  const signal = opts.signal ? AbortSignal.any([opts.signal, budget]) : budget;
  const pool = async <T, R>(items: T[], fn: (x: T) => Promise<R>): Promise<R[]> => {
    const out: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(opts.concurrency, items.length) }, async () => {
      while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
    }));
    return out;
  };
  const one = (q: string) => fetchGoogleAio(q, { ...opts, signal, retries: 0 });
  const results = await pool(queries, one);
  const again = results.map((r, i) => (r.outcome === 'failed' ? i : -1)).filter((i) => i >= 0);
  if (again.length && !signal.aborted) {
    const second = await pool(again, (i) => one(queries[i]));
    second.forEach((r, k) => {
      const i = again[k], first = results[i];
      results[i] = r.outcome === 'failed'
        ? { ...first, reason: r.attempts ? r.reason : first.reason, searchId: r.searchId ?? first.searchId, ms: first.ms + r.ms, attempts: first.attempts + r.attempts }
        : { ...r, ms: first.ms + r.ms, attempts: first.attempts + r.attempts };
    });
  }
  return results;
}

// Country → Google gl/hl locale.
const LOCALE: Record<string, { gl: string; hl: string }> = {
  Vietnam: { gl: 'vn', hl: 'vi' },
  Thailand: { gl: 'th', hl: 'th' },
  Indonesia: { gl: 'id', hl: 'id' },
  Philippines: { gl: 'ph', hl: 'en' },
  Malaysia: { gl: 'my', hl: 'ms' },
  Singapore: { gl: 'sg', hl: 'en' },
  'Hong Kong': { gl: 'hk', hl: 'zh-tw' },
  Taiwan: { gl: 'tw', hl: 'zh-tw' },
};
const US_STATES = new Set(['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming']);

export function localeFor(country: string, lang?: string | null): { gl: string; hl: string; location?: string } {
  // US-state markets ("Florida, US" or bare state name): state-precision
  // Google surface via SerpApi's location parameter.
  const stateName = country.replace(/,\s*(US|USA|United States)$/i, '').trim();
  if (US_STATES.has(stateName)) {
    return { gl: 'us', hl: 'en', location: `${stateName}, United States` };
  }
  return LOCALE[country] || { gl: 'us', hl: lang || 'en' };
}
