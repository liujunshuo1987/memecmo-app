'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Activity, Eye, Target, Users, ChartBar as BarChart3, ArrowUpRight, Search, FileText, TrendingUp, TriangleAlert as AlertTriangle, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import { useAuth } from '@/contexts/auth-context';
import { useLanguage } from '@/contexts/language-context';
import { createClient } from '@/lib/supabase/client';

export default function DashboardPage() {
  const { user, subscription, quotas, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const supabase = createClient();
  const [recentScans, setRecentScans] = useState<Array<{
    id: string;
    brand_name: string;
    created_at: string;
    audit_results: Record<string, unknown>;
  }>>([]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (user) {
      const fetchRecentScans = async () => {
        const { data } = await supabase
          .from('scan_submissions')
          .select('id, brand_name, created_at, audit_results')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5);
        if (data) setRecentScans(data);
      };
      fetchRecentScans();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#1D4ED8] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  const planLabels: Record<string, string> = {
    free: t('pricing.freeName'),
    professional: t('pricing.professionalName'),
    enterprise: t('pricing.enterpriseName'),
  };

  const planColors: Record<string, string> = {
    free: 'bg-[#334155] text-[#94A3B8]',
    professional: 'bg-[#1D4ED8]/20 text-[#3B82F6]',
    enterprise: 'bg-[#F97316]/20 text-[#F97316]',
  };

  const scansPercent = quotas
    ? Math.min((quotas.visibility_scans_used / quotas.visibility_scans_limit) * 100, 100)
    : 0;
  const auditsPercent = quotas
    ? Math.min((quotas.geo_audits_used / quotas.geo_audits_limit) * 100, 100)
    : 0;
  const brandsPercent = quotas
    ? Math.min((quotas.brands_count / quotas.brands_limit) * 100, 100)
    : 0;

  return (
    <div className="min-h-screen bg-[#0F172A]">
      <Navbar />

      <main className="pt-28 pb-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[#F8FAFC]">
                {t('dashboard.welcome')}, {user.user_metadata?.full_name || user.email?.split('@')[0]}
              </h1>
              <p className="text-[#64748B] text-sm mt-1">{t('dashboard.overview')}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={planColors[subscription?.plan_type || 'free']}>
                {planLabels[subscription?.plan_type || 'free']}
              </Badge>
              {subscription?.plan_type === 'free' && (
                <Link href="/pricing">
                  <Button
                    size="sm"
                    className="bg-gradient-to-r from-[#1D4ED8] to-[#1E40AF] text-[#F8FAFC] text-xs rounded-lg"
                  >
                    <ArrowUpRight className="w-3 h-3 mr-1" />
                    {t('dashboard.upgrade')}
                  </Button>
                </Link>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              {
                label: t('dashboard.visibilityScans'),
                used: quotas?.visibility_scans_used || 0,
                limit: quotas?.visibility_scans_limit || 0,
                percent: scansPercent,
                icon: <Eye className="w-4 h-4" />,
                color: 'text-[#3B82F6]',
              },
              {
                label: t('dashboard.geoAudits'),
                used: quotas?.geo_audits_used || 0,
                limit: quotas?.geo_audits_limit || 0,
                percent: auditsPercent,
                icon: <Target className="w-4 h-4" />,
                color: 'text-emerald-400',
              },
              {
                label: t('dashboard.brands'),
                used: quotas?.brands_count || 0,
                limit: quotas?.brands_limit || 0,
                percent: brandsPercent,
                icon: <BarChart3 className="w-4 h-4" />,
                color: 'text-[#F97316]',
              },
              {
                label: t('dashboard.apiCalls'),
                used: quotas?.api_calls_used || 0,
                limit: quotas?.api_calls_limit || 0,
                percent: quotas ? Math.min((quotas.api_calls_used / Math.max(quotas.api_calls_limit, 1)) * 100, 100) : 0,
                icon: <Activity className="w-4 h-4" />,
                color: 'text-cyan-400',
              },
            ].map((stat) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="bg-[#1E293B] border-[#334155]">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-[#64748B] font-medium">{stat.label}</span>
                      <span className={stat.color}>{stat.icon}</span>
                    </div>
                    <div className="text-2xl font-bold text-[#F8FAFC] mb-1">
                      {stat.used}
                      <span className="text-sm font-normal text-[#475569]"> / {stat.limit === 9999 ? '∞' : stat.limit}</span>
                    </div>
                    <Progress
                      value={stat.limit === 9999 ? 0 : stat.percent}
                      className="h-1.5 bg-[#0F172A]"
                    />
                    {stat.percent >= 90 && stat.limit !== 9999 && (
                      <div className="flex items-center gap-1 mt-2 text-amber-400 text-xs">
                        <AlertTriangle className="w-3 h-3" />
                        {t('dashboard.nearLimit')}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="bg-[#1E293B] border-[#334155]">
                <CardHeader className="border-b border-[#334155]">
                  <CardTitle className="text-[#F8FAFC] text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#3B82F6]" />
                    {t('dashboard.recentScans')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {recentScans.length === 0 ? (
                    <div className="p-8 text-center">
                      <Search className="w-10 h-10 text-[#334155] mx-auto mb-3" />
                      <p className="text-[#64748B] text-sm mb-4">{t('dashboard.noScans')}</p>
                      <Link href="/sea-command-center">
                        <Button
                          size="sm"
                          className="bg-[#1D4ED8] text-[#F8FAFC] rounded-lg"
                        >
                          {t('dashboard.startFirstScan')}
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#334155]">
                      {recentScans.map((scan) => (
                        <div
                          key={scan.id}
                          className="flex items-center justify-between px-6 py-4 hover:bg-[#0F172A]/50 transition-colors"
                        >
                          <div>
                            <p className="text-sm font-medium text-[#F8FAFC]">{scan.brand_name}</p>
                            <p className="text-xs text-[#64748B]">
                              {new Date(scan.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 text-emerald-400 text-xs"
                          >
                            <TrendingUp className="w-3 h-3 mr-1" />
                            {t('dashboard.completed')}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="bg-[#1E293B] border-[#334155]">
                <CardHeader>
                  <CardTitle className="text-[#F8FAFC] text-base">{t('dashboard.quickActions')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Link href="/account" className="block">
                    <Button
                      variant="outline"
                      className="w-full justify-start border-[#334155] text-[#CBD5E1] hover:bg-[#0F172A] hover:text-[#F8FAFC] rounded-xl"
                    >
                      <Users className="w-4 h-4 mr-3 text-[#F97316]" />
                      {t('dashboard.manageAccount')}
                    </Button>
                  </Link>
                  <Link href="/sea-command-center" className="block">
                    <Button
                      variant="outline"
                      className="w-full justify-start border-[#334155] text-[#CBD5E1] hover:bg-[#0F172A] hover:text-[#F8FAFC] rounded-xl"
                    >
                      <Globe className="w-4 h-4 mr-3 text-emerald-400" />
                      SEA 指挥中心（含 SOV 探针 + 情报简报）
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {subscription?.plan_type === 'free' && (
                <Card className="bg-gradient-to-br from-[#1D4ED8]/10 to-[#1E293B] border-[#1D4ED8]/30">
                  <CardContent className="p-6">
                    <h3 className="text-sm font-semibold text-[#F8FAFC] mb-2">
                      {t('dashboard.upgradeTitle')}
                    </h3>
                    <p className="text-xs text-[#94A3B8] mb-4">
                      {t('dashboard.upgradeDesc')}
                    </p>
                    <Link href="/pricing">
                      <Button
                        size="sm"
                        className="w-full bg-[#1D4ED8] text-[#F8FAFC] rounded-lg"
                      >
                        {t('dashboard.viewPlans')}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
