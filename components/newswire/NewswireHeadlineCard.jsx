'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import NewswireImageBlock from '@/components/newswire/NewswireImageBlock';
import { formatJournalMetaDate } from '@/lib/utils/date';

export default function NewswireHeadlineCard({ story, compact = false, hero = false }) {
  const { source, title, url, publishedAt, excerpt, image, supportUrl, note } = story;
  const linkUrl = url || '#';
  const hasImageFromFeed = Boolean(image);
  const [imageHidden, setImageHidden] = useState(false);

  useEffect(() => {
    setImageHidden(false);
  }, [image]);

  const onImageUnavailable = useCallback(() => setImageHidden(true), []);

  const showImageColumn = hasImageFromFeed && !imageHidden;
  const hasEditorialNote = Boolean(note);
  const metaDate = formatJournalMetaDate(publishedAt);

  if (hero) {
    return (
      <article className="group machine-panel border border-border hover:border-[var(--hud-red)]/50 p-3 sm:p-5 transition-all duration-200 hover:shadow-[0_0_20px_var(--hud-red-dim)]">
        <div className="flex flex-col gap-2 sm:gap-4">
          {showImageColumn ? (
            <NewswireImageBlock
              href={linkUrl}
              src={image}
              alt=""
              onUnavailable={onImageUnavailable}
              className="block w-full rounded bg-muted shrink-0 overflow-hidden relative aspect-[2/1] max-h-[200px] sm:max-h-none sm:aspect-video"
            />
          ) : (
            <div className="hud-label text-[10px] sm:text-xs text-foreground/60 uppercase tracking-[0.18em] border border-border/60 px-2 py-1 w-fit">
              Text dispatch
            </div>
          )}

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <span className="hud-label text-[10px] sm:text-xs">{source}</span>
            {metaDate ? (
              <span className="timestamp text-[10px] sm:text-xs text-foreground/50 tabular-nums">{metaDate}</span>
            ) : null}
          </div>

          <div>
            {hasEditorialNote ? (
              <span className="kicker text-[10px] sm:text-xs font-bold text-primary mb-2 block">Editorial note</span>
            ) : excerpt ? (
              <span className="kicker text-[10px] sm:text-xs font-bold text-foreground/65 mb-2 block">
                Source preview
              </span>
            ) : null}
            <h2 className="font-ui text-base sm:text-xl lg:text-2xl font-bold leading-snug mb-1.5 sm:mb-3 break-words text-foreground">
              <Link
                href={linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary hover:underline"
              >
                {title || 'Untitled'}
              </Link>
            </h2>
            {hasEditorialNote ? (
              <p className="prose-copy text-xs sm:text-base text-foreground/80 leading-relaxed break-words whitespace-pre-wrap line-clamp-4 sm:line-clamp-none">
                {note}
              </p>
            ) : (
              excerpt && (
                <p className="prose-copy text-xs sm:text-base text-foreground/80 leading-relaxed break-words line-clamp-4 sm:line-clamp-none">
                  {excerpt}
                </p>
              )
            )}
          </div>

          <div className="flex flex-wrap gap-2 sm:gap-3 pt-0.5 sm:pt-1">
            <Link
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button-label inline-flex items-center gap-1.5 text-[11px] sm:text-sm text-primary font-bold hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Read at source
            </Link>
            {supportUrl ? (
              <Link
                href={supportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="button-label inline-flex items-center gap-1.5 text-[11px] sm:text-sm text-foreground/70 font-bold hover:text-primary hover:underline"
              >
                Support
              </Link>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  const panelClass = compact
    ? 'machine-panel border border-border p-4 sm:p-5'
    : 'machine-panel border border-border p-5 sm:p-6';

  const imageWrapClass = compact
    ? 'relative min-h-0 w-full shrink-0 overflow-hidden border border-border/60 bg-muted aspect-[4/3] sm:aspect-square sm:h-28 sm:w-28 sm:max-w-none'
    : 'relative min-h-0 w-full shrink-0 overflow-hidden border border-border/60 bg-muted aspect-[4/3] sm:aspect-square sm:h-36 sm:w-36 sm:max-w-none';

  return (
    <article
      className={`${panelClass} ${showImageColumn ? 'flex flex-col gap-4 sm:flex-row sm:gap-5' : ''}`}
    >
      {showImageColumn ? (
        <NewswireImageBlock
          href={linkUrl}
          src={image}
          alt=""
          showBrackets={false}
          onUnavailable={onImageUnavailable}
          className={`block ${imageWrapClass}`}
        />
      ) : (
        <div className="mb-2 shrink-0">
          <span className="font-mono text-[10px] text-hud-dim uppercase tracking-wider border border-border/60 px-2 py-0.5 inline-block">
            Text dispatch
          </span>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 gap-y-2 mb-3">
          <span className="font-mono text-[10px] text-hud-dim uppercase tracking-wider">{source}</span>
          {metaDate ? (
            <>
              <span className="text-hud-dim">|</span>
              <time
                className="font-mono text-[10px] text-hud-dim tracking-wider"
                dateTime={publishedAt || undefined}
              >
                {metaDate}
              </time>
            </>
          ) : null}
        </div>

        {hasEditorialNote ? (
          <p className="font-mono text-[10px] text-primary uppercase tracking-wider mb-1">Editorial note</p>
        ) : excerpt ? (
          <p className="font-mono text-[10px] text-foreground/60 uppercase tracking-wider mb-1">
            Source preview
          </p>
        ) : null}

        <h2
          className={`section-title font-bold text-foreground mb-2 ${
            compact ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'
          }`}
        >
          <Link
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary hover:underline"
          >
            {title || 'Untitled'}
          </Link>
        </h2>

        {hasEditorialNote ? (
          <p
            className={`text-xs sm:text-sm text-foreground/80 leading-relaxed border-l-2 border-primary/60 pl-3 whitespace-pre-wrap ${
              compact ? 'line-clamp-4' : ''
            }`}
          >
            {note}
          </p>
        ) : (
          excerpt && (
            <p
              className={`text-xs sm:text-sm text-foreground/75 leading-relaxed border-l-2 border-primary/40 pl-3 ${
                compact ? 'line-clamp-3' : ''
              }`}
            >
              {excerpt}
            </p>
          )
        )}

        <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-3">
          <Link
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="nav-label text-xs px-3 py-1 border border-primary text-primary hover:bg-primary hover:text-background transition-colors"
          >
            Read at source →
          </Link>
          {supportUrl ? (
            <Link
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="nav-label text-xs px-3 py-1 border border-border text-foreground/80 hover:border-primary hover:text-primary transition-colors"
            >
              Support
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
