import { createClient } from '@/lib/supabase/server';
import { StatCard } from '@/components/ui/StatCard';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const supabase = createClient();

  const [{ data: sales }, { data: unsoldInventory }] = await Promise.all([
    supabase.from('sales').select('*, inventory:inventory(product:products(name, brand_id, category_id))'),
    supabase.from('inventory').select('true_acquisition_cost').not('status', 'eq', 'sold'),
  ]);

  const hasSales = sales && sales.length > 0;

  const totalRevenue = (sales ?? []).reduce((s, x) => s + Number(x.sale_price), 0);
  const totalProfit = (sales ?? []).reduce((s, x) => s + Number(x.gross_profit), 0);
  const avgProfit = hasSales ? totalProfit / sales!.length : null;
  const avgRoi = hasSales ? sales!.reduce((s, x) => s + Number(x.roi_pct), 0) / sales!.length : null;
  const avgDaysHeld = hasSales
    ? sales!.filter((s) => s.days_held != null).reduce((s, x) => s + Number(x.days_held), 0) /
      Math.max(1, sales!.filter((s) => s.days_held != null).length)
    : null;
  const unsoldValue = (unsoldInventory ?? []).reduce((s, i) => s + Number(i.true_acquisition_cost ?? 0), 0);

  // Platform breakdown
  const byPlatform = new Map<string, { revenue: number; profit: number; count: number }>();
  for (const s of sales ?? []) {
    const key = s.platform;
    const entry = byPlatform.get(key) ?? { revenue: 0, profit: 0, count: 0 };
    entry.revenue += Number(s.sale_price);
    entry.profit += Number(s.gross_profit);
    entry.count += 1;
    byPlatform.set(key, entry);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted">
          Computed directly from your recorded sales — this grows more useful as you log more transactions.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Revenue" value={`$${totalRevenue.toFixed(0)}`} />
        <StatCard label="Total Profit" value={`$${totalProfit.toFixed(0)}`} tone={totalProfit > 0 ? 'positive' : undefined} />
        <StatCard label="Avg Profit / Item" value={avgProfit === null ? '—' : `$${avgProfit.toFixed(0)}`} />
        <StatCard label="Avg ROI" value={avgRoi === null ? '—' : `${avgRoi.toFixed(0)}%`} />
        <StatCard label="Avg Days Held" value={avgDaysHeld === null ? '—' : avgDaysHeld.toFixed(1)} />
        <StatCard label="Unsold Inventory Value" value={`$${unsoldValue.toFixed(0)}`} />
      </div>

      <div className="card p-4">
        <h2 className="mb-3 text-base font-semibold">By Platform</h2>
        {byPlatform.size === 0 ? (
          <p className="text-sm text-muted">No sales recorded yet — this breaks down automatically once you do.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2">Platform</th>
                <th className="py-2">Sales</th>
                <th className="py-2">Revenue</th>
                <th className="py-2">Profit</th>
              </tr>
            </thead>
            <tbody>
              {[...byPlatform.entries()].map(([platform, stats]) => (
                <tr key={platform} className="border-b border-line/60 last:border-0">
                  <td className="py-2 capitalize">{platform.replace('_', ' ')}</td>
                  <td className="py-2 tabular-nums">{stats.count}</td>
                  <td className="py-2 tabular-nums">${stats.revenue.toFixed(0)}</td>
                  <td className="py-2 tabular-nums text-score-excellent">${stats.profit.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card border-dashed p-4 text-sm text-muted">
        Brand/category/location breakdowns and "X product type averages Y% ROI" style insights arrive in Phase 3, once
        there's enough sales history to make them statistically meaningful rather than guesses from a handful of
        transactions. The schema (brand_id, category_id, source_location_id on every product) already supports this —
        it just needs data.
      </div>
    </div>
  );
}
