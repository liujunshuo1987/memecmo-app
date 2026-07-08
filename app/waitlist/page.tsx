import type { Metadata } from 'next';
import { createClient as createServerSupabase } from '@supabase/supabase-js';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import WaitlistClient from './waitlist-client';

export const revalidate = 60; // re-fetch public counter every 60s

export const metadata: Metadata = {
  title: 'Join the waitlist · MemeCMO.ai',
  description:
    'MemeCMO.ai is the multi-agent GEO platform for Southeast Asia. Currently in invite-only beta — brands and GEO consultants are welcome to join the queue.',
  openGraph: {
    title: 'Join the waitlist · MemeCMO.ai',
    description:
      'Multi-agent GEO platform for Vietnam, Thailand, Indonesia, Philippines, Singapore, Malaysia. Invite-only beta.',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

interface PublicStats {
  total_joined: number;
  joined_this_week: number;
  total_admitted: number;
}

async function getPublicStats(): Promise<PublicStats> {
  try {
    const sb = createServerSupabase(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data } = await sb.from('waitlist_public_stats').select('*').limit(1).maybeSingle();
    return {
      total_joined: data?.total_joined ?? 0,
      joined_this_week: data?.joined_this_week ?? 0,
      total_admitted: data?.total_admitted ?? 0,
    };
  } catch {
    return { total_joined: 0, joined_this_week: 0, total_admitted: 0 };
  }
}

export default async function WaitlistPage() {
  const stats = await getPublicStats();
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a1628] via-[#0d1f3c] to-[#0a1628]">
      <Navbar />
      <main className="relative pt-28 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Ambient blobs to match the rest of the site */}
        <div className="pointer-events-none absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
        <div className="pointer-events-none absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl" />

        <div className="relative max-w-5xl mx-auto">
          <WaitlistClient initialStats={stats} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
