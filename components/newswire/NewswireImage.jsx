'use client';

import { useEffect, useRef, useState } from 'react';

/** Remote RSS/OG images — same as source: cover + center, opacity reveal while loading. */
export default function NewswireImage({ src, alt = '', onLoadError }) {
  const [status, setStatus] = useState(src ? 'loading' : 'error');
  const imgRef = useRef(null);

  useEffect(() => {
    setStatus(src ? 'loading' : 'error');
  }, [src]);

  useEffect(() => {
    if (!src) {
      setStatus('error');
      return;
    }
    const node = imgRef.current;
    if (node?.complete) {
      setStatus(node.naturalWidth > 0 ? 'loaded' : 'error');
    }
  }, [src]);

  useEffect(() => {
    if (status === 'error') {
      onLoadError?.();
    }
  }, [status, onLoadError]);

  if (status === 'error') return null;

  return (
    <>
      {status === 'loading' ? <div className="absolute inset-0 bg-muted animate-pulse" /> : null}

      {/* eslint-disable-next-line @next/next/no-img-element -- remote RSS URLs */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        referrerPolicy="strict-origin-when-cross-origin"
        className={`h-full w-full object-cover object-center transition-opacity duration-300 ${
          status === 'loaded' ? 'opacity-100' : 'opacity-0'
        }`}
        loading="lazy"
        decoding="async"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </>
  );
}
