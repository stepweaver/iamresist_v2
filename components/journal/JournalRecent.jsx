import Link from 'next/link';
import JournalFigure from '@/components/journal/JournalFigure';
import { journalImageFit } from '@/components/journal/journalFormat';

function SupportRecord({ record, prominent }) {
  const category = record.tags?.find(Boolean) || '';
  const fit = record.image?.src ? journalImageFit(record.image) : '';
  const withArt = fit ? ` journal-support--${fit}` : '';
  const prominence = prominent ? ' journal-support--primary' : '';

  return (
    <article className={`journal-support${prominence}${withArt}`}>
      <Link className="journal-support__link" href={record.href}>
        <span className="journal-support__copy">
          <span className="journal-kicker journal-support__kicker">
            {record.featured ? <span>Featured</span> : null}
            <span className="journal-kicker__category">{category || 'Essay'}</span>
            {record.dateLabel ? (
              <time dateTime={record.dateTime || undefined}>{record.dateLabel}</time>
            ) : null}
            {record.readingLabel ? <span>{record.readingLabel}</span> : null}
          </span>
          <span className="journal-support__title">{record.title}</span>
          {record.excerpt ? <span className="journal-support__excerpt">{record.excerpt}</span> : null}
          {record.updatedLabel ? (
            <span className="journal-feature__updated">
              Updated{' '}
              <time dateTime={record.updatedDateTime || undefined}>{record.updatedLabel}</time>
            </span>
          ) : null}
          <span className="journal-text-link">Read essay</span>
        </span>
        <JournalFigure image={record.image} className="journal-support__media" />
      </Link>
    </article>
  );
}

export default function JournalRecent({ records }) {
  if (!records?.length) return null;

  return (
    <section className="journal-recent" aria-labelledby="journal-recent-title">
      <div className="journal-recent__intro">
        <h2 id="journal-recent-title" className="journal-recent__title">
          Further reading
        </h2>
      </div>
      <div className="journal-recent__list">
        {records.map((record, index) => (
          <SupportRecord
            key={record.id || record.href}
            record={record}
            prominent={index === 0}
          />
        ))}
      </div>
    </section>
  );
}
