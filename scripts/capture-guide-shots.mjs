#!/usr/bin/env node
// Capture real UI screenshots for /guide against production, using the
// ephemeral demo viewer. Chinese UI + night theme (the brand look).
// Output: public/guide/*.png

import { readFileSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'https://app.memecmo.ai';
// decodeURIComponent — the repo path contains CJK characters; URL.pathname is
// percent-encoded and would silently create a stray escaped-name directory.
const OUT = decodeURIComponent(new URL('../public/guide/', import.meta.url).pathname);
const { email, password } = JSON.parse(readFileSync('/tmp/demo-cred.json', 'utf8'));

mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });

// ── login ────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.type('input[type="email"]', email, { delay: 10 });
await page.type('input[type="password"]', password, { delay: 10 });
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
  page.click('button[type="submit"]'),
]);
console.log('logged in →', page.url());

// UI language zh + night theme, then reload so chrome picks them up.
await page.evaluate(() => {
  localStorage.setItem('memecmo-uilang', 'zh');
  localStorage.setItem('memecmo-theme', 'night');
});

// ── 1. dashboard ─────────────────────────────────────────────────────────────
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(1200);
await page.screenshot({ path: `${OUT}dashboard.png` });
console.log('✓ dashboard.png');

// ── workspace ────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/workspace/fmvn/vietnam-2026`, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(2000);

// Click a left-rail deliverable, then WAIT until the stage shows the rendered
// result (not the transient loading state) — up to 20s.
async function openDeliverable(patterns, readyPattern) {
  const ok = await page.evaluate((pats) => {
    const res = new RegExp(pats.join('|'), 'i');
    const btns = Array.from(document.querySelectorAll('aside button'));
    const hit = btns.find((b) => res.test(b.textContent || ''));
    if (hit) { hit.click(); return (hit.textContent || '').trim().slice(0, 30); }
    return null;
  }, patterns);
  try {
    await page.waitForFunction(
      (rp) => {
        const txt = document.querySelector('main')?.innerText || '';
        return !/starting…|loading/i.test(txt.slice(0, 400)) && new RegExp(rp, 'i').test(txt);
      },
      { timeout: 20000, polling: 500 },
      readyPattern,
    );
  } catch { /* screenshot whatever state we reached */ }
  await sleep(1200); // charts/animations settle
  return ok;
}

// 2. Monitor scorecard (the AIGVR view) — full 3-zone shot
let hit = await openDeliverable(['监测', 'Monitor'], 'Presence|存在|competitiveShare|竞争');
console.log('opened:', hit);
await page.screenshot({ path: `${OUT}workspace-monitor.png` });
console.log('✓ workspace-monitor.png');

// 3. Scorecard detail — scroll the stage to the five-dimension block
await page.evaluate(() => {
  const main = document.querySelector('main');
  if (main) main.scrollBy(0, 1200);
});
await sleep(800);
await page.screenshot({ path: `${OUT}scorecard-detail.png` });
console.log('✓ scorecard-detail.png');

// 4. Standard answers (bilingual library)
hit = await openDeliverable(['标准答案', 'Answers'], 'VIETNAMESE|ENGLISH|标准答案库');
console.log('opened:', hit);
await page.evaluate(() => {
  // open the first two answers so the shot shows bilingual content
  document.querySelectorAll('main details').forEach((d, i) => { if (i < 2) d.open = true; });
});
await sleep(600);
await page.screenshot({ path: `${OUT}answers.png` });
console.log('✓ answers.png');

// 5. Content sandbox (refine dialogue)
hit = await openDeliverable(['内容', 'Optimize'], 'sandbox|STRUCTURED|targets');
console.log('opened:', hit);
await page.screenshot({ path: `${OUT}sandbox.png` });
console.log('✓ sandbox.png');

await browser.close();
console.log('done');
