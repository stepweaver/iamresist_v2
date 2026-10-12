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

  it('does not mark an unchanged body as updated', () => {
    expect(nextBodyRevision({ contentHash: 'abc', bodyEditedTime: null }, 'abc', now)).toEqual({
      contentHash: 'abc',
      bodyEditedTime: null,
      write: false,
    });
  });

  it('records the moment the text changes', () => {
    expect(nextBodyRevision({ contentHash: 'abc', bodyEditedTime: null }, 'def', now).bodyEditedTime).toBe(
      now,
    );
  });
});
