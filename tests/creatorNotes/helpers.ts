import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTranscriptFilePayload } from '@/lib/creatorNotes/transcript';
import type { CreatorTranscriptInput, RawCreatorNote } from '@/lib/creatorNotes/types';

const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));

export function loadSyntheticTranscript(sourceItemId = 'source-item-1'): CreatorTranscriptInput {
  const raw = JSON.parse(
    readFileSync(join(FIXTURE_DIR, 'fixtures/synthetic-transcript.json'), 'utf8'),
  ) as unknown;
  return parseTranscriptFilePayload(raw, sourceItemId);
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
  },
  {
    kind: 'claim',
    startSeconds: 28,
    endSeconds: 46,
    text: 'The speaker says the order would have placed 2,000 troops under federal control in the city by the weekend.',
    attribution: 'David Pakman',
    eventFeatures: null,
  },
  {
    kind: 'context',
    startSeconds: 46,
    endSeconds: 68,
    text: 'A district judge had already temporarily restrained the same deployment last month after local officials sued.',
    attribution: null,
    eventFeatures: null,
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
  },
  {
    kind: 'creator_analysis',
    startSeconds: 92,
    endSeconds: 118,
    text: 'Pakman argues the administration is testing how far it can push domestic military deployments before courts intervene.',
    attribution: 'David Pakman',
    eventFeatures: null,
  },
  {
    kind: 'why_it_matters',
    startSeconds: 118,
    endSeconds: 142,
    text: 'Pakman says a lifted stay could let other cities face the same federalization playbook within days.',
    attribution: 'David Pakman',
    eventFeatures: null,
  },
  {
    kind: 'new_development',
    startSeconds: 12,
    endSeconds: 28,
    text: 'The speaker presents the Tuesday-night stay as a new development in the ongoing deployment fight.',
    attribution: null,
    eventFeatures: null,
  },
];

export function mockExtractChunk(notes: RawCreatorNote[] = SYNTHETIC_NOTES, rejected = 0) {
  return async () => ({ notes: [...notes], rejected });
}
