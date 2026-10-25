"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const SOURCE_TRANSPARENCY_LINK = {
  href: "/intel/sources",
  label: "Source Transparency",
};

export const INTEL_NAV_TABS = [
  { href: "/intel/newswire", label: "Newswire" },
  { href: "/intel/osint", label: "OSINT" },
  { href: "/intel/watchdogs", label: "Watchdogs" },
];

export default function IntelTabs({ description }) {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  const isOsint =
    pathname?.startsWith("/intel/osint") || pathname?.startsWith("/intel/live");
  const isWatchdogs = pathname?.startsWith("/intel/watchdogs");
  const isSources = pathname?.startsWith("/intel/sources");
  const isNewswire = pathname?.startsWith("/intel/newswire");

  return (
    <header className="mb-4 sm:mb-5 border-b border-border pb-4 sm:pb-5">
      <span className="text-primary text-xs sm:text-sm tracking-[0.4em] uppercase font-bold block mb-1">
        Intel
      </span>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <nav
          className="flex flex-wrap items-baseline gap-2 sm:gap-4"
          aria-label="Intel sections"
        >
          {INTEL_NAV_TABS.map((tab, i) => {
            const isActive =
              (tab.href === "/intel/osint" && isOsint) ||
              (tab.href === "/intel/watchdogs" && isWatchdogs) ||
              (tab.href === "/intel/newswire" && isNewswire);
            return (
              <span key={tab.href} className="flex items-baseline gap-2 sm:gap-4">
                {i > 0 && (
                  <span className="text-foreground/30 text-base sm:text-lg font-bold" aria-hidden>
                    |
                  </span>
                )}
                <Link
                  href={tab.href}
                  scroll
                  aria-current={isActive ? "page" : undefined}
                  className={`text-base sm:text-lg font-bold uppercase tracking-wider transition-colors ${
                    isActive
                      ? "text-foreground"
                      : "text-foreground/60 hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </Link>
              </span>
            );
          })}
        </nav>
        <Link
          href={SOURCE_TRANSPARENCY_LINK.href}
          scroll
          aria-current={isSources ? "page" : undefined}
          className={`nav-label text-xs font-bold uppercase tracking-wider transition-colors ${
            isSources ? "text-foreground" : "text-foreground/60 hover:text-foreground"
          }`}
        >
          {SOURCE_TRANSPARENCY_LINK.label}
        </Link>
      </div>
      {description ? (
        <div className="text-xs sm:text-sm text-foreground/70 uppercase tracking-wider leading-relaxed">
          {description}
        </div>
      ) : null}
    </header>
  );
}
