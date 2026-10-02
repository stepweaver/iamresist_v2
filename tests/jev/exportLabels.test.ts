import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/eventThreads/resolve', async () => {
  const actual = await vi.importActual<typeof import('@/lib/eventThreads/resolve')>('@/lib/eventThreads/resolve');
  return {
    ...actual,
    resolveNoteWithOptionalAi: vi.fn(async () => {
      throw new Error('optional AI resolver must not run during label export');
    }),
  };
});

import { resolveNoteWithOptionalAi } from '@/lib/eventThreads/resolve';
import {
  JEV_DECISION_CANDIDATE_LIMIT,
  JEV_DISCOURSE_FAILURE_NO_NEIGHBORS,
  JEV_RETRIEVED_CANDIDATE_LIMIT,
} from '@/lib/jev/constants';
import { creatorNamesFromVoices, exportShadowLabelSheet } from '@/lib/jev/labels';
import { writeShadowLabelFile } from '@/lib/jev/log';
import type { CreatorAtomicNote } from '@/lib/creatorNotes/types';
import { makeNote } from '../eventThreads/helpers';

const EXPORT_SOURCES = [
  join(process.cwd(), 'lib/jev/retrieve.ts'),
  join(process.cwd(), 'lib/jev/labels.ts'),
  join(process.cwd(), 'scripts/jev-shadow-eval.ts'),
];

describe('label export', () => {
  it('does not invoke the optional Event Threads AI resolver', () => {
    for (const file of EXPORT_SOURCES) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/resolveNoteWithOptionalAi/);
      expect(src, file).not.toMatch(/ollamaChatJson/);
      expect(src, file).not.toMatch(/eventThreads\/build/);
    }

    const script = readFileSync(join(process.cwd(), 'scripts/jev-shadow-eval.ts'), 'utf8');
    const exportBranch = script.slice(script.indexOf('if (args.exportLabels)'), script.indexOf('if (!args.labelsPath)'));
    expect(exportBranch).not.toMatch(/createTypeSafeJevProvider/);
    expect(exportBranch).toMatch(/exportShadowLabelSheet/);
    expect(exportBranch).toMatch(/writeShadowLabelFile/);

    const notes = Array.from({ length: 8 }, (_, index) =>
      makeNote({
        kind: 'event',
        text: `He said Estonia reported a missile strike on the port of Tallinn, account ${index}. They confirmed the intercept.`,
        sourceExcerpt: `Estonia reported a missile strike on the port of Tallinn, account ${index}.`,
      }),
    );
    const messages: string[] = [];
    const sheet = exportShadowLabelSheet(
      [
        { sourceItemId: 'source-a', notes: notes.slice(0, 4) },
        { sourceItemId: 'source-b', notes: notes.slice(4) },
      ],
      (message) => messages.push(message),
    );

    expect(resolveNoteWithOptionalAi).not.toHaveBeenCalled();
    expect(messages).toEqual([
      'notes loaded=8',
      `notes resolved=${sheet.retrieval.length}`,
      'candidate retrieval complete',
      'notes with creator names=0',
      'notes with discourse context=0',
      `notes without discourse context=${Object.keys(sheet.notes).length}`,
      `failure reasons ${JEV_DISCOURSE_FAILURE_NO_NEIGHBORS}=${Object.keys(sheet.notes).length}`,
      `rows emitted=${sheet.rows.length}`,
    ]);
    expect(sheet.sourceItemIds).toEqual(['source-a', 'source-b']);
    expect(sheet.retrieval.length).toBeGreaterThan(0);
    expect(sheet.rows.length).toBeGreaterThan(0);
    expect(sheet.retrieval.every((entry) => entry.retrievedCandidateIds.length <= JEV_RETRIEVED_CANDIDATE_LIMIT)).toBe(true);
    expect(sheet.retrieval.every((entry) => entry.jevCandidateIds.length <= JEV_DECISION_CANDIDATE_LIMIT)).toBe(true);
  });

  it('creates the output directory before writing the sheet', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jev-labels-'));
    const filePath = join(dir, 'nested', 'labels.json');
    writeShadowLabelFile(filePath, '{"ok":true}\n');
    expect(readFileSync(filePath, 'utf8')).toBe('{"ok":true}\n');
  });

  it('finishes candidate retrieval for a few hundred notes without a model', () => {
    const notes = Array.from({ length: 268 }, (_, index) =>
      makeNote({
        kind: 'event',
        text: `Account ${index}: he said Estonia reported a missile strike on the port of Tallinn. They confirmed the intercept near the gulf.`,
        sourceExcerpt: `Account ${index}: Estonia reported a missile strike on the port of Tallinn.`,
      }),
    );
    const started = Date.now();
    const sheet = exportShadowLabelSheet(
      [
        { sourceItemId: 'source-a', notes: notes.slice(0, 90) },
        { sourceItemId: 'source-b', notes: notes.slice(90, 180) },
        { sourceItemId: 'source-c', notes: notes.slice(180) },
      ],
      () => {},
    );
    const pairedIds = sheet.rows.flatMap((row) => [row.noteId, row.candidateId]);
    expect(new Set(pairedIds).size).toBe(Object.keys(sheet.notes).length);
    expect(pairedIds.length).toBeGreaterThan(Object.keys(sheet.notes).length);
    expect(sheet.rows.every((row) => sheet.notes[row.noteId]?.sourceExcerpt != null && sheet.notes[row.candidateId]?.sourceSegmentIndexes)).toBe(true);
    expect(Date.now() - started).toBeLessThan(25_000);
    expect(sheet.retrieval.length).toBeGreaterThan(200);
    expect(sheet.rows.length).toBeGreaterThan(0);
    expect(resolveNoteWithOptionalAi).not.toHaveBeenCalled();
  }, 40_000);

  it('exports stored provenance for both sides, including a quoted speaker kept only on event features', () => {
    const excerpt = 'Full window: a guest said the price of diesel could rise after the strikes. '.repeat(4);
    const quote = 'that could end up also increasing the price of diesel';
    const note = makeNote({
      id: '00000000-0000-4000-8000-0000000000a1',
      sourceItemId: 'source-a',
      creatorId: 'meidastouch-network',
      kind: 'creator_analysis',
      text: 'He said Estonia reported a missile strike on the port of Tallinn. The creator argues diesel prices will rise.',
      attribution: 'Donald Trump',
      sourceQuote: quote,
      exactQuote: quote,
      sourceExcerpt: excerpt,
      startSeconds: 12.5,
      endSeconds: 18.25,
      sourceSegmentIndexes: [4, 5],
    });
    note.contentRole = 'editorial';
    note.statementRole = 'creator';
    note.quotedSpeaker = 'Donald Trump';

    const candidate = makeNote({
      id: '00000000-0000-4000-8000-0000000000b1',
      sourceItemId: 'source-b',
      creatorId: 'professor-jiang',
      kind: 'event',
      text: 'Estonia reported a missile strike on the port of Tallinn, and they confirmed the intercept.',
      attribution: 'A guest',
      sourceQuote: 'Estonia reported a missile strike on the port of Tallinn',
      sourceExcerpt: 'Window two: Estonia reported a missile strike on the port of Tallinn.',
      startSeconds: 40,
      endSeconds: 51,
      sourceSegmentIndexes: [8],
      eventFeatures: {
        actors: [],
        action: null,
        object: null,
        institutions: [],
        locations: [],
        referencedDocuments: [],
        quotedSpeaker: 'Lloyd Austin',
        statementRole: 'quoted_speaker',
      } as CreatorAtomicNote['eventFeatures'],
    });

    const sheet = exportShadowLabelSheet(
      [
        { sourceItemId: 'source-a', notes: [note] },
        { sourceItemId: 'source-b', notes: [candidate] },
      ],
      () => {},
      { 'meidastouch-network': 'MeidasTouch Network' },
    );
    const row = sheet.rows.find((entry) => entry.noteId === note.id && entry.candidateId === candidate.id)
      || sheet.rows.find((entry) => entry.noteId === candidate.id && entry.candidateId === note.id);
    expect(row).toBeTruthy();
    const left = sheet.notes[note.id];
    const right = sheet.notes[candidate.id];
    expect(left).toMatchObject({
      id: note.id,
      sourceItemId: 'source-a',
      creatorId: 'meidastouch-network',
      creatorName: 'MeidasTouch Network',
      kind: 'creator_analysis',
      contentRole: 'editorial',
      statementRole: 'creator',
      attribution: 'Donald Trump',
      quotedSpeaker: 'Donald Trump',
      text: note.text,
      sourceQuote: quote,
      sourceExcerpt: excerpt,
      startSeconds: 12.5,
      endSeconds: 18.25,
      sourceSegmentIndexes: [4, 5],
    });
    expect(left.creatorName).not.toBe(left.attribution);
    expect(right).toMatchObject({
      id: candidate.id,
      sourceItemId: 'source-b',
      creatorId: 'professor-jiang',
      creatorName: null,
      kind: 'event',
      statementRole: 'quoted_speaker',
      attribution: 'A guest',
      quotedSpeaker: 'Lloyd Austin',
      sourceQuote: 'Estonia reported a missile strike on the port of Tallinn',
      sourceExcerpt: candidate.sourceExcerpt,
      startSeconds: 40,
      endSeconds: 51,
      sourceSegmentIndexes: [8],
    });
    expect(left?.status).toBeNull();
    expect(left?.reviewReason).toBeNull();
    expect(right?.status).toBeNull();
    expect(right?.reviewReason).toBeNull();
    expect(Object.keys(sheet.notes).filter((id) => id === note.id)).toHaveLength(1);
    expect(row).not.toHaveProperty('noteStatus');
    expect(row).not.toHaveProperty('candidateStatus');
    expect(row).not.toHaveProperty('note');
    expect(row).not.toHaveProperty('candidate');
    expect(row!.relation).toBeNull();
    expect(row!.correctCandidateId).toBeNull();
    expect(row!.correctCandidateIds).toEqual([]);
    expect(row).not.toHaveProperty('speechMode');
    expect(row).not.toHaveProperty('discourseContext');
    expect(left?.speechMode).toBeNull();
    expect(left?.representedSpeaker).toBeNull();
    expect(left?.attributionReviewReason).toBeNull();
    expect(left?.discourseContext).toBeNull();
    expect(left?.discourseContextFailureReason).toBeTruthy();
  });

  it('keeps creator names when catalog metadata is available', () => {
    const names = creatorNamesFromVoices(
      [
        { title: 'MeidasTouch Network', slug: 'meidastouch-network' },
        { title: 'Professor Jiang', slug: 'professor-jiang' },
      ],
      ['meidastouch-network', 'professor-jiang'],
    );
    expect(names.get('meidastouch-network')).toBe('MeidasTouch Network');
    expect(names.get('professor-jiang')).toBe('Professor Jiang');

    const note = makeNote({
      id: '00000000-0000-4000-8000-0000000000a1',
      sourceItemId: 'source-a',
      creatorId: 'meidastouch-network',
      kind: 'creator_analysis',
      text: 'He said Estonia reported a missile strike on the port of Tallinn. The creator argues diesel prices will rise.',
      attribution: 'Donald Trump',
      sourceExcerpt: 'Full window: diesel prices could rise after the strikes.',
    });
    const candidate = makeNote({
      id: '00000000-0000-4000-8000-0000000000b1',
      sourceItemId: 'source-b',
      creatorId: 'professor-jiang',
      kind: 'event',
      text: 'Estonia reported a missile strike on the port of Tallinn, and they confirmed the intercept.',
      attribution: 'A guest',
      sourceExcerpt: 'Window two: Estonia reported a missile strike on the port of Tallinn.',
    });
    const sheet = exportShadowLabelSheet(
      [
        { sourceItemId: 'source-a', notes: [note] },
        { sourceItemId: 'source-b', notes: [candidate] },
      ],
      () => {},
      names,
    );
    expect(sheet.notes[note.id]?.creatorName).toBe('MeidasTouch Network');
    expect(sheet.notes[candidate.id]?.creatorName).toBe('Professor Jiang');
    expect(sheet.notes[note.id]?.creatorName).not.toBe(sheet.notes[note.id]?.attribution);
    expect(sheet.notes[candidate.id]?.creatorName).not.toBe(sheet.notes[candidate.id]?.attribution);
  });
});
