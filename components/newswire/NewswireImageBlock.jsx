'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';

export default function NewswireImageBlock({ href, src, alt = '', className = '' }) {
  const [failed, setFailed] = useState(false);

  const onError = useCallback(() => {
    setFailed(true);
  }, []);

  return (
    <div className={`target-brackets ${className}`}>
      <span className="tl" aria-hidden />
      <span className="tr" aria-hidden />
      <span className="bl" aria-hidden />
      <span className="br" aria-hidden />

      <Link
        href={href || '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute inset-0 block overflow-hidden bg-military-grey"
      >
        {src && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote RSS URLs; simple fail handling
          <img
            src={src}
            alt={alt}
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            loading="lazy"
            decoding="async"
            onError={onError}
          />
        ) : (
          <div className="h-full min-h-[4rem] w-full bg-muted" />
        )}
      </Link>
    </div>
  );
}
