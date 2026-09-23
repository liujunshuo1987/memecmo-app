// Market-level "sources AI engines cite" list — computed from the citation
// index by rule, never hand-ranked. Publishable subset only: domains cited
// across ≥5 projects (our own ≥5-clients-per-published-figure rule) and not
// owned by any tracked brand. Tier rule is the market analogue of the
// T1/T2/T3 standard (FMVN_媒体信源分层手册 v1.0): three tests — volume,
// engine breadth, stability across the two halves of the window.
//
//   npx tsx scripts/sources-report.ts --market VN [--days 60] [--month 2026-09]
//   → data/sources/vn-2026-09.json (+ vn-latest.json), public/sources/*.md (en, vi)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

for (const raw of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = raw.match(/^([A-Z_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, ''); }

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const MARKET = arg('market', 'VN').toUpperCase();
const DAYS = Number(arg('days', '60'));
const MONTH = arg('month', new Date().toISOString().slice(0, 7));
const MARKET_NAME: Record<string, { pattern: string; en: string; vi: string }> = { VN: { pattern: 'viet%', en: 'Vietnam', vi: 'Việt Nam' } };
const mk = MARKET_NAME[MARKET]; if (!mk) { console.error('unknown market', MARKET); process.exit(1); }

// Rules (market level)
const MIN_PROJECTS = 5;      // publishability: cross-industry, ≥5 projects
const T_VOLUME = 40;         // test 1: answers citing the domain in the window
const T_ENGINES = 2;         // test 2: engines
const T_STABLE = 5;          // test 3: answers in EACH half of the window
const LIST_LIMIT = 40;

type Row = { domain: string; answers: number; engines: number; engineList: string[]; projects: number; firstHalf: number; secondHalf: number; brand: boolean };

const TYPE_RULES: [RegExp, string][] = [
  [/^(vnexpress|vietnamnet|cafef|kenh14|vov|vietnam|tuoitre|thanhnien|dantri|znews|zingnews|laodong|baomoi|vtv|nhandan|qdnd|congthuong|vneconomy|thesaigontimes|baodautu|tienphong|nld|plo|sggp|vietnambiz|ictnews|genk|vnbusiness|doanhnhansaigon)\.(vn|net|com|com\.vn|org)$/, 'news'],
  [/^(brandsvietnam|advertisingvietnam|marketingai|mmatoday|campaignasia|adage|marketing-interactive)\./, 'industry media'],
  [/^(reddit|voz|tinhte|webtretho|quora|otofun|lamchame)\./, 'community'],
  [/^(scribd|studocu|slideshare|academia|123docz|tailieu|issuu)\./, 'documents'],
  [/^(facebook|youtube|linkedin|tiktok|instagram|x|twitter|threads|lemon8-app)\./, 'social'],
  [/wikipedia\.org$|^(britannica|wikiwand)\./, 'reference'],
  [/^(mytour|ipos|foody|tripadvisor|booking|agoda|traveloka|sites\.google|yellowpages|trangvangvietnam)\./, 'directory / listing'],
  [/^(google|amazon|shopee|lazada|tiki|apple|microsoft)\./, 'platform'],
];
const typeOf = (d: string) => TYPE_RULES.find(([re]) => re.test(d))?.[1] ?? 'website';

async function main() {
  const pg = await import('pg'); const { Client } = pg.default;
  let rows: Row[] = [], totalAnswers = 0, basis: any = null;
  for (let i = 0; i < 8; i++) {
    const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
    try {
      await c.connect();
      const sql = `
        WITH mkt AS (SELECT p.id FROM projects p WHERE p.target_country ILIKE $1),
        c AS (
          SELECT CASE WHEN g.domain IN ('sites.google.com','docs.google.com','drive.google.com') THEN g.domain
                      WHEN g.domain ~ '\\.(com|net|org|edu|gov|ac|co)\\.[a-z]{2}$' THEN regexp_replace(g.domain, '^.*?([^.]+\\.[a-z]+\\.[a-z]{2})$', '\\1')
                      ELSE regexp_replace(g.domain, '^.*?([^.]+\\.[a-z]+)$', '\\1') END AS domain,
                 g.engine, g.project_id, g.ts, g.is_brand_domain,
                 (g.agent_run_id::text||'|'||g.engine||'|'||coalesce(g.prompt_hash,'')) AS ans
            FROM geo_citations g JOIN mkt ON mkt.id = g.project_id
           WHERE g.ts >= now() - ($2 || ' days')::interval)
        SELECT domain, count(DISTINCT ans) AS answers, count(DISTINCT engine) AS engines, array_agg(DISTINCT engine) AS engine_list,
               count(DISTINCT project_id) AS projects,
               count(DISTINCT ans) FILTER (WHERE ts <  now() - ($3 || ' days')::interval) AS first_half,
               count(DISTINCT ans) FILTER (WHERE ts >= now() - ($3 || ' days')::interval) AS second_half,
               bool_or(is_brand_domain) AS brand
          FROM c GROUP BY domain ORDER BY answers DESC LIMIT 600`;
      const r = await c.query(sql, [mk.pattern, String(DAYS), String(Math.floor(DAYS / 2))]);
      rows = r.rows.map((x: any) => ({ domain: x.domain, answers: Number(x.answers), engines: Number(x.engines), engineList: x.engine_list, projects: Number(x.projects), firstHalf: Number(x.first_half), secondHalf: Number(x.second_half), brand: !!x.brand }));
      const t = await c.query(`
        WITH mkt AS (SELECT p.id FROM projects p WHERE p.target_country ILIKE $1)
        SELECT count(DISTINCT (g.agent_run_id::text||'|'||g.engine||'|'||coalesce(g.prompt_hash,''))) AS answers,
               count(DISTINCT g.project_id) AS projects, count(DISTINCT p.organization_id) AS orgs, count(DISTINCT g.engine) AS engines,
               array_agg(DISTINCT g.engine) AS engine_list, count(DISTINCT p.industry) AS industries, min(g.ts) AS from_ts, max(g.ts) AS to_ts
          FROM geo_citations g JOIN mkt ON mkt.id = g.project_id JOIN projects p ON p.id = g.project_id
         WHERE g.ts >= now() - ($2 || ' days')::interval`, [mk.pattern, String(DAYS)]);
      totalAnswers = Number(t.rows[0].answers);
      basis = { answersWithCitations: totalAnswers, projects: Number(t.rows[0].projects), organizations: Number(t.rows[0].orgs), industries: Number(t.rows[0].industries), engines: t.rows[0].engine_list, from: new Date(t.rows[0].from_ts).toISOString().slice(0, 10), to: new Date(t.rows[0].to_ts).toISOString().slice(0, 10) };
      await c.end(); break;
    } catch (e) { console.error('attempt', i, (e as Error).message); try { await c.end(); } catch {} await new Promise((r) => setTimeout(r, 6000)); if (i === 7) process.exit(1); }
  }

  const excluded = { brandOwned: 0, belowProjects: 0 };
  const listed = rows.filter((r) => {
    if (r.brand) { excluded.brandOwned++; return false; }
    if (r.projects < MIN_PROJECTS) { excluded.belowProjects++; return false; }
    return true;
  }).map((r) => {
    const tests = { volume: r.answers >= T_VOLUME, engines: r.engines >= T_ENGINES, stability: r.firstHalf >= T_STABLE && r.secondHalf >= T_STABLE };
    const passed = Object.values(tests).filter(Boolean).length;
    const tier = passed === 3 ? 'T1' : passed === 2 ? 'T2' : 'T3';
    return { ...r, type: typeOf(r.domain), share: totalAnswers ? Math.round((1000 * r.answers) / totalAnswers) / 10 : 0, tests, tier };
  }).filter((r) => r.tier !== 'T3').slice(0, LIST_LIMIT);

  const out = {
    market: MARKET, marketName: mk, month: MONTH, generatedAt: new Date().toISOString(),
    window: { days: DAYS, from: basis.from, to: basis.to },
    basis,
    rules: { minProjects: MIN_PROJECTS, volume: T_VOLUME, engines: T_ENGINES, stabilityPerHalf: T_STABLE, unit: 'answers citing the domain (one answer citing several pages of a site counts once)', tiers: { T1: 'all three tests', T2: 'two of three', T3: 'not listed' } },
    counts: { candidates: rows.length, listed: listed.length, t1: listed.filter((r) => r.tier === 'T1').length, t2: listed.filter((r) => r.tier === 'T2').length, ...excluded },
    rows: listed.map(({ brand, ...r }, i) => ({ rank: i + 1, ...r })),
  };
  mkdirSync('data/sources', { recursive: true });
  const file = `data/sources/${MARKET.toLowerCase()}-${MONTH}.json`;
  writeFileSync(file, JSON.stringify(out, null, 2));
  writeFileSync(`data/sources/${MARKET.toLowerCase()}-latest.json`, JSON.stringify(out, null, 2));
  console.log(`wrote ${file}: ${out.counts.listed} listed (T1 ${out.counts.t1}, T2 ${out.counts.t2}) of ${out.counts.candidates} candidates; excluded brand-owned ${excluded.brandOwned}, <${MIN_PROJECTS} projects ${excluded.belowProjects}; basis ${basis.projects} projects / ${basis.organizations} orgs / ${basis.industries} industries / ${totalAnswers} answers`);
  console.table(out.rows.slice(0, 25).map((r) => ({ rank: r.rank, domain: r.domain, tier: r.tier, type: r.type, answers: r.answers, share: r.share + '%', engines: r.engines, projects: r.projects, h1: r.firstHalf, h2: r.secondHalf })));
}
main();
