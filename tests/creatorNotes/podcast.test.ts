import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { createDavidPakmanAdapter, extractDavidPakmanTranscriptParagraphs } from '@/lib/creatorNotes/adapters/davidPakman';
import { CREATOR_NOTES_YOUTUBE_BATCH_ENABLED } from '@/lib/creatorNotes/constants';
import { createMemoryCreatorNotesStore } from '@/lib/creatorNotes/db';
import {
  formatCreatorNotesReport,
  parseCreatorNotesPodcastExtractArgs,
} from '@/lib/creatorNotes/format';
import {
  parseJsonTranscript,
  parseSrtTranscript,
  parseVttTranscript,
  normalizeTranscriptCues,
} from '@/lib/creatorNotes/podcastFormats';
import { matchesPodcastIdentity } from '@/lib/creatorNotes/podcastIdentity';
import { parsePodcastFeedXml } from '@/lib/creatorNotes/podcastRss';
import { preparePodcastCreatorNotesTranscript } from '@/lib/creatorNotes/podcastPrepare';
import { resolvePodcastTranscript } from '@/lib/creatorNotes/podcastTranscript';
import { runCreatorNotesPodcastBatch, selectEligiblePodcastEpisodes } from '@/lib/creatorNotes/podcastBatch';
import { runCreatorNoteExtraction } from '@/lib/creatorNotes/run';
import { selectEligibleCreatorNotesItems } from '@/lib/creatorNotes/select';
import type { PodcastEpisodeSource } from '@/lib/creatorNotes/types';
import { mockExtractChunk, SPECIFIC_NOTES } from './helpers';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'podcast');
const NOW = new Date('2026-09-18T10:32:00.000Z');
const TEST_AI = {
  provider: 'test',
  model: 'test-model',
  baseUrl: 'http://127.0.0.1:9',
  timeoutMs: 1,
  retries: 0,
};

function readFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function episode(overrides: Partial<PodcastEpisodeSource> = {}): PodcastEpisodeSource {
  return {
    sourceItemId: 'guid-ep-vtt',
    creatorId: 'david-pakman',
    creatorName: 'David Pakman',
    feedUrl: 'https://creator.example/feed.xml',
    guid: 'guid-ep-vtt',
    title: 'Episode With VTT',
    episodeUrl: 'https://creator.example/episodes/vtt',
    audioUrl: 'https://creator.example/audio/vtt.mp3',
    publishedAt: hoursAgo(6),
    transcriptCandidates: [
      {
        url: 'https://creator.example/transcripts/ep.vtt',
        mimeType: 'text/vtt',
        language: 'en',
        rel: 'captions',
        source: 'podcast_namespace',
      },
    ],
    ...overrides,
  };
}

describe('podcast RSS transcript discovery', () => {
  it('parses Podcasting 2.0 podcast:transcript VTT candidates', () => {
    const episodes = parsePodcastFeedXml(readFixture('rss-vtt.xml'), {
      feedUrl: 'https://creator.example/feed.xml',
      creatorId: 'david-pakman',
      creatorName: 'David Pakman',
    });
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.transcriptCandidates[0]).toMatchObject({
      url: 'https://creator.example/transcripts/ep.vtt',
      mimeType: 'text/vtt',
      language: 'en',
      rel: 'captions',
      source: 'podcast_namespace',
    });
    expect(episodes[0]?.audioUrl).toContain('.mp3');
  });

  it('parses podcast:transcript SRT candidates', () => {
    const episodes = parsePodcastFeedXml(readFixture('rss-srt.xml'), {
      feedUrl: 'https://creator.example/feed.xml',
      creatorId: 'david-pakman',
      creatorName: 'David Pakman',
    });
    expect(episodes[0]?.transcriptCandidates[0]?.mimeType).toBe('application/x-subrip');
  });

  it('parses RSS without a transcript as having no candidates', () => {
    const episodes = parsePodcastFeedXml(readFixture('rss-no-transcript.xml'), {
      feedUrl: 'https://creator.example/feed.xml',
      creatorId: 'brennan-center',
      creatorName: 'The Briefing - Brennan Center for Justice',
    });
    expect(episodes[0]?.transcriptCandidates).toEqual([]);
  });

  it('keeps a malformed transcript URL as a candidate rather than pretending none exists', () => {
    const episodes = parsePodcastFeedXml(readFixture('rss-malformed-transcript.xml'), {
      feedUrl: 'https://creator.example/feed.xml',
      creatorId: 'david-pakman',
      creatorName: 'David Pakman',
    });
    expect(episodes[0]?.transcriptCandidates.length).toBeGreaterThan(0);
  });
});

describe('VTT and SRT normalization', () => {
  it('parses VTT timestamps, strips tags, and does not rewrite wording', () => {
    const cues = parseVttTranscript(readFixture('sample.vtt'));
    expect(cues.map((cue) => cue.text)).toEqual(['A federal', 'appeals court', 'issued a stay.', 'After the break.']);
    expect(cues[0]?.startSeconds).toBe(0);
    expect(cues[2]?.endSeconds).toBe(7);
  });

  it('parses SRT timestamps without rewriting wording', () => {
    const cues = parseSrtTranscript(readFixture('sample.srt'));
    expect(cues.map((cue) => cue.text)).toEqual(['A federal', 'appeals court', 'issued a stay.', 'After the break.']);
    expect(cues[0]?.startSeconds).toBe(0);
  });

  it('preserves timestamps through tiny-cue merging and does not merge across gaps', () => {
    const segments = normalizeTranscriptCues(parseVttTranscript(readFixture('sample.vtt')));
    expect(segments[0]?.text).toContain('A federal');
    expect(segments[0]?.text).toContain('issued a stay.');
    expect(segments.some((segment) => segment.text === 'After the break.')).toBe(true);
    expect(segments[0]?.startSeconds).toBe(0);
  });

  it('parses understood JSON transcript structure', () => {
    const cues = parseJsonTranscript(
      JSON.stringify({
        segments: [
          { startTime: 0, endTime: 4, body: 'A federal appeals court issued a stay.' },
        ],
      }),
    );
    expect(cues[0]?.text).toBe('A federal appeals court issued a stay.');
    expect(cues[0]?.startSeconds).toBe(0);
  });
});

describe('official transcript adapter', () => {
  it('extracts only the labeled transcript body from the official page', () => {
    const paragraphs = extractDavidPakmanTranscriptParagraphs(readFixture('official-pakman.html'));
    expect(paragraphs?.join(' ')).toContain('A federal appeals court issued a stay');
    expect(paragraphs?.join(' ')).not.toContain('rundown of today');
    expect(extractDavidPakmanTranscriptParagraphs(readFixture('official-pakman-notes.html'))).toBeNull();
  });

  it('resolves an official creator page into transcript provenance', async () => {
    const adapter = createDavidPakmanAdapter(async () => ({
      ok: true,
      status: 200,
      text: readFixture('official-pakman.html'),
    }));
    const transcript = await adapter.resolveTranscript(
      episode({
        episodeUrl: 'https://substack.davidpakman.com/p/preview-example',
        transcriptCandidates: [],
      }),
    );
    expect(transcript?.transcriptSource).toBe('official_creator_page');
    expect(transcript?.transcriptUrl).toContain('substack.davidpakman.com');
    expect(transcript?.segments[0]?.text).toContain('A federal appeals court');
  });
});

describe('podcast transcript resolution statuses', () => {
  it('returns TRANSCRIPT_UNAVAILABLE when RSS has no transcript and no adapter matches', async () => {
    const resolved = await resolvePodcastTranscript(
      episode({
        creatorId: 'brennan-center',
        creatorName: 'The Briefing',
        episodeUrl: 'https://brennancenter.substack.com/p/example',
        transcriptCandidates: [],
      }),
      { adapters: [] },
    );
    expect(resolved.status).toBe('TRANSCRIPT_UNAVAILABLE');
  });

  it('returns TRANSCRIPT_FETCH_FAILED instead of unavailable on network failure', async () => {
    const resolved = await resolvePodcastTranscript(episode(), {
      adapters: [],
      get: async () => {
        throw new Error('ECONNRESET');
      },
    });
    expect(resolved.status).toBe('TRANSCRIPT_FETCH_FAILED');
  });

  it('returns TRANSCRIPT_FORMAT_UNSUPPORTED for unknown payloads', async () => {
    const resolved = await resolvePodcastTranscript(episode(), {
      adapters: [],
      get: async () => ({ ok: true, status: 200, text: '%PDF-1.4 binary', contentType: 'application/pdf' }),
    });
    expect(resolved.status).toBe('TRANSCRIPT_FORMAT_UNSUPPORTED');
  });

  it('returns TRANSCRIPT_PARSE_FAILED for broken JSON', async () => {
    const resolved = await resolvePodcastTranscript(
      episode({
        transcriptCandidates: [
          {
            url: 'https://creator.example/transcripts/ep.json',
            mimeType: 'application/json',
            language: 'en',
            rel: null,
            source: 'podcast_namespace',
          },
        ],
      }),
      {
        adapters: [],
        get: async () => ({ ok: true, status: 200, text: '{not json', contentType: 'application/json' }),
      },
    );
    expect(resolved.status).toBe('TRANSCRIPT_PARSE_FAILED');
  });

  it('returns TRANSCRIPT_EMPTY for an empty VTT', async () => {
    const resolved = await resolvePodcastTranscript(episode(), {
      adapters: [],
      get: async () => ({ ok: true, status: 200, text: 'WEBVTT\n\n', contentType: 'text/vtt' }),
    });
    expect(resolved.status).toBe('TRANSCRIPT_EMPTY');
  });

  it('keeps podcast_namespace provenance on a successful VTT fetch', async () => {
    const resolved = await resolvePodcastTranscript(episode(), {
      adapters: [],
      get: async () => ({ ok: true, status: 200, text: readFixture('sample.vtt'), contentType: 'text/vtt' }),
    });
    expect(resolved.status).toBe('TRANSCRIPT_AVAILABLE');
    expect(resolved.transcript?.transcriptSource).toBe('podcast_namespace');
    expect(resolved.acquisition?.source).toBe('podcast_namespace');
    expect(resolved.acquisition?.transcriptUrl).toBe('https://creator.example/transcripts/ep.vtt');
    expect(resolved.transcript?.segments[0]?.startSeconds).toBe(0);
  });
});

describe('podcast extract and batch', () => {
  it('dry-run extracts notes with zero DB writes', async () => {
    const store = createMemoryCreatorNotesStore();
    const prepared = await preparePodcastCreatorNotesTranscript(
      parseCreatorNotesPodcastExtractArgs(['--source-item', 'guid-ep-vtt', '--dry-run']),
      {
        listEpisodes: async () => [episode()],
        resolveTranscript: async (item) => ({
          status: 'TRANSCRIPT_AVAILABLE',
          transcript: {
            sourceItemId: item.sourceItemId,
            creatorId: item.creatorId,
            creatorName: item.creatorName,
            sourceTitle: item.title,
            sourceUrl: item.episodeUrl,
            publishedAt: item.publishedAt,
            sourceIdentityKey: item.episodeUrl,
            audioUrl: item.audioUrl,
            transcriptSource: 'podcast_namespace',
            transcriptUrl: 'https://creator.example/transcripts/ep.vtt',
            transcriptMimeType: 'text/vtt',
            transcriptLanguage: 'en',
            segments: [
              { index: 0, startSeconds: 14, endSeconds: 38, text: 'Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.' },
            ],
          },
          acquisition: {
            source: 'podcast_namespace',
            language: 'en',
            generated: 'no',
            rawSegments: 4,
            normalizedSegments: 1,
            durationCoveredSeconds: 24,
            characters: 80,
            transcriptUrl: 'https://creator.example/transcripts/ep.vtt',
            transcriptMimeType: 'text/vtt',
            transcriptLanguage: 'en',
          },
          candidate: item.transcriptCandidates[0],
          error: null,
        }),
      },
    );

    const result = await runCreatorNoteExtraction(
      { transcript: prepared.transcript, dryRun: true },
      {
        store,
        extractChunk: mockExtractChunk([{ ...SPECIFIC_NOTES[0], sourceSegmentIndexes: [0] }]),
        aiConfig: TEST_AI,
        id: () => 'podcast-dry',
        log: () => {},
      },
    );
    result.transcriptAcquisition = prepared.acquisition;
    expect(store.writeCount()).toBe(0);
    expect(result.persistence.notesWritten).toBe(0);
    expect(formatCreatorNotesReport(result)).toContain('source: podcast_namespace');
    expect(result.notes[0]?.startSeconds).toBe(14);
  });

  it('persists a successful run and is idempotent for an equivalent transcript', async () => {
    const store = createMemoryCreatorNotesStore();
    const transcript = {
      sourceItemId: 'guid-ep-vtt',
      creatorId: 'david-pakman',
      creatorName: 'David Pakman',
      sourceTitle: 'Episode With VTT',
      sourceUrl: 'https://creator.example/episodes/vtt',
      publishedAt: hoursAgo(6),
      sourceIdentityKey: 'https://creator.example/episodes/vtt',
      audioUrl: 'https://creator.example/audio/vtt.mp3',
      transcriptSource: 'podcast_namespace' as const,
      transcriptUrl: 'https://creator.example/transcripts/ep.vtt',
      transcriptMimeType: 'text/vtt',
      transcriptLanguage: 'en',
      segments: [
        { index: 0, startSeconds: 14, endSeconds: 38, text: 'Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.' },
      ],
    };
    const first = await runCreatorNoteExtraction(
      { transcript, dryRun: false },
      {
        store,
        extractChunk: mockExtractChunk([{ ...SPECIFIC_NOTES[0], sourceSegmentIndexes: [0] }]),
        aiConfig: TEST_AI,
        id: () => 'podcast-write-1',
        log: () => {},
      },
    );
    expect(first.persistence.notesWritten).toBeGreaterThan(0);
    const second = await runCreatorNoteExtraction(
      { transcript, dryRun: false },
      {
        store,
        extractChunk: mockExtractChunk([{ ...SPECIFIC_NOTES[0], sourceSegmentIndexes: [0] }]),
        aiConfig: TEST_AI,
        id: () => 'podcast-write-2',
        log: () => {},
      },
    );
    expect(second.persistence.status).toBe('skipped');
    expect(second.persistence.notesWritten).toBe(0);
  });

  it('skips YouTube items from automatic creator-note batch selection by default', () => {
    expect(CREATOR_NOTES_YOUTUBE_BATCH_ENABLED).toBe(false);
    const youtube = {
      sourceItemId: 'yt:video:dQw4w9WgXcQ',
      sourceId: 'yt:video:dQw4w9WgXcQ',
      title: 'A YouTube item',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      publishedAt: hoursAgo(6),
      creatorId: 'david-pakman',
      creatorName: 'David Pakman',
    };
    expect(selectEligibleCreatorNotesItems([youtube], { now: NOW })).toEqual([]);
  });

  it('selects recent podcast episodes newest first', () => {
    const older = episode({ sourceItemId: 'old', guid: 'old', publishedAt: hoursAgo(10), title: 'Older' });
    const newer = episode({ sourceItemId: 'new', guid: 'new', publishedAt: hoursAgo(1), title: 'Newer' });
    const selected = selectEligiblePodcastEpisodes([older, newer], { now: NOW, limit: 10 });
    expect(selected.map((row) => row.sourceItemId)).toEqual(['new', 'old']);
  });

  it('marks missing transcripts as TRANSCRIPT_UNAVAILABLE without calling extraction', async () => {
    const extractChunk = vi.fn(mockExtractChunk(SPECIFIC_NOTES.slice(0, 1)));
    const result = await runCreatorNotesPodcastBatch(
      { limit: 10, dryRun: true, force: false, creator: null, sinceHours: 48, json: false },
      {
        listEpisodes: async () => [episode({ transcriptCandidates: [], creatorId: 'brennan-center', creatorName: 'The Briefing', episodeUrl: 'https://brennancenter.substack.com/p/x' })],
        adapters: [],
        extractChunk,
        skipLock: true,
        skipWarmup: true,
        aiConfig: TEST_AI,
        now: () => NOW,
        log: () => {},
      },
    );
    expect(result.items[0]?.transcriptStatus).toBe('TRANSCRIPT_UNAVAILABLE');
    expect(extractChunk).not.toHaveBeenCalled();
  });

  it('matches podcast identities by guid and URL', () => {
    expect(matchesPodcastIdentity(episode(), 'guid-ep-vtt')).toBe(true);
    expect(matchesPodcastIdentity(episode(), 'https://creator.example/episodes/vtt')).toBe(true);
  });
});

describe('Theme Memory isolation for podcast intake', () => {
  it('does not import Theme Memory modules from the podcast path', () => {
    const dir = join(process.cwd(), 'lib/creatorNotes');
    const files = [
      'podcastRss.ts',
      'podcastFormats.ts',
      'podcastTranscript.ts',
      'podcastAdapters.ts',
      'podcastCatalog.ts',
      'podcastPrepare.ts',
      'podcastBatch.ts',
      'audioTranscription.ts',
      'audioDownload.ts',
      'audioTranscriptCache.ts',
      'whisperProvider.ts',
      'adapters/davidPakman.ts',
    ];
    for (const file of files) {
      const src = readFileSync(join(dir, file), 'utf8');
      expect(src).not.toMatch(/@\/lib\/themeMemory/);
      expect(src).not.toMatch(/theme_observations/);
      expect(src).not.toMatch(/upsertThemeObservations/);
    }
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts')) continue;
      const src = readFileSync(join(dir, file), 'utf8');
      expect(src).not.toMatch(/themeMemory\/themesDb/);
    }
  });
});
