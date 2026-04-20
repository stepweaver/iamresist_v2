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

  it('sends /intel to Telescreen by default', async () => {
    const { default: IntelPage } = await import('@/app/intel/page');
    IntelPage();

    expect(permanentRedirect).toHaveBeenCalledWith('/telescreen');
  });

  it('sends legacy /intel/live to Telescreen by default', async () => {
    const { default: IntelLivePage } = await import('@/app/intel/live/page');
    IntelLivePage();

    expect(permanentRedirect).toHaveBeenCalledWith('/telescreen');
  });

  it('sends legacy /intel/statements directly to Telescreen', async () => {
    const { default: IntelStatementsPage } = await import('@/app/intel/statements/page');
    IntelStatementsPage();

    expect(permanentRedirect).toHaveBeenCalledWith('/telescreen');
  });
});
