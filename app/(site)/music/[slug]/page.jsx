import Link from 'next/link';
import Card from '@/components/Card';
import ShareButton from '@/components/ShareButton';
import StructuredData from '@/components/seo/StructuredData';
import { getProtestSongBySlug } from '@/lib/protestMusic';
import { buildTelescreenHref, TELESCREEN_MODES } from '@/lib/telescreen';
import { formatJournalMetaDate } from '@/lib/utils/date';
import { getYoutubeVideoId, detectVideoPlatform } from '@/lib/utils/youtube';
import { buildSongMetadata, defaultOgImage, youtubeOgImage } from '@/lib/metadata';
import { notFound } from 'next/navigation';
import { getCanonicalBaseUrl } from '@/lib/siteConfig';
import { buildArticleSchema, buildBreadcrumbListSchema } from '@/lib/seo/schema';
import { joinSeoDescriptionParts, pickSeoDescription } from '@/lib/seo/text';

export const revalidate = 600;
export const dynamicParams = true;

function buildMusicDescription(song) {
  return pickSeoDescription(
    [song?.description],
    joinSeoDescriptionParts([
      song?.title ? `${song.title}.` : null,
      song?.artist ? `Artist: ${song.artist}.` : null,
      'Protest music with editorial context from I AM [RESIST].',
    ]),
    180,
  );
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const song = await getProtestSongBySlug(slug);
  if (!song) return { title: 'Protest Song | I AM [RESIST]' };
  const videoId = getYoutubeVideoId(song.url);
  const canonicalSlug = song.songSlug || slug;
  return buildSongMetadata({
    title: song.title,
    artist: song.artist,
    description: buildMusicDescription(song),
    videoId,
    urlPath: `/music/${canonicalSlug}`,
  });
}

export default async function ProtestSongPage({ params }) {
  const { slug } = await params;
  const song = await getProtestSongBySlug(slug);

  if (!song) notFound();

  const youtubeId = getYoutubeVideoId(song.url);
  const platform = detectVideoPlatform(song.url);
  const displayDate = song.createdTime ? formatJournalMetaDate(song.createdTime) : '';
  const canonicalSlug = song.songSlug || slug;
  const canonicalPath = `/music/${canonicalSlug}`;
  const shareUrl = `${getCanonicalBaseUrl()}${canonicalPath}`;
  const musicArchiveHref = buildTelescreenHref({ mode: TELESCREEN_MODES.music });
  const description = buildMusicDescription(song);
  const schema = [
    buildBreadcrumbListSchema([
      { name: 'Home', url: '/' },
      { name: 'Protest Music', url: musicArchiveHref },
      { name: song.title || 'Protest Song', url: canonicalPath },
    ]),
    buildArticleSchema({
      headline: song.artist ? `${song.title} - ${song.artist}` : song.title || 'Protest Song',
      description,
      url: canonicalPath,
      image: youtubeOgImage(youtubeId) || defaultOgImage,
      datePublished: song.createdTime || undefined,
      dateModified: song.lastEditedTime || undefined,
    }),
  ];

  return (
    <main
      className="min-h-screen overflow-x-hidden"
      style={{
        backgroundImage:
          'linear-gradient(rgba(211, 47, 47, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(211, 47, 47, 0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <StructuredData data={schema} />
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
            href={musicArchiveHref}
            className="text-foreground/60 hover:text-primary transition-colors font-bold"
          >
            Protest Music
          </Link>
          <span className="mx-2 text-foreground/40">/</span>
          <span
            className="text-foreground font-bold truncate max-w-[200px] sm:max-w-none inline-block"
            title={song.title}
          >
            {song.title || 'Song'}
          </span>
        </nav>

        <Card className="overflow-hidden rounded border border-border">
          {platform === 'youtube' && youtubeId && (
            <div className="relative w-full aspect-video bg-military-grey">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
                title={song.title || 'YouTube video'}
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
            <h1 className="font-ui text-xl sm:text-2xl font-bold text-foreground mt-2 mb-1 leading-tight">
              {song.title || 'Protest Song'}
            </h1>
            {song.artist && (
              <p className="text-sm sm:text-base text-foreground/70 font-semibold mb-4">
                {song.artist}
              </p>
            )}
            {song.description && (
              <>
                <span className="kicker text-xs sm:text-sm font-bold text-primary mb-2 block">
                  Editorial note
                </span>
                <div className="journal-copy text-sm sm:text-base text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {song.description}
                </div>
              </>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {shareUrl && (
                <ShareButton
                  url={shareUrl}
                  title={`${song.title} — ${song.artist}`}
                  description={song.description?.slice(0, 160)}
                  iconOnly={false}
                  heading="Share song"
                />
              )}
            </div>
          </div>
        </Card>

        <p className="mt-6 text-center">
          <Link
            href={musicArchiveHref}
            className="nav-label text-sm text-foreground/60 hover:text-primary transition-colors font-bold"
          >
            ← More protest music
          </Link>
        </p>
      </div>
    </main>
  );
}
