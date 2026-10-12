import ArchiveHero from '@/components/journal/ArchiveHero';
import FeaturedRecord from '@/components/journal/FeaturedRecord';
import JournalIndex from '@/components/journal/JournalIndex';
import { journalLeadExcerpt, toJournalRecord } from '@/components/journal/journalFormat';
import { getAllJournalEntries, getJournalIndexPayload, presentJournalEntries } from '@/lib/journal';
import { getCachedPageBlocks } from '@/lib/notion-blocks';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'Resistance Journal and Editorial Notes',
  description:
    'Resistance journal with editorial notes, reflections, and field observations from I AM [RESIST].',
  urlPath: '/journal',
});

export const revalidate = 300;

export default async function JournalPage() {
  const payload = await getJournalIndexPayload(15);
  let entries = payload.entries;
  let searchCoversArchive = false;

  if (payload.listKind === 'ok') {
    const all = await getAllJournalEntries();
    if (all.length > 0) {
      entries = all;
      searchCoversArchive = true;
    }
  }

  entries = await presentJournalEntries(entries);

  const featuredEntry = entries[0];
  let featuredExcerpt = '';
  if (featuredEntry?.id) {
    const blocks = await getCachedPageBlocks(featuredEntry.id);
    featuredExcerpt = journalLeadExcerpt(blocks);
  }

  const records = entries.map((entry) => toJournalRecord(entry));
  const featured = featuredEntry
    ? toJournalRecord(featuredEntry, { excerpt: featuredExcerpt })
    : null;

  return (
    <main className="journal-archive">
      <ArchiveHero />
      {entries.length === 0 ? (
        <JournalEmpty listKind={payload.listKind} apiError={payload.apiError} />
      ) : (
        <>
          <FeaturedRecord record={featured} />
          <JournalIndex records={records} searchCoversArchive={searchCoversArchive} />
        </>
      )}
    </main>
  );
}

function JournalEmpty({ listKind, apiError }) {
  return (
    <div className="journal-status">
      <p className="journal-status__label">No entries</p>
      {listKind === 'unconfigured' && (
        <p>
          Set <code>NOTION_API_KEY</code> and <code>NOTION_JOURNAL_DB_ID</code> in
          the environment, redeploy or restart the dev server, then reload.
        </p>
      )}
      {listKind === 'api_error' && (
        <>
          <p>
            The journal database could not be read from Notion. Confirm the
            integration is connected to the journal database and has access.
          </p>
          {apiError && <p className="journal-status__detail">{apiError}</p>}
          {process.env.NODE_ENV === 'development' && (
            <p>
              Dev hint: token typo, wrong DB id, or integration not invited to
              the database often show up as Notion API errors above.
            </p>
          )}
        </>
      )}
      {listKind === 'empty' && (
        <p>
          Notion is configured, but no rows match <code>Status = Published</code>.
          Publish a row or adjust the Status option name to match what the site
          filters on.
        </p>
      )}
    </div>
  );
}
