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
    },
    {
      slug: 'wh-presidential',
      name: 'White House — Presidential Actions',
      provenanceClass: 'PRIMARY',
      fetchKind: 'rss',
      endpointUrl: WH_PRESIDENTIAL,
      isEnabled: true,
    },
    {
      slug: 'fr-public-inspection',
      name: 'Federal Register — Public Inspection',
      provenanceClass: 'PRIMARY',
      fetchKind: 'json_api',
      endpointUrl: FR_PI,
      isEnabled: true,
    },
    {
      slug: 'fr-published',
      name: 'Federal Register — Published',
      provenanceClass: 'PRIMARY',
      fetchKind: 'json_api',
      endpointUrl: FR_PUBLISHED,
      isEnabled: true,
    },
    {
      slug: 'govinfo-bills',
      name: 'GovInfo — Bills (RSS)',
      provenanceClass: 'PRIMARY',
      fetchKind: 'rss',
      endpointUrl: GOVINFO_BILLS,
      isEnabled: true,
    },
    {
      slug: 'govinfo-crec',
      name: 'GovInfo — Congressional Record (RSS)',
      provenanceClass: 'PRIMARY',
      fetchKind: 'rss',
      endpointUrl: GOVINFO_CREC,
      isEnabled: true,
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
      notes: 'Requires INTEL_REUTERS_RSS_URL. Omitted when unset so ingest does not substitute weaker sources.',
    },
    {
      slug: 'ap-wire',
      name: 'Associated Press (wire)',
      provenanceClass: 'WIRE',
      fetchKind: 'rss',
      endpointUrl: apUrl,
      isEnabled: Boolean(apUrl),
      notes: 'Requires INTEL_AP_RSS_URL.',
    },
    {
      slug: 'scotusblog',
      name: 'SCOTUSblog',
      provenanceClass: 'SPECIALIST',
      fetchKind: 'rss',
      endpointUrl: SCOTUSBLOG,
      isEnabled: true,
    },
    {
      slug: 'democracy-docket',
      name: 'Democracy Docket',
      provenanceClass: 'SPECIALIST',
      fetchKind: 'rss',
      endpointUrl: DEMOCRACY_DOCKET,
      isEnabled: true,
    },
  ];
}
