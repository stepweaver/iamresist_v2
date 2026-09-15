/**
 * Preload for Theme Memory CLI scripts.
 * - Stubs `server-only` so Next server modules can load under tsx/node
 * - Loads `.env` then `.env.local` without overwriting already-set variables
 */
const Module = require('module');
const fs = require('fs');
const path = require('path');

const originalLoad = Module._load;
Module._load = function themeMemoryPreload(request, parent, isMain) {
  if (request === 'server-only') return {};
  return originalLoad.apply(this, arguments);
};

function loadEnvFile(file) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  const text = fs.readFileSync(full, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || String(process.env[key]).trim() === '') {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');
