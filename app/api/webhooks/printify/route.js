/**
 * POST /api/webhooks/printify
 * Printify order lifecycle events. Requires PRINTIFY_WEBHOOK_SECRET in production.
 */

import { NextResponse } from 'next/server';
import { updateOrderByFulfillmentId, getOrderByFulfillmentOrderId, markShipmentEmailSent } from '@/lib/db';
import { PrintifyProvider } from '@/lib/fulfillment/printify';
import { sendShippingNotification } from '@/lib/email';
import { env } from '@/lib/env';
import crypto from 'crypto';

export const runtime = 'nodejs';

const HANDLED_TYPES = new Set([
  'order:updated',
  'order:shipped',
  'order:completed',
  'order:cancelled',
]);

const STATUS_ORDER = {
  pending: 0,
  paid: 1,
  email_sent: 2,
  submitted: 3,
  in_production: 4,
  shipped: 5,
  delivered: 6,
  cancelled: 7,
};

function verifyPrintifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody))
    .digest('hex');
  const receivedSignature = String(signature).replace('sha256=', '');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(receivedSignature)
    );
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const webhookSecret = env.PRINTIFY_WEBHOOK_SECRET?.trim();
    const allowUnsigned =
      env.NODE_ENV !== 'production' &&
      env.ALLOW_UNSIGNED_PRINTIFY_WEBHOOKS === 'true';

    if (env.NODE_ENV === 'production' && !webhookSecret) {
      console.error('[printify webhook] PRINTIFY_WEBHOOK_SECRET missing in production');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }

    const signature =
      request.headers.get('x-pfy-signature') ||
      request.headers.get('x-printify-signature') ||
      request.headers.get('printify-signature');

    if (webhookSecret) {
      if (!signature || !verifyPrintifySignature(rawBody, signature, webhookSecret)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else if (!allowUnsigned) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { type, resource } = body;
    if (!type || !resource) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    if (!HANDLED_TYPES.has(type)) {
      return NextResponse.json({ received: true });
    }

    const printify = new PrintifyProvider();
    const parsed = printify.parseWebhookPayload(body);

    switch (type) {
      case 'order:updated':
        await handleOrderUpdate(parsed);
        break;
      case 'order:shipped':
        await handleOrderShipped(parsed);
        break;
      case 'order:completed':
        await handleOrderUpdate({ ...parsed, status: 'delivered' });
        break;
      case 'order:cancelled':
        await handleOrderUpdate({ ...parsed, status: 'cancelled' });
        break;
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Printify webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleOrderUpdate(parsed) {
  if (!parsed.orderId) return;
  const local = await getOrderByFulfillmentOrderId(parsed.orderId);
  if (!local) return;
  if (!isMonotonicStatus(local.fulfillment_status, parsed.status)) return;
  await updateOrderByFulfillmentId(parsed.orderId, {
    fulfillmentStatus: parsed.status,
    trackingNumber: parsed.tracking?.trackingNumber,
    trackingUrl: parsed.tracking?.trackingUrl,
  });
}

async function handleOrderShipped(parsed) {
  if (!parsed.orderId) return;
  const local = await getOrderByFulfillmentOrderId(parsed.orderId);
  if (!local) return;
  if (!isMonotonicStatus(local.fulfillment_status, 'shipped')) return;
  const updated = await updateOrderByFulfillmentId(parsed.orderId, {
    fulfillmentStatus: 'shipped',
    trackingNumber: parsed.tracking?.trackingNumber,
    trackingUrl: parsed.tracking?.trackingUrl,
  });
  if (!updated || updated.shipment_email_sent_at) return;
  const emailLock = await markShipmentEmailSent(updated.id);
  if (!emailLock) return;
  await sendShippingNotification({ ...updated, shipment_email_sent_at: emailLock.shipment_email_sent_at });
}

function isMonotonicStatus(currentStatus, nextStatus) {
  const currentRank = STATUS_ORDER[currentStatus] ?? -1;
  const nextRank = STATUS_ORDER[nextStatus] ?? -1;
  if (nextRank < 0) return false;
  if (currentRank < 0) return true;
  if (currentStatus === 'cancelled') return nextStatus === 'cancelled';
  if (currentStatus === 'delivered') return nextStatus === 'delivered';
  return nextRank >= currentRank;
  }

export async function GET(request) {
  if (env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
  }
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get('challenge');
  if (challenge) return NextResponse.json({ challenge });
  return NextResponse.json({ ok: true });
}
