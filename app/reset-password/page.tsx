'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, CircleAlert as AlertCircle, CircleCheck as CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/contexts/language-context';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { t } = useLanguage();
  const supabase = createClient();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/account`,
    });

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-[#1D4ED8]/10 rounded-full blur-3xl" />
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
            {t('auth.resetTitle')}
          </h1>
          <p className="text-[#94A3B8] text-sm">
            {t('auth.resetSubtitle')}
          </p>
        </div>

        <div className="bg-[#1E293B]/80 backdrop-blur-xl border border-[#334155] rounded-2xl p-8">
          {success ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-lg font-semibold text-[#F8FAFC] mb-2">
                {t('auth.resetEmailSent')}
              </h2>
              <p className="text-[#94A3B8] text-sm mb-6">
                {t('auth.resetEmailSentDesc')}
              </p>
              <Link href="/login">
                <Button className="w-full bg-gradient-to-r from-[#1D4ED8] to-[#1E40AF] text-[#F8FAFC] rounded-xl">
                  {t('auth.backToLogin')}
                </Button>
              </Link>
            </div>
          ) : (
            <>
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

              <form onSubmit={handleReset} className="space-y-4">
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

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-[#1D4ED8] to-[#1E40AF] hover:from-[#1E40AF] hover:to-[#1D4ED8] text-[#F8FAFC] font-semibold py-3 rounded-xl transition-all duration-300"
                >
                  {loading ? t('auth.sending') : t('auth.sendResetLink')}
                </Button>
              </form>
            </>
          )}
        </div>

        <Link
          href="/login"
          className="flex items-center justify-center gap-2 text-sm text-[#64748B] hover:text-[#94A3B8] mt-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('auth.backToLogin')}
        </Link>
      </motion.div>
    </div>
  );
}
