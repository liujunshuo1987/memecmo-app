'use client';

// Blind labelling UI. The labeller sees the question, the engine, the full
// answer with the brand and tracked competitor names highlighted (plain
// string matching — evidence, not opinion), and the judge's own rubric. The
// machine's verdicts are never shown; that is the whole point of the set.

import { useCallback, useEffect, useRef, useState } from 'react';

type Item = { id: string; language: string; engine: string; model: string | null; stage: string | null; intent: string | null; key_prompt: boolean; prompt: string; answer_text: string; brand_name: string; competitor_names: string[] };
type Progress = Record<string, { pool: number; labeled: number; target: number }>;
const LANGS = ['vi', 'zh', 'en'] as const;

const RUBRIC = {
  // "Mentioned" means THIS brand. A namesake (a different entity with the
  // same name — e.g. 观澜智库 the Beijing think tank vs 观澜智库 NeuronSpark)
  // is NOT a mention: tick No and add the namesake note, so the judge's
  // entity confusions become a measurable error class of their own.
  prominence: ['0 · absent — the brand is not mentioned', '1 · mentioned in passing', '2 · one of several options listed', '3 · featured / top recommendation'],
  sentiment: ['positive', 'neutral', 'negative', 'none (not mentioned)'],
};

// A brand or competitor name is often a composite ("观澜智库 NeuronSpark",
// "Focus Media Vietnam"). Match the full name first; if absent, its distinct
// parts — skipping generic words that would light up the whole page.
const GENERIC = new Set(['media', 'group', 'vietnam', 'company', 'limited', 'inc', 'co', 'ltd', 'the', 'and', 'of', 'digital', 'solutions', 'services', 'research', 'browser']);
export function nameVariants(name: string): string[] {
  const full = name.trim();
  const parts = full.split(/[\s·/|,]+/).map((x) => x.trim()).filter((x) => x.length >= 3 && !GENERIC.has(x.toLowerCase()) && x !== full);
  return [full, ...parts];
}
const textHas = (text: string, name: string) => nameVariants(name).some((v) => text.toLowerCase().includes(v.toLowerCase()));

function Highlighted({ text, terms }: { text: string; terms: { t: string; cls: string }[] }) {
  const clean = terms.filter((x) => x.t && x.t.length >= 2).sort((a, b) => b.t.length - a.t.length);
  if (!clean.length) return <>{text}</>;
  const re = new RegExp(`(${clean.map((x) => x.t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) => {
        const hit = clean.find((x) => x.t.toLowerCase() === p.toLowerCase());
        return hit ? <mark key={i} className={`rounded px-0.5 ${hit.cls}`}>{p}</mark> : <span key={i}>{p}</span>;
      })}
    </>
  );
}

export default function GoldenClient({ labeler }: { labeler: string }) {
  const [lang, setLang] = useState<(typeof LANGS)[number]>('vi');
  const [item, setItem] = useState<Item | null>(null);
  const [prog, setProg] = useState<Progress>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mentioned, setMentioned] = useState<boolean | null>(null);
  const [prominence, setProminence] = useState<number | null>(null);
  const [sentiment, setSentiment] = useState<string | null>(null);
  const [comps, setComps] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const started = useRef<number>(Date.now());

  const load = useCallback(async (l: string) => {
    setBusy(true); setErr(null); setItem(null);
    const res = await fetch(`/api/workspace/golden?language=${l}`);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(d.error || 'Load failed'); setBusy(false); return; }
    setItem(d.item); setProg(d.progress ?? {});
    // Deterministic prefill from the TEXT (string presence of the names) —
    // evidence, not the machine's opinion. The labeller corrects it; the
    // judge's job (aliases, "mentioned as a URL only", position) stays human.
    const it: Item | null = d.item;
    const has = (name: string) => !!it && !!name && textHas(it.answer_text, name);
    const brandInText = it ? has(it.brand_name) : false;
    setMentioned(brandInText ? true : null);
    setProminence(null); setSentiment(null);
    setComps(new Set((it?.competitor_names ?? []).filter(has))); setNotes('');
    started.current = Date.now(); setBusy(false);
  }, []);
  useEffect(() => { load(lang); }, [lang, load]);
  // Keys: y/n brand mentioned · 0-3 prominence · p/u/g sentiment (positive/neutral/negative) · Enter save · s skip
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' && (e.target as HTMLInputElement).type === 'text') return;
      const k = e.key.toLowerCase();
      if (k === 'y') setMentioned(true);
      else if (k === 'n') { setMentioned(false); setProminence(0); setSentiment('none'); }
      else if (['0', '1', '2', '3'].includes(k)) setProminence(Number(k));
      else if (k === 'p') setSentiment('positive');
      else if (k === 'u') setSentiment('neutral');
      else if (k === 'g') setSentiment('negative');
      else if (k === 'enter') { e.preventDefault(); submitRef.current?.(); }
      else if (k === 's') load(lang);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lang, load]);
  const submitRef = useRef<(() => void) | null>(null);

  const submit = async () => {
    submitRef.current = null;
    if (!item || mentioned === null || prominence === null || !sentiment) { setErr('Fill brand mentioned, prominence and sentiment.'); return; }
    if (mentioned === false && (prominence !== 0 || sentiment !== 'none')) { setErr('If the brand is not mentioned, prominence must be 0 and sentiment "none".'); return; }
    setBusy(true);
    const res = await fetch('/api/workspace/golden', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poolId: item.id, brandMentioned: mentioned, prominence, sentiment, competitors: [...comps], notes, seconds: (Date.now() - started.current) / 1000 }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(d.error || 'Save failed'); setBusy(false); return; }
    await load(lang);
  };

  submitRef.current = submit;
  const terms = item
    ? [...nameVariants(item.brand_name).map((t) => ({ t, cls: 'bg-gold/30' })), ...item.competitor_names.flatMap((c) => nameVariants(c).map((t) => ({ t, cls: 'bg-brand/15' })))]
    : [];
  const p = prog[lang];

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4 text-ink">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold">Golden set · blind labelling</h1>
          <div className="text-[10px] text-faint">Keys: <b>y</b>/<b>n</b> mentioned · <b>0–3</b> prominence · <b>p</b>/<b>u</b>/<b>g</b> sentiment · <b>Enter</b> save · <b>s</b> skip. Names found in the text are pre-ticked — correct them.</div>
        </div>
        <div className="text-[11px] text-faint">{labeler}</div>
      </div>
      <div className="flex gap-2">
        {LANGS.map((l) => (
          <button key={l} onClick={() => setLang(l)} className={`text-[11px] px-2.5 py-1 rounded border ${l === lang ? 'bg-brand border-brand text-on-brand' : 'border-edge text-dim'}`}>
            {l.toUpperCase()} · {prog[l]?.labeled ?? 0}/{prog[l]?.target ?? 200} <span className="opacity-60">(pool {prog[l]?.pool ?? 0})</span>
          </button>
        ))}
        <a href={`/api/workspace/golden/export?language=${lang}`} className="ml-auto text-[11px] text-faint hover:text-brand underline decoration-dotted">Export CSV (blind)</a>
      </div>
      {p && p.pool === 0 && <div className="text-[12px] text-faint">No answers pooled for this language yet — the pool fills from every comparable scan.</div>}
      {item && (
        <div className="rounded-xl border border-edge bg-surface p-4 space-y-3">
          <div className="text-[11px] text-faint">{item.engine}{item.model ? ` · ${item.model}` : ''} · {item.stage} · {item.intent}{item.key_prompt ? ' · key prompt' : ''}</div>
          <div className="text-[13px] font-medium">{item.prompt}</div>
          <div className="text-[11px] text-faint">Brand: <mark className="bg-gold/30 rounded px-0.5">{item.brand_name}</mark> · tracked competitors: {item.competitor_names.join(', ') || '—'}</div>
          <div className="text-[12px] leading-relaxed whitespace-pre-wrap max-h-[45vh] overflow-y-auto border border-edge rounded-md p-3 bg-raised"><Highlighted text={item.answer_text} terms={terms} /></div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-faint mb-1">Brand mentioned?</div>
              {[true, false].map((v) => <label key={String(v)} className="mr-3"><input type="radio" name="m" checked={mentioned === v} onChange={() => { setMentioned(v); if (!v) { setProminence(0); setSentiment('none'); } }} /> {v ? 'Yes' : 'No'}</label>)}
              <div className="text-[10px] text-faint mt-1">Means <em>this</em> brand. A different entity with the same name is <b>No</b> → <button type="button" onClick={() => { setMentioned(false); setProminence(0); setSentiment('none'); setNotes('namesake — different entity with the same name'); }} className="underline decoration-dotted hover:text-brand">mark as namesake</button></div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-faint mb-1">Sentiment (only where mentioned)</div>
              {RUBRIC.sentiment.map((s) => { const v = s.split(' ')[0]; return <label key={v} className="block"><input type="radio" name="s" checked={sentiment === v} onChange={() => setSentiment(v)} /> {s}</label>; })}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-faint mb-1">Prominence</div>
              {RUBRIC.prominence.map((s, i) => <label key={i} className="block"><input type="radio" name="p" checked={prominence === i} onChange={() => setProminence(i)} /> {s}</label>)}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-faint mb-1">Tracked competitors present</div>
              {item.competitor_names.map((c) => <label key={c} className="block"><input type="checkbox" checked={comps.has(c)} onChange={(e) => { const n = new Set(comps); e.target.checked ? n.add(c) : n.delete(c); setComps(n); }} /> {c}</label>)}
              {!item.competitor_names.length && <div className="text-faint">none tracked</div>}
            </div>
          </div>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional) — e.g. brand named only as a URL; answer truncated" className="w-full bg-raised border border-edge rounded px-2 py-1 text-[12px]" />
          <div className="flex items-center gap-3">
            <button onClick={submit} disabled={busy} className="px-3 py-1 rounded bg-brand text-on-brand text-[12px] disabled:opacity-50">Save &amp; next</button>
            <button onClick={() => load(lang)} disabled={busy} className="px-3 py-1 rounded border border-edge text-dim text-[12px]">Skip</button>
            {err && <span className="text-[11px] text-garnet">{err}</span>}
          </div>
        </div>
      )}
      {busy && !item && <div className="text-[12px] text-faint">Loading…</div>}
      {!busy && !item && err && <div className="text-[12px] text-garnet">{err}</div>}
      {!busy && !item && !err && p && p.pool > 0 && <div className="text-[12px] text-faint">Nothing left for you to label in this language.</div>}
    </div>
  );
}
