'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface SellableItem {
  id: string;
  true_acquisition_cost: number;
  product?: { name: string } | { name: string }[];
}

export function SalesForm({ sellableItems }: { sellableItems: SellableItem[] }) {
  const router = useRouter();
  const [inventoryId, setInventoryId] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [platform, setPlatform] = useState('facebook_marketplace');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [sellingFee, setSellingFee] = useState('0');
  const [shippingCost, setShippingCost] = useState('0');
  const [otherExpense, setOtherExpense] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function itemName(item: SellableItem) {
    const p = Array.isArray(item.product) ? item.product[0] : item.product;
    return p?.name ?? 'Unnamed item';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventory_id: inventoryId,
          sale_price: parseFloat(salePrice),
          platform,
          sale_date: saleDate,
          selling_fee: parseFloat(sellingFee) || 0,
          shipping_cost: parseFloat(shippingCost) || 0,
          other_expense: parseFloat(otherExpense) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save sale');
      router.refresh();
      setInventoryId('');
      setSalePrice('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (sellableItems.length === 0) {
    return (
      <div className="card rounded-md border border-dashed border-line p-6 text-center text-sm text-muted">
        No items are currently listed for sale. Move an inventory item to "Listed" first.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2 lg:col-span-4">
        <label className="mb-1 block text-sm font-medium">Item sold</label>
        <select
          required
          value={inventoryId}
          onChange={(e) => setInventoryId(e.target.value)}
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
        >
          <option value="">Select an item…</option>
          {sellableItems.map((item) => (
            <option key={item.id} value={item.id}>
              {itemName(item)}
            </option>
          ))}
        </select>
      </div>

      <Field label="Sale price ($)">
        <input required type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} className="field" />
      </Field>
      <Field label="Platform">
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="field">
          <option value="website">My Website</option>
          <option value="facebook_marketplace">Facebook Marketplace</option>
          <option value="ebay">eBay</option>
          <option value="offerup">OfferUp</option>
          <option value="in_person">In Person</option>
        </select>
      </Field>
      <Field label="Sale date">
        <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className="field" />
      </Field>
      <Field label="Selling fee ($)">
        <input type="number" value={sellingFee} onChange={(e) => setSellingFee(e.target.value)} className="field" />
      </Field>
      <Field label="Shipping/delivery ($)">
        <input type="number" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} className="field" />
      </Field>
      <Field label="Other expense ($)">
        <input type="number" value={otherExpense} onChange={(e) => setOtherExpense(e.target.value)} className="field" />
      </Field>

      <div className="flex items-end">
        <button
          type="submit"
          disabled={saving || !inventoryId}
          className="w-full rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Mark Sold'}
        </button>
      </div>

      {error && <p className="text-sm text-score-pass sm:col-span-2 lg:col-span-4">{error}</p>}

      <style jsx global>{`
        .field {
          width: 100%;
          border: 1px solid #e4e4e1;
          border-radius: 6px;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
      `}</style>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
