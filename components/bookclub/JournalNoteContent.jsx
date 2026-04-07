'use client';

import Card from '@/components/Card';
import NotionBlocksBody from '@/components/content/NotionBlocksBody';
import ShareButton from '@/components/ShareButton';
import { formatJournalMetaDate } from '@/lib/utils/date';
import { getCanonicalBaseUrl } from '@/lib/siteConfig';

/**
 * Selected reading journal note: excerpt + full Notion blocks
 */
export default function JournalNoteContent({ note, book, fullContent }) {
  if (!note) return null;

  const base = getCanonicalBaseUrl();
  const sharePath = note.slug
    ? `${base}/book-club/${book.slug}/entries/${note.slug}`
    : base;

  return (
    <Card variant="primary" className="p-6 sm:p-8">
      <div className="mb-6 pb-6 border-b border-border/50">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="timestamp text-primary text-sm font-bold">
            {formatJournalMetaDate(note.createdTime || note.lastEditedTime)}
          </span>
          {note.chapterPage && (
            <>
              <span className="text-foreground/40 text-sm">•</span>
              <span className="text-foreground/60 text-sm uppercase tracking-wider">
                {note.chapterPage}
              </span>
            </>
          )}
          <span className="text-foreground/40 text-sm">•</span>
          <span className="text-foreground/60 text-sm uppercase tracking-wider">
            {book.title}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-ui text-2xl sm:text-3xl font-bold text-foreground leading-tight flex-1">
            {note.title}
          </h3>
          {note.slug && (
            <div className="flex-shrink-0">
              <ShareButton
                url={sharePath}
                title={`${note.title} | ${book.title}`}
                description={
                  note.content
                    ? note.content.slice(0, 160).replace(/\n/g, ' ').trim()
                    : `Reading reflections on ${book.title}${book.author ? ` by ${book.author}` : ''}`
                }
                iconOnly={false}
              />
            </div>
          )}
        </div>
      </div>

      <div className="journal-copy prose prose-invert max-w-none">
        {note.content && (
          <div className="mb-6">
            <p className="text-base sm:text-lg text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {note.content}
            </p>
          </div>
        )}

        {fullContent && fullContent.length > 0 && <NotionBlocksBody blocks={fullContent} />}
      </div>

      {note.tags && note.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-border/30">
          {note.tags.map((tag, index) => (
            <span
              key={index}
              className="px-3 py-1 bg-primary/20 text-primary text-xs font-bold uppercase tracking-wider"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
