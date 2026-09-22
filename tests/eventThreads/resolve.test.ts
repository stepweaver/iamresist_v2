import { describe, expect, it } from 'vitest';

import { applyResolvedCandidate, resolveNoteDeterministically, resolveSemanticRoleIntercept } from '@/lib/eventThreads/resolve';
import { contextsFor, features, makeNote } from './helpers';

describe('Event Threads contextual resolution', () => {
  it('resolves pronoun/coreference from the preceding window', () => {
    const notes = [
      makeNote({
        kind: 'event',
        text: 'Iran announced a new maritime exclusion zone.',
        sourceExcerpt: 'Iran announced a new maritime exclusion zone in the Gulf.',
        eventFeatures: features({ actors: ['Iran'], action: 'announced', object: 'maritime exclusion zone' }),
        startSeconds: 10,
      }),
      makeNote({
        kind: 'event',
        text: 'They widened it after the navy warning.',
        sourceExcerpt: 'They widened it after the navy warning.',
        startSeconds: 40,
      }),
    ];
    const context = contextsFor(notes)[1];
    const resolved = resolveNoteDeterministically(context);
    expect(resolved.resolutionType).toBe('coreference');
    expect(resolved.resolvedText.toLowerCase()).toContain('iran');
    expect(resolved.resolvedText.toLowerCase()).not.toMatch(/^\s*they /i);
  });

  it('performs semantic-role resolution for Iran launched / U.S. intercepted', () => {
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
    expect(resolved.entryKind).toBe('event');
  });

  it('does not convert steelman/counterargument into creator belief', () => {
    const notes = [
      makeNote({
        kind: 'creator_analysis',
        text: 'Jiang argues the steelman of the official narrative still fails.',
        sourceExcerpt: 'Jiang argues the steelman of the official narrative still fails even if one grants the strongest version.',
        startSeconds: 90,
      }),
    ];
    const resolved = resolveNoteDeterministically(contextsFor(notes)[0]);
    expect(resolved.entryKind).toBe('creator_analysis');
    expect(resolved.resolutionType).toBe('creator_analysis');
    expect(resolved.resolvedText).toMatch(/steelman/i);

    const flattened = applyResolvedCandidate(contextsFor(notes)[0], {
      resolvedText: 'Jiang believes the official narrative is true.',
      resolutionType: 'literal',
      entryKind: 'event',
    });
    expect(flattened.entryKind).toBe('creator_analysis');
    expect(flattened.resolutionType).toBe('uncertain');
    expect(flattened.resolvedText).toMatch(/steelman/i);
  });

  it('keeps conditional language conditional', () => {
    const notes = [
      makeNote({
        kind: 'claim',
        text: 'If Hormuz closes, insurance rates would spike.',
        sourceExcerpt: 'If Hormuz closes, Jiang says insurance rates would spike.',
        startSeconds: 50,
      }),
    ];
    const resolved = resolveNoteDeterministically(contextsFor(notes)[0]);
    expect(resolved.resolvedText).toMatch(/\bif\b/i);
    expect(resolved.resolvedText).toMatch(/\bwould\b/i);
    expect(resolved.resolvedText).not.toMatch(/Hormuz closed/i);
    expect(resolved.resolvedText).not.toMatch(/insurance rates spiked/i);

    const dropped = applyResolvedCandidate(contextsFor(notes)[0], {
      resolvedText: 'Hormuz closed and insurance rates spiked.',
      resolutionType: 'literal',
      entryKind: 'event',
    });
    expect(dropped.resolutionType).toBe('uncertain');
    expect(dropped.resolvedText).toMatch(/\bif\b/i);
  });

  it('keeps creator analysis as creator analysis', () => {
    const notes = [
      makeNote({
        kind: 'creator_analysis',
        text: 'Jiang interprets UAE export infrastructure as evidence disruption will persist.',
        sourceExcerpt: 'Jiang interprets the UAE investment in alternative export infrastructure as evidence regional actors expect disruption to persist.',
        startSeconds: 120,
      }),
    ];
    const resolved = resolveNoteDeterministically(contextsFor(notes)[0]);
    expect(resolved.entryKind).toBe('creator_analysis');
    expect(resolved.resolutionType).toBe('creator_analysis');

    const flattened = applyResolvedCandidate(contextsFor(notes)[0], {
      resolvedText: 'UAE accelerated alternative export infrastructure.',
      resolutionType: 'literal',
      entryKind: 'event',
    });
    expect(flattened.entryKind).toBe('creator_analysis');
  });

  it('rejects unsupported inference as uncertain', () => {
    const notes = [
      makeNote({
        kind: 'event',
        text: 'Iran fires 20 ballistic missiles.',
        sourceExcerpt: 'Iran fires 20 ballistic missiles toward the ships.',
        startSeconds: 12,
      }),
    ];
    const resolved = applyResolvedCandidate(contextsFor(notes)[0], {
      resolvedText: 'Israel destroyed 20 Iranian missiles to intimidate Tehran.',
      resolutionType: 'literal',
      entryKind: 'event',
    });
    expect(resolved.resolutionType).toBe('uncertain');
    expect(resolved.resolvedText).toBe('Iran fires 20 ballistic missiles.');
    expect(resolved.resolvedText).not.toMatch(/Israel/);
  });
});
