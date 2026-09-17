'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  calculateMaxBid,
  calculateTrueAcquisitionCost,
  calculateFlipScore,
  DEFAULT_FLIP_SCORE_WEIGHTS,
  type FeeSettings,
} from '@/lib/calculations';
import { FlipScoreBadge } from '@/components/FlipScoreBadge';

const CONDITIONS = ['like_new', 'open_box', 'used_good', 'used_fair', 'damaged', 'incomplete', 'unknown'] as const;

// Fallback fee assumptions, used only until the real Settings row loads
// (see the useEffect below) — so the live preview works instantly rather
// than waiting on a fetch.
const FALLBACK_FEES: FeeSettings = {
  buyerPremiumPct: 15,
  lotFeeFlat: 2,
  salesTaxPct: 7.25,
  pickupCost: 0,
  riskReservePct: 8,
  otherCost: 0,
};

export default function AddProductPage() {
  const router = useRouter();

  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchNote, setFetchNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [baseFees, setBaseFees] = useState<FeeSettings>(FALLBACK_FEES);
  const [defaultMinProfit, setDefaultMinProfit] = useState(50);
  const [defaultMinRoi, setDefaultMinRoi] = useState(40);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings;
        if (!s) return;
        setBaseFees({
          buyerPremiumPct: Number(s.buyer_premium_pct),
          lotFeeFlat: Number(s.lot_fee_flat),
          salesTaxPct: Number(s.sales_tax_pct),
          pickupCost: Number(s.default_pickup_cost),
          riskReservePct: Number(s.default_risk_reserve_pct),
          otherCost: 0,
        });
        setDefaultMinProfit(Number(s.default_min_profit));
        setDefaultMinRoi(Number(s.default_min_roi_pct));
        setDesiredMinProfit(String(s.default_min_profit));
        setDesiredMinRoi(String(s.default_min_roi_pct));
        setPickupCost(String(s.default_pickup_cost));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [form, setForm] = useState({
    name: '',
    condition: 'like_new' as (typeof CONDITIONS)[number],
    model_number: '',
    upc: '',
    retail_msrp: '',
    current_bid: '',
    auction_end_at: '',
    description: '',
    image_url: '',
    notes: '',
  });

  const [expectedResale, setExpectedResale] = useState('');
  const [desiredMinProfit, setDesiredMinProfit] = useState('50');
  const [desiredMinRoi, setDesiredMinRoi] = useState('40');
  const [sellingCosts, setSellingCosts] = useState('0');
  const [pickupCost, setPickupCost] = useState('0');
  const [compConfidence, setCompConfidence] = useState<'low' | 'medium' | 'high'>('medium');
  const [bulky, setBulky] = useState(false);
  const [localPickup, setLocalPickup] = useState(false);

  async function handleFetch() {
    if (!url) return;
    setFetching(true);
    setError(null);
    try {
      const res = await fetch('/api/products/fetch-macbid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Fetch failed');

      setFetchNote(data.note);
      setForm((f) => ({
        ...f,
        name: data.name ?? f.name,
        description: data.description ?? f.description,
        image_url: data.imageUrls?.[0] ?? f.image_url,
      }));
    } catch (e: any) {
      setFetchNote('Could not reach the URL automatically. Enter the product details manually below.');
    } finally {
      setFetching(false);
    }
  }

  const preview = useMemo(() => {
    const resale = parseFloat(expectedResale);
    if (!resale || resale <= 0) return null;

    const fees: FeeSettings = { ...baseFees, pickupCost: parseFloat(pickupCost) || 0 };

    const bid = calculateMaxBid({
      expectedResalePrice: resale,
      desiredMinProfit: parseFloat(desiredMinProfit) || 0,
      desiredMinRoiPct: parseFloat(desiredMinRoi) || 0,
      expectedSellingCosts: parseFloat(sellingCosts) || 0,
      fees,
    });

    const flip = calculateFlipScore({
      expectedProfit: bid.expectedProfitAtMax,
      expectedRoiPct: bid.expectedRoiPctAtMax,
      compConfidence,
      condition: form.condition,
      isBulkyOrShippingDifficult: bulky,
      requiresLocalPickup: localPickup,
      trueAcquisitionCost: bid.trueAcquisitionCostAtMax,
      weights: DEFAULT_FLIP_SCORE_WEIGHTS,
    });

    const currentBid = parseFloat(form.current_bid) || 0;
    const currentCost = calculateTrueAcquisitionCost(currentBid, resale, fees);

    return { bid, flip, currentCost, exceedsMax: currentBid > bid.maxHammerBid };
  }, [expectedResale, desiredMinProfit, desiredMinRoi, sellingCosts, pickupCost, baseFees, compConfidence, bulky, localPickup, form.condition, form.current_bid]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const productRes = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: url ? 'macbid' : 'manual',
          source_url: url || null,
          source_fetch_status: fetchNote ? 'partial' : null,
          name: form.name,
          model_number: form.model_number || null,
          upc: form.upc || null,
          condition: form.condition,
          description: form.description || null,
          image_urls: form.image_url ? [form.image_url] : [],
          retail_msrp: form.retail_msrp ? parseFloat(form.retail_msrp) : null,
          current_bid: form.current_bid ? parseFloat(form.current_bid) : null,
          auction_end_at: form.auction_end_at || null,
          notes: form.notes || null,
        }),
      });
      const productData = await productRes.json();
      if (!productRes.ok) throw new Error(productData.error?.formErrors?.[0] ?? productData.error ?? 'Could not save product');

      const resale = parseFloat(expectedResale);
      if (resale > 0) {
        const wlRes = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: productData.product.id,
            expected_resale_price: resale,
            expected_selling_costs: parseFloat(sellingCosts) || 0,
            pickup_cost_override: pickupCost !== '' ? parseFloat(pickupCost) : null,
            desired_min_profit: parseFloat(desiredMinProfit) || undefined,
            desired_min_roi_pct: parseFloat(desiredMinRoi) || undefined,
            comp_confidence: compConfidence,
            is_bulky_or_shipping_difficult: bulky,
            requires_local_pickup: localPickup,
          }),
        });
        const wlData = await wlRes.json();
        if (!wlRes.ok) throw new Error(wlData.error ?? 'Could not analyze opportunity');
      }

      router.push('/watchlist');
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Add MAC.BID Product</h1>
        <p className="text-sm text-muted">Paste a listing URL, then confirm the details before saving.</p>
      </div>

      {/* Step 1: paste URL */}
      <div className="card p-4">
        <label className="mb-1 block text-sm font-medium">MAC.BID product URL</label>
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.mac.bid/lot/..."
            className="flex-1 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
          />
          <button
            onClick={handleFetch}
            disabled={fetching || !url}
            className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-line/30 disabled:opacity-50"
          >
            {fetching ? 'Retrieving…' : 'Retrieve'}
          </button>
        </div>
        {fetchNote && (
          <p className="mt-2 rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-600">{fetchNote}</p>
        )}
        <p className="mt-2 text-xs text-muted">
          MAC.BID has no public API. Retrieval only reads public page metadata (title/image) when available — bid
          price, condition, and specs always need to be confirmed manually.
        </p>
      </div>

      {/* Step 2: editable product details */}
      <div className="card space-y-4 p-4">
        <h2 className="text-sm font-semibold text-muted">Product details</h2>

        <Field label="Product name *">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Condition">
            <select
              className="input"
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value as any })}
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c.replace('_', ' ')}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Auction end time">
            <input
              type="datetime-local"
              className="input"
              value={form.auction_end_at}
              onChange={(e) => setForm({ ...form, auction_end_at: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Model number">
            <input className="input" value={form.model_number} onChange={(e) => setForm({ ...form, model_number: e.target.value })} />
          </Field>
          <Field label="UPC">
            <input className="input" value={form.upc} onChange={(e) => setForm({ ...form, upc: e.target.value })} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Retail / MSRP ($)">
            <input
              type="number"
              className="input"
              value={form.retail_msrp}
              onChange={(e) => setForm({ ...form, retail_msrp: e.target.value })}
            />
          </Field>
          <Field label="Current bid ($)">
            <input
              type="number"
              className="input"
              value={form.current_bid}
              onChange={(e) => setForm({ ...form, current_bid: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Image URL">
          <input className="input" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
        </Field>

        <Field label="Description">
          <textarea
            className="input min-h-[70px]"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>

        <Field label="Notes">
          <textarea className="input min-h-[50px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>

      {/* Step 3: resale + bid calculator */}
      <div className="card space-y-4 p-4">
        <h2 className="text-sm font-semibold text-muted">Resale estimate & bid calculator</h2>
        <p className="text-xs text-muted">
          Enter comparable sold prices you've found elsewhere (eBay, Amazon, etc.) and set your target profit/ROI —
          the maximum bid is solved backward from these.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Expected resale price ($) *">
            <input type="number" className="input" value={expectedResale} onChange={(e) => setExpectedResale(e.target.value)} />
          </Field>
          <Field label="Expected selling/shipping cost ($)">
            <input type="number" className="input" value={sellingCosts} onChange={(e) => setSellingCosts(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pickup/transport cost for this item ($)">
            <input type="number" className="input" value={pickupCost} onChange={(e) => setPickupCost(e.target.value)} />
          </Field>
          <div className="flex items-end pb-2 text-xs text-muted">
            Overrides your Settings default just for this item — a treadmill and a phone case don't cost the same to move.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Desired minimum profit ($)">
            <input type="number" className="input" value={desiredMinProfit} onChange={(e) => setDesiredMinProfit(e.target.value)} />
          </Field>
          <Field label="Desired minimum ROI (%)">
            <input type="number" className="input" value={desiredMinRoi} onChange={(e) => setDesiredMinRoi(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Comparable confidence">
            <select className="input" value={compConfidence} onChange={(e) => setCompConfidence(e.target.value as any)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </Field>
          <label className="mt-6 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={bulky} onChange={(e) => setBulky(e.target.checked)} /> Bulky / hard to ship
          </label>
          <label className="mt-6 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={localPickup} onChange={(e) => setLocalPickup(e.target.checked)} /> Requires local pickup
          </label>
        </div>

        {preview && (
          <div className="rounded-md border border-line bg-paper p-4">
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <Metric label="Current Bid" value={`$${(parseFloat(form.current_bid) || 0).toFixed(0)}`} />
              <Metric label="Max Bid" value={`$${preview.bid.maxHammerBid.toFixed(0)}`} highlight />
              <Metric label="Est. All-In Cost" value={`$${preview.currentCost.trueAcquisitionCost.toFixed(0)}`} />
              <Metric label="Expected Profit" value={`$${preview.bid.expectedProfitAtMax.toFixed(0)}`} tone="positive" />
              <Metric label="Expected ROI" value={`${preview.bid.expectedRoiPctAtMax.toFixed(0)}%`} />
              <Metric
                label="Constraint used"
                value={preview.bid.constraintUsed === 'profit_floor' ? 'Profit floor' : preview.bid.constraintUsed === 'roi_floor' ? 'ROI floor' : 'Both'}
              />
              <div>
                <div className="stat-label">Flip Score</div>
                <div className="mt-1">
                  <FlipScoreBadge score={preview.flip.score} />
                </div>
              </div>
              <Metric
                label="Decision"
                value={preview.exceedsMax ? 'PASS — current bid exceeds max' : 'Within max bid'}
                tone={preview.exceedsMax ? 'negative' : 'positive'}
              />
            </div>

            {preview.flip.reasons.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs">
                {preview.flip.reasons.map((r, i) => (
                  <li key={i} className={r.direction === 'positive' ? 'text-score-excellent' : 'text-score-pass'}>
                    {r.direction === 'positive' ? '+ ' : '− '}
                    {r.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-score-pass">{error}</p>}

      <div className="flex justify-end gap-2 pb-6">
        <button
          onClick={handleSave}
          disabled={saving || !form.name}
          className="rounded-md bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save & Add to Watchlist'}
        </button>
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid #e4e4e1;
          border-radius: 6px;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        .input:focus {
          border-color: #4c7cf0;
          box-shadow: 0 0 0 1px #4c7cf0;
        }
      `}</style>
    </div>
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

function Metric({
  label,
  value,
  tone,
  highlight,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative';
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div
        className={`mt-0.5 font-semibold tabular-nums ${highlight ? 'text-lg' : ''} ${
          tone === 'positive' ? 'text-score-excellent' : tone === 'negative' ? 'text-score-pass' : ''
        }`}
      >
        {value}
      </div>
    </div>
  );
}
