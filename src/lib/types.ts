export type ProductCondition =
  | 'like_new'
  | 'open_box'
  | 'used_good'
  | 'used_fair'
  | 'damaged'
  | 'incomplete'
  | 'unknown';

export type WatchStatus = 'watching' | 'bid_placed' | 'won' | 'lost' | 'passed' | 'expired';

export type InventoryStatus =
  | 'awaiting_pickup'
  | 'picked_up'
  | 'inspecting'
  | 'ready_to_list'
  | 'listed'
  | 'pending_sale'
  | 'sold'
  | 'returned'
  | 'problem';

export interface Product {
  id: string;
  owner_id: string;
  source_type: string;
  source_url: string | null;
  source_product_id: string | null;
  source_retrieved_at: string | null;
  source_fetch_status: string | null;
  name: string;
  brand_id: string | null;
  model_number: string | null;
  upc: string | null;
  category_id: string | null;
  condition: ProductCondition;
  description: string | null;
  image_urls: string[];
  retail_msrp: number | null;
  current_bid: number | null;
  auction_end_at: string | null;
  source_location_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WatchlistRow {
  id: string;
  owner_id: string;
  product_id: string;
  status: WatchStatus;
  max_recommended_bid: number | null;
  true_acquisition_cost_at_max: number | null;
  expected_profit: number | null;
  expected_roi_pct: number | null;
  flip_score: number | null;
  flip_score_reasons: { label: string; direction: 'positive' | 'negative' }[] | null;
  created_at: string;
  updated_at: string;
  product?: Product;
}

export interface Settings {
  owner_id: string;
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
