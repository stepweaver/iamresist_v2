import { describe, expect, it, vi } from 'vitest';

const revalidateTag = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  revalidateTag: (...args) => revalidateTag(...args),
  revalidatePath: (...args) => revalidatePath(...args),
}));
vi.mock('@/lib/env', () => ({ env: { CRON_SECRET: 'test-secret' } }));
vi.mock('@/lib/ops/cronAuth', () => ({
  assertCronAuthorized: () => ({ ok: true }),
}));

describe('POST /api/revalidate journal', () => {
  it('expires the journal list, essay bodies, homepage, archive, and essay routes together', async () => {
    const { POST } = await import('@/app/api/revalidate/route');
    const response = await POST(
      new Request('https://www.iamresist.org/api/revalidate', {
        method: 'POST',
        body: JSON.stringify({ tags: ['journal'] }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith('journal');
    expect(revalidateTag).toHaveBeenCalledWith('notion-blocks');
    expect(revalidatePath).toHaveBeenCalledWith('/');
    expect(revalidatePath).toHaveBeenCalledWith('/journal');
    expect(revalidatePath).toHaveBeenCalledWith('/journal/[slug]', 'page');
    expect(body.revalidatedPaths).toEqual(['/', '/journal', '/journal/[slug]']);
  });

  it('leaves journal routes cached when another feed tag is flushed', async () => {
    revalidateTag.mockClear();
    revalidatePath.mockClear();
    const { POST } = await import('@/app/api/revalidate/route');
    const response = await POST(
      new Request('https://www.iamresist.org/api/revalidate', {
        method: 'POST',
        body: JSON.stringify({ tags: ['newswire'] }),
      }),
    );

    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith('newswire');
    expect(revalidateTag).not.toHaveBeenCalledWith('journal');
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
