import 'server-only';

function opt(name, fallback = '') {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') return fallback;
  return String(v).trim();
}

export const openaiEnv = {
  OPENAI_API_KEY: opt('OPENAI_API_KEY'),
  WEEKLY_BRIEF_DRAFT_MODEL: opt('WEEKLY_BRIEF_DRAFT_MODEL', 'gpt-5-mini'),
};
