import { describe, expect, it, vi } from 'vitest';

import { buildEventThreads, EVENT_THREADS_PERSISTENCE_DISABLED } from '@/lib/eventThreads/build';
import { formatEventThreadsReport, parseEventThreadsBuildArgs } from '@/lib/eventThreads/format';
import { createDryRunEventThreadsWriter, createMemoryAtomicNotesReader, createMemoryEventThreadsWriter } from '@/lib/eventThreads/store';
import { totalWrites } from '@/lib/eventThreads/writes';
import { makeIntelCandidate, makeNote } from './helpers';

const SOURCE_ITEM = '6aaaebbe8a1508074d789adc';

function jiangNotes() {
  return [
    makeNote({
      kind: 'event',
      text: 'Iran fires 20 ballistic missiles.',
      sourceExcerpt: 'Iran fires 20 ballistic missiles toward the ships.',
      startSeconds: 12,
    }),
    makeNote({
      kind: 'event',
      text: 'American THAAD and Patriot Systems intercept 18 of them.',
      sourceExcerpt: 'American THAAD and Patriot Systems intercept 18 of them.',
      startSeconds: 28,
    }),
    makeNote({
      kind: 'creator_analysis',
      text: 'Jiang argues the steelman of the official narrative still fails.',
      sourceExcerpt: 'Jiang argues the steelman of the official narrative still fails.',
      startSeconds: 90,
    }),
    makeNote({
      kind: 'evidence_reference',
      text: 'Jiang cites a Wall Street Journal article on alternative export routes.',
      sourceExcerpt: 'Jiang cites a Wall Street Journal article on alternative export routes.',
      startSeconds: 140,
    }),
    makeNote({
      kind: 'why_it_matters',
      text: 'Jiang says the zone change raises the cost of a wider war.',
      sourceExcerpt: 'Jiang says the zone change raises the cost of a wider war.',
      startSeconds: 170,
    }),
  ];
}

describe('Event Threads build dry-run', () => {
  it('parses the Jiang dry-run command flags', () => {
    const args = parseEventThreadsBuildArgs(['--source-item', SOURCE_ITEM, '--dry-run']);
    expect(args).toEqual({ sourceItemId: SOURCE_ITEM, dryRun: true, json: false });
  });

  it('requires --dry-run and does not persist', async () => {
    await expect(
      buildEventThreads({
        sourceItemId: SOURCE_ITEM,
        dryRun: false,
        reader: createMemoryAtomicNotesReader(jiangNotes()),
        aiConfig: null,
      }),
    ).rejects.toThrow(EVENT_THREADS_PERSISTENCE_DISABLED);
  });

  it('rejects invalid Atomic Note IDs', async () => {
    const notes = [
      makeNote({
        id: 'not-a-uuid',
        kind: 'event',
        text: 'Iran announced a new maritime exclusion zone.',
        startSeconds: 10,
      }),
      makeNote({
        kind: 'event',
        text: 'Iran announced a new maritime exclusion zone after the navy warning.',
        startSeconds: 20,
      }),
    ];
    const result = await buildEventThreads({
      sourceItemId: SOURCE_ITEM,
      dryRun: true,
      reader: createMemoryAtomicNotesReader(notes),
      aiConfig: null,
    });
    expect(result.rejectedInvalidAtomicNoteIds).toContain('not-a-uuid');
    expect(result.threadEntriesProposed).toBe(1);
  });

  it('keeps sponsor reads and housekeeping out of event threads', async () => {
    const notes = [
      makeNote({
        kind: 'context',
        text: 'Squarespace helps creators build websites for their businesses.',
        startSeconds: 621,
      }),
      makeNote({
        kind: 'event',
        text: 'Estonia is now part of the escalation ladder after the latest security guarantee.',
        startSeconds: 700,
      }),
      makeNote({
        kind: 'context',
        text: "Let's get to 7 million.",
        startSeconds: 900,
      }),
    ];
    const result = await buildEventThreads({
      sourceItemId: SOURCE_ITEM,
      dryRun: true,
      reader: createMemoryAtomicNotesReader(notes),
      aiConfig: null,
    });
    expect(result.atomicNotesConsidered).toBe(1);
    const rendered = JSON.stringify(result.threads);
    expect(rendered).not.toMatch(/squarespace/i);
    expect(rendered).not.toMatch(/7 million/);
  });

  it('never mutates Atomic Notes and performs zero writes', async () => {
    const notes = jiangNotes();
    const original = notes.map((note) => ({ ...note, sourceSegmentIndexes: [...note.sourceSegmentIndexes] }));
    const writer = createMemoryEventThreadsWriter();
    const insertThreads = vi.spyOn(writer, 'insertThreads');
    const search = vi.fn(async () => [
      makeIntelCandidate({
        title: 'U.S. THAAD and Patriot batteries intercept Iranian ballistic missiles',
        summary: 'Interceptors engaged ballistic missiles after the launch.',
      }),
    ]);

    const result = await buildEventThreads({
      sourceItemId: SOURCE_ITEM,
      dryRun: true,
      reader: createMemoryAtomicNotesReader(notes),
      writer,
      searchIntel: search,
      aiConfig: null,
      loadSourceMeta: async () => ({
        sourceItemId: SOURCE_ITEM,
        creatorId: 'professor-jiang',
        creatorName: 'Professor Jiang',
        title: 'Iran Expands Exclusion Zone?',
        url: 'https://shows.acast.com/professor-jiang/episodes/6aaaebbe8a1508074d789adc',
        publishedAt: '2026-09-16T12:00:00.000Z',
      }),
    });

    expect(result.atomicNotesConsidered).toBe(notes.length);
    expect(result.persistence.dryRun).toBe(true);
    expect(result.persistence.notesMutated).toBe(0);
    expect(totalWrites(result.writes)).toBe(0);
    expect(totalWrites(writer.writes)).toBe(0);
    expect(insertThreads).not.toHaveBeenCalled();
    expect(notes).toEqual(original);
    expect(result.threadsProposed).toBeGreaterThan(0);
    expect(result.threadEntriesProposed).toBeGreaterThan(0);
    expect(result.intelOsintCandidateLinks).toBeGreaterThan(0);
    expect(result.threads.some((thread) => thread.entries.some((entry) => entry.entryKind === 'evidence_reference'))).toBe(
      true,
    );

    const report = formatEventThreadsReport(result);
    expect(report).toContain('Atomic Notes considered:');
    expect(report).toContain('writes = 0');
    expect(report).toContain('Intel/OSINT candidate links:');
    expect(report).toMatch(/CREATOR ANALYSIS|EVIDENCE REFERENCE/);
  });

  it('dry-run writer throws if a write is attempted', async () => {
    const writer = createDryRunEventThreadsWriter();
    await expect(writer.insertThreads([])).rejects.toThrow(/forbids writes/);
    await expect(writer.insertEditorNotes([])).rejects.toThrow(/forbids writes/);
    expect(totalWrites(writer.writes)).toBe(0);
  });
});
