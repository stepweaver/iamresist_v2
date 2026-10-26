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
            pinnedIds={[featured, ...recent].map((record) => record?.id).filter(Boolean)}
          />
        </>
      )}
    </main>
  );
}

function JournalEmpty({ listKind, apiError }) {
  if (listKind === 'unconfigured') {
    console.warn('[journal] Set NOTION_API_KEY and NOTION_JOURNAL_DB_ID, then restart.');
  } else if (listKind === 'api_error') {
    console.error('[journal] Notion read failed.', apiError || '');
    if (process.env.NODE_ENV === 'development') {
      console.warn('[journal] Check the token, database id, and that the integration can access the database.');
    }
  } else if (listKind === 'empty') {
    console.warn('[journal] Notion is configured, but no rows match Status = Published.');
  }

  return (
    <div className="journal-status">
      <p className="journal-status__label">No essays</p>
      <p>
        {listKind === 'empty'
          ? 'No essays are published yet.'
          : 'The journal is unavailable right now.'}
      </p>
    </div>
  );
}
