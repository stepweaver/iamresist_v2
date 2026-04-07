import Image from 'next/image';
import Link from 'next/link';
import { formatDate } from '@/lib/utils/date';
import { youtubeThumbnailUrl } from '@/lib/utils/youtube';

export default function VoiceCard({ item }) {
  const { title, url, publishedAt, description, voice, image, sourceId } = item;
  const thumbUrl = image || youtubeThumbnailUrl(url, sourceId);
  const voiceName = voice?.title || 'Unknown Voice';
  const voiceHomeUrl =
    typeof voice?.homeUrl === 'string' && voice.homeUrl.trim() ? voice.homeUrl.trim() : null;
  const platform = voice?.platform || 'Feed';

  const displayDate = publishedAt ? formatDate(publishedAt) : null;

  return (
    <article className="machine-panel border border-border relative overflow-hidden group">
      <div className="absolute inset-0 hud-grid opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
      {thumbUrl ? (
        <Link
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative z-10 block w-full aspect-video bg-military-grey border-b border-border"
        >
          <Image
            src={thumbUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            unoptimized
          />
        </Link>
      ) : null}
      <div className="relative z-10 p-6">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="font-mono text-[10px] text-hud-dim tracking-wider uppercase">
            {platform}
          </span>
          {displayDate && (
            <>
              <span className="text-hud-dim">|</span>
              <time
                className="font-mono text-[10px] text-hud-dim tracking-wider"
                dateTime={publishedAt || undefined}
              >
                {displayDate}
              </time>
            </>
          )}
        </div>

        <h3 className="section-title text-xl lg:text-2xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors">
          <Link href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {title || 'Untitled'}
          </Link>
        </h3>

        {description && (
          <p className="prose-copy text-foreground/70 mb-4 line-clamp-3">
            {description}
          </p>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <span className="font-mono text-xs text-hud-dim">
            BY{' '}
            {voiceHomeUrl ? (
              <Link
                href={voiceHomeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                {voiceName.toUpperCase()}
              </Link>
            ) : (
              <span className="text-hud-dim">{voiceName.toUpperCase()}</span>
            )}
          </span>
          <Link
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="nav-label text-xs px-3 py-1 border border-primary text-primary hover:bg-primary hover:text-background transition-colors"
          >
            READ →
          </Link>
        </div>
      </div>
    </article>
  );
}
