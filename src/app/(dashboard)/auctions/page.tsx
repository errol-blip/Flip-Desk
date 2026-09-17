import { createClient } from '@/lib/supabase/server';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AuctionsPage() {
  const supabase = createClient();
  const { data: products } = await supabase
    .from('products')
    .select('*, watchlist(status, flip_score)')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Auctions</h1>
          <p className="text-sm text-muted">Every MAC.BID product you've sourced into the system.</p>
        </div>
        <Link href="/watchlist/add" className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
          + Add Product
        </Link>
      </div>

      {!products || products.length === 0 ? (
        <div className="card rounded-md border border-dashed border-line py-16 text-center">
          <p className="text-sm text-muted">No products sourced yet.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Condition</th>
                <th className="px-3 py-2">Current Bid</th>
                <th className="px-3 py-2">Auction Ends</th>
                <th className="px-3 py-2">Watch Status</th>
                <th className="px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p: any) => (
                <tr key={p.id} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2 capitalize text-muted">{p.condition?.replace('_', ' ')}</td>
                  <td className="px-3 py-2 tabular-nums">{p.current_bid != null ? `$${Number(p.current_bid).toFixed(0)}` : '—'}</td>
                  <td className="px-3 py-2 text-muted">
                    {p.auction_end_at ? formatDistanceToNow(new Date(p.auction_end_at), { addSuffix: true }) : '—'}
                  </td>
                  <td className="px-3 py-2 capitalize">{p.watchlist?.[0]?.status?.replace('_', ' ') ?? '—'}</td>
                  <td className="px-3 py-2 text-muted">
                    {p.source_url ? (
                      <a href={p.source_url} target="_blank" className="text-brand-500 hover:underline">
                        View listing
                      </a>
                    ) : (
                      'Manual entry'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
