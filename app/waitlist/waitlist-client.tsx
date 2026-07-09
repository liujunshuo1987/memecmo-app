'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, ArrowRight, Check, AlertCircle, Loader2, Mail,
  Building2, Search, Briefcase, Globe, Target, ShieldCheck,
} from 'lucide-react';

interface PublicStats {
  total_joined: number;
  joined_this_week: number;
  total_admitted: number;
}

type JoinSuccess = {
  ok: true;
  already_on_list: boolean;
  email: string;
  status: 'pending' | 'approved' | 'signed_up' | string;
  queue_position: number | null;
  total_pending: number | null;
  joined_at: string | null;
};

type StatusResponse = {
  found: boolean;
  email: string;
  status: string | null;
  queue_position: number | null;
  total_pending: number | null;
  joined_at?: string | null;
  approved_at?: string | null;
};

/** Compute next Wednesday 09:00 UTC from now. */
function nextWednesday09UTC(): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 0, 0));
  const day = d.getUTCDay(); // 0=Sun .. 3=Wed
  let delta = (3 - day + 7) % 7;
  // If today is Wednesday past 09:00 UTC, push to next week
  if (delta === 0 && now.getTime() >= d.getTime()) delta = 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

function humanizeDelta(target: Date): string {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return '即将到来';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days >= 1) return `${days} 天 ${hours} 小时后`;
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours} 小时 ${minutes} 分后`;
}

export default function WaitlistClient({ initialStats }: { initialStats: PublicStats }) {
  // Form state
  const [email, setEmail] = useState('');
  const [brandOrCompany, setBrandOrCompany] = useState('');
  const [brandOfInterest, setBrandOfInterest] = useState('');
  const [role, setRole] = useState('');
  const [targetMarket, setTargetMarket] = useState<string>('');
  const [geoChallenge, setGeoChallenge] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JoinSuccess | null>(null);

  // Status checker (sidecar)
  const [statusEmail, setStatusEmail] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusResult, setStatusResult] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const nextBatch = useMemo(() => nextWednesday09UTC(), []);
  const nextBatchHuman = useMemo(() => humanizeDelta(nextBatch), [nextBatch]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const utm = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const res = await fetch('/api/waitlist/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          brand_or_company: brandOrCompany.trim(),
          brand_of_interest: brandOfInterest.trim(),
          role: role.trim() || undefined,
          target_market: targetMarket || undefined,
          geo_challenge: geoChallenge.trim() || undefined,
          source: 'waitlist_page',
          referrer_url: typeof document !== 'undefined' ? document.referrer || null : null,
          utm_source: utm?.get('utm_source') || undefined,
          utm_medium: utm?.get('utm_medium') || undefined,
          utm_campaign: utm?.get('utm_campaign') || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          setError(`提交太频繁，${data.retryAfterSeconds || 60} 秒后再试`);
        } else if (data.error === 'invalid_email') {
          setError('邮箱格式不正确');
        } else if (data.error === 'brand_or_company_required') {
          setError('请填写品牌/公司名');
        } else if (data.error === 'brand_of_interest_required') {
          setError('请填写你想分析的品牌');
        } else {
          setError(`提交失败：${data.error || res.statusText}`);
        }
        return;
      }
      setResult(data as JoinSuccess);
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusCheck(e: React.FormEvent) {
    e.preventDefault();
    setStatusError(null);
    setStatusResult(null);
    if (!statusEmail.trim()) return;
    setStatusLoading(true);
    try {
      const res = await fetch(`/api/waitlist/status?email=${encodeURIComponent(statusEmail.trim().toLowerCase())}`);
      const data = await res.json();
      if (!res.ok) {
        setStatusError(data.error === 'invalid_email' ? '邮箱格式不正确' : '查询失败');
        return;
      }
      setStatusResult(data as StatusResponse);
    } catch {
      setStatusError('网络错误');
    } finally {
      setStatusLoading(false);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // SUCCESS STATE
  // ────────────────────────────────────────────────────────────────
  if (result) {
    return (
      <SuccessCard result={result} nextBatch={nextBatch} nextBatchHuman={nextBatchHuman} />
    );
  }

  // ────────────────────────────────────────────────────────────────
  // FORM STATE
  // ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-12">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-3xl mx-auto"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-brand/50 bg-brand-soft text-brand text-xs tracking-[0.2em] uppercase mb-6">
          <Sparkles className="w-3 h-3" />
          受邀测试期 · Invite-only beta
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-ink leading-tight tracking-tight mb-6">
          出海品牌的生成式引擎可见度
          <br />
          <span className="bg-gradient-to-r from-brand via-garnet to-gold bg-clip-text text-transparent">
            正在被重新定义
          </span>
        </h1>
        <p className="text-base sm:text-lg text-dim max-w-2xl mx-auto leading-relaxed">
          MemeCMO.ai —— 面向东南亚的多智能体 GEO 平台。
          我们正在邀请第一批同行者，专注出海品牌在 ChatGPT、Perplexity、Gemini、Claude 答案里的可见度、引用份额与情感倾向。
        </p>

        {/* Public counter */}
        <div className="mt-8 inline-flex items-center gap-4 px-5 py-3 rounded-xl border border-edge bg-surface backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm text-dim">
            <span className="text-brand font-mono font-bold tabular-nums">
              {initialStats.total_joined.toLocaleString()}
            </span>
            <span className="text-faint">brands joined</span>
          </div>
          <span className="text-faint">·</span>
          <div className="flex items-center gap-2 text-sm text-dim">
            <span className="text-gold font-mono font-bold tabular-nums">
              {initialStats.joined_this_week.toLocaleString()}
            </span>
            <span className="text-faint">本周新增</span>
          </div>
        </div>
      </motion.div>

      {/* Form Card */}
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15 }}
        className="max-w-2xl mx-auto bg-canvas/80 backdrop-blur-xl border border-edge rounded-2xl p-6 sm:p-8 space-y-5 shadow-2xl"
      >
        <Field
          label="邮箱"
          required
          icon={<Mail className="w-4 h-4" />}
          input={
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              disabled={submitting}
            />
          }
        />

        <Field
          label="品牌 / 公司"
          required
          icon={<Building2 className="w-4 h-4" />}
          input={
            <input
              type="text"
              required
              placeholder="你所在的公司或品牌名"
              value={brandOrCompany}
              onChange={(e) => setBrandOrCompany(e.target.value)}
              className="form-input"
              disabled={submitting}
              maxLength={200}
            />
          }
        />

        <Field
          label="你最想分析的品牌"
          required
          icon={<Search className="w-4 h-4" />}
          hint="可以是自己公司、竞品、或正在调研的目标"
          input={
            <input
              type="text"
              required
              placeholder="比如 Apple、Shein、或你自家品牌"
              value={brandOfInterest}
              onChange={(e) => setBrandOfInterest(e.target.value)}
              className="form-input"
              disabled={submitting}
              maxLength={200}
            />
          }
        />

        {/* Optional fields divider */}
        <div className="pt-2">
          <div className="flex items-center gap-3 text-[10px] tracking-[0.25em] uppercase text-faint my-3">
            <div className="h-px flex-1 bg-white/5" />
            以下选填 · 完整填写有助于优先审核
            <div className="h-px flex-1 bg-white/5" />
          </div>
        </div>

        <Field
          label="你的角色"
          icon={<Briefcase className="w-4 h-4" />}
          input={
            <input
              type="text"
              placeholder="例如：品牌负责人 / 增长负责人 / GEO 顾问"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="form-input"
              disabled={submitting}
              maxLength={100}
            />
          }
        />

        <Field
          label="目标市场"
          icon={<Globe className="w-4 h-4" />}
          input={
            <select
              value={targetMarket}
              onChange={(e) => setTargetMarket(e.target.value)}
              className="form-input"
              disabled={submitting}
            >
              <option value="">— 选择 —</option>
              <option value="overseas">出海（东南亚 / 北美 / 欧洲）</option>
              <option value="china">国内</option>
              <option value="global">全球</option>
              <option value="other">其他</option>
            </select>
          }
        />

        <Field
          label="你目前最大的 GEO 挑战"
          icon={<Target className="w-4 h-4" />}
          hint="一两句话即可。30 字以上会自动加权审核优先级。"
          input={
            <textarea
              rows={3}
              placeholder="例如：品牌在 ChatGPT 推荐里完全不出现，但 SEO 排名很好；不确定到底是 LLM 训练语料的问题还是答案结构的问题。"
              value={geoChallenge}
              onChange={(e) => setGeoChallenge(e.target.value)}
              className="form-input resize-none"
              disabled={submitting}
              maxLength={1000}
            />
          }
        />

        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2 px-3 py-2 rounded-lg bg-garnet/10 border border-red-500/30 text-red-300 text-sm"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={submitting || !email || !brandOrCompany || !brandOfInterest}
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-sage to-gold text-[var(--canvas)] font-semibold text-sm tracking-wide hover:from-sage hover:to-gold disabled:from-gray-600 disabled:to-gray-700 disabled:text-dim disabled:cursor-not-allowed transition-all shadow-lg shadow-sage/20 disabled:shadow-none"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> 提交中…
            </>
          ) : (
            <>
              加入名单 <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        <p className="text-[11px] text-faint text-center leading-relaxed">
          下次审核：周三 09:00 UTC（{nextBatchHuman}）。等候期间会发送脱敏样本报告与行业观察邮件。
        </p>
      </motion.form>

      {/* Status checker sidecar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.4 }}
        className="max-w-2xl mx-auto"
      >
        <details className="group">
          <summary className="flex items-center justify-center gap-2 text-sm text-dim hover:text-ink cursor-pointer transition select-none list-none">
            <ShieldCheck className="w-4 h-4" />
            已经加入过？查看排队进度
            <span className="text-faint group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <form onSubmit={handleStatusCheck} className="mt-4 flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
            <input
              type="email"
              placeholder="你入列时填的邮箱"
              value={statusEmail}
              onChange={(e) => setStatusEmail(e.target.value)}
              className="form-input flex-1"
              disabled={statusLoading}
            />
            <button
              type="submit"
              disabled={statusLoading || !statusEmail}
              className="px-4 py-2.5 rounded-lg border border-edge-strong text-ink hover:bg-white/5 disabled:opacity-40 text-sm transition"
            >
              {statusLoading ? '查询中…' : '查询'}
            </button>
          </form>
          {statusError && (
            <p className="text-xs text-red-300 text-center mt-2">{statusError}</p>
          )}
          {statusResult && (
            <div className="mt-3 max-w-md mx-auto text-sm">
              {statusResult.found ? (
                <div className="px-4 py-3 rounded-lg border border-brand/50 bg-brand text-sage">
                  <div className="flex items-center justify-between">
                    <span>状态：<b className="text-brand">{translateStatus(statusResult.status)}</b></span>
                    {statusResult.status === 'pending' && (
                      <span className="font-mono">
                        #{statusResult.queue_position} / {statusResult.total_pending}
                      </span>
                    )}
                  </div>
                  {statusResult.status === 'pending' && (
                    <p className="text-xs text-dim mt-1">
                      下次审核：周三 09:00 UTC（{nextBatchHuman}）
                    </p>
                  )}
                  {statusResult.status === 'approved' && (
                    <p className="text-xs text-dim mt-1">
                      你的访问邀请已发送到邮箱，检查收件箱。
                    </p>
                  )}
                </div>
              ) : (
                <div className="px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-200 text-xs">
                  这个邮箱没在名单上。上面填写表单加入。
                </div>
              )}
            </div>
          )}
        </details>
      </motion.div>

      <style jsx>{`
        :global(.form-input) {
          width: 100%;
          padding: 0.625rem 0.875rem;
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 0.625rem;
          color: #f8fafc;
          font-size: 0.875rem;
          transition: all 0.15s;
          outline: none;
        }
        :global(.form-input::placeholder) {
          color: #64748b;
        }
        :global(.form-input:focus) {
          border-color: rgba(16, 185, 129, 0.5);
          background: rgba(15, 23, 42, 0.7);
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
        }
        :global(.form-input:disabled) {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  icon,
  hint,
  input,
}: {
  label: string;
  required?: boolean;
  icon: React.ReactNode;
  hint?: string;
  input: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center gap-1.5 text-xs text-dim mb-1.5">
        <span className="text-faint">{icon}</span>
        <span>{label}</span>
        {required && <span className="text-brand">*</span>}
      </div>
      {input}
      {hint && <p className="text-[11px] text-faint mt-1 leading-relaxed">{hint}</p>}
    </label>
  );
}

function translateStatus(s: string | null): string {
  switch (s) {
    case 'pending':
      return '排队中';
    case 'approved':
      return '已批准';
    case 'rejected':
      return '未通过';
    case 'expired':
      return '已过期';
    case 'signed_up':
      return '已注册';
    default:
      return s ?? '未知';
  }
}

function SuccessCard({
  result,
  nextBatch,
  nextBatchHuman,
}: {
  result: JoinSuccess;
  nextBatch: Date;
  nextBatchHuman: string;
}) {
  const isApproved = result.status === 'approved' || result.status === 'signed_up';
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="max-w-2xl mx-auto"
    >
      <div className="bg-canvas/80 backdrop-blur-xl border border-brand/50 rounded-2xl p-8 sm:p-10 text-center shadow-2xl shadow-sage/10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand border border-brand/50 mb-6">
          <Check className="w-7 h-7 text-brand" />
        </div>

        {isApproved ? (
          <>
            <h2 className="text-3xl font-bold text-ink mb-3">
              你已通过审核 🎉
            </h2>
            <p className="text-dim text-base leading-relaxed mb-6">
              邀请邮件已发送到 <span className="text-brand font-mono">{result.email}</span>，
              <br />
              点开始用 → 你的首份 GEO 报告就在 60 秒后。
            </p>
          </>
        ) : (
          <>
            {result.already_on_list ? (
              <h2 className="text-3xl font-bold text-ink mb-3">
                你已经在名单上
              </h2>
            ) : (
              <h2 className="text-3xl font-bold text-ink mb-3">
                你已加入名单
              </h2>
            )}

            {/* Queue position */}
            <div className="my-8">
              <div className="text-[11px] tracking-[0.3em] uppercase text-faint mb-2">
                你的位置
              </div>
              <div className="text-7xl sm:text-8xl font-bold bg-gradient-to-br from-brand via-garnet to-gold bg-clip-text text-transparent font-mono tabular-nums">
                #{result.queue_position?.toLocaleString() ?? '—'}
              </div>
              {result.total_pending !== null && (
                <div className="text-sm text-dim mt-2">
                  名单当前 {result.total_pending.toLocaleString()} 人排队
                </div>
              )}
            </div>

            <div className="px-5 py-4 rounded-xl bg-surface border border-edge mb-6 text-left">
              <div className="flex items-center justify-between mb-2 text-sm">
                <span className="text-dim">下次批量审核</span>
                <span className="font-mono text-brand">
                  {nextBatch.toUTCString().replace(' GMT', ' UTC')}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-dim">距下次审核</span>
                <span className="text-ink">{nextBatchHuman}</span>
              </div>
            </div>

            <p className="text-sm text-dim leading-relaxed mb-2">
              等候期间我们会发送
              <span className="text-ink mx-1">脱敏样本报告</span>
              和
              <span className="text-ink mx-1">行业观察</span>
              到 <span className="text-brand font-mono break-all">{result.email}</span>。
            </p>
            <p className="text-xs text-faint">
              不要忘了把我们的发件人加入白名单，避免进垃圾箱。
            </p>
          </>
        )}
      </div>

      <div className="text-center mt-6 text-xs text-faint">
        想了解我们在做什么？回看
        <a href="/" className="text-dim hover:text-brand transition underline underline-offset-4 mx-1">
          首页介绍
        </a>
        或
        <a href="/sea-command-center" className="text-dim hover:text-brand transition underline underline-offset-4 mx-1">
          SEA 指挥中心
        </a>
        的工作机制。
      </div>
    </motion.div>
  );
}
