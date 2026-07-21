// US state regulatory frames — the state-aware grounding layer (us.memecmo.ai).
//
// Same architectural slot as brand facts: a deterministic text block injected
// into every content agent's prompt, so state-compliant output is a property
// of construction, not hope. Frames are DIRECTIONAL summaries of well-known
// state-level regimes (not legal advice — the injected block says so and the
// standing process is counsel review before publication).
//
// Coverage: Tier-1 states (CA / TX / FL / NY) × regulated verticals, plus a
// general per-state frame (privacy statute + advertising posture). Returns ''
// for non-US markets — zero effect on the SEA pipeline.

type Vertical = 'legal' | 'insurance' | 'healthcare' | 'home_services' | 'cannabis' | 'solar' | null;

const STATE_ALIAS: Record<string, string> = {
  'california, us': 'California', 'texas, us': 'Texas', 'florida, us': 'Florida', 'new york, us': 'New York',
  california: 'California', texas: 'Texas', florida: 'Florida', 'new york': 'New York',
};

function detectVertical(industry?: string | null): Vertical {
  const s = (industry || '').toLowerCase();
  if (/legal|law|attorney|lawyer/.test(s)) return 'legal';
  if (/insurance/.test(s)) return 'insurance';
  if (/health|medical|telehealth|clinic|dental/.test(s)) return 'healthcare';
  if (/home|hvac|plumb|roof|contractor|repair|clean/.test(s)) return 'home_services';
  if (/cannabis|cbd|dispensar/.test(s)) return 'cannabis';
  if (/solar|energy/.test(s)) return 'solar';
  return null;
}

// General frame per state: privacy statute + advertising posture.
const GENERAL: Record<string, string[]> = {
  California: [
    'Consumer privacy is governed by CCPA/CPRA — avoid implying collection or sale of personal data without notice; honor "do not sell/share" language.',
    'California consumer-protection law (UCL/FAL) is aggressively enforced — every factual product claim should be substantiable.',
  ],
  Texas: [
    'Texas Data Privacy and Security Act (TDPSA) applies — reference consumer privacy rights accurately.',
    'Texas DTPA (Deceptive Trade Practices Act) exposes exaggerated claims to treble damages — keep claims literal and verifiable.',
  ],
  Florida: [
    'Florida Digital Bill of Rights (FDBR) applies to larger processors — privacy claims should be accurate.',
    'FDUTPA (Deceptive and Unfair Trade Practices Act) — avoid unsubstantiated superiority claims.',
  ],
  'New York': [
    'NY SHIELD Act governs data security representations.',
    'NY General Business Law §349/§350 covers deceptive practices and false advertising — substantiate comparative claims.',
  ],
};

// Vertical frames per state — short, well-known, directional.
const VERTICAL: Record<string, Partial<Record<Exclude<Vertical, null>, string[]>>> = {
  California: {
    legal: [
      'Attorney advertising is regulated by the State Bar of California (Rules of Professional Conduct 7.1–7.5): no guarantees of outcome, no "specialist" claims without State Bar certification, testimonials need disclaimers.',
    ],
    healthcare: [
      'Telehealth requires California licensure (Medical Board of California); avoid implying treatment availability to non-California patients.',
    ],
    cannabis: [
      'Cannabis is legal adult-use under DCC licensing — ads must not target minors and require license numbers; interstate claims are prohibited.',
    ],
    solar: [
      'Solar marketing must reflect current NEM 3.0 net-billing economics; CPUC/CSLB rules restrict savings guarantees.',
    ],
    home_services: [
      'Contractors must display CSLB license numbers in advertising; unlicensed work over $500 is illegal to advertise.',
    ],
    insurance: [
      'Insurance products/rates are CDI-regulated; only admitted products may be marketed as such.',
    ],
  },
  Texas: {
    legal: [
      'Texas attorney advertising generally requires State Bar of Texas Advertising Review submission (Part VII rules); no outcome guarantees; "board certified" only via Texas Board of Legal Specialization.',
    ],
    healthcare: [
      'Telehealth requires Texas licensure (TMB); prescribing rules differ from other states — do not generalize.',
    ],
    cannabis: [
      'Recreational cannabis is NOT legal in Texas; only limited low-THC medical program (TCUP) exists — never imply general availability.',
    ],
    solar: [
      'Deregulated electricity market (ERCOT) — savings claims depend on retail plan; PUCT rules on door-to-door and telemarketing apply.',
    ],
    home_services: [
      'TDLR licensing applies to HVAC/electrical; license numbers in ads are required for licensed trades.',
    ],
    insurance: [
      'TDI regulates products and advertising; comparative premium claims need substantiation.',
    ],
  },
  Florida: {
    legal: [
      'Florida Bar rules (4-7 series) are among the strictest: ads generally require Bar review, no past-results implications without disclaimers, no "expert/specialist" absent Bar certification.',
    ],
    healthcare: [
      'Telehealth registration required for out-of-state providers (FL §456.47); avoid implying in-person availability.',
    ],
    cannabis: [
      'Medical-use only under OMMU; advertising requires DOH approval — never imply adult-use availability.',
    ],
    solar: [
      'PSC rules apply; HOA solar rights exist (FL §163.04) — a legitimate content angle.',
    ],
    home_services: [
      'DBPR/CILB licensing; hurricane-repair solicitation is specially regulated (post-storm AOB reforms) — avoid urgency-pressure framing.',
    ],
    insurance: [
      'OIR-regulated; post-2022 property-insurance reforms changed AOB and litigation rules — date-stamp any claims about the market.',
    ],
  },
  'New York': {
    legal: [
      'NY attorney advertising (Rules 7.1–7.3) requires "Attorney Advertising" labeling on many materials; no outcome guarantees; retention-of-copy requirements.',
    ],
    healthcare: [
      'Telehealth requires NY licensure (NYSED/DOH); avoid cross-state prescribing implications.',
    ],
    cannabis: [
      'Adult-use legal under OCM licensing; strict marketing rules (no youth appeal, no health claims, license display).',
    ],
    solar: [
      'NYSERDA/NY-Sun incentive framing must match current program terms; PSC consumer-protection rules for ESCOs apply.',
    ],
    home_services: [
      'Home-improvement contractor licensing is county/city-level (e.g., NYC DCWP) — reference the correct jurisdiction.',
    ],
    insurance: [
      'DFS-regulated; Regulation 187 (best interest) shapes life-product marketing language.',
    ],
  },
};

/**
 * The injectable grounding block. '' for non-US-state markets.
 * Appended right after the brand-facts block in content-agent prompts.
 */
export function stateFrameBlock(market?: string | null, industry?: string | null): string {
  const state = STATE_ALIAS[(market || '').toLowerCase().trim()];
  if (!state) return '';
  const vertical = detectVertical(industry);
  const lines: string[] = [...(GENERAL[state] || [])];
  if (vertical) lines.push(...(VERTICAL[state]?.[vertical] || []));
  if (!lines.length) return '';
  return (
    `\n\nSTATE REGULATORY FRAME — ${state} (directional guidance, not legal advice; counsel reviews before publication):\n` +
    lines.map((l) => `- ${l}`).join('\n') +
    `\n- All content must be accurate for ${state} specifically; never generalize another state's rules, incentives or availability.`
  );
}
