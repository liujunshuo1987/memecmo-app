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
  projects: Project[];
}
interface Props {
  groups: Group[];
  userEmail: string;
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

export default function DashboardClient({ groups, userEmail }: Props) {
  const router = useRouter();
  const [modalOrg, setModalOrg] = useState<Organization | null>(null);

  const signOut = async () => {
    await createClient().auth.signOut();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-[#0a1628] text-white">
      <header className="border-b border-white/5 px-6 py-3 flex items-center justify-between sticky top-0 bg-[#0a1628]/95 backdrop-blur z-10">
        <a href="/" className="text-xs tracking-[0.2em] text-gray-400 uppercase hover:text-white">
          MemeCMO.ai
        </a>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="hidden sm:inline">{userEmail}</span>
          <button onClick={signOut} className="px-2 py-1 rounded border border-white/10 hover:border-white/30 hover:text-white transition">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold mb-1">Your GEO workspaces</h1>
        <p className="text-sm text-gray-500 mb-8">
          Each project is one brand × one market. Open a project to run Discovery, Monitor and Report.
        </p>

        {groups.length === 0 && (
          <div className="text-sm text-gray-500 border border-white/10 rounded-lg p-6">
            You&apos;re not a member of any organization yet. Contact your administrator.
          </div>
        )}

        <div className="space-y-10">
          {groups.map(({ org, projects }) => {
            const active = org.status === 'active';
            return (
              <section key={org.id}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">{org.name}</h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-400 uppercase tracking-wider">
                      {ORG_TYPE_LABEL[org.type] ?? org.type}
                    </span>
                    {!active && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-300 uppercase tracking-wider">
                        {org.status}
                      </span>
                    )}
                  </div>
                  {active && (
                    <button
                      onClick={() => setModalOrg(org)}
                      className="text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 transition"
                    >
                      + New project
                    </button>
                  )}
                </div>

                {projects.length === 0 ? (
                  <div className="text-xs text-gray-600 italic border border-white/5 rounded-lg p-4">
                    No projects yet{active ? ' — create one to get started.' : '.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {projects.map((p) => (
                      <a
                        key={p.id}
                        href={`/workspace/${org.slug}/${p.slug}`}
                        className="group rounded-lg border border-white/10 bg-white/[0.02] p-4 hover:border-blue-400/40 hover:bg-white/[0.04] transition"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg leading-none">{FLAG[p.target_country] || '🌐'}</span>
                          <span className="text-sm font-medium truncate group-hover:text-white">{p.brand_name}</span>
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {p.target_country} · {p.target_language || 'auto'}
                        </div>
                        {p.industry && <div className="text-[11px] text-gray-600 truncate mt-1">{p.industry}</div>}
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
        className="w-full max-w-md rounded-xl border border-white/10 bg-[#0c1a30] p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-sm font-semibold">New project</h3>
          <p className="text-xs text-gray-500">in {org.name} · one brand × one market</p>
        </div>

        <div className="space-y-3">
          <Field label="Brand name *">
            <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. Acme Coffee"
              className="w-full bg-white/[0.03] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-400/50" />
          </Field>
          <Field label="Website (optional)">
            <input value={brandUrl} onChange={(e) => setBrandUrl(e.target.value)} placeholder="https://…"
              className="w-full bg-white/[0.03] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-400/50" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Market">
              <select value={country} onChange={(e) => setCountry(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-400/50">
                {COUNTRIES.map((c) => (
                  <option key={c.name} value={c.name} className="bg-[#0c1a30]">{c.flag} {c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Industry (optional)">
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. F&B"
                className="w-full bg-white/[0.03] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-400/50" />
            </Field>
          </div>
        </div>

        {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-md border border-white/10 text-gray-400 hover:text-white transition">
            Cancel
          </button>
          <button onClick={submit} disabled={busy || !brandName.trim()}
            className="text-sm px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 transition">
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
      <span className="text-[11px] uppercase tracking-wider text-gray-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}
