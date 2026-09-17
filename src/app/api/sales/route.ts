import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { calculateNetProfit } from '@/lib/calculations';
import { differenceInCalendarDays } from 'date-fns';

const SaleInput = z.object({
  inventory_id: z.string().uuid(),
  sale_price: z.number().positive(),
  platform: z.string().min(1),
  sale_date: z.string(),
  selling_fee: z.number().min(0).default(0),
  shipping_cost: z.number().min(0).default(0),
  other_expense: z.number().min(0).default(0),
});

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = SaleInput.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;

  const { data: inv, error: invError } = await supabase.from('inventory').select('*').eq('id', input.inventory_id).single();
  if (invError || !inv) return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 });

  const { netProfit, roiPct } = calculateNetProfit({
    salePrice: input.sale_price,
    trueAcquisitionCost: Number(inv.true_acquisition_cost),
    sellingFee: input.selling_fee,
    shippingCost: input.shipping_cost,
    otherExpense: input.other_expense,
  });

  const daysHeld = inv.picked_up_at
    ? differenceInCalendarDays(new Date(input.sale_date), new Date(inv.picked_up_at))
    : differenceInCalendarDays(new Date(input.sale_date), new Date(inv.created_at));

  const { data: sale, error } = await supabase
    .from('sales')
    .insert({
      owner_id: user.id,
      inventory_id: input.inventory_id,
      sale_price: input.sale_price,
      platform: input.platform,
      sale_date: input.sale_date,
      selling_fee: input.selling_fee,
      shipping_cost: input.shipping_cost,
      other_expense: input.other_expense,
      cost_basis: inv.true_acquisition_cost,
      gross_profit: netProfit,
      roi_pct: roiPct,
      days_held: daysHeld,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('inventory').update({ status: 'sold', updated_at: new Date().toISOString() }).eq('id', input.inventory_id);

  return NextResponse.json({ sale });
}
