'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import NewswireImage from '@/components/newswire/NewswireImage';

function withRetryParam(src, retryCount) {
  if (!src) return null;
  if (!retryCount) return src;
  try {
    const url = new URL(src);
    url.searchParams.set('_img_retry', String(retryCount));
    return url.toString();
  } catch {
    const separator = src.includes('?') ? '&' : '?';
    return `${src}${separator}_img_retry=${retryCount}`;
  }
}

export default function NewswireImageBlock({
  href,
  src,
  alt = '',
  className = '',
  /** When false, omit HUD corner brackets (matches Intel desk thumbnails). */
  showBrackets = true,
  /** Called after retries exhausted — parent can drop the image column. */
  onUnavailable,
}) {
  const [failed, setFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setFailed(false);
    setRetryCount(0);
  }, [src]);

  const resolvedSrc = useMemo(() => withRetryParam(src, retryCount), [src, retryCount]);

  const onImageFailed = useCallback(() => {
    if (retryCount < 1) {
      setRetryCount((c) => c + 1);
      return;
    }
    setFailed(true);
  }, [retryCount]);

  const showRemote = Boolean(resolvedSrc) && !failed;

  useEffect(() => {
    if (failed) onUnavailable?.();
  }, [failed, onUnavailable]);

  if (failed) return null;

  return (
    <div className={`relative ${showBrackets ? 'target-brackets' : ''} ${className}`}>
      {showBrackets ? (
        <>
          <span className="tl" aria-hidden />
          <span className="tr" aria-hidden />
          <span className="bl" aria-hidden />
          <span className="br" aria-hidden />
        </>
      ) : null}

      <Link
        href={href || '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute inset-0 block overflow-hidden"
      >
        {showRemote ? <NewswireImage src={resolvedSrc} alt={alt} onLoadError={onImageFailed} /> : null}
      </Link>
    </div>
  );
}
