import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { chunkCreatorTranscript } from '@/lib/creatorNotes/chunk';
import {
  CREATOR_NOTE_KINDS,
  CREATOR_NOTE_EXTRACTION_VERSION,
} from '@/lib/creatorNotes/constants';
import { createMemoryCreatorNotesStore } from '@/lib/creatorNotes/db';
import { formatCreatorNotesReport, formatNotePreview, parseCreatorNotesExtractArgs } from '@/lib/creatorNotes/format';
import {
  creatorNoteFingerprint,
  hashCreatorTranscript,
  isUuid,
  serializeTranscriptForHash,
} from '@/lib/creatorNotes/identity';
import { loadCreatorSourceMetadata, shouldLookupCreatorSourceMetadata } from '@/lib/creatorNotes/source';
import { defaultVerificationStatus, dedupeRawCreatorNotes, toAtomicNotes } from '@/lib/creatorNotes/postprocess';
import { buildCreatorNoteMessages, CREATOR_NOTE_SYSTEM_PROMPT } from '@/lib/creatorNotes/prompt';
import { runCreatorNoteExtraction } from '@/lib/creatorNotes/run';
import { parseTranscriptFilePayload, mergeTranscriptMetadata } from '@/lib/creatorNotes/transcript';
import type { CreatorNoteRun, RawCreatorNote } from '@/lib/creatorNotes/types';
import { parseCreatorNotesOutput, parseEventFeatures, validateRawCreatorNote } from '@/lib/creatorNotes/validate';
import { loadSpecificTranscript, loadSyntheticTranscript, mockExtractChunk, SPECIFIC_NOTES, SYNTHETIC_NOTES } from './helpers';

const TEST_AI = {
  provider: 'test',
  model: 'test-model',
  baseUrl: 'http://127.0.0.1:9',
  timeoutMs: 1,
  retries: 0,
};

function ids(prefix: string) {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

const CALIBRATION_SOURCE_ID = 'calibration-david-pakman-2026-09-17';
const INTEL_SOURCE_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function missingCreatorNotesStore() {
  return {
    findEquivalentSuccessRun: vi.fn(async () => {
      throw new Error("Could not find the table 'intel.creator_note_runs' in the schema cache");
    }),
    insertRun: vi.fn(async () => {
      throw new Error("Could not find the table 'intel.creator_note_runs' in the schema cache");
    }),
    updateRun: vi.fn(async () => {
      throw new Error("Could not find the table 'intel.creator_note_runs' in the schema cache");
    }),
    insertNotes: vi.fn(async () => {
      throw new Error("Could not find the table 'intel.creator_atomic_notes' in the schema cache");
    }),
  };
}

describe('Atomic Creator Notes identity', () => {
  it('hashes the same normalized transcript identically', () => {
    const transcript = loadSyntheticTranscript();
    const a = hashCreatorTranscript(transcript.segments);
    const b = hashCreatorTranscript(
      transcript.segments.map((segment) => ({
        ...segment,
        text: `  ${segment.text.replace(/\n/g, '\r\n')}  `,
      })),
    );
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(serializeTranscriptForHash(transcript.segments)).not.toContain('\r');
  });

  it('changes the hash when transcript content changes', () => {
    const transcript = loadSyntheticTranscript();
    const original = hashCreatorTranscript(transcript.segments);
    const changed = hashCreatorTranscript([
      ...transcript.segments.slice(0, -1),
      { ...transcript.segments[transcript.segments.length - 1], text: 'A meaningfully different closing line about the case.' },
    ]);
    expect(changed).not.toBe(original);
  });

  it('treats only RFC-style UUID strings as UUIDs', () => {
    expect(isUuid(INTEL_SOURCE_UUID)).toBe(true);
    expect(isUuid('  550e8400-e29b-41d4-a716-446655440000  ')).toBe(true);
    expect(isUuid(CALIBRATION_SOURCE_ID)).toBe(false);
    expect(isUuid('source-item-1')).toBe(false);
    expect(isUuid('')).toBe(false);
  });

  it('fingerprints the same note identically', () => {
    const note = SYNTHETIC_NOTES[0];
    const a = creatorNoteFingerprint({
      sourceItemId: 'abc',
      kind: note.kind,
      text: ` ${note.text} `,
      startSeconds: note.startSeconds,
    });
    const b = creatorNoteFingerprint({
      sourceItemId: 'abc',
      kind: note.kind,
      text: note.text,
      startSeconds: note.startSeconds,
    });
    expect(a).toBe(b);
  });
});

describe('Atomic Creator Notes validation', () => {
  it('rejects a negative timestamp', () => {
    expect(() =>
      validateRawCreatorNote({
        kind: 'event',
        text: 'A federal court issued a new order in the case.',
        startSeconds: -1,
      }),
    ).toThrow(/startSeconds_negative/);
  });

  it('rejects endSeconds before startSeconds', () => {
    expect(() =>
      validateRawCreatorNote({
        kind: 'event',
        text: 'A federal court issued a new order in the case.',
        startSeconds: 40,
        endSeconds: 12,
      }),
    ).toThrow(/end_before_start/);
  });

  it('rejects creator_analysis without attribution', () => {
    expect(() =>
      validateRawCreatorNote({
        kind: 'creator_analysis',
        text: 'The speaker thinks the court is overreaching its authority here.',
      }),
    ).toThrow(/attribution_required/);
  });

  it('replaces generic speaker attribution with the known creator name', () => {
    const note = validateRawCreatorNote(
      {
        kind: 'why_it_matters',
        text: 'Pakman says a lifted stay could let other cities face the same playbook.',
        attribution: 'The speaker',
      },
      { knownCreatorName: 'David Pakman', segmentCount: 9 },
    );
    expect(note.attribution).toBe('David Pakman');
  });

  it('keeps a named guest attribution even when a creator name is known', () => {
    const note = validateRawCreatorNote(
      {
        kind: 'claim',
        text: 'Jordan Hale says the Westmere filing lists a $2.6 million Harborline contract.',
        attribution: 'Jordan Hale',
      },
      { knownCreatorName: 'David Pakman', segmentCount: 9 },
    );
    expect(note.attribution).toBe('Jordan Hale');
  });

  it('rejects an invalid kind', () => {
    expect(() =>
      validateRawCreatorNote({
        kind: 'hot_take',
        text: 'A federal court issued a new order in the case.',
      }),
    ).toThrow(/kind_invalid/);
  });

  it('keeps valid notes when a sibling note is malformed', () => {
    const parsed = parseCreatorNotesOutput(
      JSON.stringify({
        notes: [
          {
            kind: 'event',
            startSeconds: 12,
            endSeconds: 28,
            text: 'A federal appeals court issued a stay blocking the deployment order.',
          },
          { kind: 'nope', text: 'this should not pass validation at all' },
          {
            kind: 'claim',
            startSeconds: 28,
            endSeconds: 40,
            text: 'The speaker says two thousand troops would have been federalized.',
            attribution: 'David Pakman',
            verificationStatus: 'supported',
          },
        ],
      }),
      { knownCreatorName: 'David Pakman' },
    );
    expect(parsed.notes).toHaveLength(2);
    expect(parsed.rejected).toBe(1);
    expect(parsed.notes.map((note) => note.kind)).toEqual(['event', 'claim']);
  });

  it('normalizes case-insensitive event feature duplicates', () => {
    const features = parseEventFeatures({
      actors: ['Seventh Circuit', 'seventh circuit', 'SEVENTH CIRCUIT'],
      action: 'issued a stay',
      object: 'deployment order',
      institutions: ['National Guard', 'national guard'],
      locations: ['Chicago', 'chicago'],
      referencedDocuments: ['CRS report', 'crs report'],
    });
    expect(features?.actors).toEqual(['Seventh Circuit']);
    expect(features?.institutions).toEqual(['National Guard']);
    expect(features?.locations).toEqual(['Chicago']);
    expect(features?.referencedDocuments).toEqual(['CRS report']);
  });

  it('defaults verification without trusting model world knowledge', () => {
    expect(defaultVerificationStatus('claim')).toBe('unverified');
    expect(defaultVerificationStatus('event')).toBe('unverified');
    expect(defaultVerificationStatus('context')).toBe('unverified');
    expect(defaultVerificationStatus('new_development')).toBe('unverified');
    expect(defaultVerificationStatus('creator_analysis')).toBe('not_applicable');
    expect(defaultVerificationStatus('why_it_matters')).toBe('not_applicable');
    expect(defaultVerificationStatus('evidence_reference')).toBe('not_applicable');

    const notes = toAtomicNotes({
      notes: SYNTHETIC_NOTES,
      sourceItemId: 'source-item-1',
      creatorId: 'david-pakman',
      extractionRunId: 'run-1',
      createdAt: '2026-09-17T20:00:00.000Z',
      idFactory: ids('note'),
    });
    expect(notes.find((note) => note.kind === 'claim')?.verificationStatus).toBe('unverified');
    expect(notes.find((note) => note.kind === 'creator_analysis')?.verificationStatus).toBe('not_applicable');
    expect(notes.find((note) => note.kind === 'why_it_matters')?.verificationStatus).toBe('not_applicable');
    expect(notes.every((note) => note.verificationStatus !== 'supported')).toBe(true);
    expect(notes.find((note) => note.kind === 'event')?.exactQuote).toContain('National Guard');
    expect(notes.find((note) => note.kind === 'event')?.sourceSegmentIndexes).toEqual([1]);
  });

  it('rejects invalid source segment indexes', () => {
    expect(() =>
      validateRawCreatorNote(
        {
          kind: 'event',
          text: 'Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
          sourceSegmentIndexes: [99],
        },
        { segmentCount: 9 },
      ),
    ).toThrow(/source_segment_index_out_of_bounds/);
    expect(() =>
      validateRawCreatorNote(
        {
          kind: 'event',
          text: 'Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
          sourceSegmentIndexes: [-1],
        },
        { segmentCount: 9 },
      ),
    ).toThrow(/source_segment_index_negative/);
    const parsed = parseCreatorNotesOutput(
      JSON.stringify({
        notes: [
          {
            kind: 'event',
            text: 'Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
            sourceSegmentIndexes: [1.5],
          },
        ],
      }),
      { segmentCount: 9 },
    );
    expect(parsed.notes).toHaveLength(0);
    expect(parsed.rejected).toBe(1);
  });

  it('does not reject a note because exactQuote is still unverified at parse time', () => {
    const parsed = parseCreatorNotesOutput(
      JSON.stringify({
        notes: [
          {
            kind: 'event',
            text: 'Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
            exactQuote: 'This fabricated sentence is not in the transcript.',
            sourceSegmentIndexes: [1],
          },
        ],
      }),
      { segmentCount: 9, knownCreatorName: 'Riley Quinn' },
    );
    expect(parsed.notes).toHaveLength(1);
    expect(parsed.notes[0].exactQuote).toBe('This fabricated sentence is not in the transcript.');
  });
});

describe('Atomic Creator Notes postprocess', () => {
  it('collapses chunk-overlap duplicate notes', () => {
    const overlap: RawCreatorNote[] = [
      {
        kind: 'event',
        startSeconds: 12,
        endSeconds: 28,
        text: 'A federal appeals court issued a stay blocking the deployment order in Chicago.',
        attribution: null,
        eventFeatures: null,
        exactQuote: null,
        sourceExcerpt: null,
        sourceSegmentIndexes: [1],
      },
      {
        kind: 'event',
        startSeconds: 14,
        endSeconds: 30,
        text: 'A federal appeals court issued a stay blocking the deployment order in Chicago.',
        attribution: null,
        eventFeatures: null,
        exactQuote: null,
        sourceExcerpt: null,
        sourceSegmentIndexes: [1],
      },
      {
        kind: 'claim',
        startSeconds: 28,
        endSeconds: 40,
        text: 'The speaker says two thousand troops would have been federalized this weekend.',
        attribution: 'David Pakman',
        eventFeatures: null,
        exactQuote: null,
        sourceExcerpt: null,
        sourceSegmentIndexes: [2],
      },
    ];
    const result = dedupeRawCreatorNotes(overlap);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.notes).toHaveLength(2);
    expect(result.notes[0].startSeconds).toBe(12);
  });
});

describe('Atomic Creator Notes chunking', () => {
  it('keeps whole segments together under the character budget', () => {
    const chunks = chunkCreatorTranscript(loadSyntheticTranscript().segments, {
      chunkChars: 400,
      overlapChars: 80,
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1].segments.some((segment) => chunks[0].segments.includes(segment) || chunks[0].segments.some((prior) => prior.text === segment.text))).toBe(true);
    expect(chunks.every((chunk) => chunk.segments.every((segment) => segment.text.length > 0))).toBe(true);
  });

  it('preserves original transcript segment indexes across overlapping chunks', () => {
    const segments = Array.from({ length: 12 }, (_, index) => ({
      index,
      startSeconds: index * 10,
      endSeconds: index * 10 + 8,
      text: `Original segment ${index} discusses the Westmere filing without being split.`,
    }));
    const chunks = chunkCreatorTranscript(segments, { chunkChars: 220, overlapChars: 80 });
    expect(chunks.length).toBeGreaterThan(1);
    const firstIndexes = chunks[0].segments.map((segment) => segment.index);
    const overlapIndexes = chunks[1].segments.map((segment) => segment.index).filter((index) => firstIndexes.includes(index));
    expect(overlapIndexes.length).toBeGreaterThan(0);
    expect(chunks[0].segmentIndexes.every((index) => firstIndexes.includes(index))).toBe(true);
    for (const chunk of chunks) {
      for (const segment of chunk.segments) {
        expect(segment.index).toBe(segments[segment.index].index);
        expect(segment.text).toBe(segments[segment.index].text);
      }
    }
  });
});

describe('Atomic Creator Notes prompt contract', () => {
  it('can represent every note kind from the synthetic fixture', () => {
    const transcript = loadSyntheticTranscript();
    const joined = transcript.segments.map((segment) => segment.text).join(' ');
    expect(joined).toMatch(/welcome back/i);
    expect(joined).toMatch(/federal appeals court issued a stay/i);
    expect(joined).toMatch(/2,000 troops/i);
    expect(joined).toMatch(/district judge/i);
    expect(joined).toMatch(/Congressional Research Service/i);
    expect(joined).toMatch(/In my view/i);
    expect(joined).toMatch(/This matters because/i);
    expect(joined).toMatch(/sponsor/i);

    expect(SYNTHETIC_NOTES.map((note) => note.kind).sort()).toEqual([...CREATOR_NOTE_KINDS].sort());
    const messages = buildCreatorNoteMessages({
      transcript,
      chunk: chunkCreatorTranscript(transcript.segments)[0],
      chunkCount: 1,
    });
    expect(CREATOR_NOTE_SYSTEM_PROMPT).toContain('Do not infer event identity solely from the episode title');
    expect(CREATOR_NOTE_SYSTEM_PROMPT).toContain(
      'Do not use the episode title or other source metadata as Atomic Note content unless those words also occur in this evidence window.',
    );
    expect(CREATOR_NOTE_SYSTEM_PROMPT).toContain('Do not paraphrase evidence as a quotation');
    expect(CREATOR_NOTE_SYSTEM_PROMPT).toContain('Do not invent or reconstruct quotations');
    expect(CREATOR_NOTE_SYSTEM_PROMPT).toContain('Do not unnecessarily generalize');
    expect(CREATOR_NOTE_SYSTEM_PROMPT).toContain('Do not convert analysis into EVENT merely because it concerns an event');
    expect(CREATOR_NOTE_SYSTEM_PROMPT).toContain('Returning an empty notes array is valid');
    expect(CREATOR_NOTE_SYSTEM_PROMPT).toContain('Do not return transcript segment indexes');
    expect(messages[1].content).toContain('creator_analysis != fact');
    expect(messages[1].content).toContain('Do not convert analysis into EVENT merely because it concerns an event');
    expect(messages[1].content).toContain('sourceQuote');
    expect(messages[1].content).toContain('Do not return sourceSegmentIndexes');
    expect(messages[1].content).toContain('Do not paraphrase evidence as a quotation');
    expect(messages[1].content).toContain('A federal appeals court issued a stay');
    expect(messages[1].content).toContain('named people');
    expect(messages[1].content).toContain('Do not unnecessarily generalize');
    expect(messages[1].content).toContain('David Pakman');
    expect(messages[1].content).toContain('{"notes":[]} is valid');
    for (const kind of CREATOR_NOTE_KINDS) {
      expect(messages[1].content).toContain(kind);
    }
  });
});

describe('Atomic Creator Notes CLI args', () => {
  it('parses extract flags', () => {
    expect(
      parseCreatorNotesExtractArgs([
        '--source-item',
        '123',
        '--transcript-file',
        './tmp/transcript.json',
        '--dry-run',
        '--force',
        '--limit-notes',
        '8',
        '--json',
      ]),
    ).toEqual({
      sourceItemId: '123',
      transcriptFile: './tmp/transcript.json',
      dryRun: true,
      force: true,
      limitNotes: 8,
      json: true,
      creatorName: null,
      sourceTitle: null,
      sourceUrl: null,
      maxWindows: null,
      windowOffset: null,
      bypassExtractionCache: true,
      contentRoleDiagnostics: false,
    });
  });

  it('parses --window-offset with --max-windows', () => {
    expect(
      parseCreatorNotesExtractArgs([
        '--source-item',
        '123',
        '--transcript-file',
        './tmp/transcript.json',
        '--window-offset',
        '6',
        '--max-windows',
        '6',
      ]),
    ).toMatchObject({
      maxWindows: 6,
      windowOffset: 6,
    });
  });

  it('parses optional dry-run source metadata flags', () => {
    expect(
      parseCreatorNotesExtractArgs([
        '--source-item',
        'calibration-david-pakman-2026-09-17',
        '--transcript-file',
        './tmp/creator-notes-calibration.json',
        '--dry-run',
        '--creator-name',
        'David Pakman',
        '--source-title',
        'Calibration segment',
        '--source-url',
        'https://example.test/calibration',
      ]),
    ).toEqual({
      sourceItemId: 'calibration-david-pakman-2026-09-17',
      transcriptFile: './tmp/creator-notes-calibration.json',
      dryRun: true,
      force: false,
      limitNotes: null,
      json: false,
      creatorName: 'David Pakman',
      sourceTitle: 'Calibration segment',
      sourceUrl: 'https://example.test/calibration',
      maxWindows: null,
      windowOffset: null,
      bypassExtractionCache: false,
      contentRoleDiagnostics: false,
    });
  });

  it('formats transcript evidence, note, and source segments without duplicating an identical quote', () => {
    const withExcerpt = formatNotePreview({
      id: 'n1',
      sourceItemId: 's1',
      creatorId: 'riley-quinn',
      startSeconds: 90,
      endSeconds: 118,
      kind: 'creator_analysis',
      text: 'Quinn interprets the development as politically significant and discusses its potential consequences.',
      attribution: 'David Pakman',
      eventFeatures: null,
      sourceExcerpt:
        'The speaker argues that the development is politically significant, while making clear that this is their interpretation of the consequences.',
      exactQuote:
        'The speaker argues that the development is politically significant, while making clear that this is their interpretation of the consequences.',
      sourceSegmentIndexes: [3],
      verificationStatus: 'not_applicable',
      extractionRunId: 'run-1',
      noteFingerprint: 'fp',
      createdAt: '2026-09-17T20:00:00.000Z',
    });
    expect(withExcerpt).toContain('[00:01:30–00:01:58] CREATOR ANALYSIS — David Pakman');
    expect(withExcerpt).toContain('Evidence:');
    expect(withExcerpt).toContain(
      'The speaker argues that the development is politically significant, while making clear that this is their interpretation of the consequences.',
    );
    expect(withExcerpt).toContain('Note:');
    expect(withExcerpt).toContain('Source segments: 3');
    expect(withExcerpt).toContain('Source quote:');
    expect(withExcerpt).toContain('Source segments: 3');
    expect(withExcerpt).toContain('Evidence duration:');
    expect(withExcerpt).not.toContain('eventFeatures');

    const withNarrowQuote = formatNotePreview({
      id: 'n1b',
      sourceItemId: 's1',
      creatorId: 'riley-quinn',
      startSeconds: 877,
      endSeconds: 890,
      kind: 'why_it_matters',
      text: 'Quinn says if the court grants that motion, residents will not see the Harborline water-rate numbers before the April 12 vote.',
      attribution: 'Riley Quinn',
      eventFeatures: null,
      sourceExcerpt:
        'This matters because if the court grants that motion, residents will not see the Harborline water-rate numbers before the April 12 vote. That is why the April hearing is the live fight.',
      exactQuote:
        'This matters because if the court grants that motion, residents will not see the Harborline water-rate numbers before the April 12 vote.',
      sourceSegmentIndexes: [17, 18],
      verificationStatus: 'not_applicable',
      extractionRunId: 'run-1',
      noteFingerprint: 'fp',
      createdAt: '2026-09-17T20:00:00.000Z',
    });
    expect(withNarrowQuote).toContain('Evidence:');
    expect(withNarrowQuote).toContain('Source quote:');
    expect(withNarrowQuote).toContain('Source segments: 17, 18');

    const withoutExcerpt = formatNotePreview({
      id: 'n2',
      sourceItemId: 's1',
      creatorId: null,
      startSeconds: 0,
      endSeconds: 10,
      kind: 'event',
      text: 'Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
      attribution: 'Riley Quinn',
      eventFeatures: null,
      sourceExcerpt: null,
      exactQuote: null,
      sourceSegmentIndexes: [],
      verificationStatus: 'unverified',
      extractionRunId: 'run-1',
      noteFingerprint: 'fp2',
      createdAt: '2026-09-17T20:00:00.000Z',
    });
    expect(withoutExcerpt).toContain('Evidence: (not available)');
    expect(withoutExcerpt).toContain('Source segments: (none)');
    expect(withoutExcerpt).not.toContain('Quote: (not available)');
  });
});

describe('Atomic Creator Notes run', () => {
  it('skips persistence when an equivalent successful run exists', async () => {
    const transcript = loadSyntheticTranscript();
    const prior: CreatorNoteRun = {
      id: 'run-prior',
      sourceItemId: transcript.sourceItemId,
      sourceIdentityKey: null,
      creatorId: transcript.creatorId,
      modelProvider: 'test',
      modelName: 'test-model',
      extractionVersion: CREATOR_NOTE_EXTRACTION_VERSION,
      transcriptHash: hashCreatorTranscript(transcript.segments),
      status: 'success',
      inputChars: 100,
      notesCreated: 6,
      startedAt: '2026-09-17T19:00:00.000Z',
      completedAt: '2026-09-17T19:01:00.000Z',
      errorMessage: null,
      createdAt: '2026-09-17T19:00:00.000Z',
    };
    const store = createMemoryCreatorNotesStore({ runs: [prior] });
    const findEquivalent = vi.spyOn(store, 'findEquivalentSuccessRun');
    const result = await runCreatorNoteExtraction(
      { transcript },
      { store, extractChunk: mockExtractChunk(), aiConfig: TEST_AI, id: ids('id'), log: () => {} },
    );
    expect(findEquivalent).toHaveBeenCalledTimes(1);
    expect(result.persistence.status).toBe('skipped');
    expect(result.persistence.notesWritten).toBe(0);
    expect(store.writeCount()).toBe(0);
    expect(store.notes).toHaveLength(0);
  });

  it('allows --force to create a new extraction run', async () => {
    const transcript = loadSyntheticTranscript();
    const prior: CreatorNoteRun = {
      id: 'run-prior',
      sourceItemId: transcript.sourceItemId,
      sourceIdentityKey: null,
      creatorId: transcript.creatorId,
      modelProvider: 'test',
      modelName: 'test-model',
      extractionVersion: CREATOR_NOTE_EXTRACTION_VERSION,
      transcriptHash: hashCreatorTranscript(transcript.segments),
      status: 'success',
      inputChars: 100,
      notesCreated: 6,
      startedAt: '2026-09-17T19:00:00.000Z',
      completedAt: '2026-09-17T19:01:00.000Z',
      errorMessage: null,
      createdAt: '2026-09-17T19:00:00.000Z',
    };
    const store = createMemoryCreatorNotesStore({ runs: [prior] });
    const findEquivalent = vi.spyOn(store, 'findEquivalentSuccessRun');
    const result = await runCreatorNoteExtraction(
      { transcript, force: true },
      { store, extractChunk: mockExtractChunk(), aiConfig: TEST_AI, id: ids('force'), log: () => {} },
    );
    expect(findEquivalent).toHaveBeenCalledTimes(1);
    expect(result.persistence.status).toBe('success');
    expect(result.persistence.priorEquivalentRunId).toBe('run-prior');
    expect(result.persistence.runId).not.toBe('run-prior');
    expect(store.runs).toHaveLength(2);
    expect(store.notes.length).toBeGreaterThan(0);
  });

  it('performs zero creator-notes queries on dry-run', async () => {
    const store = missingCreatorNotesStore();
    const result = await runCreatorNoteExtraction(
      { transcript: loadSyntheticTranscript(CALIBRATION_SOURCE_ID), dryRun: true },
      { store, extractChunk: mockExtractChunk(), aiConfig: TEST_AI, id: ids('dry'), log: () => {} },
    );
    expect(store.findEquivalentSuccessRun).not.toHaveBeenCalled();
    expect(store.insertRun).not.toHaveBeenCalled();
    expect(store.updateRun).not.toHaveBeenCalled();
    expect(store.insertNotes).not.toHaveBeenCalled();
    expect(result.persistence.dryRun).toBe(true);
    expect(result.persistence.priorEquivalentRunId).toBeNull();
    expect(result.persistence.notesWritten).toBe(0);
    expect(result.persistence.runId).toBeNull();
    expect(result.source.sourceItemId).toBe(CALIBRATION_SOURCE_ID);
    expect(result.notes.length).toBeGreaterThan(0);

    const report = formatCreatorNotesReport(result);
    expect(report).toContain('prior equivalent run: skipped (dry-run)');
    expect(report).toContain('run id: (none)');
    expect(report).toContain('notes written: 0');
    expect(report).toContain('notes with source evidence:');
    expect(report).toContain('notes without source evidence:');
    expect(report).toContain('invalid source segment references:');
    expect(report).toContain('exact quotes requested:');
    expect(report).toContain('exact quotes verified:');
    expect(report).toContain('exact quotes rejected:');
    expect(report).toContain('Evidence:');
    expect(report).toContain('Note:');
    expect(report).toContain('Source segments:');
    expect(report).not.toContain('eventFeatures: null');
  });

  it('dry-runs without a creator-notes store when tables do not exist', async () => {
    const result = await runCreatorNoteExtraction(
      { transcript: loadSyntheticTranscript(CALIBRATION_SOURCE_ID), dryRun: true },
      { extractChunk: mockExtractChunk(), aiConfig: TEST_AI, id: ids('dry-nostore'), log: () => {} },
    );
    expect(result.persistence.dryRun).toBe(true);
    expect(result.persistence.runId).toBeNull();
    expect(result.persistence.notesWritten).toBe(0);
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it('still requires creator-notes persistence infrastructure for persisted runs', async () => {
    const store = missingCreatorNotesStore();
    await expect(
      runCreatorNoteExtraction(
        { transcript: loadSyntheticTranscript() },
        { store, extractChunk: mockExtractChunk(), aiConfig: TEST_AI, id: ids('need-db'), log: () => {} },
      ),
    ).rejects.toThrow(/creator_note_runs/);
    expect(store.findEquivalentSuccessRun).toHaveBeenCalledTimes(1);
    expect(store.insertNotes).not.toHaveBeenCalled();
  });

  it('does not write Theme Memory tables from the extraction path', async () => {
    const themeWrites = { themes: 0, memberships: 0, signals: 0 };
    const store = createMemoryCreatorNotesStore();
    await runCreatorNoteExtraction(
      { transcript: loadSyntheticTranscript() },
      { store, extractChunk: mockExtractChunk(), aiConfig: TEST_AI, id: ids('theme'), log: () => {} },
    );
    expect(themeWrites).toEqual({ themes: 0, memberships: 0, signals: 0 });
    expect(store.notes.every((note) => !('themeId' in note))).toBe(true);

    const dir = join(process.cwd(), 'lib/creatorNotes');
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts')) continue;
      const src = readFileSync(join(dir, file), 'utf8');
      expect(src).not.toMatch(/themeMemory\/themesDb/);
      expect(src).not.toMatch(/theme_memberships/);
      expect(src).not.toMatch(/theme_daily_signals/);
      expect(src).not.toMatch(/processThemeMemory/);
      expect(src).not.toMatch(/from\('themes'\)/);
    }
  });

  it('normalizes known creator attribution instead of generic The speaker', async () => {
    const transcript = {
      ...loadSyntheticTranscript(),
      creatorName: 'David Pakman',
    };
    const speakerNotes = SYNTHETIC_NOTES.map((item) => ({
      ...item,
      attribution: 'The speaker',
      sourceSegmentIndexes: [...item.sourceSegmentIndexes],
    }));
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      { extractChunk: mockExtractChunk(speakerNotes), aiConfig: TEST_AI, id: ids('attr-known'), log: () => {} },
    );
    const attributed = result.notes.filter((note) =>
      note.kind === 'claim' || note.kind === 'creator_analysis' || note.kind === 'why_it_matters',
    );
    expect(attributed.length).toBeGreaterThan(0);
    expect(attributed.every((note) => note.attribution === 'David Pakman')).toBe(true);
    expect(result.notes.every((note) => note.attribution !== 'The speaker')).toBe(true);
  });

  it('keeps generic The speaker when the creator is unknown', async () => {
    const transcript = {
      ...loadSyntheticTranscript(),
      creatorId: null,
      creatorName: null,
    };
    const speakerNotes = SYNTHETIC_NOTES.map((item) => ({
      ...item,
      attribution:
        item.kind === 'claim' || item.kind === 'creator_analysis' || item.kind === 'why_it_matters'
          ? 'The speaker'
          : item.attribution,
      sourceSegmentIndexes: [...item.sourceSegmentIndexes],
    }));
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      { extractChunk: mockExtractChunk(speakerNotes), aiConfig: TEST_AI, id: ids('attr-unknown'), log: () => {} },
    );
    expect(result.notes.find((note) => note.kind === 'why_it_matters')?.attribution).toBe('The speaker');
    expect(result.notes.find((note) => note.kind === 'claim')?.attribution).toBe('The speaker');
  });

  it('does not generalize named entities from a mocked specific extraction', async () => {
    const transcript = loadSpecificTranscript();
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      { extractChunk: mockExtractChunk(SPECIFIC_NOTES), aiConfig: TEST_AI, id: ids('specific'), log: () => {} },
    );
    const joined = result.notes.map((note) => note.text).join(' ');
    expect(joined).toContain('Riley Quinn');
    expect(joined).toContain('Westmere County Court');
    expect(joined).toContain('Calder v. Westmere Civic Board');
    expect(joined).toContain('Supplemental Declaration of Records Custodian Ellis Voss');
    expect(joined).toContain('$2.6 million');
    expect(joined).toContain('March 3, 2026');
    expect(joined).toContain('April 12');
    expect(joined).not.toMatch(/\bthe politician\b/i);
    expect(joined).not.toMatch(/\bthe agency\b/i);
    expect(result.notes.find((note) => note.kind === 'why_it_matters')?.attribution).toBe('Riley Quinn');
  });

  it('persists verified quotes and source segment indexes', async () => {
    const store = createMemoryCreatorNotesStore();
    const result = await runCreatorNoteExtraction(
      { transcript: loadSyntheticTranscript() },
      { store, extractChunk: mockExtractChunk(), aiConfig: TEST_AI, id: ids('persist-quote'), log: () => {} },
    );
    expect(result.persistence.notesWritten).toBeGreaterThan(0);
    const persisted = store.notes.find((note) => note.kind === 'event');
    const original = loadSyntheticTranscript().segments[1].text;
    expect(persisted?.sourceExcerpt).toContain(original);
    expect(persisted?.sourceExcerpt).not.toBe('MODEL-GENERATED EVIDENCE THAT MUST NOT SURVIVE');
    expect(persisted?.exactQuote).toContain("administration's National Guard deployment order in Chicago");
    expect(persisted?.sourceSegmentIndexes).toContain(1);
    expect(result.quoteDiagnostics.verified).toBeGreaterThan(0);
    expect(result.quoteDiagnostics.requested).toBeGreaterThanOrEqual(result.quoteDiagnostics.verified);
    expect(result.evidenceDiagnostics.notesWithSourceEvidence).toBeGreaterThan(0);
  });

  it('records quote diagnostics for mixed verified and rejected quotes', async () => {
    const transcript = loadSpecificTranscript();
    const mixed = [
      {
        ...SPECIFIC_NOTES[0],
        exactQuote: SPECIFIC_NOTES[0].exactQuote,
        sourceSegmentIndexes: [1],
      },
      {
        ...SPECIFIC_NOTES[5],
        exactQuote: 'Residents will immediately seize the Westmere Civic Board offices tomorrow.',
        sourceSegmentIndexes: [6],
      },
      {
        ...SPECIFIC_NOTES[6],
        exactQuote: null,
        sourceExcerpt: null,
        sourceSegmentIndexes: [1],
      },
    ];
    let first = true;
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        extractChunk: async () => {
          if (!first) return { notes: [], rejected: 0 };
          first = false;
          return {
            notes: mixed.map((item) => ({
              ...item,
              sourceExcerpt: 'MODEL-GENERATED EVIDENCE THAT MUST NOT SURVIVE',
              sourceSegmentIndexes: [...item.sourceSegmentIndexes],
            })),
            rejected: 0,
          };
        },
        aiConfig: TEST_AI,
        id: ids('quote-diag'),
        log: () => {},
      },
    );
    expect(result.quoteDiagnostics).toEqual({ requested: 2, verified: 1, rejected: 1 });
    expect(result.evidenceDiagnostics).toMatchObject({
      notesWithSourceEvidence: 1,
      notesWithoutSourceEvidence: 0,
      invalidSourceSegmentReferences: 0,
      exactQuotesRequested: 2,
      exactQuotesVerified: 1,
      exactQuotesRejected: 1,
      quoteVerificationRejected: 2,
    });
    expect(result.notes.find((note) => note.kind === 'event')?.exactQuote).toContain('Westmere County Court');
    expect(result.notes.find((note) => note.kind === 'event')?.sourceExcerpt).toContain(transcript.segments[1].text);
    expect(result.notes.find((note) => note.kind === 'why_it_matters')).toBeUndefined();
    expect(result.notes).toHaveLength(1);
  });
});

describe('Atomic Creator Notes transcript file', () => {
  it('requires a segments array', () => {
    expect(() => parseTranscriptFilePayload({ segments: [] }, 'abc')).toThrow(/empty/);
    expect(() => parseTranscriptFilePayload({ notes: [] }, 'abc')).toThrow(/segments array/);
  });

  it('assigns stable original segment indexes', () => {
    const transcript = loadSpecificTranscript();
    expect(transcript.segments.map((segment) => segment.index)).toEqual(
      transcript.segments.map((_, index) => index),
    );
    expect(transcript.segments[1].text).toContain('Westmere County Court');
  });
});

describe('Atomic Creator Notes source metadata', () => {
  it('does not query a UUID column for calibration source ids', async () => {
    const fetchById = vi.fn(async () => {
      throw new Error('source_items by id select: invalid input syntax for type uuid');
    });
    const result = await loadCreatorSourceMetadata(CALIBRATION_SOURCE_ID, {
      dbConfigured: () => true,
      fetchById,
    });
    expect(result).toBeNull();
    expect(fetchById).not.toHaveBeenCalled();
  });

  it('looks up metadata when the source id is a UUID', async () => {
    const fetchById = vi.fn(async (id: string) => ({
      id,
      desk_lane: 'voices',
      title: 'DEAR GOD: This is OFF THE RAILS',
      canonical_url: 'https://www.youtube.com/watch?v=example',
      published_at: '2026-09-17T00:00:00.000Z',
      sources: {
        desk_lane: 'voices',
        name: 'David Pakman',
        slug: 'david-pakman',
      },
    }));
    const result = await loadCreatorSourceMetadata(INTEL_SOURCE_UUID, {
      dbConfigured: () => true,
      fetchById,
    });
    expect(fetchById).toHaveBeenCalledTimes(1);
    expect(fetchById).toHaveBeenCalledWith(INTEL_SOURCE_UUID);
    expect(result).toEqual({
      sourceItemId: INTEL_SOURCE_UUID,
      creatorId: 'david-pakman',
      creatorName: 'David Pakman',
      sourceTitle: 'DEAR GOD: This is OFF THE RAILS',
      sourceUrl: 'https://www.youtube.com/watch?v=example',
      publishedAt: '2026-09-17T00:00:00.000Z',
      sourceIdentityKey: 'https://www.youtube.com/watch?v=example',
    });
  });

  it('does not invent metadata when a UUID row is missing', async () => {
    const fetchById = vi.fn(async () => null);
    const result = await loadCreatorSourceMetadata(INTEL_SOURCE_UUID, {
      dbConfigured: () => true,
      fetchById,
    });
    expect(fetchById).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('does not require a DB source lookup to use dry-run CLI metadata', () => {
    expect(shouldLookupCreatorSourceMetadata(true)).toBe(false);
    const fetchById = vi.fn(async () => {
      throw new Error('DB lookup should not run for dry-run CLI metadata');
    });
    const fromFile = {
      ...loadSyntheticTranscript(CALIBRATION_SOURCE_ID),
      creatorName: null,
      sourceTitle: null,
      sourceUrl: null,
    };
    const merged = mergeTranscriptMetadata(fromFile, {
      creatorName: 'David Pakman',
      sourceTitle: 'Calibration segment',
      sourceUrl: null,
    });
    expect(fetchById).not.toHaveBeenCalled();
    expect(merged.creatorName).toBe('David Pakman');
    expect(merged.sourceTitle).toBe('Calibration segment');
    expect(merged.sourceUrl).toBeNull();
  });

  it('prefers stored source metadata over CLI flags for persisted real-source runs', async () => {
    expect(shouldLookupCreatorSourceMetadata(false)).toBe(true);
    const fetchById = vi.fn(async (id: string) => ({
      id,
      desk_lane: 'voices',
      title: 'DEAR GOD: This is OFF THE RAILS',
      canonical_url: 'https://www.youtube.com/watch?v=example',
      published_at: '2026-09-17T00:00:00.000Z',
      sources: {
        desk_lane: 'voices',
        name: 'David Pakman',
        slug: 'david-pakman',
      },
    }));
    const dbMeta = await loadCreatorSourceMetadata(INTEL_SOURCE_UUID, {
      dbConfigured: () => true,
      fetchById,
    });
    const fromFile = {
      ...loadSyntheticTranscript(INTEL_SOURCE_UUID),
      creatorName: null,
      sourceTitle: null,
      sourceUrl: null,
    };
    const withDb = mergeTranscriptMetadata(fromFile, dbMeta);
    const withCli = mergeTranscriptMetadata(withDb, {
      creatorName: 'CLI Override',
      sourceTitle: 'Calibration segment',
      sourceUrl: 'https://example.test/calibration',
    });
    expect(fetchById).toHaveBeenCalledTimes(1);
    expect(withCli.creatorName).toBe('David Pakman');
    expect(withCli.sourceTitle).toBe('DEAR GOD: This is OFF THE RAILS');
    expect(withCli.sourceUrl).toBe('https://www.youtube.com/watch?v=example');
  });
});

describe('Atomic Creator Notes deterministic evidence', () => {
  it('ignores model-supplied sourceExcerpt at parse time', () => {
    const parsed = parseCreatorNotesOutput(
      JSON.stringify({
        notes: [
          {
            kind: 'event',
            text: 'Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.',
            sourceExcerpt: 'A model paraphrase pretending to be transcript evidence.',
            sourceSegmentIndexes: [1],
          },
        ],
      }),
      { segmentCount: 9 },
    );
    expect(parsed.notes[0].sourceExcerpt).toBeNull();
  });

  it('resolves overlapping chunk indexes to original transcript segments', async () => {
    const segments = Array.from({ length: 8 }, (_, index) => ({
      index,
      startSeconds: index * 10,
      endSeconds: index * 10 + 8,
      text: `Original segment ${index} names Westmere County Court in Calder v. Westmere Civic Board.`,
    }));
    const chunks = chunkCreatorTranscript(segments, { chunkChars: 180, overlapChars: 80 });
    expect(chunks.length).toBeGreaterThan(1);
    const overlapIndex = chunks[1].segments[0].index;
    expect(chunks[0].segmentIndexes).toContain(overlapIndex);

    const transcript = {
      ...loadSyntheticTranscript(),
      segments,
    };
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        extractChunk: mockExtractChunk([
          {
            kind: 'event',
            startSeconds: segments[overlapIndex].startSeconds,
            endSeconds: segments[overlapIndex].endSeconds,
            text: 'Westmere County Court accepted another filing in Calder v. Westmere Civic Board.',
            attribution: null,
            eventFeatures: null,
            sourceExcerpt: 'MODEL PARAPHRASE FROM AN OVERLAPPING CHUNK',
            exactQuote: segments[overlapIndex].text,
            sourceSegmentIndexes: [overlapIndex],
          },
        ]),
        aiConfig: TEST_AI,
        id: ids('overlap-evidence'),
        log: () => {},
      },
    );
    expect(result.notes[0].sourceExcerpt).toContain(segments[overlapIndex].text);
    expect(result.notes[0].sourceExcerpt).not.toBe('MODEL PARAPHRASE FROM AN OVERLAPPING CHUNK');
    expect(result.notes[0].sourceSegmentIndexes).toContain(overlapIndex);
  });

  it('uses --creator-name for attribution during dry-run when file metadata is missing', async () => {
    const transcript = mergeTranscriptMetadata(
      {
        ...loadSyntheticTranscript(CALIBRATION_SOURCE_ID),
        creatorName: null,
        creatorId: null,
      },
      { creatorName: 'David Pakman' },
    );
    const speakerNotes = SYNTHETIC_NOTES.map((item) => ({
      ...item,
      attribution: 'The speaker',
      sourceSegmentIndexes: [...item.sourceSegmentIndexes],
    }));
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      { extractChunk: mockExtractChunk(speakerNotes), aiConfig: TEST_AI, id: ids('cli-attr'), log: () => {} },
    );
    expect(result.source.creatorName).toBe('David Pakman');
    const attributed = result.notes.filter(
      (item) => item.kind === 'claim' || item.kind === 'creator_analysis' || item.kind === 'why_it_matters',
    );
    expect(attributed.length).toBeGreaterThan(0);
    expect(attributed.every((item) => item.attribution === 'David Pakman')).toBe(true);
    expect(result.persistence.dryRun).toBe(true);
    expect(result.persistence.notesWritten).toBe(0);
  });
});

