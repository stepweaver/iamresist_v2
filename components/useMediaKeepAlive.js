"use client";

import { useRef } from "react";

// 0.1-second silent WAV as a data URI. Using an inline data URI avoids a
// network fetch that could fail or be blocked, and keeps this self-contained.
// Brave on iOS blocks the Web Audio API (anti-fingerprinting), so we try
// Web Audio first and fall back to a plain <audio> element, which Brave does
// NOT restrict.
const SILENT_WAV_URI =
  "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

/**
 * Anchors the iOS/Brave audio session so the lock-screen Now Playing widget
 * persists while the video player modal is open.
 *
 * Strategy (in priority order):
 * 1. Web Audio API — better session integration, but Brave Shields blocks it.
 * 2. <audio> element with inline silent data URI — works in all browsers
 *    including Brave, because Brave only restricts AudioContext fingerprinting,
 *    not plain HTML media elements.
 *
 * IMPORTANT: startKeepAlive() must be called synchronously inside the user's
 * click handler (the one that opens the modal). iOS and Brave only allow
 * audio to start playing within the user-gesture window.
 */
export function useMediaKeepAlive() {
  const ctxRef = useRef(null);     // Web Audio path
  const audioElRef = useRef(null); // <audio> fallback path

  // --- Web Audio path ---
  function scheduleChunk(ctx) {
    if (ctxRef.current !== ctx) return;
    let buf;
    try {
      buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.5), ctx.sampleRate);
    } catch {
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(ctx.destination);
    source.onended = () => scheduleChunk(ctx);
    source.start();
  }

  function tryWebAudio() {
    const Ctx =
      typeof AudioContext !== "undefined"
        ? AudioContext
        : typeof window !== "undefined" && window.webkitAudioContext
          ? window.webkitAudioContext
          : null;
    if (!Ctx) return false;

    try {
      const ctx = new Ctx();
      ctxRef.current = ctx;
      ctx.resume().then(() => {
        if (ctx.state === "running") {
          scheduleChunk(ctx);
        } else {
          // AudioContext didn't start — likely blocked by Brave Shields.
          ctx.close().catch(() => {});
          ctxRef.current = null;
          startAudioElement();
        }
      }).catch(() => {
        ctxRef.current = null;
        startAudioElement();
      });
      return true;
    } catch {
      return false;
    }
  }

  // --- <audio> element fallback (works in Brave) ---
  function startAudioElement() {
    if (audioElRef.current) return;
    try {
      const audio = new Audio(SILENT_WAV_URI);
      audio.loop = true;
      audioElRef.current = audio;
      audio.play().catch(() => {});
    } catch {}
  }

  function startKeepAlive() {
    if (ctxRef.current || audioElRef.current) return; // already running
    if (!tryWebAudio()) {
      startAudioElement();
    }
  }

  function stopKeepAlive() {
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx) {
      try { ctx.close(); } catch {}
    }

    const audio = audioElRef.current;
    audioElRef.current = null;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
  }

  return { startKeepAlive, stopKeepAlive };
}
