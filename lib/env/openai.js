import 'server-only';

function opt(name, fallback = '') {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') return fallback;
  return String(v).trim();
}

export const openaiEnv = {
  OPENAI_API_KEY: opt('OPENAI_API_KEY'),
  OPENROUTER_API_KEY: opt('OPENROUTER_API_KEY'),
  OPENROUTER_BASE_URL: opt('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL: opt('OPENROUTER_MODEL'),
  WEEKLY_BRIEF_DRAFT_MODEL: opt('WEEKLY_BRIEF_DRAFT_MODEL'),
};
