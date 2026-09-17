import { createClient } from '@/lib/supabase/server';
import { FlipScoreBadge } from '@/components/FlipScoreBadge';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { WatchlistActions } from './WatchlistActions';

export const dynamic = 'force-dynamic';

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: { sort?: string };
}) {
  const supabase = createClient();

  let query = supabase.from('watchlist').select('*, product:products(*)');

  switch (searchParams.sort) {
    case 'profit':
      query = query.order('expected_profit', { ascending: false });
      break;
    case 'roi':
      query = query.order('expected_roi_pct', { ascending: false });
      break;
    case 'flip_score':
      query = query.order('flip_score', { ascending: false });
      break;
    case 'capital':
      query = query.order('true_acquisition_cost_at_max', { ascending: true });
      break;
    default:
      query = query.order('created_at', { ascending: false });
  }

  const { data: rows } = await query;

  const sortLinks: { key: string; label: string }[] = [
    { key: '', label: 'Recently Added' },
    { key: 'flip_score', label: 'Highest Flip Score' },
    { key: 'profit', label: 'Highest Profit' },
    { key: 'roi', label: 'Highest ROI' },
    { key: 'capital', label: 'Lowest Capital' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Watchlist</h1>
          <p className="text-sm text-muted">Auctions you're tracking and analyzing.</p>
        </div>
        <Link
          href="/watchlist/add"
          className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          + Add Product
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {sortLinks.map((s) => (
          <Link
            key={s.key}
            href={s.key ? `/watchlist?sort=${s.key}` : '/watchlist'}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              (searchParams.sort ?? '') === s.key
                ? 'border-brand-400 bg-brand-50 text-brand-600'
                : 'border-line text-muted hover:bg-line/30'
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {!rows || rows.length === 0 ? (
        <div className="card rounded-md border border-dashed border-line py-16 text-center">
          <p className="text-sm text-muted">Your watchlist is empty.</p>
          <Link
            href="/watchlist/add"
            className="mt-3 inline-block rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            + Add MAC.BID Product
          </Link>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Condition</th>
                <th className="px-3 py-2">Current Bid</th>
                <th className="px-3 py-2">Max Bid</th>
                <th className="px-3 py-2">Expected Profit</th>
                <th className="px-3 py-2">ROI</th>
                <th className="px-3 py-2">Flip Score</th>
                <th className="px-3 py-2">Auction Ends</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
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
                  <td className="px-3 py-2 capitalize">{row.status.replace('_', ' ')}</td>
                  <td className="px-3 py-2">
                    <WatchlistActions watchlistId={row.id} status={row.status} />
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
