import { beforeEach, describe, expect, it, vi } from 'vitest';

const { permanentRedirect, getPublicLiveIntelDesk } = vi.hoisted(() => ({
  permanentRedirect: vi.fn(),
  getPublicLiveIntelDesk: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  permanentRedirect,
}));

vi.mock('@/lib/feeds/liveIntel.service', () => ({
  getPublicLiveIntelDesk,
}));

describe('retired Claims route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects /intel/claims to OSINT and does not load the statements desk', async () => {
    const { default: IntelClaimsPage } = await import('@/app/intel/claims/page');
    IntelClaimsPage();

    expect(permanentRedirect).toHaveBeenCalledWith('/intel/osint');
    expect(getPublicLiveIntelDesk).not.toHaveBeenCalled();
  });
});
