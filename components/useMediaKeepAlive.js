"use client";

import { useRef } from "react";

/**
 * iOS Safari drops the Media Session lock-screen widget after a few seconds
 * unless a native <audio> element is actively playing on the page.
 * YouTube iframes are sandboxed and don't satisfy that requirement.
 *
 * This hook keeps a silent looping audio element alive while the video modal
 * is open, anchoring the iOS audio session so the lock-screen Now Playing
 * widget persists and the Media Session action handlers (play/pause/next/prev)
 * remain callable from the lock screen.
 *
 * Usage:
 *   const { startKeepAlive, stopKeepAlive } = useMediaKeepAlive();
 *
 *   // Call startKeepAlive() directly inside the click handler that opens the
 *   // player modal — this must happen synchronously during a user gesture so
 *   // iOS allows the audio.play() call.
 *   function handlePlay(item) {
 *     startKeepAlive();
 *     setActiveItem(item);
 *   }
 *
 *   // Call stopKeepAlive() when the modal closes.
 *   function handleClose() {
 *     stopKeepAlive();
 *     setActiveItem(null);
 *   }
 */
export function useMediaKeepAlive() {
  const audioRef = useRef(null);

  function startKeepAlive() {
    if (typeof Audio === "undefined") return;
    if (!audioRef.current) {
      const audio = new Audio("/silence.wav");
      audio.loop = true;
      audioRef.current = audio;
    }
    audioRef.current.play().catch(() => {});
  }

  function stopKeepAlive() {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  }

  return { startKeepAlive, stopKeepAlive };
}
