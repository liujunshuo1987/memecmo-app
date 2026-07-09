'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, ArrowRight, CircleAlert as AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import MemeCMOLogo from '@/components/memecmo-logo';
import { useLanguage } from '@/contexts/language-context';
import OAuthButtons from '@/components/oauth-buttons';

function LoginPageContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  // Accept both param names: server pages and the invite flow send ?next=,
  // older links send ?redirect=.
  const redirect = searchParams.get('redirect') || searchParams.get('next') || '/dashboard';
  const callbackError = searchParams.get('error');
  const { t } = useLanguage();
  const supabase = createClient();

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? t('auth.invalidCredentials')
          : authError.message
      );
      setLoading(false);
      return;
    }

    router.push(redirect);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gold/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Link href="https://memecmo.ai" className="inline-block mb-6">
            <span className="inline-flex justify-center"><MemeCMOLogo height={36} showWordmark /></span>
          </Link>
          <h1 className="text-2xl font-bold text-ink mb-2">
            {t('auth.loginTitle')}
          </h1>
          <p className="text-dim text-sm">
            {t('auth.loginSubtitle')}
          </p>
        </div>

        <div className="bg-surface backdrop-blur-xl border border-edge rounded-2xl p-8">
          {(error || callbackError) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex items-center gap-2 p-3 bg-garnet/10 border border-garnet/40 rounded-lg text-garnet text-sm"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error || t('auth.oauthError')}
            </motion.div>
          )}

          <OAuthButtons redirectTo={redirect} />

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-edge" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-surface text-faint">
                {t('auth.orContinueWith')}
              </span>
            </div>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dim mb-1.5">
                {t('auth.email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="pl-10 bg-canvas border-edge text-ink placeholder:text-faint focus:border-brand/50 focus:ring-brand/30"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-dim">
                  {t('auth.password')}
                </label>
                <Link
                  href="/reset-password"
                  className="text-xs text-brand hover:brightness-110 transition-colors"
                >
                  {t('auth.forgotPassword')}
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  required
                  className="pl-10 pr-10 bg-canvas border-edge text-ink placeholder:text-faint focus:border-brand/50 focus:ring-brand/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-dim"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-brand hover:brightness-110 text-on-brand font-semibold py-3 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-brand/30"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t('auth.signingIn')}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  {t('auth.signIn')}
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-faint mt-6">
          {t('auth.noAccount')}{' '}
          {redirect.startsWith('/invite/') ? (
            // Invited users must be able to register directly — never funnel
            // an invite into the waitlist.
            <Link
              href={`/signup?redirect=${encodeURIComponent(redirect)}`}
              className="text-brand hover:text-brand font-medium transition-colors"
            >
              创建账号 / Create account →
            </Link>
          ) : (
            <Link
              href="/waitlist"
              className="text-brand hover:text-brand font-medium transition-colors"
            >
              加入等待列表 →
            </Link>
          )}
        </p>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}
