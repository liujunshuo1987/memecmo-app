'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Building2, Eye, EyeOff, ArrowRight, CircleAlert as AlertCircle, CircleCheck as CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import MemeCMOLogo from '@/components/memecmo-logo';
import { useLanguage } from '@/contexts/language-context';
import OAuthButtons from '@/components/oauth-buttons';

function SignupForm() {
  const searchParams = useSearchParams();
  // Honor both param names (invite flow / server pages send ?next= or ?redirect=)
  // so a user who registers mid-flow lands back where they started (e.g. the
  // invite-accept page) instead of an empty dashboard.
  const redirect = searchParams.get('redirect') || searchParams.get('next') || '/dashboard';
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const { t } = useLanguage();
  const supabase = createClient();

  const passwordRequirements = [
    { label: t('auth.passwordMin8'), met: password.length >= 8 },
    { label: t('auth.passwordUppercase'), met: /[A-Z]/.test(password) },
    { label: t('auth.passwordNumber'), met: /[0-9]/.test(password) },
  ];

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password.length < 8) {
      setError(t('auth.passwordTooShort'));
      setLoading(false);
      return;
    }

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          company,
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push(redirect);
      router.refresh();
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md text-center"
        >
          <div className="bg-surface backdrop-blur-xl border border-edge rounded-2xl p-8">
            <div className="w-16 h-16 bg-brand rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-brand" />
            </div>
            <h2 className="text-xl font-bold text-ink mb-2">
              {t('auth.signupSuccess')}
            </h2>
            <p className="text-dim text-sm mb-6">
              {t('auth.checkEmail')}
            </p>
            <Link href="/login">
              <Button className="w-full bg-brand text-on-brand rounded-xl">
                {t('auth.backToLogin')}
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-brand/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 left-1/3 w-96 h-96 bg-gold/5 rounded-full blur-3xl" />
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
            {t('auth.signupTitle')}
          </h1>
          <p className="text-dim text-sm">
            {t('auth.signupSubtitle')}
          </p>
        </div>

        <div className="bg-surface backdrop-blur-xl border border-edge rounded-2xl p-8">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex items-center gap-2 p-3 bg-garnet/10 border border-garnet/40 rounded-lg text-garnet text-sm"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
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

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dim mb-1.5">
                {t('auth.fullName')}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                <Input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('auth.fullNamePlaceholder')}
                  required
                  className="pl-10 bg-canvas border-edge text-ink placeholder:text-faint focus:border-brand/50 focus:ring-brand/30"
                />
              </div>
            </div>

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
              <label className="block text-sm font-medium text-dim mb-1.5">
                {t('auth.companyOptional')}
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                <Input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder={t('auth.companyPlaceholder')}
                  className="pl-10 bg-canvas border-edge text-ink placeholder:text-faint focus:border-brand/50 focus:ring-brand/30"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dim mb-1.5">
                {t('auth.password')}
              </label>
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
              <div className="mt-2 space-y-1">
                {passwordRequirements.map((req) => (
                  <div key={req.label} className="flex items-center gap-2 text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full ${req.met ? 'bg-sage' : 'bg-raised'}`} />
                    <span className={req.met ? 'text-brand' : 'text-faint'}>
                      {req.label}
                    </span>
                  </div>
                ))}
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
                  {t('auth.creatingAccount')}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  {t('auth.createAccount')}
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-faint mt-6">
          {t('auth.hasAccount')}{' '}
          <Link
            href={redirect !== '/dashboard' ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login'}
            className="text-brand hover:brightness-110 font-medium transition-colors"
          >
            {t('auth.signIn')}
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

export default function SignupPage() {
  // useSearchParams requires a Suspense boundary for static prerender (same
  // pattern as /login).
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
