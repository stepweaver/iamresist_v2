import { ImageResponse } from 'next/og';
import { journalDates } from '@/components/journal/journalFormat';
import { getJournalEntryById, getJournalEntryBySlug } from '@/lib/journal';
import { journalOgTitle, journalOgTitleSize } from '@/lib/seo/journalOg';

export const runtime = 'nodejs';

async function resolveEntry(slug) {
  try {
    return (await getJournalEntryBySlug(slug)) || (await getJournalEntryById(slug));
  } catch {
    return null;
  }
}

export async function GET(_request, context) {
  const { slug } = await context.params;
  const entry = await resolveEntry(slug);
  const title = journalOgTitle(entry?.title);
  const titleSize = journalOgTitleSize(title);
  const dateLabel = entry ? journalDates(entry).displayLabel : '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#080a0e',
          color: '#f0efea',
          padding: '68px 76px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#f04444',
            fontSize: 28,
            letterSpacing: 4,
          }}
        >
          <div style={{ display: 'flex' }}>I AM [RESIST]</div>
          <div style={{ display: 'flex', color: '#a9b6c6', fontSize: 20, letterSpacing: 6 }}>
            ESSAY
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: -1,
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', width: 180, height: 6, background: '#f04444' }} />
          <div style={{ display: 'flex', color: '#a9b6c6', fontSize: 22, letterSpacing: 2 }}>
            {dateLabel || 'JOURNAL'}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
      },
    },
  );
}
