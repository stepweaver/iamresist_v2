"use client";

import { useLayoutEffect } from "react";

const TABBABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getTabbable(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(TABBABLE_SELECTOR)).filter(
    (el) => container.contains(el) && el.getAttribute("aria-hidden") !== "true"
  );
}

export default function useModalFocusTrap(containerRef, initialFocusRef) {
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const previousActive =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const raf = requestAnimationFrame(() => {
      initialFocusRef.current?.focus();
    });

    function onKeyDown(e) {
      if (e.key !== "Tab") return;
      const nodes = getTabbable(container);
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !container.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      if (previousActive && document.contains(previousActive)) previousActive.focus();
    };
  }, [containerRef, initialFocusRef]);
}

