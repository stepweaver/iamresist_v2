import Link from 'next/link';
import { curatedSourceLabel, selectCuratedResources } from '@/lib/curated/resources';
import { formatJournalMetaDate } from '@/lib/utils/date';

function ResourceArtwork({ image, compact = false }) {
  if (!image?.src) return null;
  return (
    <img
      src={image.src}
      alt={image.alt || ''}
      width={image.width || undefined}
      height={image.height || undefined}
      decoding="async"
      loading="lazy"
      className={
        compact
          ? 'h-16 w-16 shrink-0 border border-border object-contain object-center'
          : 'mb-3 block h-auto max-h-48 w-full border border-border object-contain object-top'
      }
    />
  );
}

function CuratedResourceItem({ resource, compact = false }) {
  const source = curatedSourceLabel(resource);
  const dateLabel = formatJournalMetaDate(resource.publishedAt);
  const dateTime = String(resource.publishedAt || '').slice(0, 10);

  return (
    <article className={compact ? 'flex min-w-0 gap-3 py-3' : 'min-w-0 py-3'}>
      <ResourceArtwork image={resource.image} compact={compact} />
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/55">
          {[source || 'Source', resource.resourceType, resource.featured ? 'Featured' : '']
            .filter(Boolean)
            .join(' · ')}
        </p>
        <h3
          className={
            compact
              ? 'mt-1 text-lg font-semibold leading-snug text-foreground'
              : 'mt-1 text-xl font-semibold leading-snug text-foreground'
          }
        >
          <a href={resource.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
            {resource.title}
          </a>
        </h3>
        {resource.editorialNote ? (
          <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-foreground/75">{resource.editorialNote}</p>
        ) : null}
        {dateLabel ? (
          <time
            className="mt-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/50"
            dateTime={dateTime || undefined}
          >
            {dateLabel}
          </time>
        ) : null}
      </div>
    </article>
  );
}

export default function CuratedResourceGroup({ resources, compact = false, testId }) {
  const items = selectCuratedResources(resources, compact ? { limit: 3 } : {});
  if (!items.length) return null;
  const headingId = compact ? 'home-curated-resources-title' : 'curated-resources-title';

  return (
    <section
      aria-labelledby={headingId}
      data-testid={testId || (compact ? 'home-curated-resources' : 'curated-resources')}
      className={compact ? '' : 'space-y-3'}
    >
      <div className="flex items-end justify-between gap-4 border-b border-primary/70 pb-2">
        <div>
          <h2 id={headingId} className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">
            Curated Resources
          </h2>
          {compact ? null : (
            <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-foreground/70">
              Outside writing selected for this shelf. Each link opens the original source.
            </p>
          )}
        </div>
        {compact ? (
          <Link href="/resources" className="nav-label shrink-0 text-xs text-foreground/60 hover:text-primary">
            All resources
          </Link>
        ) : null}
      </div>
      <ul
        className={
          compact
            ? 'm-0 list-none divide-y divide-border border border-border px-4'
            : 'm-0 grid list-none gap-4 p-0 lg:grid-cols-2'
        }
      >
        {items.map((resource) => (
          <li key={resource.id || resource.url} className={compact ? '' : 'border border-border px-4'}>
            <CuratedResourceItem resource={resource} compact={compact} />
          </li>
        ))}
      </ul>
    </section>
  );
}
