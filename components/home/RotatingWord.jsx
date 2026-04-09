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

export default function RotatingWord({ minIntervalMs = 1600, maxIntervalMs = 4800 }) {
  const [index, setIndex] = useState(0);
  const [isGlitching, setIsGlitching] = useState(false);
  const [glitchDurMs, setGlitchDurMs] = useState(150);

  const cycleTimeoutRef = useRef(null);
  const swapTimeoutRef = useRef(null);
  const endGlitchTimeoutRef = useRef(null);
  const flickerDelayRef = useRef(null);

  const clearAllTimers = () => {
    if (cycleTimeoutRef.current) clearTimeout(cycleTimeoutRef.current);
    if (swapTimeoutRef.current) clearTimeout(swapTimeoutRef.current);
    if (endGlitchTimeoutRef.current) clearTimeout(endGlitchTimeoutRef.current);
    if (flickerDelayRef.current) clearTimeout(flickerDelayRef.current);
    cycleTimeoutRef.current = null;
    swapTimeoutRef.current = null;
    endGlitchTimeoutRef.current = null;
    flickerDelayRef.current = null;
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

      const base = randInt(minIntervalMs, maxIntervalMs);
      const jitter = randInt(-420, 420);
      const delay = Math.max(900, base + jitter);

      cycleTimeoutRef.current = setTimeout(() => {
        if (cancelled) return;

        const blinkMs = randInt(70, 260);
        const swapAt = Math.max(24, Math.floor(blinkMs / 2));
        const preFlicker = randInt(0, 140);

        const startGlitch = () => {
          setGlitchDurMs(blinkMs);
          setIsGlitching(true);
          swapTimeoutRef.current = setTimeout(() => {
            if (cancelled) return;
            setIndex((prev) => nextIndexDifferent(prev, WORDS.length));
          }, swapAt);
          endGlitchTimeoutRef.current = setTimeout(() => {
            if (cancelled) return;
            setIsGlitching(false);
            scheduleNextCycle();
          }, blinkMs);
        };

        if (preFlicker > 0) {
          flickerDelayRef.current = setTimeout(() => {
            if (cancelled) return;
            startGlitch();
          }, preFlicker);
        } else {
          startGlitch();
        }
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
    <span className="text-primary font-mono inline-block">
      <span className="inline-block">[</span>
      <span
        className={`inline-block relative ${isGlitching ? 'glitch-active' : ''}`}
        style={{ '--glitch-dur': `${glitchDurMs}ms` }}
        data-text={currentWord}
      >
        {currentWord}
      </span>
      <span className="inline-block">]</span>
    </span>
  );
}
