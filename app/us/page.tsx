// us.memecmo.ai — the US product line: state-aware GEO, live.
// Pure English by design (US market). Indexable — linked from the homepage nav.
//
// First-principles thesis: the US is the one market where STATE LAW changes
// the correct answer. Attorney advertising, insurance, telehealth licensure,
// cannabis, solar incentives, privacy statutes — all state-jurisdiction. For
// regulated verticals, AI engines give state-differentiated answers and cite
// state-local sources, so GEO must be measured and built per state.
//
// Architecture: zero fork needed — the engine already parameterizes market
// (project = brand × market). A US state slots in where a SEA country does;
// Google AIO real-surface supports state/metro location targeting.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MemeCMO US — State-Aware GEO, Live in CA · TX · FL · NY',
  description:
    'Generative Engine Optimization measured and built state by state: standard metrics and answer accuracy per AI engine, compliant answers grounded in each state\'s regulatory frame, weekly digests. Tier-1 states live now.',
  alternates: { canonical: 'https://us.memecmo.ai/' },
  openGraph: {
    type: 'website',
    url: 'https://us.memecmo.ai/',
    title: 'MemeCMO US — State-Aware GEO, Live in CA · TX · FL · NY',
    description: 'State law changes the correct answer. We measure and build GEO state by state — live for California, Texas, Florida and New York.',
  },
};

const TIER1 = ['CA', 'TX', 'FL', 'NY'];
const TIER2 = ['IL', 'PA', 'OH', 'GA', 'NC', 'MI', 'NJ', 'VA', 'WA', 'AZ', 'MA', 'CO'];
const ALL_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const PRINCIPLES = [
  {
    n: '01',
    title: 'US buyers ask AI with a state attached',
    body: '"Best personal injury lawyer in Texas." "Solar installer with California rebates." "HVAC company licensed in Florida." The state modifier is native to US buying questions — a national visibility score hides the state where you actually win or lose the customer.',
  },
  {
    n: '02',
    title: 'State law changes the correct answer',
    body: 'Attorney advertising rules, insurance products, telehealth licensure, cannabis legality, solar incentives, privacy statutes — all state-jurisdiction. An answer that is right in Colorado can be wrong (or non-compliant) in Texas. AI engines already differentiate; brands must too.',
  },
  {
    n: '03',
    title: 'Citations are state-local',
    body: 'When AI answers a state-scoped question, it cites state bar directories, state government portals, regional press and local chambers — not national media. The authority you need to build is a per-state citation graph.',
  },
];

const AGENTS = [
  { name: 'State Prompt Discovery', body: '100+ buyer questions per state — high-intent (who / best / price / compare + state) vs educational — with 20 key prompts monitored on every scan, frozen for scan-to-scan comparability.' },
  { name: 'Compliance-Grounded Answers', body: 'Canonical answers written against your verified facts AND the state\'s regulatory frame — live today for California, Texas, Florida and New York across legal, insurance, healthcare, home services, cannabis and solar.' },
  { name: 'Standard Metrics per State', body: 'Presence, share of voice, citation rate, AI sentiment and top-of-mind rate — per engine, across ChatGPT, Gemini, Perplexity, Claude and the real Google AI Overview surface localized to your state.' },
  { name: 'Answer Accuracy', body: 'Does AI give your customers the correct facts, licenses and contact details? Every answer to a key question is checked against your verified standard answers — wrong answers are flagged per engine, because they become support calls.' },
  { name: 'State Citation Index', body: 'Which domains AI actually cites for your category in each state — the build-here list for directories, PR and reviews, plus paste-in LocalBusiness JSON-LD with state-scoped areaServed and licenses.' },
  { name: 'State Gap → Content Engine', body: 'Every state-level gap becomes a publish-ready deliverable: state landing pages, incentive explainers, licensure FAQs, third-party placements — verified by you before it ships.' },
];

const VERTICALS = [
  { name: 'Legal Services', note: 'Advertising rules differ by state bar; referral answers are state-scoped by definition.' },
  { name: 'Insurance', note: 'Products and carriers are state-filed; availability answers change at the state line.' },
  { name: 'Healthcare & Telehealth', note: 'Licensure and prescribing rules are state-by-state; AI hedges accordingly.' },
  { name: 'Home Services & Contractors', note: 'Licensing, bonding and permit regimes are state/county-level trust signals.' },
  { name: 'Cannabis & CBD', note: 'Legality patchwork — the same question has opposite answers across borders.' },
  { name: 'Solar & Energy', note: 'Incentives, net metering and rebates are state programs AI quotes directly.' },
];

export default function UsPreviewPage() {
  return (
    <div className="theme-day min-h-screen bg-canvas text-ink">
      <header className="border-b border-edge px-6 py-3 flex items-center justify-between">
        <span className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.svg?v=2" alt="MemeCMO" className="w-6 h-6" />
          <span className="text-xs tracking-[0.2em] uppercase text-dim">MemeCMO · US</span>
        </span>
        <div className="flex items-center gap-3">
          <a href="/us/guide" className="text-xs px-2.5 py-1.5 rounded-lg border border-edge text-dim hover:text-ink transition">Guide</a>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-gold/40 text-gold uppercase tracking-widest">Early access</span>
          <a href="https://app.memecmo.ai/login?next=/dashboard" className="text-xs px-3 py-1.5 rounded-lg bg-brand text-on-brand font-medium hover:brightness-110 transition">Sign in →</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-14 space-y-16">
        {/* Hero */}
        <section className="space-y-5">
          <p className="text-xs tracking-[0.25em] uppercase text-faint">us.memecmo.ai · state-aware GEO · live</p>
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight">
            Be the answer<br />
            <span className="text-brand">in every state.</span>
          </h1>
          <p className="text-base text-dim leading-relaxed max-w-2xl">
            State-aware Generative Engine Optimization for the US market. We measure how AI engines
            recommend your brand <em>state by state</em>, then build the prompts, compliant answers,
            schema and citations each state requires — because in America, the state line changes
            the question <em>and</em> the correct answer.
          </p>
        </section>

        {/* First principles */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b border-edge pb-2">Why state-aware — from first principles</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PRINCIPLES.map((pr) => (
              <div key={pr.n} className="rounded-xl border border-edge bg-surface p-5 space-y-2">
                <div className="text-[11px] font-semibold text-brand tabular-nums">{pr.n}</div>
                <div className="text-sm font-semibold text-ink leading-snug">{pr.title}</div>
                <p className="text-[13px] text-dim leading-relaxed">{pr.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Agent suite, state dimension */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b border-edge pb-2">The agent suite, re-aimed at the state dimension</h2>
          <p className="text-[13px] text-faint">
            Same production engine that runs our Southeast Asia platform — a state slots in exactly where a market does.
            Ten agents, real Google AI Overview surface, frozen prompt panels for scan-to-scan comparability.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {AGENTS.map((a) => (
              <div key={a.name} className="rounded-lg border border-edge bg-surface p-4">
                <div className="text-sm font-medium text-ink mb-1">{a.name}</div>
                <p className="text-[12px] text-dim leading-relaxed">{a.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Regulated verticals */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b border-edge pb-2">Where state law makes GEO non-optional</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {VERTICALS.map((v) => (
              <div key={v.name} className="rounded-lg border border-edge bg-surface p-4">
                <div className="text-sm font-medium text-brand mb-1">{v.name}</div>
                <p className="text-[12px] text-dim leading-relaxed">{v.note}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-faint">
            Regulatory summaries are directional, not legal advice; per-state compliance frames are maintained with counsel review.
          </p>
        </section>

        {/* Coverage */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b border-edge pb-2">Coverage — 50 states, tiered rollout</h2>
          <div className="flex flex-wrap gap-1.5">
            {ALL_STATES.map((s) => {
              const t1 = TIER1.includes(s);
              const t2 = TIER2.includes(s);
              return (
                <span
                  key={s}
                  className={`text-[11px] px-2 py-1 rounded-md border tabular-nums tracking-wide ${
                    t1
                      ? 'border-brand/60 bg-brand-soft text-brand font-semibold'
                      : t2
                        ? 'border-gold/40 bg-gold/10 text-gold'
                        : 'border-edge text-faint'
                  }`}
                >
                  {s}
                </span>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 text-[11px] text-faint">
            <span><span className="text-brand font-semibold">■</span> Tier 1 launch — CA · TX · FL · NY</span>
            <span><span className="text-gold">■</span> Tier 2 — next 12 states</span>
            <span>■ Tier 3 — on demand</span>
          </div>
        </section>

        {/* Architecture note */}
        <section className="rounded-xl border border-brand/40 bg-brand-soft/40 p-5 space-y-2">
          <h2 className="text-sm font-semibold text-ink">Architecture note</h2>
          <p className="text-[13px] text-dim leading-relaxed">
            One project = one brand × one state, on the same production engine that runs our
            Southeast Asia platform. Google AI Overview is measured on the real, state-localized
            surface; frozen prompt panels and competitor sets keep scores comparable scan to scan.
            State regulatory frames are live at the grounding layer for Tier-1 states — every
            content agent writes inside the state's rules by construction, with counsel review
            before publication. Scans run weekly on schedule; a stage-aware digest lands in your
            inbox every Tuesday; credits cover on-demand scans.
          </p>
        </section>

        {/* CTA */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Early access</h2>
          <p className="text-[13px] text-dim max-w-xl">
            The US line is in early access — Tier-1 states are live and measuring today. If you run
            a brand in a regulated vertical and want your state-by-state baseline, request access
            and we'll run the first scan with you:
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://app.memecmo.ai/dashboard"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-medium hover:brightness-110 transition"
            >
              Enter the workspace →
            </a>
            <a
              href="mailto:samchan@memecmo.ai?subject=MemeCMO%20US%20preview%20access"
              className="text-sm text-dim underline underline-offset-2 hover:text-ink transition"
            >
              or email us for access
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-edge px-6 py-6 text-center">
        <p className="text-[11px] text-faint">
          © 2026 MemeCMO Tech Limited · Hong Kong CR No. 80218619 · State-aware GEO for the United States.
        </p>
      </footer>
    </div>
  );
}
