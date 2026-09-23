import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { classifyCaptionFailure, runCreatorNotesBatch } from '@/lib/creatorNotes/batch';
import {
  CREATOR_NOTE_EXTRACTION_VERSION,
  CREATOR_NOTES_BATCH_DEFAULT_LIMIT,
  CREATOR_NOTES_BATCH_DEFAULT_SINCE_HOURS,
  CREATOR_NOTES_BATCH_HARD_MAX,
  CREATOR_NOTES_BATCH_MAX_SINCE_HOURS,
  CREATOR_NOTES_REVIEW_DEFAULT_LIMIT,
} from '@/lib/creatorNotes/constants';
import { createMemoryCreatorNotesStore, reviewMemoryCreatorNotes } from '@/lib/creatorNotes/db';
import {
  emptyTranscriptError,
  malformedCaptionsError,
  noCaptionTracksError,
} from '@/lib/creatorNotes/errors';
import {
  formatCreatorNotesBatchReport,
  formatCreatorNotesReview,
  parseCreatorNotesBatchArgs,
  parseCreatorNotesReviewArgs,
} from '@/lib/creatorNotes/format';
import { hashCreatorTranscript } from '@/lib/creatorNotes/identity';
import { reviewCreatorNotes } from '@/lib/creatorNotes/review';
import { acquireCreatorNotesRunLock } from '@/lib/creatorNotes/runLock';
import {
  clampCreatorNotesBatchLimit,
  clampCreatorNotesSinceHours,
  selectEligibleCreatorNotesItems,
} from '@/lib/creatorNotes/select';
import type { CreatorNoteRun, CreatorNotesBatchArgs, CreatorTranscriptInput, ResolvedCreatorSource } from '@/lib/creatorNotes/types';
import { mockExtractChunk, loadSyntheticTranscript } from './helpers';

const NOW = new Date('2026-09-18T10:32:00.000Z');
const TEST_AI = {
  provider: 'test',
  model: 'test-model',
  baseUrl: 'http://127.0.0.1:9',
  timeoutMs: 1,
  retries: 0,
};

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function voiceItem(overrides: Partial<{
  sourceItemId: string;
  sourceId: string | null;
  title: string | null;
  url: string;
  publishedAt: string | null;
  creatorId: string | null;
  creatorName: string | null;
}> = {}) {
  const id = overrides.sourceItemId || 'yt:video:dQw4w9WgXcQ';
  return {
    sourceItemId: id,
    sourceId: overrides.sourceId === undefined ? id : overrides.sourceId,
    title: overrides.title === undefined ? 'DEAR GOD: This is OFF THE RAILS' : overrides.title,
    url: overrides.url || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    publishedAt: overrides.publishedAt === undefined ? hoursAgo(6) : overrides.publishedAt,
    creatorId: overrides.creatorId === undefined ? 'david-pakman' : overrides.creatorId,
    creatorName: overrides.creatorName === undefined ? 'David Pakman' : overrides.creatorName,
  };
}

function transcriptFor(source: ResolvedCreatorSource): CreatorTranscriptInput {
  return {
    ...loadSyntheticTranscript(source.sourceItemId),
    creatorId: source.creatorId,
    creatorName: source.creatorName,
    sourceTitle: source.title,
    sourceUrl: source.url,
    publishedAt: source.publishedAt,
    sourceIdentityKey: source.url,
  };
}

function mockFetch(source: ResolvedCreatorSource) {
  const transcript = transcriptFor(source);
  return {
    transcript,
    acquisition: {
      source: 'youtube-captions' as const,
      language: 'en',
      generated: 'no' as const,
      rawSegments: transcript.segments.length,
      normalizedSegments: transcript.segments.length,
      durationCoveredSeconds: 140,
      characters: transcript.segments.reduce((sum, segment) => sum + segment.text.length, 0),
    },
  };
}

function ids(prefix: string) {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

async function runBatch(
  items: ReturnType<typeof voiceItem>[],
  opts: Partial<CreatorNotesBatchArgs> = {},
  extra: Parameters<typeof runCreatorNotesBatch>[1] = {},
) {
  const store = extra.store || createMemoryCreatorNotesStore();
  const memoryStore = store as ReturnType<typeof createMemoryCreatorNotesStore>;
  const result = await runCreatorNotesBatch(
    {
      limit: 10,
      dryRun: false,
      force: false,
      creator: null,
      sinceHours: 48,
      json: false,
      transcribeAudio: false,
      ...opts,
    },
    {
      listVoiceItems: async () => items,
      fetchTranscript: async (source) => mockFetch(source),
      extractChunk: mockExtractChunk(),
      now: () => NOW,
      id: extra.id || ids('batch'),
      aiConfig: TEST_AI,
      skipLock: extra.skipLock !== false,
      skipWarmup: true,
      log: () => {},
      ...extra,
      youtubeBatchEnabled: extra.youtubeBatchEnabled !== false,
      store: memoryStore,
    },
  );
  return { result, store: memoryStore };
}

describe('Atomic Creator Notes batch selection', () => {
  it('selects newest eligible Voice items first with stable ties', () => {
    const older = voiceItem({
      sourceItemId: 'yt:video:aaaaaaaaaaa',
      url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      publishedAt: hoursAgo(10),
      title: 'Older',
    });
    const newerB = voiceItem({
      sourceItemId: 'yt:video:bbbbbbbbbbb',
      url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
      publishedAt: hoursAgo(1),
      title: 'Newer B',
    });
    const newerA = voiceItem({
      sourceItemId: 'yt:video:aaaaaaaaaab',
      url: 'https://www.youtube.com/watch?v=aaaaaaaaaab',
      publishedAt: hoursAgo(1),
      title: 'Newer A',
    });
    const selected = selectEligibleCreatorNotesItems([older, newerB, newerA], { now: NOW, limit: 10, youtubeBatchEnabled: true });
    expect(selected.map((item) => item.sourceItemId)).toEqual([
      'yt:video:aaaaaaaaaab',
      'yt:video:bbbbbbbbbbb',
      'yt:video:aaaaaaaaaaa',
    ]);
  });

  it('uses a default 48-hour recency window', () => {
    const inside = voiceItem({ sourceItemId: 'yt:video:inside00001', url: 'https://www.youtube.com/watch?v=inside00001', publishedAt: hoursAgo(47) });
    const outside = voiceItem({ sourceItemId: 'yt:video:outside0001', url: 'https://www.youtube.com/watch?v=outside0001', publishedAt: hoursAgo(49) });
    const selected = selectEligibleCreatorNotesItems([inside, outside], { now: NOW, youtubeBatchEnabled: true });
    expect(selected.map((item) => item.sourceItemId)).toEqual(['yt:video:inside00001']);
    expect(CREATOR_NOTES_BATCH_DEFAULT_SINCE_HOURS).toBe(48);
  });

  it('honors explicit --since-hours and clamps the maximum', () => {
    const dayOld = voiceItem({
      sourceItemId: 'yt:video:dayold00001',
      url: 'https://www.youtube.com/watch?v=dayold00001',
      publishedAt: hoursAgo(72),
    });
    expect(selectEligibleCreatorNotesItems([dayOld], { now: NOW, sinceHours: 24, youtubeBatchEnabled: true })).toEqual([]);
    expect(selectEligibleCreatorNotesItems([dayOld], { now: NOW, sinceHours: 96, youtubeBatchEnabled: true }).map((item) => item.sourceItemId)).toEqual([
      'yt:video:dayold00001',
    ]);
    expect(clampCreatorNotesSinceHours(999)).toBe(CREATOR_NOTES_BATCH_MAX_SINCE_HOURS);
    expect(parseCreatorNotesBatchArgs(['--since-hours', '999']).sinceHours).toBe(168);
  });

  it('enforces the requested limit and the hard maximum of 50', () => {
    const items = Array.from({ length: 60 }, (_, index) => {
      const id = `vid${String(index).padStart(8, '0')}`;
      return voiceItem({
        sourceItemId: `yt:video:${id}`,
        url: `https://www.youtube.com/watch?v=${id}`,
        publishedAt: hoursAgo(index * 0.2),
      });
    });
    expect(selectEligibleCreatorNotesItems(items, { now: NOW, limit: 3, youtubeBatchEnabled: true })).toHaveLength(3);
    expect(selectEligibleCreatorNotesItems(items, { now: NOW, limit: 999, youtubeBatchEnabled: true })).toHaveLength(CREATOR_NOTES_BATCH_HARD_MAX);
    expect(clampCreatorNotesBatchLimit(999)).toBe(50);
    expect(parseCreatorNotesBatchArgs(['--limit', '999']).limit).toBe(50);
    expect(parseCreatorNotesBatchArgs([]).limit).toBe(CREATOR_NOTES_BATCH_DEFAULT_LIMIT);
  });

  it('is YouTube-only and ignores Intel/Newswire-shaped rows', () => {
    const youtube = voiceItem();
    const podcast = voiceItem({
      sourceItemId: 'pca:episode:abc',
      sourceId: 'pca:episode:abc',
      url: 'https://pca.st/episode/abc',
      title: 'Pocket Casts episode',
    });
    const selected = selectEligibleCreatorNotesItems([youtube, podcast], { now: NOW, youtubeBatchEnabled: true });
    expect(selected).toEqual([youtube]);
  });

  it('removes duplicate Voice identities, keeping the newest', () => {
    const older = voiceItem({
      sourceItemId: 'yt:video:dQw4w9WgXcQ',
      publishedAt: hoursAgo(20),
      title: 'Older copy',
    });
    const newer = voiceItem({
      sourceItemId: 'dQw4w9WgXcQ',
      sourceId: 'yt:dQw4w9WgXcQ',
      url: 'https://youtu.be/dQw4w9WgXcQ',
      publishedAt: hoursAgo(2),
      title: 'Newer copy',
    });
    const selected = selectEligibleCreatorNotesItems([older, newer], { now: NOW, youtubeBatchEnabled: true });
    expect(selected).toHaveLength(1);
    expect(selected[0].title).toBe('Newer copy');
  });
});

describe('Atomic Creator Notes batch processing', () => {
  it('skips a completed equivalent run and retries a failed prior run', async () => {
    const item = voiceItem();
    const transcript = transcriptFor({
      sourceItemId: item.sourceItemId,
      creatorId: item.creatorId,
      creatorName: item.creatorName,
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
      provider: 'youtube',
      externalId: 'dQw4w9WgXcQ',
    });
    const success: CreatorNoteRun = {
      id: 'prior-success',
      sourceItemId: item.sourceItemId,
      sourceIdentityKey: item.url,
      creatorId: item.creatorId,
      modelProvider: TEST_AI.provider,
      modelName: TEST_AI.model,
      extractionVersion: CREATOR_NOTE_EXTRACTION_VERSION,
      transcriptHash: hashCreatorTranscript(transcript.segments),
      status: 'success',
      inputChars: 10,
      notesCreated: 3,
      startedAt: hoursAgo(1),
      completedAt: hoursAgo(1),
      errorMessage: null,
      createdAt: hoursAgo(1),
    };
    const failedItem = voiceItem({
      sourceItemId: 'yt:video:failed00001',
      url: 'https://www.youtube.com/watch?v=failed00001',
      publishedAt: hoursAgo(3),
    });
    const failedTranscript = transcriptFor({
      sourceItemId: failedItem.sourceItemId,
      creatorId: failedItem.creatorId,
      creatorName: failedItem.creatorName,
      title: failedItem.title,
      url: failedItem.url,
      publishedAt: failedItem.publishedAt,
      provider: 'youtube',
      externalId: 'failed00001',
    });
    const failedRun: CreatorNoteRun = {
      ...success,
      id: 'prior-failed',
      sourceItemId: failedItem.sourceItemId,
      transcriptHash: hashCreatorTranscript(failedTranscript.segments),
      status: 'failed',
      notesCreated: 0,
      errorMessage: 'previous boom',
    };
    const store = createMemoryCreatorNotesStore({ runs: [success, failedRun] });
    const { result } = await runBatch([item, failedItem], { limit: 10 }, { store, id: ids('skip-retry') });
    expect(result.summary.alreadyProcessed).toBe(1);
    expect(result.summary.processed).toBe(1);
    expect(result.items.find((row) => row.sourceItemId === item.sourceItemId)?.outcome).toBe('already_processed');
    expect(result.items.find((row) => row.sourceItemId === failedItem.sourceItemId)?.outcome).toBe('processed');
    expect(store.notes.length).toBeGreaterThan(0);
    expect(store.notes.every((note) => note.sourceItemId === failedItem.sourceItemId)).toBe(true);
  });

  it('continues after one item failure', async () => {
    const ok1 = voiceItem({ sourceItemId: 'yt:video:okitem00001', url: 'https://www.youtube.com/watch?v=okitem00001', publishedAt: hoursAgo(1) });
    const bad = voiceItem({ sourceItemId: 'yt:video:baditem0001', url: 'https://www.youtube.com/watch?v=baditem0001', publishedAt: hoursAgo(2) });
    const ok2 = voiceItem({ sourceItemId: 'yt:video:okitem00002', url: 'https://www.youtube.com/watch?v=okitem00002', publishedAt: hoursAgo(3) });
    const { result } = await runBatch([ok1, bad, ok2], { limit: 10 }, {
      extractChunk: async ({ transcript }) => {
        if (transcript.sourceItemId === bad.sourceItemId) throw new Error('ollama exploded');
        return mockExtractChunk()();
      },
      id: ids('continue'),
    });
    expect(result.summary.processed).toBe(2);
    expect(result.summary.failed).toBe(1);
    expect(result.items).toHaveLength(3);
  });

  it('classifies caption failures without aborting the batch', async () => {
    expect(classifyCaptionFailure(noCaptionTracksError())).toBe('no_captions');
    expect(classifyCaptionFailure(emptyTranscriptError())).toBe('empty_transcript');
    expect(classifyCaptionFailure(malformedCaptionsError())).toBe('malformed_captions');
    const ok = voiceItem({ sourceItemId: 'yt:video:okcaps00001', url: 'https://www.youtube.com/watch?v=okcaps00001' });
    const none = voiceItem({ sourceItemId: 'yt:video:nocaps00001', url: 'https://www.youtube.com/watch?v=nocaps00001', publishedAt: hoursAgo(4) });
    const { result } = await runBatch([ok, none], { limit: 10 }, {
      fetchTranscript: async (source) => {
        if (source.sourceItemId === none.sourceItemId) throw noCaptionTracksError();
        return mockFetch(source);
      },
      id: ids('caps'),
    });
    expect(result.summary.noCaptions).toBe(1);
    expect(result.summary.captionFailures.no_captions).toBe(1);
    expect(result.summary.processed).toBe(1);
    expect(result.items.find((row) => row.sourceItemId === none.sourceItemId)?.outcome).toBe('no_captions');
  });

  it('propagates source metadata onto extracted notes and persists them', async () => {
    const item = voiceItem();
    const { result, store } = await runBatch([item], { limit: 10 }, { id: ids('meta') });
    expect(result.items[0]).toMatchObject({
      creatorName: 'David Pakman',
      title: 'DEAR GOD: This is OFF THE RAILS',
      url: item.url,
    });
    expect(store.notes.length).toBeGreaterThan(0);
    expect(store.notes.every((note) => note.sourceItemId === item.sourceItemId)).toBe(true);
    expect(store.notes.every((note) => note.creatorId === 'david-pakman')).toBe(true);
    expect(store.writes.runs).toBeGreaterThan(0);
    expect(result.summary.persistence.notesWritten).toBe(store.notes.length);
  });

  it('dry-run performs zero writes', async () => {
    const store = createMemoryCreatorNotesStore();
    const { result } = await runBatch([voiceItem()], { limit: 10, dryRun: true }, { store, id: ids('dry') });
    expect(result.summary.processed).toBe(1);
    expect(result.summary.persistence.dryRun).toBe(true);
    expect(result.summary.persistence.notesWritten).toBe(0);
    expect(store.writeCount()).toBe(0);
    expect(store.notes).toHaveLength(0);
    expect(store.runs).toHaveLength(0);
  });

  it('prints creator distribution and summary counts', async () => {
    const pakman = voiceItem();
    const meidas = voiceItem({
      sourceItemId: 'yt:video:meidas00001',
      url: 'https://www.youtube.com/watch?v=meidas00001',
      creatorId: 'meidastouch',
      creatorName: 'MeidasTouch',
      publishedAt: hoursAgo(2),
    });
    const { result } = await runBatch([pakman, meidas], { limit: 10 }, { id: ids('dist') });
    const report = formatCreatorNotesBatchReport(result);
    expect(report).toContain('Atomic Creator Notes Batch');
    expect(report).toContain('Candidate Voice items: 2');
    expect(report).toContain('Processed: 2');
    expect(report).toMatch(/David Pakman/);
    expect(report).toMatch(/MeidasTouch/);
    expect(result.summary.creators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ creatorName: 'David Pakman', items: 1 }),
        expect.objectContaining({ creatorName: 'MeidasTouch', items: 1 }),
      ]),
    );
    expect(result.summary.notes.total).toBeGreaterThan(0);
    expect(result.summary.notes.claim).toBeGreaterThan(0);
  });

  it('processes items sequentially rather than concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    const a = voiceItem({ sourceItemId: 'yt:video:seq00000001', url: 'https://www.youtube.com/watch?v=seq00000001', publishedAt: hoursAgo(1) });
    const b = voiceItem({ sourceItemId: 'yt:video:seq00000002', url: 'https://www.youtube.com/watch?v=seq00000002', publishedAt: hoursAgo(2) });
    await runBatch([a, b], { limit: 10 }, {
      extractChunk: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 25));
        active -= 1;
        return mockExtractChunk()();
      },
      id: ids('seq'),
    });
    expect(maxActive).toBe(1);
  });

  it('does not write Theme Memory or ranking state', async () => {
    const store = createMemoryCreatorNotesStore();
    await runBatch([voiceItem()], { limit: 10 }, { store, id: ids('iso') });
    expect(store.notes.every((note) => !('themeId' in note))).toBe(true);
    const files = ['batch.ts', 'select.ts', 'review.ts', 'runLock.ts'];
    for (const file of files) {
      const src = readFileSync(path.join(process.cwd(), 'lib/creatorNotes', file), 'utf8');
      expect(src).not.toMatch(/themeMemory\/themesDb/);
      expect(src).not.toMatch(/theme_memberships/);
      expect(src).not.toMatch(/theme_daily_signals/);
      expect(src).not.toMatch(/theme_observations/);
      expect(src).not.toMatch(/from\('themes'\)/);
    }
  });
});

describe('Atomic Creator Notes batch lock', () => {
  it('exits cleanly when another batch is already running', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'creator-notes-lock-'));
    const lockPath = path.join(dir, 'batch.lock');
    const held = acquireCreatorNotesRunLock(lockPath);
    const { result } = await runBatch([voiceItem()], { limit: 10 }, {
      skipLock: false,
      lockPath,
      id: ids('lock'),
    });
    expect(result.lockBusy).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.overallStatus).toBe('skipped');
    expect(formatCreatorNotesBatchReport(result)).toMatch(/already running/i);
    held.release();
  });
});

describe('Atomic Creator Notes review', () => {
  it('is read-only and groups notes by source item', async () => {
    const item = voiceItem();
    const { store } = await runBatch([item], { limit: 10 }, { id: ids('review') });
    const writesBefore = store.writeCount();
    const review = reviewMemoryCreatorNotes(
      store,
      { limit: CREATOR_NOTES_REVIEW_DEFAULT_LIMIT },
      [item],
    );
    expect(review.readOnly).toBe(true);
    expect(store.writeCount()).toBe(writesBefore);
    expect(review.groups).toHaveLength(1);
    expect(review.groups[0].creatorName).toBe('David Pakman');
    expect(review.groups[0].title).toBe(item.title);
    expect(review.groups[0].notes.length).toBeGreaterThan(0);
    const rendered = formatCreatorNotesReview(review);
    expect(rendered).toContain('David Pakman');
    expect(rendered).toContain('CLAIM');
    expect(rendered).toContain('Evidence:');
    expect(parseCreatorNotesReviewArgs([]).limit).toBe(25);
    expect(parseCreatorNotesReviewArgs(['--limit', '50']).limit).toBe(50);

    const src = readFileSync(path.join(process.cwd(), 'lib/creatorNotes/review.ts'), 'utf8');
    expect(src).not.toMatch(/insertRun|insertNotes|updateRun|\.insert\(|\.update\(/);
  });

  it('filters review output without writing', () => {
    const notes = [
      {
        id: 'n1',
        sourceItemId: 'yt:video:aaa',
        creatorId: 'david-pakman',
        startSeconds: 12,
        endSeconds: 20,
        kind: 'claim' as const,
        text: 'A factual assertion made by the speaker about the court stay.',
        attribution: 'David Pakman',
        eventFeatures: null,
        sourceExcerpt: 'verbatim excerpt',
        exactQuote: null,
        sourceSegmentIndexes: [1],
        verificationStatus: 'unverified' as const,
        extractionRunId: 'run-1',
        noteFingerprint: 'fp-1',
        createdAt: NOW.toISOString(),
      },
      {
        id: 'n2',
        sourceItemId: 'yt:video:bbb',
        creatorId: 'meidastouch',
        startSeconds: 40,
        endSeconds: 55,
        kind: 'why_it_matters' as const,
        text: 'The speaker argues the stay affects other cities within days.',
        attribution: 'MeidasTouch',
        eventFeatures: null,
        sourceExcerpt: 'another excerpt',
        exactQuote: null,
        sourceSegmentIndexes: [2],
        verificationStatus: 'not_applicable' as const,
        extractionRunId: 'run-2',
        noteFingerprint: 'fp-2',
        createdAt: NOW.toISOString(),
      },
    ];
    const filtered = reviewCreatorNotes({
      notes,
      query: { limit: 50, creator: 'david-pakman', kind: 'claim' },
    });
    expect(filtered.groups).toHaveLength(1);
    expect(filtered.groups[0].notes).toHaveLength(1);
    expect(filtered.readOnly).toBe(true);
  });
});

describe('creator-notes library isolation scan', () => {
  it('keeps creator-notes files free of Theme Memory mutation APIs', () => {
    const dir = path.join(process.cwd(), 'lib/creatorNotes');
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts')) continue;
      const src = readFileSync(path.join(dir, file), 'utf8');
      expect(src).not.toMatch(/themeMemory\/themesDb/);
      expect(src).not.toMatch(/theme_memberships/);
      expect(src).not.toMatch(/theme_daily_signals/);
      expect(src).not.toMatch(/processThemeMemory/);
      expect(src).not.toMatch(/from\('themes'\)/);
    }
  });
});
