'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const FLOW = ['awaiting_pickup', 'picked_up', 'inspecting', 'ready_to_list', 'listed', 'pending_sale', 'sold'];

export function InventoryActions({
  inventoryId,
  status,
  publishToStore,
}: {
  inventoryId: string;
  status: string;
  publishToStore: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const currentIndex = FLOW.indexOf(status);
  const nextStatus = currentIndex >= 0 && currentIndex < FLOW.length - 1 ? FLOW[currentIndex + 1] : null;

  async function advance() {
    if (!nextStatus) return;
    setBusy(true);
    await fetch(`/api/inventory/${inventoryId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    setBusy(false);
    router.refresh();
  }

  async function generateListing() {
    setBusy(true);
    await fetch('/api/listings/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventory_id: inventoryId }),
    });
    setBusy(false);
    router.push('/listings');
  }

  async function togglePublish() {
    setBusy(true);
    await fetch(`/api/inventory/${inventoryId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publish_to_store: !publishToStore }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {nextStatus && (
        <button
          onClick={advance}
          disabled={busy}
          className="rounded-md border border-line px-2.5 py-1.5 text-xs font-medium hover:bg-line/30 disabled:opacity-50"
        >
          Mark as {nextStatus.replace('_', ' ')}
        </button>
      )}
      {status === 'inspecting' || status === 'ready_to_list' || status === 'listed' ? (
        <button
          onClick={generateListing}
          disabled={busy}
          className="rounded-md bg-brand-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          Generate Listing
        </button>
      ) : null}
      {status === 'listed' && (
        <Link
          href="/sales"
          className="rounded-md border border-score-excellent/40 bg-score-excellent/10 px-2.5 py-1.5 text-xs font-medium text-score-excellent"
        >
          Mark Sold
        </Link>
      )}
      <button
        onClick={togglePublish}
        disabled={busy}
        className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
          publishToStore ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-line text-muted'
        }`}
      >
        {publishToStore ? 'Published to store' : 'Publish to store'}
      </button>
    </div>
  );
}
