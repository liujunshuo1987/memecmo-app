// Shared, dependency-free helper: render a canonical brand profile as a compact
// facts block for injection into any execution agent's prompt. Kept separate so
// every agent (including site.ts, which profile.ts depends on) can import it
// without creating an import cycle.

export function brandProfileBlock(p: any | null | undefined): string {
  if (!p) return '';
  const facts = (p.facts || []).map((f: any) => `${f.label}: ${f.value}`).join('; ');
  const nap = p.nap
    ? Object.entries(p.nap)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ')
    : '';
  return [
    'CANONICAL BRAND FACTS (use these verbatim for consistency; do not contradict or invent others):',
    p.definition ? `- Definition: ${p.definition}` : null,
    p.description ? `- About: ${p.description}` : null,
    p.category ? `- Category: ${p.category}` : null,
    (p.services || []).length ? `- Services: ${p.services.join(', ')}` : null,
    (p.differentiators || []).length ? `- Differentiators: ${p.differentiators.join(', ')}` : null,
    facts ? `- Facts: ${facts}` : null,
    nap ? `- NAP: ${nap}` : null,
    p.audience ? `- Audience: ${p.audience}` : null,
    p.uploadedDocs
      ? `\nUPLOADED BRAND DOCUMENTS (client-provided guidelines / positioning — authoritative for tone and claims):\n${p.uploadedDocs}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}

// Policy documents ("Claims policy — …") tell agents how NOT to use certain
// figures; they must not also count as evidence for those figures. The
// numeric-grounding corpus is the brand facts + every uploaded doc except
// policy/rule docs (FMVN 2026-09-28: a NielsenIQ "92%" quoted only inside the
// Chicilon claims policy slipped into a cost article).
const POLICY_DOC_RE = /^\[[^\]]*(policy|guideline|rules?|chính sách|quy định|quy tắc|政策|规则|规范)[^\]]*\]/iu;

export function brandFactsCorpus(p: any | null | undefined): string {
  if (!p) return '';
  const docs = String(p.uploadedDocs || '')
    .split('\n---\n')
    .filter((d) => d.trim() && !POLICY_DOC_RE.test(d.trim()))
    .join('\n---\n');
  return brandProfileBlock({ ...p, uploadedDocs: docs || undefined });
}
