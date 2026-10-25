import { describe, expect, it } from 'vitest';
import { INTEL_NAV_TABS, SOURCE_TRANSPARENCY_LINK } from '@/components/IntelTabs';

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
    expect(hrefs).toEqual(['/intel/newswire', '/intel/osint', '/intel/watchdogs']);
    expect(hrefs).not.toContain('/telescreen');
    expect(hrefs).not.toContain('/intel/sources');
    expect(SOURCE_TRANSPARENCY_LINK).toEqual({
      href: '/intel/sources',
      label: 'Source Transparency',
    });
  });
});
