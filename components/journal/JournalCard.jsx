import Link from 'next/link';
import { formatDate } from '@/lib/utils/date';

export default function JournalCard({ entry }) {
  const { slug, title, date, excerpt, author, category } = entry;

  return (
    <article className="machine-panel border border-border relative overflow-hidden group">
      <div className="absolute inset-0 hud-grid opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
      <div className="relative z-10 p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="font-mono text-[10px] text-hud-dim tracking-wider">
            {category}
          </span>
          <span className="text-hud-dim">|</span>
          <time className="font-mono text-[10px] text-hud-dim tracking-wider">
            {formatDate(date)}
          </time>
        </div>

        <h3 className="section-title text-xl lg:text-2xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors">
          <Link href={`/journal/${slug}`} className="hover:underline">
            {title}
          </Link>
        </h3>

        <p className="prose-copy text-foreground/70 mb-4 line-clamp-3">
          {excerpt}
        </p>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <span className="font-mono text-xs text-hud-dim">
            BY {author.toUpperCase()}
          </span>
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
