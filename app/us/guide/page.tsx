// US-line user guide (us.memecmo.ai/guide) — pure English, state-aware angle.
// Mirrors the implementation exactly like /guide does for the SEA line; the
// engine is the same, so numbers here must match lib/agents/* constants.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MemeCMO US — User Guide · State-Aware GEO',
  description: 'How the state-aware GEO workspace works: state markets, product lines, the AI Mindset Index, regulatory grounding, and the compliance model.',
  robots: { index: false, follow: false },
};

const WEIGHTS = [
  ['Presence', 30, '% of all queries whose answer mentions the brand.'],
  ['Prominence', 25, 'Average position when mentioned: 0 absent · 1 passing · 2 one-of-several · 3 featured/top; ÷3 ×100.'],
  ['Share of Voice', 20, 'Brand mentions ÷ (brand + competitor mentions). Competitors are extracted from real answers, and only entities tagged “competitor” count — partners and directories stay out of the denominator.'],
  ['Sentiment', 15, 'Average stance when mentioned: positive 1 · neutral 0.5 · negative 0.'],
  ['Citation', 10, '% of answers citing the brand’s own domain (mostly Perplexity and Google AI Overview).'],
] as const;

const SECTIONS: { id: string; title: string; rows?: [string, string][]; body?: string }[] = [
  {
    id: 'quickstart',
    title: 'Quickstart',
    rows: [
      ['1 · Create a project', 'One project = one brand × one market × (optionally) one product line. In the US, a market can be the whole country or a single state — “California, US”, “Texas, US”, “Florida, US”, “New York, US”. State projects measure the state’s own answer surface and its own local competitors.'],
      ['2 · Product lines', 'Multi-line brands (e.g. a flagship SMB product and an emerging enterprise line) should run one project per line: each line gets its own prompt library, competitor set and score. Composite scores mask exactly the differences you care about — in our Payoneer test the two lines scored 58 vs 57 while sharing only 2 of 12 AI-named competitors.'],
      ['3 · Brand profile first', 'Run Profile before content agents: it fetches the official site into one canonical fact base. Every asset is grounded on it — agents never invent facts.'],
      ['4 · Full Scan', 'Discovery → Monitor → Report in one click (~4–6 min). The first scan becomes the Day-0 baseline.'],
      ['5 · Execute and re-measure', 'Work the gaps with Optimize / Site / Distribute / Encyclopedia, then re-scan to prove the lift. The trend panel tracks per-scan deltas and month-over-month.'],
    ],
  },
  {
    id: 'states',
    title: 'Why states are markets',
    body:
      'US buyers ask AI with a state attached (“best personal injury lawyer in Texas”), state law changes the correct answer (attorney advertising, insurance filings, telehealth licensure, cannabis, solar incentives, privacy statutes), and AI cites state-local sources. Measurement follows: Google AI Overview is fetched with state-level location targeting via the real Google surface, so a Florida project reads the answers Floridians actually see. Empirically, each state surfaces different local competitors — in our four-state legal-services baseline, Florida, California, Texas and New York produced four almost disjoint competitor sets.',
  },
  {
    id: 'grounding',
    title: 'State regulatory grounding',
    body:
      'For state projects in regulated verticals (legal, insurance, healthcare, home services, cannabis, solar), every content agent receives a state regulatory frame at the same slot as brand facts — advertising rules, licensure regimes, incentive programs specific to that state. Content is written inside the state’s rules by construction. The frames are directional guidance, not legal advice; counsel reviews before publication, and that caveat ships inside every generated asset.',
  },
  {
    id: 'index',
    title: 'The AI Mindset Index',
    body:
      'Each Monitor run samples the prompt library (all 20 key prompts + stage-balanced fill to 24), sends identical queries to 5 engines (ChatGPT, Gemini, Perplexity, Claude, and the real Google AI Overview surface), judge-scores every answer at temperature 0.1, and aggregates five dimensions into one 0–100 composite. Prompts split by intent: high-intent (buying signals) vs educational — AI rarely names brands on educational queries, so low presence there is normal and those prompts become content topics. Gaps count high-intent only. The prompt library and competitor set are frozen between monthly refreshes so scan-to-scan movement is real, not sampling noise.',
  },
  {
    id: 'sets',
    title: 'Managing the competitor set & prompt library',
    rows: [
      ['Where', 'The “Sets” button in the workspace header (project admins). Edits live in project config — the Discovery asset and scan history are never touched.'],
      ['Competitor relationships', 'Tag each entity competitor / partner / directory / self. Only “competitor” enters Share of Voice, the benchmark and gaps; tags survive the monthly refresh, so a marked partner is never re-discovered as a competitor. The scorecard states who is excluded and why.'],
      ['Prompt edits', 'Click any prompt to exclude/restore; add custom prompts one per line. Applied from the next run.'],
      ['Why manual editing', 'The machine discovers competitors from real answers; a human qualifies them. Real case: AI listed Payoneer’s partners Upwork and Fiverr as competitors until they were tagged partner.'],
    ],
  },
  {
    id: 'compliance',
    title: 'The compliance model: facts vs experiences',
    rows: [
      ['Universal rule', 'Agents generate verifiable facts, never experiences. First-person user-experience voice in any asset is treated as a fabricated testimonial and dropped.'],
      ['Community channels', 'Reddit, Quora, Facebook Groups and forums never get ghostwritten posts. They get an engagement brief: where to engage, what people ask, which verified facts to contribute — always from a disclosed official account.'],
      ['Unverified claims', '“Trusted by millions” style claims with no source are deterministically flagged per item for operator review before anything is sent.'],
      ['Encyclopedia', 'Wiki content ships only with the compliant path: paid-relationship disclosure ({{paid}}) → AfC draft review or Talk-page edit request → independent editors merge. Never direct posting.'],
      ['Reviews', 'Review content is never ghostwritten. The Report agent may recommend a genuine review-solicitation program (invitation links to real customers) — the customers write the reviews.'],
      ['State advertising rules', 'For regulated verticals the state frame adds jurisdiction-specific advertising constraints (e.g. bar rules on outcome guarantees, license-number display) directly into generation.'],
    ],
  },
  {
    id: 'trend',
    title: 'Baseline, trend & monthly MoM',
    body:
      'The first scan is the Day-0 baseline. The trend panel tracks the index, presence and gaps per scan; below it, Monthly trend · MoM snapshots the last scan of each calendar month with absolute and percentage deltas. Changes to the engine mix or competitor definitions are annotated — read trends within a consistent window.',
  },
  {
    id: 'digest',
    title: 'Weekly digest & alerts',
    body:
      'With recipients configured, a digest email goes out every Tuesday morning: concise numbers (index, per-engine, deliverables shipped) plus detailed effect-attribution and strategy sections, interpretation switching with the project lifecycle stage. Full data stays in the workspace (PDF export). A score drop ≥5 or an engine collapsing to zero triggers an immediate alert.',
  },
];

export default function UsGuidePage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-edge px-6 py-3 flex items-center justify-between">
        <a href="/us" className="text-xs tracking-[0.2em] uppercase text-dim hover:text-ink">MemeCMO · US</a>
        <div className="flex items-center gap-3">
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-gold/40 text-gold uppercase tracking-widest">Private preview</span>
          <a href="https://app.memecmo.ai/login?next=/dashboard" className="text-xs px-3 py-1.5 rounded-lg bg-brand text-on-brand font-medium hover:brightness-110 transition">Sign in →</a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-12">
        <div className="space-y-3">
          <p className="text-xs tracking-[0.25em] uppercase text-faint">us.memecmo.ai · user guide</p>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight">State-aware GEO, end to end.</h1>
          <p className="text-sm text-dim leading-relaxed">
            How the workspace works — state markets, product lines, the AI Mindset Index, regulatory grounding, and the compliance model.
            Every constant on this page is extracted from the implementation; if the product disagrees, that is a bug.
          </p>
          <nav className="flex flex-wrap gap-2 pt-1">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="text-[11px] px-2 py-1 rounded-full border border-edge text-dim hover:text-brand hover:border-brand/50 transition">
                {s.title}
              </a>
            ))}
          </nav>
        </div>

        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="space-y-4 scroll-mt-24">
            <h2 className="text-lg font-semibold text-ink border-b border-edge pb-2">{s.title}</h2>
            {s.body && <p className="text-[13px] text-dim leading-relaxed">{s.body}</p>}
            {s.rows && (
              <div className="space-y-3">
                {s.rows.map(([h, b]) => (
                  <div key={h} className="rounded-lg border border-edge bg-surface p-4">
                    <div className="text-sm font-medium text-ink mb-1">{h}</div>
                    <p className="text-[13px] text-dim leading-relaxed">{b}</p>
                  </div>
                ))}
              </div>
            )}
            {s.id === 'index' && (
              <>
                <div className="space-y-2.5">
                  {WEIGHTS.map(([name, pct, def]) => (
                    <div key={name} className="rounded-lg border border-edge bg-surface p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-ink">{name}</span>
                        <span className="text-xs font-semibold text-brand tabular-nums">{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-raised overflow-hidden mb-2">
                        <div className="h-full bg-brand/70" style={{ width: `${pct * 2.5}%` }} />
                      </div>
                      <p className="text-[12px] text-dim leading-relaxed">{def}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-brand/40 bg-brand-soft p-4">
                  <div className="text-sm font-medium text-ink mb-1.5">Composite formula</div>
                  <code className="text-[12px] text-ink block leading-relaxed">
                    Index = 0.30·Presence + 0.25·Prominence + 0.20·ShareOfVoice + 0.15·Sentiment + 0.10·Citation
                  </code>
                </div>
              </>
            )}
          </section>
        ))}

        <footer className="pt-4 border-t border-edge text-[11px] text-faint">
          © 2026 MemeCMO Tech Limited · Hong Kong CR No. 80218619 · Engines: ChatGPT · Gemini · Perplexity · Claude · Google AI Overview (real surface, state-localized)
        </footer>
      </main>
    </div>
  );
}
