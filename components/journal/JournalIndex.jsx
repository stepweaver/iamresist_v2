'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { filterJournalRecords, filterJournalRecordsByTag } from '@/components/journal/journalFormat';

export default function JournalIndex({
  records,
  searchCoversArchive,
  activeTag = '',
  onClearTag,
}) {
  const inputId = useId();
  const noteId = useId();
  const [query, setQuery] = useState('');
  const scoped = useMemo(
    () => filterJournalRecordsByTag(records, activeTag),
    [records, activeTag],
  );
  const filtered = useMemo(
    () => filterJournalRecords(scoped, query),
    [scoped, query],
  );
  const archiveTotal = records.length;
  const total = scoped.length;
  const shown = filtered.length;
  const filtering = query.trim().length > 0;
  const subject = activeTag.trim();

  let countLabel = `${archiveTotal} published ${archiveTotal === 1 ? 'essay' : 'essays'}`;
  if (subject && filtering) {
    countLabel = `${shown} of ${total} ${total === 1 ? 'essay' : 'essays'}`;
  } else if (subject) {
    countLabel = `${total} ${total === 1 ? 'essay' : 'essays'} tagged ${subject}`;
  } else if (filtering) {
    countLabel = `${shown} of ${archiveTotal} ${archiveTotal === 1 ? 'essay' : 'essays'}`;
  }

  return (
    <section className="journal-index" id="records" aria-labelledby="journal-index-title">
      <div className="journal-index__intro">
        <h2 id="journal-index-title" className="journal-index__title">
          Complete archive
        </h2>
        <p className="journal-index__count" aria-live="polite">
          {countLabel}
        </p>
      </div>

      <form className="journal-search" role="search" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor={inputId}>Search the archive</label>
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Title, date, or tag"
          autoComplete="off"
          aria-describedby={noteId}
        />
        {filtering ? (
          <button type="button" onClick={() => setQuery('')}>
            Clear
          </button>
        ) : null}
      </form>
      <p id={noteId} className="journal-search__note">
        {subject
          ? `Showing essays tagged ${subject}. Search still matches title, date, and tag.`
          : searchCoversArchive
            ? 'Search published journal entries by title, date, or tag.'
            : 'Search covers the records loaded on this page.'}
        {subject && onClearTag ? (
          <>
            {' '}
            <button type="button" className="journal-inline-clear" onClick={onClearTag}>
              Show all essays
            </button>
          </>
        ) : null}
      </p>

      {shown === 0 ? (
        <p className="journal-index__empty" role="status">
          No essays match this search.
        </p>
      ) : (
        <ol className="journal-index__list">
          {filtered.map((record) => (
            <li key={record.id}>
              <Link className="journal-record" href={record.href}>
                <span className="journal-record__date">
                  {record.dateLabel ? (
                    <time dateTime={record.dateTime || undefined}>{record.dateLabel}</time>
                  ) : (
                    <span>Journal</span>
                  )}
                  {record.updatedLabel ? (
                    <span className="journal-record__updated">
                      Updated {record.updatedLabel}
                    </span>
                  ) : null}
                </span>
                <span className="journal-record__title">{record.title}</span>
                {record.tags?.length > 0 || record.author ? (
                  <span className="journal-record__meta">
                    {record.tags?.length > 0 ? record.tags.join(' · ') : null}
                    {record.author ? (
                      <span className="journal-record__author">{record.author}</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="journal-record__meta" />
                )}
                <span className="journal-record__open">Open</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
