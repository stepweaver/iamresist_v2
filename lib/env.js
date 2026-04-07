/**
 * Merged server env (commerce + DB + site). Use domain modules when adding features.
 */
import 'server-only';

import { siteEnv } from '@/lib/env/site';
import { dbEnv } from '@/lib/env/db';
import { shopEnv } from '@/lib/env/shop';
import { opsEnv } from '@/lib/env/ops';

export const env = {
  ...siteEnv,
  ...dbEnv,
  ...shopEnv,
  ...opsEnv,
};
