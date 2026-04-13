import { Suspense } from 'react';
import Link from 'next/link';
import IntelTabs from '@/components/IntelTabs';
import LiveDeskSection from '@/components/intel/LiveDeskSection';
import { getLiveIntelDesk } from '@/lib/feeds/liveIntel.service';
import { buildPageMetadata } from '@/lib/metadata';

export const revalidate = 45;

export const metadata = buildPageMetadata({
  title: 'Intel // Voices | I AM [RESIST]',
  description:
    'Ingested creator and commentary signals from public feeds — preview and link back to sources. For the curated video/music wall (Notion catalog), see /telescreen.',
  urlPath: '/intel/voices',
});

async function VoicesDeskContent() {
  const desk = await getLiveIntelDesk('voices');
  return <LiveDeskSection desk={desk} />;
}

export default function IntelVoicesDeskPage() {
  return (
    <main
      id="main-content"
      className="min-h-screen overflow-x-clip"
      style={{
        backgroundImage:
          'linear-gradient(rgba(211, 47, 47, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(211, 47, 47, 0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 pt-2 pb-8 sm:pb-12">
        <IntelTabs
          description={
            <>
              <strong className="text-foreground/90">This page is Intel ingest only</strong> (Substack/RSS wired in{' '}
              <code className="text-foreground/80">signal-sources.ts</code>, stored in Supabase). It is not the video wall at{' '}
              <Link href="/telescreen" className="text-primary hover:underline font-bold">
                /telescreen
              </Link>{' '}
              (Notion catalog + curated video/music). Substack sources stay disabled in the desk until ingest syncs the
              registry after you enable them in the manifest.
            </>
          }
        />
        <Suspense
          fallback={
            <p className="text-foreground/70 uppercase tracking-wider text-sm">Loading Voices desk…</p>
          }
        >
          <VoicesDeskContent />
        </Suspense>
      </div>
    </main>
  );
}
