import 'server-only';

function firstNonEmpty(names) {
  for (const name of names) {
    const v = process.env[name];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

/** Supabase (orders + cart snapshots). Empty strings if unset — DB calls throw at runtime. */
export const dbEnv = {
  SUPABASE_URL: firstNonEmpty([
    'SUPABASE_URL',
    'POSTGRES_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_POSTGRES_SUPABASE_URL',
  ]),
  SUPABASE_SERVICE_ROLE_KEY: firstNonEmpty([
    'SUPABASE_SERVICE_ROLE_KEY',
    'POSTGRES_SUPABASE_SERVICE_ROLE_KEY',
  ]),
};
