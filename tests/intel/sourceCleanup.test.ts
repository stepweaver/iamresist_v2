import { describe, expect, it } from 'vitest';
import { getSignalSources } from '@/lib/intel/signal-sources';
import { parseRssXmlToItems } from '@/lib/intel/parseRss';
import {
  CONGRESS_GOV_SOURCE_SLUGS,
  publicAuditPlacement,
} from '@/lib/feeds/intelSourcesAudit.display';

const RETIRED_DEFENSE = [
  'war-gov-releases',
  'usni-fleet-tracker',
  'af-mil-news',
  'army-mil-news',
  'centcom-press',
  'eucom-press',
  'dvids-sandbox',
] as const;

const RETIRED_CLAIMS = ['statements-public-import', 'statements-rss-sandbox'] as const;

const KEPT_PRIMARY = [
  'wh-news',
  'wh-presidential',
  'fr-public-inspection',
  'fr-published',
  'govinfo-bills',
  'govinfo-crec',
  'democracy-docket',
  'ofac-recent-actions',
] as const;

describe('intel source cleanup', () => {
  it('disables the Defense desk and CENTCOM without removing registry rows', () => {
    const sources = getSignalSources();
    for (const slug of RETIRED_DEFENSE) {
      const source = sources.find((entry) => entry.slug === slug);
      expect(source, slug).toBeTruthy();
      expect(source?.isEnabled).toBe(false);
      expect(source?.deskLane).toBe('defense_ops');
    }
    expect(sources.find((entry) => entry.slug === 'centcom-press')?.endpointUrl).toContain('centcom.mil');
  });

  it('keeps Claims placeholders disabled on the statements lane', () => {
    const sources = getSignalSources();
    for (const slug of RETIRED_CLAIMS) {
      const source = sources.find((entry) => entry.slug === slug);
      expect(source?.isEnabled).toBe(false);
      expect(source?.deskLane).toBe('statements');
    }
  });

  it('keeps repaired watchdogs on RSS and retires feeds that could not be repaired', () => {
    const sources = getSignalSources();
    const kyiv = sources.find((entry) => entry.slug === 'kyiv-independent');
    const mag = sources.find((entry) => entry.slug === 'mag-972');
    const forbidden = sources.find((entry) => entry.slug === 'forbidden-stories');
    const isw = sources.find((entry) => entry.slug === 'isw-feeds');

    expect(kyiv?.isEnabled).toBe(true);
    expect(kyiv?.fetchKind).toBe('rss');
    expect(kyiv?.endpointUrl).toBe('https://kyivindependent.com/news-archive/rss/');

    expect(mag?.isEnabled).toBe(false);
    expect(mag?.fetchKind).toBe('rss');
    expect(mag?.endpointUrl).toBe('https://www.972mag.com/feed/');
    expect(publicAuditPlacement({ slug: 'mag-972', deskLane: 'watchdogs', manifestEnabled: false })).toBe(
      'hidden',
    );

    const oversight = sources.find((entry) => entry.slug === 'american-oversight');
    expect(oversight?.isEnabled).toBe(true);
    expect(oversight?.endpointUrl).toContain('post_type[]=analysis');
    expect(oversight?.endpointUrl).toContain('post_type[]=press-release');
    expect(sources.find((entry) => entry.slug === 'lawfare')?.endpointUrl).toBe(
      'https://www.lawfaremedia.org/feeds/articles',
    );
    expect(sources.find((entry) => entry.slug === 'lawfare')?.isEnabled).toBe(true);

    expect(forbidden?.isEnabled).toBe(false);
    expect(isw?.isEnabled).toBe(false);
    const rappler = sources.find((entry) => entry.slug === 'rappler');
    expect(rappler?.isEnabled).toBe(false);
    expect(rappler?.deskLane).toBe('watchdogs');
    expect(rappler?.endpointUrl).toBe('https://www.rappler.com/rss/');
    expect(sources.find((entry) => entry.slug === 'bellingcat')?.isEnabled).toBe(true);
    expect(sources.find((entry) => entry.slug === 'meduza-english')?.isEnabled).toBe(true);
    expect(sources.find((entry) => entry.slug === 'birn-balkaninsight')?.isEnabled).toBe(true);
    expect(sources.find((entry) => entry.slug === 'occrp')?.isEnabled).toBe(true);
  });

  it('leaves primary-source ingestion enabled', () => {
    const sources = getSignalSources();
    for (const slug of KEPT_PRIMARY) {
      const source = sources.find((entry) => entry.slug === slug);
      expect(source?.isEnabled, slug).toBe(true);
      expect(source?.deskLane).toBe('osint');
    }
    for (const slug of CONGRESS_GOV_SOURCE_SLUGS) {
      const source = sources.find((entry) => entry.slug === slug);
      expect(source?.fetchKind).toBe('congress_api');
      expect(source?.deskLane).toBe('osint');
      expect(source?.endpointUrl).toBeTruthy();
    }
  });
});

describe('public source audit placement', () => {
  it('shows enabled OSINT and Watchdog sources and hides retired desks from the default list', () => {
    expect(
      publicAuditPlacement({ slug: 'democracy-docket', deskLane: 'osint', manifestEnabled: true }),
    ).toBe('active');
    expect(
      publicAuditPlacement({ slug: 'kyiv-independent', deskLane: 'watchdogs', manifestEnabled: true }),
    ).toBe('active');
    expect(
      publicAuditPlacement({ slug: 'centcom-press', deskLane: 'defense_ops', manifestEnabled: false }),
    ).toBe('hidden');
    expect(
      publicAuditPlacement({
        slug: 'statements-public-import',
        deskLane: 'statements',
        manifestEnabled: false,
      }),
    ).toBe('hidden');
    expect(
      publicAuditPlacement({ slug: 'forbidden-stories', deskLane: 'watchdogs', manifestEnabled: false }),
    ).toBe('hidden');
    expect(
      publicAuditPlacement({ slug: 'rappler', deskLane: 'watchdogs', manifestEnabled: false }),
    ).toBe('hidden');
    expect(
      publicAuditPlacement({ slug: 'robert-reich', deskLane: 'voices', manifestEnabled: false }),
    ).toBe('hidden');
    expect(
      publicAuditPlacement({ slug: 'bellingcat', deskLane: 'watchdogs', manifestEnabled: true }),
    ).toBe('active');
  });

  it('keeps unconfigured Congress.gov feeds out of the public directory', () => {
    for (const slug of CONGRESS_GOV_SOURCE_SLUGS) {
      expect(publicAuditPlacement({ slug, deskLane: 'osint', manifestEnabled: false })).toBe('hidden');
    }
    expect(
      publicAuditPlacement({
        slug: 'congress-bills-recent',
        deskLane: 'osint',
        manifestEnabled: true,
      }),
    ).toBe('active');
  });

  it('keeps previously removed scaffolds off the public audit', () => {
    expect(
      publicAuditPlacement({
        slug: 'indicator-pentagon-pizza',
        deskLane: 'indicators',
        manifestEnabled: false,
      }),
    ).toBe('hidden');
  });
});

describe('repaired publisher RSS parsing', () => {
  it('parses Kyiv Independent and +972 article entries with dates and canonical links', async () => {
    const kyiv = await parseRssXmlToItems(
      `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0"><channel>
        <title>The Kyiv Independent</title>
        <link>https://kyivindependent.com/</link>
        <item>
          <title>Massive Ukrainian drone attack hits shopping center</title>
          <link>https://kyivindependent.com/massive-ukrainian-drone-attack/</link>
          <pubDate>Sat, 24 Oct 2026 21:42:59 GMT</pubDate>
          <description>Local officials reported the strike.</description>
        </item>
      </channel></rss>`,
      {
        sourceSlug: 'kyiv-independent',
        provenanceClass: 'SPECIALIST',
        contentUseMode: 'feed_summary',
        fetchKind: 'rss',
        deskLane: 'watchdogs',
        sourceFamily: 'watchdog_global',
      },
    );
    expect(kyiv).toHaveLength(1);
    expect(kyiv[0]?.canonicalUrl).toBe('https://kyivindependent.com/massive-ukrainian-drone-attack/');
    expect(kyiv[0]?.publishedAt).toBeTruthy();
    expect(kyiv[0]?.title).toMatch(/drone attack/);

    const mag = await parseRssXmlToItems(
      `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0"><channel>
        <title>+972 Magazine</title>
        <link>https://www.972mag.com/</link>
        <item>
          <title>Israel election primer</title>
          <link>https://www.972mag.com/israeli-election-primer-2026/</link>
          <pubDate>Fri, 23 Oct 2026 14:42:51 +0000</pubDate>
          <description>A look at the campaign.</description>
        </item>
      </channel></rss>`,
      {
        sourceSlug: 'mag-972',
        provenanceClass: 'SPECIALIST',
        contentUseMode: 'feed_summary',
        fetchKind: 'rss',
        deskLane: 'watchdogs',
        sourceFamily: 'watchdog_global',
      },
    );
    expect(mag).toHaveLength(1);
    expect(mag[0]?.canonicalUrl).toBe('https://www.972mag.com/israeli-election-primer-2026/');
    expect(mag[0]?.publishedAt).toBeTruthy();
  });
});
