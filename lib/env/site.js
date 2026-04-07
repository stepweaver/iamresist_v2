import 'server-only';

import { normalizeBaseUrl } from '@/lib/siteConfig';

function opt(name, fallback = '') {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') return fallback;
  return String(v).trim();
}

export const siteEnv = {
  NODE_ENV: opt('NODE_ENV', 'development'),
  BASE_URL: normalizeBaseUrl(opt('NEXT_PUBLIC_BASE_URL', 'https://www.iamresist.org')),
  ORDER_STATUS_SECRET: opt('ORDER_STATUS_SECRET'),
  ALLOW_UNSIGNED_PRINTIFY_WEBHOOKS: opt('ALLOW_UNSIGNED_PRINTIFY_WEBHOOKS', ''),
};
