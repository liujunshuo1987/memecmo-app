// What someone pasted → an action to log. Pure and client-safe: the workspace
// panel reads a pasted link (or a list of "link date" lines) with it.
//
// The rules are the Lark command's (parseHanhdong in lib/lark.ts): a kind word
// on the line wins, otherwise the brand's own site is a content page and
// anywhere else a third-party placement; dates as people type them. lib/lark.ts
// cannot be imported into the browser (node:crypto), so the rules are repeated
// here and scripts/test-interventions.ts holds the two to the same answers.

export const INTERVENTION_KINDS = ['content_page', 'schema', 'third_party_placement', 'encyclopedia', 'directory_profile', 'site_update', 'other'] as const;
export type InterventionKind = (typeof INTERVENTION_KINDS)[number];

const KIND_WORDS: [InterventionKind, RegExp][] = [
  ['encyclopedia', /wiki|bách khoa|bach khoa|百科/iu],
  ['directory_profile', /danh bạ|danh ba|directory|目录/iu],
  ['schema', /schema|cấu trúc|cau truc|结构化/iu],
  ['site_update', /cập nhật|cap nhat|site_update|网站更新/iu],
  ['content_page', /trang nội dung|trang noi dung|content_page|官网页面|说明页/iu],
  ['third_party_placement', /báo|bao |bên thứ ba|placement|媒体|稿件/iu],
  ['other', /khác|other|其他/iu],
];

export interface ActionDraft {
  url: string | null;
  date: string | null;       // YYYY-MM-DD when the text carries one
  kind: InterventionKind;
  kindFrom: 'word' | 'link'; // a kind word on the line, or worked out from where the link points
  targets: number[];         // 1-based positions in the project's core questions ("Q3")
  note: string;
}

const hostOf = (url: string | null): string => {
  try { return url ? new URL(url).hostname.replace(/^www\./, '').toLowerCase() : ''; } catch { return ''; }
};

/** The brand's own hosts: its site and any extra domains on the project. */
export function brandHostsOf(project: { brand_url?: string | null; metadata?: any } | null | undefined): string[] {
  const hosts = new Set<string>();
  const own = hostOf(/^https?:\/\//i.test(String(project?.brand_url ?? '')) ? String(project?.brand_url) : project?.brand_url ? `https://${project.brand_url}` : null);
  if (own) hosts.add(own);
  for (const d of (project?.metadata?.brandDomains ?? []) as unknown[]) {
    const s = String(d ?? '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();
    if (s) hosts.add(s);
  }
  return [...hosts];
}

/** The brand's own site → a content page; anywhere else → a third-party placement. */
export function kindFromLink(url: string | null, brandHosts: string[]): InterventionKind {
  const host = hostOf(url);
  return host && brandHosts.some((b) => host === b || host.endsWith('.' + b)) ? 'content_page' : 'third_party_placement';
}

// A date as people type it: YYYY-MM-DD, or DD/MM with an optional year.
function takeDate(text: string, today: string): { date: string | null; rest: string } {
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return { date: `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`, rest: text.replace(iso[0], ' ') };
  const dmy = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  if (dmy) return { date: `${dmy[3] || today.slice(0, 4)}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`, rest: text.replace(dmy[0], ' ') };
  return { date: null, rest: text };
}

/** One line: "<link> [date] [kind word] [Q3,Q5] [note]", in any order; a leading /hanhdong is ignored. */
export function parseActionLine(text: string, today: string, brandHosts: string[] = []): ActionDraft {
  let rest = text.replace(/(^|\s)\/hanhdong\b/i, ' ');
  const urlM = rest.match(/https?:\/\/[^\s<>"]+/i);
  const url = urlM ? urlM[0].replace(/[),.;]+$/, '') : null;
  if (urlM) rest = rest.replace(urlM[0], ' ');

  const found = takeDate(rest, today);
  rest = found.rest;

  const targets = [...rest.matchAll(/\bQ0?(\d{1,2})\b/gi)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= 20);
  rest = rest.replace(/\bQ0?\d{1,2}\b[,，]?/gi, ' ');

  let kind: InterventionKind | null = null;
  for (const w of rest.split(/\s+/)) if ((INTERVENTION_KINDS as readonly string[]).includes(w)) kind = w as InterventionKind;
  if (!kind) for (const [k, re] of KIND_WORDS) if (re.test(rest)) { kind = k; break; }
  return {
    url, date: found.date, kind: kind ?? kindFromLink(url, brandHosts), kindFrom: kind ? 'word' : 'link',
    targets: [...new Set(targets)], note: rest.replace(/\s+/g, ' ').trim().slice(0, 300),
  };
}

/** A pasted block: one draft per line that has anything on it. */
export function parseActionLines(text: string, today: string, brandHosts: string[] = []): ActionDraft[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => parseActionLine(l, today, brandHosts));
}
