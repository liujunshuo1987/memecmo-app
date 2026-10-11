// Markdown → blocks, so an agent's deliverable is shown typeset instead of as
// source (literal **, #, >). Deliberately small: the agents write headings,
// paragraphs, bold, lists, quotes, fenced JSON and the odd link — and copy that
// has to come through untouched (Vietnamese diacritics, "TP.HCM", a URL with
// underscores, a price with an asterisk).
//
// Where client copy needs it, the rules are stricter than CommonMark:
//   · a single newline inside a paragraph is a line break — post copy is laid
//     out in lines ("✅ …" / "📞 …"), and joining them would rewrite it;
//   · `*` and `_` never open emphasis inside a Latin word or between digits,
//     and never across a line break — a stray marker cannot bold a paragraph;
//   · only http(s) / mailto / tel become links, bare domains stay text
//     ("TP.HCM" is not a website); raw HTML is text; HTML comments are dropped.
//
// The output is data, never an HTML string: the React side maps it to elements
// (deliverables.tsx), so nothing a model wrote is ever injected as markup.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong' | 'em'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'br' };

export interface ListItem { blocks: Block[]; checked?: boolean }

export type Block =
  | { t: 'heading'; level: number; c: Inline[] }
  | { t: 'para'; c: Inline[] }
  | { t: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { t: 'quote'; blocks: Block[] }
  | { t: 'code'; lang: string; v: string }
  | { t: 'rule' }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] };

// ── Inline ───────────────────────────────────────────────────────────────────
const ESCAPABLE = /[\\`*_{}\[\]()#+\-.!|<>~]/;
const WORD = /[\p{L}\p{N}]/u;
const LATIN_ALNUM = /[\p{Script=Latin}\p{Nd}]/u;
const DIGIT = /\d/;
const SPACE = /\s/;
const URL_AT = /^https?:\/\/[\p{L}\p{N}\-._~:/?#\[\]@!$&'()*+,;=%]+/iu;

export const safeHref = (url: string): boolean => /^(https?:\/\/|mailto:|tel:)/i.test(url.trim());

// A URL written mid-sentence usually drags the sentence's punctuation with it.
function trimUrl(url: string): string {
  let u = url;
  for (;;) {
    const last = u[u.length - 1];
    if (/[.,;:!?*_~'"]/.test(last)) u = u.slice(0, -1);
    else if (last === ')' && (u.match(/\)/g) ?? []).length > (u.match(/\(/g) ?? []).length) u = u.slice(0, -1);
    else if (last === ']' && !u.includes('[')) u = u.slice(0, -1);
    else return u;
  }
}

function canOpen(ch: string, n: number, before: string, after: string): boolean {
  if (!after || SPACE.test(after)) return false;
  if (ch === '_') return !WORD.test(before);
  if (DIGIT.test(before) && DIGIT.test(after)) return false; // 3*4, 5**2
  return n > 1 || !LATIN_ALNUM.test(before);                 // "giá*", "a*b"
}
function canClose(ch: string, n: number, before: string, after: string): boolean {
  if (!before || SPACE.test(before)) return false;
  if (ch === '_') return !WORD.test(after);
  if (DIGIT.test(before) && DIGIT.test(after)) return false;
  return n > 1 || !LATIN_ALNUM.test(after);
}

// End of a code span opened by `run` at `from`, or -1.
function codeEnd(src: string, from: number, run: string): number {
  let j = src.indexOf(run, from);
  while (j >= 0 && (src[j + run.length] === '`' || src[j - 1] === '`')) j = src.indexOf(run, j + run.length + 1);
  return j;
}

// Matching closer for an emphasis run of `n` × `ch` — same length, same line.
function findCloser(src: string, from: number, ch: string, n: number): number {
  let k = from;
  while (k < src.length) {
    const c = src[k];
    if (c === '\n') return -1;
    if (c === '\\') { k += 2; continue; }
    if (c === '`') {
      const run = /^`+/.exec(src.slice(k))![0];
      const end = codeEnd(src, k + run.length, run);
      k = end >= 0 ? end + run.length : k + run.length;
      continue;
    }
    if (c === ch) {
      let m = 1; while (src[k + m] === ch) m++;
      if (m === n && k > from && canClose(ch, n, src[k - 1] ?? '', src[k + m] ?? '')) return k;
      k += m; continue;
    }
    k++;
  }
  return -1;
}

// "[text](url)" starting at `at` (which is the "["). Unsafe schemes are not links.
function readLink(src: string, at: number): { text: string; href: string; end: number } | null {
  let depth = 0, close = -1;
  for (let k = at; k < src.length; k++) {
    const c = src[k];
    if (c === '\\') { k++; continue; }
    if (c === '\n') return null;
    if (c === '[') depth++;
    else if (c === ']' && --depth === 0) { close = k; break; }
  }
  if (close < 0 || src[close + 1] !== '(') return null;
  let paren = 0, end = -1;
  for (let k = close + 1; k < src.length; k++) {
    const c = src[k];
    if (c === '\n') return null;
    if (c === '(') paren++;
    else if (c === ')' && --paren === 0) { end = k; break; }
  }
  if (end < 0) return null;
  const href = src.slice(close + 2, end).trim().split(/\s+/)[0].replace(/^<|>$/g, '');
  if (!safeHref(href)) return null;
  return { text: src.slice(at + 1, close), href, end: end + 1 };
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && ESCAPABLE.test(src[i + 1] ?? '')) { buf += src[i + 1]; i += 2; continue; }
    if (ch === '\n') {
      buf = buf.replace(/[ \t]+$/, ''); flush(); out.push({ t: 'br' }); i++;
      while (src[i] === ' ' || src[i] === '\t') i++;
      continue;
    }
    if (ch === '`') {
      const run = /^`+/.exec(src.slice(i))![0];
      const end = codeEnd(src, i + run.length, run);
      if (end >= 0) {
        flush(); out.push({ t: 'code', v: src.slice(i + run.length, end).replace(/\n/g, ' ').replace(/^ (.+) $/, '$1') });
        i = end + run.length; continue;
      }
      buf += run; i += run.length; continue;
    }
    if (ch === '<') {
      if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i + 4); if (e >= 0) { i = e + 3; continue; } }
      const m = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(src.slice(i));
      if (m) { flush(); out.push({ t: 'link', href: m[1], c: [{ t: 'text', v: m[1].replace(/^mailto:/i, '') }] }); i += m[0].length; continue; }
    }
    if (ch === '[' || (ch === '!' && src[i + 1] === '[')) {
      const link = readLink(src, ch === '!' ? i + 1 : i);
      if (link) {
        flush(); out.push({ t: 'link', href: link.href, c: link.text.trim() ? parseInline(link.text) : [{ t: 'text', v: link.href }] });
        i = link.end; continue;
      }
    }
    if ((ch === 'h' || ch === 'H') && !WORD.test(src[i - 1] ?? '')) {
      const m = URL_AT.exec(src.slice(i, i + 2000));
      if (m) { const u = trimUrl(m[0]); flush(); out.push({ t: 'link', href: u, c: [{ t: 'text', v: u }] }); i += u.length; continue; }
    }
    if (ch === '*' || ch === '_') {
      let n = 1; while (src[i + n] === ch) n++;
      if (n <= 3 && canOpen(ch, n, src[i - 1] ?? '', src[i + n] ?? '')) {
        const j = findCloser(src, i + n, ch, n);
        if (j > 0) {
          const c = parseInline(src.slice(i + n, j));
          flush(); out.push(n === 1 ? { t: 'em', c } : n === 2 ? { t: 'strong', c } : { t: 'strong', c: [{ t: 'em', c }] });
          i = j + n; continue;
        }
      }
      buf += src.slice(i, i + n); i += n; continue;
    }
    buf += ch; i++;
  }
  flush();
  return out;
}

// ── Blocks ───────────────────────────────────────────────────────────────────
const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>[ \t]?(.*)$/;
const ITEM = /^( *)([-*+•]|\d{1,3}[.)])[ \t]+(.*)$/;
const TABLE_SEP = /^ {0,3}\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)+\|?[ \t]*$/;
const MAX_DEPTH = 6;

const blank = (l: string | undefined) => l === undefined || !l.trim();
const indentOf = (l: string) => /^ */.exec(l)![0].length;
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());
const isTableAt = (lines: string[], i: number) =>
  lines[i].includes('|') && !blank(lines[i + 1]) && TABLE_SEP.test(lines[i + 1]) && cells(lines[i]).length === cells(lines[i + 1]).length;

// Does this line start a block of its own, cutting a paragraph short?
function interrupts(lines: string[], i: number): boolean {
  const l = lines[i];
  if (FENCE.test(l) || HEADING.test(l) || RULE.test(l) || QUOTE.test(l) || l.trimStart().startsWith('<!--')) return true;
  const m = ITEM.exec(l);
  if (m) return !/\d/.test(m[2]) || parseInt(m[2], 10) === 1; // a wrapped "15. giây" is not a list
  return isTableAt(lines, i);
}

function parseList(lines: string[], start: number, depth: number): { block: Block; next: number } {
  const first = ITEM.exec(lines[start])!;
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const same = (l: string) => {
    const m = ITEM.exec(l);
    return !!m && !RULE.test(l) && Math.abs(m[1].length - indent) <= 1 && /\d/.test(m[2]) === ordered;
  };
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length && same(lines[i])) {
    const body = [ITEM.exec(lines[i])![3]];
    i++;
    // Indented lines belong to the item (continuation or a nested list); a
    // blank line stays inside only when what follows is indented too.
    while (i < lines.length) {
      if (blank(lines[i])) {
        let k = i; while (k < lines.length && blank(lines[k])) k++;
        if (k < lines.length && indentOf(lines[k]) >= indent + 2) { for (; i < k; i++) body.push(''); continue; }
        break;
      }
      if (indentOf(lines[i]) < indent + 2) break;
      body.push(lines[i].slice(indent + 2)); i++;
    }
    const task = /^\[([ xX])\][ \t]+/.exec(body[0]);
    if (task) body[0] = body[0].slice(task[0].length);
    items.push({ blocks: parseBlocks(body, depth + 1), ...(task ? { checked: task[1] !== ' ' } : {}) });
    let k = i; while (k < lines.length && blank(lines[k])) k++;
    if (k < lines.length && same(lines[k])) i = k; else break;
  }
  return { block: { t: 'list', ordered, start: ordered ? parseInt(first[2], 10) : 1, items }, next: i };
}

function parseBlocks(lines: string[], depth: number): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) { i++; continue; }
    const fence = FENCE.exec(line);
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}[ \\t]*$`);
      const body: string[] = [];
      i++;
      while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push({ t: 'code', lang: fence[2].toLowerCase(), v: body.join('\n') });
      continue;
    }
    if (line.trimStart().startsWith('<!--')) { // a note to whoever reads the source, not content
      while (i < lines.length && !lines[i].includes('-->')) i++;
      i++; continue;
    }
    const h = HEADING.exec(line);
    if (h) { out.push({ t: 'heading', level: h[1].length, c: parseInline(h[2].replace(/[ \t]+#+$/, '')) }); i++; continue; }
    if (RULE.test(line)) { out.push({ t: 'rule' }); i++; continue; }
    if (QUOTE.test(line) && depth < MAX_DEPTH) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(QUOTE.exec(lines[i++])![1]);
      out.push({ t: 'quote', blocks: parseBlocks(body, depth + 1) });
      continue;
    }
    if (ITEM.test(line) && depth < MAX_DEPTH) {
      const { block, next } = parseList(lines, i, depth);
      out.push(block); i = next; continue;
    }
    if (isTableAt(lines, i)) {
      const head = cells(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && !blank(lines[i]) && lines[i].includes('|')) rows.push(cells(lines[i++]).map(parseInline));
      out.push({ t: 'table', head, rows });
      continue;
    }
    const para = [line.trim()];
    i++;
    while (i < lines.length && !blank(lines[i]) && !interrupts(lines, i)) para.push(lines[i++].trim());
    out.push({ t: 'para', c: parseInline(para.join('\n')) });
  }
  return out;
}

export function parseMarkdown(src: string): Block[] {
  return parseBlocks(String(src ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'), 0);
}

// ── Plain text (what a copy button puts on the clipboard) ────────────────────
// Markers gone, line breaks and list structure kept: this is what gets pasted
// into a directory form, a post composer, an email.
export function inlineText(c: Inline[]): string {
  return c.map((n) => {
    if (n.t === 'text' || n.t === 'code') return n.v;
    if (n.t === 'br') return '\n';
    if (n.t === 'link') { const label = inlineText(n.c); return !label || label === n.href || `mailto:${label}` === n.href ? n.href.replace(/^mailto:/i, '') : `${label} (${n.href})`; }
    return inlineText(n.c);
  }).join('');
}

export function blocksText(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.t === 'heading' || b.t === 'para') parts.push(inlineText(b.c));
    else if (b.t === 'code') parts.push(b.v);
    else if (b.t === 'quote') parts.push(blocksText(b.blocks));
    else if (b.t === 'table') parts.push([b.head, ...b.rows].map((r) => r.map(inlineText).join('\t')).join('\n'));
    else if (b.t === 'list') {
      parts.push(b.items.map((it, k) => {
        const mark = b.ordered ? `${b.start + k}. ` : '- ';
        const [head, ...rest] = blocksText(it.blocks).split('\n');
        return mark + [head, ...rest.map((l) => (l ? ' '.repeat(mark.length) + l : l))].join('\n');
      }).join('\n'));
    }
  }
  return parts.filter((p) => p.trim()).join('\n\n');
}

export const toPlainText = (markdown: string): string => blocksText(parseMarkdown(markdown));
