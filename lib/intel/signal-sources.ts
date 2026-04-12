import 'server-only';

import type { SignalSourceConfig } from '@/lib/intel/types';

const WH_NEWS = 'https://www.whitehouse.gov/news/feed/';
const WH_PRESIDENTIAL = 'https://www.whitehouse.gov/presidential-actions/feed/';
const FR_PUBLISHED =
  'https://www.federalregister.gov/api/v1/documents.json?per_page=25&order=newest';
const FR_PI =
  'https://www.federalregister.gov/api/v1/public-inspection-documents.json?per_page=25&order=newest';
const GOVINFO_BILLS = 'https://www.govinfo.gov/rss/bills.xml';
/** Verified 200 OK; this is full CREC RSS — not the Daily Digest (crec-dd URL 404 on GovInfo). */
const GOVINFO_CREC = 'https://www.govinfo.gov/rss/crec.xml';
const SCOTUSBLOG = 'https://www.scotusblog.com/feed/';
const DEMOCRACY_DOCKET = 'https://www.democracydocket.com/feed/';

function envTrim(name: string): string | null {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') return null;
  return String(v).trim();
}

/**
 * Milestone 1 registry. Reuters/AP: set INTEL_REUTERS_RSS_URL / INTEL_AP_RSS_URL or sources stay disabled (fail closed).
 */
export function getSignalSources(): SignalSourceConfig[] {
  const reutersUrl = envTrim('INTEL_REUTERS_RSS_URL');
  const apUrl = envTrim('INTEL_AP_RSS_URL');

  return [
    {
      slug: 'wh-news',
      name: 'White House — News',
      provenanceClass: 'PRIMARY',
      fetchKind: 'rss',
      endpointUrl: WH_NEWS,
      isEnabled: true,
      isCoreSource: true,
      purpose: 'Official White House news and press releases as syndicated on whitehouse.gov.',
      trustedFor: 'Primary statements of administration messaging and links to published press materials.',
      notTrustedFor: 'Independent fact verification, statutory text, or court holdings.',
    },
    {
      slug: 'wh-presidential',
      name: 'White House — Presidential Actions',
      provenanceClass: 'PRIMARY',
      fetchKind: 'rss',
      endpointUrl: WH_PRESIDENTIAL,
      isEnabled: true,
      isCoreSource: true,
      purpose: 'Presidential actions and orders as published on the White House site feed.',
      trustedFor: 'Detecting new presidential actions and canonical links to official pages.',
      notTrustedFor: 'Legal analysis, judicial review, or final regulatory text.',
    },
    {
      slug: 'fr-public-inspection',
      name: 'Federal Register — Public Inspection',
      provenanceClass: 'PRIMARY',
      fetchKind: 'json_api',
      endpointUrl: FR_PI,
      isEnabled: true,
      isCoreSource: true,
      purpose: 'Federal Register Public Inspection filings before official publication.',
      trustedFor: 'Pre-publication regulatory and notice filings with FR metadata.',
      notTrustedFor: 'Final authoritative text; use the published Federal Register feed.',
    },
    {
      slug: 'fr-published',
      name: 'Federal Register — Published',
      provenanceClass: 'PRIMARY',
      fetchKind: 'json_api',
      endpointUrl: FR_PUBLISHED,
      isEnabled: true,
      isCoreSource: true,
      purpose: 'Official published Federal Register documents via the public API.',
      trustedFor: 'Published rules, notices, and documents with document numbers and HTML URLs.',
      notTrustedFor: 'Breaking narrative without reading the linked document.',
    },
    {
      slug: 'govinfo-bills',
      name: 'GovInfo — Bills (RSS)',
      provenanceClass: 'PRIMARY',
      fetchKind: 'rss',
      endpointUrl: GOVINFO_BILLS,
      isEnabled: true,
      isCoreSource: true,
      purpose: 'GovInfo RSS for bill-related packages and updates.',
      trustedFor: 'Legislative pointers and GovInfo bill syndication.',
      notTrustedFor: 'Floor outcomes or vote certainty without Congress.gov or the Record.',
    },
    {
      slug: 'govinfo-crec',
      name: 'GovInfo — Congressional Record (RSS)',
      provenanceClass: 'PRIMARY',
      fetchKind: 'rss',
      endpointUrl: GOVINFO_CREC,
      isEnabled: true,
      isCoreSource: true,
      purpose: 'Congressional Record material as published through GovInfo RSS.',
      trustedFor: 'Record pointers and GovInfo syndication of CREC content.',
      notTrustedFor: 'Substituting for every Congress.gov status edge case or same-day vote tabulation.',
      editorialNotes:
        'Full CREC RSS from GovInfo. A Daily Digest–specific RSS was not available at the crec-dd path (404); replace if GovInfo documents a DD feed.',
      notes:
        'Full CREC RSS from GovInfo. Daily Digest-specific RSS was not available at crec-dd path (404); replace if GovInfo documents a DD feed.',
    },
    {
      slug: 'reuters-wire',
      name: 'Reuters (wire)',
      provenanceClass: 'WIRE',
      fetchKind: 'rss',
      endpointUrl: reutersUrl,
      isEnabled: Boolean(reutersUrl),
      isCoreSource: false,
      purpose: 'Optional professional wire headlines when a licensed RSS endpoint is configured.',
      trustedFor: 'Fast, edited wire-format alerts for cross-check against primaries.',
      notTrustedFor: 'Replacing White House, Federal Register, GovInfo, or court primary documents.',
      editorialNotes:
        'Requires INTEL_REUTERS_RSS_URL. Omitted when unset so ingest does not substitute weaker sources.',
      notes: 'Requires INTEL_REUTERS_RSS_URL. Omitted when unset so ingest does not substitute weaker sources.',
    },
    {
      slug: 'ap-wire',
      name: 'Associated Press (wire)',
      provenanceClass: 'WIRE',
      fetchKind: 'rss',
      endpointUrl: apUrl,
      isEnabled: Boolean(apUrl),
      isCoreSource: false,
      purpose: 'Optional AP wire headlines when a licensed RSS endpoint is configured.',
      trustedFor: 'Wire-speed confirmation alongside institutional primaries.',
      notTrustedFor: 'Treating wire blurbs as substitutes for official documents or docket PDFs.',
      editorialNotes: 'Requires INTEL_AP_RSS_URL.',
      notes: 'Requires INTEL_AP_RSS_URL.',
    },
    {
      slug: 'scotusblog',
      name: 'SCOTUSblog',
      provenanceClass: 'SPECIALIST',
      fetchKind: 'rss',
      endpointUrl: SCOTUSBLOG,
      isEnabled: true,
      isCoreSource: false,
      purpose: 'Specialist coverage of Supreme Court docket activity and opinions.',
      trustedFor: 'Docket context and expert analysis around Court business.',
      notTrustedFor: 'Binding holdings; always use Court slip opinions and orders.',
    },
    {
      slug: 'democracy-docket',
      name: 'Democracy Docket',
      provenanceClass: 'SPECIALIST',
      fetchKind: 'rss',
      endpointUrl: DEMOCRACY_DOCKET,
      isEnabled: true,
      isCoreSource: false,
      purpose: 'Specialist election and voting-rights litigation reporting.',
      trustedFor: 'Case narrative and filings in the democracy and voting-rights space.',
      notTrustedFor: 'Final judicial disposition without the underlying court documents.',
    },
  ];
}
