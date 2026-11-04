'use client';

import { useEffect, useRef, useState } from 'react';

const WORDS = [
  'RESIST',
  'TRUTH',
  'WITNESS',
  'DISSENT',
  'SOLIDARITY',
  'ANTIFA',
  'PATRIOT',
  'NEIGHBOR',
  'ALLY',
  'REBEL',
  'FREE',
  'STUDENT',
  'FRIEND',
  'AMERICAN',
  'FATHER',
  'HUSBAND',
  'VETERAN',
  'BROTHER',
];

const LONGEST_WORD = 'SOLIDARITY';
const ACQUIRE_MS = 280;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function nextIndexDifferent(prev, len) {
  if (len <= 1) return 0;
  const r = Math.floor(Math.random() * (len - 1));
  return r >= prev ? r + 1 : r;
}

export default function RotatingWord({ minIntervalMs = 8000, maxIntervalMs = 16000 }) {
  const [index, setIndex] = useState(0);
  const [isAcquiring, setIsAcquiring] = useState(false);

  const cycleTimeoutRef = useRef(null);
  const endAcquireTimeoutRef = useRef(null);

  const clearAllTimers = () => {
    if (cycleTimeoutRef.current) clearTimeout(cycleTimeoutRef.current);
    if (endAcquireTimeoutRef.current) clearTimeout(endAcquireTimeoutRef.current);
    cycleTimeoutRef.current = null;
    endAcquireTimeoutRef.current = null;
  };

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return;

    let cancelled = false;

    const scheduleNextCycle = () => {
      if (cycleTimeoutRef.current) {
        clearTimeout(cycleTimeoutRef.current);
        cycleTimeoutRef.current = null;
      }

      const delay = Math.max(7000, randInt(minIntervalMs, maxIntervalMs));

      cycleTimeoutRef.current = setTimeout(() => {
        if (cancelled) return;
        setIndex((prev) => nextIndexDifferent(prev, WORDS.length));
        setIsAcquiring(true);
        if (endAcquireTimeoutRef.current) clearTimeout(endAcquireTimeoutRef.current);
        endAcquireTimeoutRef.current = setTimeout(() => {
          if (!cancelled) setIsAcquiring(false);
        }, ACQUIRE_MS);
        scheduleNextCycle();
      }, delay);
    };

    scheduleNextCycle();

    return () => {
      cancelled = true;
      clearAllTimers();
    };
  }, [minIntervalMs, maxIntervalMs]);

  const currentWord = WORDS[index];

  return (
    <span className="hero-word text-primary font-mono">
      <span className="hero-word__slot">
        <span className="hero-word__sizer" aria-hidden="true">[{LONGEST_WORD}]</span>
        <span className={isAcquiring ? 'hero-word__value hero-word__value--acquire' : 'hero-word__value'}>
          [{currentWord}]
        </span>
      </span>
    </span>
  );
}
