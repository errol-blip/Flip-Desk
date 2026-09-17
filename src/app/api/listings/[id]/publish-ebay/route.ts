import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getValidAccessToken } from '@/lib/ebay-oauth';
import { createAndPublishEbayListing } from '@/lib/ebay-listing';

const PublishInput = z.object({
  categoryId: z.string().min(1),
  merchantLocationKey: z.string().min(1),
  fulfillmentPolicyId: z.string().min(1),
  paymentPolicyId: z.string().min(1),
  returnPolicyId: z.string().min(1),
  quantity: z.number().int().positive().default(1),
});

const CONDITION_MAP: Record<string, any> = {
  like_new: 'LIKE_NEW',
  open_box: 'LIKE_NEW',
  used_good: 'USED_GOOD',
  used_fair: 'USED_ACCEPTABLE',
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = PublishInput.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [{ data: listing, error: listingError }, { data: account }] = await Promise.all([
    supabase.from('listings').select('*, inventory:inventory(*, product:products(*))').eq('id', params.id).single(),
    supabase.from('ebay_accounts').select('*').eq('owner_id', user.id).maybeSingle(),
  ]);

  if (listingError || !listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  if (listing.platform !== 'ebay') return NextResponse.json({ error: 'This listing is not an eBay draft' }, { status: 400 });
  if (!account) return NextResponse.json({ error: 'Connect your eBay account first, in Settings.' }, { status: 400 });
  if (!listing.suggested_asking_price) return NextResponse.json({ error: 'This listing has no price set' }, { status: 400 });

  const imageUrls: string[] = listing.inventory?.product?.image_urls ?? [];
  if (imageUrls.length === 0) {
    return NextResponse.json({ error: 'eBay requires at least one photo — add one to the inventory item first.' }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(account, async (newToken, expiresAt) => {
      await supabase
        .from('ebay_accounts')
        .update({ access_token: newToken, access_token_expires_at: expiresAt, updated_at: new Date().toISOString() })
        .eq('owner_id', user.id);
    });

    const result = await createAndPublishEbayListing(accessToken, {
      sku: `flipdesk-${listing.inventory_id}`,
      title: listing.title,
      description: listing.full_description,
      price: Number(listing.suggested_asking_price),
      quantity: parsed.data.quantity,
      condition: CONDITION_MAP[listing.inventory?.product?.condition] ?? 'USED_GOOD',
      imageUrls,
      categoryId: parsed.data.categoryId,
      merchantLocationKey: parsed.data.merchantLocationKey,
      fulfillmentPolicyId: parsed.data.fulfillmentPolicyId,
      paymentPolicyId: parsed.data.paymentPolicyId,
      returnPolicyId: parsed.data.returnPolicyId,
    });

    await supabase
      .from('listings')
      .update({
        status: 'live',
        external_listing_id: result.listingId,
        external_listing_url: result.listingUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', listing.id);

    return NextResponse.json({ listingUrl: result.listingUrl, listingId: result.listingId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
