import { describe, expect, it } from 'vitest';

import {
  buildBriefEventsCorpus,
  formatTranscriptRange,
  headlineLooksLikeUnsupportedCoverup,
  isEligibleBriefEventNote,
  selectBriefEventHeadline,
} from '@/lib/briefEvents';
import { selectBriefEpisodes } from '@/lib/creatorNotes/brief';
import { CREATOR_NOTE_EXTRACTION_VERSION } from '@/lib/creatorNotes/constants';

function run(overrides = {}) {
  return {
    id: 'run-1',
    sourceItemId: 'episode-1',
    sourceIdentityKey: null,
    creatorId: 'meidas',
    modelProvider: 'ollama',
    modelName: 'gemma3:4b',
    extractionVersion: CREATOR_NOTE_EXTRACTION_VERSION,
    transcriptHash: 'hash',
    status: 'success',
    inputChars: 100,
    notesCreated: 1,
    startedAt: '2026-09-24T00:00:00.000Z',
    completedAt: '2026-09-24T01:00:00.000Z',
    errorMessage: null,
    createdAt: '2026-09-24T00:00:00.000Z',
    ...overrides,
  };
}

function casualtyFeatures(overrides = {}) {
  return {
    actors: ['U.S. officials'],
    action: 'reports',
    object: 'military fatalities',
    institutions: [],
    locations: [],
    referencedDocuments: [],
    ...overrides,
  };
}

function note(overrides = {}) {
  return {
    id: 'note-1',
    sourceItemId: 'episode-1',
    creatorId: 'meidas',
    startSeconds: 547,
    endSeconds: 592,
    kind: 'event',
    text: 'The Pentagon publicly reports 19 military fatalities.',
    attribution: 'MeidasTouch Network',
    eventFeatures: casualtyFeatures(),
    sourceExcerpt: 'Pentagon publicly reports 19 fatalities',
    sourceQuote: '19 fatalities',
    exactQuote: '19 fatalities',
    sourceSegmentIndexes: [10],
    contentRole: 'editorial',
    verificationStatus: 'unverified',
    extractionRunId: 'run-1',
    noteFingerprint: 'fp-1',
    createdAt: '2026-09-24T01:00:00.000Z',
    ...overrides,
  };
}

function episodesFromNotes(notes, meta = {}) {
  return selectBriefEpisodes({
    runs: [run()],
    notes,
    metas: [
      {
        sourceItemId: 'episode-1',
        creatorName: 'MeidasTouch Network',
        title: 'Daily Brief',
        publishedAt: '2026-09-24T15:00:00.000Z',
        sourceUrl: null,
        transcriptSource: null,
        ...meta,
      },
    ],
  });
}

function eventsFromNotes(notes, meta = {}) {
  return buildBriefEventsCorpus(episodesFromNotes(notes, meta));
}

describe('brief Event Candidates', () => {
  it('A: groups Pentagon casualty cluster into one Event Candidate with factual headline', () => {
    const notes = [
      note({
        id: 'n-pentagon-19',
        kind: 'new_development',
        startSeconds: 547,
        endSeconds: 560,
        text: 'The Pentagon publicly reports 19 military fatalities.',
        statementRole: 'unknown',
      }),
      note({
        id: 'n-officials-22',
        kind: 'claim',
        startSeconds: 561,
        endSeconds: 575,
        text: 'Other U.S. officials reportedly say the military death count is 22 to 23.',
        statementRole: 'reported',
        referencedSource: 'U.S. officials',
        eventFeatures: casualtyFeatures({ action: 'says', object: 'military death count' }),
      }),
      note({
        id: 'n-analysis',
        kind: 'creator_analysis',
        startSeconds: 576,
        endSeconds: 585,
        text: 'This suggests a deliberate cover-up of the true fatality count.',
        statementRole: 'creator',
        attribution: 'MeidasTouch Network',
        eventFeatures: casualtyFeatures({ action: 'argues', object: 'military fatalities' }),
      }),
      note({
        id: 'n-why',
        kind: 'why_it_matters',
        startSeconds: 586,
        endSeconds: 592,
        text: 'Conflicting military fatality figures undermine public accountability for wartime losses.',
        statementRole: 'creator',
        eventFeatures: casualtyFeatures({ action: null, object: 'military fatalities' }),
      }),
    ];

    const corpus = eventsFromNotes(notes);
    expect(corpus.eventCount).toBe(1);
    const event = corpus.days[0].events[0];
    expect(event.noteCount).toBe(4);
    expect(event.headline.toLowerCase()).toContain('casualty');
    expect(event.headline.toLowerCase()).toMatch(/conflict|conflicts/);
    expect(headlineLooksLikeUnsupportedCoverup(event.headline)).toBe(false);
    expect(event.headline.toLowerCase()).not.toContain('deliberately');
    expect(event.headline.toLowerCase()).not.toMatch(/covers? up/);
    expect(event.creatorAnalysis).toHaveLength(1);
    expect(event.whyItMatters).toHaveLength(1);
    expect(event.creators.some((c) => c.name === 'MeidasTouch Network')).toBe(true);
  });

  it('B: keeps unrelated Iran stories as separate Event Candidates', () => {
    const notes = [
      note({
        id: 'iran-missile',
        startSeconds: 100,
        endSeconds: 120,
        text: 'Iran launched missiles near Hormuz.',
        eventFeatures: {
          actors: ['Iran'],
          action: 'launched',
          object: 'missiles',
          institutions: [],
          locations: ['Hormuz'],
          referencedDocuments: [],
        },
      }),
      note({
        id: 'iran-lloyds',
        startSeconds: 200,
        endSeconds: 220,
        text: "Lloyd's paused tanker underwriting for Gulf routes.",
        eventFeatures: {
          actors: ["Lloyd's"],
          action: 'paused',
          object: 'tanker underwriting',
          institutions: ["Lloyd's"],
          locations: ['Gulf'],
          referencedDocuments: [],
        },
      }),
      note({
        id: 'iran-pipeline',
        startSeconds: 300,
        endSeconds: 320,
        text: 'A pipeline near Fujairah was damaged.',
        eventFeatures: {
          actors: [],
          action: 'damaged',
          object: 'pipeline',
          institutions: [],
          locations: ['Fujairah'],
          referencedDocuments: [],
        },
      }),
      note({
        id: 'iran-uuv',
        startSeconds: 400,
        endSeconds: 420,
        text: 'Iran captured a UUV.',
        eventFeatures: {
          actors: ['Iran'],
          action: 'captured',
          object: 'UUV',
          institutions: [],
          locations: [],
          referencedDocuments: [],
        },
      }),
    ];

    const corpus = eventsFromNotes(notes);
    expect(corpus.eventCount).toBe(4);
    expect(corpus.days[0].events.every((event) => event.noteCount === 1)).toBe(true);
  });

  it('C: excludes sponsor_read content from Event Candidates', () => {
    const notes = [
      note({
        id: 'sponsor',
        kind: 'context',
        text: 'with financing to fit any budget and lightning fast shipping',
        contentRole: 'sponsor_read',
        eventFeatures: null,
        sourceExcerpt: 'financing to fit any budget and lightning fast shipping from wild alaskan',
        sourceQuote: 'lightning fast shipping',
        exactQuote: 'lightning fast shipping',
      }),
      note({
        id: 'editorial',
        kind: 'event',
        startSeconds: 800,
        text: 'A federal judge granted an injunction restoring media access.',
        eventFeatures: {
          actors: [],
          action: 'granted',
          object: 'injunction',
          institutions: [],
          locations: [],
          referencedDocuments: [],
        },
      }),
    ];

    expect(isEligibleBriefEventNote(notes[0])).toBe(false);
    // selectBriefEpisodes already drops non-editorial stored roles; still assert corpus.
    const corpus = eventsFromNotes(notes);
    expect(corpus.eventCount).toBe(1);
    expect(corpus.days[0].events[0].headline.toLowerCase()).toContain('injunction');
    expect(JSON.stringify(corpus).toLowerCase()).not.toContain('lightning fast shipping');
  });

  it('C2: reclassifies legacy editorial-tagged sponsor copy as ineligible', () => {
    const sponsor = note({
      id: 'legacy-sponsor',
      contentRole: 'editorial',
      text: 'with financing to fit any budget and lightning fast shipping',
      sourceExcerpt: 'brought to you by Wild Alaskan Company with financing to fit any budget',
      sourceQuote: 'use code RESIST',
      exactQuote: 'use code RESIST',
      eventFeatures: null,
    });
    expect(isEligibleBriefEventNote(sponsor)).toBe(false);
  });

  it('D: does not promote creator cover-up analysis into the factual headline', () => {
    const notes = [
      note({
        id: 'fact',
        kind: 'event',
        startSeconds: 100,
        endSeconds: 120,
        text: 'The Pentagon publicly reports 19 military fatalities while officials cite higher figures.',
      }),
      note({
        id: 'analysis',
        kind: 'creator_analysis',
        startSeconds: 121,
        endSeconds: 140,
        text: 'This suggests a deliberate cover-up.',
        attribution: 'MeidasTouch Network',
        statementRole: 'creator',
        eventFeatures: casualtyFeatures(),
      }),
    ];

    const corpus = eventsFromNotes(notes);
    expect(corpus.eventCount).toBe(1);
    const event = corpus.days[0].events[0];
    expect(headlineLooksLikeUnsupportedCoverup(event.headline)).toBe(false);
    expect(event.headline.toLowerCase()).not.toMatch(/deliberately covers? up/);
    expect(event.headline.toLowerCase()).not.toBe('pentagon deliberately covers up deaths');
    expect(event.creatorAnalysis).toHaveLength(1);
    expect(event.creatorAnalysis[0].text).toContain('deliberate cover-up');
  });

  it('E: does not force-merge ambiguous weakly related notes', () => {
    const notes = [
      note({
        id: 'court-a',
        startSeconds: 50,
        endSeconds: 70,
        text: 'A district court heard arguments on the surveillance statute.',
        eventFeatures: {
          actors: [],
          action: 'heard',
          object: 'surveillance statute',
          institutions: [],
          locations: [],
          referencedDocuments: [],
        },
      }),
      note({
        id: 'court-b',
        startSeconds: 80,
        endSeconds: 100,
        text: 'Congress scheduled a hearing on government oversight.',
        eventFeatures: {
          actors: [],
          action: 'scheduled',
          object: 'oversight hearing',
          institutions: [],
          locations: [],
          referencedDocuments: [],
        },
      }),
    ];

    const corpus = eventsFromNotes(notes);
    expect(corpus.eventCount).toBe(2);
  });

  it('F: merges strong-overlap factual notes with nearby transcript timestamps', () => {
    const notes = [
      note({
        id: 'near-a',
        kind: 'event',
        startSeconds: 200,
        endSeconds: 220,
        text: 'The maritime exclusion zone was expanded after the navy warning.',
        eventFeatures: {
          actors: [],
          action: 'expanded',
          object: 'maritime exclusion zone',
          institutions: [],
          locations: [],
          referencedDocuments: [],
        },
      }),
      note({
        id: 'near-b',
        kind: 'new_development',
        startSeconds: 230,
        endSeconds: 250,
        text: 'Officials say the exclusion zone now covers additional shipping lanes.',
        eventFeatures: {
          actors: ['Officials'],
          action: 'covers',
          object: 'maritime exclusion zone',
          institutions: [],
          locations: [],
          referencedDocuments: [],
        },
      }),
    ];

    const corpus = eventsFromNotes(notes);
    expect(corpus.eventCount).toBe(1);
    expect(corpus.days[0].events[0].noteCount).toBe(2);
  });

  it('G: expanded event retains all underlying Atomic Notes', () => {
    const notes = [
      note({ id: 'g1', startSeconds: 10, endSeconds: 20 }),
      note({
        id: 'g2',
        kind: 'claim',
        startSeconds: 21,
        endSeconds: 30,
        text: 'Other U.S. officials reportedly say the military death count is 22 to 23.',
        statementRole: 'reported',
        referencedSource: 'U.S. officials',
        eventFeatures: casualtyFeatures({ object: 'military death count' }),
      }),
      note({
        id: 'g3',
        kind: 'evidence_reference',
        startSeconds: 31,
        endSeconds: 40,
        text: 'Source segment cites the Pentagon fatality briefing.',
        eventFeatures: casualtyFeatures({ object: 'military fatalities' }),
      }),
    ];

    const corpus = eventsFromNotes(notes);
    expect(corpus.eventCount).toBe(1);
    const event = corpus.days[0].events[0];
    expect(event.notes.map((n) => n.id).sort()).toEqual(['g1', 'g2', 'g3']);
    expect(event.noteCount).toBe(3);
  });

  it('formats transcript offsets without implying wall-clock time of day', () => {
    expect(formatTranscriptRange(547, 592)).toBe('09:07–09:52');
    expect(formatTranscriptRange(9 * 3600 + 7, 9 * 3600 + 52)).toBe('09:00:07–09:00:52');
  });

  it('selects factual headlines without cover-up language from analysis alone', () => {
    const headline = selectBriefEventHeadline([
      note({
        kind: 'creator_analysis',
        text: 'The Pentagon deliberately covers up deaths.',
      }),
      note({
        id: 'fact-only',
        kind: 'event',
        text: 'The Pentagon publicly reports 19 military fatalities.',
      }),
    ]);
    expect(headline).toBe('The Pentagon publicly reports 19 military fatalities');
    expect(headlineLooksLikeUnsupportedCoverup(headline)).toBe(false);
  });
});
