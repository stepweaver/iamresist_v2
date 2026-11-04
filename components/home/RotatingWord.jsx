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
const GLITCH_EVERY = 4;

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
  const [isGlitching, setIsGlitching] = useState(false);
  const [glitchDurMs, setGlitchDurMs] = useState(90);

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
    let cycle = 0;

    const scheduleNextCycle = () => {
      if (cycleTimeoutRef.current) {
        clearTimeout(cycleTimeoutRef.current);
        cycleTimeoutRef.current = null;
      }

      const delay = Math.max(7000, randInt(minIntervalMs, maxIntervalMs));

      cycleTimeoutRef.current = setTimeout(() => {
        if (cancelled) return;
        cycle += 1;
        const shouldGlitch = cycle % GLITCH_EVERY === 0;

        if (!shouldGlitch) {
          setIndex((prev) => nextIndexDifferent(prev, WORDS.length));
          scheduleNextCycle();
          return;
        }

        const blinkMs = 90;
        setGlitchDurMs(blinkMs);
        setIsGlitching(true);
        swapTimeoutRef.current = setTimeout(() => {
          if (cancelled) return;
          setIndex((prev) => nextIndexDifferent(prev, WORDS.length));
        }, 45);
        endGlitchTimeoutRef.current = setTimeout(() => {
          if (cancelled) return;
          setIsGlitching(false);
          scheduleNextCycle();
        }, blinkMs);
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
        <span
          className={isGlitching ? 'hero-word__value glitch-active' : 'hero-word__value'}
          style={{ '--glitch-dur': `${glitchDurMs}ms` }}
        >
          [{currentWord}]
        </span>
      </span>
    </span>
  );
}
