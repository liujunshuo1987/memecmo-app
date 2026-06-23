import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Hard-protected — full page guard. Catch-all matcher sends every page here,
  // so adding a path to this list is sufficient (no matcher edit needed).
  const protectedPaths = ['/dashboard', '/account'];
  // Auth pages — bounce already-authed users back to /dashboard
  const authPaths = ['/login', '/signup'];
  // Per-API authorization (sign-in + per-user rate limit) for high-cost LLM
  // routes is enforced inside the route handlers via lib/api-guard.ts.
  // See docs/GEO_AEO_ALGORITHM_LOG.md entry "API access tiering · 2026-05-04".
  const pathname = request.nextUrl.pathname;

  const isProtected = protectedPaths.some(
    (path) => pathname === path || pathname.startsWith(path + '/')
  );
  const isAuthPage = authPaths.some(
    (path) => pathname === path || pathname.startsWith(path + '/')
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Invite-only gate: /signup is reachable only via an approval magic-link
  // (carrying ?token=). Bare /signup → /waitlist. This closes the back door
  // where a curious visitor could create an account by typing /signup directly.
  // When token-based signup ships (Wave 2), the route handler validates the
  // token; until then we redirect every tokenless access.
  if (pathname === '/signup' && !user) {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      const url = request.nextUrl.clone();
      url.pathname = '/waitlist';
      // preserve any utm_* params so attribution survives the bounce
      // (do nothing — clone() already keeps query; just strip nothing here)
      return NextResponse.redirect(url);
    }
  }

  return response;
}
