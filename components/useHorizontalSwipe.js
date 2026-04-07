import { useMemo } from 'react';

export default function useHorizontalSwipe({ onSwipeLeft, onSwipeRight, threshold = 60 } = {}) {
  return useMemo(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    function start(x, y) {
      startX = x;
      startY = y;
      tracking = true;
    }

    function end(x, y) {
      if (!tracking) return;
      tracking = false;
      const dx = x - startX;
      const dy = y - startY;
      if (Math.abs(dx) < threshold) return;
      if (Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    }

    return {
      onTouchStart: (e) => {
        const t = e.touches?.[0];
        if (!t) return;
        start(t.clientX, t.clientY);
      },
      onTouchEnd: (e) => {
        const t = e.changedTouches?.[0];
        if (!t) return;
        end(t.clientX, t.clientY);
      },
    };
  }, [onSwipeLeft, onSwipeRight, threshold]);
}

