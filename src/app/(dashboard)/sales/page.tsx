import { createClient } from '@/lib/supabase/server';
import { SalesForm } from './SalesForm';

export const dynamic = 'force-dynamic';

export default async function SalesPage() {
  const supabase = createClient();

  const [{ data: sellable }, { data: sales }] = await Promise.all([
    supabase
      .from('inventory')
      .select('id, true_acquisition_cost, product:products(name)')
      .in('status', ['listed', 'pending_sale']),
    supabase
      .from('sales')
      .select('*, inventory:inventory(product:products(name))')
      .order('sale_date', { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sales</h1>
        <p className="text-sm text-muted">Record a sale to lock in profit and ROI.</p>
      </div>

      <SalesForm sellableItems={sellable ?? []} />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Platform</th>
              <th className="px-3 py-2">Sale Date</th>
              <th className="px-3 py-2">Sale Price</th>
              <th className="px-3 py-2">Profit</th>
              <th className="px-3 py-2">ROI</th>
              <th className="px-3 py-2">Days Held</th>
            </tr>
          </thead>
          <tbody>
            {(sales ?? []).map((s: any) => (
              <tr key={s.id} className="border-b border-line/60 last:border-0">
                <td className="px-3 py-2 font-medium">{s.inventory?.product?.name ?? '—'}</td>
                <td className="px-3 py-2 capitalize text-muted">{s.platform?.replace('_', ' ')}</td>
                <td className="px-3 py-2 text-muted">{s.sale_date}</td>
                <td className="px-3 py-2 tabular-nums">${Number(s.sale_price).toFixed(0)}</td>
                <td className={`px-3 py-2 tabular-nums ${Number(s.gross_profit) >= 0 ? 'text-score-excellent' : 'text-score-pass'}`}>
                  ${Number(s.gross_profit).toFixed(0)}
                </td>
                <td className="px-3 py-2 tabular-nums">{Number(s.roi_pct).toFixed(0)}%</td>
                <td className="px-3 py-2 tabular-nums text-muted">{s.days_held ?? '—'}</td>
              </tr>
            ))}
            {(!sales || sales.length === 0) && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted">
                  No sales recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
