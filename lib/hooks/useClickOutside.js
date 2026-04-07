"use client";

import { useEffect, useRef } from "react";

/**
 * Calls onClose when a click occurs outside the referenced element.
 */
export default function useClickOutside(ref, onClose) {
  useEffect(() => {
    const handler = (event) => {
      if (!ref.current) return;
      if (ref.current.contains(event.target)) return;
      onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [ref, onClose]);
}
