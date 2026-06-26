// Validate the Monitor judge pass against real engine answers (via dev proxy).
// Mirrors monitor.ts judgeEngineAnswers prompt + parsing.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const env = {};
for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

function ask(model, prompt, maxTokens = 900) {
  const raw = execFileSync('curl', ['-s', '-x', 'http://127.0.0.1:7890', '--max-time', '70',
    'https://api.poe.com/v1/chat/completions', '-H', `Authorization: Bearer ${env.POE_API_KEY}`,
    '-H', 'Content-Type: application/json',
    '-d', JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0.2 })],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(raw)?.choices?.[0]?.message?.content || '';
}

function parseJsonFromLLM(text) {
  const t = text.trim();
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const c = f ? f[1].trim() : t;
  try { return JSON.parse(c); } catch {
    const s = Math.min(...[c.indexOf('{'), c.indexOf('[')].filter((i) => i !== -1));
    const e = Math.max(c.lastIndexOf('}'), c.lastIndexOf(']'));
    return JSON.parse(c.slice(s, e + 1));
  }
}

const brand = 'Focus Media Vietnam';
const competitors = ['Chicilon Media', 'Goldsun Media', 'VioOh'];
const prompts = [
  'focus media vietnam có tốt không',
  'công ty quảng cáo thang máy nào tốt nhất việt nam',
  'các hình thức quảng cáo ngoài trời phổ biến ở việt nam',
  'chi phí quảng cáo màn hình thang máy ở hà nội',
];

console.log('Querying GPT-4o for', prompts.length, 'prompts…');
const answers = prompts.map((p) => ({ prompt: p, text: ask('GPT-4o', p) }));

const items = answers.map((a, i) => `[${i}] Q: ${a.prompt}\nA: ${a.text.slice(0, 700)}`).join('\n\n');
const judgePrompt =
  `Brand: "${brand}"\nCompetitors to track: ${competitors.join(', ')}\n\n` +
  `For each numbered AI answer below, judge how the BRAND appears:\n` +
  `- brandMentioned: true/false\n- prominence: 0 (absent),1 (passing),2 (one of several),3 (featured/top)\n` +
  `- sentiment: "positive"|"neutral"|"negative"|"none"\n- competitors: tracked competitor names appearing in THIS answer\n\n` +
  `Return ONLY a JSON array, one object per item: {"i":idx,"brandMentioned":bool,"prominence":int,"sentiment":str,"competitors":[str]}.\n\nANSWERS:\n${items}`;

console.log('Judging…\n');
const verdictRaw = ask('Claude-Sonnet-4.5', judgePrompt, 1800);
const verdicts = parseJsonFromLLM(verdictRaw);

let ok = Array.isArray(verdicts) && verdicts.length === answers.length;
for (const v of verdicts) {
  console.log(`[${v.i}] mentioned=${v.brandMentioned} prom=${v.prominence} sent=${v.sentiment} comp=[${(v.competitors || []).join(', ')}]`);
  console.log(`     Q: ${answers[v.i]?.prompt}`);
}
console.log(`\n${ok ? '✔ judge OK' : '✗ judge shape FAILED'} (got ${Array.isArray(verdicts) ? verdicts.length : 'non-array'} / ${answers.length})`);
process.exit(ok ? 0 : 2);
