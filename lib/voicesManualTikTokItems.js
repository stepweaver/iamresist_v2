import 'server-only';

/**
 * Mode A (manual TikTok ingestion):
 * - Editorially curated list of individual TikTok post URLs tied to an existing Notion Voice `slug`.
 * - No scraping, no creator-wide ingestion, no auto-discovery.
 *
 * Shape:
 *   { voiceSlug: string, url: string, title?: string, publishedAt?: string }
 */
export const manualTikTokItems = [];

