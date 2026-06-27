"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Share, X } from "lucide-react";

const DISMISSED_KEY = "pwa-install-dismissed-v1";

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function wasDismissed() {
  try {
    return Boolean(localStorage.getItem(DISMISSED_KEY));
  } catch {
    return false;
  }
}

export default function PwaInstallBanner() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const deferredPromptRef = useRef(null);

  const isAllowedPath =
    pathname === "/" || pathname === "/telescreen" || pathname?.startsWith("/telescreen");

  useEffect(() => {
    if (!isAllowedPath) return;
    if (isInStandaloneMode()) return;
    if (wasDismissed()) return;

    const iosDevice = isIosDevice();
    setIos(iosDevice);

    if (iosDevice) {
      // iOS Safari does not fire beforeinstallprompt; show manual instructions.
      setShow(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [isAllowedPath]);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
  }

  async function handleInstall() {
    const prompt = deferredPromptRef.current;
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      dismiss();
    }
  }

  if (!show) return null;

  return (
    <div
      role="banner"
      aria-label="Install app"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm"
    >
      <div className="max-w-[1600px] mx-auto px-3 sm:px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {ios ? (
            <p className="text-xs text-foreground/80 leading-snug">
              <span className="text-primary font-bold">Install for lock-screen controls</span>
              {" — tap "}
              <Share className="inline w-3.5 h-3.5 align-text-bottom" />
              {" then "}
              <strong className="text-foreground">Add to Home Screen</strong>
            </p>
          ) : (
            <p className="text-xs text-foreground/80 leading-snug">
              <span className="text-primary font-bold">Install for lock-screen controls</span>
              {" — keep audio going when your screen locks"}
            </p>
          )}
        </div>

        {!ios && (
          <button
            onClick={handleInstall}
            className="flex items-center gap-1.5 shrink-0 text-xs font-bold nav-label text-foreground hover:text-primary border border-border hover:border-primary px-2.5 py-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Install
          </button>
        )}

        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 text-foreground/40 hover:text-foreground/80 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
