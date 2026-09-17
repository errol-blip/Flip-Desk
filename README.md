# Flip Desk — Liquidation Sourcing MVP (Phase 1 + core Phase 2)

An internal dashboard for sourcing "Like New" liquidation products (built around
MAC.BID), calculating what to bid, tracking auctions through to resale, and
recording real profit.

## What's actually built vs. what's a documented gap

This is a real, working codebase — not a mockup. Here's what's honest about its
current state:

**Fully functional:**
- Supabase Auth (email/password), full Postgres schema with Row Level Security
- Add Product → Watchlist → Mark Won → Inventory → Generate Listing → Mark Sold, end to end
- True Acquisition Cost calculator, backward-solved Max Bid calculator, Flip Score — all real math, unit-testable pure functions in `src/lib/calculations.ts`
- Dashboard, Watchlist, Deal Finder, Inventory, Listings, Sales, Analytics — all query real Supabase data, no fake numbers
- Configurable fee assumptions and Flip Score weights (Settings page)

**Deliberately NOT faked — these are real technical/legal constraints, not laziness:**
- **MAC.BID has no public API.** The "Retrieve" button in Add Product attempts one
  polite fetch of the pasted URL's public Open Graph metadata (title/image only —
  the kind of data any browser preview card can read) and always falls back to a
  manual entry form. It will very likely fail if MAC.BID has bot protection, which
  is expected and handled gracefully. See `src/lib/source-adapters.ts` — it's built
  as a swappable `SourceAdapter` interface so a browser extension, authorized feed,
  or licensed API integration can replace this later without touching any other
  code.
- **No eBay/Amazon/Walmart price-comparison APIs are wired up.** Comparables are
  manually entered (Deal Finder → per-product comparable form, wired to the
  `comparables` table and the `estimateResaleValue()` blending function). The data
  model and math are ready for a real search API in Phase 3.
- **"AI Listing Generator" is currently rule-based, not an LLM call.** It produces
  genuinely usable drafts from your product data (see `src/lib/listing-generator.ts`),
  but it's template logic, not AI-generated copy — building a real LLM version needs
  an API key you'd have to provide and configure. The function signature is designed
  so swapping in a real model call later is a localized change.
- **Nothing publishes automatically to eBay/Facebook/etc.** — Copy buttons only, per spec.
- **No public storefront yet** — that's Phase 3 per the build order you specified.
- **No Chrome extension** — Phase 4, architected for but not built.

## Setup

1. **Create a Supabase project** at supabase.com.
2. **Run the schema**: paste `supabase/schema.sql` into the Supabase SQL editor and run it.
3. **Copy env vars**: `cp .env.example .env.local` and fill in your project's URL, anon key, and service role key (Supabase dashboard → Settings → API). Optionally add `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` (developer.ebay.com/my/keys, free) to enable eBay comparable search, Bulk Add, and the extension's auto-estimate.
4. **Install & run**:
   ```bash
   npm install
   npm run dev
   ```
5. Visit `http://localhost:3000`, sign up (this creates a Supabase Auth user), and you're in.
6. **Visit Settings first** to confirm your fee assumptions (buyer premium %, sales tax %, etc.) match your actual MAC.BID location before relying on the bid calculator.

## Deploying

Push to GitHub, import into Vercel, add the same three env vars from `.env.local`
in the Vercel project settings. `SUPABASE_SERVICE_ROLE_KEY` is included for future
use (e.g. server-side jobs that need to bypass RLS) but nothing in Phase 1 requires
it — every route today runs as the authenticated user under RLS.

## Architecture notes

- **Next.js App Router**, route-grouped: `(dashboard)` wraps every authenticated
  page in the sidebar/bottom-nav shell.
- **All calculation logic lives in `src/lib/calculations.ts` as pure functions** —
  no database or network calls inside them. This is intentional: it's what makes
  the max-bid solver correct and testable, and it's reused identically for the
  live client-side preview in the Add Product form and the server-side values
  actually persisted to the database.
- **RLS is on for every business table.** A user only ever sees their own rows.
  `categories` and `brands` are shared reference data, readable by any
  authenticated user.
- **The database schema already has the columns Phase 3/4 need** (category_id,
  brand_id, source_location_id on products; a full `comparables` table; a
  `price_estimates` table with separate system-estimate and user-override
  columns) so later phases are additive, not a rewrite.

## Chrome extension + eBay comparables + Bulk Add (added after initial Phase 1/2 build)

Three things were added to directly solve "this needs to be fast, not one
product at a time":

- **`extension/`** — a real Manifest V3 Chrome extension. Full setup in
  `extension/README.md`. It authenticates via a personal API token you
  generate from Settings (not your login session, since a Chrome extension
  can't share cookies across origins with your deployed app). It shows a live
  Flip Score/max-bid overlay on MAC.BID lot pages and a bulk-select queue on
  category/search pages.
- **Real eBay comparable search** (`src/lib/ebay.ts`) — uses eBay's free
  Browse API. Get credentials at developer.ebay.com/my/keys and set
  `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET`. **Honest limitation:** this returns
  active listing prices, not confirmed sold prices — eBay's actual sold-item
  data requires a separate, restricted Marketplace Insights API application.
  Comparables from this source are tagged accordingly (never `actual_sold`),
  and you can still add real sold comps manually anytime.
- **`/bulk-add`** page — paste a list of UPCs or product names (one per
  line), and the system runs the eBay search + full bid/flip-score pipeline
  for all of them in one pass. No per-item forms. The same pipeline backs the
  extension's bulk queue, so behavior is identical whether you add items from
  the app or from your browser.

None of this requires the storefront or Chrome Web Store publishing — those
remain the next things to build, in that order, when you're ready.

## Build order followed

This ships everything in your Phase 1 list, plus the core Phase 2 flow (Won →
Inventory → photo-ready structure → Listing generation → Sales → profit
tracking) since the two are tightly coupled and Phase 1 alone can't be
end-to-end tested without it. Photo upload to Supabase Storage, the public
storefront, real comparable-price search integrations, and the Chrome
extension are the next things to build, in that order.
