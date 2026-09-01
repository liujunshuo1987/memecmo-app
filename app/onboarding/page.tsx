'use client';

// Self-serve trial funnel, step 2 of the journey (spec 2026-09 §3.1):
// brand form → uncharged preview scan with a live progress theater → workspace.
// The theater is the conversion moment — the visitor watches real engines
// answer real questions about their brand.

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import MemeCMOLogo from '@/components/memecmo-logo';
import { useLanguage } from '@/contexts/language-context';

const MARKETS: { value: string; label: string; lang: string }[] = [
  { value: 'Vietnam', label: 'Việt Nam · Vietnam', lang: 'vi' },
  { value: 'Thailand', label: 'ไทย · Thailand', lang: 'th' },
  { value: 'Indonesia', label: 'Indonesia', lang: 'id' },
  { value: 'Malaysia', label: 'Malaysia', lang: 'ms' },
  { value: 'Singapore', label: 'Singapore', lang: 'en' },
  { value: 'Philippines', label: 'Philippines', lang: 'en' },
  { value: 'California, US', label: 'United States · California', lang: 'en' },
  { value: 'New York, US', label: 'United States · New York', lang: 'en' },
  { value: 'Texas, US', label: 'United States · Texas', lang: 'en' },
];

const COPY: Record<string, Record<string, string>> = {
  en: {
    title: 'See your brand through AI’s eyes',
    sub: 'A free preview scan asks ChatGPT and Google AI Overview 8 real buyer questions about your market — and shows where your brand stands. About 3 minutes. No credit card.',
    brandName: 'Brand name',
    brandUrl: 'Website',
    market: 'Target market',
    start: 'Start free preview',
    starting: 'Setting up your workspace…',
    running: 'Scanning',
    runningSub: 'Real engines, real questions — this is live, not a demo.',
    elapsed: 'elapsed',
    failed: 'The preview hit a snag. Our team has been notified — or reach us at samchan@memecmo.ai.',
    domainUsed: 'This brand already has a preview. Log in to the original account, or contact us at samchan@memecmo.ai.',
    rateLimited: 'Too many attempts from this network today — please try again tomorrow.',
    done: 'Preview ready — opening your workspace…',
  },
  'zh-CN': {
    title: '看看 AI 眼中的你的品牌',
    sub: '免费预览扫描会用 8 个真实买家问题,探测 ChatGPT 与 Google AI Overview 如何谈论你的市场——以及你的品牌站在哪。约 3 分钟,无需信用卡。',
    brandName: '品牌名称',
    brandUrl: '官网',
    market: '目标市场',
    start: '开始免费预览',
    starting: '正在创建你的工作区…',
    running: '扫描中',
    runningSub: '真实引擎、真实提问——这是实时探测,不是演示。',
    elapsed: '已用时',
    failed: '预览出了点问题,团队已收到通知——也可联系 samchan@memecmo.ai。',
    domainUsed: '该品牌已被预览过。请登录原账号,或联系 samchan@memecmo.ai。',
    rateLimited: '今日该网络尝试次数已达上限,请明天再试。',
    done: '预览就绪——正在打开你的工作区…',
  },
  'zh-TW': {
    title: '看看 AI 眼中的你的品牌',
    sub: '免費預覽掃描會用 8 個真實買家問題,探測 ChatGPT 與 Google AI Overview 如何談論你的市場——以及你的品牌站在哪。約 3 分鐘,無需信用卡。',
    brandName: '品牌名稱',
    brandUrl: '官網',
    market: '目標市場',
    start: '開始免費預覽',
    starting: '正在建立你的工作區…',
    running: '掃描中',
    runningSub: '真實引擎、真實提問——這是即時探測,不是演示。',
    elapsed: '已用時',
    failed: '預覽出了點問題,團隊已收到通知——也可聯絡 samchan@memecmo.ai。',
    domainUsed: '該品牌已被預覽過。請登入原帳號,或聯絡 samchan@memecmo.ai。',
    rateLimited: '今日該網路嘗試次數已達上限,請明天再試。',
    done: '預覽就緒——正在打開你的工作區…',
  },
};

interface FeedLine {
  id: number;
  text: string;
  milestone: boolean;
}

function OnboardingContent() {
  const router = useRouter();
  const { language } = useLanguage();
  const c = COPY[language] || COPY.en;

  const [phase, setPhase] = useState<'form' | 'starting' | 'running' | 'done' | 'error'>('form');
  const [brandName, setBrandName] = useState('');
  const [brandUrl, setBrandUrl] = useState('');
  const [market, setMarket] = useState('Vietnam');
  const [error, setError] = useState('');
  const [pct, setPct] = useState(0);
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const target = useRef<{ orgSlug: string; projectSlug: string; runId: string } | null>(null);
  const since = useRef('1970-01-01T00:00:00Z');
  const feedId = useRef(0);

  // Signed-out visitors go sign up first and come straight back.
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/signup?next=/onboarding');
    });
  }, [router]);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhase('starting');
    setError('');
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brandName,
        brandUrl,
        market,
        language: MARKETS.find((m) => m.value === market)?.lang,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error === 'already_member') { router.replace('/dashboard'); return; }
      setPhase('form');
      setError(data.error === 'domain_previewed' ? c.domainUsed : data.error === 'rate_limited' ? c.rateLimited : (data.message || data.error || 'Error'));
      return;
    }
    target.current = data;
    setPhase('running');
  };

  // Progress theater: poll the run, stream milestones/logs into the feed.
  useEffect(() => {
    if (phase !== 'running' || !target.current) return;
    const t0 = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/workspace/agent-runs/${target.current!.runId}?since=${encodeURIComponent(since.current)}`);
        if (!res.ok) return;
        const d = await res.json();
        if (typeof d.run?.progress_pct === 'number') setPct(d.run.progress_pct);
        const events = d.events || [];
        if (events.length) {
          since.current = events[events.length - 1].ts;
          const lines: FeedLine[] = [];
          for (const ev of events) {
            const text = ev.payload?.label || ev.payload?.text;
            if (text) lines.push({ id: ++feedId.current, text: String(text), milestone: ev.event_type === 'milestone' });
          }
          if (lines.length) setFeed((f) => [...f, ...lines].slice(-7));
        }
        if (d.run?.status === 'completed') {
          setPhase('done');
          setTimeout(() => router.push(`/workspace/${target.current!.orgSlug}/${target.current!.projectSlug}`), 1200);
        } else if (d.run?.status === 'failed') {
          setPhase('error');
        }
      } catch { /* transient poll error — next tick retries */ }
    }, 3500);
    return () => { clearInterval(poll); clearInterval(tick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div className="theme-day min-h-screen bg-canvas flex items-center justify-center px-4 py-12">
      <a href="https://memecmo.ai" className="fixed top-5 left-6 z-20 text-[13px] text-faint hover:text-ink transition">← memecmo.ai</a>
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <span className="inline-flex justify-center mb-5"><MemeCMOLogo height={34} showWordmark /></span>
          <h1 className="text-2xl font-bold text-ink mb-2">{c.title}</h1>
          <p className="text-dim text-sm leading-relaxed">{c.sub}</p>
        </div>

        <div className="bg-surface border border-edge rounded-2xl p-8">
          {(phase === 'form' || phase === 'starting') && (
            <form onSubmit={start} className="space-y-4">
              {error && <div className="p-3 bg-garnet/10 border border-garnet/40 rounded-lg text-garnet text-sm">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-dim mb-1.5">{c.brandName}</label>
                <input value={brandName} onChange={(e) => setBrandName(e.target.value)} required placeholder="Highlands Coffee"
                  className="w-full h-10 px-3 rounded-md bg-canvas border border-edge text-ink placeholder:text-faint focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/30 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dim mb-1.5">{c.brandUrl}</label>
                <input value={brandUrl} onChange={(e) => setBrandUrl(e.target.value)} required placeholder="yourbrand.com"
                  className="w-full h-10 px-3 rounded-md bg-canvas border border-edge text-ink placeholder:text-faint focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/30 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dim mb-1.5">{c.market}</label>
                <select value={market} onChange={(e) => setMarket(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-canvas border border-edge text-ink focus:border-brand/50 focus:outline-none text-sm">
                  {MARKETS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <button type="submit" disabled={phase === 'starting'}
                className="w-full h-11 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:brightness-110 disabled:opacity-60 transition">
                {phase === 'starting' ? c.starting : c.start}
              </button>
              <p className="text-[11px] text-faint text-center">ChatGPT + Google AI Overview · 8 questions · ~3 min</p>
            </form>
          )}

          {(phase === 'running' || phase === 'done') && (
            <div className="space-y-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-ink">{phase === 'done' ? c.done : `${c.running} · ${brandName}`}</span>
                <span className="text-[11px] text-faint tabular-nums">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} {c.elapsed}</span>
              </div>
              <div className="w-full h-2 bg-raised rounded-full overflow-hidden">
                <div className="h-full bg-brand rounded-full transition-all duration-700" style={{ width: `${phase === 'done' ? 100 : Math.max(pct, 3)}%` }} />
              </div>
              <div className="space-y-2 min-h-[120px]">
                {feed.map((l) => (
                  <div key={l.id} className={`text-[12px] leading-relaxed ${l.milestone ? 'text-ink font-semibold' : 'text-dim'}`}>
                    {l.milestone ? '● ' : '· '}{l.text}
                  </div>
                ))}
                {feed.length === 0 && <div className="text-[12px] text-faint">{c.starting}</div>}
              </div>
              <p className="text-[11px] text-faint">{c.runningSub}</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="p-4 bg-garnet/10 border border-garnet/40 rounded-lg text-garnet text-sm leading-relaxed">{c.failed}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  );
}
