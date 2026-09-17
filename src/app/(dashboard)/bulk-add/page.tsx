'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FlipScoreBadge } from '@/components/FlipScoreBadge';

interface ResultRow {
  input: { name?: string; upc?: string };
  status: 'added' | 'no_estimate' | 'error';
  flipScore?: number | null;
  maxBid?: number | null;
  error?: string;
}

export default function BulkAddPage() {
  const router = useRouter();
  const [raw, setRaw] = useState('');
  const [pickupCost, setPickupCost] = useState('0');
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function parseLines() {
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        // A line of 12-14 digits is treated as a UPC; anything else is a product name/keywords.
        if (/^\d{8,14}$/.test(line)) return { upc: line };
        return { name: line };
      });
  }

  async function handleProcess() {
    const items = parseLines();
    if (items.length === 0) return;
    setProcessing(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch('/api/extension/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, pickup_cost_override: pickupCost ? parseFloat(pickupCost) : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Bulk processing failed');
      setResults(data.results);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  }

  const lineCount = raw.split('\n').filter((l) => l.trim()).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bulk Add</h1>
        <p className="text-sm text-muted">
          Paste one UPC or product name per line. Each one gets an automatic eBay comparable search, resale
          estimate, max bid, and Flip Score — no per-item forms.
        </p>
      </div>

      <div className="card p-4">
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={'884116326367\nDeWalt 20V MAX Cordless Drill\n078742040901\nInstant Pot Duo 6 Qt'}
          className="min-h-[220px] w-full rounded-md border border-line px-3 py-2 font-mono text-sm outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted">{lineCount} item{lineCount === 1 ? '' : 's'} queued</span>
          <button
            onClick={handleProcess}
            disabled={processing || lineCount === 0}
            className="rounded-md bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {processing ? `Processing ${lineCount} items…` : `Process ${lineCount || ''} Items`}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label className="text-xs font-medium">Pickup/transport cost per item ($)</label>
          <input
            type="number"
            value={pickupCost}
            onChange={(e) => setPickupCost(e.target.value)}
            className="w-24 rounded border border-line px-2 py-1 text-xs"
          />
          <span className="text-xs text-muted">Applied to every item in this batch — falls back to your Settings default if left blank.</span>
        </div>
        <p className="mt-2 text-xs text-muted">
          Requires eBay API credentials configured on the server (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET). Items without
          a UPC match by keyword search instead, which is less precise — a UPC is always the better match.
        </p>
      </div>

      {error && <p className="text-sm text-score-pass">{error}</p>}

      {results && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2">Input</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Max Bid</th>
                <th className="px-3 py-2">Flip Score</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-2 font-medium">{r.input.name ?? r.input.upc}</td>
                  <td className="px-3 py-2">
                    {r.status === 'added' && <span className="text-score-excellent">Added</span>}
                    {r.status === 'no_estimate' && <span className="text-score-marginal">Added — no eBay match, complete manually</span>}
                    {r.status === 'error' && <span className="text-score-pass">{r.error}</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.maxBid != null ? `$${r.maxBid.toFixed(0)}` : '—'}</td>
                  <td className="px-3 py-2">{r.flipScore != null && <FlipScoreBadge score={r.flipScore} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end p-3">
            <button
              onClick={() => router.push('/watchlist')}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              View in Watchlist →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
