// Client-safe trend helpers — no server imports (lib/workspace.ts pulls in
// next/headers via the Supabase server client and cannot be bundled into a
// client component). Shared by getScanHistory (server) and the workspace
// client's live updates.

export interface ScanPoint {
  runId: string;
  ts: string;
  aigvr: number | null;
  presence: number | null;
  rank: number | null;
  gaps: number;
  prominence: number | null;
  sentiment: number | null;
  citation: number | null;
  competitive: number | null;
  topOfMind: number | null;
  // Added 2026-09-23 for the "presence over time" chart: answers in the scan,
  // per-competitor presence (top 8 by hits) and per-engine brand presence.
  queries?: number;
  bench?: { name: string; presence: number; hits: number }[];
  perEngine?: { engine: string; presence: number; brandHits: number; queries: number }[];
}

// Compact trend extras from a scorecard.
export function trendExtras(sc: Record<string, any>): Pick<ScanPoint, 'queries' | 'bench' | 'perEngine'> {
  const bench = (Array.isArray(sc.competitorBenchmark) ? sc.competitorBenchmark : [])
    .filter((b: any) => !b.isBrand)
    .sort((a: any, b: any) => (b.hits ?? 0) - (a.hits ?? 0))
    .slice(0, 8)
    .map((b: any) => ({ name: String(b.name), presence: Number(b.sovPct ?? 0), hits: Number(b.hits ?? 0) }));
  const perEngine = (Array.isArray(sc.metrics?.perEngine) ? sc.metrics.perEngine : [])
    .map((e: any) => ({ engine: String(e.engine), presence: Number(e.presence ?? 0), brandHits: Number(e.brandHits ?? 0), queries: Number(e.queries ?? 0) }));
  return { queries: sc.metrics?.overall?.queries ?? sc.sampled?.queries ?? undefined, bench, perEngine };
}
