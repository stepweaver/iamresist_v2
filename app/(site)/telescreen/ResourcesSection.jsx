import Link from 'next/link';
import EmptyState from '@/components/content/EmptyState';
import CuratedResourceGroup from '@/components/resources/CuratedResourceGroup';
import { curatedResources, selectStartingResources } from '@/lib/data/resources';

function formatCategoryLabel(category) {
  if (!category) return 'Resources';
  return String(category).replace(/_/g, ' ');
}

function groupByCategory(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.category || 'Resources';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => String(a).localeCompare(String(b)));
}

function ResourceCard({ resource }) {
  return (
    <article className="group record-panel overflow-hidden">
      <div className="relative z-10 p-6">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <span className="record-meta">
            {resource.sourceLabel || 'Resource'}
          </span>
          {Array.isArray(resource.tags) && resource.tags.length ? (
            <span className="record-meta">
              {resource.tags.slice(0, 3).join(' / ')}
            </span>
          ) : null}
        </div>

        <h3 className="record-title mb-2 transition-colors group-hover:text-primary">
          <Link
            href={resource.href}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background"
          >
            {resource.title}
          </Link>
        </h3>

        {resource.description ? (
          <p className="prose-copy text-foreground/70 mb-4">
            {resource.description}
          </p>
        ) : null}

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <span className="record-meta truncate normal-case">
            {resource.href}
          </span>
          <Link
            href={resource.href}
            target="_blank"
            rel="noopener noreferrer"
            className="nav-label text-xs px-3 py-1 border border-primary text-primary hover:bg-primary hover:text-background transition-colors"
          >
            Visit resource -&gt;
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function ResourcesSection({ curated = [] }) {
  const items = Array.isArray(curatedResources) ? curatedResources : [];
  const grouped = groupByCategory(items);
  const starting = selectStartingResources(items, 3);

  return (
    <div className="space-y-8">
      <CuratedResourceGroup resources={curated} />
      {starting.length > 0 ? (
        <section aria-labelledby="resources-start-title" className="space-y-3">
          <h2 id="resources-start-title" className="record-title">
            Start here
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
            {starting.map((resource) => (
              <ResourceCard key={resource.id || resource.href} resource={resource} />
            ))}
          </div>
        </section>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="[ No Resources ]"
          description="No resources are listed yet."
        />
      ) : (
        <div className="space-y-6">
          <h2 className="record-title">Directory</h2>
          {grouped.map(([category, categoryItems]) => (
            <section key={category} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 className="record-title">
                  {formatCategoryLabel(category)}
                </h2>
                <span className="record-meta">
                  [{categoryItems.length}]
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
                {categoryItems.map((resource) => (
                  <ResourceCard key={resource.id || resource.href} resource={resource} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
