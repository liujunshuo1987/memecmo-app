// End-to-end OAuth test for the connector: metadata → dynamic registration →
// consent (headless, one magic link) → code exchange with PKCE → MCP call →
// refresh rotation → revoke. Usage: node scripts/connector-oauth-e2e.mjs https://<host>   (mints ONE magic link; needs .env.local)
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import puppeteer from 'puppeteer-core';

const BASE = (process.argv[2] || '').replace(/\/+$/, '');
if (!BASE) { console.error('base url required'); process.exit(1); }
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));

// node's fetch cannot reach vercel hosts on this LAN (DNS/proxy quirk); curl can.
function curlFetch(url, opts = {}) {
  const args = ['-sS', '--max-time', '60', '-X', opts.method || 'GET', url, '-D', '-'];
  for (const [k, v] of Object.entries(opts.headers || {})) args.push('-H', `${k}: ${v}`);
  if (opts.body != null) args.push('--data-binary', String(opts.body));
  const r = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 50e6 });
  let rest = r.stdout || '', status = 0, headers = {};
  for (;;) {
    const mm = rest.match(/\r?\n\r?\n/); if (!mm) break;
    const idx = mm.index; const head = rest.slice(0, idx); const m = head.match(/^HTTP\/\S+\s+(\d+)/); if (!m) break;
    status = Number(m[1]); headers = {};
    for (const line of head.split(/\r?\n/).slice(1)) { const i = line.indexOf(':'); if (i > 0) headers[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim(); }
    rest = rest.slice(idx + mm[0].length);
    if (status !== 100 && !/connection established/i.test(head)) break; // skip the proxy's CONNECT reply and 100-continue
  }
  const text = rest;
  return Promise.resolve({ status, ok: status >= 200 && status < 300, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => text, json: async () => JSON.parse(text) });
}
const fetch = curlFetch;

const say = (k, v) => console.log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);

// 1. metadata
const as = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json();
say('AS metadata', { issuer: as.issuer, token: as.token_endpoint, reg: as.registration_endpoint, pkce: as.code_challenge_methods_supported });
const prm = await fetch(`${BASE}/.well-known/oauth-protected-resource/api/mcp`);
say('PRM (path-aware) status', prm.status); say('PRM', await prm.json());
const chal = await fetch(`${BASE}/api/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
say('401 WWW-Authenticate', chal.headers.get('www-authenticate'));

// 2. dynamic registration (public client, loopback redirect)
const REDIRECT = 'http://127.0.0.1:9/cb';
const regRes = await fetch(`${BASE}/api/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'e2e test client', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'] }) });
const reg = await regRes.json();
say('register status', regRes.status); say('client_id prefix', String(reg.client_id).slice(0, 8));

// 3. PKCE + authorize URL
const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomBytes(8).toString('hex');
const authUrl = `${BASE}/oauth/authorize?` + new URLSearchParams({ client_id: reg.client_id, redirect_uri: REDIRECT, response_type: 'code', scope: 'read write', state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();

// 4. one magic link for the founder, on this host
let link = null;
for (let i = 0; i < 5 && !link; i++) {
  const r = spawnSync('curl', ['-sS', '--max-time', '40', '-X', 'POST', `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, '-H', `apikey: ${env.SUPABASE_SERVICE_ROLE_KEY}`, '-H', `Authorization: Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, '-H', 'Content-Type: application/json', '-d', JSON.stringify({ type: 'magiclink', email: 'liujunshuo1987@gmail.com' })], { encoding: 'utf8' });
  try { const j = JSON.parse(r.stdout || '{}'); if (j.hashed_token) link = `${BASE}/auth/confirm?token_hash=${j.hashed_token}&type=magiclink&next=${encodeURIComponent('/dashboard')}`; } catch {}
  if (!link) await new Promise((res) => setTimeout(res, 3000));
}
if (!link) { console.error('could not mint link'); process.exit(1); }

// 5. consent in a headless browser; catch the loopback redirect without connecting to it
const proxy = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.ALL_PROXY || '';
// vercel.app hosts resolve only through the proxy on this LAN (curl uses it via env); give Chrome the same proxy.
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', ...(proxy ? [`--proxy-server=${proxy.replace(/\/+$/, '')}`] : [])] });
const page = await browser.newPage();
await page.goto(link, { waitUntil: 'networkidle2', timeout: 90000 });
say('signed in at', page.url());
let callback = null;
await page.setRequestInterception(true);
page.on('request', (r) => { if (r.url().startsWith(REDIRECT)) { callback = r.url(); r.abort(); } else r.continue(); });
await page.goto(authUrl, { waitUntil: 'networkidle2', timeout: 90000 });
const title = await page.evaluate(() => document.querySelector('h1')?.textContent || '');
say('consent page h1', title);
const orgs = await page.evaluate(() => Array.from(document.querySelectorAll('input[name=organization_id]')).map((i) => i.nextElementSibling?.textContent?.trim().slice(0, 40)));
say('orgs offered', orgs);
await Promise.all([
  page.waitForFunction(() => false, { timeout: 15000 }).catch(() => {}),
  page.click('button[value=allow]'),
]);
await browser.close();
if (!callback) { console.error('no callback captured'); process.exit(1); }
const cb = new URL(callback);
say('callback has code', !!cb.searchParams.get('code')); say('state echoed', cb.searchParams.get('state') === state);

// 6. exchange
const tokRes = await fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: reg.client_id, code: cb.searchParams.get('code'), redirect_uri: REDIRECT, code_verifier: verifier }) });
const tok = await tokRes.json();
say('token status', tokRes.status); say('token', { type: tok.token_type, expires_in: tok.expires_in, scope: tok.scope, access: String(tok.access_token || '').slice(0, 6), refresh: String(tok.refresh_token || '').slice(0, 6) });
const again = await fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: reg.client_id, code: cb.searchParams.get('code'), redirect_uri: REDIRECT, code_verifier: verifier }) });
say('code reuse rejected', (await again.json()).error);

// 7. MCP call with the access token
const mcp = async (token, body) => { const r = await fetch(`${BASE}/api/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(body) }); const t = await r.text(); const line = t.split('\n').find((l) => l.startsWith('data:')); return { status: r.status, json: JSON.parse(line ? line.slice(5) : t) }; };
const lp = await mcp(tok.access_token, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_projects', arguments: {} } });
const txt = lp.json?.result?.content?.[0]?.text || '';
say('list_projects via OAuth', { status: lp.status, organization: JSON.parse(txt || '{}').organization, projects: (JSON.parse(txt || '{}').projects || []).length });

// 8. refresh rotation
const ref = await (await fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: reg.client_id, refresh_token: tok.refresh_token }) })).json();
say('refresh ok', !!ref.access_token && ref.refresh_token !== tok.refresh_token);
const oldRef = await (await fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: reg.client_id, refresh_token: tok.refresh_token }) })).json();
say('old refresh rejected', oldRef.error);
const oldAccess = await mcp(tok.access_token, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
say('old access token after rotation', oldAccess.status);

// 9. revoke
await fetch(`${BASE}/api/oauth/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: reg.client_id, token: ref.access_token }) });
const afterRevoke = await fetch(`${BASE}/api/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${ref.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{"jsonrpc":"2.0","id":3,"method":"tools/list","params":{}}' });
say('after revoke', afterRevoke.status);
console.log('done');
