import { describe, expect, it } from 'vitest';

import { buildEvidenceWindows } from '@/lib/creatorNotes/chunk';
import {
  classifyTranscriptContent,
  noteContentEligibility,
  resolveNoteContentRole,
} from '@/lib/creatorNotes/contentRole';
import { runCreatorNoteExtraction } from '@/lib/creatorNotes/run';
import type { CreatorTranscriptSegment, RawCreatorNote } from '@/lib/creatorNotes/types';
import { loadSyntheticTranscript } from './helpers';

const TEST_AI = {
  provider: 'test',
  model: 'test-model',
  baseUrl: 'http://127.0.0.1:9',
  timeoutMs: 300000,
  retries: 0,
};

/**
 * Phrases taken from the reviewed MeidasTouch episode.
 * Squarespace, Chumba, and Wild Alaskan are sponsor reads.
 * The diesel-export analysis resumes immediately after Wild Alaskan.
 * Estonia is editorial. The outro subscribe / 7 million line is housekeeping.
 */
const DIESEL_BEFORE =
  'The White House is discussing a diesel export ban after the Gulf Coast refinery outage left inventories thin.';
const DIESEL_AFTER =
  'The diesel export ban would hit coastal refiners first and could tighten East Coast supply within weeks.';
const ESTONIA =
  'Estonia is now part of the escalation ladder. A local incident there could become a wider security guarantee.';
const SQUARESPACE = 'Squarespace helps creators build websites for their businesses. Go to squarespace.com to start a site.';
const CHUMBA = 'Chumba Casino is giving away free coins. Go to chumbacasino.com and use code MEIDAS.';
const WILD_ALASKAN_BOUNDARY = `${DIESEL_BEFORE} Thanks to Wild Alaskan Company. Go to wildalaskan.com. ${DIESEL_AFTER}`;
const HOUSEKEEPING = 'Keep you posted. Subscribe. Let\'s get to 7 million.';

function segment(index: number, start: number, end: number, text: string): CreatorTranscriptSegment {
  return { index, startSeconds: start, endSeconds: end, text };
}

function meidasSegments(): CreatorTranscriptSegment[] {
  return [
    segment(0, 560, 600, ESTONIA),
    segment(1, 601, 640, SQUARESPACE),
    segment(2, 641, 665, CHUMBA),
    segment(3, 666, 712, WILD_ALASKAN_BOUNDARY),
    segment(4, 900, 930, HOUSEKEEPING),
  ];
}

function blocked() {
  return {
    eligibleForThemeMemory: false,
    eligibleForEventThreads: false,
    eligibleForReasoningGraph: false,
    eligibleForEditorialBoost: false,
  };
}

describe('Meidas content-role classification', () => {
  it('labels sponsor reads and housekeeping without deleting them from the transcript', () => {
    const original = meidasSegments();
    const snapshot = original.map((item) => ({ ...item }));
    const classified = classifyTranscriptContent(original);

    expect(original).toEqual(snapshot);
    expect(classified.segments.some((item) => /squarespace/i.test(item.text) && item.contentRole === 'sponsor_read')).toBe(true);
    expect(classified.segments.some((item) => /chumba/i.test(item.text) && item.contentRole === 'sponsor_read')).toBe(true);
    expect(classified.segments.some((item) => /wild alaskan|wildalaskan/i.test(item.text) && item.contentRole === 'sponsor_read')).toBe(true);
    expect(classified.segments.some((item) => /7 million/i.test(item.text) && item.contentRole === 'housekeeping')).toBe(true);
    expect(classified.segments.some((item) => /estonia/i.test(item.text) && item.contentRole === 'editorial')).toBe(true);
    expect(classified.diagnostics.segmentsSplit).toBe(1);
  });

  it('splits the Wild Alaskan boundary and keeps the diesel analysis editorial', () => {
    const classified = classifyTranscriptContent(meidasSegments());
    const diesel = classified.segments.filter((item) => /diesel export/i.test(item.text));
    expect(diesel.length).toBeGreaterThanOrEqual(2);
    expect(diesel.every((item) => item.contentRole === 'editorial')).toBe(true);
    expect(diesel.every((item) => !/wild alaskan|wildalaskan|squarespace|chumba/i.test(item.text))).toBe(true);
    expect(diesel.some((item) => /would hit coastal refiners/i.test(item.text))).toBe(true);
    expect(diesel.every((item) => item.originSegmentIndex === 3)).toBe(true);

    const windows = buildEvidenceWindows(classified.segments).filter((window) => window.contentRole === 'editorial');
    const windowText = windows.map((window) => window.text).join('\n');
    expect(windowText).toMatch(/estonia/i);
    expect(windowText).toMatch(/diesel export ban after the gulf coast/i);
    expect(windowText).toMatch(/would hit coastal refiners/i);
    for (const window of windows) {
      expect(window.text).not.toMatch(/squarespace|chumba|wild alaskan|wildalaskan|let's get to 7 million|subscribe/i);
    }
  });

  it('blocks sponsor reads and housekeeping from editorial boost', () => {
    expect(noteContentEligibility({ text: 'Squarespace helps creators build websites for their businesses.' })).toEqual(blocked());
    expect(noteContentEligibility({ text: 'Chumba Casino is giving away free coins today.' })).toEqual(blocked());
    expect(noteContentEligibility({ text: 'Thanks to Wild Alaskan Company. Go to wildalaskan.com.' })).toEqual(blocked());
    expect(noteContentEligibility({ text: "Let's get to 7 million." })).toEqual(blocked());
    expect(noteContentEligibility({ contentRole: 'sponsor_read', text: 'A note the model forgot to mark.' })).toEqual(blocked());
    expect(resolveNoteContentRole({ text: DIESEL_AFTER })).toBe('editorial');
    expect(noteContentEligibility({ text: DIESEL_AFTER })).toEqual({
      eligibleForThemeMemory: true,
      eligibleForEventThreads: true,
      eligibleForReasoningGraph: true,
      eligibleForEditorialBoost: true,
    });
    expect(noteContentEligibility({ text: ESTONIA }).eligibleForEditorialBoost).toBe(true);
  });

  it('does not send Meidas ads or the subscribe outro to Atomic Note extraction', async () => {
    const segments = meidasSegments();
    const seen: string[] = [];
    const result = await runCreatorNoteExtraction(
      {
        transcript: {
          sourceItemId: 'meidas-content-role',
          creatorId: 'meidastouch',
          creatorName: 'MeidasTouch',
          sourceTitle: 'Meidas content role fixture',
          sourceUrl: 'https://example.test/meidas',
          publishedAt: '2026-09-22T00:00:00.000Z',
          sourceIdentityKey: 'meidas-content-role',
          segments,
        },
        dryRun: true,
      },
      {
        aiConfig: TEST_AI,
        id: (() => {
          let n = 0;
          return () => `meidas-role-${++n}`;
        })(),
        log: () => {},
        extractChunk: async ({ chunk }) => {
          seen.push(chunk.text);
          const notes: RawCreatorNote[] = [];
          if (/estonia/i.test(chunk.text)) {
            notes.push({
              kind: 'event',
              startSeconds: null,
              endSeconds: null,
              text: 'Estonia is now part of the escalation ladder.',
              attribution: null,
              eventFeatures: null,
              sourceExcerpt: null,
              sourceQuote: 'Estonia is now part of the escalation ladder.',
              exactQuote: 'Estonia is now part of the escalation ladder.',
              sourceSegmentIndexes: [],
            });
            notes.push({
              kind: 'context',
              startSeconds: null,
              endSeconds: null,
              text: 'Squarespace helps creators build websites for their businesses.',
              attribution: null,
              eventFeatures: null,
              sourceExcerpt: null,
              sourceQuote: 'Estonia is now part of the escalation ladder.',
              exactQuote: 'Estonia is now part of the escalation ladder.',
              sourceSegmentIndexes: [],
            });
          }
          if (/would hit coastal refiners/i.test(chunk.text)) {
            notes.push({
              kind: 'creator_analysis',
              startSeconds: null,
              endSeconds: null,
              text: 'The diesel export ban would hit coastal refiners first and could tighten East Coast supply.',
              attribution: 'MeidasTouch',
              eventFeatures: null,
              sourceExcerpt: null,
              sourceQuote: 'The diesel export ban would hit coastal refiners first',
              exactQuote: 'The diesel export ban would hit coastal refiners first',
              sourceSegmentIndexes: [],
            });
          }
          return { notes, rejected: 0 };
        },
      },
    );

    expect(seen.length).toBeGreaterThan(0);
    for (const text of seen) {
      expect(text).not.toMatch(/squarespace|chumba|wild alaskan|wildalaskan|let's get to 7 million|subscribe/i);
    }
    expect(seen.some((text) => /estonia/i.test(text))).toBe(true);
    expect(seen.some((text) => /would hit coastal refiners/i.test(text))).toBe(true);
    expect(result.notes.map((note) => note.text).join('\n')).toMatch(/estonia/i);
    expect(result.notes.map((note) => note.text).join('\n')).toMatch(/coastal refiners/i);
    expect(result.notes.map((note) => note.text).join('\n')).not.toMatch(/squarespace/i);
    expect(result.notes.every((note) => note.contentRole === 'editorial')).toBe(true);
    expect(result.contentRoles?.nonEditorialNotesDropped).toBe(1);
    expect(result.contentRoles?.nonEditorialWindowsSkipped).toBeGreaterThan(0);
    expect(result.contentRoles?.sponsorReadSegments).toBeGreaterThanOrEqual(3);
  });

  it('keeps the synthetic transcript indexes stable while marking its sponsor read', () => {
    const transcript = loadSyntheticTranscript();
    const classified = classifyTranscriptContent(transcript.segments);
    expect(classified.segments).toHaveLength(transcript.segments.length);
    expect(classified.diagnostics.segmentsSplit).toBe(0);
    classified.segments.forEach((segment, index) => {
      expect(segment.index).toBe(transcript.segments[index].index);
      expect(segment.text).toBe(transcript.segments[index].text);
    });
    expect(classified.segments.some((segment) => segment.contentRole === 'sponsor_read' && /today's sponsor/i.test(segment.text))).toBe(true);
    expect(classified.segments[0].contentRole).toBe('housekeeping');
    expect(classified.segments[1].contentRole).toBe('editorial');
  });
});
