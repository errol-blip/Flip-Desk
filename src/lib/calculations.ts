/**
 * Core business math for the deal-evaluation engine.
 *
 * These are pure functions — no I/O — so they're trivially unit-testable
 * and can be called identically from a server route, a client component
 * preview, or (later) a Chrome extension background script.
 */

export interface FeeSettings {
  buyerPremiumPct: number; // e.g. 15 for 15%
  lotFeeFlat: number;
  salesTaxPct: number; // applied to (hammer + buyer premium), typical for auction tax rules
  pickupCost: number;
  riskReservePct: number; // % of expected resale price, reserved for repair/return risk
  otherCost: number;
}

export interface TrueAcquisitionCostBreakdown {
  hammerBid: number;
  buyerPremium: number;
  lotFee: number;
  salesTax: number;
  pickupCost: number;
  riskReserve: number;
  otherCost: number;
  trueAcquisitionCost: number;
}

/**
 * Computes the fully-loaded cost of acquiring an item at a given hammer price.
 * Sales tax is calculated on (hammer + buyer premium), which is how most
 * auction platforms including MAC.BID structure invoiced tax. Adjust here if
 * your jurisdiction/platform differs.
 */
export function calculateTrueAcquisitionCost(
  hammerBid: number,
  expectedResalePrice: number,
  fees: FeeSettings
): TrueAcquisitionCostBreakdown {
  const buyerPremium = hammerBid * (fees.buyerPremiumPct / 100);
  const lotFee = fees.lotFeeFlat;
  const salesTax = (hammerBid + buyerPremium) * (fees.salesTaxPct / 100);
  const pickupCost = fees.pickupCost;
  const riskReserve = expectedResalePrice * (fees.riskReservePct / 100);
  const otherCost = fees.otherCost;

  const trueAcquisitionCost =
    hammerBid + buyerPremium + lotFee + salesTax + pickupCost + riskReserve + otherCost;

  return {
    hammerBid,
    buyerPremium,
    lotFee,
    salesTax,
    pickupCost,
    riskReserve,
    otherCost,
    trueAcquisitionCost,
  };
}

export interface MaxBidInputs {
  expectedResalePrice: number;
  desiredMinProfit: number; // dollar floor
  desiredMinRoiPct: number; // percentage floor, applied against true acquisition cost
  expectedSellingCosts: number; // shipping/platform fees expected at sale time
  fees: FeeSettings;
}

export interface MaxBidResult {
  maxHammerBid: number;
  trueAcquisitionCostAtMax: number;
  expectedProfitAtMax: number;
  expectedRoiPctAtMax: number;
  constraintUsed: 'profit_floor' | 'roi_floor' | 'both_equal';
}

/**
 * Solves BACKWARD for the maximum hammer bid that still satisfies both the
 * dollar-profit floor and the ROI% floor, net of buyer premium, lot fee,
 * sales tax, pickup, risk reserve, and expected selling costs at resale.
 *
 * Because buyer premium and sales tax are both proportional to the hammer
 * bid, true acquisition cost is an affine (linear) function of hammer bid:
 *
 *   TAC(h) = h * (1 + premiumRate) * (1 + taxRate) + lotFee + pickup + riskReserve + other
 *          = h * k  +  fixedCosts
 *
 * where k = (1 + premiumRate) * (1 + taxRate).
 *
 * Profit floor:  resale - sellingCosts - TAC(h) >= minProfit
 *   =>  h <= (resale - sellingCosts - minProfit - fixedCosts) / k
 *
 * ROI floor:     (resale - sellingCosts - TAC(h)) / TAC(h) >= minRoi
 *   =>  (resale - sellingCosts) / TAC(h) >= 1 + minRoi
 *   =>  TAC(h) <= (resale - sellingCosts) / (1 + minRoi)
 *   =>  h <= ((resale - sellingCosts) / (1 + minRoi) - fixedCosts) / k
 *
 * The true max bid is the MINIMUM of the two solutions (whichever floor
 * binds first), floored at 0.
 */
export function calculateMaxBid(inputs: MaxBidInputs): MaxBidResult {
  const { expectedResalePrice, desiredMinProfit, desiredMinRoiPct, expectedSellingCosts, fees } =
    inputs;

  const premiumRate = fees.buyerPremiumPct / 100;
  const taxRate = fees.salesTaxPct / 100;
  const k = (1 + premiumRate) * (1 + taxRate);

  const riskReserve = expectedResalePrice * (fees.riskReservePct / 100);
  const fixedCosts = fees.lotFeeFlat + fees.pickupCost + riskReserve + fees.otherCost;

  const netAvailable = expectedResalePrice - expectedSellingCosts;

  const hammerFromProfitFloor = (netAvailable - desiredMinProfit - fixedCosts) / k;
  const hammerFromRoiFloor = (netAvailable / (1 + desiredMinRoiPct / 100) - fixedCosts) / k;

  let constraintUsed: MaxBidResult['constraintUsed'] = 'both_equal';
  let maxHammerBid: number;

  if (hammerFromProfitFloor < hammerFromRoiFloor) {
    maxHammerBid = hammerFromProfitFloor;
    constraintUsed = 'profit_floor';
  } else if (hammerFromRoiFloor < hammerFromProfitFloor) {
    maxHammerBid = hammerFromRoiFloor;
    constraintUsed = 'roi_floor';
  } else {
    maxHammerBid = hammerFromProfitFloor;
  }

  maxHammerBid = Math.max(0, Math.round(maxHammerBid * 100) / 100);

  const tacAtMax = calculateTrueAcquisitionCost(maxHammerBid, expectedResalePrice, fees);
  const expectedProfitAtMax = netAvailable - tacAtMax.trueAcquisitionCost;
  const expectedRoiPctAtMax =
    tacAtMax.trueAcquisitionCost > 0 ? (expectedProfitAtMax / tacAtMax.trueAcquisitionCost) * 100 : 0;

  return {
    maxHammerBid,
    trueAcquisitionCostAtMax: tacAtMax.trueAcquisitionCost,
    expectedProfitAtMax: Math.round(expectedProfitAtMax * 100) / 100,
    expectedRoiPctAtMax: Math.round(expectedRoiPctAtMax * 100) / 100,
    constraintUsed,
  };
}

export interface SaleFinancials {
  salePrice: number;
  trueAcquisitionCost: number;
  sellingFee: number;
  shippingCost: number;
  otherExpense: number;
}

export function calculateNetProfit(sale: SaleFinancials) {
  const netProfit =
    sale.salePrice - sale.trueAcquisitionCost - sale.sellingFee - sale.shippingCost - sale.otherExpense;
  const roiPct = sale.trueAcquisitionCost > 0 ? (netProfit / sale.trueAcquisitionCost) * 100 : 0;
  return {
    netProfit: Math.round(netProfit * 100) / 100,
    roiPct: Math.round(roiPct * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Resale price estimation from comparables
// ---------------------------------------------------------------------------

export interface Comparable {
  price: number;
  priceType: 'new_retail' | 'open_box' | 'used' | 'actual_sold';
  confidence: 'low' | 'medium' | 'high';
}

export interface ResaleEstimate {
  quickSale: number;
  expected: number;
  optimistic: number;
  confidence: 'low' | 'medium' | 'high';
  sampleSize: number;
}

const CONFIDENCE_WEIGHT = { low: 1, medium: 2, high: 3 };
// Actual sold prices are weighted far more heavily than asking prices, per spec.
const PRICE_TYPE_WEIGHT: Record<Comparable['priceType'], number> = {
  actual_sold: 3,
  used: 1.5,
  open_box: 1,
  new_retail: 0.5,
};

/**
 * Blends comparable prices into three resale scenarios. This is intentionally
 * a transparent, explainable statistical blend (not a black box) — it uses
 * weighted percentile-style positioning rather than a naive average, so a
 * handful of confident "actual sold" data points dominate the estimate.
 */
export function estimateResaleValue(comparables: Comparable[]): ResaleEstimate | null {
  if (comparables.length === 0) return null;

  const weighted = comparables
    .map((c) => ({
      price: c.price,
      weight: CONFIDENCE_WEIGHT[c.confidence] * PRICE_TYPE_WEIGHT[c.priceType],
    }))
    .sort((a, b) => a.price - b.price);

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);

  function weightedPercentile(pct: number): number {
    const target = totalWeight * pct;
    let cumulative = 0;
    for (const w of weighted) {
      cumulative += w.weight;
      if (cumulative >= target) return w.price;
    }
    return weighted[weighted.length - 1].price;
  }

  const quickSale = weightedPercentile(0.25); // sell fast, lower end
  const expected = weightedPercentile(0.5); // median-weighted
  const optimistic = weightedPercentile(0.8); // patient sale, upper end

  const soldCount = comparables.filter((c) => c.priceType === 'actual_sold').length;
  const highConfCount = comparables.filter((c) => c.confidence === 'high').length;

  let confidence: ResaleEstimate['confidence'] = 'low';
  if (comparables.length >= 4 && (soldCount >= 2 || highConfCount >= 2)) confidence = 'high';
  else if (comparables.length >= 2) confidence = 'medium';

  return {
    quickSale: Math.round(quickSale * 100) / 100,
    expected: Math.round(expected * 100) / 100,
    optimistic: Math.round(optimistic * 100) / 100,
    confidence,
    sampleSize: comparables.length,
  };
}

// ---------------------------------------------------------------------------
// Flip Score — explainable 0-100 decision-support score
// ---------------------------------------------------------------------------

export interface FlipScoreWeights {
  profit: number;
  roi: number;
  compConfidence: number;
  brand: number;
  condition: number;
  demand: number;
  daysToSell: number;
  logistics: number;
  capital: number;
}

export interface FlipScoreInputs {
  expectedProfit: number;
  expectedRoiPct: number;
  compConfidence: 'low' | 'medium' | 'high';
  brandDesirability?: number | null; // 0-100
  condition: 'like_new' | 'open_box' | 'used_good' | 'used_fair' | 'damaged' | 'incomplete' | 'unknown';
  estimatedDemand?: number | null; // 0-100, manual/heuristic in V1
  estimatedDaysToSell?: number | null;
  isBulkyOrShippingDifficult?: boolean;
  requiresLocalPickup?: boolean;
  trueAcquisitionCost: number;
  weights: FlipScoreWeights;
}

export interface FlipScoreResult {
  score: number;
  band: 'excellent' | 'good' | 'marginal' | 'pass';
  reasons: { label: string; direction: 'positive' | 'negative' }[];
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

const CONDITION_SCORE: Record<FlipScoreInputs['condition'], number> = {
  like_new: 95,
  open_box: 85,
  used_good: 65,
  used_fair: 40,
  damaged: 10,
  incomplete: 5,
  unknown: 30,
};

const COMP_CONFIDENCE_SCORE = { low: 30, medium: 65, high: 95 };

/**
 * Produces a 0-100 decision-support score plus a human-readable list of
 * reasons. Explicitly NOT presented as scientifically precise — it's a
 * weighted heuristic over configurable weights (see settings table).
 */
export function calculateFlipScore(inputs: FlipScoreInputs): FlipScoreResult {
  const reasons: FlipScoreResult['reasons'] = [];
  const w = inputs.weights;

  // Normalize each factor to 0-100, then combine by weight.
  // Profit: soft-cap scoring — $200+ profit maxes this component out.
  const profitScore = clamp01(inputs.expectedProfit / 200) * 100;
  if (inputs.expectedProfit >= 100) reasons.push({ label: `$${inputs.expectedProfit.toFixed(0)} expected profit`, direction: 'positive' });
  else if (inputs.expectedProfit < 30) reasons.push({ label: 'Thin dollar profit margin', direction: 'negative' });

  // ROI: 100%+ ROI maxes this component out.
  const roiScore = clamp01(inputs.expectedRoiPct / 100) * 100;
  if (inputs.expectedRoiPct >= 50) reasons.push({ label: `${inputs.expectedRoiPct.toFixed(0)}% projected ROI`, direction: 'positive' });
  else if (inputs.expectedRoiPct < 20) reasons.push({ label: 'Low projected ROI', direction: 'negative' });

  const compScore = COMP_CONFIDENCE_SCORE[inputs.compConfidence];
  if (inputs.compConfidence === 'high') reasons.push({ label: 'Strong sold-price comparable data', direction: 'positive' });
  if (inputs.compConfidence === 'low') reasons.push({ label: 'Weak/limited comparable data — estimate is uncertain', direction: 'negative' });

  const brandScore = inputs.brandDesirability ?? 50;
  if ((inputs.brandDesirability ?? 0) >= 75) reasons.push({ label: 'Recognizable, in-demand brand', direction: 'positive' });

  const conditionScore = CONDITION_SCORE[inputs.condition];
  if (inputs.condition === 'like_new') reasons.push({ label: 'Like New condition', direction: 'positive' });
  if (['damaged', 'incomplete'].includes(inputs.condition)) reasons.push({ label: 'Damaged/incomplete condition raises risk', direction: 'negative' });

  const demandScore = inputs.estimatedDemand ?? 50;
  if ((inputs.estimatedDemand ?? 0) >= 75) reasons.push({ label: 'High local demand', direction: 'positive' });

  // Days to sell: fewer days is better. 3 days -> ~100, 30+ days -> ~0.
  const days = inputs.estimatedDaysToSell ?? 14;
  const daysScore = clamp01(1 - (days - 3) / 27) * 100;
  if (days > 21) reasons.push({ label: 'Slow-moving category — long expected days to sell', direction: 'negative' });

  const logisticsScore = inputs.isBulkyOrShippingDifficult ? 30 : 85;
  if (inputs.isBulkyOrShippingDifficult) reasons.push({ label: 'Bulky item — shipping/logistics difficult', direction: 'negative' });
  if (inputs.requiresLocalPickup) reasons.push({ label: 'Local pickup likely required', direction: 'negative' });

  // Capital required: less capital tied up is better. $500+ starts hurting the score.
  const capitalScore = clamp01(1 - inputs.trueAcquisitionCost / 500) * 100;
  if (inputs.trueAcquisitionCost > 400) reasons.push({ label: 'High capital required for this single item', direction: 'negative' });

  const weightedSum =
    profitScore * w.profit +
    roiScore * w.roi +
    compScore * w.compConfidence +
    brandScore * w.brand +
    conditionScore * w.condition +
    demandScore * w.demand +
    daysScore * w.daysToSell +
    logisticsScore * w.logistics +
    capitalScore * w.capital;

  const weightTotal =
    w.profit + w.roi + w.compConfidence + w.brand + w.condition + w.demand + w.daysToSell + w.logistics + w.capital;

  const score = Math.round(weightTotal > 0 ? weightedSum / weightTotal : 0);

  let band: FlipScoreResult['band'] = 'pass';
  if (score >= 90) band = 'excellent';
  else if (score >= 75) band = 'good';
  else if (score >= 60) band = 'marginal';

  return { score: Math.max(0, Math.min(100, score)), band, reasons };
}

export const DEFAULT_FLIP_SCORE_WEIGHTS: FlipScoreWeights = {
  profit: 0.2,
  roi: 0.2,
  compConfidence: 0.15,
  brand: 0.1,
  condition: 0.1,
  demand: 0.1,
  daysToSell: 0.05,
  logistics: 0.05,
  capital: 0.05,
};
