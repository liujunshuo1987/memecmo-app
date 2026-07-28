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
