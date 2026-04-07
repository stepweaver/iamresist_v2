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

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function nextIndexDifferent(prev, len) {
  if (len <= 1) return 0;
  const r = Math.floor(Math.random() * (len - 1));
  return r >= prev ? r + 1 : r;
}

export default function RotatingWord({
  minIntervalMs = 2000,
  maxIntervalMs = 4000,
  blinkDurationMs = 150,
}) {
  const [index, setIndex] = useState(0);
  const [isGlitching, setIsGlitching] = useState(false);

  const cycleTimeoutRef = useRef(null);
  const swapTimeoutRef = useRef(null);
  const endGlitchTimeoutRef = useRef(null);

  const clearAllTimers = () => {
    if (cycleTimeoutRef.current) clearTimeout(cycleTimeoutRef.current);
    if (swapTimeoutRef.current) clearTimeout(swapTimeoutRef.current);
    if (endGlitchTimeoutRef.current) clearTimeout(endGlitchTimeoutRef.current);
    cycleTimeoutRef.current = null;
    swapTimeoutRef.current = null;
    endGlitchTimeoutRef.current = null;
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

      const delay = randInt(minIntervalMs, maxIntervalMs);

      cycleTimeoutRef.current = setTimeout(() => {
        if (cancelled) return;

        setIsGlitching(true);

        swapTimeoutRef.current = setTimeout(() => {
          if (cancelled) return;
          setIndex((prev) => nextIndexDifferent(prev, WORDS.length));
        }, Math.floor(blinkDurationMs / 2));

        endGlitchTimeoutRef.current = setTimeout(() => {
          if (cancelled) return;
          setIsGlitching(false);
          scheduleNextCycle();
        }, blinkDurationMs);
      }, delay);
    };

    scheduleNextCycle();

    return () => {
      cancelled = true;
      clearAllTimers();
    };
  }, [minIntervalMs, maxIntervalMs, blinkDurationMs]);

  const currentWord = WORDS[index];

  return (
    <span className="text-primary font-mono inline-block">
      <span className="inline-block">[</span>
      <span
        className={`inline-block relative ${isGlitching ? 'glitch-active' : ''}`}
        data-text={currentWord}
      >
        {currentWord}
      </span>
      <span className="inline-block">]</span>
    </span>
  );
}
