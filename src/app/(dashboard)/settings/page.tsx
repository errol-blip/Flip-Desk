'use client';

import { useEffect, useState } from 'react';
import { ApiTokensSection } from './ApiTokensSection';
import { EbaySection } from './EbaySection';

const DEFAULTS = {
  buyer_premium_pct: 15,
  lot_fee_flat: 2,
  sales_tax_pct: 7.25,
  default_pickup_cost: 0,
  default_risk_reserve_pct: 8,
  default_min_profit: 50,
  default_min_roi_pct: 40,
  weight_profit: 0.2,
  weight_roi: 0.2,
  weight_comp_confidence: 0.15,
  weight_brand: 0.1,
  weight_condition: 0.1,
  weight_demand: 0.1,
  weight_days_to_sell: 0.05,
  weight_logistics: 0.05,
  weight_capital: 0.05,
};

type SettingsForm = typeof DEFAULTS;

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsForm>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) {
          const { owner_id, updated_at, ...rest } = data.settings;
          setForm((f) => ({ ...f, ...rest }));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof SettingsForm>(key: K, value: number) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaved(true);
  }

  const weightSum =
    form.weight_profit +
    form.weight_roi +
    form.weight_comp_confidence +
    form.weight_brand +
    form.weight_condition +
    form.weight_demand +
    form.weight_days_to_sell +
    form.weight_logistics +
    form.weight_capital;

  if (loading) return <p className="text-sm text-muted">Loading settings…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted">These assumptions drive every cost and bid calculation in the app.</p>
      </div>

      <div className="card space-y-4 p-4">
        <h2 className="text-sm font-semibold text-muted">MAC.BID fee assumptions</h2>
        <Row label="Buyer premium (%)" value={form.buyer_premium_pct} onChange={(v) => set('buyer_premium_pct', v)} />
        <Row label="Lot fee (flat $)" value={form.lot_fee_flat} onChange={(v) => set('lot_fee_flat', v)} />
        <Row label="Sales tax (%)" value={form.sales_tax_pct} onChange={(v) => set('sales_tax_pct', v)} />
        <Row label="Default pickup/transport cost ($)" value={form.default_pickup_cost} onChange={(v) => set('default_pickup_cost', v)} />
        <Row
          label="Risk reserve (% of expected resale)"
          value={form.default_risk_reserve_pct}
          onChange={(v) => set('default_risk_reserve_pct', v)}
        />
      </div>

      <div className="card space-y-4 p-4">
        <h2 className="text-sm font-semibold text-muted">Bid targets (defaults — overridable per item)</h2>
        <Row label="Minimum desired profit ($)" value={form.default_min_profit} onChange={(v) => set('default_min_profit', v)} />
        <Row label="Minimum desired ROI (%)" value={form.default_min_roi_pct} onChange={(v) => set('default_min_roi_pct', v)} />
      </div>

      <div className="card space-y-4 p-4">
        <h2 className="text-sm font-semibold text-muted">Flip Score weights</h2>
        <p className="text-xs text-muted">
          These control how much each factor influences the 0-100 score. Current total:{' '}
          <span className={weightSum > 1.05 || weightSum < 0.95 ? 'font-medium text-score-marginal' : 'font-medium'}>
            {weightSum.toFixed(2)}
          </span>{' '}
          (aim for ~1.00 — not strictly enforced).
        </p>
        <Row label="Expected profit" value={form.weight_profit} step={0.01} onChange={(v) => set('weight_profit', v)} />
        <Row label="Expected ROI" value={form.weight_roi} step={0.01} onChange={(v) => set('weight_roi', v)} />
        <Row label="Comparable confidence" value={form.weight_comp_confidence} step={0.01} onChange={(v) => set('weight_comp_confidence', v)} />
        <Row label="Brand desirability" value={form.weight_brand} step={0.01} onChange={(v) => set('weight_brand', v)} />
        <Row label="Condition" value={form.weight_condition} step={0.01} onChange={(v) => set('weight_condition', v)} />
        <Row label="Estimated demand" value={form.weight_demand} step={0.01} onChange={(v) => set('weight_demand', v)} />
        <Row label="Days to sell" value={form.weight_days_to_sell} step={0.01} onChange={(v) => set('weight_days_to_sell', v)} />
        <Row label="Shipping/logistics difficulty" value={form.weight_logistics} step={0.01} onChange={(v) => set('weight_logistics', v)} />
        <Row label="Capital required" value={form.weight_capital} step={0.01} onChange={(v) => set('weight_capital', v)} />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        {saved && <span className="text-sm text-score-excellent">Saved.</span>}
      </div>

      <ApiTokensSection />
      <EbaySection />

      <div className="pb-6" />
    </div>
  );
}

function Row({
  label,
  value,
  onChange,
  step = 0.5,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm">{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-28 rounded-md border border-line px-2 py-1.5 text-right text-sm outline-none focus:border-brand-400"
      />
    </div>
  );
}
