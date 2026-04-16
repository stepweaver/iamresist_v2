/**
 * HMAC-signed confirm tokens for Resistance Brief subscriptions.
 *
 * Token format: base64url(json).base64url(hmac_sha256(payload))
 * Payload: { sub: "<email>", exp: <unix_seconds> }
 */
import 'server-only';
import crypto from 'crypto';
import { env } from '@/lib/env';

const TTL_SEC = 7 * 24 * 60 * 60; // 7 days

export function signSubscribeToken(email) {
  const secret = env.SUBSCRIBE_TOKEN_SECRET?.trim();
  if (!secret) throw new Error('SUBSCRIBE_TOKEN_SECRET is not configured');
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) throw new Error('Email is required');

  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  const payload = Buffer.from(JSON.stringify({ sub: normalized, exp }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySubscribeToken(token) {
  if (!token || typeof token !== 'string') return { ok: false, error: 'Invalid token' };
  const secret = env.SUBSCRIBE_TOKEN_SECRET?.trim();
  if (!secret) return { ok: false, error: 'Token secret not configured' };

  const dot = token.indexOf('.');
  if (dot < 1) return { ok: false, error: 'Invalid token' };
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !sig) return { ok: false, error: 'Invalid token' };

  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  try {
    if (
      expected.length !== sig.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    ) {
      return { ok: false, error: 'Invalid token' };
    }
  } catch {
    return { ok: false, error: 'Invalid token' };
  }

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, error: 'Invalid token' };
  }

  const email = typeof data?.sub === 'string' ? data.sub.trim().toLowerCase() : '';
  const exp = typeof data?.exp === 'number' ? data.exp : null;
  if (!email) return { ok: false, error: 'Invalid token' };
  if (!exp || exp < Math.floor(Date.now() / 1000)) return { ok: false, error: 'Expired token' };
  return { ok: true, email, exp };
}

