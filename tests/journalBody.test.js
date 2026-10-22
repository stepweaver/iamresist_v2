import { describe, expect, it } from 'vitest';
import { journalBodyHash, latestRevisedBlockTime, nextBodyRevision } from '@/lib/journalBody';

function paragraph(text, edited = '2026-10-12T04:49:00.000Z') {
  return {
    type: 'paragraph',
    last_edited_time: edited,
    paragraph: { rich_text: [{ plain_text: text }] },
  };
}

describe('journalBodyHash', () => {
  it('stays the same when Notion restamps a block that was only opened', () => {
    const original = [paragraph('The sitting Secretary of State can’t answer.', '2026-01-05T13:49:00.000Z')];
    const opened = [paragraph('The sitting Secretary of State can’t answer.', '2026-10-12T04:49:00.000Z')];

    expect(journalBodyHash(opened)).toBe(journalBodyHash(original));
  });

  it('changes when the writing changes', () => {
    expect(journalBodyHash([paragraph('The record said one thing.')])).not.toBe(
      journalBodyHash([paragraph('The record said another thing.')]),
    );
  });
});

describe('latestRevisedBlockTime', () => {
  it('ignores text from the publication day and later non-text blocks', () => {
    const blocks = [
      paragraph('Published wording.', '2026-01-05T13:49:00.000Z'),
      {
        type: 'image',
        last_edited_time: '2026-10-12T04:49:00.000Z',
        image: { caption: [] },
      },
    ];

    expect(latestRevisedBlockTime(blocks, '2026-01-05')).toBeNull();
  });

  it('uses the newest text block revised after publication', () => {
    const blocks = [
      paragraph('The original paragraph.', '2026-01-05T13:49:00.000Z'),
      paragraph('A paragraph revised in October.', '2026-10-09T18:00:00.000Z'),
      paragraph('A smaller revision in March.', '2026-03-04T12:00:00.000Z'),
    ];

    expect(latestRevisedBlockTime(blocks, '2026-01-05')).toBe('2026-10-09T18:00:00.000Z');
  });
});

describe('nextBodyRevision', () => {
  const now = '2026-10-12T14:00:00.000Z';
  const revised = '2026-10-09T18:00:00.000Z';

  it('remembers the first copy without calling it an update', () => {
    expect(nextBodyRevision(null, 'abc', now)).toEqual({
      contentHash: 'abc',
      bodyEditedTime: null,
      write: true,
    });
  });

  it('records a revision that was already in the first copy we stored', () => {
    expect(nextBodyRevision(null, 'abc', now, revised)).toEqual({
      contentHash: 'abc',
      bodyEditedTime: revised,
      write: true,
    });
  });

  it('does not mark an unchanged body as updated', () => {
    expect(nextBodyRevision({ contentHash: 'abc', bodyEditedTime: null }, 'abc', now)).toEqual({
      contentHash: 'abc',
      bodyEditedTime: null,
      write: false,
    });
  });

  it('backfills an update onto a baseline that was stored before we could see the revision', () => {
    expect(nextBodyRevision({ contentHash: 'abc', bodyEditedTime: null }, 'abc', now, revised)).toEqual({
      contentHash: 'abc',
      bodyEditedTime: revised,
      write: true,
    });
  });

  it('keeps an update date already recorded for the same text', () => {
    expect(
      nextBodyRevision({ contentHash: 'abc', bodyEditedTime: revised }, 'abc', now, '2026-10-21T11:00:00.000Z'),
    ).toEqual({
      contentHash: 'abc',
      bodyEditedTime: revised,
      write: false,
    });
  });

  it('records the moment the text changes', () => {
    expect(nextBodyRevision({ contentHash: 'abc', bodyEditedTime: null }, 'def', now).bodyEditedTime).toBe(
      now,
    );
    expect(
      nextBodyRevision({ contentHash: 'abc', bodyEditedTime: null }, 'def', now, revised).bodyEditedTime,
    ).toBe(revised);
  });
});
