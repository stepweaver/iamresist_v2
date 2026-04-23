import 'server-only';

/**
 * Mode A (manual TikTok ingestion):
 * - Editorially curated list of individual TikTok post URLs tied to an existing Notion Voice `slug`.
 * - No scraping, no creator-wide ingestion, no auto-discovery.
 *
 * Shape:
 *   { voiceSlug: string, url: string, title?: string, publishedAt?: string }
 */
export const manualTikTokItems = [
  {
    voiceSlug: 'lime-accordion',
    url: 'https://www.tiktok.com/@lime.accordion/video/7491234567890123456',
    title: 'First Lime Accordion TikTok',
    publishedAt: '2026-04-23T12:00:00.000Z',
  },
  {
    voiceSlug: 'lime-accordion',
    url: 'https://www.tiktok.com/@lime.accordion/video/7492345678901234567',
    title: 'Second Lime Accordion TikTok',
    publishedAt: '2026-04-22T15:30:00.000Z',
  },
];