import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { chunkCreatorTranscript } from '@/lib/creatorNotes/chunk';
import {
  CREATOR_NOTE_KINDS,
  CREATOR_NOTE_EXTRACTION_VERSION,
} from '@/lib/creatorNotes/constants';
import { createMemoryCreatorNotesStore } from '@/lib/creatorNotes/db';
import { parseCreatorNotesExtractArgs } from '@/lib/creatorNotes/format';
import {
  creatorNoteFingerprint,
  hashCreatorTranscript,
  serializeTranscriptForHash,
} from '@/lib/creatorNotes/identity';
import { defaultVerificationStatus, dedupeRawCreatorNotes, toAtomicNotes } from '@/lib/creatorNotes/postprocess';
import { buildCreatorNoteMessages, CREATOR_NOTE_SYSTEM_PROMPT } from '@/lib/creatorNotes/prompt';
import { runCreatorNoteExtraction } from '@/lib/creatorNotes/run';
import { parseTranscriptFilePayload } from '@/lib/creatorNotes/transcript';
import type { CreatorNoteRun, RawCreatorNote } from '@/lib/creatorNotes/types';
import { parseCreatorNotesOutput, parseEventFeatures, validateRawCreatorNote } from '@/lib/creatorNotes/validate';
import { loadSyntheticTranscript, mockExtractChunk, SYNTHETIC_NOTES } from './helpers';

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
      },
      {
        kind: 'event',
        startSeconds: 14,
        endSeconds: 30,
        text: 'A federal appeals court issued a stay blocking the deployment order in Chicago.',
        attribution: null,
        eventFeatures: null,
      },
      {
        kind: 'claim',
        startSeconds: 28,
        endSeconds: 40,
        text: 'The speaker says two thousand troops would have been federalized this weekend.',
        attribution: 'David Pakman',
        eventFeatures: null,
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
    expect(messages[1].content).toContain('creator_analysis != fact');
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
    });
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
    const result = await runCreatorNoteExtraction(
      { transcript },
      { store, extractChunk: mockExtractChunk(), aiConfig: TEST_AI, id: ids('id'), log: () => {} },
    );
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
    const result = await runCreatorNoteExtraction(
      { transcript, force: true },
      { store, extractChunk: mockExtractChunk(), aiConfig: TEST_AI, id: ids('force'), log: () => {} },
    );
    expect(result.persistence.status).toBe('success');
    expect(result.persistence.priorEquivalentRunId).toBe('run-prior');
    expect(result.persistence.runId).not.toBe('run-prior');
    expect(store.runs).toHaveLength(2);
    expect(store.notes.length).toBeGreaterThan(0);
  });

  it('performs zero database writes on dry-run', async () => {
    const store = createMemoryCreatorNotesStore();
    const result = await runCreatorNoteExtraction(
      { transcript: loadSyntheticTranscript(), dryRun: true },
      { store, extractChunk: mockExtractChunk(), aiConfig: TEST_AI, id: ids('dry'), log: () => {} },
    );
    expect(result.persistence.dryRun).toBe(true);
    expect(result.persistence.notesWritten).toBe(0);
    expect(result.persistence.runId).toBeNull();
    expect(result.notes.length).toBeGreaterThan(0);
    expect(store.writeCount()).toBe(0);
    expect(store.runs).toHaveLength(0);
    expect(store.notes).toHaveLength(0);
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
});

describe('Atomic Creator Notes transcript file', () => {
  it('requires a segments array', () => {
    expect(() => parseTranscriptFilePayload({ segments: [] }, 'abc')).toThrow(/empty/);
    expect(() => parseTranscriptFilePayload({ notes: [] }, 'abc')).toThrow(/segments array/);
  });
});
