'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Policies {
  fulfillmentPolicies: { fulfillmentPolicyId: string; name: string }[];
  paymentPolicies: { paymentPolicyId: string; name: string }[];
  returnPolicies: { returnPolicyId: string; name: string }[];
  locations: { merchantLocationKey: string; name?: string }[];
}

export function PublishEbayButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [policies, setPolicies] = useState<Policies | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    categoryId: '',
    merchantLocationKey: '',
    fulfillmentPolicyId: '',
    paymentPolicyId: '',
    returnPolicyId: '',
  });

  async function openPicker() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ebay/policies');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not load your eBay policies');
      setPolicies(data);
      setForm((f) => ({
        ...f,
        merchantLocationKey: data.locations?.[0]?.merchantLocationKey ?? '',
        fulfillmentPolicyId: data.fulfillmentPolicies?.[0]?.fulfillmentPolicyId ?? '',
        paymentPolicyId: data.paymentPolicies?.[0]?.paymentPolicyId ?? '',
        returnPolicyId: data.returnPolicies?.[0]?.returnPolicyId ?? '',
      }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function publish() {
    if (!form.categoryId) {
      setError('Enter an eBay category ID.');
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/listings/${listingId}/publish-ebay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, quantity: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Publish failed');
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPublishing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={openPicker}
        className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
      >
        Publish to eBay
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-line bg-paper p-3">
      {loading ? (
        <p className="text-xs text-muted">Loading your eBay account policies…</p>
      ) : (
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-xs font-medium">eBay category ID</label>
            <input
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              placeholder="e.g. 20710"
              className="w-full rounded border border-line px-2 py-1 text-xs"
            />
            <p className="mt-1 text-[11px] text-muted">
              Find this on eBay's category lookup — the right category depends on the specific item, which isn't
              something to guess automatically.
            </p>
          </div>

          {policies && (
            <>
              <PolicySelect
                label="Location"
                value={form.merchantLocationKey}
                onChange={(v) => setForm({ ...form, merchantLocationKey: v })}
                options={policies.locations.map((l) => ({ value: l.merchantLocationKey, label: l.name ?? l.merchantLocationKey }))}
              />
              <PolicySelect
                label="Shipping policy"
                value={form.fulfillmentPolicyId}
                onChange={(v) => setForm({ ...form, fulfillmentPolicyId: v })}
                options={policies.fulfillmentPolicies.map((p) => ({ value: p.fulfillmentPolicyId, label: p.name }))}
              />
              <PolicySelect
                label="Payment policy"
                value={form.paymentPolicyId}
                onChange={(v) => setForm({ ...form, paymentPolicyId: v })}
                options={policies.paymentPolicies.map((p) => ({ value: p.paymentPolicyId, label: p.name }))}
              />
              <PolicySelect
                label="Return policy"
                value={form.returnPolicyId}
                onChange={(v) => setForm({ ...form, returnPolicyId: v })}
                options={policies.returnPolicies.map((p) => ({ value: p.returnPolicyId, label: p.name }))}
              />
            </>
          )}

          {error && <p className="text-xs text-score-pass">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={publish}
              disabled={publishing}
              className="rounded bg-brand-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {publishing ? 'Publishing…' : 'Confirm & Publish'}
            </button>
            <button onClick={() => setOpen(false)} className="rounded border border-line px-3 py-1.5 text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PolicySelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium">{label}</label>
      {options.length === 0 ? (
        <p className="text-[11px] text-score-pass">None found on your eBay account — set one up on eBay first.</p>
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded border border-line px-2 py-1 text-xs">
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
