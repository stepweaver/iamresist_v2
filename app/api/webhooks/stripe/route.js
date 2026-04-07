/**
 * POST /api/webhooks/stripe
 * Handles checkout.session.completed: create order, send email, submit to Printify.
 */

import { NextResponse } from 'next/server';
import { constructWebhookEvent } from '@/lib/stripe';
import { processStripeCheckoutSessionCompleted } from '@/lib/server/orderFulfillment.service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  let event;
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }
    event = constructWebhookEvent(body, signature);
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error.message);
    return NextResponse.json(
      { error: `Webhook Error: ${error.message}` },
      { status: 400 }
    );
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      await processStripeCheckoutSessionCompleted(session);
    } else if (event.type === 'checkout.session.expired') {
      // no-op
    } else {
      console.log('Unhandled Stripe event type:', event.type);
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook handler error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed', message: error.message },
      { status: 500 }
    );
  }
}
