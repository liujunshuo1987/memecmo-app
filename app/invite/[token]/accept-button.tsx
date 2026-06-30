'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AcceptButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/workspace/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not accept invitation');
        setBusy(false);
        return;
      }
      router.push('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        onClick={accept}
        disabled={busy}
        className="inline-flex w-full items-center justify-center rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-on-brand disabled:opacity-60"
      >
        {busy ? 'Joining…' : 'Accept & join'}
      </button>
      {error && <p className="mt-3 text-sm text-garnet">{error}</p>}
    </div>
  );
}
