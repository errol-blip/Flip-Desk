'use client';

import { useEffect, useState } from 'react';

export function EbaySection() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/ebay/status')
      .then((r) => r.json())
      .then((data) => setConnected(!!data.connected));

    const params = new URLSearchParams(window.location.search);
    const status = params.get('ebay');
    if (status === 'connected') setMessage('eBay account connected.');
    if (status === 'error') setMessage(params.get('message') || 'Could not connect eBay account.');
  }, []);

  async function disconnect() {
    await fetch('/api/ebay/disconnect', { method: 'DELETE' });
    setConnected(false);
  }

  return (
    <div className="card space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold text-muted">eBay account</h2>
        <p className="mt-1 text-xs text-muted">
          Connect your own eBay seller account to publish listings for real from the Listings page, instead of
          copy-pasting. Requires Sell API access and at least one shipping/payment/return policy already set up on
          your eBay account — the publish flow will tell you if one's missing.
        </p>
      </div>

      {message && <p className="text-xs text-brand-600">{message}</p>}

      {connected === null ? (
        <p className="text-xs text-muted">Checking…</p>
      ) : connected ? (
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-score-excellent">Connected</span>
          <button onClick={disconnect} className="text-xs text-score-pass hover:underline">
            Disconnect
          </button>
        </div>
      ) : (
        <a
          href="/api/ebay/connect"
          className="inline-block rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          Connect eBay Account
        </a>
      )}
    </div>
  );
}
