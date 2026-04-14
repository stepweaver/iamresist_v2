import { describe, expect, it } from 'vitest';
import { getSignalSources } from '@/lib/intel/signal-sources';

describe('Meduza English source configuration', () => {
  it('uses English-only RSS path', () => {
    const src = getSignalSources().find((s) => s.slug === 'meduza-english');
    expect(src?.endpointUrl).toContain('/rss/en/');
    expect(src?.fetchKind).toBe('rss');
  });
});
