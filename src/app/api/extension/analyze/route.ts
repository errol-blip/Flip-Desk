import { NextRequest, NextResponse } from 'next/server';
import { getOwnerFromToken } from '@/lib/auth-token';
import { createServiceClient } from '@/lib/supabase/service';
import { computeSnapshot } from '@/lib/bid-engine';
import { searchEbayComparables } from '@/lib/ebay';
import { estimateResaleValue } from '@/lib/calculations';

export async function POST(req: NextRequest) {
  const ownerId = await getOwnerFromToken(req);
  if (!ownerId) return NextResponse.json({ error: 'Invalid or missing API token' }, { status: 401 });

  const body = await req.json();
  const { name, upc, condition, currentBid, retailMsrp, pickupCost } = body;

  if (!name) return NextResponse.json({ error: 'Product name is required' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: settingsRow } = await supabase.from('settings').select('*').eq('owner_id', ownerId).maybeSingle();

  // Try to get a real resale estimate from eBay automatically — this is the
  // whole point of the extension: no manual comp entry needed per item.
  let estimate = null as ReturnType<typeof estimateResaleValue>;
  let ebayComparables: any[] = [];
  let ebayError: string | null = null;

  try {
    const result = await searchEbayComparables({ upc, keywords: name, limit: 8 });
    ebayComparables = result.comparables;
    if (result.comparables.length > 0) {
      estimate = estimateResaleValue(
        result.comparables.map((c) => ({ price: c.price, priceType: c.priceType, confidence: 'medium' as const }))
      );
    }
  } catch (e: any) {
    ebayError = e.message; // Missing eBay credentials, etc. — non-fatal, overlay just shows "no estimate"
  }

  if (!estimate) {
    return NextResponse.json({
      hasEstimate: false,
      ebayError,
      ebayComparables,
      message: ebayError
        ? 'eBay search is not configured on the server yet.'
        : 'No matching eBay listings found — add a comparable manually in the app.',
    });
  }

  const { bidResult, flip } = computeSnapshot(
    {
      expectedResalePrice: estimate.expected,
      compConfidence: estimate.confidence,
      condition: condition ?? 'like_new',
    },
    settingsRow,
    pickupCost != null ? { pickupCost } : undefined
  );

  return NextResponse.json({
    hasEstimate: true,
    estimate,
    ebayComparables,
    currentBid: currentBid ?? null,
    maxBid: bidResult.maxHammerBid,
    trueAcquisitionCostAtMax: bidResult.trueAcquisitionCostAtMax,
    expectedProfit: bidResult.expectedProfitAtMax,
    expectedRoiPct: bidResult.expectedRoiPctAtMax,
    flipScore: flip.score,
    flipScoreBand: flip.band,
    reasons: flip.reasons,
    exceedsMax: currentBid != null ? currentBid > bidResult.maxHammerBid : null,
  });
}
