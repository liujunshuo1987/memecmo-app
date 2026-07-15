'use client';

// Workspace dashboard: orgs the user belongs to, their projects, and a
// "New project" flow. Each project links into its agent workspace.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Organization, Project } from '@/lib/workspace';

interface Group {
  org: Organization;
  role: string | null;
  projects: Project[];
}
interface Billing {
  planId: string;
  planName: string;
  quota: number;
  used: number;
  status: string;
  hasStripeSub: boolean;
}
interface PlanRow {
  id: string;
  name: string;
  price_usd_month: number | null;
  monthly_scan_quota: number;
  max_projects: number;
  stripe_price_id: string | null;
}
interface Props {
  groups: Group[];
  userEmail: string;
  isRootAdmin: boolean;
  billing: Record<string, Billing>;
  plansCatalog: PlanRow[];
  stripeReady: boolean;
}

const COUNTRIES = [
  { name: 'Vietnam', lang: 'vi', flag: '🇻🇳' },
  { name: 'Thailand', lang: 'th', flag: '🇹🇭' },
  { name: 'Philippines', lang: 'fil', flag: '🇵🇭' },
  { name: 'Malaysia', lang: 'ms', flag: '🇲🇾' },
  { name: 'Indonesia', lang: 'id', flag: '🇮🇩' },
  { name: 'Singapore', lang: 'en', flag: '🇸🇬' },
];
const FLAG: Record<string, string> = Object.fromEntries(COUNTRIES.map((c) => [c.name, c.flag]));

const ORG_TYPE_LABEL: Record<string, string> = {
  root: 'Root',
  channel_partner: 'Channel Partner',
  end_client: 'End Client',
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export default function DashboardClient({ groups, userEmail, isRootAdmin, billing, plansCatalog, stripeReady }: Props) {
  const router = useRouter();
  const [modalOrg, setModalOrg] = useState<Organization | null>(null);
  const [newClientFor, setNewClientFor] = useState<Organization | null>(null);
  const [inviteOrg, setInviteOrg] = useState<Organization | null>(null);
  const [billingOrg, setBillingOrg] = useState<Organization | null>(null);
  const [busyApprove, setBusyApprove] = useState<string | null>(null);

  const signOut = async () => {
    await createClient().auth.signOut();
    router.push('/login');
  };

  // Pending-approval orgs the caller can see (root admin → the approval queue).
  const pending = groups.map((g) => g.org).filter((o) => o.status === 'pending_approval');

  const decide = async (orgId: string, action: 'approve' | 'reject') => {
    setBusyApprove(orgId);
    try {
      await fetch('/api/workspace/orgs/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, action }),
      });
      router.refresh();
    } finally { setBusyApprove(null); }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-edge px-6 py-3 flex items-center justify-between sticky top-0 bg-canvas/95 backdrop-blur z-10">
        <a href="https://memecmo.ai" className="text-xs tracking-[0.2em] text-dim uppercase hover:text-ink">
          MemeCMO.ai
        </a>
        <div className="flex items-center gap-3 text-xs text-dim">
          <a href="/guide" className="px-2 py-1 rounded border border-edge hover:border-edge-strong hover:text-ink transition">
            使用说明 Guide
          </a>
          <span className="hidden sm:inline">{userEmail}</span>
          <button onClick={signOut} className="px-2 py-1 rounded border border-edge hover:border-edge-strong hover:text-ink transition">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold mb-1">Your GEO workspaces</h1>
        <p className="text-sm text-faint mb-8">
          Each project is one brand × one market. Open a project to run Discovery, Monitor and Report.
        </p>

        {groups.length === 0 && (
          <div className="text-sm text-faint border border-edge rounded-lg p-6">
            You&apos;re not a member of any organization yet. Contact your administrator.
          </div>
        )}

        {isRootAdmin && pending.length > 0 && (
          <div className="mb-8 rounded-lg border border-gold/40 bg-gold/10 p-4">
            <div className="text-[11px] uppercase tracking-widest text-gold mb-2">Pending approval · {pending.length}</div>
            <div className="space-y-2">
              {pending.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3">
                  <div className="text-sm text-ink">{o.name} <span className="text-[11px] text-faint">· {ORG_TYPE_LABEL[o.type] ?? o.type}</span></div>
                  <div className="flex gap-2">
                    <button disabled={busyApprove === o.id} onClick={() => decide(o.id, 'approve')} className="text-xs px-3 py-1 rounded-md bg-brand text-on-brand hover:brightness-110 disabled:opacity-50 transition">Approve</button>
                    <button disabled={busyApprove === o.id} onClick={() => decide(o.id, 'reject')} className="text-xs px-3 py-1 rounded-md border border-edge text-dim hover:text-garnet transition">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-10">
          {groups.map(({ org, role, projects }) => {
            const active = org.status === 'active';
            const canAddClient = org.type === 'channel_partner' && role === 'admin';
            const canInvite = role === 'admin' && active;
            const bill = billing[org.id];
            return (
              <section key={org.id}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold">{org.name}</h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-raised border border-edge text-dim uppercase tracking-wider">
                      {ORG_TYPE_LABEL[org.type] ?? org.type}
                    </span>
                    {!active && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gold/15 text-gold uppercase tracking-wider">
                        {org.status}
                      </span>
                    )}
                    {bill && (
                      <button
                        onClick={() => (role === 'admin' || isRootAdmin) && setBillingOrg(org)}
                        title={`${bill.status} · resets monthly${role === 'admin' || isRootAdmin ? ' · click to manage plan' : ''}`}
                        className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider transition ${
                          bill.status !== 'trialing' && bill.status !== 'active'
                            ? 'border-garnet/50 text-garnet bg-garnet/10'
                            : bill.used >= bill.quota
                              ? 'border-gold/50 text-gold bg-gold/10'
                              : 'border-sage/40 text-sage bg-sage/10'
                        } ${role === 'admin' || isRootAdmin ? 'cursor-pointer hover:brightness-110' : 'cursor-default'}`}
                      >
                        {bill.planName} · {bill.used}/{bill.quota} scans{bill.status !== 'trialing' && bill.status !== 'active' ? ` · ${bill.status}` : ''}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {canInvite && (
                      <button
                        onClick={() => setInviteOrg(org)}
                        className="text-xs px-3 py-1.5 rounded-md border border-edge text-dim hover:text-ink hover:border-edge-strong transition"
                      >
                        Invite
                      </button>
                    )}
                    {canAddClient && (
                      <button
                        onClick={() => setNewClientFor(org)}
                        className="text-xs px-3 py-1.5 rounded-md border border-brand/50 text-brand hover:bg-brand-soft transition"
                      >
                        + New client
                      </button>
                    )}
                    {active && (
                      <button
                        onClick={() => setModalOrg(org)}
                        className="text-xs px-3 py-1.5 rounded-md bg-brand text-on-brand hover:brightness-110 transition"
                      >
                        + New project
                      </button>
                    )}
                  </div>
                </div>

                {projects.length === 0 ? (
                  <div className="text-xs text-faint italic border border-edge rounded-lg p-4">
                    No projects yet{active ? ' — create one to get started.' : '.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {projects.map((p) => (
                      <a
                        key={p.id}
                        href={`/workspace/${org.slug}/${p.slug}`}
                        className="group rounded-lg border border-edge bg-surface p-4 hover:border-brand/50 hover:bg-raised transition"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg leading-none">{FLAG[p.target_country] || '🌐'}</span>
                          <span className="text-sm font-medium truncate group-hover:text-ink">{p.brand_name}</span>
                        </div>
                        <div className="text-[11px] text-faint">
                          {p.target_country} · {p.target_language || 'auto'}
                        </div>
                        {p.industry && <div className="text-[11px] text-faint truncate mt-1">{p.industry}</div>}
                      </a>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>

      {modalOrg && (
        <NewProjectModal
          org={modalOrg}
          onClose={() => setModalOrg(null)}
          onCreated={(orgSlug, projectSlug) => router.push(`/workspace/${orgSlug}/${projectSlug}`)}
        />
      )}
      {newClientFor && (
        <NewClientModal
          parent={newClientFor}
          onClose={() => setNewClientFor(null)}
          onCreated={() => { setNewClientFor(null); router.refresh(); }}
        />
      )}
      {inviteOrg && <InviteModal org={inviteOrg} onClose={() => setInviteOrg(null)} />}
      {billingOrg && (
        <BillingModal
          org={billingOrg}
          bill={billing[billingOrg.id]}
          plans={plansCatalog}
          stripeReady={stripeReady}
          onClose={() => setBillingOrg(null)}
        />
      )}
    </div>
  );
}

function BillingModal({ org, bill, plans, stripeReady, onClose }: {
  org: Organization;
  bill?: Billing;
  plans: PlanRow[];
  stripeReady: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkout = async (planId: string) => {
    setBusy(planId); setError(null);
    try {
      const res = await fetch('/api/workspace/billing/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: org.id, planId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || data.error || 'Checkout failed'); setBusy(null); return; }
      window.location.href = data.url;
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(null); }
  };

  const portal = async () => {
    setBusy('portal'); setError(null);
    try {
      const res = await fetch('/api/workspace/billing/portal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: org.id }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || data.error || 'Portal unavailable'); setBusy(null); return; }
      window.location.href = data.url;
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl border border-edge bg-surface p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-sm font-semibold text-ink">套餐与账单 · Plan &amp; billing</h3>
          <p className="text-xs text-faint">{org.name} · 当前 {bill?.planName ?? '—'}({bill?.status ?? '—'})· 本期已用 {bill?.used ?? 0}/{bill?.quota ?? 0} 次扫描</p>
        </div>

        {!stripeReady && (
          <div className="text-xs text-gold bg-gold/10 border border-gold/40 rounded px-3 py-2">
            收款通道配置中 — Stripe 密钥尚未接入,套餐可浏览、暂不可支付。
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {plans.map((p) => {
            const current = bill?.planId === p.id;
            return (
              <div key={p.id} className={`rounded-lg border p-4 space-y-2 ${current ? 'border-brand/60 bg-brand-soft/40' : 'border-edge bg-canvas'}`}>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-ink">{p.name}</span>
                  {current && <span className="text-[9px] uppercase tracking-wider text-brand">当前</span>}
                </div>
                <div className="text-xl font-bold text-ink tabular-nums">
                  {p.price_usd_month != null ? `$${p.price_usd_month}` : '—'}
                  <span className="text-[10px] font-normal text-faint"> /月</span>
                </div>
                <ul className="text-[11px] text-dim space-y-0.5">
                  <li>{p.monthly_scan_quota} 次扫描 / 月</li>
                  <li>最多 {p.max_projects} 个项目</li>
                </ul>
                <button
                  disabled={!stripeReady || current || busy !== null}
                  onClick={() => checkout(p.id)}
                  className="w-full text-xs px-3 py-1.5 rounded-md bg-brand text-on-brand hover:brightness-110 disabled:bg-raised disabled:text-faint transition"
                >
                  {busy === p.id ? '跳转中…' : current ? '使用中' : '订阅 Subscribe'}
                </button>
              </div>
            );
          })}
        </div>

        {error && <div className="text-xs text-garnet bg-garnet/10 border border-garnet/40 rounded px-3 py-2">{error}</div>}

        <div className="flex items-center justify-between pt-1">
          {bill?.hasStripeSub ? (
            <button onClick={portal} disabled={busy !== null} className="text-xs px-3 py-1.5 rounded-md border border-edge text-dim hover:text-ink transition disabled:opacity-50">
              {busy === 'portal' ? '跳转中…' : '管理订阅 / 发票 →'}
            </button>
          ) : <span className="text-[11px] text-faint">订阅后可在此管理付款方式与发票</span>}
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-md border border-edge text-dim hover:text-ink transition">关闭</button>
        </div>
      </div>
    </div>
  );
}

function InviteModal({ org, onClose }: { org: Organization; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'editor' | 'viewer'>('viewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    if (!email.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/workspace/invites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: org.id, email: email.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create invite'); setBusy(false); return; }
      setLink(data.acceptUrl);
      setEmailSent(!!data.emailSent);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-edge bg-surface p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-sm font-semibold text-ink">Invite a member</h3>
          <p className="text-xs text-faint">to {org.name} · they sign in with this email to join</p>
        </div>

        {!link ? (
          <>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-faint mb-1 block">Email *</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@company.com" autoFocus type="email"
                className="w-full bg-raised border border-edge rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand/50" />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-faint mb-1 block">Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'editor' | 'viewer')}
                className="w-full bg-raised border border-edge rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand/50">
                <option value="viewer">Viewer — read reports</option>
                <option value="editor">Editor — run agents</option>
                <option value="admin">Admin — manage org</option>
              </select>
            </label>
            {error && <div className="text-xs text-garnet bg-garnet/10 border border-garnet/40 rounded px-3 py-2">{error}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="text-sm px-3 py-2 rounded-md border border-edge text-dim hover:text-ink transition">Cancel</button>
              <button onClick={submit} disabled={busy || !email.trim()} className="text-sm px-4 py-2 rounded-md bg-brand text-on-brand hover:brightness-110 disabled:bg-raised disabled:text-faint transition">
                {busy ? 'Creating…' : 'Create invite'}
              </button>
            </div>
          </>
        ) : (
          <>
            {emailSent ? (
              <div className="text-xs text-sage bg-sage/10 border border-sage/40 rounded px-3 py-2">
                ✉️ Invitation emailed to <span className="font-medium">{email}</span>. The link below works too — it expires in 14 days.
              </div>
            ) : (
              <div className="text-xs text-gold bg-gold/10 border border-gold/40 rounded px-3 py-2">
                Email could not be auto-sent (sender domain pending verification) — copy the link below and send it to <span className="font-medium">{email}</span> yourself. It expires in 14 days.
              </div>
            )}
            <div className="flex items-center gap-2">
              <input readOnly value={link} className="flex-1 bg-raised border border-edge rounded-md px-3 py-2 text-xs text-dim" />
              <button onClick={copy} className="text-xs px-3 py-2 rounded-md bg-brand text-on-brand hover:brightness-110 transition whitespace-nowrap">
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="flex justify-end pt-1">
              <button onClick={onClose} className="text-sm px-3 py-2 rounded-md border border-edge text-dim hover:text-ink transition">Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NewClientModal({ parent, onClose, onCreated }: { parent: Organization; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/workspace/orgs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentOrgSlug: parent.slug, name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create client'); setBusy(false); return; }
      onCreated();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-edge bg-surface p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-sm font-semibold text-ink">New client organization</h3>
          <p className="text-xs text-faint">under {parent.name} · needs MemeCMO approval before it goes live</p>
        </div>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-faint mb-1 block">Client / brand company name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Vietnam Co." autoFocus
            className="w-full bg-raised border border-edge rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand/50" />
        </label>
        {error && <div className="text-xs text-garnet bg-garnet/10 border border-garnet/40 rounded px-3 py-2">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-md border border-edge text-dim hover:text-ink transition">Cancel</button>
          <button onClick={submit} disabled={busy || !name.trim()} className="text-sm px-4 py-2 rounded-md bg-brand text-on-brand hover:brightness-110 disabled:bg-raised disabled:text-faint transition">
            {busy ? 'Creating…' : 'Create (pending approval)'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewProjectModal({
  org,
  onClose,
  onCreated,
}: {
  org: Organization;
  onClose: () => void;
  onCreated: (orgSlug: string, projectSlug: string) => void;
}) {
  const [brandName, setBrandName] = useState('');
  const [brandUrl, setBrandUrl] = useState('');
  const [country, setCountry] = useState('Vietnam');
  const [industry, setIndustry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!brandName.trim() || busy) return;
    setBusy(true);
    setError(null);
    const lang = COUNTRIES.find((c) => c.name === country)?.lang ?? 'en';
    try {
      const res = await fetch('/api/workspace/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationSlug: org.slug,
          slug: slugify(brandName) || `project-${Date.now()}`,
          brandName: brandName.trim(),
          brandUrl: brandUrl.trim() || undefined,
          targetCountry: country,
          targetLanguage: lang,
          industry: industry.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create project');
        setBusy(false);
        return;
      }
      onCreated(org.slug, data.project.slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-edge bg-surface p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-sm font-semibold">New project</h3>
          <p className="text-xs text-faint">in {org.name} · one brand × one market</p>
        </div>

        <div className="space-y-3">
          <Field label="Brand name *">
            <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. Acme Coffee"
              className="w-full bg-surface border border-edge rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-400/50" />
          </Field>
          <Field label="Website (optional)">
            <input value={brandUrl} onChange={(e) => setBrandUrl(e.target.value)} placeholder="https://…"
              className="w-full bg-surface border border-edge rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-400/50" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Market">
              <select value={country} onChange={(e) => setCountry(e.target.value)}
                className="w-full bg-surface border border-edge rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-400/50">
                {COUNTRIES.map((c) => (
                  <option key={c.name} value={c.name} className="bg-surface">{c.flag} {c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Industry (optional)">
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. F&B"
                className="w-full bg-surface border border-edge rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-400/50" />
            </Field>
          </div>
        </div>

        {error && <div className="text-xs text-garnet bg-garnet/10 border border-red-500/30 rounded px-3 py-2">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-md border border-edge text-dim hover:text-ink transition">
            Cancel
          </button>
          <button onClick={submit} disabled={busy || !brandName.trim()}
            className="text-sm px-4 py-2 rounded-md bg-brand text-on-brand hover:brightness-110 disabled:bg-raised disabled:text-faint transition">
            {busy ? 'Creating…' : 'Create & open'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-faint mb-1 block">{label}</span>
      {children}
    </label>
  );
}
