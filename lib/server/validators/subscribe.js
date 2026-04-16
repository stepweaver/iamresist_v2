/**
 * Server-side validation for POST /api/subscribe
 */

const MAX_EMAIL_LENGTH = 320; // practical max per RFCs (local@domain)
const SOURCE_MAX = 64;

const ALLOWED_KEYS = new Set(['email', 'source', 'hp']);

function isProbablyEmail(email) {
  if (typeof email !== 'string') return false;
  const e = email.trim();
  if (!e || e.length > MAX_EMAIL_LENGTH) return false;
  // pragmatic check: must contain one @, no spaces, and at least one dot in domain
  if (/\s/.test(e)) return false;
  const at = e.indexOf('@');
  if (at < 1 || at !== e.lastIndexOf('@')) return false;
  const domain = e.slice(at + 1);
  if (!domain || !domain.includes('.')) return false;
  return true;
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, email: string, source: string|null, honeypot: string|null } | { ok: false, error: string }}
 */
export function validateSubscribeRequest(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body' };

  const keys = Object.keys(body);
  for (const k of keys) {
    if (!ALLOWED_KEYS.has(k)) return { ok: false, error: `Unknown field: ${k}` };
  }

  const emailRaw = body.email;
  if (!isProbablyEmail(emailRaw)) return { ok: false, error: 'Enter a valid email address' };

  const email = String(emailRaw).trim().toLowerCase();

  const sourceRaw = body.source;
  const source =
    typeof sourceRaw === 'string' && sourceRaw.trim()
      ? sourceRaw.trim().slice(0, SOURCE_MAX)
      : null;

  const hpRaw = body.hp;
  const honeypot =
    typeof hpRaw === 'string' && hpRaw.trim()
      ? hpRaw.trim().slice(0, 256)
      : null;

  return { ok: true, email, source, honeypot };
}

