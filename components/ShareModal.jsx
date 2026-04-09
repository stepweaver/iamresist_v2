'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Share2,
  Copy,
  Check,
  Mail,
  ChevronRight,
  Facebook,
  Twitter,
  MessageCircle,
} from 'lucide-react';

export default function ShareModal({
  isOpen,
  onClose,
  url,
  title,
  description = '',
  heading = 'Share',
}) {
  const [copied, setCopied] = useState(false);
  const [shareSupported, setShareSupported] = useState(false);
  const [mounted, setMounted] = useState(false);
  const modalRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    setShareSupported(typeof navigator !== 'undefined' && !!navigator.share);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    document.body.style.overflow = 'hidden';
    setTimeout(() => closeRef.current?.focus(), 100);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const fullUrl = url?.startsWith('http') ? url : `${window.location.origin}${url ?? ''}`;
  const shareText = description || title || '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = fullUrl;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  const handleNativeShare = async () => {
    if (!shareSupported) return;
    try {
      await navigator.share({ title, text: shareText, url: fullUrl });
      onClose();
    } catch (err) {
      if (err?.name !== 'AbortError' && process.env.NODE_ENV === 'development') {
        console.error(err);
      }
    }
  };

  const openShareUrl = (shareTargetUrl) => {
    if (shareTargetUrl) window.open(shareTargetUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  const encodedUrl = encodeURIComponent(fullUrl);
  const encodedTitle = encodeURIComponent(title || '');
  const encodedText = encodeURIComponent(shareText);

  const modalContent = (
    <>
      <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm" aria-hidden />
      <div className="pointer-events-none fixed inset-0 z-[101] flex items-center justify-center p-4">
        <div
          ref={modalRef}
          className="pointer-events-auto flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-lg border-2 border-primary/50 bg-military-black shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-modal-title"
        >
          <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border/30 p-4 sm:p-6">
            <h2
              id="share-modal-title"
              className="min-w-0 truncate text-lg font-bold uppercase tracking-wider text-foreground sm:text-xl"
            >
              {heading}
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="flex-shrink-0 rounded p-2 text-foreground/70 hover:bg-military-grey hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-military-black"
              aria-label="Close"
            >
              <X className="h-5 w-5 shrink-0" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
            <div className="rounded border border-border/20 bg-military-grey/30 p-3">
              <p className="mb-1 line-clamp-2 text-sm font-semibold text-foreground">{title || 'Untitled'}</p>
              <p className="font-mono break-all text-xs text-foreground/60">{fullUrl}</p>
            </div>

            {shareSupported ? (
              <button
                type="button"
                onClick={handleNativeShare}
                className="group flex w-full items-center gap-3 rounded border border-primary/30 bg-primary/10 p-3 text-left text-foreground transition-all hover:border-primary/50 hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 transition-colors group-hover:bg-primary/30">
                  <Share2 className="h-5 w-5 text-primary" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 overflow-hidden">
                  <span className="block text-sm font-bold uppercase tracking-wider text-foreground">
                    Share via…
                  </span>
                  <span className="block text-xs text-foreground/60">Use your device&apos;s share menu</span>
                </span>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-foreground/40" aria-hidden />
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleCopy}
              className={`group flex w-full items-center gap-3 rounded border p-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary ${
                copied
                  ? 'border-primary bg-primary/10'
                  : 'border-border/30 bg-military-grey/30 hover:border-primary/50 hover:bg-military-grey/50'
              }`}
            >
              <span
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                  copied ? 'bg-primary/30' : 'bg-military-grey/50 group-hover:bg-primary/20'
                }`}
              >
                {copied ? (
                  <Check className="h-5 w-5 text-primary" aria-hidden />
                ) : (
                  <Copy className="h-5 w-5 text-foreground/70 group-hover:text-primary" aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1 overflow-hidden">
                <span className="block text-sm font-bold uppercase tracking-wider text-foreground">
                  {copied ? 'Copied!' : 'Copy link'}
                </span>
                <span className="block text-xs text-foreground/60">
                  {copied ? 'Link copied to clipboard' : 'Copy URL to clipboard'}
                </span>
              </span>
            </button>

            <div className="border-t border-border/20 pt-2">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-foreground/60">
                Share on social media
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    openShareUrl(`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`)
                  }
                  className="flex items-center justify-center gap-2 rounded border border-border/20 bg-military-grey/20 p-2.5 text-xs font-bold uppercase tracking-wider text-foreground/70 transition-all hover:border-primary/50 hover:bg-military-grey/40 hover:text-foreground"
                >
                  <Twitter className="h-4 w-4 shrink-0" aria-hidden />
                  X / Twitter
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openShareUrl(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`)
                  }
                  className="flex items-center justify-center gap-2 rounded border border-border/20 bg-military-grey/20 p-2.5 text-xs font-bold uppercase tracking-wider text-foreground/70 transition-all hover:border-primary/50 hover:bg-military-grey/40 hover:text-foreground"
                >
                  <Facebook className="h-4 w-4 shrink-0" aria-hidden />
                  Facebook
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openShareUrl(`https://reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`)
                  }
                  className="flex items-center justify-center gap-2 rounded border border-border/20 bg-military-grey/20 p-2.5 text-xs font-bold uppercase tracking-wider text-foreground/70 transition-all hover:border-primary/50 hover:bg-military-grey/40 hover:text-foreground"
                >
                  <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
                  Reddit
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openShareUrl(`mailto:?subject=${encodedTitle}&body=${encodedText}%20${encodedUrl}`)
                  }
                  className="flex items-center justify-center gap-2 rounded border border-border/20 bg-military-grey/20 p-2.5 text-xs font-bold uppercase tracking-wider text-foreground/70 transition-all hover:border-primary/50 hover:bg-military-grey/40 hover:text-foreground"
                >
                  <Mail className="h-4 w-4 shrink-0" aria-hidden />
                  Email
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}
