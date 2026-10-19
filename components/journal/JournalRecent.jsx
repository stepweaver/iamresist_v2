import Link from 'next/link';

export default function JournalRecent({ records }) {
  if (!records?.length) return null;

  return (
    <section className="journal-recent" aria-labelledby="journal-recent-title">
      <div className="journal-recent__intro">
        <h2 id="journal-recent-title" className="journal-recent__title">
          Recent writing
        </h2>
      </div>
      <div className="journal-recent__grid">
        {records.map((record) => (
          <article key={record.id || record.href} className="journal-recent__card">
            <p className="journal-kicker">
              {record.dateLabel ? (
                <time dateTime={record.dateTime || undefined}>{record.dateLabel}</time>
              ) : (
                <span>Essay</span>
              )}
            </p>
            <h3 className="journal-recent__title-link">
              <Link href={record.href}>{record.title}</Link>
            </h3>
            {record.tags?.length > 0 ? (
              <ul className="journal-tags">
                {record.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            ) : null}
            {record.excerpt ? <p className="journal-recent__excerpt">{record.excerpt}</p> : null}
            {record.updatedLabel ? (
              <p className="journal-feature__updated">
                Updated{' '}
                <time dateTime={record.updatedDateTime || undefined}>{record.updatedLabel}</time>
              </p>
            ) : null}
            <Link className="journal-text-link" href={record.href}>
              Read essay
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
