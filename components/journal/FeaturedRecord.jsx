import Link from 'next/link';

export default function FeaturedRecord({ record }) {
  if (!record) return null;

  return (
    <section className="journal-feature" aria-labelledby="journal-featured-title">
      <span className="journal-tick journal-tick--tl" aria-hidden="true" />
      <span className="journal-tick journal-tick--tr" aria-hidden="true" />
      <span className="journal-tick journal-tick--bl" aria-hidden="true" />
      <span className="journal-tick journal-tick--br" aria-hidden="true" />
      <div className="journal-feature__main">
        <p className="journal-kicker">
          <span>Latest record</span>
          {record.dateLabel ? (
            <time dateTime={record.dateTime || undefined}>{record.dateLabel}</time>
          ) : null}
        </p>
        <h2 id="journal-featured-title" className="journal-feature__title">
          <Link href={record.href}>{record.title}</Link>
        </h2>
        {record.tags?.length > 0 && (
          <ul className="journal-tags">
            {record.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
        {record.excerpt ? <p className="journal-feature__excerpt">{record.excerpt}</p> : null}
        {record.updatedLabel ? (
          <p className="journal-feature__updated">
            Updated{' '}
            <time dateTime={record.updatedDateTime || undefined}>{record.updatedLabel}</time>
          </p>
        ) : null}
        <Link className="journal-text-link" href={record.href}>
          Open record
        </Link>
      </div>
      <div className="journal-feature__mark" aria-hidden="true">
        <span className="journal-feature__orbit journal-feature__orbit--outer" />
        <span className="journal-feature__orbit journal-feature__orbit--inner" />
        <span className="journal-feature__axis journal-feature__axis--h" />
        <span className="journal-feature__axis journal-feature__axis--v" />
        <span className="journal-feature__dot" />
      </div>
    </section>
  );
}
