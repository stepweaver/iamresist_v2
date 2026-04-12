"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/intel/live", label: "Live" },
  { href: "/voices", label: "Voices" },
  { href: "/intel/newswire", label: "Newswire" },
];

export default function IntelTabs({ description }) {
  const pathname = usePathname();
  const isLive = pathname?.startsWith("/intel/live");
  const isNewswire = pathname?.startsWith("/intel/newswire");
  const isVoices = !isLive && !isNewswire;

  return (
    <header className="mb-4 sm:mb-5 border-b border-border pb-4 sm:pb-5">
      <span className="text-primary text-xs sm:text-sm tracking-[0.4em] uppercase font-bold block mb-1">
        Intel
      </span>
      <nav
        className="flex flex-wrap items-baseline gap-2 sm:gap-4 mb-1"
        aria-label="Intel sections"
      >
        {TABS.map((tab, i) => {
          const isActive =
            (tab.href === "/intel/live" && isLive) ||
            (tab.href === "/intel/newswire" && isNewswire) ||
            (tab.href === "/voices" && isVoices);
          return (
            <span key={tab.href} className="flex items-baseline gap-2 sm:gap-4">
              {i > 0 && (
                <span className="text-foreground/30 text-base sm:text-lg font-bold" aria-hidden>
                  |
                </span>
              )}
              <Link
                href={tab.href}
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
      {description && (
        <p className="text-xs sm:text-sm text-foreground/70 uppercase tracking-wider">
          {description}
        </p>
      )}
    </header>
  );
}
