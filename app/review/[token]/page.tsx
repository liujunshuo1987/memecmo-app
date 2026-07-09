// Client verification page — tokenized, no login (the token arrived in the
// client's email). Shows the snapshotted brand facts / prompt library /
// competitor list and lets the client approve or request changes.

import { serviceClient } from '@/lib/commerce';
import DecidePanel from './decide-panel';

export const dynamic = 'force-dynamic';

const KIND_TITLE: Record<string, { en: string; vi: string }> = {
  brand_profile: { en: 'Brand fact sheet', vi: 'Hồ sơ dữ kiện thương hiệu' },
  prompt_set: { en: 'Question library', vi: 'Thư viện câu hỏi' },
  competitor_set: { en: 'Competitor list', vi: 'Danh sách đối thủ' },
};

export default async function ReviewPage({ params }: { params: { token: string } }) {
  const sb = serviceClient();
  const { data: review } = await sb
    .from('asset_reviews')
    .select('kind, status, snapshot, note, created_at, project_id')
    .eq('token', params.token)
    .maybeSingle();

  let brandName = '';
  if (review) {
    const { data: p } = await sb.from('projects').select('brand_name').eq('id', review.project_id).maybeSingle();
    brandName = p?.brand_name ?? '';
  }

  if (!review) {
    return (
      <main className="min-h-screen bg-canvas text-ink flex items-center justify-center p-6">
        <div className="rounded-2xl border border-edge bg-surface p-8 max-w-md">
          <div className="text-sm text-faint">MemeCMO · GEO</div>
          <h1 className="mt-3 text-xl font-semibold">Review not found</h1>
        </div>
      </main>
    );
  }

  const title = KIND_TITLE[review.kind] ?? { en: review.kind, vi: review.kind };
  const snap: any = review.snapshot || {};

  return (
    <main className="min-h-screen bg-canvas text-ink p-6">
      <div className="max-w-2xl mx-auto space-y-6 py-6">
        <div>
          <div className="text-xs tracking-[0.25em] uppercase text-faint">MemeCMO · GEO</div>
          <h1 className="mt-2 text-2xl font-bold">{title.en}</h1>
          <p className="text-sm text-dim">{title.vi} · {brandName}</p>
          <p className="mt-2 text-[13px] text-faint leading-relaxed">
            Please check the content below. Everything we publish for your brand will be grounded on what you approve.
            <br />Vui lòng kiểm tra nội dung dưới đây — mọi nội dung chúng tôi xuất bản sẽ dựa trên những gì bạn xác nhận.
          </p>
        </div>

        {/* ── snapshot render per kind ── */}
        {review.kind === 'brand_profile' && (
          <div className="rounded-xl border border-edge divide-y divide-edge overflow-hidden">
            {[
              ['Definition', snap.definition],
              ['About', snap.description],
              ['Category', snap.category],
              ['Services', (snap.services || []).join(' · ')],
              ['Differentiators', (snap.differentiators || []).join(' · ')],
              ['Facts', (snap.facts || []).map((f: any) => `${f.label}: ${f.value}`).join(' · ')],
              ['Contact (NAP)', snap.nap ? Object.entries(snap.nap).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ') : ''],
              ['Audience', snap.audience],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label as string} className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-4 px-4 py-3 bg-surface">
                <div className="text-xs text-faint uppercase tracking-wider self-start pt-0.5">{label as string}</div>
                <div className="text-sm text-ink leading-relaxed">{value as string}</div>
              </div>
            ))}
          </div>
        )}

        {review.kind === 'prompt_set' && (
          <div className="space-y-3">
            <p className="text-xs text-faint">
              {(snap.promptSet || []).reduce((n: number, c: any) => n + (c.prompts || []).length, 0)} questions ·{' '}
              {(snap.keyPrompts || []).length} key (★) — these are the questions buyers ask AI about your category.
            </p>
            {(snap.promptSet || []).map((c: any, i: number) => (
              <details key={i} className="rounded-lg border border-edge bg-surface" open={i === 0}>
                <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium select-none">{c.label || c.category} · {(c.prompts || []).length}</summary>
                <ul className="px-4 pb-3 pt-1 space-y-1.5 border-t border-edge">
                  {(c.prompts || []).map((p: string, k: number) => {
                    const isKey = (snap.keyPrompts || []).includes(p);
                    return (
                      <li key={k} className="text-[13px] text-dim leading-relaxed">
                        {isKey && <span className="text-gold mr-1">★</span>}{p}
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
        )}

        {review.kind === 'competitor_set' && (
          <div className="rounded-xl border border-edge bg-surface p-4">
            <p className="text-xs text-faint mb-3">
              The competitors AI engines name alongside your brand — we benchmark you against this fixed list monthly.
              <br />Các đối thủ mà công cụ AI nêu tên cùng thương hiệu của bạn.
            </p>
            <ul className="space-y-2">
              {((snap.competitorSet?.groups || []) as any[]).map((g, i) => (
                <li key={i} className="text-sm text-ink">
                  {g.canonical}
                  {(g.aliases || []).length > 0 && <span className="text-faint text-xs"> (aka {g.aliases.join(', ')})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DecidePanel token={params.token} status={review.status} note={review.note} />
      </div>
    </main>
  );
}
