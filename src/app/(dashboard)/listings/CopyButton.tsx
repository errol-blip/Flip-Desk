'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="shrink-0 rounded-md border border-line p-1.5 text-muted hover:bg-line/30"
      title="Copy"
    >
      {copied ? <Check size={14} className="text-score-excellent" /> : <Copy size={14} />}
    </button>
  );
}
