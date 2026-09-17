import { createClient } from '@/lib/supabase/server';
import { CopyButton } from './CopyButton';
import { PublishEbayButton } from './PublishEbayButton';

export const dynamic = 'force-dynamic';

const PLATFORM_LABEL: Record<string, string> = {
  website: 'My Website',
  facebook_marketplace: 'Facebook Marketplace',
  ebay: 'eBay',
  offerup: 'OfferUp',
};

export default async function ListingsPage() {
  const supabase = createClient();
  const { data: listings } = await supabase
    .from('listings')
    .select('*, inventory:inventory(*, product:products(name))')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Listings</h1>
        <p className="text-sm text-muted">
          Rule-based drafts generated from your product and pricing data — review and copy where you need them.
          Nothing is published automatically.
        </p>
      </div>

      {!listings || listings.length === 0 ? (
        <div className="card rounded-md border border-dashed border-line py-16 text-center">
          <p className="text-sm text-muted">
            No listings yet. From an Inventory item marked "Inspecting" or later, click "Generate Listing".
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map((l: any) => (
            <div key={l.id} className="card p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {PLATFORM_LABEL[l.platform] ?? l.platform} · {l.inventory?.product?.name}
                </div>
                <span className="rounded-full border border-line px-2 py-0.5 text-xs capitalize">{l.status}</span>
              </div>

              {l.platform === 'ebay' && (
                <div className="mb-3">
                  {l.status === 'live' && l.external_listing_url ? (
                    <a
                      href={l.external_listing_url}
                      target="_blank"
                      className="text-xs font-medium text-score-excellent hover:underline"
                    >
                      Live on eBay →
                    </a>
                  ) : (
                    <PublishEbayButton listingId={l.id} />
                  )}
                </div>
              )}

              <div className="space-y-2">
                <CopyRow label="Title" value={l.title} />
                <CopyRow label="Short description" value={l.short_description} multiline />
                <CopyRow label="Full description" value={l.full_description} multiline />
                <CopyRow
                  label="Price"
                  value={
                    l.suggested_asking_price
                      ? `$${Number(l.suggested_asking_price).toFixed(0)}${
                          l.suggested_quick_sale_price ? ` (quick sale: $${Number(l.suggested_quick_sale_price).toFixed(0)})` : ''
                        }`
                      : '—'
                  }
                />
                {l.keywords?.length > 0 && (
                  <div className="text-xs text-muted">Keywords: {l.keywords.join(', ')}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-line bg-paper p-2.5">
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[11px] font-medium uppercase text-muted">{label}</div>
        <div className={multiline ? 'whitespace-pre-wrap text-sm' : 'truncate text-sm'}>{value}</div>
      </div>
      <CopyButton text={value} />
    </div>
  );
}
