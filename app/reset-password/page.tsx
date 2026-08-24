'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, CircleAlert as AlertCircle, CircleCheck as CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import MemeCMOLogo from '@/components/memecmo-logo';
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
      redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
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
    <div className="theme-day min-h-screen bg-canvas flex items-center justify-center px-4">
      <a
        href="https://memecmo.ai"
        className="fixed top-5 left-6 z-20 inline-flex items-center gap-1.5 text-[13px] text-faint hover:text-ink transition"
      >
        ← memecmo.ai
      </a>
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-brand-soft rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6">
            <span className="inline-flex justify-center"><MemeCMOLogo height={36} showWordmark /></span>
          </Link>
          <h1 className="text-2xl font-bold text-ink mb-2">
            {t('auth.resetTitle')}
          </h1>
          <p className="text-dim text-sm">
            {t('auth.resetSubtitle')}
          </p>
        </div>

        <div className="bg-surface border border-edge rounded-2xl p-8">
          {success ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-lg font-semibold text-ink mb-2">
                {t('auth.resetEmailSent')}
              </h2>
              <p className="text-dim text-sm mb-6">
                {t('auth.resetEmailSentDesc')}
              </p>
              <Link href="/login">
                <Button className="w-full bg-brand hover:brightness-110 text-on-brand rounded-xl">
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

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand hover:brightness-110 text-on-brand font-semibold py-3 rounded-xl transition-all duration-300"
                >
                  {loading ? t('auth.sending') : t('auth.sendResetLink')}
                </Button>
              </form>
            </>
          )}
        </div>

        <Link
          href="/login"
          className="flex items-center justify-center gap-2 text-sm text-faint hover:text-ink mt-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('auth.backToLogin')}
        </Link>
      </motion.div>
    </div>
  );
}
