import 'server-only';
import { Client } from '@notionhq/client';
import { notionEnv } from '@/lib/env/notion';

export const notion = notionEnv.NOTION_API_KEY
  ? new Client({ auth: notionEnv.NOTION_API_KEY })
  : null;

export const READING_JOURNAL_DB_ID = notionEnv.NOTION_ENTRIES_DATABASE_ID || '';
