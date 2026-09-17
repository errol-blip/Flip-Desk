'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const STATUSES = ['watching', 'bid_placed', 'won', 'lost', 'passed', 'expired'];

export function WatchlistActions({ watchlistId, status }: { watchlistId: string; status: string }) {
  const router = useRouter();
  const [showWinForm, setShowWinForm] = useState(false);
  const [hammer, setHammer] = useState('');
  const [taxesFees, setTaxesFees] = useState('');
  const [pickupDeadline, setPickupDeadline] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(newStatus: string) {
    if (newStatus === 'won') {
      setShowWinForm(true);
      return;
    }
    await fetch(`/api/watchlist/${watchlistId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    router.refresh();
  }

  async function confirmWin() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/watchlist/${watchlistId}/win`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winning_hammer_price: parseFloat(hammer),
          actual_taxes_fees: taxesFees ? parseFloat(taxesFees) : null,
          pickup_deadline: pickupDeadline || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not record the win');
      setShowWinForm(false);
      router.push('/inventory');
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (showWinForm) {
    return (
      <div className="absolute right-4 z-10 w-64 rounded-md border border-line bg-surface p-3 shadow-lg">
        <div className="mb-2 text-xs font-semibold">Mark as Won</div>
        <input
          type="number"
          placeholder="Winning hammer price"
          value={hammer}
          onChange={(e) => setHammer(e.target.value)}
          className="mb-2 w-full rounded border border-line px-2 py-1 text-sm"
        />
        <input
          type="number"
          placeholder="Actual taxes/fees (optional)"
          value={taxesFees}
          onChange={(e) => setTaxesFees(e.target.value)}
          className="mb-2 w-full rounded border border-line px-2 py-1 text-sm"
        />
        <input
          type="date"
          placeholder="Pickup deadline"
          value={pickupDeadline}
          onChange={(e) => setPickupDeadline(e.target.value)}
          className="mb-2 w-full rounded border border-line px-2 py-1 text-sm"
        />
        {error && <p className="mb-2 text-xs text-score-pass">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={confirmWin}
            disabled={saving || !hammer}
            className="flex-1 rounded bg-brand-500 px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Confirm'}
          </button>
          <button onClick={() => setShowWinForm(false)} className="rounded border border-line px-2 py-1.5 text-xs">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <select
      value={status}
      onChange={(e) => updateStatus(e.target.value)}
      className="rounded border border-line bg-surface px-2 py-1 text-xs capitalize"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.replace('_', ' ')}
        </option>
      ))}
    </select>
  );
}
