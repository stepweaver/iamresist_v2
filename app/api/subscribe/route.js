import 'server-only';

import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { rateLimitedResponse } from '@/lib/server/rateLimit';
import { validateSubscribeRequest } from '@/lib/server/validators/subscribe';
import { CONSENT_TEXT, CONSENT_VERSION } from '@/lib/subscribeConsent';
import { signSubscribeToken } from '@/lib/subscribeToken';
import { sendSubscribeConfirmationEmail } from '@/lib/subscribeEmail';
import { upsertPendingSubscriber } from '@/lib/db';
import { hashSubscribeIp } from '@/lib/subscribeIpHash';

export async function POST(request) {
  const limited = rateLimitedResponse('subscribe', request);
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = validateSubscribeRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Honeypot: return generic success without doing anything.
  if (parsed.honeypot) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const email = parsed.email;
  const source = parsed.source;
  const baseUrl = env.BASE_URL.replace(/\/$/, '');
  const userAgent = request.headers.get('user-agent')?.slice(0, 512) ?? null;
  const signupIpHash = hashSubscribeIp(request);

  try {
    await upsertPendingSubscriber({
      email,
      source,
      consentVersion: CONSENT_VERSION,
      consentText: CONSENT_TEXT,
      signupIpHash,
      userAgent,
    });

    const token = signSubscribeToken(email);
    const confirmUrl = `${baseUrl}/api/subscribe/confirm?token=${encodeURIComponent(token)}`;

    const sent = await sendSubscribeConfirmationEmail({ toEmail: email, confirmUrl });
    if (!sent?.success && env.NODE_ENV !== 'production') {
      return NextResponse.json(
        { error: sent?.error || 'Unable to send confirmation email' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('Subscribe error:', error);
    const safeMessage =
      env.NODE_ENV === 'production'
        ? 'Unable to start subscription'
        : error?.message || 'Unable to start subscription';
    return NextResponse.json({ error: safeMessage }, { status: 500 });
  }
}

