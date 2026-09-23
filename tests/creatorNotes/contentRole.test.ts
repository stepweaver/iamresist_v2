import { describe, expect, it } from 'vitest';

import { buildEvidenceWindows } from '@/lib/creatorNotes/chunk';
import {
  classifyTranscriptContent,
  noteContentEligibility,
  resolveNoteContentRole,
} from '@/lib/creatorNotes/contentRole';
import { createMemoryCreatorNotesStore } from '@/lib/creatorNotes/db';
import { formatCreatorNotesReport, formatCreatorNotesReview, parseCreatorNotesPodcastExtractArgs } from '@/lib/creatorNotes/format';
import { prepareAtomicNoteEvidenceWindows, runCreatorNoteExtraction } from '@/lib/creatorNotes/run';
import type { CreatorAtomicNote, CreatorTranscriptSegment, RawCreatorNote } from '@/lib/creatorNotes/types';
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

/**
 * Verbatim spans from creator-note run efe3a16b-52b3-4a73-a62f-5908c0bffdda
 * (source item kzdSpHAO0tAEMYC3KH1toIsDEa9B0AIk). V1.9 stored these as editorial
 * because the cues only matched clean brand names, not the Whisper ad copy.
 */
const V19_SOURCE = 'kzdSpHAO0tAEMYC3KH1toIsDEa9B0AIk';
const UKRAINE =
  "All hell continues to break loose in connection with Russia's war in Ukraine. Zelensky also is delivering a message to Donald Trump.";
const DIESEL_ANALYSIS =
  "Yeah, we're examining that whether it's feasible in terms of the overall refining capacity and whether a full or partial ban would work.";
const DIESEL_CONTROL =
  "And one of the things that I've been saying is I understand, look, we need to bring the diesel price under control.";
const ESTONIA_V19 =
  'Look at Eastern Estonia. Is that going to be an area where potentially Russia will say we are going to annex it and test whether Article V would be invoked.';
const OFFER_CODE = 'Use offer code DIFFERENCE for 50% off select plans, terms and conditions apply.';
const OUTRO = "Thank you. And that's the end of the discussion. Let's do this.";
const SUBSCRIBE_GOAL = "Subscribe. Let's get to 7 million.";

const EXCLUDED_V19 = [
  /photography school/i,
  /portraits online/i,
  /cookie empire/i,
  /movie reviewing hobby/i,
  /offer code DIFFERENCE/i,
  /50% off/i,
  /Cassina/i,
  /online social games/i,
  /little epiphanies/i,
  /no purchase necessary/i,
  /high quality ingredients/i,
  /buying seafood/i,
  /vacuum sealed/i,
  /Alaskan waters/i,
  /coho salmon/i,
  /money back guarantee/i,
  /slash mitis/i,
  /\$35 off/i,
  /end of the discussion/i,
  /let's do this/i,
  /let's get to 7 million/i,
  /\bsubscribe\b/i,
];

function v19Segments(): CreatorTranscriptSegment[] {
  return [
    segment(0, 2, 14, "the difference between thinking about photography school and selling your portraits online. It's the difference between giving away those cookies you just made for free and running your cookie empire."),
    segment(1, 15, 21, 'the difference between having a movie reviewing hobby and a movie reviewing career.'),
    segment(2, 25, 38, `${OFFER_CODE} Hey, Tiffany Stratton here from the WWE SmackDown.`),
    segment(3, 38, 47, "Cassina has hundreds of online social games and new titles landing every week. There's always something fresh to try, and the daily boosts make"),
    segment(4, 47, 54, "They're little epiphanies that make my day sparkle. Ready for a fun way to switch off and take some time for yourself?"),
    segment(5, 54, 90, `No purchase necessary. ${UKRAINE}`),
    segment(6, 560, 640, `${DIESEL_ANALYSIS} I've really been trying to keep healthier high quality ingredients around the house. And one thing I've got tired of is buying seafood that looks great at the store, but then just doesn't live up to expectations.`),
    segment(7, 640, 680, 'They offer the best way to get wild caught high quality seafood delivered right to your door on your schedule. Each box comes with individually portioned vacuum sealed fillets that are easy to prep.'),
    segment(8, 680, 710, 'Everything is quick frozen right from the Alaskan waters. Plus every order supports sustainable harvesting practices and Alaskan fishermen.'),
    segment(9, 710, 730, 'One of my favorites has been the coho salmon.'),
    segment(10, 730, 748, 'so confident that their fish is the best that they offer a 100% satisfaction and money back guarantee so you can try your first box risk free.'),
    segment(11, 748, 760, 'slash mitis for $35 off your first order of premium wild caught seafood.'),
    segment(12, 760, 764, 'Use offer code DIFFERENCE.'),
    segment(13, 770, 820, DIESEL_CONTROL),
    segment(14, 1000, 1060, ESTONIA_V19),
    segment(15, 1088, 1091, '[music]'),
    segment(16, 1091, 1104, OUTRO),
    segment(17, 1104, 1112, SUBSCRIBE_GOAL),
  ];
}

function editorialWindowText(segments: CreatorTranscriptSegment[]): string {
  return prepareAtomicNoteEvidenceWindows(segments)
    .editorialWindows.map((window) => window.text)
    .join('\n');
}

function storedNote(overrides: Partial<CreatorAtomicNote>): CreatorAtomicNote {
  return {
    id: 'note-1',
    sourceItemId: V19_SOURCE,
    creatorId: 'meidastouch',
    startSeconds: 25,
    endSeconds: 37,
    kind: 'context',
    text: 'A note.',
    attribution: null,
    eventFeatures: null,
    sourceExcerpt: null,
    exactQuote: null,
    sourceSegmentIndexes: [1],
    verificationStatus: 'unverified',
    extractionRunId: 'run-1',
    noteFingerprint: 'fp-1',
    createdAt: '2026-09-23T18:00:00.000Z',
    ...overrides,
  };
}

describe('Meidas V1.9 sponsor regression', () => {
  it('excludes the real Whisper ad and outro spans and keeps the adjacent editorial', () => {
    const original = v19Segments();
    const snapshot = original.map((item) => ({ ...item }));
    const prepared = prepareAtomicNoteEvidenceWindows(original);
    const editorial = editorialWindowText(original);

    expect(original).toEqual(snapshot);
    for (const pattern of EXCLUDED_V19) {
      expect(editorial).not.toMatch(pattern);
    }
    expect(editorial).toMatch(/Russia's war in Ukraine/i);
    expect(editorial).toMatch(/Zelensky/i);
    expect(editorial).toMatch(/refining capacity/i);
    expect(editorial).toMatch(/diesel price under control/i);
    expect(editorial).toMatch(/Eastern Estonia/i);
    expect(prepared.classified.diagnostics.sponsorReadSegments).toBeGreaterThan(0);
    expect(prepared.classified.diagnostics.housekeepingSegments).toBeGreaterThan(0);
    expect(prepared.classified.diagnostics.uncertainSegments).toBeGreaterThan(0);
    expect(prepared.classified.diagnostics.segmentsExcludedFromAtomicNotes).toBe(
      prepared.classified.segments.length - prepared.classified.diagnostics.editorialSegments,
    );
    expect(prepared.editorialWindows.length).toBeGreaterThan(0);
    expect(prepared.editorialWindows.every((window) => window.contentRole === 'editorial')).toBe(true);
    expect(prepared.classified.segments.some((item) => item.contentRole === 'uncertain' && item.contentRoleReason === 'non_speech')).toBe(true);
    expect(prepared.classified.segments.some((item) => item.contentRole === 'sponsor_read' && item.contentRoleReason === 'cue:offer_code')).toBe(true);
    expect(prepared.classified.segments.some((item) => item.contentRole === 'housekeeping' && item.contentRoleReason === 'cue:outro')).toBe(true);
  });

  it('splits sponsor and editorial inside one span instead of dropping the editorial half', () => {
    const sponsorThenEditorial = classifyTranscriptContent([
      segment(0, 54, 90, `No purchase necessary. ${UKRAINE}`),
    ]);
    expect(sponsorThenEditorial.segments.some((item) => item.contentRole === 'sponsor_read' && /no purchase necessary/i.test(item.text))).toBe(true);
    expect(sponsorThenEditorial.segments.some((item) => item.contentRole === 'editorial' && /Ukraine/i.test(item.text))).toBe(true);
    expect(editorialWindowText([segment(0, 54, 90, `No purchase necessary. ${UKRAINE}`)])).toMatch(/Ukraine/i);
    expect(editorialWindowText([segment(0, 54, 90, `No purchase necessary. ${UKRAINE}`)])).not.toMatch(/no purchase necessary/i);

    const editorialThenSponsor = classifyTranscriptContent([
      segment(1, 560, 640, `${DIESEL_ANALYSIS} I've really been trying to keep healthier high quality ingredients around the house.`),
    ]);
    expect(editorialThenSponsor.segments.map((item) => item.contentRole)).toEqual(['editorial', 'sponsor_read']);
    expect(editorialWindowText(editorialThenSponsor.segments.map((item, index) => ({ ...item, index })))).toMatch(/refining capacity/i);

    const middle = v19Segments().filter((item) => item.index >= 5 && item.index <= 13);
    const middleText = editorialWindowText(middle);
    expect(middleText).toMatch(/refining capacity/i);
    expect(middleText).toMatch(/diesel price under control/i);
    expect(middleText).not.toMatch(/vacuum sealed|slash mitis|offer code/i);
  });

  it('does not merge a short sponsor span back into the neighboring editorial windows', () => {
    const segments = [
      segment(0, 0, 40, DIESEL_ANALYSIS),
      segment(1, 40, 44, 'Use offer code DIFFERENCE.'),
      segment(2, 44, 80, DIESEL_CONTROL),
    ];
    const prepared = prepareAtomicNoteEvidenceWindows(segments);
    const texts = prepared.editorialWindows.map((window) => window.text);
    expect(texts.some((text) => /refining capacity/i.test(text))).toBe(true);
    expect(texts.some((text) => /diesel price under control/i.test(text))).toBe(true);
    for (const text of texts) {
      expect(text).not.toMatch(/offer code|DIFFERENCE/i);
    }
    expect(prepared.classifiedWindows.some((window) => window.contentRole === 'sponsor_read')).toBe(true);
  });

  it('treats a missing role as uncertain and keeps uncertain out of extraction', () => {
    const unlabeled = buildEvidenceWindows([
      { index: 0, startSeconds: 0, endSeconds: 8, text: 'Unlabeled span about the hearing.' },
    ]);
    expect(unlabeled[0]?.contentRole).toBe('uncertain');
    expect(unlabeled.filter((window) => window.contentRole === 'editorial')).toHaveLength(0);

    const prepared = prepareAtomicNoteEvidenceWindows([
      segment(0, 0, 20, DIESEL_CONTROL),
      segment(1, 20, 24, '[music]'),
      segment(2, 24, 50, ESTONIA_V19),
    ]);
    expect(prepared.classified.segments.find((item) => item.text === '[music]')?.contentRole).toBe('uncertain');
    const joined = prepared.editorialWindows.map((window) => window.text).join('\n');
    expect(joined).toMatch(/diesel price under control/i);
    expect(joined).toMatch(/Eastern Estonia/i);
    expect(joined).not.toMatch(/\[music\]/);
    expect(prepared.editorialWindows.every((window) => window.contentRole === 'editorial')).toBe(true);
  });

  it('does not send V1.9 ad copy to extraction or persist a sponsor note the model returns', async () => {
    const segments = v19Segments();
    const seen: string[] = [];
    const store = createMemoryCreatorNotesStore();
    const result = await runCreatorNoteExtraction(
      {
        transcript: {
          sourceItemId: V19_SOURCE,
          creatorId: 'meidastouch',
          creatorName: 'MeidasTouch',
          sourceTitle: 'Meidas V1.9 regression',
          sourceUrl: 'https://example.test/meidas',
          publishedAt: '2026-09-22T00:00:00.000Z',
          sourceIdentityKey: V19_SOURCE,
          segments,
        },
        dryRun: false,
        contentRoleDiagnostics: true,
      },
      {
        store,
        aiConfig: TEST_AI,
        id: (() => {
          let n = 0;
          return () => `v19-${++n}`;
        })(),
        log: () => {},
        extractChunk: async ({ chunk }) => {
          seen.push(chunk.text);
          expect(chunk.contentRole).toBe('editorial');
          for (const pattern of EXCLUDED_V19) {
            expect(chunk.text).not.toMatch(pattern);
          }
          const notes: RawCreatorNote[] = [];
          if (/Russia's war in Ukraine/i.test(chunk.text)) {
            notes.push({
              kind: 'event',
              startSeconds: null,
              endSeconds: null,
              text: "Russia's war in Ukraine continues to escalate.",
              attribution: null,
              eventFeatures: null,
              sourceExcerpt: null,
              sourceQuote: "All hell continues to break loose in connection with Russia's war in Ukraine.",
              exactQuote: "All hell continues to break loose in connection with Russia's war in Ukraine.",
              sourceSegmentIndexes: [],
            });
            notes.push({
              kind: 'context',
              startSeconds: null,
              endSeconds: null,
              text: 'Use offer code DIFFERENCE for select plans.',
              attribution: null,
              eventFeatures: null,
              sourceExcerpt: null,
              sourceQuote: "All hell continues to break loose in connection with Russia's war in Ukraine.",
              exactQuote: "All hell continues to break loose in connection with Russia's war in Ukraine.",
              sourceSegmentIndexes: [],
            });
          }
          if (/diesel price under control/i.test(chunk.text)) {
            notes.push({
              kind: 'creator_analysis',
              startSeconds: null,
              endSeconds: null,
              text: 'The creator says the diesel price has to be brought under control.',
              attribution: 'MeidasTouch',
              eventFeatures: null,
              sourceExcerpt: null,
              sourceQuote: 'we need to bring the diesel price under control',
              exactQuote: 'we need to bring the diesel price under control',
              sourceSegmentIndexes: [],
            });
          }
          if (/Eastern Estonia/i.test(chunk.text)) {
            notes.push({
              kind: 'creator_analysis',
              startSeconds: null,
              endSeconds: null,
              text: 'The creator points to Eastern Estonia as an escalation risk.',
              attribution: 'MeidasTouch',
              eventFeatures: null,
              sourceExcerpt: null,
              sourceQuote: 'Look at Eastern Estonia.',
              exactQuote: 'Look at Eastern Estonia.',
              sourceSegmentIndexes: [],
            });
          }
          return { notes, rejected: 0 };
        },
      },
    );

    const prepared = prepareAtomicNoteEvidenceWindows(segments);
    expect(seen).toEqual(prepared.editorialWindows.map((window) => window.text));
    expect(result.notes.map((note) => note.text).join('\n')).toMatch(/Ukraine/i);
    expect(result.notes.map((note) => note.text).join('\n')).toMatch(/diesel price/i);
    expect(result.notes.map((note) => note.text).join('\n')).toMatch(/Eastern Estonia/i);
    expect(result.notes.map((note) => note.text).join('\n')).not.toMatch(/offer code|Cassina|seafood|end of the discussion/i);
    expect(result.notes.every((note) => note.contentRole === 'editorial')).toBe(true);
    expect(result.contentRoles?.nonEditorialNotesDropped).toBeGreaterThan(0);
    expect(store.notes.every((note) => note.contentRole === 'editorial')).toBe(true);
    expect(store.notes.map((note) => note.text).join('\n')).not.toMatch(/offer code/i);

    const report = formatCreatorNotesReport(result);
    expect(report).toContain('uncertain segments:');
    expect(report).toContain('segments excluded from Atomic Notes:');
    expect(report).toContain('editorial windows created:');
    expect(report).toMatch(/\[\d+\].*sponsor_read cue:offer_code/);
    expect(report).toMatch(/\[\d+\].*housekeeping cue:/);
    expect(report).toMatch(/\[\d+\].*uncertain non_speech/);

    const leaked = await store.insertNotes([
      storedNote({
        id: 'sponsor-leak',
        noteFingerprint: 'fp-sponsor-leak',
        contentRole: 'sponsor_read',
        text: 'Use offer code DIFFERENCE for 50% off select plans.',
        exactQuote: 'Use offer code DIFFERENCE for 50% off select plans.',
      }),
      storedNote({
        id: 'uncertain-leak',
        noteFingerprint: 'fp-uncertain-leak',
        contentRole: 'uncertain',
        text: 'Unclassified span.',
      }),
      storedNote({
        id: 'missing-role',
        noteFingerprint: 'fp-missing-role',
        contentRole: undefined,
        text: 'Missing role must not default to editorial.',
      }),
    ]);
    expect(leaked.written).toBe(0);
    expect(store.notes.map((note) => note.id)).not.toContain('sponsor-leak');

    const review = formatCreatorNotesReview({
      readOnly: true,
      noteCount: 1,
      groups: [
        {
          sourceItemId: V19_SOURCE,
          creatorId: 'meidastouch',
          creatorName: 'MeidasTouch',
          title: 'Meidas',
          publishedAt: null,
          sourceUrl: null,
          runId: 'efe3a16b-52b3-4a73-a62f-5908c0bffdda',
          notes: [storedNote({ contentRole: 'editorial', text: "Russia's war in Ukraine continues to escalate." })],
        },
      ],
    });
    expect(review).toContain('Content role: editorial');
    expect(
      formatCreatorNotesReview({
        readOnly: true,
        noteCount: 1,
        groups: [
          {
            sourceItemId: V19_SOURCE,
            creatorId: 'meidastouch',
            creatorName: 'MeidasTouch',
            title: 'Meidas',
            publishedAt: null,
            sourceUrl: null,
            runId: 'efe3a16b-52b3-4a73-a62f-5908c0bffdda',
            notes: [storedNote({ contentRole: 'sponsor_read', text: 'Stored sponsor row.' })],
          },
        ],
      }),
    ).toContain('Content role: sponsor_read');
    expect(
      parseCreatorNotesPodcastExtractArgs(['--source-item', V19_SOURCE, '--content-role-diagnostics']).contentRoleDiagnostics,
    ).toBe(true);
  });
});
