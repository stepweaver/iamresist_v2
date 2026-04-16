import 'server-only';

function opt(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') return '';
  return String(v).trim();
}

/** Minimal Notion env for journal, voices, curated articles, and books. Missing values mean features are inert (empty lists). */
export const notionEnv = {
  NOTION_API_KEY: opt('NOTION_API_KEY'),
  NOTION_JOURNAL_DB_ID: opt('NOTION_JOURNAL_DB_ID'),
  NOTION_VOICES_DB_ID: opt('NOTION_VOICES_DB_ID'),
  NOTION_CURATED_ARTICLES_DB_ID: opt('NOTION_CURATED_ARTICLES_DB_ID'),
  NOTION_BOOKS_DB_ID: opt('NOTION_BOOKS_DB_ID'),
  /** Weekly Brief editorial workspace (human-reviewed pipeline control plane). */
  NOTION_WEEKLY_BRIEFS_DB_ID: opt('NOTION_WEEKLY_BRIEFS_DB_ID'),
  /** Curated YouTube picks (Intel archive + homepage). Empty = no curated videos. */
  NOTION_CURATED_VIDEOS_DB_ID: opt('NOTION_CURATED_VIDEOS_DB_ID'),
  /** Protest music songs (Intel archive). Empty = no protest music section data. */
  NOTION_PROTEST_MUSIC_DB_ID: opt('NOTION_PROTEST_MUSIC_DB_ID'),
  NOTION_ENTRIES_DATABASE_ID:
    opt('NOTION_ENTRIES_DATABASE_ID') ||
    opt('NOTION_ENTRIES_DB_ID') ||
    opt('NOTION_READING_JOURNAL_DB_ID'),
};
