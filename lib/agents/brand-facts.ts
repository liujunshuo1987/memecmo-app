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
