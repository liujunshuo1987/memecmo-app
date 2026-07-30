// Org-level rollup report — every project's latest scan on ONE printable page.
// The Oracle-SVP's team merges per-project reports by hand for leadership;
// this page is that job, automated. RLS scopes everything: non-members see 404,
// channel admins see their end-clients' projects too.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOrgBySlug } from '@/lib/workspace';
import PrintButton from './print-button';

interface PageProps {
  params: { orgSlug: string };
}

interface Row {
  orgName: string;
  brand: string;
  market: string;
  slugPath: string;
  scanAt: string | null;
  score: number | null;
  presence: number | null;
  sov: number | null;
  citation: number | null;
  sentiment: number | null;
  accuracy: number | null;
  rank: string;
  gaps: number | null;
  topRecs: string[];
}

function toScorecard(output: any): any | null {
  if (!output) return null;
  const sc = output.scorecard ?? output;
  return typeof sc?.aigvrScore === 'number' || sc?.metrics ? sc : null;
}

export default async function RollupPage({ params }: PageProps) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=' + encodeURIComponent(`/workspace/${params.orgSlug}/rollup`));

  const org = await getOrgBySlug(params.orgSlug);
  if (!org) {
    return (
      <div className="min-h-screen bg-canvas text-ink flex items-center justify-center">
        <p className="text-sm text-dim">Organization not found or no access.</p>
      </div>
    );
  }

  // This org + its children (channel partners roll their end clients up).
  const { data: children } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('parent_org_id', org.id);
  const orgIds = [{ id: org.id, name: org.name }, ...(children ?? [])];

  const rows: Row[] = [];
  for (const o of orgIds) {
    const { data: projects } = await supabase
      .from('projects')
      .select('id, slug, brand_name, target_country, organizations!inner(slug)')
      .eq('organization_id', o.id)
      .eq('status', 'active');
    for (const p of projects ?? []) {
      const { data: scans } = await supabase
        .from('agent_runs')
        .select('agent_id, output, completed_at')
        .eq('project_id', p.id)
        .in('agent_id', ['monitor', 'full_scan'])
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(3);
      const scanRow = (scans ?? []).map((r) => ({ r, sc: toScorecard(r.output) })).find((x) => x.sc);
      const sc = scanRow?.sc;
      const { data: reports } = await supabase
        .from('agent_runs')
        .select('agent_id, output')
        .eq('project_id', p.id)
        .in('agent_id', ['report', 'full_scan'])
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1);
      const rep = reports?.[0]?.output?.report ?? (reports?.[0]?.agent_id === 'report' ? reports?.[0]?.output : null);
      rows.push({
        orgName: o.name,
        brand: p.brand_name,
        market: p.target_country,
        slugPath: `${(p.organizations as any).slug}/${p.slug}`,
        scanAt: scanRow?.r.completed_at?.slice(0, 10) ?? null,
        score: sc?.aigvrScore ?? null,
        presence: sc?.dimensions?.presence ?? null,
        sov: sc?.dimensions?.competitiveShare ?? null,
        citation: sc?.dimensions?.citation ?? null,
        sentiment: sc?.dimensions?.sentiment ?? null,
        accuracy: sc?.accuracy?.rate ?? null,
        rank: sc?.brandRank ? `#${sc.brandRank}/${(sc.competitorBenchmark || []).length}` : '—',
        gaps: (sc?.gaps || []).length || null,
        topRecs: ((rep?.recommendations as any[]) || []).slice(0, 2).map((r) => String(r.title || '')).filter(Boolean),
      });
    }
  }

  const scoreLabel = ((org.metadata as any)?.scoreLabel as string) || 'AI Mindset Index';
  const showComposite = (org.metadata as any)?.scoreDisplay !== 'enterprise';
  const today = new Date().toISOString().slice(0, 10);
  const num = (v: number | null, suffix = '') => (v != null ? `${Math.round(v)}${suffix}` : '—');

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-faint">GEO Portfolio Rollup · 组织汇总报告</p>
            <h1 className="text-2xl font-bold mt-1">{org.name}</h1>
            <p className="text-xs text-faint mt-1">{today} · {rows.length} projects · latest scan per project</p>
          </div>
          <PrintButton />
        </header>

        <div className="overflow-x-auto rounded-xl border border-edge">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-surface text-left text-[10px] uppercase tracking-wider text-faint">
                <th className="px-3 py-2.5">Brand · 品牌</th>
                <th className="px-3 py-2.5">Market</th>
                {showComposite && <th className="px-3 py-2.5 text-right">{scoreLabel}</th>}
                <th className="px-3 py-2.5 text-right">Presence</th>
                <th className="px-3 py-2.5 text-right">SoV</th>
                <th className="px-3 py-2.5 text-right">Citation</th>
                <th className="px-3 py-2.5 text-right">Sentiment</th>
                <th className="px-3 py-2.5 text-right">Accuracy</th>
                <th className="px-3 py-2.5 text-right">Rank</th>
                <th className="px-3 py-2.5 text-right">Gaps</th>
                <th className="px-3 py-2.5 text-right">Scan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {rows.map((r, i) => (
                <tr key={i} className="bg-canvas">
                  <td className="px-3 py-2.5">
                    <a href={`/workspace/${r.slugPath}`} className="font-medium text-ink hover:text-brand">{r.brand}</a>
                    {r.orgName !== org.name && <div className="text-[10px] text-faint">{r.orgName}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-dim">{r.market}</td>
                  {showComposite && <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{num(r.score)}</td>}
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(r.presence, '%')}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(r.sov, '%')}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(r.citation, '%')}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(r.sentiment)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(r.accuracy, '%')}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.rank}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.gaps ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right text-faint">{r.scanAt ?? '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-faint">No active projects yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {rows.some((r) => r.topRecs.length) && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold border-b border-edge pb-2">Top recommendations · 当前首要建议</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rows.filter((r) => r.topRecs.length).map((r, i) => (
                <div key={i} className="rounded-lg border border-edge bg-surface p-3">
                  <div className="text-[11px] font-semibold text-ink mb-1">{r.brand} · {r.market}</div>
                  <ul className="text-[11px] text-dim space-y-1 list-disc pl-4">
                    {r.topRecs.map((t, j) => <li key={j}>{t}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="pt-4 border-t border-edge text-center text-[10px] text-faint">
          MemeCMO Tech Limited · Hong Kong CR No. 80218619 · Generated {today} · Full data & PDF per project in each workspace
        </footer>
      </div>
    </div>
  );
}
