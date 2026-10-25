import { beforeEach, describe, expect, it, vi } from 'vitest';

const { permanentRedirect } = vi.hoisted(() => ({
  permanentRedirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  permanentRedirect,
}));

describe('Intel landing routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends /intel to the newswire instead of Telescreen', async () => {
    const { default: IntelPage } = await import('@/app/intel/page');
    IntelPage();

    expect(permanentRedirect).toHaveBeenCalledWith('/intel/newswire');
  });

  it('sends legacy /intel/live to Telescreen by default', async () => {
    const { default: IntelLivePage } = await import('@/app/intel/live/page');
    IntelLivePage();

    expect(permanentRedirect).toHaveBeenCalledWith('/telescreen');
  });

  it('sends retired /intel/defense to Watchdogs', async () => {
    const { default: IntelDefensePage } = await import('@/app/intel/defense/page');
    IntelDefensePage();

    expect(permanentRedirect).toHaveBeenCalledWith('/intel/watchdogs');
  });

  it('sends retired /intel/claims to OSINT', async () => {
    const { default: IntelClaimsPage } = await import('@/app/intel/claims/page');
    IntelClaimsPage();

    expect(permanentRedirect).toHaveBeenCalledWith('/intel/osint');
  });

  it('sends legacy /intel/statements directly to Telescreen', async () => {
    const { default: IntelStatementsPage } = await import('@/app/intel/statements/page');
    IntelStatementsPage();

    expect(permanentRedirect).toHaveBeenCalledWith('/telescreen');
  });

  it('sends retired /intel/voices to Telescreen and keeps filter query params', async () => {
    const { default: IntelVoicesPage } = await import('@/app/intel/voices/page');
    await IntelVoicesPage({ searchParams: Promise.resolve({ voice: 'creator-one' }) });

    expect(permanentRedirect).toHaveBeenCalledWith('/telescreen?voice=creator-one');
  });
});
