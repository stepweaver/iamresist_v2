import { unstable_noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import NotionBlocksBody from '@/components/content/NotionBlocksBody';
import JournalArticle from '@/components/journal/JournalArticle';
import {
  journalDates,
  journalEntryPath,
  journalReadingLabel,
  journalReadingMinutesFromBlocks,
  selectRelatedJournalEssays,
  toJournalRecord,
} from '@/components/journal/journalFormat';
import { journalSubscriptionUrl } from '@/lib/journalSubscribe';
import StructuredData from '@/components/seo/StructuredData';
import {
  getAllJournalEntries,
  journalEntryBodyEditedTime,
  readJournalEntryBlocks,
  resolvePublishedJournalEntry,
} from '@/lib/journal';
import { presentJournalEditorial } from '@/lib/journal/presentJournalEditorial';
import { buildPageMetadata } from '@/lib/metadata';
import { buildArticleSchema, buildBreadcrumbListSchema } from '@/lib/seo/schema';
import { buildSeoExcerptFromBlocks, pickSeoDescription } from '@/lib/seo/text';

export const revalidate = 300;

function JournalTemporarilyUnavailable() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Journal</p>
      <h1 className="mt-3 text-3xl font-semibold">This essay is temporarily unavailable.</h1>
      <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-foreground/80">
        Refresh in a minute. Published essays stay in the catalog when the journal cannot be read.
      </p>
    </main>
  );
}

function getJournalCanonicalPath(entry) {
  return journalEntryPath(entry);
}

function buildJournalDescription(entry, blocks) {
  const tagLine =
    Array.isArray(entry?.tags) && entry.tags.length > 0
      ? `Journal entry on ${entry.tags.slice(0, 3).join(', ')}.`
      : 'Journal entry on authoritarian drift, democratic accountability, and resistance.';

  return pickSeoDescription(
    [entry?.summary, buildSeoExcerptFromBlocks(blocks, { maxBlocks: 4, maxLength: 180 })],
    tagLine,
    180,
  );
}

export async function generateStaticParams() {
  try {
    const entries = await getAllJournalEntries();
    return (entries || [])
      .slice(0, 10)
      .map((entry) => ({ slug: entry.slug || entry.id }))
      .filter((p) => p.slug);
  } catch {
    return [];
  }
}

export const dynamicParams = true;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const resolved = await resolvePublishedJournalEntry(slug);
  if (resolved.availability === 'unavailable') {
    unstable_noStore();
    return { title: 'Journal | I AM [RESIST]' };
  }
  const entry = resolved.entry;
  if (!entry) return { title: 'Journal Entry Not Found | I AM [RESIST]' };
  const loaded = await readJournalEntryBlocks(entry.id);
  const blocks = loaded.blocks;
  const title = entry.title || 'Journal Entry';
  const description = buildJournalDescription(entry, blocks);
  const canonicalPath = getJournalCanonicalPath(entry);
  const presented = presentJournalEditorial(entry, blocks, canonicalPath);
  return buildPageMetadata({
    title: `${title} | Journal`,
    description,
    urlPath: canonicalPath,
    images: [presented.metadataImage],
  });
}

export default async function JournalEntryPage({ params }) {
  const { slug } = await params;
  const resolved = await resolvePublishedJournalEntry(slug);
  if (resolved.availability === 'unavailable') {
    unstable_noStore();
    return <JournalTemporarilyUnavailable />;
  }
  const entry = resolved.entry;

  if (!entry) notFound();

  const loaded = await readJournalEntryBlocks(entry.id);
  const blocks = loaded.blocks;
  const canonicalPath = getJournalCanonicalPath(entry);
  const description = buildJournalDescription(entry, blocks);
  const presented = presentJournalEditorial(entry, blocks, canonicalPath);
  const bodyEditedTime = await journalEntryBodyEditedTime(entry, blocks);
  const dates = journalDates({ ...entry, bodyEditedTime });
  let related = [];
  try {
    const published = await getAllJournalEntries();
    related = selectRelatedJournalEssays(published, entry).map((item) => toJournalRecord(item));
  } catch {
    related = [];
  }
  const schema = [
    buildBreadcrumbListSchema([
      { name: 'Home', url: '/' },
      { name: 'Journal', url: '/journal' },
      { name: entry.title || 'Journal Entry', url: canonicalPath },
    ]),
    buildArticleSchema({
      headline: entry.title || 'Journal Entry',
      description,
      url: canonicalPath,
      image: presented.metadataImage,
      datePublished: entry.date || entry.createdTime || undefined,
      dateModified: dates.showUpdated
        ? bodyEditedTime || undefined
        : entry.date || entry.createdTime || undefined,
    }),
  ];

  return (
    <main>
      <StructuredData data={schema} />
      <JournalArticle
        title={entry.title || 'Untitled Entry'}
        dates={dates}
        tags={entry.tags}
        author={entry.author || ''}
        related={related}
        subscriptionUrl={journalSubscriptionUrl()}
        image={presented.displayImage}
        deck={String(entry.summary || '').replace(/\s+/g, ' ').trim()}
        pullQuote={String(entry.pullQuote || '').replace(/\s+/g, ' ').trim()}
        readingLabel={journalReadingLabel(
          entry.readingMinutes || journalReadingMinutesFromBlocks(blocks),
        )}
        featured={entry.featured === true}
      >
        {loaded.status === 'unavailable' ? (
          <p className="journal-empty-copy">
            [ TEMPORARILY UNAVAILABLE ] This essay is published. Its text could not be loaded just now.
          </p>
        ) : blocks.length > 0 ? (
          <NotionBlocksBody
            blocks={blocks}
            variant="journal"
            omitBlockIds={presented.omitBlockIds}
          />
        ) : (
          <p className="journal-empty-copy">
            [ NO BODY BLOCKS ] - The entry is published in Notion but has no
            block content yet.
          </p>
        )}
      </JournalArticle>
    </main>
  );
}
