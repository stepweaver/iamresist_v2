import { describe, expect, it } from 'vitest';
import { formatJournalPage } from '@/lib/notion/journalFields';
import {
  classifyJournalImageUrl,
  isJournalImageKey,
  journalEditorialOmitBlockIds,
  journalShareImage,
  notionFileFetchUrl,
  resolveJournalEditorialImage,
} from '@/lib/notion/journalImage';

const SIGNED =
  'https://prod-files-secure.s3.us-west-2.amazonaws.com/note/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc123&X-Amz-Expires=3600';

function imageBlock(id, url, caption = '') {
  return {
    id,
    type: 'image',
    image: {
      type: 'external',
      external: { url },
      caption: caption ? [{ plain_text: caption }] : [],
    },
  };
}

describe('journal editorial image discovery', () => {
  it('returns no image when an essay has no artwork', () => {
    const entry = formatJournalPage({
      id: 'page-1',
      properties: {
        Title: { title: [{ plain_text: 'No Artwork' }] },
      },
    });

    expect(entry.propertyImage).toBeNull();
    expect(entry.coverImage).toBeNull();
    expect(
      resolveJournalEditorialImage({
        propertyImage: entry.propertyImage,
        coverImage: entry.coverImage,
        blocks: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Text only.' }] } }],
        title: entry.title,
      }),
    ).toBeNull();
    expect(journalShareImage(null, '/journal/no-artwork')).toBeNull();
  });

  it('lets an image property take precedence over the cover and the body', () => {
    const entry = formatJournalPage({
      id: 'page-1',
      cover: { type: 'external', external: { url: 'https://cdn.example/cover.jpg' } },
      properties: {
        Title: { title: [{ plain_text: 'Field Notes' }] },
        'Hero Image': {
          type: 'files',
          files: [
            {
              name: 'Field Notes',
              type: 'external',
              external: { url: 'https://cdn.example/hero.jpg' },
            },
          ],
        },
      },
    });
    const blocks = [imageBlock('body-image', 'https://cdn.example/body.jpg', 'From the body')];
    const image = resolveJournalEditorialImage({
      propertyImage: entry.propertyImage,
      coverImage: entry.coverImage,
      blocks,
      title: entry.title,
    });

    expect(entry.coverImage?.url).toBe('https://cdn.example/cover.jpg');
    expect(image).toMatchObject({
      source: 'property',
      hosting: 'external',
      url: 'https://cdn.example/hero.jpg',
      blockId: null,
      alt: 'Field Notes',
    });
    expect(journalEditorialOmitBlockIds(image)).toEqual([]);
  });

  it('reads a URL property, a cover, and the first usable body image in that order', () => {
    const blocks = [
      { id: 'empty', type: 'image', image: { type: 'external', external: { url: '' } } },
      imageBlock('first-real', 'https://cdn.example/body.jpg', 'Caption from the essay.'),
      imageBlock('later', 'https://cdn.example/later.jpg', 'Later caption'),
    ];

    expect(
      resolveJournalEditorialImage({
        propertyImage: { url: 'http://127.0.0.1/secret.png' },
        coverImage: { url: 'https://cdn.example/cover.jpg' },
        blocks,
        title: 'Unsafe property',
      })?.url,
    ).toBe('https://cdn.example/cover.jpg');

    const body = resolveJournalEditorialImage({ blocks, title: 'Body Only' });
    expect(body).toMatchObject({
      source: 'body',
      blockId: 'first-real',
      url: 'https://cdn.example/body.jpg',
      caption: 'Caption from the essay.',
      alt: 'Caption from the essay.',
    });
    expect(journalEditorialOmitBlockIds(body)).toEqual(['first-real']);
  });

  it('accepts files, external urls, and native Notion uploads without publishing signed urls', () => {
    const native = resolveJournalEditorialImage({
      propertyImage: {
        url: SIGNED,
        fileName: 'trump-putin-leash.webp',
      },
      coverImage: { url: 'https://cdn.example/cover.jpg' },
      blocks: [imageBlock('body', 'https://cdn.example/body.jpg')],
      title: 'Signed File',
    });

    expect(native.hosting).toBe('notion-file');
    expect(native.source).toBe('property');
    const share = journalShareImage(native, '/journal/signed-file');
    expect(share.url).toBe('/journal/signed-file/image');
    expect(share.url).not.toContain('X-Amz');
    expect(share.url).not.toContain('prod-files-secure');

    expect(classifyJournalImageUrl('https://iamresist.org/editorial/trump-putin-leash.webp')).toEqual({
      hosting: 'site',
      url: '/editorial/trump-putin-leash.webp',
    });
    expect(classifyJournalImageUrl('https://www.iamresist.org/editorial/trump-putin-leash.webp')).toEqual({
      hosting: 'site',
      url: '/editorial/trump-putin-leash.webp',
    });
  });

  it('rejects private, expiring, and non-image addresses', () => {
    expect(notionFileFetchUrl('https://evil.example/image.png')).toBeNull();
    expect(notionFileFetchUrl('http://127.0.0.1/latest')).toBeNull();
    expect(notionFileFetchUrl('https://169.254.169.254/latest/meta-data')).toBeNull();
    expect(notionFileFetchUrl('https://prod-files-secure.s3.us-west-2.amazonaws.com.evil.com/a.png')).toBeNull();
    expect(classifyJournalImageUrl('https://bucket.s3.amazonaws.com/a.png?X-Amz-Signature=secret')).toBeNull();
    expect(classifyJournalImageUrl('/editorial/../package.json')).toBeNull();
    expect(classifyJournalImageUrl('//evil.example/a.png')).toBeNull();
    expect(isJournalImageKey('../etc/passwd')).toBe(false);
    expect(isJournalImageKey('slug/image?url=https://evil.example')).toBe(false);
    expect(isJournalImageKey('show-me-the-proof')).toBe(true);
    expect(isJournalImageKey('3febc620-4ba0-806c-ab28-ca4d17678849')).toBe(true);
  });
});
