import { describe, expect, it, vi } from 'vitest';

import { parseCreatorNotesExtractArgs, formatCreatorNotesReport, formatTranscriptSection } from '@/lib/creatorNotes/format';
import { normalizeCaptionCues } from '@/lib/creatorNotes/normalizeCaptions';
import { prepareCreatorNotesTranscript } from '@/lib/creatorNotes/prepare';
import { matchesVoiceIdentity, resolveCreatorSource } from '@/lib/creatorNotes/resolveSource';
import { runCreatorNoteExtraction } from '@/lib/creatorNotes/run';
import { fetchCreatorTranscript } from '@/lib/creatorNotes/transcriptProvider';
import type { CreatorTranscriptInput, ResolvedCreatorSource } from '@/lib/creatorNotes/types';
import { classifyCreatorSourceProvider, parseYouTubeVideoId } from '@/lib/creatorNotes/youtubeIdentity';
import {
  extractYtInitialPlayerResponse,
  parseCaptionTracks,
  parseJson3Captions,
  parseXmlCaptions,
  selectCaptionTrack,
  YouTubeTranscriptProvider,
} from '@/lib/creatorNotes/youtubeTranscript';
import { mockExtractChunk, SPECIFIC_NOTES } from './helpers';

const VIDEO_ID = 'dQw4w9WgXcQ';
const WATCH_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
const YOUTU_BE_URL = `https://youtu.be/${VIDEO_ID}`;
const VOICE_ITEM_ID = `yt:video:${VIDEO_ID}`;

const TEST_AI = {
  provider: 'test',
  model: 'test-model',
  baseUrl: 'http://127.0.0.1:9',
  timeoutMs: 1,
  retries: 0,
};

function voiceItem(overrides: Partial<{
  sourceItemId: string;
  sourceId: string | null;
  title: string | null;
  url: string;
  publishedAt: string | null;
  creatorId: string | null;
  creatorName: string | null;
}> = {}) {
  return {
    sourceItemId: VOICE_ITEM_ID,
    sourceId: VOICE_ITEM_ID,
    title: 'DEAR GOD: This is OFF THE RAILS',
    url: WATCH_URL,
    publishedAt: '2026-09-17T12:00:00.000Z',
    creatorId: 'david-pakman',
    creatorName: 'David Pakman',
    ...overrides,
  };
}

function resolvedSource(overrides: Partial<ResolvedCreatorSource> = {}): ResolvedCreatorSource {
  return {
    sourceItemId: VOICE_ITEM_ID,
    creatorId: 'david-pakman',
    creatorName: 'David Pakman',
    title: 'DEAR GOD: This is OFF THE RAILS',
    url: WATCH_URL,
    publishedAt: '2026-09-17T12:00:00.000Z',
    provider: 'youtube',
    externalId: VIDEO_ID,
    ...overrides,
  };
}

function playerHtml(tracks: Array<Record<string, unknown>>): string {
  const player = {
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: tracks,
      },
    },
  };
  return `<html><script>var ytInitialPlayerResponse = ${JSON.stringify(player)};</script></html>`;
}

const JSON3_CAPTIONS = JSON.stringify({
  events: [
    { tStartMs: 0, dDurationMs: 800, segs: [{ utf8: 'A federal' }] },
    { tStartMs: 800, dDurationMs: 900, segs: [{ utf8: 'appeals court' }] },
    { tStartMs: 1700, dDurationMs: 1100, segs: [{ utf8: 'issued a stay.' }] },
  ],
});

describe('YouTube video-id parsing', () => {
  it('parses youtube.com/watch?v= video ids', () => {
    expect(parseYouTubeVideoId(WATCH_URL)).toBe(VIDEO_ID);
    expect(parseYouTubeVideoId(`https://www.youtube.com/watch?a=1&v=${VIDEO_ID}`)).toBe(VIDEO_ID);
    expect(classifyCreatorSourceProvider(WATCH_URL)).toBe('youtube');
  });

  it('parses youtu.be video ids', () => {
    expect(parseYouTubeVideoId(YOUTU_BE_URL)).toBe(VIDEO_ID);
    expect(classifyCreatorSourceProvider(YOUTU_BE_URL)).toBe('youtube');
  });

  it('parses stored Voice YouTube identities', () => {
    expect(parseYouTubeVideoId(null, VOICE_ITEM_ID)).toBe(VIDEO_ID);
    expect(parseYouTubeVideoId(null, `yt:${VIDEO_ID}`)).toBe(VIDEO_ID);
  });

  it('rejects non-YouTube watch URLs that are not YouTube videos', () => {
    expect(parseYouTubeVideoId('https://pca.st/episode/abc')).toBeNull();
    expect(classifyCreatorSourceProvider('https://pca.st/episode/abc')).toBe('podcast');
    expect(classifyCreatorSourceProvider('https://podcasts.apple.com/us/podcast/x/id123')).toBe('podcast');
  });
});

describe('YouTube caption parsing and track selection', () => {
  it('prefers manual English captions over auto-generated tracks', () => {
    const tracks = parseCaptionTracks({
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            { baseUrl: 'https://example.test/asr', languageCode: 'en', kind: 'asr' },
            { baseUrl: 'https://example.test/manual', languageCode: 'en-US' },
          ],
        },
      },
    });
    const selected = selectCaptionTrack(tracks);
    expect(selected?.baseUrl).toBe('https://example.test/manual');
    expect(selected?.generated).toBe(false);
  });

  it('parses json3 caption events verbatim', () => {
    const cues = parseJson3Captions(JSON3_CAPTIONS);
    expect(cues.map((cue) => cue.text)).toEqual(['A federal', 'appeals court', 'issued a stay.']);
    expect(cues[0]?.startSeconds).toBe(0);
    expect(cues[0]?.endSeconds).toBe(0.8);
  });

  it('parses XML caption cues in chronological order', () => {
    const cues = parseXmlCaptions(
      '<transcript><text start="12.5" dur="2">Second</text><text start="1" dur="1.5">First &#39;quote&#39;</text></transcript>',
    );
    expect(cues).toHaveLength(2);
    expect(cues[1]?.text).toBe("First 'quote'");
    const normalized = normalizeCaptionCues(cues);
    expect(normalized.map((segment) => segment.text)).toEqual(["First 'quote'", 'Second']);
    expect(normalized[0]?.startSeconds).toBe(1);
  });
});

describe('caption normalization', () => {
  it('merges tiny adjacent captions up to the 15-30s target', () => {
    const cues = [];
    for (let i = 0; i < 20; i += 1) {
      cues.push({
        startSeconds: i,
        endSeconds: i + 1,
        text: `word${i}`,
      });
    }
    const segments = normalizeCaptionCues(cues);
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.length).toBeLessThan(cues.length);
    expect(segments[0]?.text.startsWith('word0')).toBe(true);
    expect(segments[0]?.text).toContain('word14');
    const span = (segments[0]?.endSeconds || 0) - (segments[0]?.startSeconds || 0);
    expect(span).toBeLessThanOrEqual(30);
    expect(span).toBeGreaterThanOrEqual(15);
  });

  it('does not merge across large time gaps', () => {
    const segments = normalizeCaptionCues([
      { startSeconds: 0, endSeconds: 4, text: 'Before the break.' },
      { startSeconds: 20, endSeconds: 24, text: 'After the break.' },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.text).toBe('Before the break.');
    expect(segments[1]?.text).toBe('After the break.');
  });

  it('preserves chronological order and verbatim caption text', () => {
    const segments = normalizeCaptionCues([
      { startSeconds: 8, endSeconds: 10, text: '  later line  ' },
      { startSeconds: 1, endSeconds: 3, text: 'Westmere County Court' },
    ]);
    expect(segments.map((segment) => segment.text)).toEqual(['Westmere County Court', 'later line']);
    expect(segments.map((segment) => segment.index)).toEqual([0, 1]);
  });
});

describe('YouTube transcript provider', () => {
  it('fails clearly when no caption tracks are available', async () => {
    const provider = new YouTubeTranscriptProvider({
      get: async () => ({ ok: true, status: 200, text: playerHtml([]) }),
    });
    await expect(provider.fetchTranscript(resolvedSource())).rejects.toThrow('no caption tracks available');
  });

  it('fails clearly when the caption request fails', async () => {
    const provider = new YouTubeTranscriptProvider({
      get: async (url) => {
        if (url.includes('watch?v=')) {
          return {
            ok: true,
            status: 200,
            text: playerHtml([{ baseUrl: 'https://example.test/timedtext', languageCode: 'en' }]),
          };
        }
        return { ok: false, status: 500, text: '' };
      },
    });
    await expect(provider.fetchTranscript(resolvedSource())).rejects.toThrow('caption request failed');
  });

  it('fails clearly when caption payload is empty', async () => {
    const provider = new YouTubeTranscriptProvider({
      get: async (url) => {
        if (url.includes('watch?v=')) {
          return {
            ok: true,
            status: 200,
            text: playerHtml([{ baseUrl: 'https://example.test/timedtext', languageCode: 'en' }]),
          };
        }
        return { ok: true, status: 200, text: '{"events":[]}' };
      },
    });
    await expect(provider.fetchTranscript(resolvedSource())).rejects.toThrow('empty transcript');
  });

  it('fails for malformed YouTube URLs', async () => {
    const provider = new YouTubeTranscriptProvider({
      get: async () => {
        throw new Error('should not fetch');
      },
    });
    await expect(
      provider.fetchTranscript(
        resolvedSource({
          url: 'https://www.youtube.com/channel/UC123',
          externalId: null,
        }),
      ),
    ).rejects.toThrow('malformed YouTube URL');
  });

  it('normalizes retrieved captions into transcript segments without rewriting', async () => {
    const get = vi.fn(async (url: string) => {
      if (url.includes('watch?v=')) {
        return {
          ok: true,
          status: 200,
          text: playerHtml([{ baseUrl: 'https://example.test/timedtext?v=1', languageCode: 'en' }]),
        };
      }
      return { ok: true, status: 200, text: JSON3_CAPTIONS };
    });
    const provider = new YouTubeTranscriptProvider({ get });
    const fetched = await provider.fetchTranscript(resolvedSource());
    expect(fetched.transcript.segments.map((segment) => segment.text).join(' ')).toBe(
      'A federal appeals court issued a stay.',
    );
    expect(fetched.acquisition.source).toBe('youtube-captions');
    expect(fetched.acquisition.language).toBe('en');
    expect(fetched.acquisition.generated).toBe('no');
    expect(get.mock.calls.some((call) => String(call[0]).includes('youtube.com/watch'))).toBe(true);
  });

  it('extracts caption tracks from a watch-page player response', () => {
    const html = playerHtml([{ baseUrl: 'https://example.test/t', languageCode: 'en', kind: 'asr' }]);
    const player = extractYtInitialPlayerResponse(html);
    expect(parseCaptionTracks(player || {})).toHaveLength(1);
  });
});

describe('Voice source resolver', () => {
  it('resolves non-UUID Voice identities used by RSS / Voices', async () => {
    const source = await resolveCreatorSource(VOICE_ITEM_ID, {
      dbConfigured: () => false,
      listVoiceItems: async () => [voiceItem()],
    });
    expect(source.sourceItemId).toBe(VOICE_ITEM_ID);
    expect(source.creatorName).toBe('David Pakman');
    expect(source.title).toBe('DEAR GOD: This is OFF THE RAILS');
    expect(source.url).toBe(WATCH_URL);
    expect(source.provider).toBe('youtube');
    expect(source.externalId).toBe(VIDEO_ID);
  });

  it('matches compact yt: identity keys and watch URLs without guessing metadata', async () => {
    const items = [voiceItem()];
    const byKey = await resolveCreatorSource(`yt:${VIDEO_ID}`, {
      listVoiceItems: async () => items,
    });
    const byUrl = await resolveCreatorSource(WATCH_URL, {
      listVoiceItems: async () => items,
    });
    expect(byKey.sourceItemId).toBe(VOICE_ITEM_ID);
    expect(byUrl.creatorId).toBe('david-pakman');
    expect(matchesVoiceIdentity(voiceItem(), `voice:david-pakman:yt:${VIDEO_ID}`)).toBe(true);
  });

  it('fails clearly when the Voice item does not exist', async () => {
    await expect(
      resolveCreatorSource('yt:video:missing12ab', {
        dbConfigured: () => false,
        listVoiceItems: async () => [voiceItem()],
      }),
    ).rejects.toThrow('source item not found: yt:video:missing12ab');
  });

  it('fails clearly when an intel source item has no URL', async () => {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    await expect(
      resolveCreatorSource(uuid, {
        dbConfigured: () => true,
        fetchIntelById: async (id) => ({
          id,
          title: 'No URL item',
          canonical_url: '',
          published_at: '2026-09-17T00:00:00.000Z',
          desk_lane: 'voices',
          sources: { name: 'David Pakman', slug: 'david-pakman', desk_lane: 'voices' },
        }),
      }),
    ).rejects.toThrow('source has no URL');
  });

  it('resolves intel UUID source items when present', async () => {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const source = await resolveCreatorSource(uuid, {
      dbConfigured: () => true,
      fetchIntelById: async (id) => ({
        id,
        title: 'Intel voice episode',
        canonical_url: WATCH_URL,
        published_at: '2026-09-17T00:00:00.000Z',
        desk_lane: 'voices',
        external_id: VOICE_ITEM_ID,
        sources: { name: 'David Pakman', slug: 'david-pakman', desk_lane: 'voices' },
      }),
      listVoiceItems: async () => {
        throw new Error('should not consult live Voice RSS for a found intel UUID');
      },
    });
    expect(source.sourceItemId).toBe(uuid);
    expect(source.provider).toBe('youtube');
  });

  it('does not treat calibration strings as Voice items', async () => {
    await expect(
      resolveCreatorSource('calibration-david-pakman-2026-09-17', {
        dbConfigured: () => true,
        fetchIntelById: async () => {
          throw new Error('should not query UUID column');
        },
        listVoiceItems: async () => [voiceItem()],
      }),
    ).rejects.toThrow('source item not found: calibration-david-pakman-2026-09-17');
  });
});

describe('transcript acquisition CLI path', () => {
  it('uses --transcript-file and does not fetch a remote transcript', async () => {
    const fetchTranscript = vi.fn(async () => {
      throw new Error('remote fetch should be skipped');
    });
    const prepared = await prepareCreatorNotesTranscript(
      parseCreatorNotesExtractArgs([
        '--source-item',
        'calibration-david-pakman-2026-09-17',
        '--transcript-file',
        './tests/creatorNotes/fixtures/specific-transcript.json',
        '--dry-run',
      ]),
      { fetchTranscript },
    );
    expect(fetchTranscript).not.toHaveBeenCalled();
    expect(prepared.acquisition.source).toBe('file');
    expect(prepared.transcript.segments[1]?.text).toContain('Westmere County Court');
  });

  it('triggers the transcript provider when --transcript-file is omitted', async () => {
    const fetchTranscript = vi.fn(async (source: ResolvedCreatorSource) => ({
      transcript: {
        sourceItemId: source.sourceItemId,
        creatorId: source.creatorId,
        creatorName: source.creatorName,
        sourceTitle: source.title,
        sourceUrl: source.url,
        publishedAt: source.publishedAt,
        sourceIdentityKey: source.url,
        segments: [
          { index: 0, startSeconds: 0, endSeconds: 18, text: 'Westmere County Court accepted a filing.' },
        ],
      } satisfies CreatorTranscriptInput,
      acquisition: {
        source: 'youtube-captions' as const,
        language: 'en',
        generated: 'no' as const,
        rawSegments: 4,
        normalizedSegments: 1,
        durationCoveredSeconds: 18,
        characters: 41,
      },
    }));

    const prepared = await prepareCreatorNotesTranscript(
      parseCreatorNotesExtractArgs(['--source-item', VOICE_ITEM_ID, '--dry-run']),
      {
        listVoiceItems: async () => [voiceItem()],
        fetchTranscript,
      },
    );

    expect(fetchTranscript).toHaveBeenCalledTimes(1);
    expect(prepared.acquisition.source).toBe('youtube-captions');
    expect(prepared.transcript.creatorName).toBe('David Pakman');
    expect(prepared.transcript.sourceTitle).toBe('DEAR GOD: This is OFF THE RAILS');
    expect(prepared.transcript.sourceUrl).toBe(WATCH_URL);
  });

  it('lets dry-run CLI flags override resolved source metadata', async () => {
    const prepared = await prepareCreatorNotesTranscript(
      parseCreatorNotesExtractArgs([
        '--source-item',
        VOICE_ITEM_ID,
        '--dry-run',
        '--creator-name',
        'CLI Creator',
      ]),
      {
        listVoiceItems: async () => [voiceItem()],
        fetchTranscript: async (source) => ({
          transcript: {
            sourceItemId: source.sourceItemId,
            creatorId: source.creatorId,
            creatorName: source.creatorName,
            sourceTitle: source.title,
            sourceUrl: source.url,
            publishedAt: source.publishedAt,
            sourceIdentityKey: source.url,
            segments: [{ index: 0, startSeconds: 0, endSeconds: 4, text: 'Verbatim caption text remains.' }],
          },
          acquisition: {
            source: 'youtube-captions',
            language: 'en',
            generated: 'yes',
            rawSegments: 1,
            normalizedSegments: 1,
            durationCoveredSeconds: 4,
            characters: 30,
          },
        }),
      },
    );
    expect(prepared.transcript.creatorName).toBe('CLI Creator');
    expect(prepared.transcript.segments[0]?.text).toBe('Verbatim caption text remains.');
  });

  it('rejects unsupported providers without substituting title text', async () => {
    await expect(
      fetchCreatorTranscript(
        resolvedSource({
          provider: 'unknown',
          url: 'https://pca.st/episode/abc',
          externalId: 'pca-abc',
        }),
      ),
    ).rejects.toThrow('Transcript retrieval is not supported for provider: unknown');
  });

  it('parses omitted --transcript-file as remote mode', () => {
    expect(
      parseCreatorNotesExtractArgs(['--source-item', VOICE_ITEM_ID, '--dry-run']),
    ).toMatchObject({
      sourceItemId: VOICE_ITEM_ID,
      transcriptFile: null,
      dryRun: true,
    });
  });
});

describe('atomic notes receive normalized remote transcripts', () => {
  it('keeps dry-run at zero DB writes and feeds normalized caption text into extraction', async () => {
    const store = {
      findEquivalentSuccessRun: vi.fn(async () => {
        throw new Error('DB should not be consulted');
      }),
      insertRun: vi.fn(async () => {
        throw new Error('DB should not be written');
      }),
      updateRun: vi.fn(async () => {
        throw new Error('DB should not be written');
      }),
      insertNotes: vi.fn(async () => {
        throw new Error('DB should not be written');
      }),
    };

    const transcriptText = 'Westmere County Court accepted a new filing in Calder v. Westmere Civic Board.';
    const provider = {
      supports: (source: ResolvedCreatorSource) => source.provider === 'youtube',
      fetchTranscript: async (source: ResolvedCreatorSource) => ({
        transcript: {
          sourceItemId: source.sourceItemId,
          creatorId: source.creatorId,
          creatorName: source.creatorName,
          sourceTitle: source.title,
          sourceUrl: source.url,
          publishedAt: source.publishedAt,
          sourceIdentityKey: source.url,
          segments: [
            { index: 0, startSeconds: 0, endSeconds: 14, text: 'Welcome back to the show.' },
            { index: 1, startSeconds: 14, endSeconds: 38, text: transcriptText },
          ],
        },
        acquisition: {
          source: 'youtube-captions' as const,
          language: 'en',
          generated: 'no' as const,
          rawSegments: 6,
          normalizedSegments: 2,
          durationCoveredSeconds: 38,
          characters: transcriptText.length + 25,
        },
      }),
    };

    const prepared = await prepareCreatorNotesTranscript(
      parseCreatorNotesExtractArgs(['--source-item', VOICE_ITEM_ID, '--dry-run']),
      {
        listVoiceItems: async () => [voiceItem()],
        providers: [provider],
      },
    );

    const result = await runCreatorNoteExtraction(
      { transcript: prepared.transcript, dryRun: true },
      {
        store,
        extractChunk: mockExtractChunk(SPECIFIC_NOTES.slice(0, 1)),
        aiConfig: TEST_AI,
        id: () => 'run-remote-1',
        log: () => {},
      },
    );
    result.transcriptAcquisition = prepared.acquisition;

    expect(store.insertRun).not.toHaveBeenCalled();
    expect(store.insertNotes).not.toHaveBeenCalled();
    expect(result.persistence.notesWritten).toBe(0);
    expect(result.persistence.dryRun).toBe(true);
    expect(result.notes[0]?.sourceExcerpt).toBe(transcriptText);
    expect(result.source.creatorName).toBe('David Pakman');
    expect(result.source.url).toBe(WATCH_URL);
    expect(formatCreatorNotesReport(result)).toContain('source: youtube-captions');
    expect(formatTranscriptSection(prepared.acquisition)).toContain('generated: no');
  });

  it('does not import Theme Memory modules from the transcript retrieval path', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const files = [
      'resolveSource.ts',
      'youtubeTranscript.ts',
      'transcriptProvider.ts',
      'normalizeCaptions.ts',
      'youtubeIdentity.ts',
      'prepare.ts',
    ];
    for (const file of files) {
      const src = readFileSync(join(process.cwd(), 'lib/creatorNotes', file), 'utf8');
      expect(src).not.toMatch(/@\/lib\/themeMemory/);
      expect(src).not.toMatch(/theme_observations/);
      expect(src).not.toMatch(/upsertThemeObservations/);
    }
  });
});
