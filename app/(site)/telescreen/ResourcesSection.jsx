import Link from 'next/link';
import EmptyState from '@/components/content/EmptyState';
import { curatedResources } from '@/lib/data/resources';

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

export default function ResourcesSection() {
  const items = Array.isArray(curatedResources) ? curatedResources : [];
  const grouped = groupByCategory(items);

  return (
    <div className="space-y-6">
      <div className="machine-panel border border-border p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <span className="font-mono text-[10px] text-hud-dim tracking-wider uppercase block">
              Curated manifest
            </span>
            <p className="text-xs sm:text-sm text-foreground/70 uppercase tracking-wider">
              Static for now. Useful, shippable, and honest.
            </p>
          </div>
          <span className="font-mono text-[10px] text-hud-dim tracking-wider">
            [{items.length} ITEMS]
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="[ No Resources ]"
          description="No curated resources are configured yet."
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, categoryItems]) => (
            <section key={category} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 className="section-title text-xl sm:text-2xl font-bold text-foreground">
                  {formatCategoryLabel(category)}
                </h2>
                <span className="font-mono text-[10px] text-hud-dim tracking-wider uppercase">
                  [{categoryItems.length}]
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
                {categoryItems.map((r) => (
                  <article
                    key={r.id || r.href}
                    className="machine-panel border border-border relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 hud-grid opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
                    <div className="relative z-10 p-6">
                      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                        <span className="font-mono text-[10px] text-hud-dim tracking-wider uppercase">
                          {r.sourceLabel || 'Resource'}
                        </span>
                        {Array.isArray(r.tags) && r.tags.length ? (
                          <span className="font-mono text-[10px] text-hud-dim tracking-wider uppercase">
                            {r.tags.slice(0, 3).join(' / ')}
                          </span>
                        ) : null}
                      </div>

                      <h3 className="section-title text-xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                        <Link
                          href={r.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background"
                        >
                          {r.title}
                        </Link>
                      </h3>

                      {r.description ? (
                        <p className="prose-copy text-foreground/70 mb-4">
                          {r.description}
                        </p>
                      ) : null}

                      <div className="flex items-center justify-between pt-4 border-t border-border">
                        <span className="font-mono text-xs text-hud-dim truncate">
                          {r.href}
                        </span>
                        <Link
                          href={r.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="nav-label text-xs px-3 py-1 border border-primary text-primary hover:bg-primary hover:text-background transition-colors"
                        >
                          OPEN →
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
