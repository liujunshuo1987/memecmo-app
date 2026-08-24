'use client';

// Set / update the account password. Landing page for recovery links
// (/auth/confirm?type=recovery&next=/update-password) — the recovery link
// establishes a session, this page lets the user choose their own password.
// Bilingual EN/VI inline (recipients are Vietnamese; no language-context keys
// needed for this single-purpose page).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, ArrowRight, CircleAlert as AlertCircle, CircleCheck as CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import MemeCMOLogo from '@/components/memecmo-logo';

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
  }, [supabase]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters · Mật khẩu tối thiểu 8 ký tự'); return; }
    if (password !== confirm) { setError('Passwords do not match · Mật khẩu nhập lại không khớp'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) { setError(err.message); setLoading(false); return; }
    setDone(true);
    setTimeout(() => { router.push('/dashboard'); router.refresh(); }, 1200);
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
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gold/5 rounded-full blur-3xl" />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <span className="inline-flex justify-center mb-6"><MemeCMOLogo height={36} showWordmark /></span>
          <h1 className="text-2xl font-bold text-ink mb-2">Set your password</h1>
          <p className="text-dim text-sm">Đặt mật khẩu cho tài khoản của bạn</p>
        </div>

        <div className="bg-surface backdrop-blur-xl border border-edge rounded-2xl p-8">
          {hasSession === false && (
            <div className="flex items-start gap-2 p-3 bg-garnet/10 border border-garnet/40 rounded-lg text-garnet text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                This link has expired or was already used. Request a new one via “Forgot password” on the login page.<br />
                <span className="text-[12px]">Liên kết đã hết hạn — dùng “Quên mật khẩu” ở trang đăng nhập để nhận liên kết mới.</span>
              </span>
            </div>
          )}

          {done ? (
            <div className="flex items-center gap-2 p-3 bg-sage/10 border border-sage/40 rounded-lg text-sage text-sm">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              Password saved — taking you to the dashboard… · Đã lưu, đang chuyển hướng…
            </div>
          ) : hasSession && (
            <form onSubmit={submit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-garnet/10 border border-garnet/40 rounded-lg text-garnet text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-dim mb-1.5">New password · Mật khẩu mới</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                  <Input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters" required
                    className="pl-10 pr-10 bg-canvas border-edge text-ink placeholder:text-faint focus:border-brand/50 focus:ring-brand/30" />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-dim">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-dim mb-1.5">Confirm password · Nhập lại mật khẩu</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                  <Input type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat the password" required
                    className="pl-10 bg-canvas border-edge text-ink placeholder:text-faint focus:border-brand/50 focus:ring-brand/30" />
                </div>
              </div>
              <Button type="submit" disabled={loading}
                className="w-full bg-brand hover:brightness-110 text-on-brand font-semibold py-3 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-brand/30">
                <span className="flex items-center justify-center gap-2">
                  {loading ? 'Saving…' : 'Save password · Lưu mật khẩu'}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </span>
              </Button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
