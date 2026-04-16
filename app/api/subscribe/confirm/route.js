import 'server-only';

import { NextResponse } from 'next/server';
import { confirmSubscriber } from '@/lib/db';
import { verifySubscribeToken } from '@/lib/subscribeToken';
import { hashSubscribeIp } from '@/lib/subscribeIpHash';
import { upsertResendContactForResistanceBrief } from '@/lib/resendContacts';

export async function GET(req) {
  let token = '';
  try {
    const url = new URL(req.url);
    token = url.searchParams.get('token') || '';
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const verified = verifySubscribeToken(token);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 400 });
  }

  const confirmedIpHash = hashSubscribeIp(req);

  try {
    const row = await confirmSubscriber({
      email: verified.email,
      confirmedIpHash,
    });

    // Best-effort sync to Resend contacts/segment for future Broadcasts.
    const source = row?.source ?? null;
    await upsertResendContactForResistanceBrief({ email: verified.email, source });

    // Redirect back to a friendly page (canonical) with status.
    return NextResponse.redirect(new URL('/subscribe?confirmed=1', req.url));
  } catch (error) {
    console.error('Confirm subscribe error:', error);
    return NextResponse.redirect(new URL('/subscribe?confirmed=0', req.url));
  }
}

