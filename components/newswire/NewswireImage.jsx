'use client';

import { useEffect, useRef, useState } from 'react';

const OBJECT_POS_CLASS = {
  center: 'object-center',
  top: 'object-top',
  bottom: 'object-bottom',
};

/** Remote RSS/OG images — cover + focal point; img is absolute so the frame always fills (no letterboxing). */
export default function NewswireImage({ src, alt = '', onLoadError, objectPosition = 'center' }) {
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

  const posClass = OBJECT_POS_CLASS[objectPosition] ?? OBJECT_POS_CLASS.center;

  return (
    <>
      {status === 'loading' ? (
        <div className="pointer-events-none absolute inset-0 z-0 bg-muted animate-pulse" aria-hidden />
      ) : null}

      {/* eslint-disable-next-line @next/next/no-img-element -- remote RSS URLs */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        referrerPolicy="strict-origin-when-cross-origin"
        className={`absolute inset-0 z-[1] h-full w-full object-cover transition-opacity duration-300 ${posClass} ${
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
