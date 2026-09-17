-- ============================================================
-- Liquidation Flip MVP — Database Schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Designed for a single business owner in V1; every business
-- table carries owner_id so Row Level Security can be added to
-- for multi-user/SaaS later without a schema rewrite.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- Reference tables ----------

create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists brands (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  desirability_score int check (desirability_score between 0 and 100), -- feeds Flip Score
  created_at timestamptz not null default now()
);

create table if not exists source_locations (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,               -- e.g. "MAC.BID - Charlotte, NC"
  city text,
  state text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Settings (per-user configurable assumptions) ----------

create table if not exists settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  -- Fee assumptions used by the cost calculator (editable, not hard-coded)
  buyer_premium_pct numeric(6,3) not null default 15.000,   -- e.g. 15% of hammer
  lot_fee_flat numeric(10,2) not null default 2.00,
  sales_tax_pct numeric(6,3) not null default 7.250,
  default_pickup_cost numeric(10,2) not null default 0,
  default_risk_reserve_pct numeric(6,3) not null default 8.000, -- % of expected resale
  -- Bid-solver defaults
  default_min_profit numeric(10,2) not null default 50.00,
  default_min_roi_pct numeric(6,2) not null default 40.00,
  -- Flip Score weights (0-1, should sum to ~1 but not enforced)
  weight_profit numeric(4,3) not null default 0.20,
  weight_roi numeric(4,3) not null default 0.20,
  weight_comp_confidence numeric(4,3) not null default 0.15,
  weight_brand numeric(4,3) not null default 0.10,
  weight_condition numeric(4,3) not null default 0.10,
  weight_demand numeric(4,3) not null default 0.10,
  weight_days_to_sell numeric(4,3) not null default 0.05,
  weight_logistics numeric(4,3) not null default 0.05,
  weight_capital numeric(4,3) not null default 0.05,
  updated_at timestamptz not null default now()
);

-- ---------- Products sourced from MAC.BID (or manually) ----------

do $$ begin
  create type product_condition as enum (
    'like_new', 'open_box', 'used_good', 'used_fair', 'damaged', 'incomplete', 'unknown'
  );
exception when duplicate_object then null;
end $$;

create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,

  -- Source adapter metadata — kept generic so a non-MAC.BID source can populate the same row later
  source_type text not null default 'macbid',      -- 'macbid' | 'manual' | future sources
  source_url text,
  source_product_id text,                          -- MAC's own product/lot id, if captured
  source_retrieved_at timestamptz,                  -- null if never auto-fetched
  source_fetch_status text,                         -- 'success' | 'partial' | 'failed' | 'manual_only'

  name text not null,
  brand_id uuid references brands(id),
  model_number text,
  upc text,
  category_id uuid references categories(id),
  condition product_condition not null default 'unknown',
  description text,
  image_urls text[] not null default '{}',

  retail_msrp numeric(10,2),
  current_bid numeric(10,2),
  auction_end_at timestamptz,
  source_location_id uuid references source_locations(id),

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_owner on products(owner_id);
create index if not exists idx_products_upc on products(upc);
create index if not exists idx_products_auction_end on products(auction_end_at);

-- ---------- Comparable resale prices (manual entry in V1) ----------

do $$ begin
  create type comparable_source as enum (
    'ebay', 'google_shopping', 'walmart', 'amazon', 'home_depot', 'lowes', 'facebook_marketplace', 'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type comparable_price_type as enum ('new_retail', 'open_box', 'used', 'actual_sold');
exception when duplicate_object then null;
end $$;

create table if not exists comparables (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,

  source comparable_source not null,
  price_type comparable_price_type not null,
  title text,
  price numeric(10,2) not null,
  shipping numeric(10,2) not null default 0,
  condition_note text,
  url text,
  sold_or_active text,               -- 'sold' | 'active' | 'unknown'
  confidence text not null default 'medium', -- 'low' | 'medium' | 'high'
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_comparables_product on comparables(product_id);

-- ---------- Resale price estimates (system-calculated + user override) ----------

create table if not exists price_estimates (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null unique references products(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,

  -- System-calculated (from comparables), never silently overwritten once a user override exists
  system_quick_sale numeric(10,2),
  system_expected_sale numeric(10,2),
  system_optimistic_sale numeric(10,2),
  system_confidence text,             -- 'low' | 'medium' | 'high' based on comparable quality/quantity

  -- User override — the calculators always prefer this when present
  override_quick_sale numeric(10,2),
  override_expected_sale numeric(10,2),
  override_optimistic_sale numeric(10,2),
  override_note text,
  overridden_at timestamptz,

  updated_at timestamptz not null default now()
);

-- ---------- Watchlist ----------

do $$ begin
  create type watch_status as enum ('watching', 'bid_placed', 'won', 'lost', 'passed', 'expired');
exception when duplicate_object then null;
end $$;

create table if not exists watchlist (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,

  status watch_status not null default 'watching',

  -- Per-item override of the acquisition-side shipping/transport/pickup cost.
  -- When null, the calculator falls back to settings.default_pickup_cost —
  -- a treadmill and a phone case don't cost the same to move, so this lets
  -- any single item override the global default.
  pickup_cost_override numeric(10,2),
  expected_selling_cost numeric(10,2), -- sell-side shipping estimate, baked into the max-bid solve

  -- Snapshot of the bid calculator at the time of watching/last refresh
  max_recommended_bid numeric(10,2),
  true_acquisition_cost_at_max numeric(10,2),
  expected_profit numeric(10,2),
  expected_roi_pct numeric(6,2),
  flip_score int,
  flip_score_reasons jsonb,           -- array of {label, direction: 'positive'|'negative'}

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, product_id)
);

create index if not exists idx_watchlist_owner_status on watchlist(owner_id, status);

-- ---------- Auctions won -> Inventory ----------

create table if not exists inventory (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  watchlist_id uuid references watchlist(id),

  status text not null default 'awaiting_pickup',
  -- 'awaiting_pickup'|'picked_up'|'inspecting'|'ready_to_list'|'listed'|'pending_sale'|'sold'|'returned'|'problem'

  winning_hammer_price numeric(10,2) not null,
  actual_buyer_premium numeric(10,2),
  actual_lot_fee numeric(10,2),
  actual_sales_tax numeric(10,2),
  actual_pickup_cost numeric(10,2),
  other_acquisition_cost numeric(10,2) default 0,
  true_acquisition_cost numeric(10,2), -- computed & stored at "mark as won" / recalculated on edit

  pickup_location_id uuid references source_locations(id),
  pickup_deadline date,
  picked_up_at timestamptz,

  storage_location text,
  publish_to_store boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inventory_owner_status on inventory(owner_id, status);

create table if not exists inventory_photos (
  id uuid primary key default uuid_generate_v4(),
  inventory_id uuid not null references inventory(id) on delete cascade,
  url text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Listings (generated copy, manual publish) ----------

create table if not exists listings (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  inventory_id uuid not null references inventory(id) on delete cascade,

  platform text not null, -- 'website' | 'facebook_marketplace' | 'ebay' | 'offerup'
  title text,
  short_description text,
  full_description text,
  suggested_asking_price numeric(10,2),
  suggested_quick_sale_price numeric(10,2),
  keywords text[],
  status text not null default 'draft', -- 'draft' | 'copied' | 'live' | 'expired'
  external_listing_id text,   -- e.g. eBay's returned listingId, once published there for real
  external_listing_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Sales ----------

create table if not exists sales (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  inventory_id uuid not null references inventory(id) on delete cascade,

  sale_price numeric(10,2) not null,
  platform text not null,
  sale_date date not null,
  selling_fee numeric(10,2) not null default 0,
  shipping_cost numeric(10,2) not null default 0,
  other_expense numeric(10,2) not null default 0,

  -- Computed at write time and stored for fast analytics
  cost_basis numeric(10,2) not null,
  gross_profit numeric(10,2) not null,
  roi_pct numeric(6,2) not null,
  days_held int,

  created_at timestamptz not null default now()
);

create index if not exists idx_sales_owner_date on sales(owner_id, sale_date);

-- ---------- Personal API tokens (for the Chrome extension) ----------
-- The extension can't share the web app's browser session cookie across
-- origins, so it authenticates with a long-lived personal token instead,
-- generated from Settings and pasted into the extension's options page.
-- Tokens are stored hashed (sha256) — never in plaintext.

create table if not exists api_tokens (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Chrome Extension',
  token_hash text not null unique,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_tokens_hash on api_tokens(token_hash);

-- ---------- eBay account connection (for real auto-listing) ----------
-- One eBay seller account connected per Flip Desk user, via OAuth. Tokens
-- are the user's own eBay credentials scoped to their account — Flip Desk
-- never sees their eBay password, only these OAuth tokens.

create table if not exists ebay_accounts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  ebay_user_id text,
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security — every owner_id table is locked to auth.uid()
-- ============================================================

alter table source_locations enable row level security;
alter table settings enable row level security;
alter table products enable row level security;
alter table comparables enable row level security;
alter table price_estimates enable row level security;
alter table watchlist enable row level security;
alter table inventory enable row level security;
alter table inventory_photos enable row level security;
alter table listings enable row level security;
alter table sales enable row level security;

-- Reference tables (categories, brands) are readable by all authenticated users, writable by none directly (managed via server routes/service role if needed).
alter table categories enable row level security;
alter table brands enable row level security;
alter table api_tokens enable row level security;
alter table ebay_accounts enable row level security;

drop policy if exists "read categories" on categories;
create policy "read categories" on categories for select using (auth.role() = 'authenticated');
drop policy if exists "read brands" on brands;
create policy "read brands" on brands for select using (auth.role() = 'authenticated');

-- Generic owner-scoped policy, applied per table
drop policy if exists "own source_locations" on source_locations;
create policy "own source_locations" on source_locations for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "own settings" on settings;
create policy "own settings" on settings for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "own products" on products;
create policy "own products" on products for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "own comparables" on comparables;
create policy "own comparables" on comparables for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "own price_estimates" on price_estimates;
create policy "own price_estimates" on price_estimates for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "own watchlist" on watchlist;
create policy "own watchlist" on watchlist for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "own inventory" on inventory;
create policy "own inventory" on inventory for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "own inventory_photos" on inventory_photos;
create policy "own inventory_photos" on inventory_photos for all using (
  inventory_id in (select id from inventory where owner_id = auth.uid())
);
drop policy if exists "own listings" on listings;
create policy "own listings" on listings for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "own sales" on sales;
create policy "own sales" on sales for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "own api_tokens" on api_tokens;
create policy "own api_tokens" on api_tokens for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "own ebay_accounts" on ebay_accounts;
create policy "own ebay_accounts" on ebay_accounts for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Note: the extension-facing API routes (src/app/api/extension/*) verify the
-- token themselves using the service-role key and then manually scope every
-- query by owner_id in application code — they don't rely on this RLS policy,
-- because a service-role connection bypasses RLS entirely. This policy only
-- protects normal browser-session access to the api_tokens table itself
-- (e.g. the Settings page listing a user's own tokens).

-- ============================================================
-- Seed: sensible starter categories/brands (safe to skip)
-- ============================================================
insert into categories (name) values
  ('Tools'), ('Home Improvement'), ('Appliances'), ('Furniture'),
  ('Outdoor'), ('Electronics'), ('Kitchen'), ('Bathroom'), ('Other')
on conflict (name) do nothing;
