 'use client';

import { useCallback, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';

export default function ShareButton({
  url,
  title,
  description,
  iconOnly = true,
  className = '',
}) {
  const [copied, setCopied] = useState(false);

  const onShare = useCallback(async () => {
    if (!url) return;

    try {
      if (navigator?.share) {
        await navigator.share({
          url,
          title: title || undefined,
          text: description || undefined,
        });
        return;
      }
    } catch {
      // fall through to clipboard
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }, [url, title, description]);

  const label = copied ? 'Copied' : 'Share';

  return (
    <button
      type="button"
      onClick={onShare}
      disabled={!url}
      className={`inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      aria-label={iconOnly ? 'Share' : label}
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden />
      ) : iconOnly ? (
        <Share2 className="h-4 w-4" aria-hidden />
      ) : (
        <Copy className="h-4 w-4" aria-hidden />
      )}
      {iconOnly ? null : (
        <span className="button-label text-xs font-bold">{label}</span>
      )}
    </button>
  );
}
