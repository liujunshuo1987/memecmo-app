'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  User, Mail, Building2, CreditCard, Shield, LogOut,
  ExternalLink, Calendar, Clock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import { useAuth } from '@/contexts/auth-context';
import { useLanguage } from '@/contexts/language-context';
import { createClient } from '@/lib/supabase/client';

export default function AccountPage() {
  const { user, subscription, signOut, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState('');
  const [payments, setPayments] = useState<Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    created_at: string;
    invoice_url: string | null;
  }>>([]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (user) {
      const fetchProfile = async () => {
        const { data } = await supabase
          .from('users')
          .select('full_name, company_name')
          .eq('id', user.id)
          .maybeSingle();
        if (data) {
          setFullName(data.full_name || '');
          setCompany(data.company_name || '');
        }
      };

      const fetchPayments = async () => {
        const { data } = await supabase
          .from('payment_history')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);
        if (data) setPayments(data);
      };

      fetchProfile();
      fetchPayments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-brand border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaveSuccess(false);

    await supabase
      .from('users')
      .update({ full_name: fullName, company_name: company, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    setSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleOpenPortal = async () => {
    setPortalLoading(true);
    setPortalError('');
    try {
      const res = await fetch('/api/stripe/create-portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setPortalError(data.error || t('account.portalError'));
      }
    } catch {
      setPortalError(t('account.portalError'));
    } finally {
      setPortalLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const planLabels: Record<string, string> = {
    free: t('pricing.freeName'),
    professional: t('pricing.professionalName'),
    enterprise: t('pricing.enterpriseName'),
  };

  const statusColors: Record<string, string> = {
    active: 'bg-brand-soft text-brand border-brand/50',
    trialing: 'bg-brand-soft text-brand border-brand/40',
    past_due: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    canceled: 'bg-red-500/20 text-garnet border-red-500/30',
  };

  return (
    <div className="min-h-screen bg-canvas">
      <Navbar />

      <main className="pt-28 pb-20 px-4">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">{t('account.title')}</h1>
            <p className="text-faint text-sm mt-1">{t('account.subtitle')}</p>
          </div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="bg-surface border-edge">
              <CardHeader className="border-b border-edge">
                <CardTitle className="text-ink text-base flex items-center gap-2">
                  <User className="w-4 h-4 text-brand" />
                  {t('account.profile')}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-dim mb-1.5">
                    {t('auth.email')}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                    <Input
                      value={user.email || ''}
                      disabled
                      className="pl-10 bg-canvas border-edge text-faint cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-dim mb-1.5">
                    {t('auth.fullName')}
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                    <Input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-10 bg-canvas border-edge text-ink focus:border-brand/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-dim mb-1.5">
                    {t('account.company')}
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                    <Input
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="pl-10 bg-canvas border-edge text-ink focus:border-brand/50"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="bg-brand text-on-brand rounded-lg"
                  >
                    {saving ? t('account.saving') : t('account.saveChanges')}
                  </Button>
                  {saveSuccess && (
                    <span className="text-sm text-brand">{t('account.saved')}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="bg-surface border-edge">
              <CardHeader className="border-b border-edge">
                <CardTitle className="text-ink text-base flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-brand" />
                  {t('account.subscription')}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-dim">{t('account.currentPlan')}</p>
                    <p className="text-lg font-semibold text-ink">
                      {planLabels[subscription?.plan_type || 'free']}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={statusColors[subscription?.status || 'trialing']}
                  >
                    {subscription?.status || 'trialing'}
                  </Badge>
                </div>

                {subscription?.current_period_end && (
                  <div className="flex items-center gap-4 text-xs text-faint mb-4">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {t('account.periodStart')}: {new Date(subscription.current_period_start).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {t('account.periodEnd')}: {new Date(subscription.current_period_end).toLocaleDateString()}
                    </div>
                  </div>
                )}

                <Separator className="bg-raised my-4" />

                {portalError && (
                  <div className="mb-4 flex items-center gap-2 p-3 bg-garnet/10 border border-garnet/40 rounded-lg text-garnet text-sm">
                    {portalError}
                  </div>
                )}

                <div className="flex gap-3">
                  {subscription?.stripe_customer_id && (
                    <Button
                      onClick={handleOpenPortal}
                      disabled={portalLoading}
                      variant="outline"
                      className="border-edge text-[#CBD5E1] hover:bg-canvas rounded-lg"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      {t('account.manageBilling')}
                    </Button>
                  )}
                  {subscription?.plan_type === 'free' && (
                    <Button
                      onClick={() => router.push('/pricing')}
                      className="bg-brand text-on-brand rounded-lg"
                    >
                      {t('dashboard.upgrade')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {payments.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="bg-surface border-edge">
                <CardHeader className="border-b border-edge">
                  <CardTitle className="text-ink text-base flex items-center gap-2">
                    <Shield className="w-4 h-4 text-gold" />
                    {t('account.paymentHistory')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-[#334155]">
                    {payments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-ink">
                            ${payment.amount.toFixed(2)} {payment.currency.toUpperCase()}
                          </p>
                          <p className="text-xs text-faint">
                            {new Date(payment.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant="outline"
                            className={
                              payment.status === 'succeeded'
                                ? 'border-brand/50 text-brand'
                                : 'border-amber-500/30 text-amber-400'
                            }
                          >
                            {payment.status}
                          </Badge>
                          {payment.invoice_url && (
                            <a
                              href={payment.invoice_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand hover:text-[#60A5FA]"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="bg-surface border-garnet/40">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">{t('account.signOutTitle')}</p>
                    <p className="text-xs text-faint">{t('account.signOutDesc')}</p>
                  </div>
                  <Button
                    onClick={handleSignOut}
                    variant="outline"
                    className="border-red-500/30 text-garnet hover:bg-garnet/10 rounded-lg"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    {t('account.signOut')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
