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
  });
});
