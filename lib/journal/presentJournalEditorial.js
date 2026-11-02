import { journalImageFit } from '@/components/journal/journalFormat';
import { defaultOgImage } from '@/lib/metadata';
import {
  journalEditorialDisplaySrc,
  journalEditorialOmitBlockIds,
  journalShareImage,
  resolveJournalEditorialImage,
} from '@/lib/notion/journalImage';
import { readPublicEditorialSize } from '@/lib/journal/publicEditorialSize';

function noEditorialImage() {
  return {
    editorial: null,
    metadataImage: defaultOgImage,
    displayImage: null,
    omitBlockIds: [],
  };
}

/**
 * Resolves optional essay artwork for the article and for social metadata.
 * A missing or unreadable image leaves the existing layout and fallback image in place.
 */
export function presentJournalEditorial(entry, blocks, canonicalPath) {
  try {
    const editorial = resolveJournalEditorialImage({
      propertyImage: entry?.propertyImage,
      coverImage: entry?.coverImage,
      blocks,
      title: entry?.title,
    });
    const shareImage = journalShareImage(editorial, canonicalPath);
    if (!shareImage) return noEditorialImage();

    const src = journalEditorialDisplaySrc(editorial, canonicalPath);
    if (!src) return noEditorialImage();
    const size = readPublicEditorialSize(src);

    return {
      editorial,
      metadataImage: {
        url: shareImage.url,
        alt: shareImage.alt,
        ...(size ? { width: size.width, height: size.height } : {}),
      },
      displayImage: {
        src,
        alt: editorial.alt,
        caption: editorial.caption || '',
        width: size?.width,
        height: size?.height,
        fit: journalImageFit({ ...entry, url: editorial.url }),
      },
      omitBlockIds: journalEditorialOmitBlockIds(editorial),
    };
  } catch {
    return noEditorialImage();
  }
}
