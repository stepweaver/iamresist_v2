import { describe, expect, it } from 'vitest';
import { INTEL_NAV_TABS } from '@/components/IntelTabs';

describe('Intel navigation', () => {
  it('no longer displays the retired Voices desk', () => {
    const hrefs = INTEL_NAV_TABS.map((tab) => tab.href);
    const labels = INTEL_NAV_TABS.map((tab) => tab.label);

    expect(hrefs).not.toContain('/intel/voices');
    expect(labels).not.toContain('Voices');
    expect(hrefs).not.toContain('/intel/defense');
    expect(hrefs).not.toContain('/intel/claims');
    expect(labels).not.toContain('Defense');
    expect(labels).not.toContain('Claims');
    expect(hrefs).toEqual([
      '/intel/osint',
      '/intel/watchdogs',
      '/telescreen',
      '/intel/newswire',
      '/intel/sources',
    ]);
  });
});
