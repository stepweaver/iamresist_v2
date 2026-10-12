import { notFound } from 'next/navigation';
import NotionBlocksBody from '@/components/content/NotionBlocksBody';
import JournalArticle from '@/components/journal/JournalArticle';
import { journalDates } from '@/components/journal/journalFormat';
import StructuredData from '@/components/seo/StructuredData';
import {
  getJournalEntryBySlug,
  getJournalEntryById,
  getAllJournalEntries,
  journalEntryBodyEditedTime,
} from '@/lib/journal';
import { getCachedPageBlocks } from '@/lib/notion-blocks';
import { buildPageMetadata, defaultOgImage } from '@/lib/metadata';
import { buildArticleSchema, buildBreadcrumbListSchema } from '@/lib/seo/schema';
import { buildSeoExcerptFromBlocks, pickSeoDescription } from '@/lib/seo/text';

export const revalidate = 300;

async function resolveJournalEntry(slug) {
  let entry = await getJournalEntryBySlug(slug);
  if (!entry) entry = await getJournalEntryById(slug);
  return entry;
}

function getJournalCanonicalPath(entry) {
  return `/journal/${entry?.slug || entry?.id}`;
}

function buildJournalDescription(entry, blocks) {
  const tagLine =
    Array.isArray(entry?.tags) && entry.tags.length > 0
      ? `Journal entry on ${entry.tags.slice(0, 3).join(', ')}.`
      : 'Journal entry on authoritarian drift, democratic accountability, and resistance.';

  return pickSeoDescription(
    [buildSeoExcerptFromBlocks(blocks, { maxBlocks: 4, maxLength: 180 })],
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
  const entry = await resolveJournalEntry(slug);
  if (!entry) return { title: 'Journal Entry Not Found | I AM [RESIST]' };
  const blocks = await getCachedPageBlocks(entry.id);
  const title = entry.title || 'Journal Entry';
  const description = buildJournalDescription(entry, blocks);
  return buildPageMetadata({
    title: `${title} | Journal`,
    description,
    urlPath: getJournalCanonicalPath(entry),
    images: [defaultOgImage],
  });
}

export default async function JournalEntryPage({ params }) {
  const { slug } = await params;
  const entry = await resolveJournalEntry(slug);

  if (!entry) notFound();

  const blocks = await getCachedPageBlocks(entry.id);
  const canonicalPath = getJournalCanonicalPath(entry);
  const description = buildJournalDescription(entry, blocks);
  const bodyEditedTime = await journalEntryBodyEditedTime(entry, blocks);
  const dates = journalDates({ ...entry, bodyEditedTime });
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
      image: defaultOgImage,
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
      >
        {blocks.length > 0 ? (
          <NotionBlocksBody blocks={blocks} variant="journal" />
        ) : (
          <p className="journal-empty-copy">
            [ NO BODY BLOCKS ] - The entry is published in Notion but has no
            block content yet, or blocks could not be loaded.
          </p>
        )}
      </JournalArticle>
    </main>
  );
}
