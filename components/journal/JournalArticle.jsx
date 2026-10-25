import Link from 'next/link';

export default function JournalArticle({
  title,
  dates,
  tags = [],
  author = '',
  related = [],
  subscriptionUrl = '',
  children,
}) {
  const tagList = Array.isArray(tags) ? tags.filter(Boolean) : [];

  return (
    <div className="journal-article">
        <p className="journal-return">
        <Link href="/journal">Essays & Analysis</Link>
      </p>
      <div className="journal-article__grid">
        <aside className="journal-rail" aria-label="Record details">
          {dates?.displayLabel ? (
            <div className="journal-rail__block">
              <p className="journal-rail__label">Published</p>
              <time dateTime={dates.dateTime || undefined}>{dates.displayLabel}</time>
            </div>
          ) : (
            <div className="journal-rail__block">
              <p className="journal-rail__label">Essay</p>
              <p>Journal</p>
            </div>
          )}
          {dates?.showUpdated && dates.updatedLabel ? (
            <div className="journal-rail__block">
              <p className="journal-rail__label">Updated</p>
              <time dateTime={dates.updatedDateTime || undefined}>{dates.updatedLabel}</time>
            </div>
          ) : null}
          {tagList.length > 0 ? (
            <div className="journal-rail__block">
              <p className="journal-rail__label">Tags</p>
              <ul className="journal-tags">
                {tagList.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {author ? (
            <div className="journal-rail__block">
              <p className="journal-rail__label">Author</p>
              <p>{author}</p>
            </div>
          ) : null}
        </aside>

        <article className="journal-reading">
          <header className="journal-reading__header">
            <p className="journal-kicker">Essay</p>
            <h1 className="journal-article__title">{title}</h1>
          </header>
          {children}
          {related.length > 0 ? (
            <section className="journal-continue" aria-labelledby="journal-continue-title">
              <h2 id="journal-continue-title" className="journal-continue__title">
                Continue Exploring
              </h2>
              <ul className="journal-continue__list">
                {related.map((record) => (
                  <li key={record.id || record.href}>
                    <Link href={record.href}>
                      <span>{record.title}</span>
                      {record.dateLabel ? (
                        <time dateTime={record.dateTime || undefined}>{record.dateLabel}</time>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {subscriptionUrl ? (
            <p className="journal-subscribe">
              <a href={subscriptionUrl} rel="noopener noreferrer">
                Subscribe to the journal
              </a>
            </p>
          ) : null}
          <p className="journal-return journal-return--end">
            <Link href="/journal">Essays & Analysis</Link>
          </p>
        </article>
      </div>
    </div>
  );
}
