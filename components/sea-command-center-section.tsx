'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Satellite,
  Radar,
  ShieldAlert,
  Cpu,
  Activity,
  ArrowRight,
  Play,
  Terminal,
  AlertTriangle,
} from 'lucide-react';

/**
 * SEA Command Center homepage showcase.
 *
 * Content design aligns with GEO first-principles: every visible claim on
 * this section (agent count, model names, target countries, output format)
 * is also present in the machine-readable JSON-LD emitted by
 * <SEACommandCenterSchemaLD />. Human HTML and LLM JSON-LD stay in sync so
 * that both human visitors and AI crawlers read the same facts.
 */
export default function SEACommandCenterSection() {
  return (
    <section
      id="sea-command-center"
      aria-label="东南亚 GEO 多智能体指挥中心"
      className="relative py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-[#040b08] via-[#03100a] to-[#04080b] overflow-hidden"
    >
      {/* cyber grid */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.05] bg-[linear-gradient(rgba(0,255,140,.4)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,140,.4)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.04] bg-[repeating-linear-gradient(180deg,transparent_0,transparent_2px,rgba(0,255,140,.22)_3px,transparent_4px)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[680px] h-[680px] rounded-full bg-emerald-500/10 blur-[120px]" />

      <div className="relative max-w-7xl mx-auto">
        {/* eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex items-center gap-3 mb-5"
        >
          <Satellite className="w-4 h-4 text-emerald-400" />
          <span className="text-[11px] font-mono tracking-[0.35em] uppercase text-emerald-400/80">
            MemeCMO ◆ SEA Command · Live Multi-Agent Engine
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-emerald-500/40 bg-emerald-500/10">
            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] font-mono tracking-widest text-emerald-300">LIVE</span>
          </span>
        </motion.div>

        {/* headline + lede */}
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-end mb-14">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-5xl font-bold text-white leading-tight tracking-tight">
              东南亚 <span className="text-emerald-400">GEO 多智能体</span>
              <br />
              指挥中心 <span className="text-white/40 font-mono text-2xl md:text-3xl">· SEA Command Center</span>
            </h2>
            <p className="mt-5 text-gray-300 text-base md:text-lg leading-relaxed max-w-[58ch]">
              一次部署，
              <span className="text-emerald-300 font-semibold">并行调用 3 个特化 LLM 智能体</span>
              ，在 20 秒内完成一个中国品牌进入越南 / 印尼 / 泰国市场的
              <span className="text-white font-semibold"> T1 媒体注入勘探 · 地缘合规红线审计 · 母语 JSON-LD 语料建筑</span>。
              前端以 Palantir 式赛博舰桥呈现，Server-Sent Events 实时回传每一位 agent 的战术情报。
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="text-sm font-mono text-emerald-200/80 border-l-2 border-emerald-500/40 pl-5 space-y-3"
          >
            <div className="text-emerald-400/70 text-[10px] tracking-[0.3em] uppercase">
              GEO First Principle
            </div>
            <p className="leading-relaxed">
              单一 LLM 无法同时最优处理
              <span className="text-white">「媒体生态勘探 / 地缘合规 / 母语转化」</span>
              三种认知任务 —— 必须按<span className="text-emerald-300">「任务—模型—提示语」</span>三位一体精准配对。
            </p>
            <p className="leading-relaxed text-emerald-200/60">
              指挥中心把这条原理做成了可执行的 <span className="text-emerald-300">SSE 流式作战链路</span>。
            </p>
          </motion.div>
        </div>

        {/* 3 Agent Cards */}
        <div className="grid md:grid-cols-3 gap-4 mb-10">
          <AgentCard
            icon={<Radar className="w-5 h-5" />}
            codeName="T1 Corpus Scout"
            cnName="T1 语料勘探"
            model="Claude-Sonnet-4.5 / 4 / 3.7 / 3.5"
            accent="#00ff88"
            lines={[
              '分析 VnExpress / CafeF / Kompas / Bangkok Post',
              '输出 Trust Weight × Brand SOV 矩阵',
              '定位 3 个最高价值语料注入节点',
            ]}
          />
          <AgentCard
            icon={<ShieldAlert className="w-5 h-5" />}
            codeName="Geopolitical Guardian"
            cnName="地缘合规审计官"
            model="GPT-4o / 4.1 / 4-Turbo"
            accent="#ff3b3b"
            lines={[
              '审查文化禁忌 · 历史敏感 · 法律红线',
              '越南数据安全法 / 印尼 ITE / 泰国 lèse-majesté',
              '每条风险给出 CRITICAL 等级 + 缓解动作',
            ]}
          />
          <AgentCard
            icon={<Cpu className="w-5 h-5" />}
            codeName="GEO Architect"
            cnName="高阶语料生成"
            model="Gemini-2.5-Pro / 2.0 / 1.5"
            accent="#ffe066"
            lines={[
              '规避 Guardian 提出的全部地缘风险',
              '用 Tiếng Việt / Bahasa / ภาษาไทย 撰写',
              '输出 Schema.org Organization JSON-LD',
            ]}
          />
        </div>

        {/* Preview Terminal + CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid lg:grid-cols-[1.4fr_1fr] gap-4"
        >
          {/* preview terminal */}
          <div className="border border-emerald-800/50 bg-[#04100b] font-mono">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-emerald-900/70 bg-[#07150f]">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] tracking-[0.3em] uppercase text-emerald-400">
                Agent Terminal Stream · Live Preview
              </span>
              <span className="ml-auto text-[10px] text-emerald-700 tracking-widest">
                brand=Shopee · theater=Vietnam
              </span>
            </div>
            <div className="p-4 text-[11px] leading-relaxed space-y-0.5">
              {[
                ['[19:32:02]', 'SYSTEM', 'SEA Matrix online — 3 agents authorized', 'info'],
                ['[19:32:02]', 'T1 Corpus Scout', '⟶ dispatching — Claude-Sonnet-4.5 → 4 → 3.7 → 3.5', 'info'],
                ['[19:32:02]', 'Geopolitical Guardian', '⟶ dispatching — GPT-4o → 4.1 → 4-Turbo', 'info'],
                ['[19:32:02]', 'GEO Architect', '⟶ dispatching — Gemini-2.5-Pro → 2.0 → 1.5', 'info'],
                ['[19:32:03]', 'T1 Corpus Scout', '  ✗ Claude-Sonnet-3.5 — 500 bot deprecated', 'warn'],
                ['[19:32:06]', 'T1 Corpus Scout', '  ✓ Claude-Sonnet-4.5 — ok (3421ms)', 'ok'],
                ['[19:32:09]', 'Geopolitical Guardian', '✓ mission complete — 6632ms', 'ok'],
                ['[19:32:12]', 'GEO Architect', '✓ mission complete — 9241ms · JSON-LD ready', 'ok'],
                ['[19:32:12]', 'SYSTEM', 'Orchestration complete — risk: HIGH', 'done'],
              ].map(([ts, who, msg, kind], i) => (
                <div key={i} className="whitespace-pre-wrap">
                  <span className="text-emerald-900">{ts}</span>{' '}
                  <span className="text-emerald-500">[{who}]</span>{' '}
                  <span
                    className={
                      kind === 'warn'
                        ? 'text-orange-400'
                        : kind === 'ok'
                          ? 'text-emerald-300'
                          : kind === 'done'
                            ? 'text-emerald-200 font-semibold'
                            : 'text-emerald-500/90'
                    }
                  >
                    {msg}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA + deliverables list */}
          <div className="border border-emerald-800/50 bg-[#04100b] p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] tracking-[0.3em] uppercase text-emerald-400">
                Deliverables / 作战产出
              </span>
            </div>
            <ul className="space-y-3 flex-1 mb-5">
              <Deliverable
                color="#ff3b3b"
                icon={<AlertTriangle className="w-4 h-4" />}
                title="地缘 & 文化风险警报"
                desc="CRITICAL / HIGH / MEDIUM 三级风险卡 + 逐条缓解方案"
              />
              <Deliverable
                color="#00ff88"
                icon={<Radar className="w-4 h-4" />}
                title="T1 媒体雷达散点"
                desc="Trust Weight × Brand SOV 四象限，标记注入目标区"
              />
              <Deliverable
                color="#ffe066"
                icon={<Activity className="w-4 h-4" />}
                title="授权 JSON-LD 语料"
                desc="Schema.org Organization 结构，母语 description，即粘即用"
              />
            </ul>

            <Link
              href="/sea-command-center"
              className="group relative flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-[#05080d] font-bold tracking-[0.2em] uppercase text-sm transition shadow-[0_0_24px_rgba(0,255,140,0.35)]"
            >
              <Play className="w-4 h-4" />
              Deploy SEA Matrix
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <div className="mt-3 text-[10px] font-mono text-emerald-700 tracking-widest text-center">
              route · /sea-command-center · SSE streaming
            </div>
          </div>
        </motion.div>

        {/* comparison footnote */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-10 text-xs font-mono text-emerald-900/80 border-t border-emerald-900/40 pt-4 flex flex-wrap gap-x-6 gap-y-2 justify-between"
        >
          <span>
            <span className="text-emerald-600">◆</span> 单品牌 × 单战区的即时作战舰桥 —— 部署后可在页尾展开
            <span className="text-emerald-300"> 东南亚九国情报简报 </span>
            作为宏观底图参考
          </span>
          <span className="text-emerald-700">
            schema.org × SoftwareApplication · machine-readable
          </span>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function AgentCard({
  icon,
  codeName,
  cnName,
  model,
  accent,
  lines,
}: {
  icon: React.ReactNode;
  codeName: string;
  cnName: string;
  model: string;
  accent: string;
  lines: string[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="group relative border bg-[#050e0a] p-5 hover:bg-[#071510] transition"
      style={{ borderColor: `${accent}33` }}
    >
      <div
        className="absolute top-0 left-0 h-0.5 w-full opacity-60 group-hover:opacity-100 transition"
        style={{ backgroundColor: accent, boxShadow: `0 0 10px ${accent}` }}
      />
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-9 h-9 flex items-center justify-center border"
          style={{ borderColor: `${accent}66`, color: accent }}
        >
          {icon}
        </div>
        <div>
          <div className="text-sm font-bold tracking-wider text-white">{codeName}</div>
          <div className="text-[11px] text-gray-400 font-mono">{cnName}</div>
        </div>
      </div>
      <div
        className="text-[10px] font-mono tracking-widest uppercase mb-3 pb-2 border-b border-white/5"
        style={{ color: accent }}
      >
        {model}
      </div>
      <ul className="space-y-1.5 text-[12px] text-gray-300 leading-relaxed">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2">
            <span style={{ color: accent }}>⟶</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function Deliverable({
  color,
  icon,
  title,
  desc,
}: {
  color: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <div
        className="mt-0.5 shrink-0 w-7 h-7 flex items-center justify-center border"
        style={{ borderColor: `${color}66`, color }}
      >
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm font-bold text-white">{title}</div>
        <div className="text-[11px] text-gray-400 leading-relaxed mt-0.5">{desc}</div>
      </div>
    </li>
  );
}
