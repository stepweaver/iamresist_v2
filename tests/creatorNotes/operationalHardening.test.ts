import { afterEach, describe, expect, it } from 'vitest';

import { buildEvidenceWindows } from '@/lib/creatorNotes/chunk';
import {
  CREATOR_NOTES_OLLAMA_KEEP_ALIVE_DEFAULT,
  creatorNotesOllamaKeepAlive,
} from '@/lib/creatorNotes/constants';
import {
  AI_PROVIDER_UNAVAILABLE,
  CreatorNotesProviderUnavailableError,
} from '@/lib/creatorNotes/errors';
import { resolveCreatorNotesAiConfig } from '@/lib/creatorNotes/extract';
import { createMemoryCreatorNotesExtractionCache } from '@/lib/creatorNotes/extractionCache';
import { buildCreatorNoteMessages } from '@/lib/creatorNotes/prompt';
import { runCreatorNoteExtraction } from '@/lib/creatorNotes/run';
import { acceptGroundedCreatorNotes } from '@/lib/creatorNotes/sourceEvidence';
import type { CreatorTranscriptInput, RawCreatorNote } from '@/lib/creatorNotes/types';
import { emptyKindDiagnostics, parseCreatorNotesOutput, validateRawCreatorNote } from '@/lib/creatorNotes/validate';
import { themeMemoryEnv } from '@/lib/env/themeMemory';

const TEST_AI = {
  provider: 'test',
  model: 'test-model',
  baseUrl: 'http://127.0.0.1:9',
  timeoutMs: 300000,
  retries: 0,
};

function fetchFailedError(): Error {
  const error = new Error('fetch failed');
  (error as Error & { code: string }).code = 'UND_ERR_SOCKET';
  return error;
}

function pad(text: string, size: number): string {
  if (text.length >= size) return text;
  return `${text} ${'x'.repeat(size - text.length - 1)}`;
}

function threeWindowTranscript(sourceItemId = 'guid-jiang-abort'): CreatorTranscriptInput {
  return {
    sourceItemId,
    creatorId: 'professor-jiang',
    creatorName: 'Professor Jiang',
    sourceTitle: 'Three-window abort',
    sourceUrl: 'https://creator.example/jiang-abort',
    publishedAt: '2026-09-20T00:00:00.000Z',
    sourceIdentityKey: 'https://creator.example/jiang-abort',
    segments: [
      {
        index: 0,
        startSeconds: 0,
        endSeconds: 40,
        text: pad('Lloyds of London published the war-risk bulletin after the zone expanded. UNIQUE_WINDOW_ZERO_TOKEN.', 900),
      },
      {
        index: 1,
        startSeconds: 50,
        endSeconds: 90,
        text: pad('The IAEA issued a new inspection notice for the enrichment site. UNIQUE_WINDOW_ONE_TOKEN.', 900),
      },
      {
        index: 2,
        startSeconds: 100,
        endSeconds: 140,
        text: pad('Iran fired 20 ballistic missiles at a US base in Jordan. UNIQUE_WINDOW_TWO_TOKEN.', 900),
      },
    ],
  };
}

function noteForWindow(index: number, quote: string, text: string): RawCreatorNote {
  return {
    kind: 'event',
    startSeconds: index * 50,
    endSeconds: index * 50 + 40,
    text,
    attribution: 'Professor Jiang',
    referencedSource: null,
    eventFeatures: null,
    sourceExcerpt: null,
    sourceQuote: quote,
    exactQuote: quote,
    sourceSegmentIndexes: [],
  };
}

function groundedExtract(chunkIndex: number, quote: string) {
  return {
    notes: [
      noteForWindow(
        chunkIndex,
        quote,
        'Jiang notes Lloyds of London published the war-risk bulletin after the zone expanded.',
      ),
    ],
    rejected: 0,
    kindDiagnostics: emptyKindDiagnostics(),
  };
}

describe('Creator Notes operational hardening', () => {
  const envKeys = ['CREATOR_NOTES_OLLAMA_KEEP_ALIVE', 'CREATOR_NOTES_AI_PROVIDER'] as const;
  const previousEnv: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  afterEach(() => {
    for (const key of envKeys) {
      if (key in previousEnv) {
        const value = previousEnv[key];
        if (value == null) delete process.env[key];
        else process.env[key] = value;
        delete previousEnv[key];
      }
    }
  });

  function setEnv(key: (typeof envKeys)[number], value: string | undefined) {
    if (!(key in previousEnv)) previousEnv[key] = process.env[key];
    if (value == null || value === '') delete process.env[key];
    else process.env[key] = value;
  }

  it('aborts remaining windows immediately when Ollama is unreachable', async () => {
    const transcript = threeWindowTranscript('guid-jiang-unreachable');
    const windows = buildEvidenceWindows(transcript.segments);
    expect(windows.length).toBeGreaterThanOrEqual(3);
    const calls: string[] = [];
    const events: string[] = [];

    await expect(
      runCreatorNoteExtraction(
        { transcript, dryRun: true },
        {
          aiConfig: TEST_AI,
          id: () => 'abort-unreachable',
          log: (_prefix, event) => events.push(event),
          healthCheck: async () => ({ ok: false, reachable: false, error: 'ECONNREFUSED' }),
          sleep: async () => {},
          extractionCache: null,
          extractChunk: async ({ chunk }) => {
            calls.push(chunk.windowId);
            if (calls.length === 1) {
              return groundedExtract(chunk.index, chunk.verbatimTranscript.slice(0, 48));
            }
            throw fetchFailedError();
          },
        },
      ),
    ).rejects.toMatchObject({
      name: 'CreatorNotesProviderUnavailableError',
      code: AI_PROVIDER_UNAVAILABLE,
      message: expect.stringMatching(/AI_PROVIDER_UNAVAILABLE/),
    });

    expect(calls).toHaveLength(2);
    expect(calls).not.toContain(windows[2].windowId);
    expect(events).toContain('transport failure');
    expect(events).toContain('health check');
    expect(events).toContain('provider unavailable abort');
    expect(events).not.toContain('transport retry');
  });

  it('keeps a successful window cache after an aborted run', async () => {
    const transcript = threeWindowTranscript('guid-jiang-cache-abort');
    const cache = createMemoryCreatorNotesExtractionCache();
    const firstCalls: string[] = [];

    await expect(
      runCreatorNoteExtraction(
        { transcript, dryRun: true },
        {
          aiConfig: TEST_AI,
          id: () => 'cache-abort-1',
          log: () => {},
          healthCheck: async () => ({ ok: false, reachable: false, error: 'ECONNREFUSED' }),
          sleep: async () => {},
          extractionCache: cache,
          extractChunk: async ({ chunk }) => {
            firstCalls.push(chunk.windowId);
            if (firstCalls.length === 1) {
              return groundedExtract(chunk.index, chunk.verbatimTranscript.slice(0, 48));
            }
            throw fetchFailedError();
          },
        },
      ),
    ).rejects.toBeInstanceOf(CreatorNotesProviderUnavailableError);

    expect(firstCalls).toHaveLength(2);
    expect(cache.store.size).toBe(1);

    const secondCalls: string[] = [];
    const resumed = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: () => 'cache-abort-2',
        log: () => {},
        healthCheck: async () => ({ ok: true, reachable: true }),
        sleep: async () => {},
        extractionCache: cache,
        extractChunk: async ({ chunk }) => {
          secondCalls.push(chunk.windowId);
          return groundedExtract(chunk.index, chunk.verbatimTranscript.slice(0, 48));
        },
      },
    );

    expect(secondCalls).not.toContain(firstCalls[0]);
    expect(resumed.performance.cacheHits).toBe(1);
    expect(resumed.persistence.status).toBe('success');
  });

  it('retries the same window once when Ollama is still reachable after a transport error', async () => {
    const transcript = threeWindowTranscript('guid-jiang-reachable-retry');
    const calls: string[] = [];
    const events: Array<{ event: string; extra?: Record<string, unknown> }> = [];
    let first = true;
    const result = await runCreatorNoteExtraction(
      { transcript, dryRun: true },
      {
        aiConfig: TEST_AI,
        id: () => 'reachable-retry',
        log: (_prefix, event, extra) => events.push({ event, extra }),
        healthCheck: async () => ({ ok: true, reachable: true }),
        sleep: async () => {},
        extractionCache: null,
        extractChunk: async ({ chunk }) => {
          calls.push(chunk.windowId);
          if (first) {
            first = false;
            throw fetchFailedError();
          }
          return groundedExtract(chunk.index, chunk.verbatimTranscript.slice(0, 48));
        },
      },
    );

    expect(calls[0]).toBe(calls[1]);
    expect(events.some((row) => row.event === 'transport retry' && row.extra?.sameWindow === true)).toBe(true);
    expect(events.some((row) => row.event === 'provider unavailable abort')).toBe(false);
    expect(result.persistence.status).toBe('success');
  });

  it('defaults Creator Notes keep-alive to 5m and does not inherit Theme Memory 30m', () => {
    expect(CREATOR_NOTES_OLLAMA_KEEP_ALIVE_DEFAULT).toBe('5m');
    expect('CREATOR_NOTES_OLLAMA_KEEP_ALIVE' in themeMemoryEnv).toBe(false);
    setEnv('CREATOR_NOTES_AI_PROVIDER', 'ollama');
    setEnv('CREATOR_NOTES_OLLAMA_KEEP_ALIVE', '');
    expect(creatorNotesOllamaKeepAlive()).toBe('5m');
    expect(resolveCreatorNotesAiConfig().keepAlive).toBe('5m');
    setEnv('CREATOR_NOTES_OLLAMA_KEEP_ALIVE', '10m');
    expect(creatorNotesOllamaKeepAlive()).toBe('10m');
  });

  it('does not replace the creator with a quoted speaker', () => {
    const note = validateRawCreatorNote(
      {
        kind: 'claim',
        text: 'Jiang quotes Trump saying the exclusion zone is a hoax according to officials.',
        attribution: 'Donald Trump',
        quotedSpeaker: 'Donald Trump',
        sourceQuote: 'Trump said the exclusion zone is a hoax',
      },
      { knownCreatorName: 'Professor Jiang' },
    );
    expect(note.attribution).toBe('Professor Jiang');
    expect(note.quotedSpeaker).toBe('Donald Trump');
  });

  it('normalizes punctuation-only referencedSource to null', () => {
    const comma = validateRawCreatorNote(
      {
        kind: 'event',
        text: 'Jiang says Iran expanded the exclusion zone after the navy warning.',
        attribution: 'Professor Jiang',
        referencedSource: ',',
        sourceQuote: 'Iran expanded the exclusion zone after the navy warning',
      },
      { knownCreatorName: 'Professor Jiang' },
    );
    expect(comma.referencedSource).toBeNull();

    const punctuation = validateRawCreatorNote(
      {
        kind: 'evidence_reference',
        text: 'Jiang cites a Lloyds of London war-risk bulletin after the zone expanded.',
        attribution: 'Professor Jiang',
        referencedSource: '   ,,,   ',
        sourceQuote: 'Jiang cites Lloyds of London which published a war-risk bulletin',
        eventFeatures: {
          actors: [],
          action: null,
          object: null,
          institutions: [],
          locations: [],
          referencedDocuments: [],
        },
      },
      { knownCreatorName: 'Professor Jiang' },
    );
    expect(punctuation.referencedSource).toBeNull();
    expect(punctuation.kind).toBe('evidence_reference');
  });

  it('repairs or rejects structured JSON leakage in note text', () => {
    const repaired = validateRawCreatorNote(
      {
        kind: 'event',
        text: 'Iran fired 20 ballistic missiles at a US base in Jordan.","sourceQuote": "Iran fired 20 ballistic missiles"',
        attribution: 'Professor Jiang',
        sourceQuote: 'Iran fired 20 ballistic missiles at a US base in Jordan',
      },
      { knownCreatorName: 'Professor Jiang' },
    );
    expect(repaired.text).toBe('Iran fired 20 ballistic missiles at a US base in Jordan.');
    expect(repaired.text).not.toMatch(/sourceQuote":/);

    const parsed = parseCreatorNotesOutput(
      JSON.stringify({
        notes: [
          {
            kind: 'event',
            text: 'kind": "event", referencedSource": ",", sourceQuote": "leak"',
            sourceQuote: 'Iran fired 20 ballistic missiles at a US base in Jordan',
          },
        ],
      }),
      { knownCreatorName: 'Professor Jiang' },
    );
    expect(parsed.notes).toHaveLength(0);
    expect(parsed.rejected).toBe(1);
    expect(parsed.validationFailures).toContain('text_structured_leakage');
  });

  it('keeps separate actors as separate propositions', () => {
    const transcript: CreatorTranscriptInput = {
      sourceItemId: 'guid-jiang-actors',
      creatorId: 'professor-jiang',
      creatorName: 'Professor Jiang',
      sourceTitle: 'Missile intercept',
      sourceUrl: 'https://creator.example/jiang-actors',
      publishedAt: '2026-09-20T00:00:00.000Z',
      sourceIdentityKey: 'https://creator.example/jiang-actors',
      segments: [
        {
          index: 0,
          startSeconds: 12,
          endSeconds: 48,
          text: 'Iran fired 20 ballistic missiles at a US base in Jordan. American THAAD and Patriot systems intercepted 18 of them.',
        },
      ],
    };
    const messages = buildCreatorNoteMessages({
      transcript,
      chunk: buildEvidenceWindows(transcript.segments)[0],
      chunkCount: 1,
    });
    expect(messages[0].content).toContain('Preserve who performed each action');
    expect(messages[0].content).toContain('Do not merge actions performed by different actors into one proposition');
    expect(messages[1].content).toContain('If actor A fired missiles and actor B intercepted them, those are two notes');

    const accepted = acceptGroundedCreatorNotes(
      [
        {
          kind: 'event',
          startSeconds: 12,
          endSeconds: 30,
          text: 'Iran fired 20 ballistic missiles at a US base in Jordan.',
          attribution: 'Professor Jiang',
          eventFeatures: {
            actors: ['Iran'],
            action: 'fired ballistic missiles',
            object: 'US base in Jordan',
            institutions: [],
            locations: ['Jordan'],
            referencedDocuments: [],
          },
          sourceExcerpt: null,
          sourceQuote: 'Iran fired 20 ballistic missiles at a US base in Jordan',
          exactQuote: 'Iran fired 20 ballistic missiles at a US base in Jordan',
          sourceSegmentIndexes: [0],
        },
        {
          kind: 'event',
          startSeconds: 30,
          endSeconds: 48,
          text: 'American THAAD and Patriot systems intercepted 18 of the missiles.',
          attribution: 'Professor Jiang',
          eventFeatures: {
            actors: ['American THAAD and Patriot systems'],
            action: 'intercepted missiles',
            object: '18 missiles',
            institutions: [],
            locations: ['Jordan'],
            referencedDocuments: [],
          },
          sourceExcerpt: null,
          sourceQuote: 'American THAAD and Patriot systems intercepted 18 of them',
          exactQuote: 'American THAAD and Patriot systems intercepted 18 of them',
          sourceSegmentIndexes: [0],
        },
      ],
      transcript.segments,
      { knownCreatorName: 'Professor Jiang' },
    );
    expect(accepted.notes).toHaveLength(2);
    expect(accepted.notes[0].text).toContain('Iran fired');
    expect(accepted.notes[1].text).toContain('intercepted 18');
    expect(accepted.notes.some((note) => /fired.*intercepting/i.test(note.text))).toBe(false);
  });

  it('does not accept a total-vs-unit cost comparison the evidence does not support', () => {
    const segments = [
      {
        index: 0,
        startSeconds: 12,
        endSeconds: 48,
        text: 'The Iranian strike cost $60-$100 million. American interceptor missiles cost $4-$8 million each.',
      },
    ];
    const transcript: CreatorTranscriptInput = {
      sourceItemId: 'guid-jiang-cost',
      creatorId: 'professor-jiang',
      creatorName: 'Professor Jiang',
      sourceTitle: 'Strike cost',
      sourceUrl: 'https://creator.example/jiang-cost',
      publishedAt: '2026-09-20T00:00:00.000Z',
      sourceIdentityKey: 'https://creator.example/jiang-cost',
      segments,
    };
    const messages = buildCreatorNoteMessages({
      transcript,
      chunk: buildEvidenceWindows(segments)[0],
      chunkCount: 1,
    });
    expect(messages[0].content).toContain('Do not compare quantities with different units or scopes');
    expect(messages[1].content).toContain('Distinguish per-unit cost from aggregate cost');

    const accepted = acceptGroundedCreatorNotes(
      [
        {
          kind: 'claim',
          startSeconds: 12,
          endSeconds: 48,
          text: 'The cost of the Iranian strike ($60-$100 million) is substantially higher than the American interceptor missiles ($4-$8 million).',
          attribution: 'Professor Jiang',
          eventFeatures: null,
          sourceExcerpt: null,
          sourceQuote: 'The Iranian strike cost $60-$100 million',
          exactQuote: 'The Iranian strike cost $60-$100 million',
          sourceSegmentIndexes: [0],
        },
      ],
      segments,
      { knownCreatorName: 'Professor Jiang' },
    );
    expect(accepted.notes).toHaveLength(0);
    expect(accepted.rejected).toBe(1);
  });
});
