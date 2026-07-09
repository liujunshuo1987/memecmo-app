// Prompt intent classification — deterministic, tri-lingual (en / vi / zh).
//
// Presentation taxonomy per the CMO review: two client-facing classes instead
// of the five funnel stages (stages stay in the data as an internal signal).
//   high_intent — buying signals: who provides / best / price / compare /
//                 brand names / service+location / hire-buy-book
//   educational — everything else; AI rarely name-drops brands here, so a
//                 zero citation rate is NORMAL (these feed content topics).
//
// Deterministic on purpose: works on the FROZEN prompt library without
// regeneration (an LLM tagger would force a rebuild and break score
// comparability).

export type PromptIntent = 'high_intent' | 'educational';

const SIGNALS: RegExp[] = [
  // price / cost / quote
  /price|cost|pricing|how much|quote|budget|báo giá|chi phí|giá\b|bao nhiêu|ngân sách|价格|费用|多少钱|报价|预算/iu,
  // best / top / recommend / reputable
  /\bbest\b|\btop\b|recommend|most (trusted|reliable|popular)|nên chọn|tốt nhất|uy tín|hàng đầu|đáng tin|最好|推荐|靠谱|排名|哪家好/iu,
  // compare / vs
  /compare|comparison|\bvs\.?\b|versus|so sánh|hơn hay|nào (hơn|tốt)|对比|比较|还是/iu,
  // who provides / which company / vendor / agency
  /who (provides|offers|sells|does)|which (company|provider|agency|firm)|providers? of|vendors?|công ty nào|đơn vị nào|nhà cung cấp|bên nào|哪家公司|哪些公司|供应商|服务商|代理商/iu,
  // hire / buy / book / rent
  /\b(hire|buy|book|rent|order)\b|thuê|mua|đặt (lịch|hàng|quảng cáo)|购买|租用|预订|下单/iu,
  // explicit location-of-service intent
  /near me|ở đâu|tại (hà nội|tp\.?\s?hcm|hồ chí minh|đà nẵng|việt nam)|在哪里?买|附近的/iu,
];

/** Classify one prompt. Brand/competitor-named prompts are always high intent. */
export function classifyIntent(prompt: string, names: string[] = []): PromptIntent {
  const p = prompt.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  for (const n of names) {
    if (!n) continue;
    const nn = n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    if (nn.length >= 3 && p.includes(nn)) return 'high_intent';
  }
  return SIGNALS.some((re) => re.test(prompt)) ? 'high_intent' : 'educational';
}
