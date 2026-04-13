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
const LAWFARE = 'https://www.lawfaremedia.org/feed/';
const PROPUBLICA = 'https://feeds.propublica.org/propublica/main';
const AMERICAN_OVERSIGHT = 'https://americanoversight.org/feed';
const COURIER_COVER_UP = 'https://thecoverupnewsletter.substack.com/feed';
const ROBERT_REICH = 'https://robertreich.substack.com/feed';
/** Substack-hosted podcast RSS (public). */
const ON_OFFENSE_PODCAST = 'https://api.substack.com/feed/podcast/3764927.rss';
const TOTAL_HYPOCRISY = 'https://totalhypocrisy.substack.com/feed';

/** Routine Federal Register / PI churn — suppressed from default desk surface (retained in DB). */
const FR_PROCEDURAL_BLOCK_KEYWORDS = [
  'sunshine act',
  'federal advisory committee',
  'agency information collection',
  'paperwork reduction act',
  'submission for omb review',
  'notice of submission for omb review',
  'renewal of previously approved',
  'delegation of authority',
  'charter filed',
  'charter renewal',
  'meeting notice',
  'public hearing',
  'national environmental policy act',
  'nepa scoping',
  'privacy act of 1974',
  'system of records',
  'rate adjustment',
  'postal service',
];

/**
 * Version-controlled registry. Reuters/AP: set INTEL_REUTERS_RSS_URL / INTEL_AP_RSS_URL or sources stay disabled (fail closed).
 */
export function getSignalSources(): SignalSourceConfig[] {

  return [
    {
      slug: 'wh-news',
      name: 'White House — News',
      provenanceClass: 'PRIMARY',
      fetchKind: 'rss',
      deskLane: 'osint',
      contentUseMode: 'feed_summary',
      endpointUrl: WH_NEWS,
      isEnabled: true,
      isCoreSource: true,
      purpose: 'Official White House news and press releases as syndicated on whitehouse.gov.',
      trustedFor: 'Primary statements of administration messaging and links to published press materials.',
      notTrustedFor: 'Independent fact verification, statutory text, or court holdings.',
      editorialControls: {
        defaultPriority: 52,
        preferredStateChangeTypes: ['press_statement'],
        blockKeywords: [
          'photo opportunity',
          'president trump welcomes',
          'president biden welcomes',
          'president trump honors',
          'participates in the swearing-in',
          'participates in a swearing-in',
          'easter egg roll',
          'pardon ceremony',
          'medal of freedom',
        ],
        allowKeywords: [
          'executive order',
          'national security',
          'immigration',
          'tariff',
          'federal workforce',
          'emergency',
        ],
        noiseNotes:
          'High share of ceremonial and photo-op posts; block list targets recurring low-materiality headlines.',
        relevanceNotes:
          'Allow keywords lightly boost substantive policy hooks; does not override provenance tier on the desk.',
      },
    },
    {
      slug: 'wh-presidential',
      name: 'White House — Presidential Actions',
      provenanceClass: 'PRIMARY',
      fetchKind: 'rss',
      deskLane: 'osint',
      contentUseMode: 'feed_summary',
      endpointUrl: WH_PRESIDENTIAL,
      isEnabled: true,
      isCoreSource: true,
      purpose: 'Presidential actions and orders as published on the White House site feed.',
      trustedFor: 'Detecting new presidential actions and canonical links to official pages.',
      notTrustedFor: 'Legal analysis, judicial review, or final regulatory text.',
      editorialControls: {
        defaultPriority: 64,
        preferredStateChangeTypes: ['presidential_action'],
        allowKeywords: [
          'executive order',
          'proclamation',
          'memorandum',
          'clemency',
          'pardon',
        ],
        relevanceNotes: 'Presidential-action feed; baseline priority above general WH news.',
      },
    },
    {
      slug: 'fr-public-inspection',
      name: 'Federal Register — Public Inspection',
      provenanceClass: 'PRIMARY',
      fetchKind: 'json_api',
      deskLane: 'osint',
      contentUseMode: 'feed_summary',
      endpointUrl: FR_PI,
      isEnabled: true,
      isCoreSource: true,
      purpose: 'Federal Register Public Inspection filings before official publication.',
      trustedFor: 'Pre-publication regulatory and notice filings with FR metadata.',
      notTrustedFor: 'Final authoritative text; use the published Federal Register feed.',
      editorialControls: {
        defaultPriority: 36,
        preferredStateChangeTypes: ['pre_publication'],
        blockKeywords: [...FR_PROCEDURAL_BLOCK_KEYWORDS],
        allowKeywords: ['proposed rule', 'interim final', 'executive order', 'sanctions', 'immigration'],
        noiseNotes:
          'Public Inspection is broad; procedural notices are suppressed so higher-signal filings surface first.',
      },
    },
    {
      slug: 'fr-published',
      name: 'Federal Register — Published',
      provenanceClass: 'PRIMARY',
      fetchKind: 'json_api',
      deskLane: 'osint',
      contentUseMode: 'feed_summary',
      endpointUrl: FR_PUBLISHED,
      isEnabled: true,
      isCoreSource: true,
      purpose: 'Official published Federal Register documents via the public API.',
      trustedFor: 'Published rules, notices, and documents with document numbers and HTML URLs.',
      notTrustedFor: 'Breaking narrative without reading the linked document.',
      editorialControls: {
        defaultPriority: 38,
        preferredStateChangeTypes: ['published_document'],
        blockKeywords: [...FR_PROCEDURAL_BLOCK_KEYWORDS],
        allowKeywords: [
          'final rule',
          'interim final rule',
          'executive order',
          'presidential document',
          'sanctions',
          'immigration',
          'securities',
        ],
        noiseNotes:
          'Published FR remains fully ingested; procedural / administrative notices are suppressed from the default desk.',
      },
    },
    {
      slug: 'govinfo-bills',
      name: 'GovInfo — Bills (RSS)',
      provenanceClass: 'PRIMARY',
      fetchKind: 'rss',
      deskLane: 'osint',
      contentUseMode: 'feed_summary',
      endpointUrl: GOVINFO_BILLS,
      isEnabled: true,
      isCoreSource: true,
      purpose: 'GovInfo RSS for bill-related packages and updates.',
      trustedFor: 'Legislative pointers and GovInfo bill syndication.',
      notTrustedFor: 'Floor outcomes or vote certainty without Congress.gov or the Record.',
      editorialControls: {
        defaultPriority: 44,
        preferredStateChangeTypes: ['legislative_feed_item'],
        noiseNotes:
          'RSS is volumetric; default priority below presidential actions and below specialist courts feeds.',
      },
    },
    {
      slug: 'govinfo-crec',
      name: 'GovInfo — Congressional Record (RSS)',
      provenanceClass: 'PRIMARY',
      fetchKind: 'rss',
      deskLane: 'osint',
      contentUseMode: 'feed_summary',
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
      editorialControls: {
        defaultPriority: 40,
        preferredStateChangeTypes: ['congressional_record_feed_item'],
        blockKeywords: ['prayer of the guest chaplain', 'adjournment'],
        noiseNotes: 'Full CREC RSS is extremely high volume; light block list for obvious procedural chaff.',
      },
    },
    {
      slug: 'scotusblog',
      name: 'SCOTUSblog',
      provenanceClass: 'SPECIALIST',
      fetchKind: 'rss',
      deskLane: 'osint',
      contentUseMode: 'feed_summary',
      endpointUrl: SCOTUSBLOG,
      isEnabled: true,
      isCoreSource: false,
      purpose: 'Specialist coverage of Supreme Court docket activity and opinions.',
      trustedFor: 'Docket context and expert analysis around Court business.',
      notTrustedFor: 'Binding holdings; always use Court slip opinions and orders.',
      editorialControls: {
        defaultPriority: 56,
        preferredStateChangeTypes: ['specialist_item'],
        allowKeywords: ['opinion', 'order', 'certiorari', 'argument'],
      },
    },
    {
      slug: 'democracy-docket',
      name: 'Democracy Docket',
      provenanceClass: 'SPECIALIST',
      fetchKind: 'rss',
      deskLane: 'osint',
      contentUseMode: 'feed_summary',
      endpointUrl: DEMOCRACY_DOCKET,
      isEnabled: true,
      isCoreSource: false,
      purpose: 'Specialist election and voting-rights litigation reporting.',
      trustedFor: 'Case narrative and filings in the democracy and voting-rights space.',
      notTrustedFor: 'Final judicial disposition without the underlying court documents.',
      editorialControls: {
        defaultPriority: 58,
        preferredStateChangeTypes: ['specialist_item'],
        allowKeywords: ['lawsuit', 'opinion', 'appeals', 'ballot', 'redistrict', 'voting'],
      },
    },
    {
      slug: 'lawfare',
      name: 'Lawfare',
      provenanceClass: 'SPECIALIST',
      fetchKind: 'rss',
      deskLane: 'osint',
      contentUseMode: 'feed_summary',
      endpointUrl: LAWFARE,
      isEnabled: true,
      isCoreSource: false,
      purpose: 'National security, courts, and executive-power legal analysis from Lawfare (public site RSS).',
      trustedFor: 'Timely specialist framing and links to primary documents cited in their coverage.',
      notTrustedFor: 'Substitute for court orders, statutes, or agency final rules.',
      editorialControls: {
        defaultPriority: 54,
        preferredStateChangeTypes: ['specialist_item'],
        allowKeywords: ['court', 'executive', 'congress', 'surveillance', 'election', 'immigration', 'DOJ'],
      },
    },
    {
      slug: 'propublica',
      name: 'ProPublica',
      provenanceClass: 'SPECIALIST',
      fetchKind: 'rss',
      deskLane: 'osint',
      contentUseMode: 'feed_summary',
      endpointUrl: PROPUBLICA,
      isEnabled: true,
      isCoreSource: false,
      purpose: 'Investigative reporting feed (nonprofit, public interest).',
      trustedFor: 'Leads and accountability journalism pointers with canonical article links.',
      notTrustedFor: 'Treating RSS blurbs alone as proof; always read the full investigation at ProPublica.',
      editorialControls: {
        defaultPriority: 57,
        preferredStateChangeTypes: ['specialist_item'],
        allowKeywords: ['lawsuit', 'records', 'court', 'Trump', 'agency', 'investigation'],
      },
    },
    {
      slug: 'american-oversight',
      name: 'American Oversight',
      provenanceClass: 'SPECIALIST',
      fetchKind: 'rss',
      deskLane: 'osint',
      contentUseMode: 'feed_summary',
      endpointUrl: AMERICAN_OVERSIGHT,
      isEnabled: true,
      isCoreSource: false,
      purpose: 'FOIA litigation and government accountability updates from American Oversight’s public feed.',
      trustedFor: 'Records-request narratives, lawsuit filings, and transparency campaign pointers.',
      notTrustedFor: 'Verified contents of unreleased records; read linked filings and releases.',
      editorialControls: {
        defaultPriority: 55,
        preferredStateChangeTypes: ['specialist_item'],
        allowKeywords: ['lawsuit', 'records', 'FOIA', 'transparency', 'court', 'ICE', 'DOJ'],
      },
    },
    {
      slug: 'courier-the-cover-up',
      name: 'The Cover-Up (COURIER / Substack)',
      provenanceClass: 'SPECIALIST',
      fetchKind: 'rss',
      deskLane: 'osint',
      contentUseMode: 'preview_and_link',
      endpointUrl: COURIER_COVER_UP,
      isEnabled: false,
      isCoreSource: false,
      purpose:
        'Optional specialist newsletter on Epstein accountability (public Substack RSS). Disabled by default for editorial sign-off.',
      trustedFor: 'Syndicated headlines and links to COURIER’s own publication.',
      notTrustedFor: 'Law enforcement evidence or complete document sets; not a substitute for court records.',
      editorialNotes: 'Enable in manifest after editorial review. Preview-and-link only.',
      editorialControls: {
        defaultPriority: 50,
        preferredStateChangeTypes: ['specialist_item'],
      },
    },
    {
      slug: 'epstein-coverup-named-unsupported',
      name: 'EpsteinCoverup (placeholder — unsupported)',
      provenanceClass: 'INDIE',
      fetchKind: 'unsupported',
      deskLane: 'osint',
      contentUseMode: 'manual_review',
      endpointUrl: null,
      isEnabled: false,
      isCoreSource: false,
      purpose:
        'Placeholder row: no single canonical “EpsteinCoverup” public feed was identified. Replace with a specific publisher URL if you adopt one.',
      trustedFor: 'Nothing automatically.',
      notTrustedFor: 'Any automated ingest until a vetted public feed endpoint is configured.',
      editorialNotes: 'Registry-only honesty marker; ingest skips this slug.',
    },
    {
      slug: 'robert-reich',
      name: 'Robert Reich (Substack)',
      provenanceClass: 'COMMENTARY',
      fetchKind: 'rss',
      deskLane: 'voices',
      contentUseMode: 'preview_and_link',
      endpointUrl: ROBERT_REICH,
      isEnabled: true,
      isCoreSource: false,
      purpose: 'Creator commentary and economic/political framing via public Substack RSS.',
      trustedFor: 'Interpretation hooks and pointers to the author’s own posts.',
      notTrustedFor: 'Primary government records, wire confirmation, or neutral fact baseline.',
      editorialControls: {
        defaultPriority: 46,
        preferredStateChangeTypes: ['commentary_item'],
        allowKeywords: ['Trump', 'democracy', 'economy', 'oligarch', 'worker'],
      },
    },
    {
      slug: 'on-offense-kris-goldsmith',
      name: 'On Offense with Kris Goldsmith (podcast RSS)',
      provenanceClass: 'COMMENTARY',
      fetchKind: 'podcast_rss',
      deskLane: 'voices',
      contentUseMode: 'preview_and_link',
      endpointUrl: ON_OFFENSE_PODCAST,
      isEnabled: true,
      isCoreSource: false,
      purpose: 'Public podcast feed (Substack-hosted RSS) for episode discovery and links to show notes.',
      trustedFor: 'Episode titles, dates, and canonical episode/show-note URLs.',
      notTrustedFor: 'Wire news or official documents; audio is consumed on the creator’s platform.',
      editorialControls: {
        defaultPriority: 48,
        preferredStateChangeTypes: ['commentary_item'],
      },
    },
    {
      slug: 'total-hypocrisy',
      name: 'Total Hypocrisy (Substack)',
      provenanceClass: 'COMMENTARY',
      fetchKind: 'rss',
      deskLane: 'voices',
      contentUseMode: 'preview_and_link',
      endpointUrl: TOTAL_HYPOCRISY,
      isEnabled: false,
      isCoreSource: false,
      purpose: 'Creator commentary via Substack public RSS when verified (enable after confirming feed returns items).',
      trustedFor: 'Syndicated post titles and links to Substack.',
      notTrustedFor: 'Patreon-exclusive audio without a separate public feed.',
      editorialNotes:
        'Disabled until feed is verified in production. Patreon-only podcast is not ingested here.',
      editorialControls: {
        defaultPriority: 45,
        preferredStateChangeTypes: ['commentary_item'],
      },
    },
  ];
}
