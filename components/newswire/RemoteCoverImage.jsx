'use client';

import { useEffect, useState } from 'react';
import NewswireImage from '@/components/newswire/NewswireImage';

/** Framed remote image: on load failure the whole frame is omitted (no gray slot or icon). */
export default function RemoteCoverImage({ src, className, objectPosition = 'top' }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return null;

  return (
    <div className={className}>
      <NewswireImage
        src={src}
        alt=""
        objectPosition={objectPosition}
        onLoadError={() => setFailed(true)}
      />
    </div>
  );
}
