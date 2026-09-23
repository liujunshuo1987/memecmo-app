// User edits overlay — "what the user changed, a re-run never overwrites".
//
// Generated output and user edits are stored separately (table asset_edits)
// and merged at READ time, edits last. Generation therefore cannot destroy an
// edit by construction: the only code path that removes one is an explicit
// user revert. Every reader of an editable asset must go through these
// helpers — a reader that parses asset.content directly is a bug.

import { createHash } from 'node:crypto';

export interface AssetEdit {
  asset_type: string;
  unit_key: string;
  value: any;
  base_value?: any;
  edited_at?: string;
  source?: string;
}

// Same algorithm as promptHash() in lib/agents/run.ts (kept local to avoid an
// import cycle: run.ts imports this module).
export const unitHash = (s: string): string =>
  createHash('sha256').update(String(s).trim().toLowerCase()).digest('hex').slice(0, 16);

export const answerKey = (prompt: string, lang: 'local' | 'en'): string => `answer:${unitHash(prompt)}:${lang}`;
export const docKey = (runId: string): string => `doc:${runId}`;

// Profile units a user may edit. `competitors` is deliberately absent — the
// competitor set has its own locked, reviewed store (projects.metadata).
export const PROFILE_UNITS = [
  'definition', 'description', 'category', 'audience',
  'services', 'differentiators', 'subVerticals', 'facts',
  'nap.name', 'nap.address', 'nap.phone', 'nap.email', 'nap.website',
] as const;
export const isProfileUnit = (k: string): boolean => (PROFILE_UNITS as readonly string[]).includes(k);

export async function loadEdits(sb: any, projectId: string, assetType: string): Promise<AssetEdit[]> {
  const { data } = await sb
    .from('asset_edits')
    .select('asset_type, unit_key, value, base_value, edited_at, source')
    .eq('project_id', projectId)
    .eq('asset_type', assetType);
  return Array.isArray(data) ? data : [];
}

/** Profile with the user's edits applied last. Returns the same object shape
 *  plus `_edited` (unit keys in force) so views can badge them. A profile that
 *  does not exist yet but has edits is materialised from the edits alone. */
export function applyProfileEdits<T extends Record<string, any> | null>(profile: T, edits: AssetEdit[]): T {
  const mine = edits.filter((e) => isProfileUnit(e.unit_key));
  if (!mine.length) return profile;
  const out: Record<string, any> = { ...(profile ?? {}) };
  for (const e of mine) {
    if (e.unit_key.startsWith('nap.')) {
      out.nap = { ...(out.nap ?? {}), [e.unit_key.slice(4)]: e.value };
    } else {
      out[e.unit_key] = e.value;
    }
  }
  out._edited = mine.map((e) => e.unit_key);
  return out as T;
}

/** Standard answers with edits applied, matched by prompt hash so they follow
 *  the prompt through regeneration and reordering. */
export function applyAnswerEdits<A extends { prompt: string; local?: string; en?: string }>(answers: A[], edits: AssetEdit[]): (A & { _edited?: ('local' | 'en')[] })[] {
  if (!edits.length) return answers;
  const byKey = new Map(edits.map((e) => [e.unit_key, e]));
  return answers.map((a) => {
    const hit: ('local' | 'en')[] = [];
    const next: any = { ...a };
    for (const lang of ['local', 'en'] as const) {
      const e = byKey.get(answerKey(a.prompt, lang));
      if (e && typeof e.value === 'string') { next[lang] = e.value; hit.push(lang); }
    }
    if (hit.length) next._edited = hit;
    return next;
  });
}
