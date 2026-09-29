'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import { useAuth } from '@/contexts/auth-context';
import {
  CREDIT_COPY, FAMILY_COPY, PAGE_COPY, PARTNER_COPY, PRICING_FAQ, RULES_COPY,
  fmtUsd, planFamily, planServiceGroups, readPlanLang,
  type PlanLang, type PlanRowLike,
} from '@/lib/plans-catalog';

const STANDARD_PDF = '/standard/MemeCMO_AI_Visibility_Measurement_Standard_v1.1.pdf';
const CONTACT = 'mailto:samchan@memecmo.ai?subject=MemeCMO%20Scale%20plan';
const PARTNER = 'mailto:samchan@memecmo.ai?subject=MemeCMO%20partner%20programme';

export default function PricingClient({ plans, packs }: {
  plans: PlanRowLike[];
  packs: { key: string; credits: number; usd: number }[];
}) {
  const [lang, setLang] = useState<PlanLang>('zh');
  const [region, setRegion] = useState<'sea' | 'us'>('sea');
  const { user } = useAuth();

  useEffect(() => { setLang(readPlanLang()); }, []);
  const changeLang = (l: PlanLang) => { setLang(l); try { localStorage.setItem('memecmo-uilang', l); } catch { /* ignore */ } };

  const c = PAGE_COPY[lang];
  const regions = useMemo(() => Array.from(new Set(plans.map((p) => p.region ?? 'sea'))), [plans]);
  const shown = useMemo(() => plans.filter((p) => (p.region ?? 'sea') === region), [plans, region]);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <Navbar />
      <main className="pt-28 pb-20 px-4">
        <div className="max-w-6xl mx-auto space-y-16">
          {/* ── header ── */}
          <header className="text-center space-y-4 mc-enter">
            <div className="flex items-center justify-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.25em] text-brand">{c.kicker}</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold leading-tight max-w-3xl mx-auto">{c.title}</h1>
            <p className="text-sm md:text-base text-dim max-w-2xl mx-auto leading-relaxed">{c.subtitle}</p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {(['zh', 'en', 'vi'] as PlanLang[]).map((l) => (
                <button key={l} onClick={() => changeLang(l)}
                  className={`text-[11px] px-2.5 py-1 rounded-full transition ${lang === l ? 'mc-pill-active' : 'mc-btn-soft text-dim hover:text-ink'}`}>
                  {l === 'zh' ? '中文' : l === 'en' ? 'EN' : 'VN'}
                </button>
              ))}
              {regions.length > 1 && (
                <span className="inline-flex items-center gap-1 ml-3">
                  {(['sea', 'us'] as const).filter((r) => regions.includes(r)).map((r) => (
                    <button key={r} onClick={() => setRegion(r)}
                      className={`text-[11px] px-2.5 py-1 rounded-full transition ${region === r ? 'mc-pill-active' : 'mc-btn-soft text-dim hover:text-ink'}`}>
                      {c.region[r]}
                    </button>
                  ))}
                </span>
              )}
            </div>
          </header>

          {/* ── plan cards ── */}
          <section className="grid md:grid-cols-3 gap-6">
            {shown.map((p, i) => {
              const fam = planFamily(p.id);
              const copy = FAMILY_COPY[lang][fam];
              const hero = fam === 'standard';
              const enterprise = fam === 'premium';
              return (
                <article key={p.id} style={{ '--i': i } as React.CSSProperties}
                  className={`mc-card mc-enter p-7 flex flex-col gap-5 ${hero ? 'mc-card-accent' : ''}`}>
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="text-xl font-bold">{copy.name}</h2>
                      <span className="text-[10px] uppercase tracking-wider text-faint">{c.perBrand}</span>
                    </div>
                    <p className="text-sm text-brand mt-1">{copy.tagline}</p>
                  </div>
                  <div className="mc-well-round px-5 py-4 text-center">
                    <div className="text-3xl font-bold tabular-nums">
                      {fmtUsd(p.price_usd_month)}{enterprise ? '+' : ''}
                      <span className="text-sm font-normal text-faint"> {c.perMonth}</span>
                    </div>
                  </div>
                  <p className="text-[13px] text-dim leading-relaxed flex-1">{copy.audience}</p>
                  <ul className="text-[12px] text-dim space-y-1.5">
                    {planServiceGroups(p, lang).flatMap((g) => g.items.slice(0, 2)).slice(0, 5).map((it) => (
                      <li key={it} className="flex gap-2"><span className="text-brand">•</span><span>{it}</span></li>
                    ))}
                  </ul>
                  {enterprise ? (
                    <a href={CONTACT} className="block text-center text-sm font-semibold px-4 py-2.5 rounded-xl mc-btn-brand hover:brightness-110 transition">{c.contact}</a>
                  ) : (
                    <Link href={user ? '/dashboard' : '/login?redirect=%2Fdashboard'}
                      className={`block text-center text-sm font-semibold px-4 py-2.5 rounded-xl transition ${hero ? 'mc-btn-brand hover:brightness-110' : 'mc-btn-soft text-ink hover:text-brand'}`}>
                      {user ? c.subscribe : c.signIn}
                    </Link>
                  )}
                </article>
              );
            })}
          </section>

          {/* ── service items in detail ── */}
          <section className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">{c.compareTitle}</h2>
              <p className="text-[13px] text-dim max-w-2xl mx-auto leading-relaxed">{c.standardNote} <a href={STANDARD_PDF} target="_blank" rel="noreferrer" className="text-brand underline underline-offset-2">{c.standardCta} →</a></p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {shown.map((p) => {
                const fam = planFamily(p.id);
                return (
                  <div key={p.id} className="mc-card-soft p-6 space-y-5">
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-base font-bold">{FAMILY_COPY[lang][fam].name}</h3>
                      <span className="text-sm text-dim tabular-nums">{fmtUsd(p.price_usd_month)}{fam === 'premium' ? '+' : ''} {c.perMonth}</span>
                    </div>
                    {planServiceGroups(p, lang).map((g) => (
                      <div key={g.title}>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-faint mb-2">{g.title}</div>
                        <ul className="space-y-2">
                          {g.items.map((it) => (
                            <li key={it} className="text-[12px] text-dim leading-relaxed flex gap-2">
                              <span className="text-sage shrink-0">✓</span><span>{it}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── credits ── */}
          <Credits lang={lang} packs={packs} />

          {/* ── rules ── */}
          <section className="space-y-5">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">{RULES_COPY[lang].title}</h2>
              <p className="text-[13px] text-dim">{RULES_COPY[lang].lead}</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {RULES_COPY[lang].rows.map(([h, b]) => (
                <div key={h} className="mc-card-soft p-5">
                  <div className="text-sm font-semibold mb-1">{h}</div>
                  <p className="text-[12px] text-dim leading-relaxed">{b}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── partners ── */}
          <section className="mc-card mc-card-accent p-7 md:flex items-center justify-between gap-8">
            <div className="space-y-2 max-w-3xl">
              <h2 className="text-lg font-bold">{PARTNER_COPY[lang].title}</h2>
              <p className="text-[13px] text-dim leading-relaxed">{PARTNER_COPY[lang].body}</p>
            </div>
            <a href={PARTNER} className="inline-block mt-4 md:mt-0 shrink-0 text-sm font-semibold px-5 py-2.5 rounded-xl mc-btn-brand hover:brightness-110 transition">{PARTNER_COPY[lang].cta} →</a>
          </section>

          {/* ── faq ── */}
          <section className="space-y-4 max-w-3xl mx-auto">
            {PRICING_FAQ[lang].map(([q, a]) => (
              <details key={q} className="mc-card-soft px-5 py-4 group">
                <summary className="text-sm font-semibold cursor-pointer list-none flex justify-between items-center gap-3">
                  <span>{q}</span><span className="text-faint group-open:rotate-45 transition">+</span>
                </summary>
                <p className="text-[12px] text-dim leading-relaxed mt-3">{a}</p>
              </details>
            ))}
            <div className="text-center pt-2">
              <Link href="/guide" className="text-[12px] text-brand underline underline-offset-2">{c.guideCta} →</Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Credits({ lang, packs }: { lang: PlanLang; packs: { key: string; credits: number; usd: number }[] }) {
  const k = CREDIT_COPY[lang];
  return (
    <section className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">{k.title}</h2>
        <p className="text-[13px] text-dim max-w-3xl mx-auto leading-relaxed">{k.lead}</p>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="mc-card-soft p-6">
          <div className="text-[10px] uppercase tracking-[0.2em] text-faint mb-3">{k.costsTitle}</div>
          <table className="w-full text-[12px]">
            <tbody>
              {k.costs.map(([what, n]) => (
                <tr key={what} className="border-t border-edge/60 first:border-0">
                  <td className="py-2 pr-3 text-dim">{what}</td>
                  <td className="py-2 text-right font-semibold tabular-nums whitespace-nowrap">{n} cr</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mc-card-soft p-6 space-y-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-faint">{k.packsTitle}</div>
          <div className="grid grid-cols-3 gap-3">
            {packs.map((p) => {
              const bonus = Math.round((p.credits / p.usd - 1) * 100);
              return (
                <div key={p.key} className="mc-well-round px-3 py-4 text-center">
                  <div className="text-lg font-bold tabular-nums">{p.credits.toLocaleString('en-US')}</div>
                  <div className="text-[10px] text-faint">cr</div>
                  <div className="text-sm font-semibold tabular-nums mt-1">{fmtUsd(p.usd)}</div>
                  {bonus > 0 && <div className="text-[10px] text-sage mt-0.5">+{bonus}%</div>}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-faint leading-relaxed">{k.packsNote}</p>
        </div>
      </div>
      <div className="grid md:grid-cols-4 gap-4">
        {k.rules.map(([h, b]) => (
          <div key={h} className="mc-card-soft p-5">
            <div className="text-sm font-semibold mb-1">{h}</div>
            <p className="text-[12px] text-dim leading-relaxed">{b}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
