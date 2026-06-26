"use client";

import { useRef } from "react";

/**
 * Anchors the iOS audio session so the lock-screen Now Playing widget persists.
 *
 * iOS Safari drops the Media Session widget after a few seconds unless a native
 * audio element or AudioContext is actively producing sound. YouTube iframes are
 * cross-origin sandboxed and don't satisfy that requirement on their own.
 *
 * This hook plays a completely silent Web Audio buffer in a continuous loop
 * for as long as the player modal is open. It must be started synchronously
 * inside the click handler that opens the modal — that's the only point where
 * iOS will allow AudioContext.resume() without throwing a NotAllowedError.
 *
 * Usage:
 *   const { startKeepAlive, stopKeepAlive } = useMediaKeepAlive();
 *
 *   function handlePlay(item) {
 *     startKeepAlive();   // ← must be in the click handler
 *     setActiveItem(item);
 *   }
 *   function handleClose() {
 *     stopKeepAlive();
 *     setActiveItem(null);
 *   }
 */
export function useMediaKeepAlive() {
  const ctxRef = useRef(null);

  function scheduleChunk(ctx) {
    if (ctxRef.current !== ctx) return; // stopped or replaced
    let buf;
    try {
      // 0.5 s of silence — short enough to chain quickly, long enough to avoid
      // overhead from thousands of tiny buffers.
      buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.5), ctx.sampleRate);
    } catch {
      return; // context was closed
    }
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(ctx.destination);
    source.onended = () => scheduleChunk(ctx);
    source.start();
  }

  function startKeepAlive() {
    if (ctxRef.current) return; // already running

    const Ctx =
      typeof AudioContext !== "undefined"
        ? AudioContext
        : typeof window !== "undefined" && window.webkitAudioContext
          ? window.webkitAudioContext
          : null;
    if (!Ctx) return;

    try {
      const ctx = new Ctx();
      ctxRef.current = ctx;
      // resume() must be called during the user-gesture window; the promise
      // resolving starts the silent buffer loop.
      ctx.resume().then(() => scheduleChunk(ctx)).catch(() => {});
    } catch {}
  }

  function stopKeepAlive() {
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (!ctx) return;
    try {
      ctx.close();
    } catch {}
  }

  return { startKeepAlive, stopKeepAlive };
}
