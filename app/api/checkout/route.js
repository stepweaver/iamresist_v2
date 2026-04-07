/**
 * POST /api/checkout
 * Creates a Stripe Checkout session for cart (mix-and-match)
 */

import { NextResponse } from 'next/server';
import { createCheckoutSessionForCart } from '@/lib/stripe';
import { getSubtotalCents, getShippingCents, qualifiesForFreeShipping } from '@/lib/shopPricing';
import { siteEnv } from '@/lib/env/site';
import { validateAndNormalizeCart } from '@/lib/server/validators/checkout';
import { insertCartSnapshot } from '@/lib/db';
import { rateLimitedResponse } from '@/lib/server/rateLimit';

export async function POST(request) {
  const limited = rateLimitedResponse('checkout', request);
  if (limited) return limited;

  try {
    const body = await request.json();
    const parsed = validateAndNormalizeCart(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const validatedItems = parsed.items;
    const totalQuantity = validatedItems.reduce((sum, i) => sum + i.quantity, 0);
    const subtotalCents = getSubtotalCents(totalQuantity);
    const shippingCents = getShippingCents(totalQuantity);
    const totalCents = subtotalCents + shippingCents;
    const freeShipping = qualifiesForFreeShipping(totalQuantity);

    if (totalCents < 1) {
      return NextResponse.json({ error: 'Invalid cart total' }, { status: 400 });
    }

    const baseUrl = siteEnv.BASE_URL.replace(/\/$/, '');
    const snapshotId = await insertCartSnapshot(validatedItems);

    const session = await createCheckoutSessionForCart({
      subtotalCents,
      freeShipping,
      cartItems: validatedItems,
      cartSnapshotId: snapshotId,
      successUrl: `${baseUrl}/shop/cart?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/shop/cart?cancelled=true`,
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    const safeMessage =
      siteEnv.NODE_ENV === 'production'
        ? 'Unable to create checkout session'
        : error?.message || 'Failed to create checkout session';
    return NextResponse.json({ error: safeMessage }, { status: 500 });
  }
}
