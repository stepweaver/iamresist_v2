'use client';

import { useEffect, useState } from 'react';

function formatMastheadTimestamp(date) {
  return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}

export default function MastheadClock() {
  const [timestamp, setTimestamp] = useState('');

  useEffect(() => {
    setTimestamp(formatMastheadTimestamp(new Date()));
  }, []);

  return (
    <span className="inline-block min-w-[23ch] shrink-0 text-right text-hud-dim tabular-nums">
      {timestamp || '\u00a0'}
    </span>
  );
}
