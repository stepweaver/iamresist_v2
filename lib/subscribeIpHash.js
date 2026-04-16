import 'server-only';
import crypto from 'crypto';
import { env } from '@/lib/env';
import { getRateLimitClientKey } from '@/lib/server/rateLimit';

export function hashSubscribeIp(request) {
  const salt = typeof env.SUBSCRIBE_IP_HASH_SALT === 'string' ? env.SUBSCRIBE_IP_HASH_SALT.trim() : '';
  if (!salt) return null;
  const ip = getRateLimitClientKey(request);
  if (!ip || ip === 'unknown') return null;
  return crypto.createHmac('sha256', salt).update(ip).digest('hex');
}

