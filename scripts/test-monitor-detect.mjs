// Validate the Monitor detection pipeline against real engine answers (via
// dev proxy). Mirrors monitor.ts norm/mentions/extractUrls. Confirms: brand
// detection works with Vietnamese diacritics, and we capture competitor
// mentions + citations from real answers.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const env = {};
for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function mentions(hay, name) {
  const h = norm(hay);
  const full = norm(name).trim();
  if (full.length >= 3 && h.includes(full)) return true;
  const w = full.split(/\s+/);
  if (w.length >= 2) {
    const short = w.slice(0, 2).join(' ');
    if (short.length >= 5 && h.includes(short)) return true;
  }
  return false;
}
const extractUrls = (t) => Array.from(new Set((t.match(/https?:\/\/[^\s<>)\]]+/gi) || []).map((u) => u.replace(/[.,;]+$/, ''))));

function ask(model, prompt) {
  const raw = execFileSync(
    'curl',
    ['-s', '-x', 'http://127.0.0.1:7890', '--max-time', '60', 'https://api.poe.com/v1/chat/completions',
      '-H', `Authorization: Bearer ${env.POE_API_KEY}`, '-H', 'Content-Type: application/json',
      '-d', JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 900, temperature: 0.3 })],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
  return JSON.parse(raw)?.choices?.[0]?.message?.content || '';
}

const brand = 'Focus Media Vietnam';
const competitors = ['Chicilon Media', 'Vietnam OOH', 'Goldsun Media', 'Lifesight'];
const probes = [
  { engine: 'GPT-4o', prompt: 'focus media vietnam có tốt không' },
  { engine: 'GPT-4o', prompt: 'các công ty quảng cáo thang máy uy tín ở việt nam' },
  { engine: 'Perplexity-Sonar', prompt: 'các công ty quảng cáo màn hình trong thang máy ở việt nam' },
];

for (const p of probes) {
  console.log(`\n=== [${p.engine}] ${p.prompt}`);
  const ans = ask(p.engine, p.prompt);
  const bp = mentions(ans, brand);
  const cps = competitors.filter((c) => mentions(ans, c));
  const urls = extractUrls(ans);
  console.log(`brandPresent=${bp}  competitors=[${cps.join(', ')}]  citations=${urls.length}`);
  console.log('answer snippet:', ans.slice(0, 220).replace(/\n/g, ' '));
}
