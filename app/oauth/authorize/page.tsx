// OAuth consent page for the MemeCMO Connector.
//
// Validates the client and redirect_uri BEFORE anything is shown (errors are
// rendered, never redirected to an untrusted URI), requires a signed-in user,
// and lets them pick which organization the token may see. The decision is
// posted to /api/oauth/authorize, which re-validates and issues the code.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listMyOrgs } from '@/lib/workspace';
import { validateAuthorizeRequest, OAuthError, SCOPE_TEXT, type AuthorizeRequest } from '@/lib/oauth/server';

export const metadata: Metadata = { title: '授权 · MemeCMO Connector', robots: { index: false } };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

function toQuery(sp: SP): URLSearchParams {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) { const s = Array.isArray(v) ? v[0] : v; if (typeof s === 'string') q.set(k, s); }
  return q;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-ink flex items-start justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-5">
        <div className="text-xs tracking-[0.2em] text-dim uppercase">MemeCMO.ai · Connector</div>
        {children}
      </div>
    </div>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: SP }) {
  const q = toQuery(searchParams);
  let authz: AuthorizeRequest;
  try {
    authz = await validateAuthorizeRequest(q);
  } catch (e) {
    const msg = e instanceof OAuthError ? `${e.code}: ${e.message}` : (e instanceof Error ? e.message : String(e));
    return (
      <Shell>
        <div className="mc-card p-6 space-y-2">
          <h1 className="text-base font-semibold">无法处理这个授权请求 · This authorization request is invalid</h1>
          <p className="text-[12px] text-garnet break-all">{msg}</p>
          <p className="text-[12px] text-faint">客户端需要先注册(动态注册)或使用带元数据文档的 https client_id;redirect_uri 必须与注册的一致。</p>
        </div>
      </Shell>
    );
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(`/oauth/authorize?${q.toString()}`)}`);

  const orgs = (await listMyOrgs()).filter((o) => o.status === 'active');
  const { data: mems } = await supabase.from('organization_members').select('organization_id, role').eq('user_id', user.id);
  const role = new Map((mems ?? []).map((m) => [m.organization_id, m.role as string]));
  const isRootAdmin = orgs.some((o) => o.type === 'root' && role.get(o.id) === 'admin');
  const canWrite = (o: typeof orgs[number]) => isRootAdmin || ['admin', 'editor'].includes(role.get(o.id) ?? '') || (o.parent_org_id ? role.get(o.parent_org_id) === 'admin' : false);
  const client = authz.client;
  const clientHost = (() => { try { return new URL(client.client_uri || authz.redirectUri).host; } catch { return ''; } })();
  const wantsWrite = authz.scopes.includes('write');

  return (
    <Shell>
      <form method="post" action="/api/oauth/authorize" className="mc-card p-6 space-y-5">
        {(['client_id', 'redirect_uri', 'response_type', 'scope', 'state', 'code_challenge', 'code_challenge_method', 'resource'] as const).map((k) => (
          q.get(k) ? <input key={k} type="hidden" name={k} value={q.get(k)!} /> : null
        ))}
        <div className="space-y-1">
          <h1 className="text-base font-semibold">{client.client_name || clientHost || '一个应用'} 请求访问你的 MemeCMO 数据</h1>
          <p className="text-[12px] text-faint">{clientHost && <span>{clientHost} · </span>}<span>{user.email}</span></p>
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-faint">它将可以 · It will be able to</div>
          <ul className="text-[13px] text-dim space-y-1">
            {authz.scopes.map((s) => (
              <li key={s} className="flex gap-2"><span className="text-sage">✓</span><span>{SCOPE_TEXT[s]?.zh ?? s}<span className="block text-[11px] text-faint">{SCOPE_TEXT[s]?.en}</span></span></li>
            ))}
            <li className="flex gap-2 text-faint"><span>–</span><span>不能修改任何测量结果,不能发布内容,不能看到其他组织。<span className="block text-[11px]">It cannot change scores, publish anything, or see other organizations.</span></span></li>
          </ul>
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-faint">授权哪个组织的数据 · Which organization</div>
          {orgs.length === 0 ? (
            <p className="text-[12px] text-garnet">你的账号还没有加入任何组织。</p>
          ) : (
            <div className="space-y-1">
              {orgs.map((o, i) => (
                <label key={o.id} className="flex items-start gap-2 text-[13px] rounded-lg px-3 py-2 mc-chip-inset cursor-pointer">
                  <input type="radio" name="organization_id" value={o.id} defaultChecked={i === 0} className="mt-1" />
                  <span>
                    <span className="text-ink">{o.name}</span>
                    <span className="block text-[11px] text-faint">
                      {role.get(o.id) ?? (isRootAdmin ? 'operator' : 'via parent')}{wantsWrite && !canWrite(o) ? ' · 只读(登记行动需要 editor 或 admin)' : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button type="submit" name="decision" value="deny" className="text-sm px-4 py-2 rounded-md border border-edge text-dim hover:text-ink transition">拒绝</button>
          <button type="submit" name="decision" value="allow" disabled={orgs.length === 0} className="text-sm px-4 py-2 rounded-md mc-btn-brand font-semibold disabled:opacity-50">授权 · Allow</button>
        </div>
        <p className="text-[11px] text-faint">授权后可在工作台撤销。访问令牌 24 小时有效,刷新令牌 60 天。 <a href="/connector" className="underline underline-offset-2">了解连接器</a></p>
      </form>
    </Shell>
  );
}
