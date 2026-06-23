import { updateSession } from '@/lib/supabase/middleware';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  // 设置 CSP 头允许 unsafe-eval
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self' https: http:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http:; style-src 'self' 'unsafe-inline' https: http:; img-src 'self' data: blob: https: http:; font-src 'self' data: https: http:; connect-src 'self' https: http: wss: ws:; frame-src 'self' https: http:; object-src 'none';"
  );

  return response;
}

export const config = {
  // Catch-all matcher: every page request flows through middleware so that
  // adding a route to `protectedPaths` in lib/supabase/middleware.ts is the
  // only change needed to gate it. Excludes API routes (those handle auth
  // themselves via lib/api-guard.ts), Next internals, and static assets.
  matcher: [
    '/((?!api/|_next/|_static/|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|otf|map)$).*)',
  ],
};
