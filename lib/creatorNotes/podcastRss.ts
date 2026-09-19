import type { PodcastEpisodeSource, PodcastTranscriptCandidate } from '@/lib/creatorNotes/types';
import {
  hostFromUrl,
  isAudioMime,
  isTranscriptMime,
  normalizeHttpUrl,
  optionalText,
} from '@/lib/creatorNotes/podcastIdentity';

const TRANSCRIPT_MIME_HINTS = [
  'text/vtt',
  'application/x-subrip',
  'application/srt',
  'text/srt',
  'application/json',
  'text/plain',
  'text/html',
];

function decodeXmlEntities(value: string): string {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripCdata(value: string): string {
  return decodeXmlEntities(value).trim();
}

function firstTagContent(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(re);
  if (!match) return null;
  return stripCdata(match[1] || '') || null;
}

function attr(tagXml: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const match = tagXml.match(re);
  if (!match) return null;
  return optionalText(decodeXmlEntities(match[2] || match[3] || ''));
}

function parsePublishedAt(raw: string | null): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function pushCandidate(
  out: PodcastTranscriptCandidate[],
  input: {
    url: string | null;
    mimeType: string | null;
    language: string | null;
    rel: string | null;
    source: PodcastTranscriptCandidate['source'];
    baseUrl: string;
  },
) {
  const url = normalizeHttpUrl(input.url, input.baseUrl);
  if (!url) return;
  const key = `${input.source}|${url}|${input.mimeType || ''}`;
  if (out.some((row) => `${row.source}|${row.url}|${row.mimeType || ''}` === key)) return;
  out.push({
    url,
    mimeType: optionalText(input.mimeType),
    language: optionalText(input.language),
    rel: optionalText(input.rel),
    source: input.source,
  });
}

function parsePodcastNamespaceTranscripts(itemXml: string, baseUrl: string): PodcastTranscriptCandidate[] {
  const out: PodcastTranscriptCandidate[] = [];
  const re = /<podcast:transcript\b([^>]*)(?:\/>|>([\s\S]*?)<\/podcast:transcript>)/gi;
  let match: RegExpExecArray | null = re.exec(itemXml);
  while (match) {
    const attrs = match[1] || '';
    const bodyUrl = optionalText(stripCdata(match[2] || ''));
    pushCandidate(out, {
      url: attr(attrs, 'url') || bodyUrl,
      mimeType: attr(attrs, 'type'),
      language: attr(attrs, 'language'),
      rel: attr(attrs, 'rel'),
      source: 'podcast_namespace',
      baseUrl,
    });
    match = re.exec(itemXml);
  }
  return out;
}

function parseExplicitRssTranscripts(
  itemXml: string,
  baseUrl: string,
  episodeUrl: string | null,
): PodcastTranscriptCandidate[] {
  const out: PodcastTranscriptCandidate[] = [];
  const enclosureRe = /<enclosure\b([^>]*)\/?>/gi;
  let enclosure: RegExpExecArray | null = enclosureRe.exec(itemXml);
  while (enclosure) {
    const attrs = enclosure[1] || '';
    const mime = attr(attrs, 'type');
    if (isTranscriptMime(mime)) {
      pushCandidate(out, {
        url: attr(attrs, 'url'),
        mimeType: mime,
        language: null,
        rel: null,
        source: 'rss_explicit',
        baseUrl,
      });
    }
    enclosure = enclosureRe.exec(itemXml);
  }

  const linkRe = /<link\b([^>]*)(?:\/>|>([\s\S]*?)<\/link>)/gi;
  let link: RegExpExecArray | null = linkRe.exec(itemXml);
  while (link) {
    const attrs = link[1] || '';
    const href = attr(attrs, 'href') || attr(attrs, 'url') || optionalText(stripCdata(link[2] || ''));
    const rel = attr(attrs, 'rel');
    const mime = attr(attrs, 'type');
    const relLooksTranscript = /transcript|captions?/i.test(rel || '');
    if (relLooksTranscript || isTranscriptMime(mime)) {
      pushCandidate(out, {
        url: href,
        mimeType: mime,
        language: attr(attrs, 'hreflang'),
        rel,
        source: 'rss_explicit',
        baseUrl,
      });
    }
    link = linkRe.exec(itemXml);
  }

  const mediaRe = /<media:content\b([^>]*)\/?>/gi;
  let media: RegExpExecArray | null = mediaRe.exec(itemXml);
  while (media) {
    const attrs = media[1] || '';
    const mime = attr(attrs, 'type');
    if (isTranscriptMime(mime)) {
      pushCandidate(out, {
        url: attr(attrs, 'url'),
        mimeType: mime,
        language: attr(attrs, 'lang'),
        rel: attr(attrs, 'medium'),
        source: 'rss_explicit',
        baseUrl,
      });
    }
    media = mediaRe.exec(itemXml);
  }

  const sameHost = hostFromUrl(episodeUrl) || hostFromUrl(baseUrl);
  if (sameHost) {
    const hrefRe = /href\s*=\s*("([^"]+)"|'([^']+)')/gi;
    let hrefMatch: RegExpExecArray | null = hrefRe.exec(itemXml);
    while (hrefMatch) {
      const href = normalizeHttpUrl(hrefMatch[2] || hrefMatch[3], baseUrl);
      const path = href ? new URL(href).pathname.toLowerCase() : '';
      if (href && hostFromUrl(href) === sameHost && /transcript/.test(path)) {
        pushCandidate(out, {
          url: href,
          mimeType: path.endsWith('.vtt')
            ? 'text/vtt'
            : path.endsWith('.srt')
              ? 'application/x-subrip'
              : path.endsWith('.json')
                ? 'application/json'
                : 'text/html',
          language: null,
          rel: 'transcript',
          source: 'rss_explicit',
          baseUrl,
        });
      }
      hrefMatch = hrefRe.exec(itemXml);
    }
  }

  return out;
}

function parseAudioUrl(itemXml: string, baseUrl: string): string | null {
  const enclosureRe = /<enclosure\b([^>]*)\/?>/gi;
  let enclosure: RegExpExecArray | null = enclosureRe.exec(itemXml);
  while (enclosure) {
    const attrs = enclosure[1] || '';
    const mime = attr(attrs, 'type');
    const url = attr(attrs, 'url');
    if (url && (isAudioMime(mime) || /\.(mp3|m4a|aac|ogg|wav)(\?|$)/i.test(url))) {
      return normalizeHttpUrl(url, baseUrl);
    }
    enclosure = enclosureRe.exec(itemXml);
  }

  const mediaRe = /<media:content\b([^>]*)\/?>/gi;
  let media: RegExpExecArray | null = mediaRe.exec(itemXml);
  while (media) {
    const attrs = media[1] || '';
    const mime = attr(attrs, 'type');
    const medium = attr(attrs, 'medium');
    const url = attr(attrs, 'url');
    if (url && (isAudioMime(mime) || medium === 'audio')) {
      return normalizeHttpUrl(url, baseUrl);
    }
    media = mediaRe.exec(itemXml);
  }
  return null;
}

function parseEpisodeUrl(itemXml: string, baseUrl: string): string | null {
  const link = firstTagContent(itemXml, 'link');
  if (link && /^https?:\/\//i.test(link)) return normalizeHttpUrl(link, baseUrl);
  const linkTag = itemXml.match(/<link\b([^>]*)(?:\/>|>([\s\S]*?)<\/link>)/i);
  if (linkTag) {
    const href = attr(linkTag[1] || '', 'href') || stripCdata(linkTag[2] || '');
    const normalized = normalizeHttpUrl(href, baseUrl);
    if (normalized) return normalized;
  }
  return null;
}

function parseGuid(itemXml: string): string | null {
  return firstTagContent(itemXml, 'guid') || firstTagContent(itemXml, 'id');
}

export function rankTranscriptCandidates(
  candidates: PodcastTranscriptCandidate[],
): PodcastTranscriptCandidate[] {
  const rank = (source: PodcastTranscriptCandidate['source']) => {
    if (source === 'podcast_namespace') return 0;
    if (source === 'official_page') return 1;
    return 2;
  };
  return [...candidates].sort((a, b) => {
    const bySource = rank(a.source) - rank(b.source);
    if (bySource !== 0) return bySource;
    const aCaption = /caption/i.test(a.rel || '') ? 0 : 1;
    const bCaption = /caption/i.test(b.rel || '') ? 0 : 1;
    return aCaption - bCaption;
  });
}

export function parsePodcastFeedXml(
  xml: string,
  meta: {
    feedUrl: string;
    creatorId: string | null;
    creatorName: string | null;
  },
  opts: { limit?: number } = {},
): PodcastEpisodeSource[] {
  const raw = String(xml || '');
  if (!raw.includes('<rss') && !raw.includes('<feed')) return [];
  const itemChunks = raw.match(/<item\b[\s\S]*?<\/item>/gi) || raw.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const limit = opts.limit && opts.limit > 0 ? opts.limit : itemChunks.length;
  const episodes: PodcastEpisodeSource[] = [];

  for (const itemXml of itemChunks.slice(0, limit)) {
    const episodeUrl = parseEpisodeUrl(itemXml, meta.feedUrl);
    const guid = parseGuid(itemXml);
    const audioUrl = parseAudioUrl(itemXml, meta.feedUrl);
    const title = firstTagContent(itemXml, 'title') || 'Untitled episode';
    const publishedAt = parsePublishedAt(
      firstTagContent(itemXml, 'pubDate') ||
        firstTagContent(itemXml, 'published') ||
        firstTagContent(itemXml, 'updated') ||
        firstTagContent(itemXml, 'dc:date'),
    );
    const sourceItemId = optionalText(guid) || optionalText(episodeUrl) || optionalText(audioUrl);
    if (!sourceItemId) continue;

    const namespaceCandidates = parsePodcastNamespaceTranscripts(itemXml, meta.feedUrl);
    const explicitCandidates = parseExplicitRssTranscripts(itemXml, meta.feedUrl, episodeUrl);
    const transcriptCandidates = rankTranscriptCandidates([...namespaceCandidates, ...explicitCandidates]);

    episodes.push({
      sourceItemId,
      creatorId: meta.creatorId,
      creatorName: meta.creatorName,
      feedUrl: meta.feedUrl,
      guid,
      title,
      episodeUrl,
      audioUrl,
      publishedAt,
      transcriptCandidates,
    });
  }

  return episodes;
}

export function looksLikeHtmlDocument(payload: string): boolean {
  const trimmed = String(payload || '').trim().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

export { TRANSCRIPT_MIME_HINTS };
