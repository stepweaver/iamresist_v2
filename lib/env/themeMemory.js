import 'server-only';

function opt(name, fallback = '') {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') return fallback;
  return String(v).trim();
}

function optInt(name, fallback) {
  const raw = opt(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const themeMemoryEnv = {
  THEME_AI_PROVIDER: opt('THEME_AI_PROVIDER', 'none').toLowerCase(),
  OLLAMA_BASE_URL: opt('OLLAMA_BASE_URL', 'http://127.0.0.1:11434'),
  OLLAMA_MODEL: opt('OLLAMA_MODEL'),
  THEME_AI_TIMEOUT_MS: optInt('THEME_AI_TIMEOUT_MS', 45000),
  THEME_AI_STARTUP_TIMEOUT_MS: optInt('THEME_AI_STARTUP_TIMEOUT_MS', 180000),
  THEME_AI_MAX_RETRIES: optInt('THEME_AI_MAX_RETRIES', 2),
  THEME_RANKING_MODE: opt('THEME_RANKING_MODE', 'off').toLowerCase(),
  THEME_RANKING_ENABLED: opt('THEME_RANKING_ENABLED', ''),
};
