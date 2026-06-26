// Validate the Report prompt against the real scorecard in the DB (Poe via dev
// proxy). Mirrors report.ts digest + prompt + parsing.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: proj } = await sb.from('projects').select('id,brand_name,brand_url,target_country,industry').eq('slug', 'vietnam-2026').single();
const { data: asset } = await sb.from('assets').select('content').eq('project_id', proj.id).eq('type', 'geo_scorecard').order('created_at', { ascending: false }).limit(1).single();
const sc = JSON.parse(asset.content);

function digest(sc) {
  return {
    aigvrScore: sc.aigvrScore, dimensions: sc.dimensions,
    perStage: (sc.metrics?.perStage || []).map((s) => ({ stage: s.stage, presence: s.presence, aigvr: s.aigvr, brandHits: s.brandHits, queries: s.queries })),
    perEngine: (sc.metrics?.perEngine || []).map((e) => ({ engine: e.engine, presence: e.presence, aigvr: e.aigvr })),
    competitorBenchmark: (sc.competitorBenchmark || []).map((b) => ({ name: b.name, sovPct: b.sovPct, isBrand: b.isBrand })),
    citations: sc.citations,
    gaps: (sc.gaps || []).slice(0, 12).map((g) => ({ stage: g.stage, engine: g.engine, prompt: g.prompt, competitors: g.competitorsPresent })),
    competitors: sc.competitors,
  };
}

const system =
  'You are a senior Generative Engine Optimization (GEO) consultant writing a client-ready report. You understand exactly how AI answer engines decide what to surface: authoritative structured content answering buyer questions; citing third-party sources (directories, review/comparison sites, news, Wikipedia); structured data (schema); consistent brand mentions. Recommendations are concrete and tied to the actual gaps, never generic fluff. Output strict JSON only.';
const user = [
  `Brand: ${proj.brand_name}` + (proj.brand_url ? ` (${proj.brand_url})` : ''),
  `Market: ${proj.target_country} · ${proj.industry}`,
  'Buyer queries are in the local language; keep example queries verbatim.', '',
  'AIGVR measurement:', '```json', JSON.stringify(digest(sc), null, 2), '```', '',
  'Write a GEO report as JSON: { "executiveSummary": str, "keyFindings": [{"finding","evidence"}], "recommendations": [{"priority":"P0|P1|P2","title","targetStage","rationale","actions":[str],"expectedImpact"}], "quickWins": [str] }',
  'Rules: 3-5 keyFindings, 4-6 recommendations P0-first each tied to a real gap/weak stage. Keep rationale 1-2 sentences, <=4 actions. Professional English.',
].join('\n');

console.log('Composing report from AIGVR', sc.aigvrScore, '…\n');
const raw = execFileSync('curl', ['-s', '-x', 'http://127.0.0.1:7890', '--max-time', '120',
  'https://api.poe.com/v1/chat/completions', '-H', `Authorization: Bearer ${env.POE_API_KEY}`, '-H', 'Content-Type: application/json',
  '-d', JSON.stringify({ model: 'Claude-Sonnet-4.5', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 6000, temperature: 0.5 })],
  { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const content = JSON.parse(raw)?.choices?.[0]?.message?.content || '';

function parseJsonFromLLM(text) {
  const t = text.trim(); const f = t.match(/```(?:json)?\s*([\s\S]*?)```/i); const c = f ? f[1].trim() : t;
  try { return JSON.parse(c); } catch {
    const s = Math.min(...[c.indexOf('{'), c.indexOf('[')].filter((i) => i !== -1)); const e = Math.max(c.lastIndexOf('}'), c.lastIndexOf(']'));
    return JSON.parse(c.slice(s, e + 1));
  }
}
const r = parseJsonFromLLM(content);
console.log('EXEC SUMMARY:\n', r.executiveSummary, '\n');
console.log('KEY FINDINGS:');
for (const f of r.keyFindings) console.log(`  • ${f.finding}\n    ↳ ${f.evidence}`);
console.log('\nRECOMMENDATIONS:');
for (const rec of r.recommendations) {
  console.log(`  [${rec.priority}] ${rec.title}  (→ ${rec.targetStage})`);
  console.log(`      why: ${rec.rationale.slice(0, 140)}`);
  for (const a of (rec.actions || []).slice(0, 3)) console.log(`      - ${a}`);
}
console.log('\nQUICK WINS:', (r.quickWins || []).join(' | '));
const ok = r.executiveSummary && r.keyFindings?.length >= 3 && r.recommendations?.length >= 4;
console.log(`\n${ok ? '✔ report OK' : '✗ report shape FAILED'}`);
process.exit(ok ? 0 : 2);
