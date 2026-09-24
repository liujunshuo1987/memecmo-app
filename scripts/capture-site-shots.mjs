#!/usr/bin/env node
// Screenshots for the memecmo.ai scroll narrative, taken on the ROOT-ORG
// NeuronSpark project (never a client project). Login via a one-time magic
// link passed in MAGIC_LINK. Output: memecmo-site/shots/*.webp (1440×900 @2x).
//   MAGIC_LINK="https://app.memecmo.ai/auth/confirm?token_hash=…&type=magiclink&next=/workspace/memecmo/neuronspark-hk" node scripts/capture-site-shots.mjs
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'https://app.memecmo.ai';
const OUT = '/Users/sx/Downloads/09_GEO企业出海/memecmo-site/shots/';
const LINK = process.env.MAGIC_LINK; if (!LINK) { console.error('MAGIC_LINK missing'); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(LINK, { waitUntil: 'networkidle2', timeout: 90000 });
await page.evaluate(() => { localStorage.setItem('memecmo-uilang', 'en'); });
await page.goto(`${BASE}/workspace/memecmo/neuronspark-hk`, { waitUntil: 'networkidle2', timeout: 90000 });
await sleep(3500);
const shot = async (name, opts = {}) => { await page.screenshot({ path: `${OUT}${name}.webp`, type: 'webp', quality: 84, ...opts }); console.log('✓', name); };
// Section titles wrap their text in a span that also holds the "?" tooltip, so
// match the SMALLEST element whose text matches, not a leaf; the stage is the
// scrolling element (main has its own overflow), so scroll it, not window.
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
// 1. workspace overview (top of the stage)
await shot('workspace');
// 2. monitor: scorecard KPI + trend
console.log('scroll monitor:', await scrollToText('Presence over time'));
await shot('monitor');
// 3. sources + what the engines cite
console.log('scroll sources:', await scrollToText('Sources AI cites'));
await shot('sources');
// 4. report
await page.evaluate(() => { const leaf = Array.from(document.querySelectorAll('aside *')).find((e) => e.children.length === 0 && /^Report$/i.test((e.textContent || '').trim())); const t = leaf && (leaf.closest('button,[role="button"],div[class*="cursor"]') || leaf); if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
await sleep(3500);
await shot('report');
await browser.close();
