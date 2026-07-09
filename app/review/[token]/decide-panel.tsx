'use client';

import { useState } from 'react';

export default function DecidePanel({ token, status, note }: { token: string; status: string; note: string | null }) {
  const [state, setState] = useState(status);
  const [changes, setChanges] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (action: 'approve' | 'request_changes') => {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/workspace/reviews/decide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action, note: changes.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Failed'); setBusy(false); return; }
      setState(action === 'approve' ? 'approved' : 'changes_requested');
    } catch (e) { setError(e instanceof Error ? e.message : 'Network error'); }
    setBusy(false);
  };

  if (state === 'approved') {
    return (
      <div className="rounded-xl border border-sage/40 bg-sage/10 p-5 text-center">
        <div className="text-sage text-lg font-semibold">✓ Confirmed · Đã xác nhận</div>
        <p className="text-xs text-dim mt-1">Thank you — we will proceed on this basis. Cảm ơn bạn!</p>
      </div>
    );
  }
  if (state === 'changes_requested') {
    return (
      <div className="rounded-xl border border-gold/40 bg-gold/10 p-5">
        <div className="text-gold font-semibold">Changes requested · Đã yêu cầu chỉnh sửa</div>
        {(note || changes) && <p className="text-sm text-dim mt-2 whitespace-pre-wrap">{note || changes}</p>}
        <p className="text-xs text-faint mt-2">Our team will follow up shortly. Đội ngũ sẽ liên hệ lại sớm.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-edge bg-surface p-5 space-y-3">
      {!showForm ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => decide('approve')}
            disabled={busy}
            className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-on-brand hover:brightness-110 disabled:opacity-60 transition"
          >
            ✓ Confirm — all correct · Xác nhận chính xác
          </button>
          <button
            onClick={() => setShowForm(true)}
            disabled={busy}
            className="flex-1 rounded-xl border border-edge px-4 py-3 text-sm font-medium text-ink hover:bg-raised disabled:opacity-60 transition"
          >
            ✎ Request changes · Yêu cầu chỉnh sửa
          </button>
        </div>
      ) : (
        <>
          <textarea
            value={changes}
            onChange={(e) => setChanges(e.target.value)}
            rows={4}
            placeholder="What should be corrected? · Cần chỉnh sửa gì?"
            className="w-full rounded-lg border border-edge bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-brand/50"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-2 text-sm text-dim hover:text-ink transition">Back</button>
            <button
              onClick={() => decide('request_changes')}
              disabled={busy || !changes.trim()}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-on-brand hover:brightness-110 disabled:opacity-50 transition"
            >
              Send · Gửi
            </button>
          </div>
        </>
      )}
      {error && <p className="text-xs text-garnet">{error}</p>}
    </div>
  );
}
