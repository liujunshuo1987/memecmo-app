'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Building2, Eye, EyeOff, ArrowRight, CircleAlert as AlertCircle, CircleCheck as CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/contexts/language-context';
import OAuthButtons from '@/components/oauth-buttons';

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
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
      router.push('/dashboard');
      router.refresh();
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md text-center"
        >
          <div className="bg-[#1E293B]/80 backdrop-blur-xl border border-[#334155] rounded-2xl p-8">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-[#F8FAFC] mb-2">
              {t('auth.signupSuccess')}
            </h2>
            <p className="text-[#94A3B8] text-sm mb-6">
              {t('auth.checkEmail')}
            </p>
            <Link href="/login">
              <Button className="w-full bg-gradient-to-r from-[#1D4ED8] to-[#1E40AF] text-[#F8FAFC] rounded-xl">
                {t('auth.backToLogin')}
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#1D4ED8]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 left-1/3 w-96 h-96 bg-[#F97316]/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6">
            <img
              src="/logo.svg"
              alt="NeuronSpark Media-Tech"
              className="h-12 w-auto mx-auto"
            />
          </Link>
          <h1 className="text-2xl font-bold text-[#F8FAFC] mb-2">
            {t('auth.signupTitle')}
          </h1>
          <p className="text-[#94A3B8] text-sm">
            {t('auth.signupSubtitle')}
          </p>
        </div>

        <div className="bg-[#1E293B]/80 backdrop-blur-xl border border-[#334155] rounded-2xl p-8">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </motion.div>
          )}

          <OAuthButtons redirectTo="/dashboard" />

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#334155]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-[#1E293B] text-[#64748B]">
                {t('auth.orContinueWith')}
              </span>
            </div>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">
                {t('auth.fullName')}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                <Input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('auth.fullNamePlaceholder')}
                  required
                  className="pl-10 bg-[#0F172A] border-[#334155] text-[#F8FAFC] placeholder:text-[#475569] focus:border-[#1D4ED8] focus:ring-[#1D4ED8]/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">
                {t('auth.email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="pl-10 bg-[#0F172A] border-[#334155] text-[#F8FAFC] placeholder:text-[#475569] focus:border-[#1D4ED8] focus:ring-[#1D4ED8]/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">
                {t('auth.companyOptional')}
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                <Input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder={t('auth.companyPlaceholder')}
                  className="pl-10 bg-[#0F172A] border-[#334155] text-[#F8FAFC] placeholder:text-[#475569] focus:border-[#1D4ED8] focus:ring-[#1D4ED8]/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">
                {t('auth.password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  required
                  className="pl-10 pr-10 bg-[#0F172A] border-[#334155] text-[#F8FAFC] placeholder:text-[#475569] focus:border-[#1D4ED8] focus:ring-[#1D4ED8]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#94A3B8]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="mt-2 space-y-1">
                {passwordRequirements.map((req) => (
                  <div key={req.label} className="flex items-center gap-2 text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full ${req.met ? 'bg-emerald-400' : 'bg-[#475569]'}`} />
                    <span className={req.met ? 'text-emerald-400' : 'text-[#64748B]'}>
                      {req.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#1D4ED8] to-[#1E40AF] hover:from-[#1E40AF] hover:to-[#1D4ED8] text-[#F8FAFC] font-semibold py-3 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-[#1D4ED8]/30"
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

        <p className="text-center text-sm text-[#64748B] mt-6">
          {t('auth.hasAccount')}{' '}
          <Link
            href="/login"
            className="text-[#1D4ED8] hover:text-[#3B82F6] font-medium transition-colors"
          >
            {t('auth.signIn')}
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
