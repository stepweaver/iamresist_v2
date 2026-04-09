import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import NewswireImageBlock from '@/components/newswire/NewswireImageBlock';
import { formatJournalMetaDate } from '@/lib/utils/date';

export default function NewswireHeadlineCard({ story, compact = false }) {
  const { source, title, url, publishedAt, excerpt, image, supportUrl, note } = story;
  const linkUrl = url || '#';
  const hasImage = Boolean(image);
  const hasEditorialNote = Boolean(note);

  return (
    <div
      className={`group machine-panel border border-border hover:border-[var(--hud-red)]/50 flex flex-col transition-all duration-200 hover:shadow-[0_0_20px_var(--hud-red-dim)] ${
        compact ? 'p-3 sm:p-4 gap-2 sm:gap-3' : 'p-4 sm:p-5 gap-3'
      }`}
    >
      {hasImage ? (
        <NewswireImageBlock
          href={linkUrl}
          src={image}
          alt=""
          className={`target-brackets block w-full rounded bg-muted shrink-0 overflow-hidden relative aspect-video ${
            compact ? 'max-h-28 sm:max-h-40' : 'max-h-40'
          }`}
        />
      ) : (
        <div className="hud-label text-[10px] sm:text-xs text-foreground/60 uppercase tracking-[0.18em] border border-border/60 px-2 py-1 w-fit">
          Text dispatch
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0 relative">
        <div className="flex items-center gap-3 mb-1.5 flex-wrap">
          <span className="hud-label text-[10px] sm:text-xs">{source}</span>
          {formatJournalMetaDate(publishedAt) && (
            <span className="timestamp text-[10px] sm:text-xs text-foreground/50 tabular-nums">
              {formatJournalMetaDate(publishedAt)}
            </span>
          )}
        </div>

        {hasEditorialNote && (
          <span className="kicker text-[10px] sm:text-xs font-bold text-primary mb-2 block">
            Editorial note
          </span>
        )}

        <h3
          className={`font-ui font-bold text-foreground leading-snug break-words ${
            compact ? 'text-xs sm:text-sm mb-1' : 'text-sm sm:text-base mb-1.5'
          }`}
        >
          {title || 'Untitled'}
        </h3>

        {hasEditorialNote ? (
          <p
            className={`prose-copy text-foreground/80 leading-relaxed whitespace-pre-wrap ${
              compact ? 'text-[11px] sm:text-sm mb-2 line-clamp-4' : 'text-xs sm:text-sm mb-3'
            }`}
          >
            {note}
          </p>
        ) : (
          excerpt && (
            <p
              className={`prose-copy text-foreground/80 leading-relaxed break-words ${
                compact
                  ? 'text-[11px] sm:text-sm mb-2 line-clamp-2 sm:line-clamp-none'
                  : 'text-xs sm:text-sm mb-3'
              }`}
            >
              {excerpt}
            </p>
          )
        )}

        <div className="flex flex-wrap gap-2 mt-auto">
          <Link
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button-label inline-flex items-center gap-1.5 text-[10px] sm:text-xs text-primary font-bold hover:underline"
          >
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            Read at source
          </Link>
          {supportUrl && (
            <Link
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button-label inline-flex items-center gap-1.5 text-[10px] sm:text-xs text-foreground/70 font-bold hover:text-primary hover:underline"
            >
              Support
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
