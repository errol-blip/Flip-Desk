import { createClient } from '@/lib/supabase/server';
import { InventoryActions } from './InventoryActions';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  awaiting_pickup: 'Awaiting Pickup',
  picked_up: 'Picked Up',
  inspecting: 'Inspecting',
  ready_to_list: 'Ready to List',
  listed: 'Listed',
  pending_sale: 'Pending Sale',
  sold: 'Sold',
  returned: 'Returned',
  problem: 'Problem',
};

export default async function InventoryPage() {
  const supabase = createClient();
  const { data: rows } = await supabase
    .from('inventory')
    .select('*, product:products(*)')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted">Items you've won, from pickup through resale.</p>
      </div>

      {!rows || rows.length === 0 ? (
        <div className="card rounded-md border border-dashed border-line py-16 text-center">
          <p className="text-sm text-muted">
            No inventory yet — items appear here automatically when you mark a watchlist item as Won.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((item: any) => (
            <div key={item.id} className="card p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{item.product?.name}</div>
                  <div className="text-xs capitalize text-muted">{item.product?.condition?.replace('_', ' ')}</div>
                </div>
                <span className="whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-xs font-medium">
                  {STATUS_LABEL[item.status] ?? item.status}
                </span>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="stat-label">Acquisition Cost</div>
                  <div className="font-medium tabular-nums">${Number(item.true_acquisition_cost).toFixed(0)}</div>
                </div>
                <div>
                  <div className="stat-label">Hammer Price</div>
                  <div className="font-medium tabular-nums">${Number(item.winning_hammer_price).toFixed(0)}</div>
                </div>
              </div>

              <InventoryActions inventoryId={item.id} status={item.status} publishToStore={item.publish_to_store} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
