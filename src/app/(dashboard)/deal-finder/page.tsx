import { createClient } from '@/lib/supabase/server';
import { FlipScoreBadge } from '@/components/FlipScoreBadge';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface Filters {
  condition?: string;
  min_profit?: string;
  min_roi?: string;
  min_flip_score?: string;
  ending_within_hours?: string;
}

export default async function DealFinderPage({ searchParams }: { searchParams: Filters }) {
  const supabase = createClient();

  const condition = searchParams.condition ?? 'like_new';
  const minProfit = searchParams.min_profit ? parseFloat(searchParams.min_profit) : undefined;
  const minRoi = searchParams.min_roi ? parseFloat(searchParams.min_roi) : undefined;
  const minFlipScore = searchParams.min_flip_score ? parseFloat(searchParams.min_flip_score) : undefined;
  const endingWithinHours = searchParams.ending_within_hours ? parseFloat(searchParams.ending_within_hours) : undefined;

  let query = supabase
    .from('watchlist')
    .select('*, product:products!inner(*)')
    .eq('status', 'watching');

  if (condition !== 'all') query = query.eq('product.condition', condition);
  if (minProfit !== undefined) query = query.gte('expected_profit', minProfit);
  if (minRoi !== undefined) query = query.gte('expected_roi_pct', minRoi);
  if (minFlipScore !== undefined) query = query.gte('flip_score', minFlipScore);
  if (endingWithinHours !== undefined) {
    query = query.lte('product.auction_end_at', new Date(Date.now() + endingWithinHours * 60 * 60 * 1000).toISOString());
  }

  const { data: rows } = await query.order('flip_score', { ascending: false });

  function buildUrl(overrides: Partial<Filters>) {
    const params = new URLSearchParams({ condition, ...searchParams, ...overrides } as any);
    return `/deal-finder?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Deal Finder</h1>
        <p className="text-sm text-muted">Filter your watchlist to find the best flips right now.</p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <FilterField label="Condition">
          <select defaultValue={condition} name="condition" className="filter-input" form="filters">
            <option value="like_new">Like New</option>
            <option value="open_box">Open Box</option>
            <option value="used_good">Used - Good</option>
            <option value="all">All conditions</option>
          </select>
        </FilterField>
        <FilterField label="Min. profit ($)">
          <input type="number" name="min_profit" defaultValue={searchParams.min_profit} className="filter-input" form="filters" />
        </FilterField>
        <FilterField label="Min. ROI (%)">
          <input type="number" name="min_roi" defaultValue={searchParams.min_roi} className="filter-input" form="filters" />
        </FilterField>
        <FilterField label="Min. Flip Score">
          <input type="number" name="min_flip_score" defaultValue={searchParams.min_flip_score} className="filter-input" form="filters" />
        </FilterField>
        <FilterField label="Ending within (hrs)">
          <input
            type="number"
            name="ending_within_hours"
            defaultValue={searchParams.ending_within_hours}
            className="filter-input"
            form="filters"
          />
        </FilterField>
        <form id="filters" action="/deal-finder" method="GET">
          <button type="submit" className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
            Apply
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/deal-finder?condition=like_new&min_profit=100&min_roi=50&min_flip_score=80&ending_within_hours=24"
          className="rounded-full border border-brand-400 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600"
        >
          ★ Best Flips (saved filter)
        </Link>
      </div>

      {!rows || rows.length === 0 ? (
        <div className="card rounded-md border border-dashed border-line py-16 text-center">
          <p className="text-sm text-muted">No watched items match these filters yet.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Condition</th>
                <th className="px-3 py-2">Current Bid</th>
                <th className="px-3 py-2">Max Bid</th>
                <th className="px-3 py-2">Profit</th>
                <th className="px-3 py-2">ROI</th>
                <th className="px-3 py-2">Flip Score</th>
                <th className="px-3 py-2">Ends</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any) => (
                <tr key={row.id} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-2 font-medium">{row.product?.name}</td>
                  <td className="px-3 py-2 capitalize text-muted">{row.product?.condition?.replace('_', ' ')}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.product?.current_bid != null ? `$${Number(row.product.current_bid).toFixed(0)}` : '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums font-medium">
                    {row.max_recommended_bid != null ? `$${Number(row.max_recommended_bid).toFixed(0)}` : '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-score-excellent">
                    {row.expected_profit != null ? `$${Number(row.expected_profit).toFixed(0)}` : '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.expected_roi_pct != null ? `${Number(row.expected_roi_pct).toFixed(0)}%` : '—'}
                  </td>
                  <td className="px-3 py-2">{row.flip_score != null && <FlipScoreBadge score={row.flip_score} />}</td>
                  <td className="px-3 py-2 text-muted">
                    {row.product?.auction_end_at
                      ? formatDistanceToNow(new Date(row.product.auction_end_at), { addSuffix: true })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`.filter-input { border: 1px solid #E4E4E1; border-radius: 6px; padding: 0.4rem 0.6rem; font-size: 0.8rem; width: 9rem; }`}</style>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}
