import { describe, expect, it } from 'vitest';
import { inspectFederalRegisterJson } from '@/lib/intel/frApi';
import { isUsFederalHoliday, publicInspectionDeskClosed } from '@/lib/intel/federalBusinessDay';
import { parseRssXmlDetailed } from '@/lib/intel/parseRss';
import { classifyIntelSourceAudit } from '@/lib/feeds/intelSourcesAudit.health';
import { getSignalSources } from '@/lib/intel/signal-sources';

const SUNDAY_NOON_ET = new Date('2026-10-25T16:00:00.000Z');
const MONDAY_BEFORE_POSTING = new Date('2026-10-26T12:00:00.000Z');
const MONDAY_AFTER_POSTING = new Date('2026-10-26T13:00:00.000Z');

const PI_CLOSED = {
  description: 'All Public Inspection Documents',
  count: 0,
  meta: {
    pil_unavailability_message:
      'The Public Inspection list is unavailable after 12AM Eastern time and will return on Monday, October 26 at 8:45AM Eastern time.',
  },
};

const PUBLISHED_DOC = {
  title: 'Self-Regulatory Organization',
  type: 'Notice',
  abstract: 'A published notice.',
  document_number: '2026-21835',
  html_url: 'https://www.federalregister.gov/documents/2026/10/23/2026-21835/example',
  pdf_url: 'https://www.govinfo.gov/content/pkg/FR-2026-10-23/pdf/2026-21835.pdf',
  publication_date: '2026-10-23',
};

function enabled(over: Partial<Parameters<typeof classifyIntelSourceAudit>[0]> = {}) {
  return classifyIntelSourceAudit({
    slug: 'lawfare',
    manifestEnabled: true,
    registryEnabled: true,
    fetchKind: 'rss',
    endpointUrl: 'https://www.lawfaremedia.org/feeds/articles',
    isCoreSource: false,
    staleThresholdMinutes: 90,
    lastRunStatus: 'success',
    lastRunFinishedAt: '2026-10-25T15:30:00.000Z',
    lastRunError: null,
    lastRunMeta: { outcome: 'items', httpStatus: 200, rawEntryCount: 2, itemsParsed: 2 },
    lastSuccessAt: '2026-10-25T15:30:00.000Z',
    lastFetchAt: '2026-10-25T15:30:00.000Z',
    newestPublishedAt: '2026-10-24T12:00:00.000Z',
    itemTotal: 10,
    items7d: 2,
    now: SUNDAY_NOON_ET,
    ...over,
  });
}

describe('federal business day', () => {
  it('treats the weekend and the pre-posting window as a closed Public Inspection desk', () => {
    expect(publicInspectionDeskClosed(SUNDAY_NOON_ET).closed).toBe(true);
    expect(publicInspectionDeskClosed(MONDAY_BEFORE_POSTING).closed).toBe(true);
    expect(publicInspectionDeskClosed(MONDAY_AFTER_POSTING).closed).toBe(false);
  });

  it('observes Independence Day 2026 on Friday because July 4 is a Saturday', () => {
    expect(isUsFederalHoliday(new Date('2026-07-03T16:00:00.000Z'))).toBe(true);
    expect(publicInspectionDeskClosed(new Date('2026-11-26T17:00:00.000Z')).closed).toBe(true);
  });
});

describe('Federal Register fixtures', () => {
  it('reads the overnight Public Inspection payload as a valid empty list', () => {
    const inspected = inspectFederalRegisterJson(JSON.stringify(PI_CLOSED), 'pre_publication');
    expect(inspected.outcome).toBe('valid_empty');
    expect(inspected.rawEntryCount).toBe(0);
    expect(inspected.normalizedCount).toBe(0);
    expect(inspected.unavailabilityMessage).toMatch(/Monday, October 26/);
  });

  it('keeps a published document with html_url and document_number', () => {
    const inspected = inspectFederalRegisterJson(
      JSON.stringify({ count: 1, results: [PUBLISHED_DOC] }),
      'published_document',
    );
    expect(inspected.outcome).toBe('items');
    expect(inspected.rawEntryCount).toBe(1);
    expect(inspected.normalizedCount).toBe(1);
    expect(inspected.items[0]?.canonicalUrl).toBe(PUBLISHED_DOC.html_url);
    expect(inspected.items[0]?.stateChangeType).toBe('published_document');
  });

  it('rejects a document that has neither a url nor a recoverable document number', () => {
    const inspected = inspectFederalRegisterJson(
      JSON.stringify({ count: 1, results: [{ title: 'Untitled filing', type: 'Notice' }] }),
      'pre_publication',
    );
    expect(inspected.outcome).toBe('normalization_failure');
    expect(inspected.rawEntryCount).toBe(1);
    expect(inspected.normalizedCount).toBe(0);
  });
});

describe('publisher RSS fixtures', () => {
  it('parses an American Oversight custom-post item and an empty Lawfare channel', async () => {
    const oversight = await parseRssXmlDetailed(
      `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0"><channel>
        <title>American Oversight</title>
        <link>https://americanoversight.org/</link>
        <item>
          <title>Investigating Who’s Meddling with the Midterms</title>
          <link>https://americanoversight.org/newsletter/tina-peters-election-administration-foia-10232026/</link>
          <pubDate>Fri, 23 Oct 2026 19:45:53 +0000</pubDate>
          <description><![CDATA[<p>Our investigation into Tina Peters’ access to top election officials.</p>]]></description>
        </item>
      </channel></rss>`,
      {
        sourceSlug: 'american-oversight',
        provenanceClass: 'SPECIALIST',
        contentUseMode: 'feed_summary',
        fetchKind: 'rss',
        deskLane: 'osint',
        sourceFamily: 'general',
      },
    );
    expect(oversight.rawEntryCount).toBe(1);
    expect(oversight.items).toHaveLength(1);
    expect(oversight.items[0]?.canonicalUrl).toContain('/newsletter/tina-peters');
    expect(oversight.items[0]?.publishedAt).toBeTruthy();

    const lawfare = await parseRssXmlDetailed(
      `<?xml version="1.0" encoding="utf-8"?><rss xmlns:a10="http://www.w3.org/2005/Atom" version="2.0"><channel><title>Articles</title><link>https://www.lawfaremedia.org/</link><description /><language>en</language></channel></rss>`,
      {
        sourceSlug: 'lawfare',
        provenanceClass: 'SPECIALIST',
        contentUseMode: 'feed_summary',
        fetchKind: 'rss',
        deskLane: 'osint',
        sourceFamily: 'general',
      },
    );
    expect(lawfare.bodyKind).toBe('xml');
    expect(lawfare.rawEntryCount).toBe(0);
    expect(lawfare.items).toHaveLength(0);

    const lawfareItem = await parseRssXmlDetailed(
      `<?xml version="1.0" encoding="utf-8"?><rss xmlns:a10="http://www.w3.org/2005/Atom" version="2.0"><channel><title>Articles</title><link>https://www.lawfaremedia.org/</link><description /><item><guid isPermaLink="false">urn:uuid:825c3fcd-511b-4afa-953e-c8a17eea934b</guid><author>Gregory Koblentz</author><title>Chemical Security Is National Security</title><description>The United States has halted funding for finding and destroying chemical weapons, putting critical work at risk.</description><pubDate>Sun, 25 Oct 2026 13:00:11 GMT</pubDate><link>https://www.lawfaremedia.org/article/chemical-security-is-national-security</link></item></channel></rss>`,
      {
        sourceSlug: 'lawfare',
        provenanceClass: 'SPECIALIST',
        contentUseMode: 'feed_summary',
        fetchKind: 'rss',
        deskLane: 'osint',
        sourceFamily: 'general',
      },
    );
    expect(lawfareItem.rawEntryCount).toBe(1);
    expect(lawfareItem.items).toHaveLength(1);
    expect(lawfareItem.items[0]?.canonicalUrl).toBe(
      'https://www.lawfaremedia.org/article/chemical-security-is-national-security',
    );
    expect(lawfareItem.items[0]?.publishedAt).toBeTruthy();
  });
});

describe('source health classification', () => {
  it('separates a successful fetch, a valid empty feed, parser failure, HTTP failure, access restriction, and a quiet publisher', () => {
    expect(enabled().statusBucket).toBe('enabled_healthy');

    const empty = enabled({
      lastRunMeta: { outcome: 'valid_empty', httpStatus: 200, rawEntryCount: 0, itemsParsed: 0 },
      newestPublishedAt: null,
      items7d: 0,
    });
    expect(empty.health).toBe('healthy');
    expect(empty.statusBucket).toBe('enabled_valid_empty');

    const pi = enabled({
      slug: 'fr-public-inspection',
      isCoreSource: true,
      itemTotal: 40,
      items7d: 0,
      newestPublishedAt: null,
      lastRunMeta: {
        outcome: 'valid_empty',
        httpStatus: 200,
        rawEntryCount: 0,
        itemsParsed: 0,
        piUnavailabilityMessage: PI_CLOSED.meta.pil_unavailability_message,
      },
    });
    expect(pi.health).toBe('healthy');
    expect(pi.statusBucket).toBe('enabled_valid_empty');
    expect(pi.healthReason).toMatch(/unavailable after 12AM/i);

    const parser = enabled({
      lastRunStatus: 'partial',
      lastRunError: 'Feed entries were present but none had a usable link',
      lastRunMeta: {
        httpStatus: 200,
        rawEntryCount: 4,
        itemsParsed: 0,
        failureCategory: 'parser_normalization_failure',
      },
      lastSuccessAt: null,
    });
    expect(parser.health).toBe('failing');
    expect(parser.statusBucket).toBe('enabled_parser_mismatch');

    const http = enabled({
      lastRunStatus: 'failed',
      lastRunError: 'HTTP 500 https://example.com/feed',
      lastRunMeta: { httpStatus: 500, failureCategory: 'http_5xx' },
      lastSuccessAt: null,
    });
    expect(http.statusBucket).toBe('enabled_failing');

    const legacyPi = enabled({
      slug: 'fr-public-inspection',
      isCoreSource: true,
      fetchKind: 'json_api',
      lastRunStatus: 'partial',
      lastRunError: 'JSON API parse returned 0 items',
      lastRunMeta: { httpStatus: 200, itemsParsed: 0 },
      lastSuccessAt: '2026-10-25T15:30:00.000Z',
      itemTotal: 40,
      items7d: 4,
      newestPublishedAt: null,
    });
    expect(legacyPi.health).toBe('healthy');
    expect(legacyPi.statusBucket).toBe('enabled_valid_empty');

    const blocked = enabled({
      slug: 'mag-972',
      lastRunStatus: 'failed',
      lastRunError: 'HTTP 403 https://www.972mag.com/feed/',
      lastRunMeta: { httpStatus: 403, failureCategory: 'http_403' },
      lastSuccessAt: null,
    });
    expect(blocked.statusBucket).toBe('enabled_blocked');
    expect(blocked.healthReason).toMatch(/Access restriction/);

    const quiet = enabled({
      newestPublishedAt: '2026-09-01T12:00:00.000Z',
      items7d: 0,
    });
    expect(quiet.statusBucket).toBe('enabled_not_publishing');
    expect(quiet.health).toBe('stale');
  });
});

describe('retired source rows stay in the manifest', () => {
  it('keeps retired slugs disabled instead of deleting their definitions', () => {
    const sources = getSignalSources();
    for (const slug of ['centcom-press', 'rappler', 'statements-public-import', 'robert-reich', 'dvids-sandbox']) {
      const source = sources.find((entry) => entry.slug === slug);
      expect(source, slug).toBeTruthy();
      expect(source?.isEnabled).toBe(false);
    }
  });
});

const live = process.env.INTEL_LIVE_FEED_CHECK === '1';
const INGEST_UA = 'Mozilla/5.0 (compatible; iamresist-intel/1.0; +https://www.iamresist.org/legal)';

async function fetchIngest(url: string) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, application/json;q=0.8, */*;q=0.5',
      'User-Agent': INGEST_UA,
    },
  });
  return { status: res.status, contentType: res.headers.get('content-type'), text: await res.text() };
}

describe.skipIf(!live)('live feeds with the ingest user-agent', () => {
  it('parses American Oversight, +972, Lawfare, and both Federal Register endpoints', async () => {
    const oversight = await fetchIngest(
      'https://americanoversight.org/feed/?post_type[]=analysis&post_type[]=investigation&post_type[]=litigation&post_type[]=press-release&post_type[]=newsletter&post_type[]=reports-and-features',
    );
    expect(oversight.status).toBe(200);
    const oversightParsed = await parseRssXmlDetailed(oversight.text, {
      sourceSlug: 'american-oversight',
      provenanceClass: 'SPECIALIST',
      contentUseMode: 'feed_summary',
      fetchKind: 'rss',
    });
    expect(oversightParsed.rawEntryCount).toBeGreaterThan(0);
    expect(oversightParsed.items.length).toBeGreaterThan(0);
    expect(oversightParsed.items.length).toBeLessThanOrEqual(oversightParsed.rawEntryCount);

    const mag = await fetchIngest('https://www.972mag.com/feed/');
    expect([200, 403]).toContain(mag.status);
    if (mag.status === 200) {
      const magParsed = await parseRssXmlDetailed(mag.text, {
        sourceSlug: 'mag-972',
        provenanceClass: 'SPECIALIST',
        contentUseMode: 'feed_summary',
        fetchKind: 'rss',
      });
      expect(magParsed.items.length).toBeGreaterThan(0);
    }

    const lawfare = await fetchIngest('https://www.lawfaremedia.org/feeds/articles');
    expect(lawfare.status).toBe(200);
    const lawfareParsed = await parseRssXmlDetailed(lawfare.text, {
      sourceSlug: 'lawfare',
      provenanceClass: 'SPECIALIST',
      contentUseMode: 'feed_summary',
      fetchKind: 'rss',
    });
    expect(lawfareParsed.bodyKind).toBe('xml');
    expect(lawfareParsed.items.length).toBeLessThanOrEqual(lawfareParsed.rawEntryCount);
    if (lawfareParsed.rawEntryCount === 0) {
      expect(lawfareParsed.items).toHaveLength(0);
    } else {
      expect(lawfareParsed.items.length).toBeGreaterThan(0);
      expect(lawfareParsed.items[0]?.canonicalUrl).toMatch(/^https:\/\/www\.lawfaremedia\.org\//);
    }

    const pi = await fetchIngest(
      'https://www.federalregister.gov/api/v1/public-inspection-documents.json?per_page=25&order=newest',
    );
    expect(pi.status).toBe(200);
    const piParsed = inspectFederalRegisterJson(pi.text, 'pre_publication');
    expect(piParsed.normalizedCount).toBeLessThanOrEqual(piParsed.rawEntryCount);
    if (piParsed.rawEntryCount === 0) expect(piParsed.outcome).toBe('valid_empty');
    else expect(piParsed.outcome).toBe('items');

    const published = await fetchIngest(
      'https://www.federalregister.gov/api/v1/documents.json?per_page=5&order=newest',
    );
    expect(published.status).toBe(200);
    const publishedParsed = inspectFederalRegisterJson(published.text, 'published_document');
    expect(publishedParsed.outcome).toBe('items');
    expect(publishedParsed.normalizedCount).toBeGreaterThan(0);
    expect(publishedParsed.items[0]?.canonicalUrl).toMatch(/^https?:\/\//);
  });
});
