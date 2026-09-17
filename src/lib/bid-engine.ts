import {
  calculateMaxBid,
  calculateFlipScore,
  DEFAULT_FLIP_SCORE_WEIGHTS,
  type FeeSettings,
  type FlipScoreWeights,
} from './calculations';

export interface SettingsRow {
  buyer_premium_pct: number;
  lot_fee_flat: number;
  sales_tax_pct: number;
  default_pickup_cost: number;
  default_risk_reserve_pct: number;
  default_min_profit: number;
  default_min_roi_pct: number;
  weight_profit: number;
  weight_roi: number;
  weight_comp_confidence: number;
  weight_brand: number;
  weight_condition: number;
  weight_demand: number;
  weight_days_to_sell: number;
  weight_logistics: number;
  weight_capital: number;
}

export function feesFromSettings(settingsRow: SettingsRow | null): FeeSettings {
  return {
    buyerPremiumPct: Number(settingsRow?.buyer_premium_pct ?? 15),
    lotFeeFlat: Number(settingsRow?.lot_fee_flat ?? 2),
    salesTaxPct: Number(settingsRow?.sales_tax_pct ?? 7.25),
    pickupCost: Number(settingsRow?.default_pickup_cost ?? 0),
    riskReservePct: Number(settingsRow?.default_risk_reserve_pct ?? 8),
    otherCost: 0,
  };
}

export function weightsFromSettings(settingsRow: SettingsRow | null): FlipScoreWeights {
  if (!settingsRow) return DEFAULT_FLIP_SCORE_WEIGHTS;
  return {
    profit: Number(settingsRow.weight_profit),
    roi: Number(settingsRow.weight_roi),
    compConfidence: Number(settingsRow.weight_comp_confidence),
    brand: Number(settingsRow.weight_brand),
    condition: Number(settingsRow.weight_condition),
    demand: Number(settingsRow.weight_demand),
    daysToSell: Number(settingsRow.weight_days_to_sell),
    logistics: Number(settingsRow.weight_logistics),
    capital: Number(settingsRow.weight_capital),
  };
}

export interface SnapshotInput {
  expectedResalePrice: number;
  expectedSellingCosts?: number;
  desiredMinProfit?: number;
  desiredMinRoiPct?: number;
  compConfidence: 'low' | 'medium' | 'high';
  condition: 'like_new' | 'open_box' | 'used_good' | 'used_fair' | 'damaged' | 'incomplete' | 'unknown';
  brandDesirability?: number | null;
  estimatedDemand?: number | null;
  estimatedDaysToSell?: number | null;
  isBulkyOrShippingDifficult?: boolean;
  requiresLocalPickup?: boolean;
}

/**
 * Runs the full max-bid + flip-score pipeline for one product, given the
 * user's saved settings. This is the single source of truth reused by the
 * web app's watchlist route, the Chrome extension's analyze/bulk routes,
 * and the bulk-add page — so behavior can never drift between them.
 */
export function computeSnapshot(input: SnapshotInput, settingsRow: SettingsRow | null, feeOverrides?: Partial<FeeSettings>) {
  const fees = { ...feesFromSettings(settingsRow), ...feeOverrides };
  const weights = weightsFromSettings(settingsRow);

  const minProfit = input.desiredMinProfit ?? Number(settingsRow?.default_min_profit ?? 50);
  const minRoiPct = input.desiredMinRoiPct ?? Number(settingsRow?.default_min_roi_pct ?? 40);

  const bidResult = calculateMaxBid({
    expectedResalePrice: input.expectedResalePrice,
    desiredMinProfit: minProfit,
    desiredMinRoiPct: minRoiPct,
    expectedSellingCosts: input.expectedSellingCosts ?? 0,
    fees,
  });

  const flip = calculateFlipScore({
    expectedProfit: bidResult.expectedProfitAtMax,
    expectedRoiPct: bidResult.expectedRoiPctAtMax,
    compConfidence: input.compConfidence,
    brandDesirability: input.brandDesirability,
    condition: input.condition,
    estimatedDemand: input.estimatedDemand,
    estimatedDaysToSell: input.estimatedDaysToSell,
    isBulkyOrShippingDifficult: input.isBulkyOrShippingDifficult,
    requiresLocalPickup: input.requiresLocalPickup,
    trueAcquisitionCost: bidResult.trueAcquisitionCostAtMax,
    weights,
  });

  return { bidResult, flip };
}
