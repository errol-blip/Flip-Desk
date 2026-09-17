'use client';

import { useEffect, useState } from 'react';

interface Token {
  id: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
}

export function ApiTokensSection() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    fetch('/api/tokens')
      .then((r) => r.json())
      .then((data) => setTokens(data.tokens ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function createToken() {
    setCreating(true);
    const res = await fetch('/api/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Chrome Extension' }),
    });
    const data = await res.json();
    setCreating(false);
    if (data.token) {
      setNewToken(data.token);
      load();
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/tokens/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="card space-y-4 p-4">
      <div>
        <h2 className="text-sm font-semibold text-muted">Chrome extension</h2>
        <p className="mt-1 text-xs text-muted">
          Generate a personal token, then paste it into the extension's options page (right-click the extension icon
          → Options) along with this app's URL. The token authenticates the extension as you — treat it like a
          password.
        </p>
      </div>

      {newToken && (
        <div className="rounded-md border border-brand-400 bg-brand-50 p-3">
          <p className="mb-2 text-xs font-medium text-brand-600">
            Copy this now — it won't be shown again:
          </p>
          <code className="block break-all rounded bg-surface px-2 py-1.5 text-xs">{newToken}</code>
        </div>
      )}

      <button
        onClick={createToken}
        disabled={creating}
        className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {creating ? 'Generating…' : '+ Generate New Token'}
      </button>

      {!loading && tokens.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-1.5">Name</th>
              <th className="py-1.5">Last used</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id} className="border-b border-line/60 last:border-0">
                <td className="py-1.5">{t.name}</td>
                <td className="py-1.5 text-muted">{t.last_used_at ? new Date(t.last_used_at).toLocaleDateString() : 'Never'}</td>
                <td className="py-1.5 text-right">
                  <button onClick={() => revoke(t.id)} className="text-xs text-score-pass hover:underline">
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
