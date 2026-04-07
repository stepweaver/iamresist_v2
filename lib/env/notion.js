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
  NOTION_ENTRIES_DATABASE_ID:
    opt('NOTION_ENTRIES_DATABASE_ID') ||
    opt('NOTION_ENTRIES_DB_ID') ||
    opt('NOTION_READING_JOURNAL_DB_ID'),
};
