import Link from 'next/link';
import { formatDate, formatJournalMetaDate } from '@/lib/utils/date';

export default function JournalCard({ entry }) {
  const slug = entry.slug || entry.id;
  const title = entry.title || 'Untitled Entry';
  const dateRaw = entry.date || entry.createdTime;
  const displayDate = dateRaw
    ? /^\d{4}-\d{2}-\d{2}/.test(String(dateRaw))
      ? formatJournalMetaDate(dateRaw)
      : formatDate(dateRaw)
    : null;
  const excerpt = entry.excerpt;
  const author = entry.author;
  const legacyCategory = entry.category;

  return (
    <article className="machine-panel border border-border relative overflow-hidden group">
      <div className="absolute inset-0 hud-grid opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
      <div className="relative z-10 p-6">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {legacyCategory ? (
            <span className="font-mono text-[10px] text-hud-dim tracking-wider uppercase">
              {legacyCategory}
            </span>
          ) : entry.tags?.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {entry.tags.map((tag, index) => (
                <span
                  key={index}
                  className="font-mono text-[10px] text-hud-dim tracking-wider uppercase border border-border/60 px-1.5 py-0.5"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <span className="font-mono text-[10px] text-hud-dim tracking-wider uppercase">
              JOURNAL
            </span>
          )}
          {displayDate && (
            <>
              <span className="text-hud-dim">|</span>
              <time
                className="font-mono text-[10px] text-hud-dim tracking-wider"
                dateTime={entry.date || undefined}
              >
                {displayDate}
              </time>
            </>
          )}
        </div>

        <h3 className="section-title text-xl lg:text-2xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors">
          <Link href={`/journal/${slug}`} className="hover:underline">
            {title}
          </Link>
        </h3>

        {excerpt ? (
          <p className="prose-copy text-foreground/70 mb-4 line-clamp-3">
            {excerpt}
          </p>
        ) : null}

        <div className="flex items-center justify-between pt-4 border-t border-border">
          {author ? (
            <span className="font-mono text-xs text-hud-dim">
              BY {String(author).toUpperCase()}
            </span>
          ) : (
            <span className="font-mono text-xs text-hud-dim">&nbsp;</span>
          )}
          <Link
            href={`/journal/${slug}`}
            className="nav-label text-xs px-3 py-1 border border-primary text-primary hover:bg-primary hover:text-background transition-colors"
          >
            READ →
          </Link>
        </div>
      </div>
    </article>
  );
}
