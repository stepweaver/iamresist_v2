import { afterEach, describe, expect, it, vi } from 'vitest';
import { logPerf, timeAsync } from '@/lib/ops/perfTiming';

describe('performance timing', () => {
  const previous = process.env.PERF_TIMING;

  afterEach(() => {
    if (previous === undefined) delete process.env.PERF_TIMING;
    else process.env.PERF_TIMING = previous;
    vi.restoreAllMocks();
  });

  it('logs slow and failed operations without the payload', async () => {
    process.env.PERF_TIMING = '1';
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await timeAsync('homepage-section:telescreen', async () => [{ title: 'secret headline', token: 'nope' }]);
    await expect(
      timeAsync('newswire-aggregation', async () => {
        const err = new Error('upstream');
        throw err;
      }),
    ).rejects.toThrow('upstream');

    const lines = [...info.mock.calls, ...warn.mock.calls].map((args) => args.join(' '));
    expect(lines.some((line) => line.includes('operation=homepage-section:telescreen') && line.includes('ok=1'))).toBe(
      true,
    );
    expect(lines.some((line) => line.includes('operation=newswire-aggregation') && line.includes('ok=0'))).toBe(true);
    expect(lines.join('\n')).not.toContain('secret headline');
    expect(lines.join('\n')).not.toContain('nope');
  });

  it('stays quiet for a fast success when diagnostics are not forced on', () => {
    delete process.env.PERF_TIMING;
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    logPerf({ operation: 'homepage-section:live-briefing', durationMs: 12, ok: true, result: ['hidden'] });
    expect(info).not.toHaveBeenCalled();
  });
});
