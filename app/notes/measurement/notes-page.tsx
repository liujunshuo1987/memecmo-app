// Public page: measurement notes for clients reading the weekly report and the
// dashboard. Generic by design — no client and no client figure (content in
// lib/notes/measurement.ts). Not indexed: it is an explanation for people who
// already hold a report, not a publication.

import type { Metadata } from 'next';
import { NOTES, NOTES_PATH, NOTES_STANDARD_PDF, type NotesBlock, type NotesLang } from '@/lib/notes/measurement';

const BASE = 'https://app.memecmo.ai';
const LANGS: { lang: NotesLang; label: string }[] = [{ lang: 'vi', label: 'VI' }, { lang: 'zh', label: '中文' }, { lang: 'en', label: 'EN' }];

export function notesMetadata(lang: NotesLang): Metadata {
  const n = NOTES[lang];
  return {
    title: `${n.title} · MemeCMO`,
    description: n.subtitle,
    alternates: { canonical: `${BASE}${NOTES_PATH[lang]}` },
    robots: { index: false, follow: false },
  };
}

function Block({ b }: { b: NotesBlock }) {
  switch (b.t) {
    case 'p':
      return <p className="mt-3 text-[14px] leading-relaxed text-dim">{b.text}</p>;
    case 'status':
      return <p className="mt-3"><span className="inline-block text-[11px] font-semibold px-2 py-1 rounded border border-gold/40 bg-gold/15 text-gold">{b.text}</span></p>;
    case 'dl':
      return (
        <dl className="mt-3 space-y-4">
          {b.items.map((it) => (
            <div key={it.term} className="mc-card mc-card-sm px-4 py-3">
              <dt className="text-[14px] font-semibold">{it.term}</dt>
              <dd className="mt-1 text-[13.5px] leading-relaxed text-dim">{it.text}</dd>
            </div>
          ))}
        </dl>
      );
    case 'ol':
      return <ol className="mt-3 space-y-2 text-[14px] leading-relaxed text-dim list-decimal pl-5">{b.items.map((x, i) => <li key={i}>{x}</li>)}</ol>;
    case 'ul':
      return <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-dim list-disc pl-5">{b.items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
    case 'table':
      return (
        <div className="mt-4 overflow-x-auto mc-card mc-card-sm">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-edge text-[10px] uppercase tracking-wider text-faint">{b.head.map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {b.rows.map((r) => (
                <tr key={r[0]} className="border-b border-edge/60 align-top">
                  {r.map((c, i) => <td key={i} className={`px-3 py-2 leading-relaxed ${i === 0 ? 'font-semibold whitespace-nowrap' : 'text-dim'}`}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export default function NotesPage({ lang }: { lang: NotesLang }) {
  const n = NOTES[lang];
  return (
    <main lang={n.htmlLang} className="min-h-screen mc-soft text-ink">
      <div className="max-w-3xl mx-auto px-gutter py-8 sm:py-12 mc-enter">
        <header className="flex items-center justify-between gap-4 mb-8">
          <a href="/" className="text-xs tracking-[0.2em] uppercase text-faint hover:text-dim">MemeCMO.ai</a>
          <nav className="flex items-center gap-2 text-[11px]">
            {LANGS.map((l) => (
              <a key={l.lang} href={NOTES_PATH[l.lang]} className={`px-2 py-1 rounded border ${l.lang === lang ? 'border-brand/60 bg-brand-soft text-brand font-semibold' : 'border-edge text-dim hover:text-ink'}`}>{l.label}</a>
            ))}
          </nav>
        </header>

        <p className="text-[11px] uppercase tracking-widest text-faint">{n.updated}</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">{n.title}</h1>
        <p className="mt-2 text-[15px] text-dim leading-relaxed">{n.subtitle}</p>

        <nav className="mt-6 mc-card mc-card-sm px-4 py-3">
          <ul className="space-y-1 text-[13px]">{n.sections.map((s) => <li key={s.id}><a href={`#${s.id}`} className="text-dim hover:text-ink">{s.h}</a></li>)}</ul>
        </nav>

        {n.sections.map((s) => (
          <section key={s.id} id={s.id} className="mt-10 scroll-mt-6">
            <h2 className="text-lg font-semibold">{s.h}</h2>
            {s.blocks.map((b, i) => <Block key={i} b={b} />)}
          </section>
        ))}

        <div className="mt-10 flex flex-wrap gap-2 text-[12px]">
          <a href={NOTES_STANDARD_PDF} className="px-3 py-1.5 rounded-md mc-btn-soft text-dim hover:text-ink">{n.standard}</a>
          <a href={n.method.url} rel="noopener" className="px-3 py-1.5 rounded-md mc-btn-soft text-dim hover:text-ink">{n.method.label}</a>
        </div>
        <footer className="mt-8 pt-4 border-t border-edge text-[11px] text-faint leading-relaxed">{n.footer}</footer>
      </div>
    </main>
  );
}
