// How many tokens an engine may spend on one answer, per project.
//
// Until 2026-10-12 every engine was asked with max_tokens 900. Gemini thinks
// before it writes and the thinking is charged against the same limit: of 896
// tokens it spent ~860 on reasoning and returned ~135 characters, cut
// mid-sentence — in every scan since July, on every project (outside FMVN:
// 951 of 1,008 stored Gemini answers in 43 scans of 17 projects were shorter
// than the 400-character excerpt, 861 of them cut inside a sentence; the other
// four engines fill it). The upstream reports finish_reason "stop" for those
// answers, and its token counts for the other engines run past the limit
// without anything being cut, so neither field shows a cut answer.
//
// The answer limit itself is unchanged (900). What is new is an allowance on
// top of it for engines that think: measured on 2026-10-12, Gemini 3.1 Pro and
// 3.5 Flash reason for 660–1,090 tokens and need 1,540–2,320 in total to
// finish an answer in vi / en / zh, so 900 + 2,100 = 3,000 leaves ~30% above
// the largest answer seen (2,000 was already too tight: 1,945). On a 24-question
// Vietnamese panel all 24 answers then finish — median 2,428 characters, was
// 137. The other engines keep 900: their limit does not touch what is scored
// (their answers run to thousands of characters, the judge reads 700), and
// raising it would change four readings instead of one and add ~10 s per
// Claude answer, already the slowest engine of a 300 s scan.
//
// A project's instrument can be frozen: its readings are compared against a
// baseline taken with the old behaviour, so the old behaviour is kept — defect
// included — until the date given. Freezes are declared here, in the open, and
// ship with the code that honours them.
//
// A freeze can also forbid fallback models (noFallback). A fallback is another
// model behind the same engine label, i.e. another ruler: on 2026-10-15 a 503
// from Gemini-3.1-Pro at the 01:30 patrol meant the next scan of a frozen
// project would have been measured with Gemini-3.5-Flash. With noFallback the
// preflight tries the primary only; if it is down the scan stops at 0%
// (EngineOutageError: nothing charged, no reading written) and a scheduled scan
// is queued again once, about three hours later (lib/inngest/functions.ts).

export const SNIPPET_CHARS = 400;
export const ANSWER_MAX_TOKENS = 900;
export const THINKING_ALLOWANCE_TOKENS = 2100;

export interface InstrumentFreeze {
  projectId: string;
  /** For people reading alerts; the id is what binds. */
  label: string;
  /** First day (UTC) the freeze no longer applies. */
  until: string;
  answerMaxTokens: number;
  thinkingAllowanceTokens: number;
  /** Engines run on their primary model only; a primary that is down stops
   *  the scan instead of handing it to a fallback. */
  noFallback?: boolean;
  reason: string;
}

export const INSTRUMENT_FREEZES: InstrumentFreeze[] = [
  {
    projectId: 'f8f77dd4-a9ee-4828-8de1-2f317ad88392',
    label: 'Focus Media Vietnam (vi)',
    until: '2027-01-01',
    answerMaxTokens: 900,
    thinkingAllowanceTokens: 0,
    noFallback: true,
    reason: 'Contract runs to 2026-12-31 and is judged against Day-0 (2026-07-25), which was measured with Gemini cut by the 900-token limit. Founder decision 2026-10-12: the instrument does not change during the contract — neither the answer limit nor the model behind an engine.',
  },
];

export interface AnswerBudget {
  answerMaxTokens: number;
  thinkingAllowanceTokens: number;
  source: 'default' | 'project' | 'frozen';
  frozenUntil?: string;
}

const tokens = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
const inForce = (until: unknown, now: Date): until is string =>
  typeof until === 'string' && !Number.isNaN(Date.parse(until)) && now.getTime() < Date.parse(until);

/** The freeze declared for this project and in force on `now`, if any. */
export const declaredFreeze = (
  projectId: string,
  now: Date = new Date(),
  freezes: InstrumentFreeze[] = INSTRUMENT_FREEZES,
): InstrumentFreeze | undefined => freezes.find((f) => f.projectId === projectId && inForce(f.until, now));

/** Whether a scan of this project may run an engine on a fallback model when
 *  its primary is down. Only a declared freeze can say no; project metadata
 *  cannot, so the rule holds even if the project row cannot be read. */
export const fallbackAllowed = (
  projectId: string,
  now: Date = new Date(),
  freezes: InstrumentFreeze[] = INSTRUMENT_FREEZES,
): boolean => !declaredFreeze(projectId, now, freezes)?.noFallback;

/** The budget a scan of this project runs with. Order: a freeze declared in
 *  INSTRUMENT_FREEZES, then projects.metadata.answerBudget
 *  ({ answerMaxTokens?, thinkingAllowanceTokens?, frozenUntil? }), then the
 *  default. A metadata entry with `frozenUntil` lapses on that day, like a
 *  declared freeze; one without it is a standing setting. Values out of range
 *  are ignored, never clamped: a typo must not become an instrument. */
export function answerBudgetFor(
  project: { id: string; metadata?: unknown },
  now: Date = new Date(),
  freezes: InstrumentFreeze[] = INSTRUMENT_FREEZES,
): AnswerBudget {
  const declared = declaredFreeze(project.id, now, freezes);
  if (declared) {
    return { answerMaxTokens: declared.answerMaxTokens, thinkingAllowanceTokens: declared.thinkingAllowanceTokens, source: 'frozen', frozenUntil: declared.until };
  }
  const base: AnswerBudget = { answerMaxTokens: ANSWER_MAX_TOKENS, thinkingAllowanceTokens: THINKING_ALLOWANCE_TOKENS, source: 'default' };
  const m = (project.metadata as { answerBudget?: Record<string, unknown> } | null | undefined)?.answerBudget;
  if (!m || typeof m !== 'object') return base;
  if (m.frozenUntil !== undefined && !inForce(m.frozenUntil, now)) return base;
  const answer = tokens(m.answerMaxTokens, 200, 8000);
  const thinking = tokens(m.thinkingAllowanceTokens, 0, 8000);
  if (answer == null && thinking == null) return base;
  return {
    answerMaxTokens: answer ?? base.answerMaxTokens,
    thinkingAllowanceTokens: thinking ?? base.thinkingAllowanceTokens,
    source: m.frozenUntil !== undefined ? 'frozen' : 'project',
    ...(m.frozenUntil !== undefined ? { frozenUntil: m.frozenUntil as string } : {}),
  };
}

/** max_tokens for one engine: the answer limit, plus the allowance when the
 *  engine's thinking is charged against it. */
export const maxTokensFor = (budget: AnswerBudget, engine: { thinking?: boolean }): number =>
  budget.answerMaxTokens + (engine.thinking ? budget.thinkingAllowanceTokens : 0);

// A complete answer ends on punctuation or closing markup; one cut by the
// limit stops inside a sentence.
const ENDS_CLEAN_RE = /[.!?。！？…:：)\]】）*|`"”’」』>]$/;
export const endsMidSentence = (text: string): boolean => {
  const t = text.trimEnd();
  return t.length > 0 && !ENDS_CLEAN_RE.test(t);
};

export interface AnswerLength {
  /** Answers that came back with text. */
  answers: number;
  /** Of those, shorter than the stored excerpt (SNIPPET_CHARS). */
  short: number;
  /** Of those, ending inside a sentence. */
  midSentence: number;
  medianChars: number;
  /** Median reasoning tokens per answer, where the engine reports them. */
  reasoningTokens?: number;
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** What came back from one engine, measured on the full answers — the stored
 *  excerpt stops at SNIPPET_CHARS, so afterwards a 400-character answer and a
 *  4,000-character one look the same. */
export function answerLength(answers: { text: string; reasoningTokens?: number | null }[]): AnswerLength {
  const withText = answers.filter((a) => a.text.trim());
  const reasoning = withText.map((a) => a.reasoningTokens).filter((n): n is number => typeof n === 'number' && n > 0);
  return {
    answers: withText.length,
    short: withText.filter((a) => a.text.length < SNIPPET_CHARS).length,
    midSentence: withText.filter((a) => endsMidSentence(a.text)).length,
    medianChars: median(withText.map((a) => a.text.length)),
    ...(reasoning.length ? { reasoningTokens: median(reasoning) } : {}),
  };
}

/** Engines whose answers in this scan were mostly cut short: at least half of
 *  the answers with text are shorter than the excerpt and stop inside a
 *  sentence. Reads the stored excerpts, so it also judges scans taken before
 *  the lengths were recorded. A short answer that ends cleanly is an answer —
 *  Google AI Overview often writes three lines. */
export function cutShortEngines(sc: any): { engine: string; cut: number; total: number }[] {
  const by = new Map<string, { n: number; cut: number }>();
  for (const s of (sc?.rawSamples ?? []) as any[]) {
    if (!s?.engine || typeof s.snippet !== 'string' || !s.snippet.trim()) continue;
    const e = by.get(s.engine) ?? { n: 0, cut: 0 };
    e.n++;
    if (s.snippet.length < SNIPPET_CHARS && endsMidSentence(s.snippet)) e.cut++;
    by.set(s.engine, e);
  }
  return [...by.entries()].filter(([, v]) => v.cut / v.n >= 0.5).map(([engine, v]) => ({ engine, cut: v.cut, total: v.n }));
}

/** Engines asked with a different token limit in the two scans compared. A
 *  scan that carries no record was taken when every engine had 900. The two
 *  readings of such an engine are not comparable: the later one is the first
 *  taken on its whole answer (or, for a limit that went down, the last). */
export function answerCapChanges(cur: any, prev: any): { engine: string; before: number; now: number }[] {
  const now = cur?.answerCap?.perEngine as Record<string, number> | undefined;
  if (!now || !prev) return [];
  const before = (prev.answerCap?.perEngine ?? {}) as Record<string, number>;
  const measuredBefore = new Set<string>((prev.engines ?? Object.keys(prev.engineModels ?? {})) as string[]);
  return Object.entries(now)
    .filter(([engine]) => engine in before || measuredBefore.has(engine))
    .map(([engine, n]) => ({ engine, before: before[engine] ?? ANSWER_MAX_TOKENS, now: n }))
    .filter((x) => x.before !== x.now);
}
