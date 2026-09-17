/**
 * Source Adapter interface
 * ------------------------
 * MAC.BID has no public API, and the app must never scrape in a way that
 * violates their Terms of Service. This adapter interface is the seam where
 * a legitimate integration (an authorized API, a Chrome extension that
 * reads the page the user is already viewing and posts the data to us, an
 * approved data feed, etc.) can be plugged in later WITHOUT changing any
 * other part of the app — the rest of the codebase only talks to
 * `SourceAdapter`, never to MAC.BID directly.
 *
 * `ManualEntryAdapter` is the only adapter enabled in V1. It performs a
 * single best-effort, server-side fetch of the public URL the user pastes
 * (for basic metadata like page title / OG image, which are commonly
 * public and not gated), and always returns a `requiresManualCompletion:
 * true` result so the UI shows an editable form rather than trusting
 * auto-filled data.
 */

export interface FetchedProductData {
  sourceUrl: string;
  sourceProductId: string | null;
  name: string | null;
  imageUrls: string[];
  retailMsrp: number | null;
  currentBid: number | null;
  auctionEndAt: string | null;
  description: string | null;
  fetchStatus: 'success' | 'partial' | 'failed';
  requiresManualCompletion: boolean;
  note: string;
}

export interface SourceAdapter {
  name: string;
  /** Returns whatever public, non-gated metadata it can find. Never throws. */
  fetchProductData(url: string): Promise<FetchedProductData>;
}

/**
 * V1 adapter: attempts a plain fetch + very light HTML metadata parse
 * (Open Graph tags only — no structural scraping of MAC.BID's markup,
 * no bypassing bot protection, no headless browser). If the site blocks
 * the request (likely, given bot protection on most auction platforms)
 * this fails gracefully and the user completes the form by hand.
 */
export class ManualEntryAdapter implements SourceAdapter {
  name = 'manual';

  async fetchProductData(url: string): Promise<FetchedProductData> {
    const empty: FetchedProductData = {
      sourceUrl: url,
      sourceProductId: extractLotIdFromUrl(url),
      name: null,
      imageUrls: [],
      retailMsrp: null,
      currentBid: null,
      auctionEndAt: null,
      description: null,
      fetchStatus: 'failed',
      requiresManualCompletion: true,
      note: 'Automatic retrieval not attempted or not permitted — enter product details manually below.',
    };

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; liquidation-app/0.1)' },
        // Short timeout via AbortSignal so a hung request never blocks the UI.
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        return { ...empty, note: `Source returned HTTP ${res.status}. Enter details manually.` };
      }

      const html = await res.text();
      const og = parseOpenGraphTags(html);

      if (!og.title && !og.image) {
        return { ...empty, note: 'Page loaded but no usable public metadata was found. Enter details manually.' };
      }

      return {
        sourceUrl: url,
        sourceProductId: extractLotIdFromUrl(url),
        name: og.title,
        imageUrls: og.image ? [og.image] : [],
        retailMsrp: null,
        currentBid: null,
        auctionEndAt: null,
        description: og.description,
        fetchStatus: 'partial',
        requiresManualCompletion: true,
        note: 'Pulled basic page metadata (title/image only). Bid, price, and condition must be entered manually — MAC.BID does not expose those via public metadata.',
      };
    } catch (err) {
      return {
        ...empty,
        note:
          'Could not retrieve the page automatically (likely blocked by bot protection, which is expected). Enter details manually.',
      };
    }
  }
}

function extractLotIdFromUrl(url: string): string | null {
  const match = url.match(/\/lot\/([a-zA-Z0-9-]+)/) ?? url.match(/[?&]id=([a-zA-Z0-9-]+)/);
  return match ? match[1] : null;
}

function parseOpenGraphTags(html: string) {
  const get = (prop: string) => {
    const re = new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
    const m = html.match(re);
    return m ? m[1] : null;
  };
  return {
    title: get('title'),
    image: get('image'),
    description: get('description'),
  };
}

export function getActiveAdapter(): SourceAdapter {
  return new ManualEntryAdapter();
}
