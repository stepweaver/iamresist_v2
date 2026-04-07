import 'server-only';
import { Client } from '@notionhq/client';
import { notionEnv } from '@/lib/env/notion';

export const notion = notionEnv.NOTION_API_KEY
  ? new Client({ auth: notionEnv.NOTION_API_KEY })
  : null;
