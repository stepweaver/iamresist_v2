"use client";

import { useRef } from "react";

export default function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 60,
  ratio = 1.2,
} = {}) {
  const startRef = useRef(null);

  function onTouchStart(e) {
    const touch = e.changedTouches?.[0];
    if (!touch) return;
    startRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(e) {
    const touch = e.changedTouches?.[0];
    const start = startRef.current;
    startRef.current = null;
    if (!touch || !start) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (Math.abs(dx) < threshold) return;
    if (Math.abs(dx) < Math.abs(dy) * ratio) return;

    if (dx < 0) onSwipeLeft?.();
    if (dx > 0) onSwipeRight?.();
  }

  return { onTouchStart, onTouchEnd };
}

