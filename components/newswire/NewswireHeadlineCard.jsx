import Link from 'next/link';
import { formatDate } from '@/lib/utils/date';

export default function NewswireHeadlineCard({ story, compact = false }) {
  const { source, title, url, publishedAt, excerpt, image, supportUrl } = story;
  const linkUrl = url || '#';
  const hasImage = Boolean(image);

  return (
    <div
      className={`machine-panel border border-border group hover:border-primary/50 transition-all duration-200 flex flex-col ${
        compact ? 'p-3 sm:p-4 gap-2' : 'p-4 sm:p-5 gap-3'
      }`}
    >
      {hasImage && (
        <div className="relative w-full overflow-hidden rounded bg-muted">
          <img
            src={image}
            alt=""
            className="w-full object-cover transition-transform duration-200 group-hover:scale-105"
            style={{ maxHeight: compact ? '120px' : '200px' }}
          />
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="hud-label text-[10px] sm:text-xs text-foreground/70 uppercase tracking-wider">
            {source}
          </span>
          {formatDate(publishedAt) && (
            <span className="timestamp text-[10px] sm:text-xs text-foreground/50 tabular-nums">
              {formatDate(publishedAt)}
            </span>
          )}
        </div>

        <h3
          className={`font-ui font-bold text-foreground leading-snug mb-1 ${
            compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'
          }`}
        >
          <Link
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors"
          >
            {title || 'Untitled'}
          </Link>
        </h3>

        {excerpt && (
          <p
            className={`prose-copy text-foreground/80 mb-3 ${
              compact ? 'text-[11px] sm:text-sm line-clamp-3' : 'text-xs sm:text-sm'
            }`}
          >
            {excerpt}
          </p>
        )}

        <div className="flex flex-wrap gap-2 mt-auto">
          <Link
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button-label inline-flex items-center text-[10px] sm:text-xs text-primary font-bold hover:underline"
          >
            Read at source →
          </Link>
          {supportUrl && (
            <Link
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button-label inline-flex items-center text-[10px] sm:text-xs text-foreground/70 hover:text-primary hover:underline"
            >
              Support
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
