/**
 * HMAC-signed links for order status (email-only capability)
 */

import "server-only";
import crypto from 'crypto';
import { env } from '@/lib/env';

const TTL_SEC = 180 * 24 * 60 * 60; // 180 days

export function signOrderStatusToken(orderId) {
  const secret = env.ORDER_STATUS_SECRET?.trim();
  if (!secret) {
    throw new Error('ORDER_STATUS_SECRET is not configured');
  }
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  const payload = Buffer.from(JSON.stringify({ sub: orderId, exp }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyOrderStatusToken(orderId, token) {
  if (!token || typeof token !== 'string' || !orderId) return false;
  const secret = env.ORDER_STATUS_SECRET?.trim();
  if (!secret) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  try {
    if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
      return false;
    }
  } catch {
    return false;
  }
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return false;
  }
  if (data.sub !== orderId) return false;
  if (typeof data.exp !== 'number' || data.exp < Math.floor(Date.now() / 1000)) return false;
  return true;
}

export function buildOrderStatusUrl(orderId, token) {
  const base = env.BASE_URL.replace(/\/$/, '');
  return `${base}/orders/${orderId}?token=${encodeURIComponent(token)}`;
}
