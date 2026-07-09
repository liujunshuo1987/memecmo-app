// Product guide — how to use the platform + how the numbers are computed.
// Every constant on this page is extracted from the actual implementation
// (lib/agents/monitor.ts, discovery.ts, lib/commerce.ts, registry.ts) so the
// document doubles as an algorithm audit: if the page and the product ever
// disagree, one of them has a bug.

import type { Metadata } from 'next';
import GuideContent from './guide-content';

export const metadata: Metadata = {
  title: '使用说明 · User Guide — MemeCMO GEO Platform',
  description:
    'How to use the MemeCMO GEO workspace: the 10-agent suite, the AIGVR five-dimension algorithm, Top-of-Mind rate, real-surface measurement, Source-Authority index, quotas and troubleshooting.',
  alternates: { canonical: 'https://app.memecmo.ai/guide' },
};

export default function GuidePage() {
  return <GuideContent />;
}
