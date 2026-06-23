'use client';

import dynamic from 'next/dynamic';

const DashboardContent = dynamic(() => import('./dashboard-content'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-2 border-[#1D4ED8] border-t-transparent rounded-full" />
    </div>
  ),
});

export default function DashboardPage() {
  return <DashboardContent />;
}
