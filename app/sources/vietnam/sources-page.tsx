// Public page: "Sources AI engines cite in Vietnam" (monthly). Built from
// data/sources/vn-latest.json (scripts/sources-report.ts). Made to be the
// kind of page the engines cite: dated, Dataset + FAQPage schema, a plain
// table with every number's denominator, CC BY 4.0.

import type { Metadata } from 'next';
import data from '@/data/sources/vn-latest.json';
import { copyFor, TYPE_LABEL, type Lang } from '@/lib/sources/copy';

const BASE = 'https://app.memecmo.ai';
const PATH: Record<Lang, string> = { en: '/sources/vietnam', vi: '/sources/vietnam/vi' };
const PDF: Record<Lang, string> = { en: `/sources/MemeCMO_Vietnam_AI_Sources_${data.month}_en.pdf`, vi: `/sources/MemeCMO_Vietnam_AI_Sources_${data.month}_vi.pdf` };

export function sourcesMetadata(lang: Lang): Metadata {
  const c = copyFor(lang, data as any);
  return {
    title: `${c.shortTitle} · MemeCMO`,
    description: c.description,
    alternates: { canonical: `${BASE}${PATH[lang]}`, languages: { en: `${BASE}${PATH.en}`, vi: `${BASE}${PATH.vi}` } },
    openGraph: { title: c.title, description: c.description, type: 'article', url: `${BASE}${PATH[lang]}` },
  };
}

export default function SourcesPage({ lang }: { lang: Lang }) {
  const c = copyFor(lang, data as any);
  const rows = data.rows as any[];
  const other: Lang = lang === 'en' ? 'vi' : 'en';
  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'Dataset', name: c.title, description: c.description, url: `${BASE}${PATH[lang]}`, inLanguage: lang,
      license: 'https://creativecommons.org/licenses/by/4.0/', dateModified: data.generatedAt.slice(0, 10), datePublished: data.generatedAt.slice(0, 10),
      creator: { '@type': 'Organization', name: 'MemeCMO', url: 'https://memecmo.ai' },
      temporalCoverage: `${data.window.from}/${data.window.to}`, spatialCoverage: { '@type': 'Place', name: 'Vietnam' },
      variableMeasured: ['answers citing the source', 'share of answers with citations', 'engines citing', 'brand panels citing'],
      distribution: [{ '@type': 'DataDownload', encodingFormat: 'application/pdf', contentUrl: `${BASE}${PDF[lang]}` }],
    },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: c.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
  ];
  const tierCls = (t: string) => (t === 'T1' ? 'bg-gold/15 text-gold border-gold/40' : 'mc-chip-inset text-dim border-edge');
  return (
    <main lang={c.htmlLang} className="min-h-screen mc-soft text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-4xl mx-auto px-gutter py-8 sm:py-12 mc-enter">
        <header className="flex items-center justify-between gap-4 mb-8">
          <a href="/" className="text-xs tracking-[0.2em] uppercase text-faint hover:text-dim">MemeCMO.ai</a>
          <nav className="flex items-center gap-2 text-[11px]">
            <a href={PATH.en} className={`px-2 py-1 rounded border ${lang === 'en' ? 'border-brand/60 bg-brand-soft text-brand font-semibold' : 'border-edge text-dim hover:text-ink'}`}>EN</a>
            <a href={PATH.vi} className={`px-2 py-1 rounded border ${lang === 'vi' ? 'border-brand/60 bg-brand-soft text-brand font-semibold' : 'border-edge text-dim hover:text-ink'}`}>VI</a>
          </nav>
        </header>

        <p className="text-[11px] uppercase tracking-widest text-faint">{c.updated} {data.generatedAt.slice(0, 10)} · {data.window.days}d</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">{c.title}</h1>
        <p className="mt-2 text-[15px] text-dim leading-relaxed">{c.subtitle}</p>
        <p className="mt-4 text-[14px] leading-relaxed">{c.intro}</p>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {c.kpis.map((k) => (
            <div key={k.label} className="mc-card mc-card-sm px-3 py-2"><div className="text-[10px] uppercase tracking-wider text-faint">{k.label}</div><div className="text-[15px] font-semibold tabular-nums mt-0.5 break-words">{k.value}</div></div>
          ))}
        </div>

        <div className="mt-8 overflow-x-auto mc-card mc-card-sm">
          <table className="w-full text-[12px]">
            <thead><tr className="border-b border-edge text-[10px] uppercase tracking-wider text-faint">
              <th className="px-2 py-2 text-left font-medium">{c.columns.rank}</th><th className="px-2 py-2 text-left font-medium">{c.columns.domain}</th><th className="px-2 py-2 text-left font-medium">{c.columns.type}</th><th className="px-2 py-2 text-left font-medium">{c.columns.tier}</th>
              <th className="px-2 py-2 text-right font-medium">{c.columns.answers}</th><th className="px-2 py-2 text-right font-medium">{c.columns.share}</th><th className="px-2 py-2 text-right font-medium">{c.columns.engines}</th><th className="px-2 py-2 text-right font-medium">{c.columns.projects}</th><th className="px-2 py-2 text-right font-medium whitespace-nowrap">{c.columns.stability}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.domain} className="border-b border-edge/60">
                  <td className="px-2 py-1.5 text-faint tabular-nums">{r.rank}</td>
                  <td className="px-2 py-1.5 font-medium">{r.domain}</td>
                  <td className="px-2 py-1.5 text-dim">{TYPE_LABEL[lang][r.type] ?? r.type}</td>
                  <td className="px-2 py-1.5"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${tierCls(r.tier)}`}>{r.tier}</span></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.answers}<span className="text-faint">/{data.basis.answersWithCitations}</span></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.share}%</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" title={r.engineList.join(', ')}>{r.engines}<span className="text-faint">/{data.basis.engines.length}</span></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.projects}<span className="text-faint">/{data.basis.projects}</span></td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-dim">{r.firstHalf} / {r.secondHalf}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-faint">{c.shareNote}</p>
        <p className="mt-1 text-[11px] text-faint">{c.tierLegend}</p>

        <div className="mt-6 flex flex-wrap gap-2 text-[12px]">
          <a href={PDF[lang]} className="px-3 py-1.5 rounded-md bg-brand text-on-brand font-semibold hover:brightness-110">{c.download}</a>
          <a href={PATH[other]} className="px-3 py-1.5 rounded-md mc-btn-soft text-dim hover:text-ink">{c.downloadOther}</a>
          <a href="/standard/MemeCMO_AI_Visibility_Measurement_Standard_v1.1.pdf" className="px-3 py-1.5 rounded-md mc-btn-soft text-dim hover:text-ink">{c.standard}</a>
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">{c.methodologyTitle}</h2>
          <ul className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-dim list-disc pl-5">{c.methodology.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </section>
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{c.useTitle}</h2>
          <ul className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-dim list-disc pl-5">{c.use.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </section>
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{c.faqTitle}</h2>
          <dl className="mt-2 space-y-3">{c.faq.map((f) => <div key={f.q}><dt className="text-[14px] font-medium">{f.q}</dt><dd className="text-[13.5px] text-dim leading-relaxed mt-0.5">{f.a}</dd></div>)}</dl>
        </section>
        <footer className="mt-12 pt-4 border-t border-edge text-[11px] text-faint">{c.footer}</footer>
      </div>
    </main>
  );
}
