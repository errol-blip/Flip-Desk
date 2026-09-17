import { createClient } from '@/lib/supabase/server';
import { StatCard } from '@/components/ui/StatCard';
import { FlipScoreBadge } from '@/components/FlipScoreBadge';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = createClient();

  const [{ data: watching }, { data: endingToday }, { data: won }, { data: inventoryForSale }, { data: sales }, { data: bestOpps }] =
    await Promise.all([
      supabase.from('watchlist').select('id').eq('status', 'watching'),
      supabase
        .from('watchlist')
        .select('id, product:products!inner(auction_end_at)')
        .eq('status', 'watching')
        .gte('product.auction_end_at', new Date().toISOString())
        .lt('product.auction_end_at', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('watchlist').select('id').eq('status', 'won'),
      supabase.from('inventory').select('id, true_acquisition_cost, status').in('status', ['listed', 'ready_to_list', 'pending_sale']),
      supabase
        .from('sales')
        .select('sale_price, gross_profit, roi_pct, sale_date')
        .gte('sale_date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)),
      supabase
        .from('watchlist')
        .select(
          'id, max_recommended_bid, true_acquisition_cost_at_max, expected_profit, expected_roi_pct, flip_score, product:products(id, name, condition, current_bid, retail_msrp, auction_end_at, source_location_id)'
        )
        .eq('status', 'watching')
        .order('flip_score', { ascending: false })
        .limit(10),
    ]);

  const invested = (inventoryForSale ?? []).reduce((s, i) => s + Number(i.true_acquisition_cost ?? 0), 0);
  const revenueThisMonth = (sales ?? []).reduce((s, x) => s + Number(x.sale_price ?? 0), 0);
  const grossProfitThisMonth = (sales ?? []).reduce((s, x) => s + Number(x.gross_profit ?? 0), 0);
  const avgRoi =
    sales && sales.length > 0 ? sales.reduce((s, x) => s + Number(x.roi_pct ?? 0), 0) / sales.length : null;

  const hasOpportunities = (bestOpps ?? []).length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted">What needs your attention right now.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatCard label="Watching" value={String(watching?.length ?? 0)} />
        <StatCard label="Ending Today" value={String(endingToday?.length ?? 0)} />
        <StatCard label="Items Won" value={String(won?.length ?? 0)} />
        <StatCard label="For Sale" value={String(inventoryForSale?.length ?? 0)} />
        <StatCard label="Invested" value={`$${invested.toFixed(0)}`} />
        <StatCard
          label="Avg ROI"
          value={avgRoi === null ? '—' : `${avgRoi.toFixed(0)}%`}
          tone={avgRoi !== null && avgRoi >= 40 ? 'positive' : undefined}
        />
        <StatCard label="Revenue (mo.)" value={`$${revenueThisMonth.toFixed(0)}`} />
        <StatCard
          label="Gross Profit (mo.)"
          value={`$${grossProfitThisMonth.toFixed(0)}`}
          tone={grossProfitThisMonth > 0 ? 'positive' : undefined}
        />
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Best Opportunities</h2>
          <Link href="/deal-finder" className="text-sm font-medium text-brand-500 hover:text-brand-600">
            View all →
          </Link>
        </div>

        {!hasOpportunities ? (
          <div className="rounded-md border border-dashed border-line py-10 text-center">
            <p className="text-sm text-muted">Nothing on your watchlist yet.</p>
            <Link
              href="/watchlist/add"
              className="mt-3 inline-block rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              + Add MAC.BID Product
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">Product</th>
                  <th className="py-2 pr-3">Condition</th>
                  <th className="py-2 pr-3">Current Bid</th>
                  <th className="py-2 pr-3">Max Bid</th>
                  <th className="py-2 pr-3">Est. All-In</th>
                  <th className="py-2 pr-3">Expected Profit</th>
                  <th className="py-2 pr-3">ROI</th>
                  <th className="py-2 pr-3">Auction Ends</th>
                  <th className="py-2 pr-3">Flip Score</th>
                </tr>
              </thead>
              <tbody>
                {(bestOpps ?? []).map((row: any) => (
                  <tr key={row.id} className="border-b border-line/60 last:border-0">
                    <td className="py-2 pr-3 font-medium">{row.product?.name ?? '—'}</td>
                    <td className="py-2 pr-3 capitalize">{row.product?.condition?.replace('_', ' ') ?? '—'}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {row.product?.current_bid != null ? `$${Number(row.product.current_bid).toFixed(0)}` : '—'}
                    </td>
                    <td className="py-2 pr-3 tabular-nums font-medium">
                      {row.max_recommended_bid != null ? `$${Number(row.max_recommended_bid).toFixed(0)}` : '—'}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {row.true_acquisition_cost_at_max != null
                        ? `$${Number(row.true_acquisition_cost_at_max).toFixed(0)}`
                        : '—'}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-score-excellent">
                      {row.expected_profit != null ? `$${Number(row.expected_profit).toFixed(0)}` : '—'}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {row.expected_roi_pct != null ? `${Number(row.expected_roi_pct).toFixed(0)}%` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-muted">
                      {row.product?.auction_end_at
                        ? formatDistanceToNow(new Date(row.product.auction_end_at), { addSuffix: true })
                        : '—'}
                    </td>
                    <td className="py-2 pr-3">{row.flip_score != null && <FlipScoreBadge score={row.flip_score} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
