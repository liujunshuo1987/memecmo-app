// A deliverable, split into the parts a person actually works with.
//
// The sandbox keeps ONE source per version — the Markdown the agent wrote, the
// client edited, or a refinement returned — and Copy / Edit / asset_edits all
// work on that string. So the layout is derived from the same string rather
// than from the run's JSON: after a hand edit the cards show the edited text,
// not the original. The run output (`targets`) only fills in what the Markdown
// does not carry.
//
// Three rules live here, each covered by scripts/test-deliverables.ts:
//   splitFields      "**Địa chỉ:** …" lines → one row per field
//   parseKit         a distribution kit → one placement per "### site" section
//   matchPlacements  which logged action belongs to which placement

export interface DraftSegment { label: string | null; value: string }

// "**Label:** value" or "**Label**: value" at the start of a line. The colon
// must close the label, so a bold sentence that merely contains one is prose.
const FIELD = /^\*\*([^*\n]{1,80}?)[ \t]*(?:[:：][ \t]*\*\*|\*\*[ \t]*[:：])[ \t]*(.*)$/;
const FENCE_LINE = /^ {0,3}(```|~~~)/;

/** A draft as labelled fields and the prose between them, in order. A label
 *  with its value on the same line owns that paragraph; a label alone on its
 *  line owns everything up to the next label (a multi-paragraph "About", a list). */
export function splitFields(draft: string): DraftSegment[] {
  const segs: DraftSegment[] = [];
  let label: string | null = null, lines: string[] = [], open = false, fenced = false;
  const push = () => {
    const value = lines.join('\n').replace(/^\s*\n/, '').trimEnd();
    if (value.trim()) segs.push({ label, value });
    else if (label) segs.push({ label: null, value: `**${label}:**` }); // a label with nothing under it is just text
    label = null; lines = []; open = false;
  };
  for (const line of String(draft ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    if (FENCE_LINE.test(line)) fenced = !fenced;
    const m = fenced ? null : FIELD.exec(line);
    if (m) { push(); label = m[1].trim(); open = !m[2].trim(); if (m[2].trim()) lines.push(m[2]); continue; }
    if (label && !open && !fenced && !line.trim()) { push(); continue; }
    lines.push(line);
  }
  push();
  return segs;
}

/** Field rows only when the draft really is a form: two labels or more. */
export const isFieldList = (segs: DraftSegment[]): boolean => segs.filter((s) => s.label).length >= 2;

// ── Distribution kit ─────────────────────────────────────────────────────────
export interface KitPlacement {
  index: number;       // position in this version of the kit
  site: string;        // as written in the heading — usually a domain
  host: string | null; // lower-case host, path dropped ("google.com/business" → "google.com")
  tier: number;        // 1 national · 2 industry · 3 directories
  channelType: string;
  effort: string;      // quick | medium | high | ''
  brief: boolean;      // an engagement brief — where to take part, not text to post
  title: string;
  draft: string;       // Markdown
  why: string;
  flags: string[];     // compliance findings to resolve before sending
}
export interface Kit { heading: string; intro: string; placements: KitPlacement[] }

export function hostOf(site: string | null | undefined): string | null {
  const m = /(?:[a-z0-9-]+\.)+[a-z]{2,}/i.exec(String(site ?? ''));
  return m ? m[0].toLowerCase().replace(/^www\./, '') : null;
}

const WHY = /^(?:why|lý do|vì sao|tại sao|为什么|為什麼|原因|理由)\s*[:：]\s*/i;
const FLAG = /^⚠\s*(?:(?:compliance|review)\s*[:：]\s*)?/i;
const norm = (s: string | null | undefined) => String(s ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Split a kit's Markdown into placements. Returns null when it has no
 *  "### site" sections left (a refinement that rewrote the structure) — the
 *  caller then shows the document typeset as a whole. */
export function parseKit(markdown: string, targets: any[] = []): Kit | null {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  let heading = '', tier = 0, fenced = false;
  const intro: string[] = [];
  const raw: { head: string; tier: number; body: string[] }[] = [];
  for (const line of lines) {
    if (FENCE_LINE.test(line)) fenced = !fenced;
    const h = fenced ? null : /^(#{1,3})[ \t]+(.+?)[ \t]*$/.exec(line);
    if (h && h[1].length === 3) { raw.push({ head: h[2], tier, body: [] }); continue; }
    if (h && h[1].length === 2) { const t = /[123]/.exec(h[2]); tier = t ? Number(t[0]) : 0; continue; }
    if (h && !raw.length && !heading) { heading = h[2]; continue; }
    (raw.length ? raw[raw.length - 1].body : intro).push(line);
  }
  if (!raw.length) return null;

  const used = new Set<number>();
  const targetFor = (site: string, title: string) => {
    const hit = (strict: boolean) => targets.findIndex((t, k) => !used.has(k) && !!norm(t?.domain) && (strict ? norm(t.domain) === norm(site) && norm(t?.title) === norm(title) : norm(site).startsWith(norm(t.domain))));
    let k = hit(true); if (k < 0) k = hit(false);
    if (k < 0) return null;
    used.add(k); return targets[k];
  };

  const placements: KitPlacement[] = raw.map((r, index) => {
    // "### brandsvietnam.com  _(industry_media · high effort)_" — the brackets
    // also count without the underscores, but only when they hold "a · b".
    const hm = /^(.*?)\s*_\((.*)\)_\s*$/.exec(r.head) ?? /^(.*?)\s*\(([^()]*·[^()]*)\)\s*$/.exec(r.head);
    const site = (hm ? hm[1] : r.head).replace(/^[*_`\s]+|[*_`\s]+$/g, '');
    const meta = hm ? hm[2].split('·').map((s) => s.trim()) : [];
    const body = [...r.body];
    while (body.length && !body[0].trim()) body.shift();
    let title = '';
    const tm = /^\*\*(.+)\*\*[ \t]*$/.exec(body[0] ?? '');
    if (tm && !/[:：]$/.test(tm[1].trim())) { title = tm[1].trim(); body.shift(); }
    // Quoted lines: the agent's "Why:" and its compliance flags leave the copy;
    // any other quote is part of the draft.
    let why = '';
    const flags: string[] = [], draft: string[] = [];
    for (let i = 0; i < body.length; i++) {
      if (!/^>/.test(body[i])) { draft.push(body[i]); continue; }
      const group: string[] = [];
      while (i < body.length && /^>/.test(body[i])) group.push(body[i++].replace(/^>[ \t]?/, ''));
      i--;
      const text = group.join(' ').trim();
      if (FLAG.test(text)) flags.push(text.replace(FLAG, ''));
      else if (!why && WHY.test(text)) why = text.replace(WHY, '');
      else draft.push(...group.map((g) => `> ${g}`));
    }
    const t = targetFor(site, title);
    const effort = (/\b(quick|medium|high)\b/i.exec(meta.join(' '))?.[1] ?? t?.effort ?? '').toLowerCase();
    return {
      index, site, host: hostOf(site),
      tier: Number(t?.tier) || r.tier || 3,
      channelType: String(meta[0] && /^[a-z_]+$/i.test(meta[0]) ? meta[0] : t?.channelType ?? '').toLowerCase(),
      effort,
      brief: /engagement brief/i.test(meta.join(' ')) || (!hm && t?.format === 'engagement_brief'),
      title, draft: draft.join('\n').trim(), why, flags,
    };
  });
  return { heading, intro: intro.join('\n').trim(), placements };
}

// ── Which logged action belongs to which placement ───────────────────────────
// No column says so (and none is added): an action logged from a placement
// card carries the placement's title and the kit's run id. So, among the
// actions of ONE kit run:
//   1. same title → that placement (two placements on facebook.com stay apart);
//   2. otherwise the action's domain against the placement's host — same host
//      or a subdomain — but only when exactly one placement has that host;
//   3. anything else is returned as unmatched and shown at kit level. It is
//      never guessed onto a card, and never dropped.
export interface LoggedAction { id: string; title: string | null; domain: string | null; published_at: string }

const sameHost = (a: string, b: string) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

export function matchPlacements<A extends LoggedAction>(placements: Pick<KitPlacement, 'title' | 'site' | 'host'>[], actions: A[]): { matched: A[][]; unmatched: A[] } {
  const matched: A[][] = placements.map(() => []);
  const unmatched: A[] = [];
  for (const a of actions) {
    const title = norm(a.title);
    const host = a.domain ? a.domain.toLowerCase().replace(/^www\./, '') : null;
    const byTitle = title ? placements.map((p, k) => (norm(p.title || p.site) === title ? k : -1)).filter((k) => k >= 0) : [];
    const byHost = host ? placements.map((p, k) => (p.host && sameHost(host, p.host) ? k : -1)).filter((k) => k >= 0) : [];
    const both = byTitle.filter((k) => byHost.includes(k));
    const k = byTitle.length === 1 ? byTitle[0] : both.length === 1 ? both[0] : !byTitle.length && byHost.length === 1 ? byHost[0] : -1;
    if (k >= 0) matched[k].push(a); else unmatched.push(a);
  }
  return { matched, unmatched };
}

// ── Content draft ────────────────────────────────────────────────────────────
export interface ContentDoc {
  notes: string[];                               // "⚠ REVIEW" lines the agent put on top
  title: string;
  article: string;                               // Markdown, without title / FAQ / schema
  faq: { question: string; answer: string }[];
  schema: string | null;                         // the JSON-LD block, as text
}

const FAQ_HEADING = /^##[ \t]+(?:FAQs?|frequently asked questions|câu hỏi thường gặp|các câu hỏi thường gặp|常见问题|常見問題|常见问答)(?:$|[^\p{L}\p{N}])/iu;

/** The content agent's page: title, article, FAQ, JSON-LD. Null when the text
 *  no longer opens with a "# title" — shown typeset as a whole instead. */
export function parseContentDoc(markdown: string): ContentDoc | null {
  let lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const notes: string[] = [];
  let i = 0;
  while (i < lines.length && (!lines[i].trim() || /^>/.test(lines[i]))) {
    const text = lines[i].replace(/^>[ \t]?/, '').trim();
    if (text) notes.push(text.replace(FLAG, ''));
    i++;
  }
  const h1 = /^#[ \t]+(.+?)[ \t]*$/.exec(lines[i] ?? '');
  if (!h1) return null;
  lines = lines.slice(i + 1);

  // The JSON-LD block closes the document: "---", a note, a fenced block.
  let schema: string | null = null;
  let end = lines.length;
  while (end > 0 && !lines[end - 1].trim()) end--;
  if (end > 0 && FENCE_LINE.test(lines[end - 1])) {
    let open = end - 2;
    while (open >= 0 && !FENCE_LINE.test(lines[open])) open--;
    const body = open >= 0 ? lines.slice(open + 1, end - 1).join('\n') : '';
    if (open >= 0 && /^\s*[{\[]/.test(body)) {
      schema = body;
      end = open;
      while (end > 0 && (!lines[end - 1].trim() || /^<!--.*-->\s*$/.test(lines[end - 1].trim()) || /^ {0,3}-{3,}\s*$/.test(lines[end - 1]))) end--;
    }
  }
  lines = lines.slice(0, end);

  let at = lines.length - 1;
  while (at >= 0 && !FAQ_HEADING.test(lines[at])) at--;
  const faq: ContentDoc['faq'] = [];
  let article = lines;
  if (at >= 0) {
    let stop = lines.findIndex((l, k) => k > at && /^#{1,2}[ \t]+/.test(l));
    if (stop < 0) stop = lines.length;
    let q: string | null = null, a: string[] = [];
    const push = () => { if (q !== null) faq.push({ question: q, answer: a.join('\n').trim() }); q = null; a = []; };
    let stray = false;
    for (const l of lines.slice(at + 1, stop)) {
      const m = /^(?:\*\*(.+)\*\*|#{3,4}[ \t]+(.+?))[ \t]*$/.exec(l);
      if (m) { push(); q = (m[1] ?? m[2]).trim(); continue; }
      if (q === null && l.trim()) stray = true;
      a.push(l);
    }
    push();
    // Only lift the section out when all of it reads as question / answer.
    if (faq.length && !stray) article = [...lines.slice(0, at), ...lines.slice(stop)];
    else faq.length = 0;
  }
  return { notes, title: h1[1], article: article.join('\n').trim(), faq, schema };
}
