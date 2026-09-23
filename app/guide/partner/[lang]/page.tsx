// Partner Delivery Playbook — path-based language editions.
// /guide/partner/zh|en|vi|th|ar — five crawlable URLs with hreflang
// alternates. Layout follows the corporate VI document system
// (00_品牌VI文书模版): letterhead + rose rule, wine cover band, wine table
// heads, gold key-sentence bars. Arabic renders full RTL.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LANGS, LANG_NAMES, PLAYBOOK, type PlaybookLang, type PTable } from '../content';
import { LoopDiagram, P1Diagram, P2Diagram, TimelineDiagram } from '../diagrams';

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

const BASE = 'https://app.memecmo.ai/guide/partner';

export function generateMetadata({ params }: { params: { lang: string } }): Metadata {
  const lang = params.lang as PlaybookLang;
  const c = PLAYBOOK[lang];
  if (!c) return {};
  return {
    title: `${c.title} — MemeCMO`,
    description: c.subtitle,
    alternates: {
      canonical: `${BASE}/${lang}`,
      languages: Object.fromEntries(LANGS.map((l) => [PLAYBOOK[l].htmlLang, `${BASE}/${l}`])),
    },
  };
}

/* VI letterhead badge — the rose bubble-M (same geometry as the app logo). */
function Badge({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M14 12 h36 a6 6 0 0 1 6 6 v20 a6 6 0 0 1 -6 6 h-24 l-10 9 v-9 h-2 a6 6 0 0 1 -6 -6 v-20 a6 6 0 0 1 6 -6 z" fill="var(--brand)" />
      <path d="M22 38 V20 l10 11 10-11 v18" fill="none" stroke="var(--on-brand)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DataTable({ t, firstColStrong = true }: { t: PTable; firstColStrong?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-edge-rose">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-brand-deep">
            {t.cols.map((c) => (
              <th key={c} className="px-3 py-2 font-medium text-on-brand whitespace-nowrap text-start" style={{ color: 'var(--on-brand)' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, i) => (
            <tr key={i} className={`border-t border-edge-rose align-top ${i % 2 === 1 ? 'bg-brand-soft/60' : ''}`}>
              {row.map((cell, j) => (
                <td key={j} className={`px-3 py-2.5 leading-relaxed ${j === 0 && firstColStrong ? 'text-brand-deep font-medium' : 'text-dim'}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Figure({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="rounded-xl border border-edge-rose bg-surface p-4">
      <div dir="ltr">{children}</div>
      <figcaption className="pt-2 text-[11px] text-faint text-center">{caption}</figcaption>
    </figure>
  );
}

function SectionH({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-brand-deep border-b-2 border-brand pb-2">{children}</h2>;
}

export default function PartnerPlaybookPage({ params }: { params: { lang: string } }) {
  const lang = params.lang as PlaybookLang;
  const c = PLAYBOOK[lang];
  if (!c) notFound();
  const dir = c.rtl ? 'rtl' : 'ltr';

  return (
    <div className="min-h-screen bg-canvas text-ink" dir={dir} lang={c.htmlLang}>
      {/* App chrome: language switcher only */}
      <header className="sticky top-0 z-10 border-b border-edge bg-canvas/95 backdrop-blur px-6 py-2.5 flex items-center justify-between" dir="ltr">
        <Link href="/guide" className="text-xs tracking-[0.2em] text-dim uppercase hover:text-ink">MemeCMO.ai</Link>
        <nav className="flex items-center gap-2">
          {LANGS.map((l) => (
            <Link key={l} href={`/guide/partner/${l}`}
              className={`text-[11px] px-2 py-1 rounded border transition ${l === lang ? 'border-brand/60 text-brand bg-brand-soft' : 'border-edge text-dim hover:text-ink'}`}>
              {LANG_NAMES[l]}
            </Link>
          ))}
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-10">
        {/* ── VI letterhead: badge + wordmark · doc type · rose rule ── */}
        <div className="space-y-2" dir="ltr">
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2.5">
              <Badge />
              <span className="text-[13px] font-semibold tracking-[0.35em] text-ink">MEMECMO.AI</span>
            </span>
            <span className="text-end text-[10px] uppercase tracking-[0.15em] text-faint leading-relaxed">{c.docType}</span>
          </div>
          <div className="border-t-2 border-brand" />
        </div>

        {/* ── Cover band: rose ground (one step lighter than the print wine —
            screens carry large color blocks heavier than paper), white title ── */}
        <div className="rounded-lg bg-brand px-6 py-5 space-y-2 !mt-4">
          <h1 className="text-[22px] font-bold leading-snug" style={{ color: 'var(--on-brand)' }}>{c.title}</h1>
          <p className="text-[13px] leading-relaxed text-on-brand-deep">{c.subtitle}</p>
        </div>

        {/* ── One-liner box (rose bar) ── */}
        <p className="text-[13px] text-ink leading-relaxed rounded-lg bg-brand-soft border-s-4 border-brand px-4 py-3">{c.oneLiner}</p>

        <Figure caption={c.figCaps[0]}><LoopDiagram /></Figure>

        <section className="space-y-4">
          <SectionH>{c.s0.h}</SectionH>
          <DataTable t={c.s0.t} />
        </section>

        <section className="space-y-4">
          <SectionH>{c.s1.h}</SectionH>
          <Figure caption={c.figCaps[1]}><P1Diagram /></Figure>
          <DataTable t={c.s1.t} />
          <p className="text-[13px] text-dim leading-relaxed">{c.s1.promise}</p>
        </section>

        <section className="space-y-4">
          <SectionH>{c.s2.h}</SectionH>
          <Figure caption={c.figCaps[2]}><P2Diagram /></Figure>
          <p className="text-[13px] text-dim leading-relaxed">{c.s2.intro}</p>
          <DataTable t={c.s2.t} />
          {/* Gold key-sentence bar (VI .key) */}
          <p className="text-[13px] text-ink leading-relaxed rounded-lg border-s-4 border-gold px-4 py-3" style={{ background: 'color-mix(in srgb, var(--gold) 10%, transparent)' }}>{c.s2.key}</p>
        </section>

        <section className="space-y-4">
          <SectionH>{c.s3.h}</SectionH>
          <p className="text-[13px] text-dim leading-relaxed">{c.s3.para}</p>
          <div className="overflow-x-auto rounded-lg border border-edge-rose">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-brand-deep">
                  {c.s3.cols.map((col) => (
                    <th key={col} className="px-3 py-2 font-medium whitespace-nowrap text-start" style={{ color: 'var(--on-brand)' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-edge-rose">
                  <td colSpan={c.s3.cols.length} className="px-3 py-2.5 text-[11.5px] text-faint leading-relaxed">{c.s3.note}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <SectionH>{c.s4.h}</SectionH>
          <DataTable t={c.s4.t} />
        </section>

        <section className="space-y-4">
          <SectionH>{c.s5.h}</SectionH>
          <Figure caption={c.figCaps[3]}><TimelineDiagram /></Figure>
          <DataTable t={c.s5.t} />
          <p className="text-[13px] text-dim leading-relaxed">{c.s5.success}</p>
        </section>

        <section className="space-y-4">
          <SectionH>{c.s6.h}</SectionH>
          <DataTable t={c.s6.t} />
        </section>

        <section className="space-y-4">
          <SectionH>{c.s7.h}</SectionH>
          <ul className="space-y-2">
            {c.s7.items.map((it, i) => (
              <li key={i} className="flex items-start gap-2.5 rounded-lg border border-edge-rose bg-surface px-4 py-2.5 text-[13px] text-dim leading-relaxed">
                <span className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-sm border-2 border-brand/50" aria-hidden />
                {it}
              </li>
            ))}
          </ul>
        </section>

        <footer className="border-t border-edge-rose pt-4 text-[11px] text-faint text-center">{c.foot}</footer>
      </main>
    </div>
  );
}
