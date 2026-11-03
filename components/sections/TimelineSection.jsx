import Link from 'next/link';
import { formatDate } from '@/lib/utils/date';
import { getTimelineEvents, timelineCategorySlug } from '@/lib/data/timeline';

function formatTimelineCardDate(dateStr) {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return formatDate(d.toISOString());
}

export default function TimelineSection() {
  const events = getTimelineEvents();
  const seenCategories = new Set();

  return (
    <div className="timeline-track">
      {events.map((event, index) => {
        const category = String(event.category || '');
        const isCategoryStart = category && !seenCategories.has(category);
        if (isCategoryStart) seenCategories.add(category);
        const categoryId = isCategoryStart ? `timeline-${timelineCategorySlug(category)}` : undefined;
        const categorySlug = timelineCategorySlug(category);

        return (
          <article
            key={`${event.date}-${event.title}-${index}`}
            id={categoryId}
            data-category={categorySlug || undefined}
            className="timeline-event"
          >
            <div className="timeline-event__axis" aria-hidden="true">
              <span className="timeline-event__tick" />
            </div>
            <div className="timeline-event__body">
              <div className="timeline-event__meta">
                <span className="timeline-event__category">{category}</span>
                <time
                  className="timeline-event__date"
                  dateTime={/^\d{4}-\d{2}-\d{2}/.test(event.date || '') ? event.date : undefined}
                >
                  {formatTimelineCardDate(event.date)}
                </time>
              </div>
              <h3 className="timeline-event__title">{event.title}</h3>
              <p className="timeline-event__description">{event.description}</p>
              {event.link ? (
                <Link
                  href={event.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="timeline-event__source"
                >
                  View source timeline
                </Link>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
