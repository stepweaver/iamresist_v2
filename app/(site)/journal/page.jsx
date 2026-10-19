import ArchiveHero from '@/components/journal/ArchiveHero';
import FeaturedRecord from '@/components/journal/FeaturedRecord';
import JournalBrowser from '@/components/journal/JournalBrowser';
import JournalRecent from '@/components/journal/JournalRecent';
import {
  compareJournalEntries,
  composeJournalLanding,
  journalDisplayExcerpt,
  toJournalRecord,
} from '@/components/journal/journalFormat';
import {
  featuredEssayExcerpt,
  getAllJournalEntries,
  getJournalIndexPayload,
  presentJournalEntries,
} from '@/lib/journal';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'Essays & Analysis',
  description:
    'Original writing on power, propaganda, democratic accountability, and the responsibility to question what we believe.',
  urlPath: '/journal',
});

export const revalidate = 300;

export default async function JournalPage() {
  const payload = await getJournalIndexPayload(15);
  let entries = payload.entries;
  let searchCoversArchive = false;

  if (payload.listKind === 'ok') {
    try {
      const all = await getAllJournalEntries();
      if (all.length > 0) {
        entries = all;
        searchCoversArchive = true;
      }
    } catch {
      searchCoversArchive = false;
    }
  }

  try {
    entries = await presentJournalEntries(entries);
  } catch {
    entries = [...(entries || [])].sort(compareJournalEntries);
  }

  const landing = composeJournalLanding(entries);
  const featuredExcerpt = landing.featured ? await featuredEssayExcerpt(landing.featured) : '';
  const records = landing.ordered.map((entry) =>
    toJournalRecord(
      entry,
      entry?.id && entry.id === landing.featured?.id ? { excerpt: featuredExcerpt } : {},
    ),
  );
  const featured = landing.featured
    ? toJournalRecord(landing.featured, { excerpt: featuredExcerpt })
    : null;
  const recent = landing.recent.map((entry) =>
    toJournalRecord(entry, { excerpt: journalDisplayExcerpt(entry) }),
  );

  return (
    <main className="journal-archive">
      <ArchiveHero />
      {landing.ordered.length === 0 ? (
        <JournalEmpty listKind={payload.listKind} apiError={payload.apiError} />
      ) : (
        <>
          <FeaturedRecord record={featured} />
          <JournalRecent records={recent} />
          <JournalBrowser
            subjects={landing.subjects}
            records={records}
            searchCoversArchive={searchCoversArchive}
          />
        </>
      )}
    </main>
  );
}

function JournalEmpty({ listKind, apiError }) {
  return (
    <div className="journal-status">
      <p className="journal-status__label">No essays</p>
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
