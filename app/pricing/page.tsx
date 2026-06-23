'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, Zap, Building2, Crown, ArrowRight, Shield, Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import { useAuth } from '@/contexts/auth-context';
import { useLanguage } from '@/contexts/language-context';
import { createClient } from '@/lib/supabase/client';

interface PricingPlan {
  id: string;
  plan_type: string;
  billing_cycle: string;
  price_usd: number;
  price_hkd: number;
  stripe_price_id: string | null;
  features: string[];
  quota_config: Record<string, number>;
  display_order: number;
}

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const { user, subscription } = useAuth();
  const { t } = useLanguage();
  const supabase = createClient();

  useEffect(() => {
    const fetchPlans = async () => {
      const { data } = await supabase
        .from('pricing_plans')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      if (data) setPlans(data);
    };
    fetchPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentPlans = plans.filter((p) => p.billing_cycle === billingCycle);

  const handleSubscribe = async (plan: PricingPlan) => {
    if (!user) {
      window.location.href = `/login?redirect=${encodeURIComponent('/pricing')}`;
      return;
    }

    if (plan.plan_type === 'free') return;

    if (plan.plan_type === 'enterprise' && !plan.stripe_price_id) {
      window.location.href = 'mailto:liujunshuo1987@gmail.com?subject=Enterprise Plan Inquiry';
      return;
    }

    if (!plan.stripe_price_id) return;

    setLoading(true);
    setCheckoutError('');
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: plan.stripe_price_id,
          planType: plan.plan_type,
          billingCycle: plan.billing_cycle,
        }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setCheckoutError(data.error || t('pricing.checkoutError'));
      }
    } catch {
      setCheckoutError(t('pricing.checkoutError'));
    } finally {
      setLoading(false);
    }
  };

  const planIcons: Record<string, React.ReactNode> = {
    free: <Zap className="w-6 h-6" />,
    professional: <Crown className="w-6 h-6" />,
    enterprise: <Building2 className="w-6 h-6" />,
  };

  const planColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    free: {
      bg: 'bg-[#1E293B]',
      border: 'border-[#334155]',
      text: 'text-[#94A3B8]',
      badge: 'bg-[#334155] text-[#94A3B8]',
    },
    professional: {
      bg: 'bg-gradient-to-b from-[#1D4ED8]/10 to-[#1E293B]',
      border: 'border-[#1D4ED8]/40',
      text: 'text-[#3B82F6]',
      badge: 'bg-[#1D4ED8]/20 text-[#3B82F6]',
    },
    enterprise: {
      bg: 'bg-gradient-to-b from-[#F97316]/10 to-[#1E293B]',
      border: 'border-[#F97316]/40',
      text: 'text-[#F97316]',
      badge: 'bg-[#F97316]/20 text-[#F97316]',
    },
  };

  return (
    <div className="min-h-screen bg-[#0F172A]">
      <Navbar />

      <main className="pt-32 pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <Badge className="mb-4 bg-[#1D4ED8]/20 text-[#3B82F6] border-[#1D4ED8]/40 px-4 py-1.5">
              {t('pricing.badge')}
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold text-[#F8FAFC] mb-4">
              {t('pricing.title')}
            </h1>
            <p className="text-[#94A3B8] text-lg max-w-2xl mx-auto mb-10">
              {t('pricing.subtitle')}
            </p>

            <div className="inline-flex items-center bg-[#1E293B] border border-[#334155] rounded-xl p-1.5">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  billingCycle === 'monthly'
                    ? 'bg-[#1D4ED8] text-[#F8FAFC] shadow-lg shadow-[#1D4ED8]/30'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                {t('pricing.monthly')}
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                  billingCycle === 'yearly'
                    ? 'bg-[#1D4ED8] text-[#F8FAFC] shadow-lg shadow-[#1D4ED8]/30'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                {t('pricing.yearly')}
                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                  -20%
                </span>
              </button>
            </div>
          </motion.div>

          {checkoutError && (
            <div className="max-w-md mx-auto mb-8 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {checkoutError}
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 mb-20">
            {currentPlans.map((plan, idx) => {
              const colors = planColors[plan.plan_type] || planColors.free;
              const isCurrentPlan = subscription?.plan_type === plan.plan_type;
              const isPro = plan.plan_type === 'professional';

              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={`relative rounded-2xl border ${colors.border} ${colors.bg} p-8 flex flex-col ${
                    isPro ? 'ring-2 ring-[#1D4ED8] shadow-2xl shadow-[#1D4ED8]/10 scale-[1.02]' : ''
                  }`}
                >
                  {isPro && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <Badge className="bg-[#1D4ED8] text-[#F8FAFC] px-4 py-1 text-xs font-semibold">
                        {t('pricing.mostPopular')}
                      </Badge>
                    </div>
                  )}

                  <div className="mb-6">
                    <div className={`inline-flex p-2.5 rounded-xl ${colors.badge} mb-4`}>
                      {planIcons[plan.plan_type]}
                    </div>
                    <h3 className="text-xl font-bold text-[#F8FAFC] mb-1">
                      {t(`pricing.${plan.plan_type}Name`)}
                    </h3>
                    <p className="text-sm text-[#64748B]">
                      {t(`pricing.${plan.plan_type}Desc`)}
                    </p>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-[#F8FAFC]">
                        ${plan.price_usd}
                      </span>
                      {plan.price_usd > 0 && (
                        <span className="text-[#64748B] text-sm">
                          /{billingCycle === 'monthly' ? t('pricing.mo') : t('pricing.mo')}
                        </span>
                      )}
                    </div>
                    {plan.price_hkd > 0 && (
                      <p className="text-xs text-[#475569] mt-1">
                        HK${plan.price_hkd}/{t('pricing.mo')}
                      </p>
                    )}
                    {billingCycle === 'yearly' && plan.price_usd > 0 && (
                      <p className="text-xs text-emerald-400 mt-1">
                        {t('pricing.billedYearly')} ${plan.price_usd * 12}/{t('pricing.yr')}
                      </p>
                    )}
                  </div>

                  <div className="flex-1 mb-8">
                    <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-4">
                      {t('pricing.includes')}
                    </p>
                    <ul className="space-y-3">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                          <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${colors.text}`} />
                          <span className="text-[#CBD5E1]">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {isCurrentPlan ? (
                    <Button
                      disabled
                      className="w-full bg-[#334155] text-[#94A3B8] cursor-not-allowed rounded-xl py-3"
                    >
                      {t('pricing.currentPlan')}
                    </Button>
                  ) : plan.plan_type === 'free' ? (
                    <Link href={user ? '/dashboard' : '/signup'}>
                      <Button
                        variant="outline"
                        className="w-full border-[#334155] text-[#F8FAFC] hover:bg-[#1E293B] rounded-xl py-3"
                      >
                        {user ? t('pricing.goToDashboard') : t('pricing.getStartedFree')}
                      </Button>
                    </Link>
                  ) : plan.plan_type === 'enterprise' ? (
                    <Button
                      onClick={() => handleSubscribe(plan)}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#F97316] text-[#F8FAFC] font-semibold rounded-xl py-3 transition-all duration-300 hover:shadow-lg hover:shadow-[#F97316]/30"
                    >
                      <span className="flex items-center justify-center gap-2">
                        {t('pricing.contactSales')}
                        <ArrowRight className="w-4 h-4" />
                      </span>
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleSubscribe(plan)}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-[#1D4ED8] to-[#1E40AF] hover:from-[#1E40AF] hover:to-[#1D4ED8] text-[#F8FAFC] font-semibold rounded-xl py-3 transition-all duration-300 hover:shadow-lg hover:shadow-[#1D4ED8]/30"
                    >
                      <span className="flex items-center justify-center gap-2">
                        {t('pricing.subscribe')}
                        <ArrowRight className="w-4 h-4" />
                      </span>
                    </Button>
                  )}
                </motion.div>
              );
            })}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto"
          >
            {[
              {
                icon: <Shield className="w-6 h-6 text-[#3B82F6]" />,
                title: t('pricing.securePayments'),
                desc: t('pricing.securePaymentsDesc'),
              },
              {
                icon: <Clock className="w-6 h-6 text-emerald-400" />,
                title: t('pricing.cancelAnytime'),
                desc: t('pricing.cancelAnytimeDesc'),
              },
              {
                icon: <Users className="w-6 h-6 text-[#F97316]" />,
                title: t('pricing.teamReady'),
                desc: t('pricing.teamReadyDesc'),
              },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex p-3 bg-[#1E293B] border border-[#334155] rounded-xl mb-3">
                  {item.icon}
                </div>
                <h4 className="text-sm font-semibold text-[#F8FAFC] mb-1">{item.title}</h4>
                <p className="text-xs text-[#64748B]">{item.desc}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
