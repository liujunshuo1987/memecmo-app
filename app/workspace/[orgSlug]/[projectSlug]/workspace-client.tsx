'use client';

// Manus-style two-panel workspace:
//   Left  — chat / command bar
//   Right — agent activity stream + run history
//
// v0.5 supports 3 agents: discovery | monitor | report
// Sending a chat with /discovery (or default to discovery on first message)
// spawns a run; the activity panel subscribes to its SSE stream.

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AGENTS } from '@/lib/agents/registry';
import { Icon } from '@/components/icons';
import type { AgentRun, Organization, Project, ScanPoint } from '@/lib/workspace';

interface Props {
  project: Project;
  organization: Organization;
  initialRuns: AgentRun[];
  scanHistory: ScanPoint[];
  isOperator?: boolean;
}

// Extract a trend point from a monitor / full_scan run's output (mirrors getScanHistory).
function pointFromOutput(runId: string, ts: string, output: any): ScanPoint | null {
  const sc = output?.scorecard ?? output;
  if (!sc || sc.aigvrScore == null) return null;
  const d = sc.dimensions || {};
  return {
    runId, ts,
    aigvr: sc.aigvrScore ?? null, presence: d.presence ?? null, rank: sc.brandRank ?? null,
    gaps: (sc.gaps || []).length, prominence: d.prominence ?? null, sentiment: d.sentiment ?? null,
    citation: d.citation ?? null, competitive: d.competitiveShare ?? null,
    topOfMind: sc.topOfMind?.overallRate ?? d.topOfMindRate ?? null,
  };
}

interface ActivityEvent {
  id: string;
  agent_run_id: string;
  ts: string;
  event_type: string;
  payload: Record<string, unknown>;
}

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agentId?: string;
  runId?: string;
  ts: string;
}

const COUNTRY_FLAG: Record<string, string> = {
  Vietnam: '🇻🇳',
  Thailand: '🇹🇭',
  Indonesia: '🇮🇩',
  Philippines: '🇵🇭',
  Singapore: '🇸🇬',
  Malaysia: '🇲🇾',
};

// ── UI i18n (chrome only — static, instant) ──────────────────────────────────
// Keyed by the English source string. Module-level UI_LANG is set on each render
// of WorkspaceClient so every nested renderer can call t() without prop drilling.
type UiLang = 'en' | 'zh' | 'vi';
let UI_LANG: UiLang = 'en';
// Client-facing name of the composite score. Default is the friendly
// "AI Mindset Index"; orgs whose CONTRACT names the metric (FMVN → AIGVR)
// override via organizations.metadata.scoreLabel.
let SCORE_LABEL = 'AI Mindset Index';
const UI_DICT: Record<'zh' | 'vi', Record<string, string>> = {
  zh: {
    'Run full GEO scan': '运行完整 GEO 扫描', '…focus the agents': '…给智能体一个方向',
    Setup: '准备', Measure: '测量', 'Act — build AEO presence': '执行 · 建设 AEO 存在',
    ready: '就绪', run: '运行', 'running…': '运行中…', 'Re-run': '重跑', Copy: '复制', Edit: '编辑', Done: '完成',
    Result: '结果', 'Pick a deliverable on the left, or run a full GEO scan.': '从左侧选一个交付物,或运行完整 GEO 扫描。',
    'Ask about this result': '问这份结果', 'Refine with a message': '用一句话改写', 'View →': '查看 →', 'Run →': '运行 →',
    'By engine': '分引擎', 'Funnel-stage visibility': '分漏斗阶段可见度', 'Share of voice': '声量份额',
    'Sources AI engines cite · AEO targets': 'AI 引擎引用的来源 · AEO 目标', 'Key findings': '关键发现',
    Recommendations: '建议', 'Quick wins': '速赢', 'AEO checklist': 'AEO 清单', 'Homepage edits': '主页修改',
    'Citation plan': '引用计划', 'Evidence needed to qualify': '达标所需证据', 'Get mentioned in existing articles': '进入已有词条被提及',
    'Latest scan': '最近扫描', 'Presence': '出现率', 'Share of Voice': '声量份额', 'Brand rank': '品牌排名', 'High-intent gaps': '高意图缺口',
    'Cited sources': '被引来源', Deliverables: '交付物', 'Structured view': '结构化视图', Refine: '改写', Ask: '问',
    'Full Scan': '完整扫描', Profile: '品牌档案', Discovery: '发现', Monitor: '监测', Report: '报告',
    Optimize: '内容', Site: '主页', Distribute: '分发', Encyclopedia: '百科', 'Copy kit': '复制全套', 'Copy brief': '复制简报',
    'Copy page': '复制页面', 'Copy schema': '复制 schema', 'Copy plan': '复制方案', 'Copy Markdown': '复制 Markdown',
    trend: '趋势', 'vs previous scan': '对比上次扫描', 'Run another scan to track change.': '再扫一次即可追踪变化。',
    'Top-of-mind rate': '首位推荐率', 'featured / first recommendation': '被作为首选/首位推荐',
    'Top-of-mind · key prompts': '首位推荐率 · 重点 Prompt', 'key prompts monitored': '条重点 Prompt 已监测',
    Answers: '标准答案', 'Standard answer library': '标准答案库', 'the answer we want AI to give': '我们希望 AI 给出的答案',
    'Export PDF': '导出 PDF', Guide: '使用说明',
    'Position when present': '出现时位置', 'Sentiment when present': '出现时情感', 'Citation strength': '引用强度',
    'Top-of-mind': '首位推荐', key: '重点', Rank: '排名', answers: '条回答', 'queries competitors win': '竞品占优的问题',
    'By intent': '按意图',
    'Request client verification': '请客户核实', 'Awaiting client verification': '待客户确认', 'Verified by client': '客户已确认', 'Client requested changes': '客户要求修改', Send: '发送', 'Email not auto-sent — share the link:': '邮件未能自动发送——请手动分享链接:', 'High intent': '高意图', Educational: '教育型',
    'AI rarely names brands on educational questions — low presence there is normal; those prompts feed content topics.': '教育型问题里 AI 很少点名品牌——此处出现率低属正常;这些问题正是内容选题的来源。',
    'Getting started…': '正在启动…', 'Technical trace': '技术轨迹', 'This takes a few minutes — the run continues on the server, so you can leave this page and come back.': '大约需要几分钟——任务在服务器持续运行,你可以离开此页稍后回来。',
    'Phase 1/3 · Discovery': '阶段 1/3 · 构建问题集', 'Phase 2/3 · Monitor': '阶段 2/3 · 向 AI 引擎提问并打分', 'Phase 3/3 · Report': '阶段 3/3 · 撰写报告',
    'Monitor started': '监测启动', 'Sampling prompt set': '选取问题集', 'Identifying competitors': '识别竞品', 'Scoring prominence & sentiment': '逐条评分(位置与情感)', 'Computing AIGVR scorecard': '汇总评分卡', 'AIGVR scorecard ready': '评分卡就绪',
    'Report started': '报告启动', 'Composing report': '撰写报告', 'Report ready': '报告就绪', 'Discovery complete': '问题集完成',
    'Standard answers started': '标准答案启动', 'Generating answers': '生成答案', 'Standard answer library ready': '答案库就绪',
    'Brand profile started': '品牌画像启动', 'Profile compiled': '画像完成', 'Brand profile ready': '画像就绪',
    'Optimize started': '内容优化启动', 'Assembling page': '组装页面', 'Content draft ready': '内容稿就绪',
    'Site audit started': '官网体检启动', 'Compiling fixes': '汇总改造项', 'Site upgrade ready': '改造方案就绪',
    'Distribution started': '投放启动', 'Assembling kit': '组装投放包', 'Distribution kit ready': '投放包就绪',
    'Encyclopedia assessment started': '百科评估启动', 'Assembling entry + path': '组装词条与路径', 'Encyclopedia plan ready': '百科方案就绪', 'Persisting asset': '保存交付物',

  },
  vi: {
    'Run full GEO scan': 'Chạy quét GEO đầy đủ', '…focus the agents': '…định hướng cho agent',
    Setup: 'Chuẩn bị', Measure: 'Đo lường', 'Act — build AEO presence': 'Hành động · xây dựng AEO',
    ready: 'sẵn sàng', run: 'chạy', 'running…': 'đang chạy…', 'Re-run': 'Chạy lại', Copy: 'Sao chép', Edit: 'Sửa', Done: 'Xong',
    Result: 'Kết quả', 'Pick a deliverable on the left, or run a full GEO scan.': 'Chọn một mục bên trái, hoặc chạy quét GEO đầy đủ.',
    'Ask about this result': 'Hỏi về kết quả này', 'Refine with a message': 'Tinh chỉnh bằng một câu',
    'By engine': 'Theo engine', 'Funnel-stage visibility': 'Hiển thị theo giai đoạn phễu', 'Share of voice': 'Thị phần tiếng nói',
    'Key findings': 'Phát hiện chính', Recommendations: 'Khuyến nghị', 'Quick wins': 'Việc cần làm', Deliverables: 'Sản phẩm',
    'Full Scan': 'Quét đầy đủ', Profile: 'Hồ sơ', Discovery: 'Khám phá', Monitor: 'Giám sát', Report: 'Báo cáo',
    Optimize: 'Nội dung', Site: 'Trang chủ', Distribute: 'Phân phối', Encyclopedia: 'Bách khoa',
    'Top-of-mind rate': 'Tỷ lệ đề xuất đầu tiên', 'featured / first recommendation': 'được đề xuất đầu tiên',
    'Top-of-mind · key prompts': 'Đề xuất đầu tiên · prompt trọng điểm', 'key prompts monitored': 'prompt trọng điểm được theo dõi',
    Answers: 'Câu trả lời chuẩn', 'Standard answer library': 'Thư viện câu trả lời chuẩn', 'the answer we want AI to give': 'câu trả lời ta muốn AI đưa ra',
    'Export PDF': 'Xuất PDF', Guide: 'Hướng dẫn',
    'Position when present': 'Vị trí khi xuất hiện', 'Sentiment when present': 'Cảm xúc khi xuất hiện', 'Citation strength': 'Sức mạnh trích dẫn',
    'Top-of-mind': 'Đề xuất đầu tiên', key: 'trọng điểm', Rank: 'Hạng', answers: 'câu trả lời', 'queries competitors win': 'câu hỏi đối thủ thắng',
    'By intent': 'Theo ý định',
    'Request client verification': 'Gửi khách xác nhận', 'Awaiting client verification': 'Chờ khách xác nhận', 'Verified by client': 'Khách đã xác nhận', 'Client requested changes': 'Khách yêu cầu chỉnh sửa', Send: 'Gửi', 'Email not auto-sent — share the link:': 'Email chưa gửi tự động — chia sẻ link:', 'High intent': 'Ý định cao', Educational: 'Giáo dục',
    'AI rarely names brands on educational questions — low presence there is normal; those prompts feed content topics.': 'AI hiếm khi nêu tên thương hiệu ở câu hỏi giáo dục — hiện diện thấp là bình thường; các câu này là nguồn chủ đề nội dung.',
    'Getting started…': 'Đang khởi động…', 'Technical trace': 'Nhật ký kỹ thuật', 'This takes a few minutes — the run continues on the server, so you can leave this page and come back.': 'Mất vài phút — tác vụ chạy trên máy chủ, bạn có thể rời trang và quay lại sau.',
    'Phase 1/3 · Discovery': 'Giai đoạn 1/3 · Xây bộ câu hỏi', 'Phase 2/3 · Monitor': 'Giai đoạn 2/3 · Hỏi các công cụ AI và chấm điểm', 'Phase 3/3 · Report': 'Giai đoạn 3/3 · Viết báo cáo',
    'Identifying competitors': 'Nhận diện đối thủ', 'Scoring prominence & sentiment': 'Chấm điểm từng câu trả lời', 'Computing AIGVR scorecard': 'Tổng hợp bảng điểm', 'AIGVR scorecard ready': 'Bảng điểm sẵn sàng',

  },
};
function t(s: string): string {
  if (UI_LANG === 'en') return s;
  return UI_DICT[UI_LANG]?.[s] ?? s;
}

// Outcome-first deliverable groups. Each item maps to an agent; cards show the
// latest completed run of that agent (view it) or offer to run it.
const DELIVERABLE_GROUPS: { label: string; items: string[] }[] = [
  { label: 'Setup', items: ['profile', 'discovery', 'answers'] },
  { label: 'Measure', items: ['monitor', 'report'] },
  { label: 'Act — build AEO presence', items: ['site', 'optimize', 'distribute', 'encyclopedia'] },
];

type LatestRun = { runId: string; summary: string | null; status: string; output: any; createdAt: string };

export default function WorkspaceClient({ project, organization, initialRuns, scanHistory, isOperator = false }: Props) {
  const [history, setHistory] = useState<ScanPoint[]>(scanHistory);
  const [runsByAgent, setRunsByAgent] = useState<Record<string, LatestRun>>(() => {
    const m: Record<string, LatestRun> = {};
    for (const r of initialRuns) {
      // initialRuns is newest-first; keep the first (latest) completed per agent.
      if (r.status === 'completed' && !m[r.agent_id]) {
        m[r.agent_id] = { runId: r.id, summary: r.summary, status: r.status, output: r.output, createdAt: r.created_at };
      }
    }
    return m;
  });
  const [intent, setIntent] = useState('');
  const [uiLang, setUiLang] = useState<UiLang>('en');
  UI_LANG = uiLang; // module-level so nested renderers can call t()
  SCORE_LABEL = ((organization.metadata as any)?.scoreLabel as string) || 'AI Mindset Index';
  const [theme, setTheme] = useState<'night' | 'day'>('night');
  useEffect(() => {
    try { setTheme(localStorage.getItem('memecmo-theme') === 'day' ? 'day' : 'night'); } catch { /* ignore */ }
    try { const l = localStorage.getItem('memecmo-uilang'); if (l === 'zh' || l === 'vi' || l === 'en') setUiLang(l); } catch { /* ignore */ }
  }, []);
  const changeUiLang = (l: UiLang) => { setUiLang(l); try { localStorage.setItem('memecmo-uilang', l); } catch { /* ignore */ } };
  const toggleTheme = () => {
    const next = theme === 'night' ? 'day' : 'night';
    setTheme(next);
    try { localStorage.setItem('memecmo-theme', next); } catch { /* ignore */ }
    const el = document.documentElement;
    el.classList.remove('theme-night', 'theme-day');
    el.classList.add('theme-' + next);
  };
  // Sandbox version stacks survive navigation within the session (keyed by runId).
  const [sandboxVersions, setSandboxVersions] = useState<Record<string, { label: string; content: string }[]>>({});
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [runStatus, setRunStatus] = useState<{
    status: string;
    progress_pct: number;
    summary: string | null;
    agentId?: string;
    output?: Record<string, any> | null;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const activityEndRef = useRef<HTMLDivElement>(null);
  // Progress must only ever move forward (raw per-phase percentages regress —
  // 56→59→58 reads as "broken" to a client watching the bar).
  const maxPctRef = useRef(0);
  const resultTopRef = useRef<HTMLDivElement>(null);
  const freshRunRef = useRef(false);

  const isTerminal = !!runStatus && ['completed', 'failed', 'canceled'].includes(runStatus.status);

  // Headline AIGVR — from the most recent monitor / full_scan run.
  const scoreRun = [runsByAgent['monitor'], runsByAgent['full_scan']]
    .filter((r) => r && r.output?.aigvrScore != null)
    .sort((a, b) => (b!.createdAt || '').localeCompare(a!.createdAt || ''))[0];
  const headlineAigvr: number | null = scoreRun?.output?.aigvrScore ?? null;

  // While running, follow the live stream to the bottom. Once terminal, stop
  // chasing the log — we converge to the deliverable instead.
  useEffect(() => {
    if (!isTerminal) activityEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activity, runStatus, isTerminal]);

  // On completion, scroll the result modules into view (deliverable-first).
  useEffect(() => {
    if (isTerminal && runStatus?.output) {
      resultTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isTerminal, runStatus?.output]);

  // PDF export: closed <details> don't print their content — open them for the
  // print pass, restore afterwards. Covers both the Export button and ⌘P.
  useEffect(() => {
    const opened: HTMLDetailsElement[] = [];
    const before = () => {
      document.querySelectorAll<HTMLDetailsElement>('main details:not([open])').forEach((d) => {
        d.open = true;
        opened.push(d);
      });
    };
    const after = () => { opened.splice(0).forEach((d) => { d.open = false; }); };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  // Poll the read-only run observer while a run is active. Execution happens
  // in Inngest (server-side, durable) — this only reads status + new events.
  useEffect(() => {
    if (!activeRunId) return;
    let cancelled = false;
    let cursor = '1970-01-01T00:00:00Z';
    const seen = new Set<string>();

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/workspace/agent-runs/${activeRunId}?since=${encodeURIComponent(cursor)}`,
          { cache: 'no-store' },
        );
        if (res.ok) {
          const data = await res.json();
          if (data.events?.length) {
            const fresh = (data.events as ActivityEvent[]).filter((e) => !seen.has(e.id));
            fresh.forEach((e) => seen.add(e.id));
            if (fresh.length) setActivity((prev) => [...prev, ...fresh]);
            cursor = data.cursor || cursor;
          }
          if (data.run) {
            setRunStatus({
              status: data.run.status,
              progress_pct: data.run.progress_pct,
              summary: data.run.summary,
              agentId: data.run.agent_id,
              output: data.run.output ?? null,
            });
          }
          if (data.terminal) {
            // A freshly-dispatched run that finished updates the deliverable hub.
            if (freshRunRef.current && data.run?.agent_id && activeRunId) {
              freshRunRef.current = false;
              setRunsByAgent((prev) => ({
                ...prev,
                [data.run.agent_id]: {
                  runId: activeRunId,
                  summary: data.run.summary,
                  status: data.run.status,
                  output: data.run.output ?? null,
                  createdAt: data.run.created_at || prev[data.run.agent_id]?.createdAt || '',
                },
              }));
              // Closed loop: a completed scan extends the AIGVR trend.
              if ((data.run.agent_id === 'monitor' || data.run.agent_id === 'full_scan') && data.run.status === 'completed') {
                const pt = pointFromOutput(activeRunId, data.run.created_at || new Date().toISOString(), data.run.output);
                if (pt) setHistory((h) => [...h, pt]);
              }
            }
            cancelled = true;
            return;
          }
        }
      } catch {
        // transient — keep polling
      }
      if (!cancelled) setTimeout(tick, 1000);
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [activeRunId]);

  // View a completed run's result (read-only). Reuses the poller, which fetches
  // its events + output and stops (terminal).
  const viewRun = (runId: string, agentId?: string) => {
    if (runId === activeRunId) return;
    freshRunRef.current = false;
    maxPctRef.current = 0;
    setActivity([]);
    setRunStatus({ status: 'loading', progress_pct: 0, summary: null, agentId, output: null });
    setActiveRunId(runId);
  };

  // Dispatch an agent (or the full-scan cascade) and watch it.
  const dispatchAgent = async (agentId: string, inputPrompt?: string) => {
    if (sending) return;
    setSending(true);
    freshRunRef.current = true;
    maxPctRef.current = 0;
    setActivity([]);
    setRunStatus({ status: 'queued', progress_pct: 0, summary: null, agentId, output: null });
    setActiveRunId(null);
    try {
      const res = await fetch('/api/workspace/agent-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, agentId, inputPrompt: inputPrompt || undefined, triggerMethod: 'chat' }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Prefer the human-readable message (e.g. quota_exceeded ships one).
        setRunStatus({ status: 'failed', progress_pct: 0, summary: data.message || data.error || res.statusText, agentId, output: null });
        setSending(false);
        return;
      }
      setActiveRunId(data.run.id);
    } catch (err) {
      setRunStatus({ status: 'failed', progress_pct: 0, summary: err instanceof Error ? err.message : String(err), agentId, output: null });
    }
    setSending(false);
  };

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden print:!h-auto print:!overflow-visible bg-canvas text-ink flex flex-col">
      {/* Top bar */}
      <header className="print-hide border-b border-edge px-6 py-3 flex items-center justify-between bg-canvas/95 backdrop-blur z-10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <a href="/dashboard" className="text-xs tracking-[0.2em] text-faint uppercase hover:text-dim">MemeCMO.ai</a>
          <span className="text-faint">/</span>
          <a href="/dashboard" className="text-xs text-dim hover:text-ink">{organization.name}</a>
          <span className="text-faint">/</span>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg leading-none">{COUNTRY_FLAG[project.target_country] || '🌐'}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{project.brand_name}</div>
              <div className="text-[10px] tracking-widest text-faint uppercase">
                {project.target_country} · {project.target_language || 'auto'}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href="/guide" className="text-[11px] px-2 py-1 rounded-md border border-edge text-dim hover:text-ink transition whitespace-nowrap">
            {t('Guide')}
          </a>
          <button onClick={toggleTheme} aria-label="toggle theme" className="p-1.5 rounded-md border border-edge text-dim hover:text-ink transition">
            <Icon name={theme === 'night' ? 'sun' : 'moon'} size={15} />
          </button>
          <div className="flex items-center rounded-md border border-edge overflow-hidden text-[11px]">
            {([['en', 'EN'], ['zh', '中文'], ['vi', 'VN']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => changeUiLang(v)}
                className={`px-2 py-1 transition ${uiLang === v ? 'bg-brand text-on-brand' : 'text-dim hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {headlineAigvr != null && (
            <div className="text-right leading-none">
              <div className={`text-lg font-semibold ${headlineAigvr >= 67 ? 'text-sage' : headlineAigvr >= 34 ? 'text-gold' : 'text-garnet'}`}>{headlineAigvr}</div>
              <div className="text-[9px] text-faint uppercase tracking-wider">{SCORE_LABEL}</div>
            </div>
          )}
          <span
            className={`text-[10px] px-2 py-1 rounded-full uppercase tracking-wider ${
              project.status === 'active'
                ? 'bg-sage/15 text-sage'
                : 'bg-gold/15 text-gold'
            }`}
          >
            {project.status}
          </span>
        </div>
      </header>

      {/* Three-zone shell: nav rail | stage | context */}
      <div className="wz-shell flex-1 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_300px] min-h-0">
        {/* LEFT — deliverables nav */}
        <aside className="lg:border-r border-edge lg:overflow-y-auto px-4 py-4 space-y-4 lg:min-h-0">
          <div className="space-y-2">
            <button
              onClick={() => dispatchAgent('full_scan')}
              disabled={sending}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand text-on-brand hover:brightness-110 disabled:bg-raised disabled:text-faint text-sm font-medium transition"
            >
              <Icon name="full_scan" size={16} /> {t('Run full GEO scan')}
            </button>
            <input
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && intent.trim()) { e.preventDefault(); dispatchAgent('full_scan', intent.trim()); setIntent(''); } }}
              placeholder={t('…focus the agents')}
              disabled={sending}
              className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-blue-400/50"
            />
          </div>
          {DELIVERABLE_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="text-[10px] uppercase tracking-widest text-faint mb-1.5">{t(group.label)}</div>
              <div className="space-y-1">
                {group.items.map((aid) => (
                  <NavItem
                    key={aid}
                    agentId={aid}
                    run={runsByAgent[aid]}
                    running={sending && runStatus?.agentId === aid && !isTerminal}
                    isViewing={(!!runsByAgent[aid] && runsByAgent[aid].runId === activeRunId) || (runStatus?.agentId === aid && !runsByAgent[aid])}
                    onView={viewRun}
                    onRun={dispatchAgent}
                    disabled={sending}
                  />
                ))}
              </div>
            </div>
          ))}
        </aside>

        {/* CENTER — stage */}
        <main ref={resultTopRef} className="lg:overflow-y-auto px-6 py-5 lg:min-h-0 min-w-0">
          {!runStatus ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-faint gap-2 py-16">
              <div className="text-brand"><Icon name="full_scan" size={32} /></div>
              <div className="text-sm text-dim">{t('Pick a deliverable on the left, or run a full GEO scan.')}</div>
              <div className="text-xs text-faint max-w-sm">Full Scan runs Discovery → Monitor → Report; then build AEO presence with Site / Content / Distribute / Encyclopedia.</div>
            </div>
          ) : (() => {
            // Forward-only progress for display.
            const displayPct = Math.max(maxPctRef.current, runStatus.progress_pct ?? 0);
            maxPctRef.current = displayPct;
            return (
            <div className="space-y-4">
              {/* Branded header — appears only on the exported PDF */}
              <div className="print-only border-b-2 pb-3 mb-4" style={{ borderColor: 'var(--brand)' }}>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs tracking-[0.25em] uppercase text-dim">MemeCMO · GEO</span>
                  <span className="text-xs text-faint">{new Date().toISOString().slice(0, 10)}</span>
                </div>
                <div className="text-xl font-semibold mt-1">{AGENTS[runStatus.agentId ?? '']?.displayName ?? 'Deliverable'}</div>
                <div className="text-sm text-dim mt-0.5">{project.brand_name} · {project.target_country}</div>
              </div>
              <div className="print-hide flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-2">
                    <span className="text-brand"><Icon name={runStatus.agentId ?? ''} size={16} /></span>
                    {AGENTS[runStatus.agentId ?? '']?.displayName ?? 'Agent run'}
                  </div>
                  <div className="text-[11px] text-faint">{runStatus.status} · {displayPct}%</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {isTerminal && runStatus.output && (
                    <button
                      onClick={() => window.print()}
                      className="text-[11px] px-2.5 py-1 rounded border border-edge text-dim hover:border-brand/50 hover:text-brand transition"
                    >
                      ⤓ {t('Export PDF')}
                    </button>
                  )}
                  {isTerminal && runStatus.agentId && (
                    <button
                      onClick={() => dispatchAgent(runStatus.agentId!)}
                      disabled={sending}
                      className="text-[11px] px-2.5 py-1 rounded border border-edge text-dim hover:border-brand/50 hover:text-brand disabled:opacity-40 transition"
                    >
                      ↻ {t('Re-run')}
                    </button>
                  )}
                  <div className="w-24 h-1.5 bg-raised rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-700 ${runStatus.status === 'failed' ? 'bg-garnet' : 'bg-sage'}`} style={{ width: `${displayPct}%` }} />
                  </div>
                </div>
              </div>

              {isTerminal && runStatus.output ? (
                <div className="space-y-4">
                  {runStatus.summary && (
                    <div className="p-3 rounded border border-sage/35 bg-sage/10 text-sm text-sage leading-relaxed">{runStatus.summary}</div>
                  )}
                  {uiLang === 'zh' && (
                    <TranslatedView agentId={runStatus.agentId} output={runStatus.output} summary={runStatus.summary} to="zh" />
                  )}
                  <RunResult
                    agentId={runStatus.agentId}
                    output={runStatus.output}
                    projectId={project.id}
                    runId={activeRunId ?? undefined}
                    versions={activeRunId ? sandboxVersions[activeRunId] : undefined}
                    onVersions={(v) => { if (activeRunId) setSandboxVersions((m) => ({ ...m, [activeRunId]: v })); }}
                    onDispatch={dispatchAgent}
                  />
                  <details className="print-hide rounded border border-edge bg-surface">
                    <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-widest text-faint select-none hover:text-dim">Process log · {activity.length} steps</summary>
                    <div className="px-3 pb-3 font-mono text-xs space-y-2 border-t border-edge pt-2">
                      {activity.map((ev) => (<ActivityRow key={ev.id} ev={ev} />))}
                    </div>
                  </details>
                </div>
              ) : isTerminal && runStatus.status === 'failed' ? (
                <div className="text-sm text-garnet">{runStatus.summary || 'Run failed.'}</div>
              ) : (
                <LiveProgress
                  activity={activity}
                  agentId={runStatus.agentId}
                  isOperator={isOperator}
                  endRef={activityEndRef}
                />
              )}
            </div>
            );
          })()}
        </main>

        {/* RIGHT — at-a-glance context */}
        <aside className="hidden lg:block lg:border-l border-edge lg:overflow-y-auto px-4 py-4 space-y-4 lg:min-h-0">
          <TrendPanel history={history} />
          <ContextPanel headlineAigvr={headlineAigvr} scoreRun={scoreRun} runsByAgent={runsByAgent} totalAgents={DELIVERABLE_GROUPS.reduce((n, g) => n + g.items.length, 0)} />
        </aside>
      </div>
    </div>
  );
}

function NavItem({
  agentId, run, running, isViewing, onView, onRun, disabled,
}: {
  agentId: string;
  run?: LatestRun;
  running: boolean;
  isViewing: boolean;
  onView: (runId: string, agentId: string) => void;
  onRun: (agentId: string) => void;
  disabled: boolean;
}) {
  const a = AGENTS[agentId];
  const ready = !!run && run.status === 'completed';
  return (
    <button
      onClick={() => (ready ? onView(run!.runId, agentId) : onRun(agentId))}
      disabled={disabled && !ready}
      title={a?.description}
      className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md border transition disabled:opacity-50 ${
        isViewing ? 'bg-sage/12 border-sage/40' : 'border-transparent hover:bg-raised'
      }`}
    >
      <span className="shrink-0 text-brand"><Icon name={agentId} size={17} /></span>
      <span className="text-[13px] text-ink truncate flex-1">{t(a?.shortName ?? agentId)}</span>
      {running ? (
        <span className="text-[10px] text-brand shrink-0">…</span>
      ) : ready ? (
        <span className="w-1.5 h-1.5 rounded-full bg-sage inline-block shrink-0" title="ready" />
      ) : (
        <span className="text-[10px] text-faint shrink-0">{t('run')}</span>
      )}
    </button>
  );
}

function TranslatedView({ agentId, output, summary, to }: { agentId?: string; output: any; summary: string | null; to: 'zh' | 'en' }) {
  const text = resultToText(agentId, output, summary);
  const [state, setState] = useState<{ loading: boolean; text: string; err: string | null }>({ loading: false, text: '', err: null });
  useEffect(() => {
    if (!text.trim()) { setState({ loading: false, text: '', err: 'No translatable text in this result.' }); return; }
    let cancelled = false;
    setState({ loading: true, text: '', err: null });
    fetch('/api/workspace/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, to }) })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setState({ loading: false, text: d.translated || '', err: d.error || null }); })
      .catch((e) => { if (!cancelled) setState({ loading: false, text: '', err: String(e) }); });
    return () => { cancelled = true; };
  }, [text, to]);
  return (
    <div className="rounded-lg border border-brand/40 bg-blue-500/[0.06] p-3">
      <div className="text-[10px] uppercase tracking-widest text-brand mb-1.5">
        {to === 'zh' ? '中文译文' : 'English translation'} · 审阅用,非交付原文
      </div>
      {state.loading ? (
        <div className="text-[12px] text-dim">翻译中…</div>
      ) : state.err ? (
        <div className="text-[12px] text-gold">{state.err}</div>
      ) : (
        <div className="text-[13px] text-ink leading-relaxed whitespace-pre-wrap max-h-[50vh] overflow-y-auto">{state.text}</div>
      )}
    </div>
  );
}

function ContextMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-faint">{t(label)}</span>
      <span className="text-ink font-medium">{value}</span>
    </div>
  );
}

function TrendPanel({ history }: { history: ScanPoint[] }) {
  if (!history.length) return null;
  const last = history[history.length - 1];
  const prev = history.length >= 2 ? history[history.length - 2] : null;
  const dA = prev && last.aigvr != null && prev.aigvr != null ? last.aigvr - prev.aigvr : null;
  const dP = prev && last.presence != null && prev.presence != null ? last.presence - prev.presence : null;
  const dT = prev && last.topOfMind != null && prev.topOfMind != null ? last.topOfMind - prev.topOfMind : null;
  const dG = prev ? last.gaps - prev.gaps : null;

  // AIGVR sparkline
  const vals = history.map((p) => p.aigvr ?? 0);
  const W = 244, H = 44, pad = 5;
  const min = Math.min(...vals), max = Math.max(...vals), range = Math.max(1, max - min);
  const xy = vals.map((v, i) => {
    const x = vals.length === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (vals.length - 1);
    const y = H - pad - ((v - min) / range) * (H - 2 * pad);
    return [x, y] as const;
  });
  const dPath = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const arrow = (d: number | null) => (d == null ? '' : d > 0 ? '▲' : d < 0 ? '▼' : '–');
  const dColor = (d: number | null, goodUp = true) => (d == null || d === 0 ? 'text-faint' : (d > 0) === goodUp ? 'text-sage' : 'text-garnet');

  return (
    <div className="rounded-lg border border-edge bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-faint">{SCORE_LABEL} {t('trend')} · {history.length}</div>
        {dA != null && <div className={`text-[11px] font-medium ${dColor(dA)}`}>{arrow(dA)} {Math.abs(dA)}</div>}
      </div>
      <div className="flex items-end gap-2">
        <div className="text-2xl font-semibold leading-none text-ink">{last.aigvr}</div>
        <div className="text-[10px] text-faint mb-0.5">/ 100</div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
        {history.length > 1 && <path d={dPath} fill="none" stroke="var(--brand)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />}
        {xy.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={i === xy.length - 1 ? 3 : 2} fill={i === xy.length - 1 ? 'var(--gold)' : 'var(--brand)'} />
        ))}
      </svg>
      {prev ? (
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between text-[11px]"><span className="text-faint">{t('Presence')}</span><span className={dColor(dP)}>{arrow(dP)} {dP == null ? '—' : `${Math.abs(dP)}%`}</span></div>
          <div className="flex items-center justify-between text-[11px]"><span className="text-faint">{t('Top-of-mind rate')}</span><span className={dColor(dT)}>{arrow(dT)} {dT == null ? '—' : `${Math.abs(dT)}%`}</span></div>
          <div className="flex items-center justify-between text-[11px]"><span className="text-faint">{t('High-intent gaps')}</span><span className={dColor(dG, false)}>{arrow(dG)} {dG == null ? '—' : Math.abs(dG)}</span></div>
          <div className="text-[10px] text-faint pt-1">{t('vs previous scan')}</div>
        </div>
      ) : (
        <div className="text-[10px] text-faint pt-1">{t('Run another scan to track change.')}</div>
      )}
    </div>
  );
}

function ContextPanel({ headlineAigvr, scoreRun, runsByAgent, totalAgents }: {
  headlineAigvr: number | null;
  scoreRun?: LatestRun;
  runsByAgent: Record<string, LatestRun>;
  totalAgents: number;
}) {
  const sc = scoreRun?.output?.scorecard ?? scoreRun?.output;
  // Count only the deliverables listed in the nav groups — full_scan is a
  // meta-run, not a deliverable (it was inflating ready past the total: 10/9).
  const groupIds = new Set(DELIVERABLE_GROUPS.flatMap((g) => g.items));
  const readyCount = Object.entries(runsByAgent).filter(([id, r]) => groupIds.has(id) && r.status === 'completed').length;
  const presence = sc?.dimensions?.presence;
  const topOfMind = sc?.topOfMind?.overallRate;
  const gaps = (sc?.gaps || []).length;
  const rank = sc?.brandRank;
  const benchN = (sc?.competitorBenchmark || []).length;
  const sources = (sc?.sourceAuthority?.ranking || []).length;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-edge bg-surface p-4 text-center">
        <div className="text-[10px] uppercase tracking-widest text-faint mb-1">{SCORE_LABEL}</div>
        <div className={`text-3xl font-semibold leading-none ${headlineAigvr == null ? 'text-faint' : headlineAigvr >= 67 ? 'text-sage' : headlineAigvr >= 34 ? 'text-gold' : 'text-garnet'}`}>{headlineAigvr ?? '—'}</div>
        <div className="text-[10px] text-faint mt-1">/ 100</div>
      </div>
      {sc && (
        <div className="rounded-lg border border-edge bg-surface p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-faint">{t('Latest scan')}</div>
          <ContextMetric label="Presence" value={presence != null ? `${presence}%` : '—'} />
          {topOfMind != null && <ContextMetric label="Top-of-mind rate" value={`${topOfMind}%`} />}
          <ContextMetric label="Brand rank" value={rank ? `#${rank} of ${benchN}` : '—'} />
          <ContextMetric label="High-intent gaps" value={String(gaps)} />
          <ContextMetric label="Cited sources" value={String(sources)} />
        </div>
      )}
      <div className="rounded-lg border border-edge bg-surface p-3">
        <div className="text-[10px] uppercase tracking-widest text-faint mb-1">{t('Deliverables')}</div>
        <div className="text-sm text-ink">{readyCount} / {totalAgents} {t('ready')}</div>
      </div>
    </div>
  );
}

// Curated live-run view (client-facing): friendly current stage + completed
// milestones + a "takes a few minutes" hint. The raw execution trace
// (tool calls, output chunks, engine internals) is operator-only.
function LiveProgress({ activity, agentId, isOperator, endRef }: {
  activity: ActivityEvent[];
  agentId?: string;
  isOperator: boolean;
  endRef: React.RefObject<HTMLDivElement>;
}) {
  const milestones = activity.filter((ev) => ev.event_type === 'milestone');
  const currentLabel = milestones.length
    ? String((milestones[milestones.length - 1].payload as any)?.label ?? '')
    : '';
  const past = milestones.slice(0, -1);
  const longRun = agentId === 'monitor' || agentId === 'full_scan';
  return (
    <div className="max-w-md mx-auto py-10 space-y-6 text-center">
      <div className="flex items-center justify-center gap-3">
        <span className="inline-block w-4 h-4 rounded-full border-2 border-brand border-t-transparent animate-spin" />
        <span className="text-sm text-ink font-medium">{currentLabel ? t(currentLabel) : t('Getting started…')}</span>
      </div>
      {longRun && (
        <p className="text-xs text-faint">{t('This takes a few minutes — the run continues on the server, so you can leave this page and come back.')}</p>
      )}
      {past.length > 0 && (
        <ul className="text-left inline-block space-y-1.5">
          {past.map((m) => (
            <li key={m.id} className="text-xs text-dim flex items-center gap-2">
              <span className="text-sage">✓</span> {t(String((m.payload as any)?.label ?? ''))}
            </li>
          ))}
        </ul>
      )}
      {isOperator && (
        <details className="text-left rounded border border-edge bg-surface">
          <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-widest text-faint select-none hover:text-dim">
            {t('Technical trace')} · {activity.length}
          </summary>
          <div className="px-3 pb-3 font-mono text-xs space-y-2 border-t border-edge pt-2 max-h-80 overflow-y-auto">
            {activity.map((ev) => (<ActivityRow key={ev.id} ev={ev} />))}
          </div>
        </details>
      )}
      <div ref={endRef} />
    </div>
  );
}

function ActivityRow({ ev }: { ev: ActivityEvent }) {
  const ts = new Date(ev.ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const tone =
    ev.event_type === 'error'
      ? 'text-garnet'
      : ev.event_type === 'milestone'
      ? 'text-brand'
      : ev.event_type === 'tool_call'
      ? 'text-gold'
      : ev.event_type === 'tool_result'
      ? 'text-sage'
      : ev.event_type === 'progress'
      ? 'text-faint'
      : ev.event_type === 'output_chunk'
      ? 'text-brand'
      : 'text-dim';
  const label = ev.event_type.replace('_', ' ').toUpperCase();
  let body = '';
  if (typeof ev.payload === 'object' && ev.payload) {
    if ('text' in ev.payload) body = String(ev.payload.text);
    else if ('label' in ev.payload) body = String(ev.payload.label);
    else if ('message' in ev.payload) body = String(ev.payload.message);
    else if ('pct' in ev.payload) body = `${ev.payload.pct}%`;
    else if ('tool' in ev.payload && 'result' in ev.payload)
      body = `[${ev.payload.tool}] → ${String(ev.payload.result).slice(0, 140)}`;
    else if ('tool' in ev.payload) body = `[${ev.payload.tool}] called`;
    else if ('kind' in ev.payload) body = `[${ev.payload.kind}]`;
    else body = JSON.stringify(ev.payload).slice(0, 160);
  }
  return (
    <div className="flex items-start gap-3">
      <span className="text-faint select-none">{ts}</span>
      <span className={`uppercase tracking-wider w-20 shrink-0 text-[10px] ${tone}`}>
        {label}
      </span>
      <span className="text-ink break-words flex-1">{body}</span>
    </div>
  );
}

// ── Rich result renderers ────────────────────────────────────────────────────

// value→hex (red→amber→emerald) for SVG strokes / dynamic text colors.
function toneColor(v: number): string {
  return v >= 67 ? 'var(--sage)' : v >= 34 ? 'var(--gold)' : 'var(--garnet)';
}

// Auto-coloring meter bar: red at/near 0, amber mid, emerald high. Pass an
// explicit Tailwind `color` class to override the value-based tint.
function Bar({ value, color }: { value: number; color?: string }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const cls = color ?? (v <= 0 ? 'bg-garnet/80' : v < 34 ? 'bg-red-400' : v < 67 ? 'bg-gold' : 'bg-sage');
  return (
    <div className="h-2 bg-raised rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${cls} transition-all duration-500`} style={{ width: `${v}%` }} />
    </div>
  );
}

// Small accented section heading used across result cards.
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-1 h-3 rounded-full bg-sage/70" />
      <span className="text-[10px] uppercase tracking-[0.18em] text-dim">{typeof children === 'string' ? t(children) : children}</span>
    </div>
  );
}

// Donut gauge for the 0-100 AIGVR headline.
function ScoreGauge({ score, size = 96 }: { score: number; size?: number }) {
  const s = Math.max(0, Math.min(100, Math.round(score || 0)));
  const sw = 8;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - s / 100);
  const col = toneColor(s);
  const mid = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--edge-strong)" strokeWidth={sw} />
      <circle
        cx={mid}
        cy={mid}
        r={r}
        fill="none"
        stroke={col}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform={`rotate(-90 ${mid} ${mid})`}
        style={{ transition: 'stroke-dashoffset 0.7s ease' }}
      />
      <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" fontSize="27" fontWeight="700" fill={col}>{s}</text>
      <text x="50%" y="64%" textAnchor="middle" dominantBaseline="middle" fontSize="9" letterSpacing="2" fill="var(--faint)">SCORE</text>
    </svg>
  );
}

// Pentagon radar for the 5 AIGVR dimensions (each 0-100). Extra horizontal
// canvas room so the side labels don't clip.
function RadarChart({ data }: { data: { label: string; value: number }[] }) {
  const W = 212;
  const H = 184;
  const cx = W / 2;
  const cy = H / 2 + 2;
  const maxR = 62;
  const n = data.length;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, rr: number): [number, number] => [cx + rr * Math.cos(ang(i)), cy + rr * Math.sin(ang(i))];
  const ringPoly = (rr: number) => data.map((_, i) => pt(i, rr).join(',')).join(' ');
  const dataPts = data.map((dm, i) => pt(i, maxR * (Math.max(0, Math.min(100, dm.value || 0)) / 100)));
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={ringPoly(maxR * f)} fill="none" stroke="var(--edge)" strokeWidth={1} />
      ))}
      {data.map((_, i) => {
        const [x, y] = pt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--edge)" strokeWidth={1} />;
      })}
      <polygon
        points={dataPts.map((p) => p.join(',')).join(' ')}
        fill="rgba(52,211,153,0.18)"
        stroke="var(--brand)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {dataPts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={2.6} fill="var(--brand)" />
      ))}
      {data.map((dm, i) => {
        const [x, y] = pt(i, maxR + 15);
        const co = Math.cos(ang(i));
        const anchor = co > 0.3 ? 'start' : co < -0.3 ? 'end' : 'middle';
        return (
          <text key={i} x={x} y={y} dy="0.32em" textAnchor={anchor} fontSize="9" letterSpacing="0.5" fill="var(--dim)">
            {dm.label}
          </text>
        );
      })}
    </svg>
  );
}

function RunResult({ agentId, output, projectId, runId, versions, onVersions, onDispatch }: {
  agentId?: string;
  output: Record<string, any>;
  projectId?: string;
  runId?: string;
  versions?: { label: string; content: string }[];
  onVersions?: (v: { label: string; content: string }[]) => void;
  onDispatch?: (agentId: string) => void;
}) {
  const advisory = agentId === 'monitor' || agentId === 'report' || agentId === 'full_scan';
  // Deliverables the CLIENT should sign off on (agency workflow).
  const reviewKind = agentId === 'profile' ? 'brand_profile' : agentId === 'discovery' ? 'prompt_set' : agentId === 'monitor' ? 'competitor_set' : null;
  return (
    <div className="mt-4 font-sans text-sm text-ink space-y-4">
      {reviewKind && projectId && <VerificationBar projectId={projectId} kind={reviewKind} />}
      {agentId === 'full_scan' ? (
        <>
          {output.scorecard && <MonitorResult o={output.scorecard} />}
          {output.report && <ReportResult o={output.report} />}
        </>
      ) : agentId === 'monitor' ? (
        <MonitorResult o={output} />
      ) : agentId === 'report' ? (
        <ReportResult o={output} />
      ) : agentId === 'optimize' ? (
        <ArtifactSandbox o={output} projectId={projectId} runId={runId} versions={versions} onVersions={onVersions}
          title="Content sandbox" artifactType="content_draft"
          subtitle={output.targetQuery ? <>targets: <span className="text-gold">{output.targetQuery}</span></> : undefined}
          quick={['更口语自然', '更简短', '加入联系方式与报价', '更突出竞争优势']}
          structured={<ContentResult o={output} />} />
      ) : agentId === 'site' ? (
        <ArtifactSandbox o={output} projectId={projectId} runId={runId} versions={versions} onVersions={onVersions}
          title="Homepage sandbox" artifactType="site_optimization"
          subtitle={output.siteAudited ? `audited ${output.siteAudited}` : 'homepage AEO upgrade'}
          quick={['更适配 AI 检索', '补充 FAQ schema', '强化实体定义', '加入 NAP 信息']}
          structured={<SiteResult o={output} />} />
      ) : agentId === 'distribute' ? (
        <ArtifactSandbox o={output} projectId={projectId} runId={runId} versions={versions} onVersions={onVersions}
          title="Distribution sandbox" artifactType="distribution_kit"
          subtitle={`${(output.targets || []).length} placements, tiered`}
          quick={['更贴合该媒体调性', '更简短', '更突出差异化', '增加数据支撑']}
          structured={<DistributionResult o={output} />} />
      ) : agentId === 'encyclopedia' ? (
        <ArtifactSandbox o={output} projectId={projectId} runId={runId} versions={versions} onVersions={onVersions}
          title="Encyclopedia sandbox" artifactType="encyclopedia_entry"
          subtitle={output.targetWiki}
          quick={['更中立客观', '补充可靠引用', '精简篇幅', '强调显著性证据']}
          structured={<EncyclopediaResult o={output} />} />
      ) : agentId === 'profile' ? (
        <ProfileResult o={output} />
      ) : agentId === 'discovery' ? (
        <DiscoveryResult o={output} />
      ) : agentId === 'answers' ? (
        <StandardAnswersResult o={output} />
      ) : null}
      {advisory && projectId && agentId && (
        <AdvisoryChat projectId={projectId} agentId={agentId} output={output} onDispatch={onDispatch} />
      )}
    </div>
  );
}

// Text extraction for translation/advisory — the FULL readable content of a
// result, not just its one-line summary (fix: whole scorecard translates).
function scorecardText(sc: any): string {
  if (!sc) return '';
  const L: string[] = [];
  if (sc.aigvrScore != null) L.push(`AIGVR ${sc.aigvrScore}/100`);
  if (sc.dimensions) L.push('Dimensions: ' + Object.entries(sc.dimensions).map(([k, v]) => `${k} ${v}`).join(', '));
  if (sc.metrics?.perStage?.length) L.push('By funnel stage: ' + sc.metrics.perStage.map((s: any) => `${s.stage} ${s.presence}% (n=${s.queries})`).join('; '));
  if (sc.competitorBenchmark?.length) L.push('Share of voice: ' + sc.competitorBenchmark.map((b: any) => `${b.name} ${b.sovPct}%`).join('; '));
  if (sc.gaps?.length) L.push('High-intent gaps:\n' + sc.gaps.map((g: any) => `- [${g.engine}/${g.stage}] ${g.prompt} → ${(g.competitorsPresent || []).join(', ')}`).join('\n'));
  if (sc.sourceAuthority?.ranking?.length) L.push('Sources AI engines cite: ' + sc.sourceAuthority.ranking.slice(0, 10).map((d: any) => `${d.domain} (${d.citations}x)`).join(', '));
  return L.join('\n');
}
function resultToText(agentId: string | undefined, o: any, summary: string | null): string {
  if (agentId === 'monitor') return [summary, scorecardText(o)].filter(Boolean).join('\n\n');
  if (agentId === 'full_scan') return [summary, scorecardText(o?.scorecard), o?.report?.markdown].filter(Boolean).join('\n\n');
  return o?.fullMarkdown || o?.markdown || o?.report?.markdown || [summary, o?.executiveSummary, o?.description, o?.definition].filter(Boolean).join('\n\n') || '';
}

function AdvisoryChat({ projectId, agentId, output, onDispatch }: {
  projectId: string;
  agentId: string;
  output: any;
  onDispatch?: (agentId: string) => void;
}) {
  const [q, setQ] = useState('');
  const [thread, setThread] = useState<{ q: string; a: string; suggested?: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(true);
    const digest = resultToText(agentId, output, output?.summary ?? null);
    try {
      const res = await fetch('/api/workspace/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, agentId, question: question.trim(), resultDigest: digest }),
      });
      const d = await res.json();
      setThread((t) => [...t, { q: question.trim(), a: d.answer || d.error || 'No answer', suggested: d.suggestedAgent }]);
      setQ('');
    } catch (e) {
      setThread((t) => [...t, { q: question.trim(), a: e instanceof Error ? e.message : String(e) }]);
    }
    setBusy(false);
  };
  const QUICK = ['哪个缺口最该先打?', '为什么某些引擎上我可见度低?', '最该先做哪件事?'];
  return (
    <div className="print-hide rounded-xl border border-edge bg-surface p-4 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-faint">{t('Ask about this result')}</div>
      {thread.map((t, i) => (
        <div key={i} className="space-y-1">
          <div className="text-[12px] text-brand">› {t.q}</div>
          <div className="text-[13px] text-dim leading-relaxed whitespace-pre-wrap">{t.a}</div>
          {t.suggested && onDispatch && (
            <button onClick={() => onDispatch(t.suggested!)} className="text-[11px] px-2 py-1 rounded border border-brand/50 text-brand hover:brightness-110/10 transition">
              ▶ Run {AGENTS[t.suggested]?.shortName ?? t.suggested}
            </button>
          )}
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) { e.preventDefault(); ask(q); } }}
          placeholder="问这份结果…(可中文)"
          disabled={busy}
          className="flex-1 bg-surface border border-edge rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-blue-400/50"
        />
        <button onClick={() => ask(q)} disabled={busy || !q.trim()} className="px-3 py-2 text-[13px] rounded-md bg-brand text-on-brand hover:brightness-110 disabled:bg-raised disabled:text-faint transition">{busy ? '…' : '问'}</button>
      </div>
      {thread.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((qq) => (
            <button key={qq} onClick={() => ask(qq)} disabled={busy} className="text-[10px] px-2 py-0.5 rounded-full border border-edge text-dim hover:border-brand/50 hover:text-brand disabled:opacity-40 transition">{qq}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function ArtifactSandbox({ o, projectId, runId, versions: extVersions, onVersions, title = 'Content sandbox', artifactType = 'content_draft', subtitle, quick, structured }: {
  o: Record<string, any>;
  projectId?: string;
  runId?: string;
  versions?: { label: string; content: string }[];
  onVersions?: (v: { label: string; content: string }[]) => void;
  title?: string;
  artifactType?: string;
  subtitle?: ReactNode;
  quick?: string[];
  structured?: ReactNode;
}) {
  const initial: string = o.fullMarkdown || o.articleMarkdown || '';
  // Versions persist in the parent (keyed by runId) so navigating away and back
  // doesn't lose refinements. Fall back to local state if not provided.
  const [localVersions, setLocalVersions] = useState<{ label: string; content: string }[]>(
    extVersions && extVersions.length ? extVersions : [{ label: 'v1 · original', content: initial }],
  );
  const versions = extVersions && extVersions.length ? extVersions : localVersions;
  const setVersions = (updater: (v: { label: string; content: string }[]) => { label: string; content: string }[]) => {
    const next = updater(versions);
    setLocalVersions(next);
    onVersions?.(next);
  };
  const [active, setActive] = useState(() => (extVersions && extVersions.length ? extVersions.length - 1 : 0));
  const [editing, setEditing] = useState(false);
  const [instr, setInstr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const current = versions[active];

  const refineWith = async (instruction: string) => {
    if (!instruction.trim() || busy || !projectId) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/workspace/refine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, artifactType, currentContent: current.content, instruction: instruction.trim() }),
      });
      const d = await res.json();
      if (!res.ok || !d.content) { setErr(d.error || 'Refine failed'); setBusy(false); return; }
      setVersions((vs) => [...vs, { label: `v${vs.length + 1} · ${instruction.trim().slice(0, 24)}`, content: d.content }]);
      setActive(versions.length);
      setInstr('');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const QUICK = quick && quick.length ? quick : ['更口语自然', '更简短', '加入联系方式与报价', '更突出竞争优势'];

  return (
    <div className="rounded-xl border border-edge bg-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{t(title)}</h3>
          {subtitle && <p className="text-[11px] text-faint mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setEditing((e) => !e)} className="text-[11px] px-2 py-0.5 rounded border border-edge text-dim hover:border-brand/50 hover:text-brand transition">{editing ? t('Done') : t('Edit')}</button>
          <button onClick={() => navigator.clipboard?.writeText(current.content).catch(() => {})} className="text-[11px] px-2 py-0.5 rounded border border-edge text-dim hover:border-brand/50 hover:text-brand transition">{t('Copy')}</button>
        </div>
      </div>

      {structured && (
        <details className="rounded border border-edge bg-surface">
          <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-widest text-faint select-none hover:text-dim">Structured view</summary>
          <div className="px-3 pb-3 pt-1 border-t border-edge">{structured}</div>
        </details>
      )}

      {versions.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {versions.map((v, i) => (
            <button key={i} onClick={() => setActive(i)} className={`text-[10px] px-2 py-0.5 rounded border transition ${i === active ? 'bg-brand border-brand text-on-brand' : 'border-edge text-dim hover:text-ink'}`} title={v.label}>{v.label}</button>
          ))}
        </div>
      )}

      {editing ? (
        <textarea
          value={current.content}
          onChange={(e) => setVersions((vs) => vs.map((v, i) => (i === active ? { ...v, content: e.target.value } : v)))}
          className="w-full h-72 bg-raised border border-edge rounded-md p-3 text-[12px] text-ink font-mono leading-relaxed focus:outline-none focus:border-blue-400/50"
        />
      ) : (
        <div className="text-[13px] text-ink leading-relaxed whitespace-pre-wrap max-h-[55vh] overflow-y-auto border border-edge rounded-md p-3 bg-raised">{current.content}</div>
      )}

      {/* Refine dialogue — scoped to this artifact */}
      <div className="border-t border-edge pt-3 space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-faint">{t('Refine with a message')}</div>
        <div className="flex gap-2">
          <input
            value={instr}
            onChange={(e) => setInstr(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && instr.trim()) { e.preventDefault(); refineWith(instr); } }}
            placeholder='e.g. "更口语，加入我们的报价"'
            disabled={busy}
            className="flex-1 bg-surface border border-edge rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-blue-400/50"
          />
          <button onClick={() => refineWith(instr)} disabled={busy || !instr.trim()} className="px-3 py-2 text-[13px] rounded-md bg-brand text-on-brand hover:brightness-110 disabled:bg-raised disabled:text-faint transition">
            {busy ? '改写中…' : '改写'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button key={q} onClick={() => refineWith(q)} disabled={busy} className="text-[10px] px-2 py-0.5 rounded-full border border-edge text-dim hover:border-brand/50 hover:text-brand disabled:opacity-40 transition">{q}</button>
          ))}
        </div>
        {err && <div className="text-[11px] text-gold">{err}</div>}
        <p className="text-[10px] text-faint">Versions live in this session · the original deliverable is unchanged. Copy/Edit to keep a version.</p>
      </div>
    </div>
  );
}

function ContentResult({ o }: { o: Record<string, any> }) {
  const faq: any[] = o.faq || [];
  const copy = (text?: string) => { if (text) navigator.clipboard?.writeText(text).catch(() => {}); };
  return (
    <div className="rounded-xl border border-edge bg-surface p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">Content draft</h3>
          {o.targetQuery && (
            <p className="text-[11px] text-faint mt-0.5">
              targets: <span className="text-gold">{o.targetQuery}</span>
              {o.stage && <span className="text-faint"> · {o.stage}</span>}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => copy(o.fullMarkdown)} className="text-[11px] px-2 py-0.5 rounded border border-edge text-dim hover:border-brand/50 hover:text-brand transition">{t('Copy page')}</button>
          <button onClick={() => copy(JSON.stringify(o.schemaJsonLd, null, 2))} className="text-[11px] px-2 py-0.5 rounded border border-edge text-dim hover:border-brand/50 hover:text-brand transition">{t('Copy schema')}</button>
        </div>
      </div>

      {o.title && <div className="text-[15px] font-semibold text-ink leading-snug">{o.title}</div>}
      {o.metaDescription && <div className="text-[12px] text-faint italic">{o.metaDescription}</div>}

      {o.articleMarkdown && (
        <div className="text-[13px] text-dim leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto border border-edge rounded-md p-3 bg-raised">
          {o.articleMarkdown}
        </div>
      )}

      {faq.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-faint mb-1.5">FAQ ({faq.length}) · FAQPage schema generated</div>
          <ul className="space-y-2">
            {faq.map((f, i) => (
              <li key={i} className="text-[12px] leading-snug">
                <div className="text-ink font-medium">{f.question}</div>
                <div className="text-faint">{f.answer}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ProfileResult({ o }: { o: Record<string, any> }) {
  const facts: any[] = o.facts || [];
  const nap = o.nap || {};
  const napEntries = Object.entries(nap).filter(([, v]) => v);
  return (
    <div className="rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-ink">Canonical brand profile</h3>
        <p className="text-[11px] text-faint mt-0.5">{o.sourcedFromHomepage ? 'verified against homepage' : 'from brand knowledge'} · reused by all execution agents</p>
      </div>
      {o.definition && <div className="text-[13px] text-ink font-medium leading-snug">{o.definition}</div>}
      {o.description && <div className="text-[12px] text-dim leading-relaxed">{o.description}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        {(o.services || []).length > 0 && (
          <div><SectionLabel>Services</SectionLabel><div className="flex flex-wrap gap-1">{o.services.map((s: string, i: number) => <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-raised border border-edge text-dim">{s}</span>)}</div></div>
        )}
        {(o.differentiators || []).length > 0 && (
          <div><SectionLabel>Differentiators</SectionLabel><ul className="space-y-0.5">{o.differentiators.map((d: string, i: number) => <li key={i} className="text-[11px] text-dim">· {d}</li>)}</ul></div>
        )}
      </div>
      {facts.length > 0 && (
        <div><SectionLabel>Facts</SectionLabel>
          <div className="space-y-0.5">{facts.map((f, i) => <div key={i} className="text-[12px]"><span className="text-faint">{f.label}: </span><span className="text-ink">{f.value}</span></div>)}</div>
        </div>
      )}
      {napEntries.length > 0 && (
        <div><SectionLabel>NAP</SectionLabel>
          <div className="text-[11px] text-dim">{napEntries.map(([k, v]) => `${k}: ${v}`).join('  ·  ')}</div>
        </div>
      )}
      {o.confidence && <div className="text-[10px] text-faint pt-1 border-t border-edge">{o.confidence}</div>}
    </div>
  );
}

function EncyclopediaResult({ o }: { o: Record<string, any> }) {
  const n = o.notability || {};
  const cites: any[] = o.citationPlan || [];
  const targets: any[] = o.existingArticleTargets || [];
  const da = o.draftArticle || {};
  const copy = (t?: string) => { if (t) navigator.clipboard?.writeText(t).catch(() => {}); };
  const vColor = n.verdict === 'likely' ? 'bg-emerald-500/20 text-sage border-emerald-500/40'
    : n.verdict === 'borderline' ? 'bg-gold/20 text-gold border-gold/40'
    : 'bg-garnet/20 text-garnet border-garnet/40';
  return (
    <div className="rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">Encyclopedia entry &amp; path</h3>
          <p className="text-[11px] text-faint mt-0.5">{o.targetWiki}</p>
        </div>
        <button onClick={() => copy(o.fullMarkdown)} className="text-[11px] px-2 py-0.5 rounded border border-edge text-dim hover:border-brand/50 hover:text-brand transition shrink-0">{t('Copy plan')}</button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] px-2 py-0.5 rounded border uppercase tracking-wide ${vColor}`}>notability: {n.verdict || '—'}</span>
        {o.recommendedApproach && <span className="text-[10px] px-2 py-0.5 rounded bg-raised border border-edge text-dim">{String(o.recommendedApproach).replace(/_/g, ' ')}</span>}
      </div>
      {n.reasoning && <p className="text-[12px] text-dim leading-snug">{n.reasoning}</p>}

      {n.evidenceNeeded?.length > 0 && (
        <div>
          <SectionLabel>Evidence needed to qualify</SectionLabel>
          <ul className="space-y-0.5">{n.evidenceNeeded.map((e: string, i: number) => <li key={i} className="text-[12px] text-dim">· {e}</li>)}</ul>
        </div>
      )}

      {da.title && (
        <div>
          <SectionLabel>Draft — {da.title}</SectionLabel>
          {da.lead && <p className="text-[12px] text-dim leading-relaxed">{da.lead}</p>}
          {(da.sections || []).map((s: any, i: number) => (
            <div key={i} className="mt-1.5">
              <div className="text-[12px] text-ink font-medium">{s.heading}</div>
              <div className="text-[12px] text-dim leading-snug">{s.content}</div>
            </div>
          ))}
        </div>
      )}

      {cites.length > 0 && (
        <div>
          <SectionLabel>Citation plan</SectionLabel>
          <ul className="space-y-0.5">
            {cites.map((c, i) => (
              <li key={i} className="text-[12px] leading-snug">
                <span className={c.status === 'have' ? 'text-sage' : 'text-gold'}>{c.status === 'have' ? '✓' : '○'}</span>
                <span className="text-dim"> {c.claim}</span>
                <span className="text-faint"> — {c.sourceType}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {targets.length > 0 && (
        <div>
          <SectionLabel>Get mentioned in existing articles</SectionLabel>
          <div className="space-y-1.5">
            {targets.map((t, i) => (
              <div key={i} className="text-[12px] leading-snug">
                <span className="text-brand font-medium">{t.article}: </span>
                <span className="text-dim">{t.howToGetMentioned}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DistributionResult({ o }: { o: Record<string, any> }) {
  const targets: any[] = o.targets || [];
  const copy = (t?: string) => { if (t) navigator.clipboard?.writeText(t).catch(() => {}); };
  const tierLabel: Record<number, string> = { 1: 'Tier 1 · National / mainstream', 2: 'Tier 2 · Industry / trade', 3: 'Tier 3 · Directories (quick wins)' };
  const tierColor: Record<number, string> = { 1: 'text-garnet', 2: 'text-gold', 3: 'text-sage' };
  const tiers = Array.from(new Set(targets.map((t) => t.tier || 3))).sort((a, b) => a - b);
  return (
    <div className="rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Distribution kit</h3>
          <p className="text-[11px] text-faint mt-0.5">{targets.length} ready-to-send placements, tiered by authority · get cited where AI engines look</p>
        </div>
        <button onClick={() => copy(o.fullMarkdown)} className="text-[11px] px-2 py-0.5 rounded border border-edge text-dim hover:border-brand/50 hover:text-brand transition shrink-0">{t('Copy kit')}</button>
      </div>
      {tiers.map((tier) => (
        <div key={tier}>
          <div className={`text-[10px] uppercase tracking-widest mb-1.5 ${tierColor[tier] || 'text-dim'}`}>{tierLabel[tier] || `Tier ${tier}`}</div>
          <div className="space-y-2">
            {targets.filter((t) => (t.tier || 3) === tier).map((t, i) => (
              <div key={i} className="rounded-lg border border-edge bg-surface p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[12px] font-medium text-ink truncate">{t.domain}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-raised border border-edge text-dim uppercase tracking-wide shrink-0">{(t.channelType || '').replace(/_/g, ' ')}</span>
                  {t.effort && <span className="text-[9px] text-faint shrink-0">{t.effort}</span>}
                  <button onClick={() => copy(t.draft)} className="ml-auto text-[10px] text-faint hover:text-brand shrink-0">copy</button>
                </div>
                {t.title && <div className="text-[12px] text-dim font-medium mb-1">{t.title}</div>}
                {t.draft && <div className="text-[12px] text-dim leading-snug whitespace-pre-wrap">{t.draft}</div>}
                {t.why && <div className="text-[10px] text-sage mt-1.5">↳ {t.why}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SiteResult({ o }: { o: Record<string, any> }) {
  const checklist: any[] = o.aeoChecklist || [];
  const edits: any[] = o.homepageEdits || [];
  const schema: any[] = o.schema || [];
  const copy = (t?: string) => { if (t) navigator.clipboard?.writeText(t).catch(() => {}); };
  const dot = (s: string) => (s === 'ok' ? 'text-sage' : s === 'weak' ? 'text-gold' : 'text-garnet');
  return (
    <div className="rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">Homepage AEO upgrade</h3>
          <p className="text-[11px] text-faint mt-0.5">
            {o.siteAudited ? <>audited <span className="text-dim">{o.siteAudited}</span></> : 'homepage not fetched — from brand knowledge'}
            {o.existingSchema?.length ? ` · existing schema: ${o.existingSchema.join(', ')}` : ' · no existing schema'}
          </p>
        </div>
        <button onClick={() => copy(o.fullMarkdown)} className="text-[11px] px-2 py-0.5 rounded border border-edge text-dim hover:border-brand/50 hover:text-brand transition shrink-0">{t('Copy brief')}</button>
      </div>

      {checklist.length > 0 && (
        <div>
          <SectionLabel>AEO checklist</SectionLabel>
          <ul className="space-y-1">
            {checklist.map((c, i) => (
              <li key={i} className="text-[12px] leading-snug">
                <span className={`${dot(c.status)} mr-1`}>●</span>
                <span className="text-ink">{c.item}</span>
                <span className="text-faint"> — {c.fix}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {edits.length > 0 && (
        <div>
          <SectionLabel>Homepage edits</SectionLabel>
          <div className="space-y-1.5">
            {edits.map((e, i) => (
              <div key={i} className="text-[12px] leading-snug">
                <span className="text-dim font-medium">{e.section}: </span>
                <span className="text-dim">{e.change}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {schema.length > 0 && (
        <div>
          <SectionLabel>Paste-in JSON-LD ({schema.length})</SectionLabel>
          <div className="space-y-1.5">
            {schema.map((s, i) => (
              <div key={i} className="rounded border border-edge bg-raised">
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-[11px] text-brand">{s.type}</span>
                  <button onClick={() => copy(JSON.stringify(s.jsonld, null, 2))} className="text-[10px] text-faint hover:text-brand">copy</button>
                </div>
                <pre className="text-[10px] text-dim px-2.5 pb-2 overflow-x-auto max-h-40 overflow-y-auto">{JSON.stringify(s.jsonld, null, 2)}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DiscoveryResult({ o }: { o: Record<string, any> }) {
  const cats: any[] = o.promptSet || [];
  const nk = (p: string) => p.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const keySet = new Set((o.keyPrompts || []).map((p: string) => nk(p)));
  const isKey = (p: string) => keySet.has(nk(p));
  return (
    <div className="rounded-xl border border-edge bg-surface p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink tracking-wide">Discovery — prompt set</h3>
          {o.industry && <p className="text-[11px] text-faint mt-0.5 truncate">{o.industry}</p>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-ink leading-none tabular-nums">{o.promptCount ?? '—'}</div>
          <div className="text-[10px] text-faint uppercase tracking-wider mt-0.5">
            prompts · {cats.length} stages{keySet.size ? ` · ${keySet.size} key` : ''}
          </div>
        </div>
      </div>

      {Array.isArray(o.subVerticals) && o.subVerticals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {o.subVerticals.map((s: string, i: number) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-brand/90">{s}</span>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {cats.map((c, i) => (
          <details key={i} className="group rounded-lg border border-edge bg-surface open:bg-surface">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-2.5 flex items-center gap-2 select-none rounded-lg hover:bg-surface">
              <span className="text-faint text-[9px] transition-transform group-open:rotate-90">▶</span>
              <span className="text-[12px] font-medium text-brand/90 flex-1 min-w-0 truncate">{c.label || c.category}</span>
              <span className="text-[10px] text-dim px-1.5 py-0.5 rounded-full bg-raised tabular-nums">{(c.prompts || []).length}</span>
            </summary>
            <ul className="px-3 pb-2.5 pt-1.5 space-y-1.5 border-t border-edge">
              {(c.prompts || []).map((p: string, j: number) => (
                <li key={j} className="flex gap-2 text-[12px] text-dim leading-snug">
                  <span className="text-faint flex-none tabular-nums">{j + 1}.</span>
                  <span>{p}{isKey(p) && <span className="ml-1.5 text-[9px] align-middle px-1 py-0.5 rounded bg-gold/15 text-gold uppercase tracking-wider">key</span>}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}

function StandardAnswersResult({ o }: { o: Record<string, any> }) {
  const answers: any[] = o.answers || [];
  const localName = o.localLangName || 'Local';
  const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {});
  const copyAll = () =>
    copy(answers.map((a, i) => `${i + 1}. ${a.prompt}\n[${localName}] ${a.local}\n[English] ${a.en}`).join('\n\n'));
  return (
    <div className="rounded-xl border border-edge bg-surface p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink tracking-wide">{t('Standard answer library')}</h3>
          <p className="text-[11px] text-faint mt-0.5">{localName} + English · {t('the answer we want AI to give')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className="text-2xl font-bold text-ink leading-none tabular-nums">{o.count ?? answers.length}</div>
            <div className="text-[10px] text-faint uppercase tracking-wider mt-0.5">answers</div>
          </div>
          <button onClick={copyAll} className="text-[11px] px-2 py-1 rounded border border-edge text-dim hover:border-brand/50 hover:text-brand transition">{t('Copy kit')}</button>
        </div>
      </div>

      <div className="space-y-2">
        {answers.map((a, i) => (
          <details key={i} className="group rounded-lg border border-edge bg-surface">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-2.5 flex items-center gap-2 select-none rounded-lg hover:bg-raised">
              <span className="text-faint text-[9px] transition-transform group-open:rotate-90">▶</span>
              <span className="text-faint flex-none tabular-nums text-[11px]">{i + 1}.</span>
              <span className="text-[12px] font-medium text-brand/90 flex-1 min-w-0 truncate">{a.prompt}</span>
            </summary>
            <div className="px-3 pb-3 pt-1.5 space-y-2.5 border-t border-edge">
              {[{ lab: localName, val: a.local }, { lab: 'English', val: a.en }].map((blk, k) => (
                <div key={k}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-faint">{blk.lab}</span>
                    <button onClick={() => copy(blk.val)} className="text-[10px] text-faint hover:text-brand transition">{t('Copy')}</button>
                  </div>
                  <p className="text-[12px] text-dim leading-relaxed">{blk.val}</p>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// Client sign-off status + request control for profile / prompts / competitors
// (agency workflow: the client verifies the foundations before we build on them).
function VerificationBar({ projectId, kind }: { projectId: string; kind: string }) {
  const [review, setReview] = useState<any | null | undefined>(undefined); // undefined=loading
  const [email, setEmail] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentInfo, setSentInfo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/workspace/reviews?projectId=${projectId}&kind=${kind}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setReview(d.reviews?.[kind] ?? null); })
      .catch(() => { if (!cancelled) setReview(null); });
    return () => { cancelled = true; };
  }, [projectId, kind]);

  const request = async () => {
    if (!email.trim() || busy) return;
    setBusy(true); setSentInfo(null);
    try {
      const res = await fetch('/api/workspace/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, kind, email: email.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { setSentInfo(d.error || 'Failed'); setBusy(false); return; }
      setReview(d.review);
      setShowForm(false);
      setSentInfo(d.emailSent ? null : `${t('Email not auto-sent — share the link:')} ${d.reviewUrl}`);
    } catch (e) { setSentInfo(e instanceof Error ? e.message : 'Network error'); }
    setBusy(false);
  };

  if (review === undefined) return null;

  if (review?.status === 'approved') {
    return (
      <div className="flex items-center gap-2 text-[11px] text-sage rounded-lg border border-sage/40 bg-sage/10 px-3 py-1.5">
        ✓ {t('Verified by client')} · {review.client_email} · {String(review.decided_at || '').slice(0, 10)}
      </div>
    );
  }
  if (review?.status === 'changes_requested') {
    return (
      <div className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 space-y-1">
        <div className="text-[11px] text-gold font-medium">✎ {t('Client requested changes')} · {review.client_email}</div>
        {review.note && <div className="text-[12px] text-dim whitespace-pre-wrap">{review.note}</div>}
      </div>
    );
  }
  if (review?.status === 'pending') {
    return (
      <div className="flex items-center gap-2 text-[11px] text-dim rounded-lg border border-edge bg-surface px-3 py-1.5">
        ⏳ {t('Awaiting client verification')} · {review.client_email}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-edge bg-surface px-3 py-2">
      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="text-[11px] text-dim hover:text-brand transition">
          ✉ {t('Request client verification')}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="client@company.com"
            className="flex-1 bg-raised border border-edge rounded px-2 py-1 text-[12px] text-ink placeholder:text-faint focus:outline-none focus:border-brand/50"
          />
          <button onClick={request} disabled={busy || !email.trim()} className="text-[11px] px-2.5 py-1 rounded bg-brand text-on-brand disabled:opacity-50">
            {busy ? '…' : t('Send')}
          </button>
          <button onClick={() => setShowForm(false)} className="text-[11px] text-faint hover:text-dim">✕</button>
        </div>
      )}
      {sentInfo && <div className="mt-1 text-[10px] text-gold break-all">{sentInfo}</div>}
    </div>
  );
}

function KpiTile({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${accent ? 'border-brand/40 bg-brand-soft/40' : 'border-edge bg-surface'}`}>
      <div className="text-[10px] uppercase tracking-wider text-faint truncate">{label}</div>
      <div className="text-lg font-semibold text-ink tabular-nums leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-faint truncate">{sub}</div>}
    </div>
  );
}

function MonitorResult({ o }: { o: Record<string, any> }) {
  const d = o.dimensions || {};
  const dims: { k: string; label: string }[] = [
    { k: 'presence', label: 'Presence' },
    { k: 'prominence', label: 'Prominence' },
    { k: 'sentiment', label: 'Sentiment' },
    { k: 'citation', label: 'Citation (AEO)' },
    { k: 'competitiveShare', label: 'Share of Voice' },
  ];
  const radar = [
    { label: 'Presence', value: d.presence ?? 0 },
    { label: 'Prom.', value: d.prominence ?? 0 },
    { label: 'Sent.', value: d.sentiment ?? 0 },
    { label: 'Cite', value: d.citation ?? 0 },
    { label: 'Share', value: d.competitiveShare ?? 0 },
  ];
  const stages: any[] = o.metrics?.perStage || [];
  const engines: any[] = o.metrics?.perEngine || [];
  const bench: any[] = o.competitorBenchmark || [];
  const maxSov = Math.max(1, ...bench.map((b) => b.sovPct || 0));
  const gaps: any[] = o.gaps || [];
  const score = o.aigvrScore ?? 0;
  const tom = o.topOfMind || {};
  const hasTom = tom.overallRate != null;

  return (
    <div className="rounded-xl border border-edge bg-surface p-5 space-y-5">
      {/* Header: title + headline gauge */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink tracking-wide">{SCORE_LABEL} Scorecard</h3>
          <p className="text-[11px] text-faint mt-0.5">{(o.engines || []).join(' · ')} · {o.sampled?.queries ?? '—'} queries</p>
        </div>
        <div className="flex flex-col items-center shrink-0">
          <ScoreGauge score={score} />
          <div className="text-[10px] text-faint mt-1">
            Rank <span className="text-ink font-semibold">#{o.brandRank ?? '—'}</span> of {bench.length || '—'}
          </div>
        </div>
      </div>

      {/* Six non-overlapping headline KPIs (CMO review): occurrence, share of
          voice, position-when-present (top-of-mind folded in as its filtered
          view), sentiment-when-present, citation strength, high-intent gaps. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <KpiTile label={t('Presence')} value={`${Math.round(d.presence ?? 0)}%`} sub={`${o.metrics?.overall?.brandHits ?? '—'}/${o.sampled?.queries ?? '—'} ${t('answers')}`} />
        <KpiTile label={t('Share of Voice')} value={`${Math.round(d.competitiveShare ?? 0)}%`} sub={`${t('Rank')} #${o.brandRank ?? '—'} / ${bench.length || '—'}`} />
        <KpiTile label={t('Position when present')} value={Math.round(d.prominence ?? 0)} sub={hasTom ? `${t('Top-of-mind')} ${tom.overallRate}% · ${t('key')} ${tom.keyRate ?? '—'}%` : undefined} accent />
        <KpiTile label={t('Sentiment when present')} value={Math.round(d.sentiment ?? 0)} />
        <KpiTile label={t('Citation strength')} value={`${Math.round(d.citation ?? 0)}%`} />
        <KpiTile label={t('High-intent gaps')} value={gaps.length} sub={t('queries competitors win')} accent={gaps.length > 0} />
      </div>

      {/* Radar + per-dimension breakdown */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <RadarChart data={radar} />
        <div className="flex-1 min-w-[200px] space-y-2">
          {dims.map((dim) => {
            const v = Math.round(d[dim.k] ?? 0);
            return (
              <div key={dim.k} className="grid grid-cols-[100px_1fr_30px] items-center gap-2.5">
                <span className="text-[11px] text-dim truncate">{dim.label}</span>
                <Bar value={v} />
                <span className="text-[11px] font-semibold text-ink text-right tabular-nums">{v}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-engine scores */}
      {engines.length > 0 && (
        <div>
          <SectionLabel>By engine</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {engines.map((e, i) => (
              <div key={i} className={`rounded-lg border bg-surface px-2.5 py-2 ${(e.kind === 'serp' || e.kind === 'surface') ? 'border-gold/40' : 'border-edge'}`}>
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-[11px] text-dim truncate">{e.engine}</span>
                  <span className="text-[13px] font-bold tabular-nums" style={{ color: toneColor(e.aigvr || 0) }}>{e.aigvr ?? '—'}</span>
                </div>
                <div className="mt-1.5"><Bar value={e.aigvr} color={(e.kind === 'serp' || e.kind === 'surface') ? 'bg-gold' : 'bg-brand'} /></div>
                <div className="mt-1 text-[9px] uppercase tracking-wider text-faint">{(e.kind === 'serp' || e.kind === 'surface') ? '● 真实界面 real surface' : 'API proxy'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Intent visibility (client-facing taxonomy per the CMO review);
          legacy scorecards without perIntent fall back to funnel stages. */}
      {(o.metrics?.perIntent || []).length > 0 ? (
        <div>
          <SectionLabel>{t('By intent')}</SectionLabel>
          <div className="space-y-2">
            {(o.metrics.perIntent as any[]).map((s2, i) => (
              <div key={i} className="grid grid-cols-[110px_1fr_72px] items-center gap-2.5">
                <span className="text-[11px] text-dim truncate">{s2.intent === 'high_intent' ? t('High intent') : t('Educational')}</span>
                <Bar value={s2.presence} />
                <span className="text-[11px] text-dim text-right tabular-nums">
                  <span className="text-ink font-semibold">{s2.presence}%</span>
                  <span className="text-faint"> {s2.brandHits}/{s2.queries}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-faint">{t('AI rarely names brands on educational questions — low presence there is normal; those prompts feed content topics.')}</p>
        </div>
      ) : stages.length > 0 && (
        <div>
          <SectionLabel>Funnel-stage visibility</SectionLabel>
          <div className="space-y-2">
            {stages.map((s, i) => (
              <div key={i} className="grid grid-cols-[96px_1fr_72px] items-center gap-2.5">
                <span className="text-[11px] text-dim capitalize truncate">
                  {s.stage}
                  {s.confidence === 'low' && <span className="ml-1 text-gold" title="few queries — low confidence">·low n</span>}
                </span>
                <Bar value={s.presence} />
                <span className="text-[11px] text-dim text-right tabular-nums">
                  <span className="text-ink font-semibold">{s.presence}%</span>
                  <span className="text-faint"> {s.brandHits}/{s.queries}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Competitive share-of-voice bar chart */}
      {bench.length > 0 && (
        <div>
          <SectionLabel>Share of voice</SectionLabel>
          <div className="space-y-1">
            {bench.map((b, i) => (
              <div
                key={i}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1 ${b.isBrand ? 'bg-gold/12 ring-1 ring-gold/40' : ''}`}
              >
                <span className={`w-28 shrink-0 truncate text-[11px] ${b.isBrand ? 'text-gold font-semibold' : 'text-dim'}`}>
                  {b.isBrand && <span className="mr-0.5">★</span>}{b.name}
                </span>
                <div className="flex-1 h-2.5 bg-raised rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${b.isBrand ? 'bg-gold' : 'bg-brand/60'} transition-all duration-500`}
                    style={{ width: `${((b.sovPct || 0) / maxSov) * 100}%` }}
                  />
                </div>
                <span className={`w-9 text-right text-[11px] tabular-nums ${b.isBrand ? 'text-gold font-semibold' : 'text-dim'}`}>{b.sovPct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* High-intent gaps */}
      {gaps.length > 0 && (
        <div>
          <SectionLabel>High-intent gaps ({gaps.length})</SectionLabel>
          <ul className="space-y-2">
            {gaps.slice(0, 8).map((g, i) => (
              <li key={i} className="rounded-md border border-edge border-l-2 border-l-garnet/50 bg-garnet/10 pl-2.5 pr-2 py-1.5">
                <div className="text-[12px] text-ink leading-snug">{g.prompt}</div>
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-faint uppercase tracking-wide">{g.engine} · {g.stage}</span>
                  {(g.competitorsPresent || []).length > 0 && <span className="text-faint text-[10px]">→</span>}
                  {(g.competitorsPresent || []).map((c: string, j: number) => (
                    <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-gold/15 text-gold border border-gold/30">{c}</span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Source-Authority Index — which domains the engines actually cite */}
      {o.sourceAuthority?.ranking?.length > 0 && (
        <div>
          <SectionLabel>Sources AI engines cite · AEO targets</SectionLabel>
          <p className="text-[10px] text-faint mb-1.5">
            {o.sourceAuthority.totalCitations} citations indexed across this project&apos;s scans — get featured on these.
          </p>
          <div className="space-y-1">
            {o.sourceAuthority.ranking.slice(0, 10).map((d: any, i: number) => (
              <div key={i} className={`flex items-center gap-2.5 rounded-md px-2 py-1 ${d.isBrand ? 'bg-gold/12 ring-1 ring-gold/40' : ''}`}>
                <span className="w-4 text-[10px] text-faint tabular-nums">{i + 1}</span>
                <span className={`flex-1 truncate text-[11px] ${d.isBrand ? 'text-gold font-semibold' : 'text-dim'}`}>
                  {d.isBrand && <span className="mr-0.5">★</span>}{d.domain}
                  {d.isBrand && <span className="ml-1 text-[9px] text-gold/70 uppercase">you</span>}
                </span>
                <span className="text-[10px] text-faint">{d.engines} eng</span>
                <span className="w-9 text-right text-[11px] tabular-nums text-dim font-medium">{d.citations}×</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {o.citations && (
        <div className="text-[11px] text-faint pt-1 border-t border-edge">
          Brand domain cited <span className="text-dim font-medium">{o.citations.brandCitedCount ?? 0}×</span> across AI answers.
        </div>
      )}
    </div>
  );
}

const PRIORITY_STYLE: Record<string, string> = {
  P0: 'bg-garnet/20 text-garnet border-garnet/40',
  P1: 'bg-gold/20 text-gold border-gold/40',
  P2: 'bg-gray-500/20 text-dim border-gray-500/40',
};

const PRIORITY_RAIL: Record<string, string> = {
  P0: 'border-l-red-500',
  P1: 'border-l-amber-400',
  P2: 'border-l-gray-500',
};

function ReportResult({ o }: { o: Record<string, any> }) {
  const findings: any[] = o.keyFindings || [];
  const recs: any[] = (o.recommendations || []).slice().sort((a: any, b: any) => {
    const r: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
    return (r[a.priority] ?? 9) - (r[b.priority] ?? 9);
  });
  const quickWins: string[] = o.quickWins || [];
  const copyMarkdown = () => {
    if (o.markdown) navigator.clipboard?.writeText(o.markdown).catch(() => {});
  };
  return (
    <div className="rounded-xl border border-edge bg-surface p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink tracking-wide">GEO Visibility Report</h3>
          <p className="text-[11px] text-faint mt-0.5">AI Generative Visibility analysis</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {typeof o.aigvrScore === 'number' && (
            <div className="flex items-center gap-1.5 rounded-full border border-edge bg-raised px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: toneColor(o.aigvrScore) }} />
              <span className="text-[11px] text-dim">AIGVR <span className="font-semibold" style={{ color: toneColor(o.aigvrScore) }}>{o.aigvrScore}</span></span>
            </div>
          )}
          {o.markdown && (
            <button onClick={copyMarkdown} className="text-[11px] px-2 py-1 rounded border border-edge text-dim hover:border-brand/50 hover:text-brand transition">
              Copy Markdown
            </button>
          )}
        </div>
      </div>

      {o.executiveSummary && (
        <div className="rounded-lg border border-edge border-l-2 border-l-emerald-400/50 bg-surface px-3.5 py-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-sage/70 mb-1.5">Executive summary</div>
          <p className="text-[13px] text-ink leading-relaxed">{o.executiveSummary}</p>
        </div>
      )}

      {findings.length > 0 && (
        <div>
          <SectionLabel>Key findings</SectionLabel>
          <ul className="space-y-2.5">
            {findings.map((f, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-0.5 flex-none w-5 h-5 rounded-full bg-raised border border-edge text-[10px] font-semibold text-dim flex items-center justify-center tabular-nums">{i + 1}</span>
                <div className="min-w-0">
                  <div className="text-[12.5px] text-ink font-medium leading-snug">{f.finding}</div>
                  {f.evidence && <div className="text-[11.5px] text-faint leading-snug mt-0.5">{f.evidence}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recs.length > 0 && (
        <div>
          <SectionLabel>Recommendations</SectionLabel>
          <div className="space-y-2.5">
            {recs.map((rec, i) => (
              <div key={i} className={`rounded-lg border border-edge border-l-[3px] ${PRIORITY_RAIL[rec.priority] || PRIORITY_RAIL.P2} bg-surface p-3.5`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${PRIORITY_STYLE[rec.priority] || PRIORITY_STYLE.P2}`}>{rec.priority}</span>
                  <span className="text-[13px] font-semibold text-ink leading-tight">{rec.title}</span>
                  {rec.targetStage && <span className="ml-auto shrink-0 text-[10px] text-dim px-1.5 py-0.5 rounded bg-raised capitalize">{rec.targetStage}</span>}
                </div>
                {rec.rationale && <p className="text-[12px] text-dim leading-snug mb-2">{rec.rationale}</p>}
                {Array.isArray(rec.actions) && rec.actions.length > 0 && (
                  <ul className="space-y-1 mb-2">
                    {rec.actions.map((a: string, j: number) => (
                      <li key={j} className="flex gap-2 text-[12px] text-dim leading-snug">
                        <span className="text-sage/70 flex-none">▸</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {rec.expectedImpact && (
                  <div className="text-[11px] text-sage/90 flex items-center gap-1.5">
                    <span aria-hidden>↗</span>
                    <span>{rec.expectedImpact}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {quickWins.length > 0 && (
        <div>
          <SectionLabel>Quick wins</SectionLabel>
          <ul className="space-y-1.5">
            {quickWins.map((q, i) => (
              <li key={i} className="flex gap-2 text-[12px] text-dim leading-snug">
                <span className="flex-none mt-0.5 w-4 h-4 rounded-full bg-sage/15 text-sage text-[9px] flex items-center justify-center">✓</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
