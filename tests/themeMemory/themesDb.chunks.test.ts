import { describe, expect, it } from 'vitest';

import { THEME_IDENTITY_IN_CHUNK } from '@/lib/themeMemory/themesDb';

describe('Theme Memory identity-key batching', () => {
  it('keeps PostgREST identity_key IN filters below common URL length limits', () => {
    const typicalIdentityKeyChars = 220;
    expect(THEME_IDENTITY_IN_CHUNK).toBeLessThanOrEqual(20);
    expect(THEME_IDENTITY_IN_CHUNK * typicalIdentityKeyChars).toBeLessThan(8000);
  });
});
