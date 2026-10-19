// The map viewer itself, framed by /map. Members only; same-origin framing only.
// Serves the generated public view (lib/map/public-view.ts) as a complete HTML document:
// the viewer's own <title>/<meta>/<link>/<style> go into <head>, the app markup and scripts into <body>.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MAP_VIEW } from '@/lib/map/public-view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Sign in to view the map.', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const html = MAP_VIEW.html as string;
  const cut = html.indexOf('<div class="app">');
  const head = cut > 0 ? html.slice(0, cut) : '';
  const body = cut > 0 ? html.slice(cut) : html;
  const doc = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${head}<style>html,body{height:100%;margin:0}</style></head><body>${body}</body></html>`;
  return new NextResponse(doc, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, max-age=300',
      'content-security-policy': "frame-ancestors 'self'",
      'x-map-version': MAP_VIEW.version,
    },
  });
}
