/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  async redirects() {
    return [
      {
        // app.memecmo.ai is the product domain; the marketing homepage lives
        // on memecmo.ai (separate deployment). Config-level redirect ensures
        // a proper Location header (a static page-level redirect() does not).
        source: '/',
        destination: '/dashboard',
        permanent: false,
      },
      {
        source: '/privacy-policy',
        destination: '/privacy',
        permanent: true,
      },
      // Canonical: memecmo.ai (brand name "MemeCMO.ai" intact).
      // Reversed 2026-05-22 per E1 entity-canonicality fix — see
      // docs/GEO_AEO_ALGORITHM_LOG.md.
      //
      // 3 hosts collapse to the single canonical:
      //   1. memecmo.ai (canonical apex) → www variant
      //   2. neurosparkmedia.com (legacy short, apex) → canonical
      //   3. www.neurosparkmedia.com (legacy short, www) → canonical
      // memecmo.ai itself serves content; the rule below would
      // create an infinite loop if applied to it, so it's excluded.
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'memecmo.ai' }],
        destination: 'https://memecmo.ai/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'neurosparkmedia.com' }],
        destination: 'https://memecmo.ai/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.neurosparkmedia.com' }],
        destination: 'https://memecmo.ai/:path*',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self' https: http:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http:; style-src 'self' 'unsafe-inline' https: http:; img-src 'self' data: blob: https: http:; font-src 'self' data: https: http:; connect-src 'self' https: http: wss: ws:; frame-src 'self' https: http:; object-src 'none';",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
