import 'server-only';

function opt(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') return '';
  return String(v).trim();
}

/** Minimal Notion env for journal. Missing values mean journal features are inert (empty lists), not fake data. */
export const notionEnv = {
  NOTION_API_KEY: opt('NOTION_API_KEY'),
  NOTION_JOURNAL_DB_ID: opt('NOTION_JOURNAL_DB_ID'),
};
