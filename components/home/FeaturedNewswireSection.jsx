import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import NewswireHeadlineCard from '@/components/newswire/NewswireHeadlineCard';
import NewswireImageBlock from '@/components/newswire/NewswireImageBlock';
import { getNewswireStories, pickDiverseTopStories } from '@/lib/newswire';
import { formatJournalMetaDate } from '@/lib/utils/date';

export default async function FeaturedNewswireSection() {
  const stories = await getNewswireStories();
  const featuredStories = pickDiverseTopStories(stories ?? [], 3, 1);
  const [leadStory, ...secondaryStories] = featuredStories;

  if (!leadStory) return null;

  const { source, title, url, publishedAt, excerpt, image, supportUrl, note } = leadStory;
  const leadHasImage = Boolean(image);
  const hasEditorialNote = Boolean(note);

  return (
    <section className="mb-8 sm:mb-12">
      <div className="flex items-center justify-between mb-2 sm:mb-4">
        <span className="kicker text-primary text-xs sm:text-sm tracking-[0.4em] font-bold">
          Newswire
        </span>
        <Link
          href="/intel/newswire"
          className="nav-label text-xs text-foreground/60 hover:text-primary transition-colors font-bold whitespace-nowrap"
        >
          View all →
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.9fr] gap-3 sm:gap-5">
        <div className="group machine-panel border border-border hover:border-[var(--hud-red)]/50 p-3 sm:p-5 transition-all duration-200 hover:shadow-[0_0_20px_var(--hud-red-dim)]">
          <div className="flex flex-col gap-2 sm:gap-4">
            {leadHasImage ? (
              <NewswireImageBlock
                href={url || '#'}
                src={image}
                alt=""
                className="block w-full rounded bg-muted shrink-0 overflow-hidden relative aspect-[2/1] max-h-[200px] sm:max-h-none sm:aspect-video"
              />
            ) : (
              <div className="hud-label text-[10px] sm:text-xs text-foreground/60 uppercase tracking-[0.18em] border border-border/60 px-2 py-1 w-fit">
                Text dispatch
              </div>
            )}

            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <span className="hud-label text-[10px] sm:text-xs">{source}</span>
              {formatJournalMetaDate(publishedAt) && (
                <span className="timestamp text-[10px] sm:text-xs text-foreground/50 tabular-nums">
                  {formatJournalMetaDate(publishedAt)}
                </span>
              )}
            </div>

            <div>
              {hasEditorialNote && (
                <span className="kicker text-[10px] sm:text-xs font-bold text-primary mb-2 block">
                  Editorial note
                </span>
              )}
              <h2 className="font-ui text-base sm:text-xl lg:text-2xl font-bold leading-snug mb-1.5 sm:mb-3 break-words text-foreground">
                {title || 'Untitled'}
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
                href={url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="button-label inline-flex items-center gap-1.5 text-[11px] sm:text-sm text-primary font-bold hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Read at source
              </Link>
              {supportUrl && (
                <Link
                  href={supportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button-label inline-flex items-center gap-1.5 text-[11px] sm:text-sm text-foreground/70 font-bold hover:text-primary hover:underline"
                >
                  Support
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:gap-4">
          {secondaryStories.map((story) => (
            <NewswireHeadlineCard key={story.id} story={story} compact />
          ))}
        </div>
      </div>
    </section>
  );
}
