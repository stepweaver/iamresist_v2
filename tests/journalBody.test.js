import { describe, expect, it } from 'vitest';
import { journalBodyHash, nextBodyRevision } from '@/lib/journalBody';

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

  it('ignores empty blocks and insignificant whitespace', () => {
    const compact = [paragraph('A sentence with spaces.')];
    const messy = [
      paragraph('A   sentence   with spaces.'),
      { type: 'paragraph', paragraph: { rich_text: [{ plain_text: '   ' }] } },
      { type: 'divider', divider: {} },
    ];

    expect(journalBodyHash(messy)).toBe(journalBodyHash(compact));
  });
});

describe('nextBodyRevision', () => {
  const now = '2026-10-12T14:00:00.000Z';

  it('remembers the first copy without calling it an update', () => {
    expect(nextBodyRevision(null, 'abc', now)).toEqual({
      contentHash: 'abc',
      bodyEditedTime: null,
      write: true,
    });
  });

  it('does not move the updated time when the same text is opened again', () => {
    expect(
      nextBodyRevision({ contentHash: 'abc', bodyEditedTime: null }, 'abc', now),
    ).toEqual({
      contentHash: 'abc',
      bodyEditedTime: null,
      write: false,
    });
    expect(
      nextBodyRevision(
        { contentHash: 'abc', bodyEditedTime: '2026-03-04T00:00:00.000Z' },
        'abc',
        now,
      ).bodyEditedTime,
    ).toBe('2026-03-04T00:00:00.000Z');
  });

  it('records the moment the text actually changes', () => {
    expect(
      nextBodyRevision({ contentHash: 'abc', bodyEditedTime: null }, 'def', now),
    ).toEqual({
      contentHash: 'def',
      bodyEditedTime: now,
      write: true,
    });
  });
});
