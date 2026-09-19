import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTranscriptFilePayload } from '@/lib/creatorNotes/transcript';
import type { CreatorTranscriptInput, RawCreatorNote } from '@/lib/creatorNotes/types';

const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string, sourceItemId: string): CreatorTranscriptInput {
  const raw = JSON.parse(readFileSync(join(FIXTURE_DIR, 'fixtures', name), 'utf8')) as unknown;
  return parseTranscriptFilePayload(raw, sourceItemId);
}

export function loadSyntheticTranscript(sourceItemId = 'source-item-1'): CreatorTranscriptInput {
  return loadFixture('synthetic-transcript.json', sourceItemId);
}

export function loadSpecificTranscript(sourceItemId = 'source-item-specific'): CreatorTranscriptInput {
  return loadFixture('specific-transcript.json', sourceItemId);
}

export const SYNTHETIC_NOTES: RawCreatorNote[] = [
  {
    kind: 'event',
    startSeconds: 12,
    endSeconds: 28,
    text: 'A federal appeals court issued a stay blocking the administration National Guard deployment order in Chicago.',
    attribution: null,
    eventFeatures: {
      actors: ['federal appeals court'],
      action: 'issued a stay',
      object: "National Guard deployment order",
      institutions: ['National Guard'],
      locations: ['Chicago'],
      referencedDocuments: [],
    },
    exactQuote:
      "A federal appeals court issued a stay late Tuesday blocking the administration's National Guard deployment order in Chicago.",
    sourceExcerpt: null,
    sourceSegmentIndexes: [1],
  },
  {
    kind: 'claim',
    startSeconds: 28,
    endSeconds: 46,
    text: 'The speaker says the order would have placed 2,000 troops under federal control in the city by the weekend.',
    attribution: 'David Pakman',
    eventFeatures: null,
    exactQuote:
      'The speaker says the order would have placed 2,000 troops under federal control inside the city by the weekend.',
    sourceExcerpt: null,
    sourceSegmentIndexes: [2],
  },
  {
    kind: 'context',
    startSeconds: 46,
    endSeconds: 68,
    text: 'A district judge had already temporarily restrained the same deployment last month after local officials sued.',
    attribution: null,
    eventFeatures: null,
    exactQuote:
      'a district judge had already temporarily restrained the same deployment last month after local officials sued.',
    sourceExcerpt: null,
    sourceSegmentIndexes: [3],
  },
  {
    kind: 'evidence_reference',
    startSeconds: 68,
    endSeconds: 92,
    text: 'The speaker cites a Congressional Research Service report on the Insurrection Act and a Seventh Circuit docket entry.',
    attribution: 'David Pakman',
    eventFeatures: {
      actors: [],
      action: null,
      object: null,
      institutions: ['Seventh Circuit'],
      locations: [],
      referencedDocuments: ['Congressional Research Service report on the Insurrection Act', 'Seventh Circuit docket entry'],
    },
    exactQuote:
      'Pakman points to a Congressional Research Service report on the Insurrection Act and to the Seventh Circuit docket entry from Tuesday night.',
    sourceExcerpt: null,
    sourceSegmentIndexes: [4],
  },
  {
    kind: 'creator_analysis',
    startSeconds: 92,
    endSeconds: 118,
    text: 'Pakman argues the administration is testing how far it can push domestic military deployments before courts intervene.',
    attribution: 'David Pakman',
    eventFeatures: null,
    exactQuote:
      'In my view, this is the administration testing how far it can push domestic military deployments before the courts slam the door.',
    sourceExcerpt: null,
    sourceSegmentIndexes: [5],
  },
  {
    kind: 'why_it_matters',
    startSeconds: 118,
    endSeconds: 142,
    text: 'Pakman says a lifted stay could let other cities face the same federalization playbook within days.',
    attribution: 'David Pakman',
    eventFeatures: null,
    exactQuote:
      'This matters because if the stay is lifted, other cities could see the same federalization playbook within days.',
    sourceExcerpt: null,
    sourceSegmentIndexes: [6],
  },
  {
    kind: 'new_development',
    startSeconds: 12,
    endSeconds: 28,
    text: 'The speaker presents the Tuesday-night stay as a new development in the ongoing deployment fight.',
    attribution: null,
    eventFeatures: null,
    exactQuote:
      "A federal appeals court issued a stay late Tuesday blocking the administration's National Guard deployment order in Chicago.",
    sourceExcerpt: null,
    sourceSegmentIndexes: [1],
  },
];

export const SPECIFIC_NOTES: RawCreatorNote[] = [
  {
    kind: 'event',
    startSeconds: 14,
    endSeconds: 38,
    text: 'On March 3, 2026, Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
    attribution: 'Riley Quinn',
    eventFeatures: {
      actors: ['Westmere County Court'],
      action: 'accepted a new filing',
      object: 'Calder v. Westmere Civic Board',
      institutions: ['Westmere County Court'],
      locations: ['Westmere'],
      referencedDocuments: [],
    },
    exactQuote:
      'On March 3, 2026, Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
    sourceExcerpt: null,
    sourceSegmentIndexes: [1],
  },
  {
    kind: 'claim',
    startSeconds: 38,
    endSeconds: 64,
    text: 'Riley Quinn says the Supplemental Declaration of Records Custodian Ellis Voss lists a $2.6 million no-bid Harborline water contract.',
    attribution: 'Riley Quinn',
    eventFeatures: {
      actors: ['Ellis Voss'],
      action: 'lists a no-bid contract',
      object: '$2.6 million no-bid Harborline water contract',
      institutions: ['Westmere Civic Board'],
      locations: [],
      referencedDocuments: ['Supplemental Declaration of Records Custodian Ellis Voss'],
    },
    exactQuote:
      'The filing is the Supplemental Declaration of Records Custodian Ellis Voss, and it lists a $2.6 million no-bid Harborline water contract.',
    sourceExcerpt: null,
    sourceSegmentIndexes: [2],
  },
  {
    kind: 'context',
    startSeconds: 64,
    endSeconds: 88,
    text: 'Calder v. Westmere Civic Board started last fall after the board closed the rate workshop in Westmere.',
    attribution: null,
    eventFeatures: null,
    exactQuote:
      'Calder v. Westmere Civic Board started last fall after the board closed the rate workshop in Westmere.',
    sourceExcerpt: null,
    sourceSegmentIndexes: [3],
  },
  {
    kind: 'evidence_reference',
    startSeconds: 88,
    endSeconds: 112,
    text: 'Quinn cites the Voss declaration and the March 3 docket entry from Westmere County Court.',
    attribution: 'Riley Quinn',
    eventFeatures: {
      actors: [],
      action: null,
      object: null,
      institutions: ['Westmere County Court'],
      locations: [],
      referencedDocuments: ['Voss declaration', 'March 3 docket entry'],
    },
    exactQuote: 'Quinn points to the Voss declaration and to the March 3 docket entry from Westmere County Court.',
    sourceExcerpt: null,
    sourceSegmentIndexes: [4],
  },
  {
    kind: 'creator_analysis',
    startSeconds: 112,
    endSeconds: 138,
    text: 'Quinn argues the Westmere Civic Board is using a protective-order request to hide the Harborline contract from public view.',
    attribution: 'Riley Quinn',
    eventFeatures: null,
    exactQuote:
      'In my view, the Westmere Civic Board is using a protective-order request to hide the Harborline contract itself from public view.',
    sourceExcerpt: null,
    sourceSegmentIndexes: [5],
  },
  {
    kind: 'why_it_matters',
    startSeconds: 138,
    endSeconds: 168,
    text: 'Quinn says if the court grants that motion, residents will not see the Harborline water-rate numbers before the April 12 vote.',
    attribution: 'Riley Quinn',
    eventFeatures: null,
    exactQuote:
      'This matters because if the court grants that motion, residents will not see the Harborline water-rate numbers before the April 12 vote.',
    sourceExcerpt: null,
    sourceSegmentIndexes: [6],
  },
  {
    kind: 'new_development',
    startSeconds: 14,
    endSeconds: 38,
    text: 'Quinn presents the March 3, 2026 Westmere County Court filing in Calder v. Westmere Civic Board as a new development.',
    attribution: 'Riley Quinn',
    eventFeatures: null,
    exactQuote:
      'On March 3, 2026, Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
    sourceExcerpt: null,
    sourceSegmentIndexes: [1],
  },
];

export function mockExtractChunk(notes: RawCreatorNote[] = SYNTHETIC_NOTES, rejected = 0) {
  return async () => ({
    notes: notes.map((note) => ({
      ...note,
      sourceExcerpt: 'MODEL-GENERATED EVIDENCE THAT MUST NOT SURVIVE',
      sourceSegmentIndexes: [...note.sourceSegmentIndexes],
    })),
    rejected,
  });
}
