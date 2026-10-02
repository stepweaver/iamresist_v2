import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { CreatorTranscriptSegment } from '@/lib/creatorNotes/types';
import {
  JEV_DISCOURSE_FAILURE_CACHE_MISSING,
  JEV_DISCOURSE_FAILURE_INDEXES_UNMAPPED,
  JEV_DISCOURSE_MAX_SECONDS,
  JEV_DISCOURSE_MIN_SECONDS,
} from '@/lib/jev/constants';
import { cachedTranscriptsForSources, discourseContextForNote } from '@/lib/jev/discourse';
import { exportShadowLabelSheet, parseShadowLabelFile } from '@/lib/jev/labels';
import { makeNote } from '../eventThreads/helpers';

const LOCAL_SOURCES = [join(process.cwd(), 'lib/jev/discourse.ts'), join(process.cwd(), 'lib/jev/labels.ts')];

function segment(index: number, text: string): CreatorTranscriptSegment {
  return {
    index,
    startSeconds: index * 5,
    endSeconds: (index + 1) * 5,
    text,
  };
}

function transcript(count = 40): CreatorTranscriptSegment[] {
  return Array.from({ length: count }, (_, index) => segment(index, `Segment ${index} discusses the diesel hearing and the quoted guest.`));
}

describe('discourse context', () => {
  it('includes neighboring segments and leaves sourceExcerpt unchanged', () => {
    const segments = transcript();
    const indexes = [10, 11, 12, 13, 14, 15];
    const excerpt = indexes.map((index) => segments[index].text).join(' ');
    const note = makeNote({
      id: '00000000-0000-4000-8000-0000000000a1',
      sourceItemId: 'source-a',
      kind: 'creator_analysis',
      text: 'He said Estonia reported a missile strike on the port of Tallinn. The creator argues diesel prices will rise.',
      sourceExcerpt: excerpt,
      sourceQuote: segments[12].text,
      sourceSegmentIndexes: indexes,
      startSeconds: 50,
      endSeconds: 80,
    });
    const other = makeNote({
      id: '00000000-0000-4000-8000-0000000000b1',
      sourceItemId: 'source-b',
      kind: 'event',
      text: 'He said Estonia reported a missile strike on the port of Tallinn. They confirmed the intercept near the gulf.',
      sourceExcerpt: 'Estonia reported a missile strike on the port of Tallinn.',
      sourceSegmentIndexes: [2],
    });
    const before = note.sourceExcerpt;
    const sheet = exportShadowLabelSheet(
      [
        { sourceItemId: 'source-a', notes: [note] },
        { sourceItemId: 'source-b', notes: [other] },
      ],
      () => {},
      undefined,
      new Map([['source-a', segments]]),
    );
    const review = sheet.notes[note.id];
    expect(review?.sourceExcerpt).toBe(before);
    expect(review?.sourceQuote).toBe(note.sourceQuote);
    expect(review?.sourceSegmentIndexes).toEqual(indexes);
    expect(review?.startSeconds).toBe(50);
    expect(review?.endSeconds).toBe(80);
    expect(review?.discourseContext).toBeTruthy();
    expect(review?.discourseContext).not.toBe(review?.sourceExcerpt);
    expect(review?.discourseContext).toContain(segments[9].text);
    expect(review?.discourseContext).toContain(excerpt);
    const at = review?.discourseContext?.indexOf(excerpt) ?? -1;
    expect(at).toBeGreaterThan(0);
    expect(at + excerpt.length).toBeLessThan(review?.discourseContext?.length || 0);
    expect(review?.discourseContextSource).toBe('transcript_cache');
    expect(review?.discourseContextFailureReason).toBeNull();
    const discourseIndexes = review?.discourseSegmentIndexes || [];
    expect(discourseIndexes.some((index) => index < 10 || index > 15)).toBe(true);
    expect(review?.discourseStartSeconds).not.toBeNull();
    expect(review?.discourseEndSeconds).not.toBeNull();
    const duration = (review?.discourseEndSeconds || 0) - (review?.discourseStartSeconds || 0);
    expect(duration).toBeGreaterThanOrEqual(JEV_DISCOURSE_MIN_SECONDS);
    expect(duration).toBeLessThanOrEqual(JEV_DISCOURSE_MAX_SECONDS);
    expect(Object.keys(review || {})).toEqual([
      'id',
      'sourceItemId',
      'creatorId',
      'creatorName',
      'text',
      'kind',
      'contentRole',
      'statementRole',
      'attribution',
      'quotedSpeaker',
      'sourceQuote',
      'sourceExcerpt',
      'startSeconds',
      'endSeconds',
      'sourceSegmentIndexes',
      'discourseContext',
      'discourseStartSeconds',
      'discourseEndSeconds',
      'discourseSegmentIndexes',
      'discourseContextSource',
      'discourseContextFailureReason',
      'status',
      'reviewReason',
      'speechMode',
      'representedSpeaker',
      'attributionReviewReason',
    ]);
    expect(Object.keys(sheet.notes).filter((id) => id === note.id)).toHaveLength(1);
    expect(sheet.rows.every((row) => !('speechMode' in row) && !('discourseContext' in row))).toBe(true);
  });

  it('returns null context when neighboring transcript data is missing or does not contain the excerpt', () => {
    const segments = transcript(8);
    const excerpt = 'They are going to pay massive amounts and that could raise the price of diesel.';
    const note = makeNote({
      id: '00000000-0000-4000-8000-0000000000c1',
      sourceItemId: 'source-missing',
      kind: 'creator_analysis',
      text: 'He said Estonia reported a missile strike on the port of Tallinn. The creator argues diesel prices will rise.',
      sourceExcerpt: excerpt,
      sourceSegmentIndexes: [4, 5],
      startSeconds: 20,
      endSeconds: 30,
    });
    expect(discourseContextForNote(note, null)).toMatchObject({
      discourseContext: null,
      discourseContextSource: 'unavailable',
      discourseContextFailureReason: JEV_DISCOURSE_FAILURE_CACHE_MISSING,
    });
    expect(discourseContextForNote(note, []).discourseContextFailureReason).toBe(JEV_DISCOURSE_FAILURE_CACHE_MISSING);
    const unmatched = discourseContextForNote(note, segments);
    expect(unmatched).toEqual({
      discourseContext: null,
      discourseStartSeconds: null,
      discourseEndSeconds: null,
      discourseSegmentIndexes: null,
      discourseContextSource: 'unavailable',
      discourseContextFailureReason: JEV_DISCOURSE_FAILURE_INDEXES_UNMAPPED,
    });
    expect(note.sourceExcerpt).toBe(excerpt);

    const sheet = exportShadowLabelSheet(
      [
        { sourceItemId: 'source-missing', notes: [note] },
        {
          sourceItemId: 'source-b',
          notes: [
            makeNote({
              kind: 'event',
              text: 'He said Estonia reported a missile strike on the port of Tallinn. They confirmed the intercept near the gulf.',
              sourceExcerpt: 'Estonia reported a missile strike on the port of Tallinn.',
            }),
          ],
        },
      ],
      () => {},
      undefined,
      new Map([['source-missing', segments]]),
    );
    expect(sheet.notes[note.id]?.discourseContext).toBeNull();
    expect(sheet.notes[note.id]?.discourseContextSource).toBe('unavailable');
    expect(sheet.notes[note.id]?.discourseContextFailureReason).toBe(JEV_DISCOURSE_FAILURE_INDEXES_UNMAPPED);
    expect(sheet.notes[note.id]?.sourceExcerpt).toBe(excerpt);
    expect(sheet.notes[note.id]?.speechMode).toBeNull();
  });

  it('does not call a model or API while exporting labels', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const file of LOCAL_SOURCES) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/createTypeSafeJevProvider/);
      expect(src, file).not.toMatch(/ollamaChatJson|groq|openai|api\.typesafe/i);
      expect(src, file).not.toMatch(/\bfetch\s*\(/);
    }
    const script = readFileSync(join(process.cwd(), 'scripts/jev-shadow-eval.ts'), 'utf8');
    const exportBranch = script.slice(script.indexOf('if (args.exportLabels)'), script.indexOf('if (!args.labelsPath)'));
    expect(exportBranch).toMatch(/cachedTranscriptsForSources/);
    expect(exportBranch).not.toMatch(/createTypeSafeJevProvider|fetch\s*\(/);

    const dir = mkdtempSync(join(tmpdir(), 'jev-discourse-'));
    const segments = transcript();
    const indexes = [10, 11, 12];
    const excerpt = indexes.map((index) => segments[index].text).join(' ');
    writeFileSync(
      join(dir, 'match.json'),
      JSON.stringify({ sourceItemId: 'source-a', segments }),
      'utf8',
    );
    writeFileSync(
      join(dir, 'other.json'),
      JSON.stringify({
        sourceItemId: 'source-a',
        segments: [segment(0, 'Unrelated sponsor copy about cookies.')],
      }),
      'utf8',
    );
    const groups = [
      {
        sourceItemId: 'source-a',
        notes: [
          {
            sourceExcerpt: excerpt,
            sourceSegmentIndexes: indexes,
            startSeconds: segments[indexes[0]].startSeconds,
            endSeconds: segments[indexes[indexes.length - 1]].endSeconds,
          },
        ],
      },
    ];
    const cached = cachedTranscriptsForSources(groups, dir);
    expect(cached.transcripts.get('source-a')).toHaveLength(segments.length);
    expect(cached.failures.size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('validates speechMode and keeps one review record per note id', () => {
    const fixture = JSON.parse(readFileSync(join(process.cwd(), 'tests/jev/fixtures/missed-pair-labels.json'), 'utf8')) as {
      notes: Record<string, Record<string, unknown>>;
      rows: unknown[];
    };
    const noteId = Object.keys(fixture.notes)[0];
    fixture.notes[noteId].speechMode = 'not-a-mode';
    expect(() => parseShadowLabelFile(fixture)).toThrow(/speechMode/);
    fixture.notes[noteId].speechMode = 'hypothetical_or_sarcastic_other';
    fixture.notes[noteId].representedSpeaker = 'Donald Trump';
    fixture.notes[noteId].attributionReviewReason = 'voicing an opponent';
    const parsed = parseShadowLabelFile(fixture);
    expect(parsed.notes[noteId]?.speechMode).toBe('hypothetical_or_sarcastic_other');
    expect(parsed.notes[noteId]?.representedSpeaker).toBe('Donald Trump');
    expect(parsed.notes[noteId]?.status).toBe('usable');
    expect(parsed.rows.some((row) => 'speechMode' in row)).toBe(false);
    expect(Object.keys(parsed.notes).filter((id) => id === noteId)).toHaveLength(1);
  });

  it('rejects a transcript whose text matches but whose segment indexes do not', () => {
    const segments = transcript(12);
    const excerpt = 'They are going to pay massive amounts and that could raise the price of diesel.';
    segments[8] = segment(8, excerpt);
    const note = makeNote({
      id: '00000000-0000-4000-8000-0000000000d1',
      sourceItemId: 'source-diesel',
      kind: 'creator_analysis',
      text: 'He said Estonia reported a missile strike on the port of Tallinn. The creator argues diesel prices will rise.',
      sourceExcerpt: excerpt,
      sourceSegmentIndexes: [2, 3],
      startSeconds: 747.86,
      endSeconds: 800.86,
    });
    const recovered = discourseContextForNote(note, segments);
    expect(recovered.discourseContext).toBeNull();
    expect(recovered.discourseContextSource).toBe('unavailable');
    expect(recovered.discourseContextFailureReason).toBe(JEV_DISCOURSE_FAILURE_INDEXES_UNMAPPED);
    expect(note.sourceExcerpt).toBe(excerpt);
  });

  it('extends discourse context before and after the source excerpt using neighboring segments', () => {
    const segments = transcript();
    const indexes = [12, 13, 14];
    const excerpt = indexes.map((index) => segments[index].text).join(' ');
    const note = makeNote({
      id: '00000000-0000-4000-8000-0000000000e1',
      sourceItemId: 'kzdSpHAO0tAEMYC3KH1toIsDEa9B0AIk',
      kind: 'creator_analysis',
      text: 'He said Estonia reported a missile strike on the port of Tallinn. The creator argues diesel prices will rise.',
      sourceExcerpt: excerpt,
      sourceSegmentIndexes: indexes,
      startSeconds: segments[indexes[0]].startSeconds,
      endSeconds: segments[indexes[indexes.length - 1]].endSeconds,
    });
    const other = makeNote({
      id: '00000000-0000-4000-8000-0000000000e2',
      sourceItemId: 'source-b',
      kind: 'event',
      text: 'He said Estonia reported a missile strike on the port of Tallinn. They confirmed the intercept near the gulf.',
      sourceExcerpt: 'Estonia reported a missile strike on the port of Tallinn.',
      sourceSegmentIndexes: [2],
    });
    const before = note.sourceExcerpt;
    const sheet = exportShadowLabelSheet(
      [
        { sourceItemId: note.sourceItemId, notes: [note] },
        { sourceItemId: 'source-b', notes: [other] },
      ],
      () => {},
      undefined,
      new Map([[note.sourceItemId, segments]]),
    );
    const review = sheet.notes[note.id];
    expect(review?.sourceExcerpt).toBe(before);
    expect(review?.sourceSegmentIndexes).toEqual(indexes);
    expect(review?.startSeconds).toBe(note.startSeconds);
    expect(review?.endSeconds).toBe(note.endSeconds);
    const context = review?.discourseContext || '';
    const at = context.indexOf(before || '');
    expect(at).toBeGreaterThan(0);
    expect(context.slice(0, at)).toContain(segments[indexes[0] - 1].text);
    expect(context.slice(at + (before || '').length)).toContain(segments[indexes[indexes.length - 1] + 1].text);
    expect(review?.discourseContextSource).toBe('transcript_cache');
    expect(review?.discourseContextFailureReason).toBeNull();
  });

  it('stitches stored excerpts from the same extraction run when the transcript cache does not map', () => {
    const runId = '00000000-0000-4000-8000-000000000901';
    const sharedStart = "They're going to have to pay massive amounts and then that could end up also increasing the price of diesel";
    const sharedEnd = 'So we have to be thoughtful and it cannot just be the ranting and ravings of a lunatic';
    const excerpt = `${sharedStart} here at home. ${sharedEnd}.`;
    const earlier = `If you ban the export of diesel, other states may import it. ${sharedStart}`;
    const later = `${sharedEnd}. Zelensky strikes in Russia are what the speaker said he was worried about.`;
    const anchor = makeNote({
      id: '00000000-0000-4000-8000-0000000000f1',
      sourceItemId: 'kzdSpHAO0tAEMYC3KH1toIsDEa9B0AIk',
      extractionRunId: runId,
      creatorId: 'meidastouch-network',
      kind: 'creator_analysis',
      text: 'He said Estonia reported a missile strike on the port of Tallinn. The creator argues diesel prices will rise.',
      sourceExcerpt: excerpt,
      sourceSegmentIndexes: [119, 120, 121, 122, 123, 124, 125, 126],
      startSeconds: 747.86,
      endSeconds: 800.86,
    });
    const before = makeNote({
      id: '00000000-0000-4000-8000-0000000000f2',
      sourceItemId: anchor.sourceItemId,
      extractionRunId: runId,
      kind: 'creator_analysis',
      text: 'He said Estonia reported a missile strike on the port of Tallinn. They confirmed the intercept near the gulf.',
      sourceExcerpt: earlier,
      sourceSegmentIndexes: [116, 117, 118, 119],
      startSeconds: 714.86,
      endSeconds: 761.86,
    });
    const after = makeNote({
      id: '00000000-0000-4000-8000-0000000000f3',
      sourceItemId: anchor.sourceItemId,
      extractionRunId: runId,
      kind: 'event',
      text: 'He said Estonia reported a missile strike on the port of Tallinn. They confirmed the intercept near the gulf and the diesel strikes.',
      sourceExcerpt: later,
      sourceSegmentIndexes: [125, 126, 127, 128, 129],
      startSeconds: 787.86,
      endSeconds: 832.86,
    });
    const sheet = exportShadowLabelSheet([{ sourceItemId: anchor.sourceItemId, notes: [before, anchor, after] }], () => {});
    const review = sheet.notes[anchor.id];
    expect(review?.sourceExcerpt).toBe(excerpt);
    const context = review?.discourseContext || '';
    const at = context.indexOf(excerpt);
    expect(at).toBeGreaterThan(0);
    expect(context.slice(0, at)).toContain('If you ban the export of diesel');
    expect(context.slice(at + excerpt.length)).toContain('Zelensky strikes in Russia');
    expect(review?.discourseContextSource).toBe('source_item_transcript');
    expect(review?.discourseContextFailureReason).toBeNull();
    const duration = (review?.discourseEndSeconds || 0) - (review?.discourseStartSeconds || 0);
    expect(duration).toBeGreaterThanOrEqual(JEV_DISCOURSE_MIN_SECONDS);
    expect(duration).toBeLessThanOrEqual(JEV_DISCOURSE_MAX_SECONDS);
  });
});
