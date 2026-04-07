import 'server-only';

function opt(name, fallback = '') {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') return fallback;
  return String(v).trim();
}

export const opsEnv = {
  CRON_SECRET: opt('CRON_SECRET'),
};
