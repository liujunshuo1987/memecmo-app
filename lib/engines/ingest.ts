// What an engine returns is not always only its answer. Poe's Perplexity-Sonar
// has, since the 2026-10-02 scan, opened every reply with its own working log:
// a "*Thinking...*" line, then a quoted block with the search query and the
// first sources it found (~650 chars). The judge reads the first 700 chars of
// an answer, so for two scans it scored that log instead of the answer:
// prominence, sentiment and presence described the source list.
//
// The log is removed at ingestion so that every reader downstream — mention
// match, judge, snippet, citation extraction, golden pool — sees the answer.
// Sources the engine merely found are not sources the answer cites, so URLs
// inside the log are not counted as citations either (the answer's own inline
// links and reference list are kept untouched).

const TRACE_HEAD_RE = /^\s*\*Thinking(?:\.{3}|…)\*[ \t]*(?:\r?\n|$)/;
const TRACE_BLOCK_RE = /🔎|🔍|📚|Searching the web|Search Query|Found \d+ Sources/i;

export function stripSearchTrace(raw: string): { text: string; stripped: boolean } {
  const head = raw.match(TRACE_HEAD_RE);
  if (!head) return { text: raw, stripped: false };
  const lines = raw.slice(head[0].length).split(/\r?\n/);
  let i = 0;
  for (let block = 0; ; block++) {
    while (i < lines.length && lines[i].trim() === '') i++;
    let j = i;
    while (j < lines.length && /^\s*>/.test(lines[j])) j++;
    if (j === i) break;
    // The block right under the marker is the log. A later quoted block is
    // dropped only when it reads like one — an answer may quote something.
    if (block > 0 && !TRACE_BLOCK_RE.test(lines.slice(i, j).join('\n'))) break;
    i = j;
  }
  return { text: lines.slice(i).join('\n').trim(), stripped: true };
}

/** True when a stored answer excerpt still begins with an engine's working log. */
export const startsWithSearchTrace = (snippet: unknown): boolean =>
  typeof snippet === 'string' && TRACE_HEAD_RE.test(snippet);

/** Engines whose stored answers in this scorecard mostly begin with the log,
 *  i.e. scans taken before the log was removed at ingestion. Their prominence,
 *  sentiment and presence were judged on the log, not on the answer. */
export function traceAffectedEngines(sc: any): string[] {
  const by = new Map<string, { n: number; t: number }>();
  for (const s of (sc?.rawSamples ?? []) as any[]) {
    if (!s?.engine) continue;
    const e = by.get(s.engine) ?? { n: 0, t: 0 };
    e.n++;
    if (startsWithSearchTrace(s.snippet)) e.t++;
    by.set(s.engine, e);
  }
  return [...by.entries()].filter(([, v]) => v.n > 0 && v.t / v.n >= 0.5).map(([k]) => k);
}

/** Engines whose answers largely failed to come back. An answer that did not
 *  come back is scored as "brand absent", so such a scan's totals describe the
 *  engine's failure, not the brand.
 *
 *  Scans that record how each answer was obtained (`status`, from 2026-10-11)
 *  are judged on fetch failures alone, against the same 80% answer floor the
 *  scan applies to the other engines: a question the engine simply did not
 *  answer is a reading, not a failure. Older scans carry no such record, so an
 *  engine is flagged only when under half of its answers have any text —
 *  17 of 24 Google AI Overview answers were empty in the first re-scan of
 *  2026-10-09, against 3 that morning. */
export function mostlyEmptyEngines(sc: any): { engine: string; answered: number; total: number }[] {
  const by = new Map<string, { n: number; text: number; failed: number; recorded: number }>();
  for (const s of (sc?.rawSamples ?? []) as any[]) {
    if (!s?.engine) continue;
    const e = by.get(s.engine) ?? { n: 0, text: 0, failed: 0, recorded: 0 };
    e.n++;
    if (typeof s.snippet === 'string' && s.snippet.trim()) e.text++;
    if (s.status) e.recorded++;
    if (s.status === 'failed') e.failed++;
    by.set(s.engine, e);
  }
  return [...by.entries()]
    .filter(([, v]) => (v.recorded === v.n ? (v.n - v.failed) / v.n < 0.8 : v.text / v.n < 0.5))
    .map(([engine, v]) => ({ engine, answered: v.recorded === v.n ? v.n - v.failed : v.text, total: v.n }));
}

/** Engines for which the current scan records how each answer was obtained and
 *  the previous one does not — the first scan after the fetch was repaired
 *  (2026-10-11: separate clocks for the two requests, a retry, fresh searches;
 *  the question that took 34 s had come back empty in 5 of 6 scheduled scans).
 *  More answers come back than before, so the two readings are not fully
 *  comparable, and the report says so once. */
export function fetchRepairedEngines(cur: any, prev: any): { engine: string; before: number; now: number; total: number }[] {
  const tally = (sc: any) => {
    const by = new Map<string, { n: number; text: number; recorded: number }>();
    for (const s of (sc?.rawSamples ?? []) as any[]) {
      if (!s?.engine) continue;
      const e = by.get(s.engine) ?? { n: 0, text: 0, recorded: 0 };
      e.n++;
      if (typeof s.snippet === 'string' && s.snippet.trim()) e.text++;
      if (s.status) e.recorded++;
      by.set(s.engine, e);
    }
    return by;
  };
  const a = tally(cur), b = tally(prev);
  return [...a.entries()]
    .filter(([engine, v]) => v.recorded === v.n && b.has(engine) && b.get(engine)!.recorded === 0)
    .map(([engine, v]) => ({ engine, before: b.get(engine)!.text, now: v.text, total: v.n }));
}
