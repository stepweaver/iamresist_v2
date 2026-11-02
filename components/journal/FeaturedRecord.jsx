import Link from 'next/link';
import JournalFigure from '@/components/journal/JournalFigure';
import { journalImageFit } from '@/components/journal/journalFormat';

export default function FeaturedRecord({ record }) {
  if (!record) return null;

  const kicker = record.kicker || 'Latest essay';
  const fit = record.image?.src ? journalImageFit(record.image) : '';
  const split = fit === 'crop';
  const tags = Array.isArray(record.tags) ? record.tags.filter(Boolean) : [];
  const layout = split
    ? 'journal-feature__link journal-feature__layout journal-feature__layout--split'
    : 'journal-feature__link journal-feature__layout';

  return (
    <section className="journal-feature" aria-labelledby="journal-featured-title">
      <Link href={record.href} className={layout}>
        <span className="journal-feature__copy">
          <span className="journal-kicker">
            <span>{kicker}</span>
            {record.featured ? <span>Featured</span> : null}
            {tags.map((tag) => (
              <span key={tag} className="journal-kicker__category">
                {tag}
              </span>
            ))}
            {record.dateLabel ? (
              <time dateTime={record.dateTime || undefined}>{record.dateLabel}</time>
            ) : null}
            {record.readingLabel ? <span>{record.readingLabel}</span> : null}
          </span>
          <h2 id="journal-featured-title" className="journal-feature__title">
            {record.title}
          </h2>
          {record.excerpt ? <p className="journal-feature__excerpt">{record.excerpt}</p> : null}
          {record.updatedLabel ? (
            <p className="journal-feature__updated">
              Updated{' '}
              <time dateTime={record.updatedDateTime || undefined}>{record.updatedLabel}</time>
            </p>
          ) : null}
          <span className="journal-text-link">Read essay</span>
        </span>
        <JournalFigure image={record.image} className="journal-feature__media" priority />
      </Link>
    </section>
  );
}
