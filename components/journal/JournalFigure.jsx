import { journalImageFit } from '@/components/journal/journalFormat';

/** Renders nothing when an essay has no artwork, so the layout never reserves an empty frame. */
export default function JournalFigure({ image, className = '', priority = false }) {
  if (!image?.src) return null;
  const fit = journalImageFit(image);
  const classes = ['journal-editorial', `journal-editorial--${fit}`, className].filter(Boolean).join(' ');

  return (
    <figure className={classes}>
      <img
        src={image.src}
        alt={image.alt || ''}
        width={image.width || undefined}
        height={image.height || undefined}
        decoding="async"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
      />
      {image.caption ? <figcaption>{image.caption}</figcaption> : null}
    </figure>
  );
}
