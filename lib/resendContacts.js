import 'server-only';
import { env } from '@/lib/env';

function getResendApiKey() {
  const k = typeof env.RESEND_API_KEY === 'string' ? env.RESEND_API_KEY.trim() : '';
  return k || '';
}

async function resendFetch(path, init) {
  const key = getResendApiKey();
  if (!key) return { ok: false, error: 'Email service not configured' };

  const response = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { ok: false, error: `Resend API error (${response.status})${text ? `: ${text}` : ''}` };
  }

  const data = await response.json().catch(() => ({}));
  return { ok: true, data };
}

/**
 * Creates/updates a global Resend contact and (optionally) adds it to a segment.
 * We treat RESISTANCE_BRIEF_AUDIENCE_ID as a legacy alias for RESISTANCE_BRIEF_SEGMENT_ID.
 */
export async function upsertResendContactForResistanceBrief({ email, source }) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return { ok: false, error: 'Email required' };

  const segmentId =
    (typeof env.RESISTANCE_BRIEF_SEGMENT_ID === 'string' && env.RESISTANCE_BRIEF_SEGMENT_ID.trim()) ||
    (typeof env.RESISTANCE_BRIEF_AUDIENCE_ID === 'string' && env.RESISTANCE_BRIEF_AUDIENCE_ID.trim()) ||
    '';

  const properties = {};
  if (source) properties.signup_source = String(source).slice(0, 64);

  const create = await resendFetch('/contacts', {
    method: 'POST',
    body: JSON.stringify({
      email: normalized,
      unsubscribed: false,
      properties,
    }),
  });

  if (!create.ok) return create;

  if (segmentId) {
    const add = await resendFetch(`/contacts/${encodeURIComponent(normalized)}/segments/${encodeURIComponent(segmentId)}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (!add.ok) return add;
  }

  return { ok: true, data: create.data };
}

