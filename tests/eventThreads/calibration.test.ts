import { describe, expect, it } from 'vitest';

import { buildEventThreads } from '@/lib/eventThreads/build';
import { applyCorroborationSemantics } from '@/lib/eventThreads/corroboration';
import {
  clusterEntriesIntoThreads,
  hasStrongEventIdentity,
  identityFromEntry,
  identityKeyFor,
  shouldMergeThreadIdentities,
} from '@/lib/eventThreads/identity';
import { selectIntelOsintLinks } from '@/lib/eventThreads/intelLinks';
import { applyResolvedCandidate, resolveNoteDeterministically, resolveSemanticRoleIntercept } from '@/lib/eventThreads/resolve';
import { createMemoryAtomicNotesReader, createMemoryEventThreadsWriter } from '@/lib/eventThreads/store';
import { totalWrites } from '@/lib/eventThreads/writes';
import { contextsFor, features, makeIntelCandidate, makeNote } from './helpers';

describe('Event Threads V1 calibration', () => {
  it('allows one source episode to create multiple event-specific threads', () => {
    const notes = [
      makeNote({
        kind: 'event',
        text: 'Iran launched 20 ballistic missiles at ships near Hormuz.',
        sourceExcerpt: 'Iran launched 20 ballistic missiles at ships near Hormuz.',
        eventFeatures: features({ actors: ['Iran'], action: 'launched', object: '20 ballistic missiles', locations: ['Hormuz'] }),
        startSeconds: 10,
      }),
      makeNote({
        kind: 'event',
        text: 'American THAAD and Patriot Systems intercept 18 of them.',
        sourceExcerpt: 'American THAAD and Patriot Systems intercept 18 of them.',
        eventFeatures: features({ actors: ['THAAD', 'Patriot'], action: 'intercept', object: '18 of them' }),
        startSeconds: 28,
      }),
      makeNote({
        kind: 'event',
        text: "Lloyd's of London paused tanker underwriting through the Strait of Hormuz.",
        sourceExcerpt: "Lloyd's of London paused tanker underwriting through the Strait of Hormuz.",
        eventFeatures: features({
          actors: ["Lloyd's of London"],
          action: 'paused',
          object: 'tanker underwriting',
          institutions: ["Lloyd's of London"],
          locations: ['Strait of Hormuz'],
        }),
        startSeconds: 80,
      }),
      makeNote({
        kind: 'event',
        text: 'UAE accelerated the Fujairah pipeline as an alternative Hormuz export route.',
        sourceExcerpt: 'UAE accelerated the Fujairah pipeline as an alternative Hormuz export route.',
        eventFeatures: features({
          actors: ['UAE'],
          action: 'accelerated',
          object: 'Fujairah pipeline',
          locations: ['Fujairah'],
        }),
        startSeconds: 120,
      }),
      makeNote({
        kind: 'event',
        text: 'Iran captured a UUV in the Strait of Hormuz.',
        sourceExcerpt: 'Iran captured a UUV in the Strait of Hormuz.',
        eventFeatures: features({ actors: ['Iran'], action: 'captured', object: 'UUV', locations: ['Strait of Hormuz'] }),
        startSeconds: 160,
      }),
      makeNote({
        kind: 'creator_analysis',
        text: 'Jiang interprets the missile intercept as evidence the air defense held.',
        sourceExcerpt: 'Jiang interprets the missile intercept as evidence the air defense held.',
        startSeconds: 40,
      }),
    ];
    const entries = contextsFor(notes).map((context) => resolveNoteDeterministically(context));
    const threads = clusterEntriesIntoThreads(entries);
    expect(threads.length).toBeGreaterThanOrEqual(3);
    expect(threads.length).toBeLessThan(notes.length);
    const blob = threads.map((thread) => `${thread.title} ${thread.identityKey}`).join(' | ').toLowerCase();
    expect(blob).toMatch(/ballistic|thaad|patriot/);
    expect(blob).toMatch(/lloyd|underwriting|tanker/);
    expect(blob).toMatch(/fujairah|pipeline/);
    expect(blob).toMatch(/\buuv\b/);
    expect(threads.every((thread) => !/^iran$|^america$|^military$|^hormuz$/i.test(thread.title))).toBe(true);
  });

  it('does not merge entries from broad topical overlap alone', () => {
    const notes = [
      makeNote({
        kind: 'event',
        text: 'Iran held a military parade in Tehran after regional escalation.',
        sourceExcerpt: 'Iran held a military parade in Tehran after regional escalation.',
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
        text: 'America announced a Middle East defense posture review.',
        sourceExcerpt: 'America announced a Middle East defense posture review.',
        startSeconds: 140,
      }),
    ];
    const entries = contextsFor(notes).map((context) => resolveNoteDeterministically(context));
    expect(shouldMergeThreadIdentities(identityFromEntry(entries[0]), identityFromEntry(entries[1]))).toBe(false);
    expect(shouldMergeThreadIdentities(identityFromEntry(entries[1]), identityFromEntry(entries[2]))).toBe(false);
    const threads = clusterEntriesIntoThreads(entries);
    expect(threads.length).toBeGreaterThanOrEqual(2);
  });

  it('does not let generic identity tokens define thread identity', () => {
    const notes = [
      makeNote({
        kind: 'event',
        text: 'At least five separate events occurred in the region.',
        sourceExcerpt: 'At least five separate events occurred in the region.',
        startSeconds: 12,
      }),
    ];
    const entry = resolveNoteDeterministically(contextsFor(notes)[0]);
    const identity = identityFromEntry(entry);
    expect(identity.terms.join('|')).not.toMatch(/\bleast\b|\bfive\b|\bseparate\b|\bevents\b|\boccurred\b/);
    expect(identity.phrases.join('|')).not.toMatch(/least five|five separate|separate events|events occurred/);
    expect(hasStrongEventIdentity(identity)).toBe(false);
    expect(identityKeyFor(identity)).not.toMatch(/least five|five separate|separate events/);
    expect(clusterEntriesIntoThreads([entry])).toHaveLength(0);
  });

  it('accepts 18 of 20 semantic-role resolution when both numbers exist', () => {
    const notes = [
      makeNote({
        kind: 'event',
        text: 'Iran fires 20 ballistic missiles.',
        sourceExcerpt: 'Iran fires 20 ballistic missiles toward the ships.',
        eventFeatures: features({ actors: ['Iran'], action: 'fires', object: '20 ballistic missiles' }),
        startSeconds: 12,
      }),
      makeNote({
        kind: 'event',
        text: 'American THAAD and Patriot Systems intercept 18 of them.',
        sourceExcerpt: 'American THAAD and Patriot Systems intercept 18 of them.',
        eventFeatures: features({
          actors: ['American THAAD and Patriot Systems'],
          action: 'intercept',
          object: '18 of them',
        }),
        startSeconds: 28,
      }),
    ];
    const interceptContext = contextsFor(notes)[1];
    const resolved = resolveSemanticRoleIntercept(interceptContext) || resolveNoteDeterministically(interceptContext);
    expect(resolved.resolutionType).toBe('semantic_role');
    expect(resolved.resolvedText).toBe('U.S. THAAD and Patriot systems intercepted 18 of 20 Iranian missiles.');
  });

  it('rejects invented 48/48 and 20/48 intercept quantities', () => {
    const notes = [
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
    ];
    const interceptContext = contextsFor(notes)[1];
    const inventedAll = applyResolvedCandidate(interceptContext, {
      resolvedText: 'U.S. THAAD and Patriot systems intercepted 48 of 48 Iranian missiles.',
      resolutionType: 'semantic_role',
      entryKind: 'event',
    });
    expect(inventedAll.resolutionType).toBe('uncertain');
    expect(inventedAll.resolvedText).toBe('American THAAD and Patriot Systems intercept 18 of them.');
    expect(inventedAll.resolvedText).not.toMatch(/48/);

    const inventedMix = applyResolvedCandidate(interceptContext, {
      resolvedText: 'U.S. THAAD and Patriot systems intercepted 20 of 48 Iranian missiles.',
      resolutionType: 'semantic_role',
      entryKind: 'event',
    });
    expect(inventedMix.resolutionType).toBe('uncertain');
    expect(inventedMix.resolvedText).not.toMatch(/48/);
  });

  it('fails closed when semantic-role resolution corrupts actor or object', () => {
    const notes = [
      makeNote({
        kind: 'event',
        text: 'Iran launched missiles at airbases.',
        sourceExcerpt: 'Iran launched missiles at airbases.',
        eventFeatures: features({ actors: ['Iran'], action: 'launched', object: 'missiles' }),
        startSeconds: 10,
      }),
      makeNote({
        kind: 'event',
        text: 'They are not trying to destroy planes, but to ground them quietly.',
        sourceExcerpt: 'They are not trying to destroy planes, but to ground them quietly.',
        startSeconds: 22,
      }),
    ];
    const context = contextsFor(notes)[1];
    const corruptedObject = applyResolvedCandidate(context, {
      resolvedText: 'Iran is not trying to destroy planes, but to ground Iran quietly.',
      resolutionType: 'semantic_role',
      entryKind: 'event',
    });
    expect(corruptedObject.resolutionType).toBe('uncertain');
    expect(corruptedObject.resolvedText).toBe('They are not trying to destroy planes, but to ground them quietly.');

    const doubledActor = applyResolvedCandidate(context, {
      resolvedText: 'Iran is escalating Iran actions in the Gulf.',
      resolutionType: 'semantic_role',
      entryKind: 'event',
    });
    expect(doubledActor.resolutionType).toBe('uncertain');
    expect(doubledActor.resolvedText).not.toMatch(/escalating Iran actions/i);
  });

  it('does not convert a steelman proposition into creator belief', () => {
    const notes = [
      makeNote({
        kind: 'creator_analysis',
        text: 'Jiang is constructing a steelman of the official narrative.',
        sourceExcerpt: 'Jiang is constructing a steelman of the official narrative.',
        startSeconds: 80,
      }),
      makeNote({
        kind: 'creator_analysis',
        text: 'The alternative explanation is that Iran may be bluffing.',
        sourceExcerpt: 'The alternative explanation is that Iran may be bluffing.',
        startSeconds: 92,
      }),
    ];
    const context = contextsFor(notes)[1];
    const resolved = resolveNoteDeterministically(context);
    expect(resolved.resolutionType).toBe('discourse_context');
    expect(resolved.resolvedText).toMatch(/considers the alternative explanation that Iran may be bluffing/i);
    expect(resolved.resolvedText).not.toMatch(/jiang believes/i);

    const believed = applyResolvedCandidate(context, {
      resolvedText: 'Jiang believes Iran is desperate and firing to look strong.',
      resolutionType: 'literal',
      entryKind: 'event',
    });
    expect(believed.resolutionType).toBe('uncertain');
    expect(believed.resolvedText).not.toMatch(/jiang believes/i);
    expect(believed.resolvedText).toMatch(/alternative explanation/i);
  });

  it('keeps creator endorsement after a steelman distinguishable', () => {
    const notes = [
      makeNote({
        kind: 'creator_analysis',
        text: 'Jiang steelmans the claim that missed targets were chance.',
        sourceExcerpt: 'Jiang steelmans the claim that missed targets were chance.',
        startSeconds: 100,
      }),
      makeNote({
        kind: 'creator_analysis',
        text: 'Jiang argues that this explanation fails to account for the UUV capture.',
        sourceExcerpt: 'Jiang argues that this explanation fails to account for the UUV capture.',
        startSeconds: 112,
      }),
    ];
    const resolved = resolveNoteDeterministically(contextsFor(notes)[1]);
    expect(resolved.entryKind).toBe('creator_analysis');
    expect(resolved.resolutionType).toBe('creator_analysis');
    expect(resolved.resolvedText).toMatch(/fails to account for the UUV capture/i);
    expect(resolved.resolvedText).not.toMatch(/jiang believes/i);
  });

  it('rejects generic Intel keyword overlap and accepts strong event anchors', () => {
    const notes = [
      makeNote({
        kind: 'event',
        text: "Lloyd's of London paused tanker underwriting through the Strait of Hormuz.",
        sourceExcerpt: "Lloyd's of London paused tanker underwriting through the Strait of Hormuz.",
        eventFeatures: features({
          actors: ["Lloyd's of London"],
          action: 'paused',
          object: 'tanker underwriting',
          institutions: ["Lloyd's of London"],
          locations: ['Strait of Hormuz'],
        }),
        startSeconds: 80,
      }),
    ];
    const thread = applyCorroborationSemantics(clusterEntriesIntoThreads(contextsFor(notes).map((context) => resolveNoteDeterministically(context))))[0];
    expect(thread).toBeTruthy();

    const genericOnly = selectIntelOsintLinks(thread, [
      makeIntelCandidate({
        title: 'Federal Register notice on public defense systems and state support',
        summary: 'A billion-dollar military statement about port year support and public attack systems.',
        sourceName: 'Federal Register',
      }),
      makeIntelCandidate({
        title: 'Obamacare defense of the public option',
        summary: 'Health policy statement on state support and public systems.',
        sourceName: 'Wire',
      }),
      makeIntelCandidate({
        title: 'Russian domestic military parade in Moscow',
        summary: 'Defense ministry statement on public support.',
        sourceName: 'Wire',
      }),
      makeIntelCandidate({
        title: 'Ukraine frontline attack and military support',
        summary: 'Public statement on defense systems this year.',
        sourceName: 'Wire',
      }),
    ]);
    expect(genericOnly).toHaveLength(0);

    const strong = selectIntelOsintLinks(thread, [
      makeIntelCandidate({
        id: '00000000-0000-4000-8000-000000000201',
        title: "Lloyd's of London pauses tanker underwriting near the Strait of Hormuz",
        summary: 'Marine insurers halt tanker underwriting after Hormuz risk spiked.',
        sourceName: 'Reuters',
        publishedAt: '2026-09-18T12:00:00.000Z',
      }),
    ]);
    expect(strong.length).toBeGreaterThan(0);
    expect(strong[0]?.matchSignals.join(' ')).toMatch(/lloyd|hormuz|tanker underwriting/i);
    expect(strong[0]?.matchSignals.join(' ')).not.toMatch(/\bsystem\b|\bdefense\b|\bstate\b|\bbillion\b/);
    expect(strong[0]?.matchSignals.some((signal) => signal.startsWith('term:'))).toBe(false);

    expect(selectIntelOsintLinks(thread, [])).toHaveLength(0);
  });

  it('keeps dry-run at zero writes and leaves Atomic Notes immutable', async () => {
    const notes = [
      makeNote({
        kind: 'event',
        text: 'Iran launched 20 ballistic missiles at ships near Hormuz.',
        startSeconds: 10,
      }),
      makeNote({
        kind: 'creator_analysis',
        text: 'The alternative explanation is that Iran may be bluffing.',
        startSeconds: 40,
      }),
    ];
    const original = notes.map((note) => ({ ...note, sourceSegmentIndexes: [...note.sourceSegmentIndexes] }));
    const writer = createMemoryEventThreadsWriter();
    const result = await buildEventThreads({
      sourceItemId: notes[0].sourceItemId,
      dryRun: true,
      reader: createMemoryAtomicNotesReader(notes),
      writer,
      aiConfig: null,
    });
    expect(result.persistence.dryRun).toBe(true);
    expect(result.persistence.notesMutated).toBe(0);
    expect(totalWrites(result.writes)).toBe(0);
    expect(result.writes.creatorAtomicNotes).toBe(0);
    expect(result.writes.themeMemory).toBe(0);
    expect(result.writes.ranking).toBe(0);
    expect(notes).toEqual(original);
  });
});
