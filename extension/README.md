# Flip Desk Chrome Extension

A companion to the Flip Desk web app. Adds a live Flip Score / max-bid overlay
while you browse MAC.BID lot pages, and a bulk-select panel on category/search
pages so you can queue up many items at once instead of adding them one by one.

## What this does and doesn't do

- **Reads only what's already loaded in your own browser** when you're on a
  MAC.BID page — the page's embedded data (Next.js's `__NEXT_DATA__` payload)
  and visible text. It does not log in on your behalf, does not make requests
  to MAC.BID you didn't initiate by browsing, and does not bypass anything.
  This is the same category of tool as several existing "true cost calculator"
  extensions already used against MAC.BID — reading your own screen, not
  automating the site.
- **Extraction is best-effort.** MAC.BID's page structure isn't public and can
  change; every field the overlay fills in is editable before you click
  Analyze or Add to Watchlist, specifically so an extraction miss never
  silently becomes bad data in your app.
- **Bulk mode only captures titles and links** from the page (not full lot
  details), so bulk-added items get a rougher keyword-based eBay estimate.
  Refine anything important in the app afterward.

## Setup

1. Deploy the Flip Desk web app (see the main README) and open it.
2. Go to **Settings → Chrome extension → Generate New Token**. Copy the token — it's shown once.
3. In Chrome, go to `chrome://extensions`, enable **Developer mode** (top right).
4. Click **Load unpacked** and select this `extension/` folder.
5. Click the new Flip Desk icon in your toolbar → **Open Settings** (or it opens automatically on install).
6. Enter your app's URL and the token, click **Save** (Chrome will ask you to
   confirm permission for that specific domain — this is expected, since your
   app's URL isn't known until you type it in), then **Test Connection**.
7. Browse to any `mac.bid` lot page — the overlay appears bottom-right.
   Browse a category or search page — the bulk queue panel appears bottom-left
   once it detects lot links on the page.

## Before publishing to the Chrome Web Store (optional, later)

This is currently built for **personal use via "Load unpacked."** If you ever
want to publish it (for yourself across devices, or for other resellers as
the SaaS idea mentioned in the original spec), you'll want to:
- Add real icon files (`icons/icon16.png`, `48`, `128`)
- Review Chrome Web Store's Developer Program Policies for extensions that
  interact with third-party sites
- Consider whether MAC.BID's current Terms of Use (they can change) still
  permit this kind of client-side reading tool — worth a periodic re-check
