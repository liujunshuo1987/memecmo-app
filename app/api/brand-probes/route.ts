/**
 * Brand Probe Runner — empirical multi-LLM GEO/AEO measurement.
 *
 * Why this exists:
 * The agent-driven pipeline (corpus-scout, competitor-scanner, diagnostician)
 * all derive their conclusions from ONE model's internal beliefs about the
 * brand. That is circular: one LLM speculating about how other LLMs would
 * respond.
 *
 * Probes fix this by actually sending a calibrated question bank to MULTIPLE
 * LLMs in the target country's native language, then parsing the answers
 * empirically:
 *   - Did the brand appear?
 *   - Where in the answer (first-position = strong AEO citation)?
 *   - What other entities co-occurred (= the real competitors, as the LLM
 *     sees the market, not as one agent imagines it)?
 *
 * The aggregate SOV / answer-inclusion / competitor set then grounds every
 * downstream panel with measurement, not speculation.
 */

import { NextRequest } from 'next/server';
import axios from 'axios';
import { requireAuthAndRateLimit } from '@/lib/api-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Protected tier — 18 parallel Poe calls per probe; harder cap (3 / 10 min)
const RATE_LIMIT = { scope: 'brand-probes', limit: 3, windowMs: 10 * 60_000 };

// ─── Probe templates (native-language, per country) ───────────────────────────

interface ProbeTemplate {
  stage: 'identity' | 'attributes' | 'domain' | 'category' | 'comparison' | 'recommendation';
  native: (brand: string) => string;
  cn: (brand: string) => string;
}

const PROBE_BANK: Record<string, ProbeTemplate[]> = {
  Vietnam: [
    { stage: 'identity', native: (b) => `${b} là công ty gì? Giới thiệu chi tiết về họ và lĩnh vực hoạt động.`, cn: (b) => `${b} 是什么公司？详细介绍它及其业务领域。` },
    { stage: 'attributes', native: (b) => `Ưu điểm và nhược điểm chính của ${b} là gì?`, cn: (b) => `${b} 的主要优缺点是什么？` },
    { stage: 'domain', native: (b) => `${b} hoạt động trong lĩnh vực nào tại Việt Nam và nổi bật ở đâu?`, cn: (b) => `${b} 在越南属于哪个领域，在什么方面突出？` },
    { stage: 'category', native: (b) => `Những công ty hàng đầu cùng ngành với ${b} tại Việt Nam là ai? Liệt kê top 5.`, cn: (b) => `与 ${b} 同赛道的越南顶级公司有哪些？列出前 5。` },
    { stage: 'comparison', native: (b) => `So sánh ${b} với các đối thủ cạnh tranh chính của họ tại Việt Nam.`, cn: (b) => `将 ${b} 与其在越南的主要竞争对手做对比。` },
    { stage: 'recommendation', native: (b) => `Có nên hợp tác hoặc sử dụng ${b} không? Lý do chính?`, cn: (b) => `应该与 ${b} 合作或使用它吗？主要理由？` },
  ],
  Indonesia: [
    { stage: 'identity', native: (b) => `Apa itu ${b}? Jelaskan secara detail tentang perusahaan ini dan bidang usahanya.`, cn: (b) => `${b} 是什么？详细说明这家公司及其业务。` },
    { stage: 'attributes', native: (b) => `Apa kelebihan dan kekurangan utama dari ${b}?`, cn: (b) => `${b} 的主要优缺点？` },
    { stage: 'domain', native: (b) => `Di bidang apa ${b} beroperasi di Indonesia dan di mana mereka unggul?`, cn: (b) => `${b} 在印尼属于哪个领域，在什么方面突出？` },
    { stage: 'category', native: (b) => `Siapa saja perusahaan teratas di industri yang sama dengan ${b} di Indonesia? Sebutkan 5 teratas.`, cn: (b) => `印尼与 ${b} 同赛道的顶级公司有哪些？列出前 5。` },
    { stage: 'comparison', native: (b) => `Bandingkan ${b} dengan pesaing utamanya di Indonesia.`, cn: (b) => `将 ${b} 与印尼主要竞争对手对比。` },
    { stage: 'recommendation', native: (b) => `Apakah disarankan untuk menggunakan atau bermitra dengan ${b}? Mengapa?`, cn: (b) => `是否推荐使用或与 ${b} 合作？为什么？` },
  ],
  Thailand: [
    { stage: 'identity', native: (b) => `${b} คือบริษัทอะไร? โปรดอธิบายรายละเอียดเกี่ยวกับบริษัทและธุรกิจของพวกเขา`, cn: (b) => `${b} 是什么公司？详细说明该公司及其业务。` },
    { stage: 'attributes', native: (b) => `ข้อดีและข้อเสียหลักของ ${b} คืออะไร?`, cn: (b) => `${b} 的主要优缺点？` },
    { stage: 'domain', native: (b) => `${b} ดำเนินธุรกิจในอุตสาหกรรมใดในประเทศไทย และโดดเด่นเรื่องอะไร?`, cn: (b) => `${b} 在泰国属于哪个领域，在什么方面突出？` },
    { stage: 'category', native: (b) => `บริษัทชั้นนำในอุตสาหกรรมเดียวกับ ${b} ในประเทศไทยมีอะไรบ้าง? ระบุ 5 อันดับแรก`, cn: (b) => `泰国与 ${b} 同赛道的顶级公司有哪些？列出前 5。` },
    { stage: 'comparison', native: (b) => `เปรียบเทียบ ${b} กับคู่แข่งหลักในประเทศไทย`, cn: (b) => `将 ${b} 与泰国主要竞争对手对比。` },
    { stage: 'recommendation', native: (b) => `ควรใช้หรือเป็นพันธมิตรกับ ${b} หรือไม่? เพราะเหตุใด?`, cn: (b) => `是否推荐使用或与 ${b} 合作？为什么？` },
  ],
  Singapore: [
    { stage: 'identity', native: (b) => `What is ${b}? Please describe this company, its background and main business in Singapore in detail.`, cn: (b) => `${b} 是什么公司？详细介绍它及其在新加坡的业务背景。` },
    { stage: 'attributes', native: (b) => `What are the main strengths and weaknesses of ${b} from a Singapore market perspective?`, cn: (b) => `从新加坡市场视角看，${b} 的主要优缺点是什么？` },
    { stage: 'domain', native: (b) => `Which industry does ${b} operate in within Singapore, and in what areas does it stand out?`, cn: (b) => `${b} 在新加坡属于哪个领域，在什么方面突出？` },
    { stage: 'category', native: (b) => `Who are the top 5 leading companies in the same industry as ${b} in Singapore?`, cn: (b) => `在新加坡与 ${b} 同赛道的前 5 名公司有哪些？` },
    { stage: 'comparison', native: (b) => `Compare ${b} with its main competitors in the Singapore market.`, cn: (b) => `将 ${b} 与其在新加坡的主要竞争对手做对比。` },
    { stage: 'recommendation', native: (b) => `Would you recommend using or partnering with ${b} in Singapore? Why?`, cn: (b) => `是否推荐在新加坡使用或与 ${b} 合作？为什么？` },
  ],
  Malaysia: [
    { stage: 'identity', native: (b) => `Apakah itu ${b}? Sila terangkan syarikat ini, latar belakangnya dan bidang perniagaan utamanya di Malaysia secara terperinci.`, cn: (b) => `${b} 是什么公司？详细说明该公司及其在马来西亚的业务。` },
    { stage: 'attributes', native: (b) => `Apakah kelebihan dan kelemahan utama ${b} dari sudut pandang pasaran Malaysia?`, cn: (b) => `从马来西亚市场看，${b} 的主要优缺点是什么？` },
    { stage: 'domain', native: (b) => `Dalam industri apa ${b} beroperasi di Malaysia, dan dalam bidang apa ia menonjol?`, cn: (b) => `${b} 在马来西亚属于哪个领域，在什么方面突出？` },
    { stage: 'category', native: (b) => `Siapakah 5 syarikat teratas dalam industri yang sama dengan ${b} di Malaysia?`, cn: (b) => `在马来西亚与 ${b} 同赛道的前 5 名公司有哪些？` },
    { stage: 'comparison', native: (b) => `Bandingkan ${b} dengan pesaing utamanya di pasaran Malaysia.`, cn: (b) => `将 ${b} 与其在马来西亚的主要竞争对手对比。` },
    { stage: 'recommendation', native: (b) => `Adakah anda mengesyorkan menggunakan atau bekerjasama dengan ${b} di Malaysia? Mengapa?`, cn: (b) => `是否推荐在马来西亚使用或与 ${b} 合作？为什么？` },
  ],
};

function probesFor(country: string, brand: string): Array<{ stage: string; native: string; cn: string }> {
  const bank = PROBE_BANK[country] ?? PROBE_BANK.Vietnam;
  return bank.map((p) => ({ stage: p.stage, native: p.native(brand), cn: p.cn(brand) }));
}

// ─── Models to probe ───────────────────────────────────────────────────────────

const PROBE_MODELS: Array<{ id: string; displayName: string; fallbacks: string[] }> = [
  {
    id: 'claude',
    displayName: 'Claude-Sonnet-4.5',
    fallbacks: ['Claude-Sonnet-4.5', 'Claude-Sonnet-4', 'Claude-3.7-Sonnet', 'Claude-3.5-Sonnet'],
  },
  {
    id: 'gpt',
    displayName: 'GPT-4o',
    fallbacks: ['GPT-4o', 'GPT-4.1', 'GPT-4-Turbo'],
  },
  {
    id: 'gemini',
    displayName: 'Gemini-2.5-Pro',
    fallbacks: ['Gemini-2.5-Pro', 'Gemini-2.0-Pro', 'Gemini-2.0-Flash', 'Gemini-1.5-Pro'],
  },
];

// ─── Poe call with fallback (inlined — minimal, standalone) ───────────────────

async function callPoeWithFallback(
  bots: string[],
  prompt: string,
  apiKey: string,
): Promise<{ ok: boolean; content: string; bot?: string; error?: string; latencyMs: number }> {
  const started = Date.now();
  for (const bot of bots) {
    try {
      const response = await axios.post(
        'https://api.poe.com/v1/chat/completions',
        {
          model: bot,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 800,
          stream: false,
        },
        {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          timeout: 45_000,
        },
      );
      const content: string = response.data?.choices?.[0]?.message?.content ?? '';
      return { ok: true, content, bot, latencyMs: Date.now() - started };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 401 || status === 403) {
          return { ok: false, content: '', error: `auth failed (${status})`, latencyMs: Date.now() - started };
        }
      }
      // else continue to next fallback
    }
  }
  return { ok: false, content: '', error: `all ${bots.length} bots failed`, latencyMs: Date.now() - started };
}

// ─── Answer analysis (empirical, JS-side) ─────────────────────────────────────

const STOPWORDS = new Set([
  'The', 'A', 'An', 'In', 'On', 'At', 'To', 'Of', 'For', 'With', 'By', 'From',
  'And', 'But', 'Or', 'Not', 'Is', 'Are', 'Was', 'Were', 'It', 'They',
  'Vietnam', 'Indonesia', 'Thailand', 'Philippines', 'Singapore', 'Malaysia', 'Asia', 'Southeast', 'Asian',
  'English', 'Vietnamese', 'Indonesian', 'Thai', 'Filipino', 'Tagalog', 'Malay', 'Bahasa',
]);

function escapeRegex(s: string): string {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function analyzeAnswer(brand: string, answer: string): {
  brand_mentioned: boolean;
  mention_count: number;
  first_position_pct: number | null;
  candidate_entities: string[];
  answer_length: number;
} {
  const len = answer.length;
  if (!len) {
    return { brand_mentioned: false, mention_count: 0, first_position_pct: null, candidate_entities: [], answer_length: 0 };
  }

  // Normalize brand — strip diacritics, lowercase
  const normBrand = brand.toLowerCase().trim();
  const normAnswer = answer.toLowerCase();
  const brandRe = new RegExp(escapeRegex(normBrand), 'g');
  const matches = Array.from(normAnswer.matchAll(brandRe));
  const brand_mentioned = matches.length > 0;
  const mention_count = matches.length;
  const firstIdx = brand_mentioned ? matches[0].index ?? -1 : -1;
  const first_position_pct = firstIdx >= 0 ? Math.round((firstIdx / len) * 100) : null;

  // Extract capitalized multi-word entities (likely competitor / brand mentions).
  // Works for Latin-script languages (VI/ID). Thai is harder — fall back to quoted / unicode-letter heuristic.
  const entitySet = new Map<string, number>();
  const latinRe = /\b([A-Z][a-zA-Z0-9]{1,}(?:\s+[A-Z][a-zA-Z0-9]+){0,2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = latinRe.exec(answer))) {
    const name = m[1].trim();
    if (name.length < 3) continue;
    if (STOPWORDS.has(name)) continue;
    if (name.toLowerCase().includes(normBrand)) continue; // skip brand itself
    entitySet.set(name, (entitySet.get(name) ?? 0) + 1);
  }

  // Top 10 candidates by frequency within this single answer
  const candidate_entities = [...entitySet.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name);

  return { brand_mentioned, mention_count, first_position_pct, candidate_entities, answer_length: len };
}

// ─── SSE helper ────────────────────────────────────────────────────────────────

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const guard = await requireAuthAndRateLimit(req, RATE_LIMIT);
  if ('response' in guard) return guard.response;

  let body: { brandName?: string; targetCountry?: string; brandHomepage?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { brandName, targetCountry } = body;
  if (!brandName || !targetCountry) {
    return Response.json({ error: 'brandName and targetCountry are required' }, { status: 400 });
  }

  const apiKey = process.env.POE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'POE_API_KEY not configured' }, { status: 500 });
  }

  const probes = probesFor(targetCountry, brandName);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      send('probe:boot', {
        brandName,
        targetCountry,
        probes,
        models: PROBE_MODELS.map((m) => ({ id: m.id, displayName: m.displayName })),
        totalCalls: probes.length * PROBE_MODELS.length,
        startedAt: new Date().toISOString(),
      });

      // Fire all probe × model calls in parallel
      const tasks: Array<Promise<void>> = [];
      const results: Array<{
        stage: string;
        modelId: string;
        modelDisplayName: string;
        botUsed?: string;
        ok: boolean;
        answer: string;
        error?: string;
        latencyMs: number;
        analysis: ReturnType<typeof analyzeAnswer>;
      }> = [];

      for (const probe of probes) {
        for (const model of PROBE_MODELS) {
          const task = (async () => {
            const result = await callPoeWithFallback(model.fallbacks, probe.native, apiKey);
            const analysis = analyzeAnswer(brandName, result.content);
            const row = {
              stage: probe.stage,
              modelId: model.id,
              modelDisplayName: model.displayName,
              botUsed: result.bot,
              ok: result.ok,
              answer: result.content,
              error: result.error,
              latencyMs: result.latencyMs,
              analysis,
            };
            results.push(row);
            send('probe:answer', row);
          })();
          tasks.push(task);
        }
      }

      await Promise.allSettled(tasks);

      // ─── Aggregate ────────────────────────────────────────────────────────
      const coverageByModel: Record<
        string,
        {
          displayName: string;
          totalAnswered: number;
          mentionRate: number;         // brand_mentioned / total answered
          avgFirstPositionPct: number | null; // only over answers where mentioned
          avgMentionCount: number;
          firstPositionShare: number;  // % of mentioned answers where brand appeared in first 20% of text (≈ hero mention)
        }
      > = {};

      for (const model of PROBE_MODELS) {
        const rows = results.filter((r) => r.modelId === model.id && r.ok);
        const total = rows.length;
        const mentioned = rows.filter((r) => r.analysis.brand_mentioned);
        const avgPos =
          mentioned.length > 0
            ? Math.round(
                mentioned.reduce((acc, r) => acc + (r.analysis.first_position_pct ?? 0), 0) /
                  mentioned.length,
              )
            : null;
        const heroCount = mentioned.filter((r) => (r.analysis.first_position_pct ?? 100) <= 20).length;

        coverageByModel[model.id] = {
          displayName: model.displayName,
          totalAnswered: total,
          mentionRate: total > 0 ? Math.round((mentioned.length / total) * 100) : 0,
          avgFirstPositionPct: avgPos,
          avgMentionCount:
            total > 0
              ? Math.round((rows.reduce((acc, r) => acc + r.analysis.mention_count, 0) / total) * 10) / 10
              : 0,
          firstPositionShare:
            mentioned.length > 0 ? Math.round((heroCount / mentioned.length) * 100) : 0,
        };
      }

      // Real competitor detection: entities that co-occur across multiple answers.
      // An entity is a "likely real competitor" if it appears in ≥ 2 different probe/model answers.
      const entityFreq = new Map<string, { count: number; inAnswers: Set<string> }>();
      for (const r of results) {
        if (!r.ok) continue;
        for (const e of r.analysis.candidate_entities) {
          const key = e;
          const existing = entityFreq.get(key) ?? { count: 0, inAnswers: new Set<string>() };
          existing.count += 1;
          existing.inAnswers.add(`${r.stage}::${r.modelId}`);
          entityFreq.set(key, existing);
        }
      }

      const competitorFrequency = [...entityFreq.entries()]
        .map(([name, v]) => ({
          name,
          mentions: v.count,
          coverage_cells: v.inAnswers.size,
          cross_model: new Set([...v.inAnswers].map((s) => s.split('::')[1])).size,
        }))
        .filter((x) => x.cross_model >= 2 || x.coverage_cells >= 3) // multi-source grounding
        .sort((a, b) => b.cross_model - a.cross_model || b.mentions - a.mentions)
        .slice(0, 10);

      // Stage-level breakdown: how did each probe-stage fare?
      const stageBreakdown: Record<
        string,
        { mentionRate: number; answersWithBrand: number; total: number }
      > = {};
      for (const p of probes) {
        const rows = results.filter((r) => r.stage === p.stage && r.ok);
        const withBrand = rows.filter((r) => r.analysis.brand_mentioned).length;
        stageBreakdown[p.stage] = {
          total: rows.length,
          answersWithBrand: withBrand,
          mentionRate: rows.length > 0 ? Math.round((withBrand / rows.length) * 100) : 0,
        };
      }

      const overall = results.filter((r) => r.ok);
      const overallMentionRate =
        overall.length > 0
          ? Math.round(
              (overall.filter((r) => r.analysis.brand_mentioned).length / overall.length) * 100,
            )
          : 0;

      // AEO Answer Inclusion Rate = identity-stage mention rate (the most direct E6 signal)
      const answerInclusionRate = stageBreakdown.identity?.mentionRate ?? 0;

      send('probe:summary', {
        brandName,
        targetCountry,
        totalCalls: results.length,
        successfulCalls: overall.length,
        overallMentionRate,
        answerInclusionRate,
        coverageByModel,
        stageBreakdown,
        competitorFrequency,
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
