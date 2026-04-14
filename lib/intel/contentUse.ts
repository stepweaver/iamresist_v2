import type { ContentUseMode } from '@/lib/intel/types';

/**
 * Decode common HTML entities and non-breaking space variants for visible intel strings.
 * Apply to plain titles/summaries before truncation or display.
 */
export function decodeIntelPlainText(s: string): string {
  if (!s || typeof s !== 'string') return '';
  let t = s
    .replace(/&nbsp;?/gi, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&#x0*A0;/gi, ' ')
    .replace(/&#x0*a0;/g, ' ');
  t = t
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return t.replace(/\s+/g, ' ').trim();
}

/** Strip simple HTML tags for RSS description fields (conservative text extraction). */
export function stripHtmlToText(html: string): string {
  if (!html || typeof html !== 'string') return '';
  const noScripts = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const tagsStripped = noScripts.replace(/<[^>]+>/g, ' ');
  return decodeIntelPlainText(tagsStripped);
}

const CAP_FEED_SUMMARY = 560;
const CAP_PREVIEW_LINK = 320;
const CAP_FULL_TEXT = 4000;

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Apply content-use policy to a raw summary string (already plain text or post-strip).
 */
export function applyContentUseModeToSummary(
  raw: string | null | undefined,
  mode: ContentUseMode,
): string | null {
  if (mode === 'metadata_only' || mode === 'manual_review') return null;

  if (raw == null || String(raw).trim() === '') return null;

  const text = decodeIntelPlainText(String(raw).trim());

  if (mode === 'feed_summary') return truncate(text, CAP_FEED_SUMMARY);
  if (mode === 'preview_and_link') return truncate(text, CAP_PREVIEW_LINK);
  if (mode === 'full_text_if_feed_includes') return truncate(text, CAP_FULL_TEXT);

  return truncate(text, CAP_FEED_SUMMARY);
}
