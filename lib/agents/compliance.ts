// Shared deterministic compliance checks for content-producing agents.
// The LLM is instructed to stay compliant; these checks are the GUARANTEE —
// same input, same findings, every run (Olivia's audit: "加一层确定性检查").

const SUPERLATIVE_RES: [RegExp, string][] = [
  [/trusted by (millions|thousands)/i, 'trusted by millions/thousands'],
  [/\b(millions|thousands) of (users|customers|businesses|clients)\b/i, 'millions/thousands of users'],
  [/world'?s (best|leading|largest|no\.? ?1|#1)/i, "world's best/leading"],
  [/\bindustry[- ]leading\b/i, 'industry-leading'],
  [/\bbest[- ]in[- ]class\b/i, 'best-in-class'],
  [/\bmarket leader\b/i, 'market leader'],
];

/** Labels of unverifiable-superlative claims found in the text (empty = clean). */
export function scanUnverifiedClaims(text: string): string[] {
  const found: string[] = [];
  for (const [re, label] of SUPERLATIVE_RES) {
    if (re.test(text)) found.push(label);
  }
  return found;
}

// THE universal rule (Olivia): agents may generate FACTS, never EXPERIENCES.
// First-person user-experience voice in any outbound asset means the model
// fabricated a testimonial — such output is dropped, not repaired.
// Multilingual by necessity: the platform ships Vietnamese/Thai/Indonesian/
// Malay/Filipino copy — an English-only pattern would let a fake "mình đã
// dùng..." testimonial sail through in exactly the markets we serve most.
export const FAKE_USER_RE = new RegExp(
  [
    // English
    "\\b(i'?ve been using|i have been using|as a (real|regular|long-?time|happy|satisfied) (user|customer)|my (own )?experience (with|using)|i (recently )?(tried|switched to|discovered))\\b",
    // Vietnamese (mình/tôi/em = user voice; brands write as chúng tôi)
    '(mình|tôi|em) (đã|đang) (dùng|sử dụng|xài)',
    'trải nghiệm của (mình|tôi)',
    // Thai (ผม/ฉัน first person; เรา excluded — legitimate brand "we")
    '(ผม|ฉัน)(ได้)?(ใช้|ลองใช้)',
    'ประสบการณ์ของ(ผม|ฉัน)',
    // Indonesian / Malay
    'saya (sudah|telah|dah) (pakai|guna|menggunakan|coba|cuba)',
    'pengalaman saya',
    // Filipino
    '(ginagamit|gamit) ko',
    'karanasan ko',
  ].join('|'),
  'iu',
);

// Community platforms get engagement BRIEFS (facts to contribute), never post
// text. Covers Western AND SEA community ecosystems — Pantip (TH), Voz/Tinhte/
// Webtretho/Spiderum/Otofun (VN), Kaskus (ID), Lowyat (MY), PinoyExchange (PH).
export const COMMUNITY_RE = /reddit\.|quora\.|discourse|forum|community|facebook\.com\/groups|pantip\.|voz\.vn|tinhte\.vn|webtretho|spiderum|otofun|kaskus\.|lowyat\.|pinoyexchange/i;
