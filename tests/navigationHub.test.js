import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: function Link() { return null; } }));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/context/CartContext', () => ({ useCart: () => ({ totalQuantity: 0 }) }));
vi.mock('@/components/ui/ThemeToggle', () => ({ ThemeToggle: function ThemeToggle() { return null; } }));
vi.mock('lucide-react', () => ({ ShoppingCart: function ShoppingCart() { return null; } }));

describe('main navigation hubs', () => {
  it('sends INTEL to the newswire and keeps Telescreen on the video archive', async () => {
    const { NAV_LINKS, isNavLinkActive } = await import('@/components/layout/Navigation');
    const intel = NAV_LINKS.find((link) => link.label === 'INTEL');
    const telescreen = NAV_LINKS.find((link) => link.label === 'TELESCREEN');
    const shelf = NAV_LINKS.find((link) => link.href === '/book-club');

    expect(intel.href).toBe('/intel/newswire');
    expect(telescreen.href).toBe('/telescreen');
    expect(shelf.href).toBe('/book-club');
    expect(shelf.label).toBe('SHELF');
    expect(shelf.title).toBe('The Resistance Shelf');

    expect(isNavLinkActive(intel, '/intel/osint')).toBe(true);
    expect(isNavLinkActive(intel, '/intel/newswire')).toBe(true);
    expect(isNavLinkActive(intel, '/telescreen')).toBe(false);
    expect(isNavLinkActive(telescreen, '/telescreen')).toBe(true);
    expect(isNavLinkActive(telescreen, '/intel/newswire')).toBe(false);
    expect(NAV_LINKS.map((link) => link.label)).toEqual([
      'HOME',
      'JOURNAL',
      'TELESCREEN',
      'INTEL',
      'SHELF',
      'SHOP',
    ]);
    expect(NAV_LINKS.map((link) => link.href)).toEqual([
      '/',
      '/journal',
      '/telescreen',
      '/intel/newswire',
      '/book-club',
      '/shop',
    ]);
  });

  it('keeps footer labels aligned with their routes and leaves About out of the primary bar', async () => {
    const { FOOTER_LINKS } = await import('@/components/layout/Footer');
    expect(FOOTER_LINKS).toEqual([
      { href: '/about', label: 'About / Manifesto' },
      { href: '/about/this-journal', label: 'About This Journal' },
      { href: '/resources', label: 'Resources' },
      { href: '/timeline', label: 'Timeline' },
      { href: '/intel/sources', label: 'Source Transparency' },
      { href: '/legal', label: 'Legal' },
    ]);
    expect(FOOTER_LINKS.map((link) => link.label)).not.toContain('SUPPLY');
    expect(FOOTER_LINKS.map((link) => link.label)).not.toContain('BRIEFING');
  });

  it('keeps Intel tabs off Telescreen and Resources', () => {
    const telescreen = readFileSync(path.join(process.cwd(), 'app/(site)/telescreen/page.jsx'), 'utf8');
    const resources = readFileSync(path.join(process.cwd(), 'app/(site)/resources/page.jsx'), 'utf8');
    const sources = readFileSync(path.join(process.cwd(), 'app/intel/sources/page.jsx'), 'utf8');

    expect(telescreen).not.toContain('IntelTabs');
    expect(resources).not.toContain('IntelTabs');
    expect(sources).toContain('IntelTabs');
    expect(sources).toContain('/intel/sources');
  });
});
