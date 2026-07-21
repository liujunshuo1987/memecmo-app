// Hidden concept-test page for the us.memecmo.ai sub-system.
// State-aware GEO for the US market — pure English, unlinked, noindex.
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
  title: 'MemeCMO US — State-Aware GEO · Private Preview',
  description:
    'Generative Engine Optimization measured and built state by state — prompts, compliant answers and citations grounded in each state\'s law and market.',
  robots: { index: false, follow: false },
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
  { name: 'State Prompt Discovery', body: '100+ buyer questions per state — high-intent (who/best/price/compare + state) and educational — mined from how each state actually searches.' },
  { name: 'Compliance-Grounded Answers', body: 'Canonical answers written against your verified facts AND the state\'s regulatory frame — the answer we want AI to give in that state, safely.' },
  { name: 'Per-State AI Mindset Index', body: 'The five-dimension visibility score measured state by state across ChatGPT, Gemini, Perplexity, Claude and the real Google AI Overview surface, localized to state metros.' },
  { name: 'State Citation Index', body: 'Which domains AI actually cites for your category in each state — the build-here list for directories, PR and reviews.' },
  { name: 'LocalBusiness Schema per State', body: 'Paste-in JSON-LD with state-scoped areaServed, licenses and NAP — machine-readable proof you operate there.' },
  { name: 'State Gap → Content Engine', body: 'Every state-level gap becomes a publish-ready page: state landing pages, incentive explainers, licensure FAQs.' },
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
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-edge px-6 py-3 flex items-center justify-between">
        <span className="text-xs tracking-[0.2em] uppercase text-dim">MemeCMO · US</span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-gold/40 text-gold uppercase tracking-widest">Private preview</span>
          <a href="/login?next=/dashboard" className="text-xs px-3 py-1.5 rounded-lg bg-brand text-on-brand font-medium hover:brightness-110 transition">Sign in →</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-14 space-y-16">
        {/* Hero */}
        <section className="space-y-5">
          <p className="text-xs tracking-[0.25em] uppercase text-faint">us.memecmo.ai · concept test</p>
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
            One project = one brand × one state. English-native pipeline end to end. The measurement
            surface localizes Google AI Overview to state metros; the five-dimension index, frozen
            competitor sets and monthly prompt refresh carry over unchanged. State regulatory frames
            enter at the grounding layer — the same place brand facts do — so every content agent
            writes inside the state’s rules by construction.
          </p>
        </section>

        {/* CTA */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Private preview</h2>
          <p className="text-[13px] text-dim max-w-xl">
            us.memecmo.ai is in concept testing. If you run a brand in a regulated vertical and want
            to see your state-by-state AI visibility, request access:
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/dashboard"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-medium hover:brightness-110 transition"
            >
              Enter the workspace →
            </a>
            <a
              href="mailto:liujunshuo1987@gmail.com?subject=MemeCMO%20US%20preview%20access"
              className="text-sm text-dim underline underline-offset-2 hover:text-ink transition"
            >
              or email us for access
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-edge px-6 py-6 text-center">
        <p className="text-[11px] text-faint">
          © 2026 MemeCMO Tech Limited · Hong Kong CR No. 80218619 · Private concept page — not indexed, not linked.
        </p>
      </footer>
    </div>
  );
}
