/**
 * Southeast Asia GEO Multi-Agent Orchestrator
 *
 * Runs 3 specialized agents in parallel via Poe API and streams results
 * back to the client via Server-Sent Events (SSE).
 *
 * Agents:
 *  - T1 Corpus Scout        → Claude-3.5-Sonnet  (local authoritative media analysis)
 *  - Geopolitical Guardian  → GPT-4o             (cultural / legal / geopolitical audit)
 *  - GEO Architect          → Gemini-3.1-Pro     (JSON-LD corpus generation)
 */

import { NextRequest } from 'next/server';
import axios from 'axios';
import { requireAuthAndRateLimit } from '@/lib/api-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Protected tier — auth required + per-user throttle (3 deployments / 10 min)
const RATE_LIMIT = { scope: 'sea-orchestrator', limit: 3, windowMs: 10 * 60_000 };

// ─── Types ─────────────────────────────────────────────────────────────────────

type AgentId =
  | 'corpus_scout'
  | 'geo_guardian'
  | 'competitor_scanner'
  | 'geo_diagnostician'
  | 'geo_architect';

interface OrchestratorRequest {
  brandName: string;
  targetCountry: 'Vietnam' | 'Indonesia' | 'Thailand' | string;
  brandHomepage?: string;
}

// Target-country analysis language map — every agent is forced to ground in
// the local-language media ecosystem, not the generic global view.
const COUNTRY_LANG: Record<string, { native: string; code: string; tld: string }> = {
  Vietnam: { native: '越南语 (Tiếng Việt)', code: 'vi', tld: '.vn' },
  Indonesia: { native: '印尼语 (Bahasa Indonesia)', code: 'id', tld: '.co.id / .id' },
  Thailand: { native: '泰语 (ภาษาไทย)', code: 'th', tld: '.co.th / .th' },
  Singapore: { native: '英语 + 华语 / 马来语 / 泰米尔语（新加坡英语主导，但双语信息常见）', code: 'en-SG', tld: '.sg / .com.sg' },
  Malaysia: { native: '马来语 (Bahasa Melayu) + 英语（城市双语）', code: 'ms', tld: '.my / .com.my' },
};

function countryCtx(country: string): { native: string; code: string; tld: string } {
  return COUNTRY_LANG[country] ?? { native: `${country} 当地母语`, code: 'xx', tld: '' };
}

interface AgentConfig {
  id: AgentId;
  displayName: string;
  codeName: string;
  /**
   * Ordered fallback chain of Poe bot handles. We try them left-to-right
   * because Poe's bot names are volatile (e.g. "Claude-3.5-Sonnet" vs
   * "Claude-Sonnet-3.5" vs "Claude-Sonnet-4") and depend on the user's
   * subscription tier.
   */
  poeBots: string[];
  buildPrompt: (brand: string, country: string, homepage: string) => string;
  expectsJson: boolean;
}

// ─── Agent Configuration ───────────────────────────────────────────────────────

const AGENTS: AgentConfig[] = [
  {
    id: 'corpus_scout',
    displayName: 'T1 语料勘探',
    codeName: 'T1 Corpus Scout',
    poeBots: [
      'Claude-Sonnet-4.5',
      'Claude-Sonnet-4',
      'Claude-3.7-Sonnet',
      'Claude-3.5-Sonnet',
      'Claude-3-Opus',
      'GPT-4o',
    ],
    expectsJson: true,
    buildPrompt: (brand, country, homepage) => {
      const ctx = countryCtx(country);
      return `你是一位东南亚 T1 媒体情报分析官 + 品牌实体研究员。
**分析锚点（必须严格遵守）**：
- 品牌名: "${brand}"
- 官网: ${homepage || '(未提供 — 请基于真实公开信息自行定位)'}
- 目标国: ${country}（本地母语：${ctx.native}，顶级域名：${ctx.tld}）

**工作方式**：以 ${ctx.native} 本地信息消费者的视角进行分析，而不是全球视角。识别该品牌在 ${country} 本地 T1 媒体（例如越南：VnExpress / CafeF / Tuổi Trẻ / Thanh Niên / Báo Chính Phủ；印尼：Kompas / Detik / Tempo / Bisnis.com；泰国：Bangkok Post / Thairath / Prachachat / Krungthep Turakij）中的认知度。

**重点**：必须先从品牌官网和公开信息确认该品牌**真实所属行业**（不要随便猜测），再判断它在 ${country} 本地媒体生态的真实覆盖。如果品牌在该国毫无存在感，要诚实说"尚未进入"。

严格以下列 JSON 结构返回（不要任何其他文字 / markdown）：

{
  "brand_profile": {
    "industry": "核心赛道（例如：跨境电商、即时零售、云服务、消费电子、金融科技、游戏发行等。必须足够具体，10字以内）",
    "industry_en": "Industry in English (same concept)",
    "sub_category": "细分定位（例如：东南亚 C2C 电商平台 / SaaS HR 工具，20字以内）",
    "description_native": "用 ${ctx.native} 写的一句话品牌描述（该国本地用户能看懂，40字以内）",
    "description_cn": "该描述的中文翻译",
    "local_presence": "NONE | ENTERING | ESTABLISHED | LEADER",
    "local_presence_reason": "判断本地存在感的理由（40字以内）"
  },
  "analysis_summary": "基于 ${country} 本地信息环境，一段关于该品牌在当地 T1 媒体生态的判断（80字以内，要诚实）",
  "media_nodes": [
    {
      "name": "媒体名称（必须是 ${country} 真实存在的本地媒体，不要编造）",
      "type": "财经 | 综合 | 科技 | 生活 | 官方 | 行业垂直",
      "trust_weight": 0-100,
      "brand_sov": 0-100,
      "priority": "HIGH | MEDIUM | LOW",
      "injection_strategy": "针对该媒体的语料注入方式（30字以内，必须与该行业相关）"
    }
  ]
}

要求：
1. industry 字段由你基于官网确认，不要用"科技/互联网"这种泛类。
2. media_nodes 必须与 industry 匹配（金融科技就找财经媒体，不要全塞综合媒体）。
3. brand_sov 如果确实是 0 请写 0，不要虚报。`;
    },
  },
  {
    id: 'geo_guardian',
    displayName: '地缘合规审计官',
    codeName: 'Geopolitical Guardian',
    poeBots: ['GPT-4o', 'GPT-4.1', 'GPT-4-Turbo', 'GPT-4', 'Claude-Sonnet-4.5'],
    expectsJson: true,
    buildPrompt: (brand, country, homepage) => `你是一位资深的东南亚地缘政治、文化冲突与广告法合规专家。
分析锚点：品牌=${brand}，官网=${homepage || '(未提供)'}，目标国=${country}。
**关键**：从 ${countryCtx(country).native} 本地监管和社会语境出发 — 相同一个风险在不同国家权重完全不同（越南侧重主权/历史，印尼侧重宗教/种族，泰国侧重王室/皇家象征）。
任务：对 "${brand}" 进入 ${country} 市场展开一次【严厉】的红线审计。

列出最容易触碰的 3 个风险点，每一项必须包含：文化禁忌（culture shock）或历史敏感点，或当地法律红线（如数据安全法、宗教、王室、地缘主权议题等）。

严格以下列 JSON 结构返回（不要任何其他文字）：

{
  "risk_level": "CRITICAL | HIGH | MODERATE",
  "executive_verdict": "一句话判决（30字以内，必须严厉）",
  "risks": [
    {
      "title": "风险点名称",
      "category": "文化禁忌 | 历史敏感 | 法律红线 | 宗教 | 地缘主权",
      "severity": "CRITICAL | HIGH | MEDIUM",
      "description": "具体描述为什么该品牌会触碰此风险（60字以内）",
      "mitigation": "规避该风险的具体动作（40字以内）"
    }
  ]
}

要求：必须严厉，不要安抚式语言。如果识别不到明显风险，也要指出潜在盲区而非说"无风险"。`,
  },
  {
    id: 'competitor_scanner',
    displayName: '区域竞品扫描',
    codeName: 'Competitor Scanner',
    poeBots: [
      'Claude-Sonnet-4.5',
      'Claude-Sonnet-4',
      'Claude-3.7-Sonnet',
      'Claude-3.5-Sonnet',
      'GPT-4o',
      'GPT-4.1',
    ],
    expectsJson: true,
    buildPrompt: (brand, country, homepage) => {
      const ctx = countryCtx(country);
      return `你是一位东南亚区域竞品情报分析师。
**分析锚点**：
- 品牌: "${brand}"
- 官网: ${homepage || '(未提供)'}
- 目标国: ${country}（本地域名后缀：${ctx.tld}）

**第一步（必做，不要省略）**：基于品牌官网和真实公开信息，确认该品牌所属的**具体行业和细分赛道**（例如 "跨境 C2C 电商" 而不是 "互联网"；"HR SaaS" 而不是 "软件"）。

**第二步**：只在该具体细分赛道内 & 在 ${country} 实际运营的玩家中挑选 5 个竞争对手。必须满足：
- 至少 3 个是 ${country} 真实存在且活跃运营的品牌
- 官网域名优先使用 ${ctx.tld} 或在 ${country} 可访问的真实域名
- 不得跨赛道拼凑（例如不要在 "跨境电商" 下列 "游戏公司"）
- 如果该赛道在 ${country} 确实竞争稀疏，宁可列 3 个也不要凑够 5 个胡编

严格以下列 JSON 结构返回（不要任何其他文字 / 解释 / markdown）：

{
  "industry": "品牌具体行业（10字以内，须与 Corpus Scout 结论一致）",
  "industry_en": "Industry in English",
  "sub_category": "细分赛道（20字以内）",
  "market_summary": "该赛道在 ${country} 的竞争格局一句话（40字以内）",
  "competitors": [
    {
      "name": "品牌名（官方拼写）",
      "origin": "本地 | 跨国 | 区域",
      "homepage": "官方主页 URL（必须真实可访问，带 https://，优先用 ${ctx.tld} 域名）",
      "domain": "主域名（不带协议，例如 shopee.vn）",
      "category": "必须等于上面 industry + sub_category 组合之一",
      "threat_level": "HIGH | MEDIUM | LOW",
      "local_positioning": "该竞品在 ${country} 的本地化定位（40字以内，用 ${ctx.native} 或中文）",
      "key_strength": "最核心的护城河（30字以内）"
    }
  ]
}

**硬性要求**：homepage 必须是该品牌真实的官方域名（例如越南：shopee.vn、tiki.vn、sendo.vn、lazada.vn / 印尼：tokopedia.com、bukalapak.com、blibli.com / 泰国：lazada.co.th、central.co.th），不可编造。所有 competitor 的 category 必须属于同一细分赛道。`;
    },
  },
  {
    id: 'geo_diagnostician',
    displayName: 'GEO 六维诊断',
    codeName: 'GEO Diagnostician',
    poeBots: [
      'Claude-Sonnet-4.5',
      'Claude-Sonnet-4',
      'Claude-3.7-Sonnet',
      'GPT-4o',
      'GPT-4.1',
      'Gemini-2.5-Pro',
    ],
    expectsJson: true,
    buildPrompt: (brand, country, homepage) => `你是一位生成式引擎优化 (GEO) 与答案引擎优化 (AEO) 领域的首席诊断师。
**分析锚点**：品牌=${brand}；官网=${homepage || '(未提供)'}；目标国=${country}（本地语：${countryCtx(country).native}）。
**关键方法论**：你的评估必须站在"${country} 本地用户用 ${countryCtx(country).native} 向主流 LLM 提问时，${brand} 会如何被召回"的视角，而不是英文全球视角。
任务：以"LLM 如何看见 ${brand} 在 ${country}"为第一性原理，从 6 个互相独立的信号轴 (E1-E6) 出发，输出一份严谨的诊断报告。

【六维体系的定义 — 必须严格对齐】
E1 Entity Canonicality 实体权威性：Wikidata / Wikipedia / LinkedIn / Crunchbase 实体解析链完整度。
E2 Corpus Density 语料密度：T1 区域媒体中品牌的提及频次 × 时效 × 情感分布。
E3 Query SOV 问题声量：在 ${country} 语境的意图查询集合中，品牌被 LLM 答出的比率和位次。
E4 Semantic Anchoring 语义锚定：品牌与目标类目/用例关键词的共现强度（即 LLM 是否会在"对的问题"里召回你）。
E5 Citation Authority 引用信任度：提及源自身的权重（Wikipedia > 主流媒体 > 行业媒体 > 博客/论坛）。
E6 Answer Inclusion 答案命中率：直接品牌查询的事实准确度 + 类目查询的首轮命中率（反幻觉）。

【诊断要求】
1. 每个维度必须给出 0-100 的分数（请结合你对该品牌在 ${country} 真实公开信息的评估，不要用 50 做安全分）。
2. 每个维度必须列出 2-3 条"证据要点"(evidence)，具体说明为什么打这个分（引用真实现象：如"Wikipedia 英文版存在但无越南语版"）。
3. 每个维度必须给出 1-2 条"差距诊断"(gap)，说明与理想状态的具体距离。
4. 产出一个【区域意图查询矩阵】：6 条典型的 ${country} 本地用户意图查询（覆盖 awareness / consideration / comparison / purchase / support / crisis 六种阶段），对每条预测品牌在主流 LLM (GPT/Claude/Gemini) 答案中的可见度位次（1=首位，2-3=被提到，4=偶尔，5=不出现），并同时预测最可能的前 2 个竞争对手的位次。
5. 最后产出一份【处方清单】：5-8 条具体动作，每条挂唯一维度标签 (E1..E6)，并标注 impact (HIGH/MEDIUM/LOW) 与 effort (HIGH/MEDIUM/LOW)。按 impact desc, effort asc 排序。

严格以下列 JSON 结构返回（不要任何其他文字 / 解释 / markdown）：

{
  "scorecard": [
    {
      "axis": "E1",
      "axis_name_zh": "实体权威性",
      "axis_name_en": "Entity Canonicality",
      "score": 0-100,
      "evidence": ["具体证据1（40字）", "具体证据2（40字）"],
      "gap": "与理想状态的核心差距（50字以内）"
    }
    // ...E1 到 E6 共 6 条
  ],
  "overall_score": 0-100,
  "verdict": "一句话总体判决（50字以内，必须可操作化）",
  "query_matrix": {
    "queries": [
      {
        "stage": "awareness | consideration | comparison | purchase | support | crisis",
        "query_native": "用 ${country} 本地语言写的该意图查询原文",
        "query_cn": "该查询的中文翻译",
        "brand_rank": 1-5,
        "competitor_ranks": [
          {"name": "竞品A", "rank": 1-5},
          {"name": "竞品B", "rank": 1-5}
        ],
        "diagnosis": "对该查询可见度的一句话诊断（40字以内）"
      }
      // 6 条，一种 stage 一条
    ]
  },
  "prescriptions": [
    {
      "id": "P1",
      "axis": "E1|E2|E3|E4|E5|E6",
      "action": "具体动作（60字以内，动词开头）",
      "rationale": "为什么这条能提升对应维度（50字以内）",
      "impact": "HIGH | MEDIUM | LOW",
      "effort": "HIGH | MEDIUM | LOW",
      "time_to_signal": "预计多长时间在 LLM 答案中体现（如 2-4周 / 1-3月 / 3-6月）",
      "example_assets": ["具体产物示例1", "具体产物示例2"]
    }
    // 5-8 条
  ]
}

关键：rank 含义 —— 1: 首选答案的首位；2-3: 答案中被明确提到；4: 偶尔出现；5: 从不出现。不要所有都打 3（那是惰性回答）。`,
  },
  {
    id: 'geo_architect',
    displayName: '高阶语料生成',
    codeName: 'GEO Architect',
    poeBots: [
      'Gemini-2.5-Pro',
      'Gemini-2.0-Pro',
      'Gemini-2.0-Flash',
      'Gemini-1.5-Pro',
      'Gemini-1.5-Pro-128K',
      'Claude-Sonnet-4.5',
      'GPT-4o',
    ],
    expectsJson: true,
    buildPrompt: (brand, country, homepage) => {
      const nativeLang = countryCtx(country).native;

      return `你是一位顶级的东南亚 GEO（生成式引擎优化）语料建筑师。
**分析锚点**：品牌=${brand}；官网=${homepage || '(未提供)'}；目标国=${country}。
**写作前必做**：从官网和公开信息确认该品牌真实所属行业，只写该行业内成立的声明（不要写泛泛的"科技创新公司"，要写具体业务）。
任务：为 "${brand}" 在 ${country} 市场撰写一段带有技术权威感的高转化率品牌定位声明。

要求：
1. 使用 ${nativeLang}，不要中文、不要英文、不要混合。
2. 约 150 字（该语言的自然长度）。
3. 规避所有明显的文化禁忌 / 法律红线（默认对王室、宗教、主权话题保持中立）。
4. 包装为可被大模型爬取的 JSON-LD (Schema.org Organization) 结构。

严格以下列 JSON 结构返回（不要任何其他文字 / 解释 / markdown）：

{
  "language": "vi | id | th",
  "native_statement": "150 字的母语品牌定位声明",
  "english_gloss": "该声明的英文直译（帮助审校用）",
  "jsonld": {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "${brand}",
    "description": "用母语写的 description",
    "knowsAbout": ["<keyword1>", "<keyword2>", "<keyword3>"],
    "areaServed": "${country}",
    "inLanguage": "vi | id | th"
  }
}`;
    },
  },
];

// ─── SSE Helper ────────────────────────────────────────────────────────────────

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─── Poe API Call ──────────────────────────────────────────────────────────────

async function callPoeBot(
  bot: string,
  prompt: string,
  apiKey: string,
): Promise<{ success: boolean; content: string; error?: string; status?: number; latencyMs: number }> {
  const started = Date.now();
  try {
    const response = await axios.post(
      'https://api.poe.com/v1/chat/completions',
      {
        model: bot,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 1500,
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60_000,
      },
    );

    const content: string = response.data?.choices?.[0]?.message?.content ?? '';
    return { success: true, content, latencyMs: Date.now() - started };
  } catch (err) {
    let message = 'unknown error';
    let status: number | undefined;
    if (axios.isAxiosError(err)) {
      status = err.response?.status;
      const data = err.response?.data;
      // Poe responses vary: {error:{message}}, {error:"..."}, plain string, or HTML for upstream failures.
      if (typeof data === 'string') {
        message = data.slice(0, 240);
      } else if (data?.error?.message) {
        message = data.error.message;
      } else if (typeof data?.error === 'string') {
        message = data.error;
      } else if (data?.message) {
        message = data.message;
      } else {
        message = err.message;
      }
    } else {
      message = String(err);
    }
    return { success: false, content: '', error: message, status, latencyMs: Date.now() - started };
  }
}

/**
 * Try each bot handle in order until one succeeds. Reports every attempt
 * back to the caller so the terminal stream can surface what was tried.
 */
async function callPoeAgentWithFallback(
  bots: string[],
  prompt: string,
  apiKey: string,
  onAttempt?: (bot: string, ok: boolean, msg: string) => void,
): Promise<{
  success: boolean;
  content: string;
  error?: string;
  latencyMs: number;
  botUsed?: string;
  attempts: Array<{ bot: string; ok: boolean; status?: number; error?: string }>;
}> {
  const attempts: Array<{ bot: string; ok: boolean; status?: number; error?: string }> = [];
  let totalLatency = 0;

  for (const bot of bots) {
    const result = await callPoeBot(bot, prompt, apiKey);
    totalLatency += result.latencyMs;
    attempts.push({
      bot,
      ok: result.success,
      status: result.status,
      error: result.error,
    });

    if (result.success) {
      onAttempt?.(bot, true, `ok (${result.latencyMs}ms)`);
      return {
        success: true,
        content: result.content,
        latencyMs: totalLatency,
        botUsed: bot,
        attempts,
      };
    }

    onAttempt?.(bot, false, `${result.status ?? '-'} ${result.error ?? ''}`);

    // On auth errors there is no point trying other bots — key is bad.
    if (result.status === 401 || result.status === 403) {
      return {
        success: false,
        content: '',
        error: `auth failed on ${bot}: ${result.error}`,
        latencyMs: totalLatency,
        attempts,
      };
    }
  }

  return {
    success: false,
    content: '',
    error: `all ${bots.length} bot candidates failed`,
    latencyMs: totalLatency,
    attempts,
  };
}

// Attempt to parse model JSON output robustly (strips markdown fences, trailing commentary)
function safeParseJson(raw: string): unknown | null {
  if (!raw) return null;
  let s = raw.trim();
  // strip ```json ... ``` fences
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  // find first { and last } — best-effort extraction
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    s = s.slice(first, last + 1);
  }
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const guard = await requireAuthAndRateLimit(req, RATE_LIMIT);
  if ('response' in guard) return guard.response;

  let body: OrchestratorRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { brandName, targetCountry, brandHomepage } = body;
  // Normalize homepage: if user entered bare domain, add https://
  let normalizedHomepage = (brandHomepage ?? '').trim();
  if (normalizedHomepage && !/^https?:\/\//i.test(normalizedHomepage)) {
    normalizedHomepage = 'https://' + normalizedHomepage;
  }
  if (!brandName || !targetCountry) {
    return new Response(
      JSON.stringify({ error: 'brandName and targetCountry are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const apiKey = process.env.POE_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'POE_API_KEY not configured on server' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      // Boot event
      send('boot', {
        brandName,
        targetCountry,
        brandHomepage: normalizedHomepage || null,
        agents: AGENTS.map((a) => ({
          id: a.id,
          displayName: a.displayName,
          codeName: a.codeName,
          bot: a.poeBots[0],
          botCandidates: a.poeBots,
        })),
        startedAt: new Date().toISOString(),
      });

      // Emit "agent:start" for each agent
      for (const agent of AGENTS) {
        send('agent:start', {
          id: agent.id,
          displayName: agent.displayName,
          codeName: agent.codeName,
          bot: agent.poeBots[0],
          botCandidates: agent.poeBots,
          message: `[${agent.codeName}] spinning up — target=${targetCountry}, brand=${brandName}`,
          timestamp: new Date().toISOString(),
        });
      }

      // Kick off all agents in parallel. Emit each agent's "done" as it completes.
      const tasks = AGENTS.map(async (agent) => {
        const prompt = agent.buildPrompt(brandName, targetCountry, normalizedHomepage);

        // Stream a log line so the terminal shows activity
        send('agent:log', {
          id: agent.id,
          line: `[${agent.codeName}] ⟶ dispatching — fallback chain: ${agent.poeBots.join(' → ')} (prompt len=${prompt.length})`,
          timestamp: new Date().toISOString(),
        });

        const result = await callPoeAgentWithFallback(
          agent.poeBots,
          prompt,
          apiKey,
          (bot, ok, msg) => {
            send('agent:log', {
              id: agent.id,
              line: ok
                ? `[${agent.codeName}]   ✓ ${bot} — ${msg}`
                : `[${agent.codeName}]   ✗ ${bot} — ${msg}`,
              timestamp: new Date().toISOString(),
            });
          },
        );

        if (!result.success) {
          send('agent:error', {
            id: agent.id,
            displayName: agent.displayName,
            codeName: agent.codeName,
            error: result.error,
            attempts: result.attempts,
            latencyMs: result.latencyMs,
            timestamp: new Date().toISOString(),
          });
          return { agent, payload: null, raw: '', error: result.error };
        }

        send('agent:log', {
          id: agent.id,
          line: `[${agent.codeName}] ⟵ received ${result.content.length} chars via ${result.botUsed} in ${result.latencyMs}ms`,
          timestamp: new Date().toISOString(),
        });

        const parsed = agent.expectsJson ? safeParseJson(result.content) : result.content;

        send('agent:done', {
          id: agent.id,
          displayName: agent.displayName,
          codeName: agent.codeName,
          bot: result.botUsed,
          botCandidates: agent.poeBots,
          parsed,
          raw: result.content,
          latencyMs: result.latencyMs,
          timestamp: new Date().toISOString(),
        });

        return { agent, payload: parsed, raw: result.content };
      });

      const settled = await Promise.allSettled(tasks);

      // Build consolidated geopolitical-risk-adjusted final bundle
      const bundle: Record<string, unknown> = {};
      for (const s of settled) {
        if (s.status === 'fulfilled' && s.value) {
          bundle[s.value.agent.id] = {
            parsed: s.value.payload,
            raw: s.value.raw,
          };
        }
      }

      // Final "complete" event — frontend uses this to build the top-level verdict banner
      const guardian = bundle.geo_guardian as { parsed?: { risk_level?: string } } | undefined;
      const riskLevel = guardian?.parsed?.risk_level ?? 'UNKNOWN';

      send('complete', {
        brandName,
        targetCountry,
        riskLevel,
        bundle,
        completedAt: new Date().toISOString(),
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
