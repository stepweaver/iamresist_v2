import Link from 'next/link';
import Card from '@/components/Card';
import ShareButton from '@/components/ShareButton';
import { getCuratedVideoBySlug } from '@/lib/curated';
import { formatJournalMetaDate } from '@/lib/utils/date';
import { getYoutubeVideoId, detectVideoPlatform } from '@/lib/utils/youtube';
import { buildVideoMetadata } from '@/lib/metadata';
import { notFound } from 'next/navigation';
import { getCanonicalBaseUrl } from '@/lib/siteConfig';

export const revalidate = 600;
export const dynamicParams = true;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const video = await getCuratedVideoBySlug(slug);
  if (!video) return { title: 'Curated Video | I AM [RESIST]' };
  const videoId = getYoutubeVideoId(video.url);
  return buildVideoMetadata({
    title: video.title || 'Curated Video',
    description: video.description,
    videoId,
    urlPath: `/curated/${slug}`,
  });
}

export default async function CuratedVideoPage({ params }) {
  const { slug } = await params;
  const video = await getCuratedVideoBySlug(slug);

  if (!video) notFound();

  const youtubeId = getYoutubeVideoId(video.url);
  const platform = detectVideoPlatform(video.url);
  const displayDate = video.createdTime
    ? formatJournalMetaDate(video.createdTime)
    : video.dateAdded
      ? formatJournalMetaDate(video.dateAdded)
      : '';
  const shareUrl = `${getCanonicalBaseUrl()}/curated/${slug}`;

  return (
    <main
      className="min-h-screen overflow-x-hidden"
      style={{
        backgroundImage:
          'linear-gradient(rgba(211, 47, 47, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(211, 47, 47, 0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="max-w-[900px] mx-auto px-4 sm:px-6 lg:px-12 py-12 sm:py-16">
        <nav className="nav-label mb-8 text-sm" aria-label="Breadcrumb">
          <Link
            href="/"
            className="text-foreground/60 hover:text-primary transition-colors font-bold"
          >
            Home
          </Link>
          <span className="mx-2 text-foreground/40">/</span>
          <Link
            href="/telescreen?source=curated-videos"
            className="text-foreground/60 hover:text-primary transition-colors font-bold"
          >
            Curated Videos
          </Link>
          <span className="mx-2 text-foreground/40">/</span>
          <span
            className="text-foreground font-bold truncate max-w-[200px] sm:max-w-none inline-block"
            title={video.title}
          >
            {video.title || 'Video'}
          </span>
        </nav>

        <Card className="overflow-hidden rounded border border-border">
          {platform === 'youtube' && youtubeId && (
            <div className="relative w-full aspect-video bg-military-grey">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
                title={video.title || 'YouTube video'}
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
          <div className="p-4 sm:p-6">
            {displayDate && (
              <span className="timestamp text-primary text-xs sm:text-sm font-bold">
                {displayDate}
              </span>
            )}
            <h1 className="font-ui text-xl sm:text-2xl font-bold text-foreground mt-2 mb-4 leading-tight">
              {video.title || 'Curated Video'}
            </h1>
            {video.description && (
              <>
                <span className="kicker text-xs sm:text-sm font-bold text-primary mb-2 block">
                  Editorial note
                </span>
                <div className="journal-copy text-sm sm:text-base text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {video.description}
                </div>
              </>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {shareUrl && (
                <ShareButton
                  url={shareUrl}
                  title={video.title}
                  description={video.description?.slice(0, 160)}
                  iconOnly={false}
                  heading="Share video"
                />
              )}
            </div>
          </div>
        </Card>

        <p className="mt-6 text-center">
          <Link
            href="/telescreen?source=curated-videos"
            className="nav-label text-sm text-foreground/60 hover:text-primary transition-colors font-bold"
          >
            ← More curated videos
          </Link>
        </p>
      </div>
    </main>
  );
}
