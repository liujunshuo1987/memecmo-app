#!/usr/bin/env node
// Screenshots for /guide, taken on the ROOT-ORG NeuronSpark project — never a
// client project, and the dashboard is cropped to the root org only so no
// client name can leak into a public page. Login via a one-time magic link
// (MAGIC_LINK) — passwords are never typed. Chinese UI (the guide's default).
//   MAGIC_LINK="https://app.memecmo.ai/auth/confirm?token_hash=…&type=magiclink&next=/dashboard" node scripts/capture-guide-shots.mjs
// Output: public/guide/*.png (1440×900 @1.5x)

import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'https://app.memecmo.ai';
const PROJECT = '/workspace/memecmo/neuronspark-hk';
const ROOT_ORG_NAME = 'MemeCMO.ai';
const OUT = decodeURIComponent(new URL('../public/guide/', import.meta.url).pathname);
const LINK = process.env.MAGIC_LINK; if (!LINK) { console.error('MAGIC_LINK missing'); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars', '--no-proxy-server'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
await page.goto(LINK, { waitUntil: 'networkidle2', timeout: 90000 });
console.log('signed in →', page.url());
await page.evaluate(() => { localStorage.setItem('memecmo-uilang', 'zh'); });

const shot = async (name) => { await page.screenshot({ path: `${OUT}${name}.png` }); console.log('✓', name); };

// Smallest element whose text matches; scroll <main> (the stage scrolls, not the window).
const scrollToText = async (re) => {
  const ok = await page.evaluate((src) => {
    const r = new RegExp(src, 'i');
    const cands = Array.from(document.querySelectorAll('main *')).filter((e) => e.childElementCount <= 3 && r.test((e.textContent || '').trim()));
    if (!cands.length) return false;
    const el = cands.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0];
    const m = document.querySelector('main');
    const top = el.getBoundingClientRect().top;
    if (m && m.scrollHeight > m.clientHeight + 10) m.scrollTop = m.scrollTop + top - 96; else window.scrollBy(0, top - 96);
    return true;
  }, re);
  await sleep(1200); return ok;
};
const clickText = async (scope, re) => {
  const ok = await page.evaluate((sc, src) => {
    const r = new RegExp(src, 'i');
    const leaf = Array.from(document.querySelectorAll(`${sc} *`)).find((e) => e.children.length === 0 && r.test((e.textContent || '').trim()));
    if (!leaf) return null;
    const t = leaf.closest('button,[role="button"],a,div[class*="cursor"]') || leaf;
    t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return (leaf.textContent || '').trim().slice(0, 40);
  }, scope, re);
  await sleep(2500); return ok;
};

// ── 1. dashboard: keep ONLY the root org section ────────────────────────────
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2', timeout: 90000 });
await sleep(1500);
const kept = await page.evaluate((rootName) => {
  const secs = Array.from(document.querySelectorAll('main section'));
  let kept = 0;
  for (const s of secs) {
    const h = s.querySelector('h2');
    if (h && (h.textContent || '').trim() === rootName) kept++; else s.remove();
  }
  // pending-approval band and any org names outside sections
  document.querySelectorAll('main .bg-gold\\/10').forEach((e) => e.remove());
  // Inside the root org, keep ONLY our own brands (root project, MemeCMO,
  // the public demo brand) — client pilots hosted under root must not appear.
  const ALLOW = ['NeuronSpark', 'MemeCMO', 'Highlands Coffee'];
  document.querySelectorAll('main section .mc-card-soft.mc-enter').forEach((card) => {
    const txt = card.textContent || '';
    if (!ALLOW.some((a) => txt.includes(a))) card.remove();
  });
  return kept;
}, ROOT_ORG_NAME);
// Mask the signed-in account email in the header (public doc page).
await page.evaluate(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) if (/@/.test(n.nodeValue || '')) n.nodeValue = n.nodeValue.replace(/[\w.+-]+@[\w.-]+\.\w+/g, 'you@company.com');
});
const cards = await page.evaluate(() => document.querySelectorAll('main section .mc-card-soft.mc-enter').length);
console.log('dashboard cards kept:', cards);
if (cards < 1 || cards > 3) { console.error('unexpected card count'); await browser.close(); process.exit(2); }
console.log('dashboard sections kept:', kept);
if (kept !== 1) { console.error('refusing to shoot a dashboard that is not exactly the root org'); await browser.close(); process.exit(2); }
await sleep(500);
await shot('dashboard');

// ── 2. workspace overview (monitor result on the stage) ─────────────────────
await page.goto(`${BASE}${PROJECT}`, { waitUntil: 'networkidle2', timeout: 90000 });
await sleep(3500);
console.log('open monitor:', await clickText('aside', '^(监测|Monitor)$'));
await page.waitForFunction(() => /出现率走势|Presence over time/.test(document.querySelector('main')?.innerText || ''), { timeout: 30000, polling: 500 }).catch(() => {});
await sleep(1500);
await shot('workspace');

// ── 3. monitor: trend + brand visibility + share of voice ───────────────────
console.log('scroll trend:', await scrollToText('出现率走势|Presence over time'));
await shot('monitor');

// ── 4. sources AI cites + citation profile ──────────────────────────────────
console.log('scroll sources:', await scrollToText('AI 引用的来源|Sources AI cites'));
await shot('sources');

// ── 5. presence by question grid ────────────────────────────────────────────
console.log('scroll prompts:', await scrollToText('各提问出现率|Presence by question'));
await shot('prompts');

// ── 6. report (collapsed findings + site coverage) ──────────────────────────
console.log('open report:', await clickText('aside', '^(报告|Report)$'));
await page.waitForFunction(() => /关键发现|Key findings/.test(document.querySelector('main')?.innerText || ''), { timeout: 30000, polling: 500 }).catch(() => {});
await sleep(1500);
await shot('report');

// ── 7. content sandbox (optimize) ───────────────────────────────────────────
console.log('open optimize:', await clickText('aside', '^(内容|Optimize)$'));
await sleep(3000);
await shot('sandbox');

// ── 8. competitor & prompt sets editor ──────────────────────────────────────
console.log('open sets:', await clickText('body', '^(竞对与提示词|Sets)$'));
await page.waitForFunction(() => /竞对集|Competitor set/.test(document.body.innerText || ''), { timeout: 20000, polling: 500 }).catch(() => {});
await sleep(1200);
await shot('sets');

await browser.close();
console.log('done');
