'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const NAV_LINKS = [
  { href: '/', label: 'HOME' },
  { href: '/about', label: 'MISSION' },
  { href: '/voices', label: 'INTEL' },
  { href: '/journal', label: 'JOURNAL' },
  { href: '/timeline', label: 'TIMELINE' },
  { href: '/shop', label: 'SUPPLY' },
  { href: '/legal', label: 'LEGAL' },
];

export default function Navigation() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && mobileMenuOpen) setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (mobileMenuOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border" aria-label="Main navigation">
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3">
        <div className="flex items-center justify-between h-16 sm:h-20">
          <Link href="/" className="flex items-center gap-2 sm:gap-4 group flex-shrink-0">
            <span className="font-display text-2xl sm:text-3xl font-bold tracking-[0.15em] text-foreground group-hover:text-primary transition-colors block leading-tight">
              I AM <span className="text-primary font-mono">[RESIST]</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-2">
            {NAV_LINKS.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href !== '/' && pathname?.startsWith(link.href + '/'));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`nav-label relative px-5 py-2 text-sm font-bold tracking-[0.15em] transition-all duration-200 border-b-2 ${
                    isActive ? 'text-primary border-primary' : 'text-foreground/60 hover:text-foreground border-transparent hover:border-foreground/30'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="ml-2">
              <ThemeToggle />
            </div>
          </div>

          <div className="md:hidden flex items-center gap-3 pl-2 pr-4">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex flex-col gap-1.5 w-8 h-8 justify-center items-center cursor-pointer"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
            >
              <span className={`w-6 h-0.5 bg-foreground transition-all duration-300 ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} aria-hidden />
              <span className={`w-6 h-0.5 bg-foreground transition-all duration-300 ${mobileMenuOpen ? 'opacity-0' : ''}`} aria-hidden />
              <span className={`w-6 h-0.5 bg-foreground transition-all duration-300 ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} aria-hidden />
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div id="mobile-menu" className="md:hidden border-t border-border py-4" role="menu">
            <div className="mb-2 px-4">
              <ThemeToggle />
            </div>
            {NAV_LINKS.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href !== '/' && pathname?.startsWith(link.href + '/'));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`nav-label block px-4 py-3 text-sm font-bold tracking-[0.15em] transition-all duration-200 border-l-2 ${
                    isActive ? 'text-primary border-primary bg-primary/5' : 'text-foreground/60 hover:text-foreground border-transparent hover:border-foreground/30'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
