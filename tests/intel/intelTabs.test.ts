import { describe, expect, it } from 'vitest';
import { INTEL_NAV_TABS } from '@/components/IntelTabs';

describe('Intel navigation', () => {
  it('no longer displays the retired Voices desk', () => {
    const hrefs = INTEL_NAV_TABS.map((tab) => tab.href);
    const labels = INTEL_NAV_TABS.map((tab) => tab.label);

    expect(hrefs).not.toContain('/intel/voices');
    expect(labels).not.toContain('Voices');
    expect(hrefs).toEqual([
      '/intel/osint',
      '/intel/defense',
      '/intel/watchdogs',
      '/intel/claims',
      '/telescreen',
      '/intel/newswire',
      '/intel/sources',
    ]);
  });
});
