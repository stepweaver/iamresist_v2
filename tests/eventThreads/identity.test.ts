import { describe, expect, it } from 'vitest';

import { applyChronology, assignEntryTime } from '@/lib/eventThreads/chronology';
import { applyCorroborationSemantics } from '@/lib/eventThreads/corroboration';
import { clusterEntriesIntoThreads, shouldMergeThreadIdentities, identityFromEntry } from '@/lib/eventThreads/identity';
import { selectIntelOsintLinks } from '@/lib/eventThreads/intelLinks';
import { resolveNoteDeterministically } from '@/lib/eventThreads/resolve';
import { contextsFor, makeIntelCandidate, makeNote } from './helpers';

describe('Event Threads identity and chronology', () => {
  it('requires event-specific evidence for thread identity', () => {
    const notes = [
      makeNote({
        kind: 'event',
        text: 'Iran announced a new maritime exclusion zone after the navy warning.',
        sourceExcerpt: 'Iran announced a new maritime exclusion zone after the navy warning.',
        startSeconds: 10,
      }),
      makeNote({
        kind: 'new_development',
        text: 'Jiang says the exclusion zone is wider than last week.',
        sourceExcerpt: 'Jiang says the exclusion zone is wider than last week.',
        startSeconds: 40,
      }),
    ];
    const entries = contextsFor(notes).map((context) => resolveNoteDeterministically(context));
    const threads = clusterEntriesIntoThreads(entries);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.title.toLowerCase()).toMatch(/exclusion zone/);
    expect(threads[0]?.title.toLowerCase()).not.toBe('iran');
    expect(threads[0]?.identityKey.toLowerCase()).not.toMatch(/\bleast\b|\bfive\b|\bseparate events\b/);
  });

  it('does not merge threads from generic entity overlap alone', () => {
    const notes = [
      makeNote({
        kind: 'event',
        text: 'Iran held a military parade in Tehran.',
        sourceExcerpt: 'Iran held a military parade in Tehran this morning.',
        startSeconds: 8,
      }),
      makeNote({
        kind: 'event',
        text: 'Iran launched 20 ballistic missiles at ships near Hormuz.',
        sourceExcerpt: 'Iran launched 20 ballistic missiles at ships near Hormuz.',
        startSeconds: 80,
      }),
      makeNote({
        kind: 'event',
        text: 'Trump spoke at a rally in Michigan.',
        sourceExcerpt: 'Trump spoke at a rally in Michigan on Tuesday.',
        startSeconds: 200,
      }),
    ];
    const entries = contextsFor(notes).map((context) => resolveNoteDeterministically(context));
    expect(
      shouldMergeThreadIdentities(identityFromEntry(entries[0]), identityFromEntry(entries[1])),
    ).toBe(false);
    expect(
      shouldMergeThreadIdentities(identityFromEntry(entries[1]), identityFromEntry(entries[2])),
    ).toBe(false);
    const threads = clusterEntriesIntoThreads(entries);
    expect(threads.length).toBeGreaterThanOrEqual(2);
    const titles = threads.map((thread) => thread.title.toLowerCase());
    expect(titles.some((title) => title === 'iran' || title === 'hormuz' || title === 'trump')).toBe(false);
  });

  it('orders entries chronologically without inventing dates', () => {
    const notes = [
      makeNote({
        kind: 'event',
        text: 'On September 18, UAE accelerated alternative export infrastructure.',
        sourceExcerpt: 'On September 18, UAE accelerated alternative export infrastructure.',
        startSeconds: 30,
        createdAt: '2026-09-19T12:00:00.000Z',
      }),
      makeNote({
        kind: 'creator_analysis',
        text: 'Jiang interprets the investment as evidence disruption will persist.',
        sourceExcerpt: 'Jiang interprets the investment as evidence disruption will persist.',
        startSeconds: 50,
        createdAt: '2026-09-19T12:00:00.000Z',
      }),
    ];
    const [firstContext, secondContext] = contextsFor(notes, {
      sourceItemId: notes[0].sourceItemId,
      creatorId: 'professor-jiang',
      creatorName: 'Professor Jiang',
      title: 'Iran Expands Exclusion Zone?',
      url: 'https://example.test/jiang',
      publishedAt: '2026-09-19T12:00:00.000Z',
    });
    const first = resolveNoteDeterministically(firstContext);
    const timedFirst = { ...first, ...assignEntryTime({ context: firstContext, entry: first, source: firstContext.source }) };
    const second = resolveNoteDeterministically(secondContext);
    const timedSecond = { ...second, ...assignEntryTime({ context: secondContext, entry: second, source: secondContext.source }) };
    expect(timedFirst.timeProvenance).toBe('explicit_event_time');
    expect(timedFirst.occurredAt?.startsWith('2026-09-18')).toBe(true);
    expect(timedSecond.timeProvenance).toBe('source_publication_time');
    expect(timedSecond.occurredAt?.startsWith('2026-09-19')).toBe(true);

    const combined = {
      ...clusterEntriesIntoThreads([timedFirst])[0],
      entries: [timedSecond, timedFirst],
    };
    const threads = applyChronology([combined], firstContext.source);
    const ordered = threads[0]?.entries || [];
    expect(ordered[0]?.resolvedText).toMatch(/September 18/i);
    expect(ordered[0]?.sortOrder).toBe(0);
    expect(ordered[1]?.timeProvenance).toBe('source_publication_time');
  });

  it('tracks creator convergence separately from source corroboration', () => {
    const jiang = makeNote({
      kind: 'event',
      text: 'Iran announced a new maritime exclusion zone.',
      attribution: 'Professor Jiang',
      startSeconds: 10,
    });
    const pakman = makeNote({
      id: '00000000-0000-4000-8000-000000000042',
      sourceItemId: 'pakman-item',
      creatorId: 'david-pakman',
      kind: 'event',
      text: 'Iran announced a new maritime exclusion zone after the navy warning.',
      attribution: 'David Pakman',
      startSeconds: 12,
    });
    const entries = [
      ...contextsFor([jiang]).map((context) => resolveNoteDeterministically(context)),
      ...contextsFor([pakman], {
        sourceItemId: 'pakman-item',
        creatorId: 'david-pakman',
        creatorName: 'David Pakman',
        title: 'Show',
        url: 'https://example.test/pakman',
        publishedAt: '2026-09-16T13:00:00.000Z',
      }).map((context) => resolveNoteDeterministically(context)),
    ];
    const clustered = clusterEntriesIntoThreads(entries);
    const withSemantics = applyCorroborationSemantics(clustered);
    expect(withSemantics[0]?.creatorConvergenceCount).toBe(2);
    expect(withSemantics[0]?.sourceCorroborationCount).toBe(0);

    const linked = {
      ...withSemantics[0],
      intelLinks: selectIntelOsintLinks(withSemantics[0], [
        makeIntelCandidate({
          id: '00000000-0000-4000-8000-000000000080',
          title: 'Iran announces maritime exclusion zone after navy warning',
          summary: 'The exclusion zone expansion follows a navy warning in the Gulf.',
          sourceName: 'Reuters',
          deskLane: 'osint',
        }),
        makeIntelCandidate({
          id: '00000000-0000-4000-8000-000000000081',
          title: 'Trump holds Michigan rally',
          summary: 'Campaign stop, no maritime reporting.',
          sourceName: 'Wire',
          deskLane: 'osint',
        }),
      ]),
    };
    const after = applyCorroborationSemantics([linked]);
    expect(after[0]?.creatorConvergenceCount).toBe(2);
    expect(after[0]?.sourceCorroborationCount).toBeGreaterThan(0);
    expect(after[0]?.sourceCorroborationCount).not.toBe(after[0]?.creatorConvergenceCount);
    expect(after[0]?.intelLinks.some((link) => /michigan rally/i.test(link.title || ''))).toBe(false);
  });
});
