'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import ShareModal from '@/components/ShareModal';

export default function ShareButton({
  url,
  title,
  description = '',
  className = '',
  iconOnly = false,
  heading,
}) {
  const [open, setOpen] = useState(false);

  if (!url) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          iconOnly
            ? `rounded p-2 text-foreground/60 hover:bg-military-grey hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary ${className}`
            : `button-label inline-flex items-center gap-1.5 border border-border px-3 py-2 text-xs font-bold uppercase tracking-wider text-foreground/70 hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary ${className}`
        }
        aria-label="Share"
      >
        <Share2 className={iconOnly ? 'h-4 w-4' : 'h-3.5 w-3.5'} aria-hidden />
        {iconOnly ? null : <span>Share</span>}
      </button>
      <ShareModal
        isOpen={open}
        onClose={() => setOpen(false)}
        url={url}
        title={title}
        description={description}
        heading={heading}
      />
    </>
  );
}
