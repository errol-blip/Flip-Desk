// Flip Desk content script
// Runs on every mac.bid page. Reads only what's already rendered to the
// user's own browser (page JSON payload and visible text) — no network
// calls to mac.bid beyond the page the user is already viewing, and no
// bypassing of login/paywalls. Falls back to manual entry whenever
// extraction is uncertain; nothing is ever saved without the user clicking
// a button.

(function () {
  'use strict';

  const STYLE = `
    :host { all: initial; }
    .fd-panel { position: fixed; z-index: 2147483647; font-family: -apple-system, system-ui, sans-serif; font-size: 13px; color: #14171C; }
    .fd-lot { bottom: 20px; right: 20px; width: 300px; background: #fff; border: 1px solid #E4E4E1; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); overflow: hidden; }
    .fd-header { background: #14171C; color: #fff; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
    .fd-header b { font-size: 13px; }
    .fd-body { padding: 12px; max-height: 70vh; overflow-y: auto; }
    .fd-row { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .fd-row label { font-size: 11px; color: #6B6F76; flex: 1; }
    .fd-row input, .fd-row select { width: 100%; box-sizing: border-box; padding: 5px 7px; border: 1px solid #E4E4E1; border-radius: 5px; font-size: 12px; }
    .fd-field { margin-bottom: 8px; }
    .fd-field label { display: block; font-size: 11px; color: #6B6F76; margin-bottom: 2px; }
    .fd-field input, .fd-field select { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #E4E4E1; border-radius: 5px; font-size: 12px; }
    .fd-btn { width: 100%; padding: 8px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; margin-top: 4px; }
    .fd-btn-primary { background: #2E5CE0; color: #fff; }
    .fd-btn-secondary { background: #F7F7F5; color: #14171C; border: 1px solid #E4E4E1; }
    .fd-btn:disabled { opacity: 0.5; cursor: default; }
    .fd-result { margin-top: 10px; padding: 10px; background: #F7F7F5; border-radius: 8px; }
    .fd-metric { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
    .fd-metric b { font-variant-numeric: tabular-nums; }
    .fd-score { display: inline-block; padding: 2px 8px; border-radius: 999px; font-weight: 700; font-size: 12px; }
    .fd-score-excellent { background: rgba(31,138,92,0.12); color: #1F8A5C; }
    .fd-score-good { background: rgba(61,125,214,0.12); color: #3D7DD6; }
    .fd-score-marginal { background: rgba(201,138,27,0.12); color: #C98A1B; }
    .fd-score-pass { background: rgba(184,69,47,0.12); color: #B8452F; }
    .fd-note { font-size: 11px; color: #6B6F76; margin-top: 8px; line-height: 1.4; }
    .fd-error { font-size: 11px; color: #B8452F; margin-top: 6px; }
    .fd-bulk { bottom: 20px; left: 20px; width: 280px; background: #fff; border: 1px solid #E4E4E1; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
    .fd-bulk-list { max-height: 260px; overflow-y: auto; padding: 8px 12px; }
    .fd-bulk-item { display: flex; align-items: flex-start; gap: 6px; padding: 4px 0; font-size: 12px; border-bottom: 1px solid #F0F0EE; }
    .fd-bulk-item input { margin-top: 2px; }
    .fd-collapsed .fd-body { display: none; }
  `;

  const state = { collapsed: false, lastAnalysis: null };
  const bulkQueue = new Map(); // href -> { name, href, selected }

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['apiBaseUrl', 'apiToken'], resolve);
    });
  }

  async function apiFetch(path, options = {}) {
    const { apiBaseUrl, apiToken } = await getSettings();
    if (!apiBaseUrl || !apiToken) {
      throw new Error('Not connected. Click the Flip Desk extension icon → Open Settings.');
    }
    const res = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
        ...(options.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  // ---------------------------------------------------------------------
  // Data extraction — best-effort. Always shown to the user as editable
  // fields before anything is sent anywhere, so extraction mistakes never
  // silently propagate.
  // ---------------------------------------------------------------------

  function deepFindFirst(obj, keyPattern, seen = new Set()) {
    if (!obj || typeof obj !== 'object' || seen.has(obj)) return undefined;
    seen.add(obj);
    for (const key of Object.keys(obj)) {
      if (keyPattern.test(key) && obj[key] != null && typeof obj[key] !== 'object') {
        return obj[key];
      }
    }
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val && typeof val === 'object') {
        const found = deepFindFirst(val, keyPattern, seen);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  }

  function readNextData() {
    const el = document.getElementById('__NEXT_DATA__');
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch {
      return null;
    }
  }

  function extractLotData() {
    const nextData = readNextData();
    const result = {
      name: null,
      upc: null,
      condition: 'like_new',
      currentBid: null,
      retailMsrp: null,
      imageUrl: null,
      auctionEndAt: null,
    };

    if (nextData) {
      result.name = deepFindFirst(nextData, /^(title|productName|lotTitle|name)$/i) ?? null;
      result.upc = deepFindFirst(nextData, /^(upc|gtin|barcode)$/i) ?? null;
      result.currentBid = numericOrNull(deepFindFirst(nextData, /^(currentBid|highBid|currentPrice|bidAmount)$/i));
      result.retailMsrp = numericOrNull(deepFindFirst(nextData, /^(retailPrice|msrp|retail|estimatedRetail)$/i));
      result.auctionEndAt = deepFindFirst(nextData, /^(closingDate|auctionEndDate|endDate|closeDate)$/i) ?? null;
      const conditionRaw = deepFindFirst(nextData, /^(condition|conditionName|conditionCode)$/i);
      if (conditionRaw) {
        result.condition = normalizeCondition(String(conditionRaw));
        result._conditionFromJson = true;
      }
    }

    // DOM fallbacks for anything the JSON search didn't find.
    if (!result.name) {
      const h1 = document.querySelector('h1');
      result.name = h1?.textContent?.trim() || document.title.replace(/\s*\|\s*MAC\.BID.*/i, '').trim();
    }
    if (!result.imageUrl) {
      const og = document.querySelector('meta[property="og:image"]');
      result.imageUrl = og?.getAttribute('content') || null;
    }
    if (result.currentBid == null) {
      const bodyText = document.body.innerText;
      const m = bodyText.match(/current bid[^\d$]*\$?([\d,]+(?:\.\d{2})?)/i);
      if (m) result.currentBid = parseFloat(m[1].replace(/,/g, ''));
    }
    if (result.retailMsrp == null) {
      const bodyText = document.body.innerText;
      const m = bodyText.match(/retail\s*(?:price|value)?[^\d$]*\$?([\d,]+(?:\.\d{2})?)/i);
      if (m) result.retailMsrp = parseFloat(m[1].replace(/,/g, ''));
    }
    if (!result._conditionFromJson) {
      const bodyText = document.body.innerText;
      if (/\blike new\b/i.test(bodyText)) result.condition = 'like_new';
      else if (/\bopen box\b/i.test(bodyText)) result.condition = 'open_box';
      else if (/\bdamaged\b/i.test(bodyText)) result.condition = 'damaged';
      else if (/\bpartial\b/i.test(bodyText)) result.condition = 'incomplete';
    }
    delete result._conditionFromJson;

    return result;
  }

  function numericOrNull(val) {
    if (val == null) return null;
    const n = parseFloat(String(val).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function normalizeCondition(raw) {
    const s = raw.toLowerCase();
    if (s.includes('like new')) return 'like_new';
    if (s.includes('open box')) return 'open_box';
    if (s.includes('damaged')) return 'damaged';
    if (s.includes('partial')) return 'incomplete';
    return 'unknown';
  }

  function isLotPage() {
    return /\/lot\//.test(location.pathname);
  }

  // ---------------------------------------------------------------------
  // Lot page overlay
  // ---------------------------------------------------------------------

  function scoreClass(band) {
    return { excellent: 'fd-score-excellent', good: 'fd-score-good', marginal: 'fd-score-marginal', pass: 'fd-score-pass' }[band] || 'fd-score-pass';
  }

  function bandForScore(score) {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'marginal';
    return 'pass';
  }

  function mountLotOverlay() {
    const data = extractLotData();

    const host = document.createElement('div');
    host.id = 'flip-desk-host';
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLE;
    shadow.appendChild(style);

    const panel = document.createElement('div');
    panel.className = 'fd-panel fd-lot';
    panel.innerHTML = `
      <div class="fd-header" id="fd-toggle"><b>Flip Desk</b><span id="fd-caret">▾</span></div>
      <div class="fd-body">
        <div class="fd-field"><label>Product name</label><input id="fd-name" value="${escapeAttr(data.name || '')}" /></div>
        <div class="fd-row">
          <div class="fd-field"><label>Condition</label>
            <select id="fd-condition">
              <option value="like_new" ${data.condition === 'like_new' ? 'selected' : ''}>Like New</option>
              <option value="open_box" ${data.condition === 'open_box' ? 'selected' : ''}>Open Box</option>
              <option value="used_good">Used - Good</option>
              <option value="damaged" ${data.condition === 'damaged' ? 'selected' : ''}>Damaged</option>
              <option value="incomplete" ${data.condition === 'incomplete' ? 'selected' : ''}>Incomplete</option>
            </select>
          </div>
          <div class="fd-field"><label>UPC (optional)</label><input id="fd-upc" value="${escapeAttr(data.upc || '')}" /></div>
        </div>
        <div class="fd-row">
          <div class="fd-field"><label>Current bid ($)</label><input id="fd-bid" type="number" value="${data.currentBid ?? ''}" /></div>
          <div class="fd-field"><label>Retail MSRP ($)</label><input id="fd-msrp" type="number" value="${data.retailMsrp ?? ''}" /></div>
        </div>
        <div class="fd-field"><label>Pickup/transport cost for this item ($)</label><input id="fd-pickup" type="number" value="0" /></div>
        <button class="fd-btn fd-btn-primary" id="fd-analyze">Analyze</button>
        <div id="fd-result"></div>
        <button class="fd-btn fd-btn-secondary" id="fd-watch" style="display:none;">+ Add to Watchlist</button>
        <div class="fd-note">Fields are auto-filled best-effort from the page — please confirm before analyzing.</div>
      </div>
    `;
    shadow.appendChild(panel);

    shadow.getElementById('fd-toggle').addEventListener('click', () => {
      panel.classList.toggle('fd-collapsed');
    });

    shadow.getElementById('fd-analyze').addEventListener('click', () => runAnalyze(shadow, data));
  }

  async function runAnalyze(shadow, extracted) {
    const btn = shadow.getElementById('fd-analyze');
    const resultEl = shadow.getElementById('fd-result');
    const watchBtn = shadow.getElementById('fd-watch');
    btn.disabled = true;
    btn.textContent = 'Analyzing…';
    resultEl.innerHTML = '';
    watchBtn.style.display = 'none';

    const payload = {
      name: shadow.getElementById('fd-name').value,
      condition: shadow.getElementById('fd-condition').value,
      upc: shadow.getElementById('fd-upc').value || null,
      currentBid: parseFloat(shadow.getElementById('fd-bid').value) || null,
      retailMsrp: parseFloat(shadow.getElementById('fd-msrp').value) || null,
      pickupCost: parseFloat(shadow.getElementById('fd-pickup').value) || 0,
    };

    try {
      const data = await apiFetch('/api/extension/analyze', { method: 'POST', body: JSON.stringify(payload) });
      state.lastAnalysis = { ...payload, ...data };

      if (!data.hasEstimate) {
        resultEl.innerHTML = `<div class="fd-note">${escapeHtml(data.message || 'No estimate available.')}</div>`;
      } else {
        const band = data.flipScoreBand || bandForScore(data.flipScore);
        resultEl.innerHTML = `
          <div class="fd-result">
            <div class="fd-metric"><span>Flip Score</span><span class="fd-score ${scoreClass(band)}">${data.flipScore}</span></div>
            <div class="fd-metric"><span>Max Bid</span><b>$${data.maxBid.toFixed(0)}</b></div>
            <div class="fd-metric"><span>Expected Profit</span><b>$${data.expectedProfit.toFixed(0)}</b></div>
            <div class="fd-metric"><span>Expected ROI</span><b>${data.expectedRoiPct.toFixed(0)}%</b></div>
            ${data.exceedsMax ? '<div class="fd-error">Current bid exceeds max — PASS</div>' : ''}
          </div>
        `;
        watchBtn.style.display = 'block';
      }
    } catch (e) {
      resultEl.innerHTML = `<div class="fd-error">${escapeHtml(e.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Analyze';
    }
  }

  function attachWatchlistHandler(shadow) {
    shadow.getElementById('fd-watch')?.addEventListener('click', async () => {
      const btn = shadow.getElementById('fd-watch');
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        const payload = {
          name: shadow.getElementById('fd-name').value,
          condition: shadow.getElementById('fd-condition').value,
          upc: shadow.getElementById('fd-upc').value || null,
          current_bid: parseFloat(shadow.getElementById('fd-bid').value) || null,
          retail_msrp: parseFloat(shadow.getElementById('fd-msrp').value) || null,
          source_url: location.href,
          expected_resale_price: state.lastAnalysis?.estimate?.expected ?? null,
          pickup_cost_override: parseFloat(shadow.getElementById('fd-pickup').value) || null,
        };
        await apiFetch('/api/extension/watchlist', { method: 'POST', body: JSON.stringify(payload) });
        btn.textContent = 'Added ✓';
      } catch (e) {
        btn.textContent = 'Failed — retry';
        btn.disabled = false;
      }
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  // ---------------------------------------------------------------------
  // Bulk queue panel — for category/search/browse pages with many lots
  // ---------------------------------------------------------------------

  function scanForLotLinks() {
    const anchors = document.querySelectorAll('a[href*="/lot/"]');
    anchors.forEach((a) => {
      const href = a.href.split('?')[0];
      const text = a.textContent?.trim();
      if (!text || text.length < 3) return;
      if (!bulkQueue.has(href)) {
        bulkQueue.set(href, { name: text.slice(0, 120), href, selected: false });
      }
    });
  }

  function mountBulkPanel() {
    const host = document.createElement('div');
    host.id = 'flip-desk-bulk-host';
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLE;
    shadow.appendChild(style);

    const panel = document.createElement('div');
    panel.className = 'fd-panel fd-bulk';
    panel.innerHTML = `
      <div class="fd-header" id="fd-bulk-toggle"><b>Flip Desk — Bulk Queue</b><span id="fd-bulk-caret">▾</span></div>
      <div class="fd-body">
        <div class="fd-bulk-list" id="fd-bulk-list"></div>
        <div style="padding: 0 12px 12px;">
          <button class="fd-btn fd-btn-primary" id="fd-bulk-add">Add Selected to Watchlist</button>
          <div class="fd-note" id="fd-bulk-note">Select lots below, then add them all at once. Each gets an eBay keyword search for a rough estimate — refine details later in the app.</div>
        </div>
      </div>
    `;
    shadow.appendChild(panel);

    shadow.getElementById('fd-bulk-toggle').addEventListener('click', () => panel.classList.toggle('fd-collapsed'));

    function renderList() {
      const listEl = shadow.getElementById('fd-bulk-list');
      const items = Array.from(bulkQueue.values());
      listEl.innerHTML = items
        .map(
          (item, i) => `
        <label class="fd-bulk-item">
          <input type="checkbox" data-href="${escapeAttr(item.href)}" ${item.selected ? 'checked' : ''} />
          <span>${escapeHtml(item.name)}</span>
        </label>`
        )
        .join('');

      listEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', (e) => {
          const href = e.target.getAttribute('data-href');
          const item = bulkQueue.get(href);
          if (item) item.selected = e.target.checked;
        });
      });
    }

    renderList();

    const observer = new MutationObserver(debounce(() => {
      scanForLotLinks();
      renderList();
    }, 800));
    observer.observe(document.body, { childList: true, subtree: true });

    shadow.getElementById('fd-bulk-add').addEventListener('click', async () => {
      const btn = shadow.getElementById('fd-bulk-add');
      const note = shadow.getElementById('fd-bulk-note');
      const selected = Array.from(bulkQueue.values()).filter((i) => i.selected);
      if (selected.length === 0) {
        note.textContent = 'Select at least one item first.';
        return;
      }
      btn.disabled = true;
      btn.textContent = `Adding ${selected.length}…`;
      try {
        const data = await apiFetch('/api/extension/bulk', {
          method: 'POST',
          body: JSON.stringify({ items: selected.map((i) => ({ name: i.name, source_url: i.href })) }),
        });
        const added = data.results.filter((r) => r.status !== 'error').length;
        note.textContent = `Added ${added} of ${selected.length}. Open the app's Watchlist to review.`;
        selected.forEach((i) => (i.selected = false));
        renderList();
      } catch (e) {
        note.textContent = e.message;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Add Selected to Watchlist';
      }
    });
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // ---------------------------------------------------------------------
  // Entry point
  // ---------------------------------------------------------------------

  function init() {
    if (isLotPage()) {
      mountLotOverlay();
      const host = document.getElementById('flip-desk-host');
      if (host?.shadowRoot) attachWatchlistHandler(host.shadowRoot);
    } else {
      scanForLotLinks();
      if (bulkQueue.size > 0) mountBulkPanel();
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 500); // small delay to let the SPA finish its initial render
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
  }
})();
