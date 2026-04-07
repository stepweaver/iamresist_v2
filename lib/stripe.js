/**
 * Stripe integration helpers
 * Handles checkout session creation and webhook verification
 */

import "server-only";
import Stripe from 'stripe';
import { siteEnv } from '@/lib/env/site';
import { PRODUCT_CONFIG } from '@/lib/config/products';

export { PRODUCT_CONFIG };

let stripeInstance = null;
const UUID_V4ISH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getStripe() {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey) {
      throw new Error('Missing required env var: STRIPE_SECRET_KEY');
    }
    stripeInstance = new Stripe(secretKey, { apiVersion: '2024-12-18.acacia' });
  }
  return stripeInstance;
}

export { getStripe as stripe };

/**
 * Get product config by Price ID
 * @param {string} priceId - Stripe Price ID
 * @returns {Object|null} Product configuration or null if not found
 */
export function getProductByPriceId(priceId) {
  for (const [key, config] of Object.entries(PRODUCT_CONFIG)) {
    if (config.priceId === priceId) {
      return { ...config, key };
    }
  }
  return null;
}

/**
 * Get product config by product type key
 * @param {string} productKey - 'individual', 'threePack', 'fivePack', 'tacoIndividual', etc.
 * @returns {Object|null} Product configuration or null if not found
 */
export function getProductByKey(productKey) {
  return PRODUCT_CONFIG[productKey] || null;
}

/**
 * @param {string} sku
 * @returns {Object|null} config with key
 */
export function getProductBySku(sku) {
  if (!sku) return null;
  for (const [key, config] of Object.entries(PRODUCT_CONFIG)) {
    if (config.sku === sku) {
      return { ...config, key };
    }
  }
  return null;
}

/**
 * Get product config by Stripe unit_amount (cents).
 * Use when price ID lookup fails or returns wrong config (e.g. swapped env vars).
 * Disambiguates by product_key from metadata when multiple products share the same price.
 * @param {number} unitAmountCents - Stripe price.unit_amount
 * @param {string} [productKeyHint] - Optional metadata product_key to narrow down (e.g. 'individual', 'threePack')
 * @returns {Object|null} Product configuration or null if not found
 */
export function getProductByUnitAmount(unitAmountCents, productKeyHint) {
  if (!unitAmountCents) return null;
  const matches = Object.entries(PRODUCT_CONFIG).filter(
    ([, config]) => config.unitAmountCents === unitAmountCents
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return { ...matches[0][1], key: matches[0][0] };
  // Multiple products share this price (e.g. all individuals are $6) - use hint
  if (productKeyHint) {
    const match = matches.find(([key]) => key === productKeyHint);
    if (match) return { ...match[1], key: match[0] };
  }
  // Default to resist sticker config for backward compatibility
  const resistMatch = matches.find(([key]) =>
    ['individual', 'threePack', 'fivePack'].includes(key)
  );
  return resistMatch ? { ...resistMatch[1], key: resistMatch[0] } : { ...matches[0][1], key: matches[0][0] };
}

/**
 * Get display name for a product from its SKU
 * @param {string} sku - Product SKU (e.g. RESIST-STICKER-001, TACO-STICKER-003)
 * @returns {string} Human-readable product name
 */
export function getProductDisplayName(sku) {
  if (!sku) return 'Vinyl Sticker';
  if (sku.startsWith('TACO-STICKER')) return 'Trump TACO Vinyl Sticker';
  if (sku.startsWith('GADSDEN-STICKER')) return 'Gadsden Parody Sticker';
  if (sku.startsWith('RESIST-STICKER')) return 'I AM [RESIST] Vinyl Sticker';
  if (sku.startsWith('ALL-MAD-STICKER')) return 'All Mad Here Vinyl Sticker';
  return 'Vinyl Sticker';
}

// Legacy support - keep for backward compatibility
export const STICKER_PRODUCT = {
  printifyProductId: process.env.PRINTIFY_PRODUCT_ID || '',
  sku: 'RESIST-STICKER-001',
  image: `${(siteEnv.BASE_URL || 'https://www.iamresist.org').replace(/\/$/, '')}/resist_sticker.png`,
};

/**
 * Create a Stripe Checkout session for cart (mix-and-match)
 * Uses price_data for a single line item with calculated total
 * @param {Object} options
 * @param {number} options.totalCents - Subtotal + shipping in cents
 * @param {boolean} options.freeShipping - Whether shipping is free
 * @param {Array<{productName?: string, quantity: number}>} [options.cartItems] - Cart items for display summary
 * @param {string} options.cartSnapshotId - UUID referencing checkout_cart_snapshots.cart_json
 * @param {string} options.successUrl
 * @param {string} options.cancelUrl
 * @param {string} [options.imageUrl] - Product image for Stripe display
 * @returns {Promise<Stripe.Checkout.Session>}
 */
export async function createCheckoutSessionForCart({
  subtotalCents,
  freeShipping,
  cartItems = [],
  cartSnapshotId,
  successUrl,
  cancelUrl,
  imageUrl,
}) {
  if (!subtotalCents || subtotalCents < 1) {
    throw new Error('Invalid cart subtotal');
  }
  if (!cartSnapshotId || typeof cartSnapshotId !== 'string') {
    throw new Error('cartSnapshotId is required');
  }
  if (!UUID_V4ISH_RE.test(cartSnapshotId)) {
    throw new Error('cartSnapshotId must be a UUID');
  }

  const baseUrl = siteEnv.BASE_URL?.replace(/\/$/, '') || 'https://www.iamresist.org';
  const img = imageUrl || `${baseUrl}/resist_sticker.png`;
  const normalizedItems = Array.isArray(cartItems)
    ? cartItems
        .filter((item) => item && Number.isInteger(item.quantity) && item.quantity > 0)
        .map((item) => ({
          productName: typeof item.productName === 'string' && item.productName.trim()
            ? item.productName.trim()
            : 'Vinyl Sticker',
          quantity: item.quantity,
        }))
    : [];
  const totalQuantity = normalizedItems.reduce((sum, item) => sum + item.quantity, 0);
  const displayName = totalQuantity > 0
    ? `${totalQuantity} Vinyl ${totalQuantity === 1 ? 'Sticker' : 'Stickers'} (Mixed)`
    : 'Mixed Vinyl Stickers';
  const displayDescription = normalizedItems.length > 0
    ? normalizedItems
        .map((item) => `${item.quantity}x ${item.productName}`)
        .join(', ')
        .slice(0, 500)
    : 'Premium die-cut vinyl stickers';

  const shippingOptions = [
    {
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: {
          amount: freeShipping ? 0 : 400,
          currency: 'usd',
        },
        display_name: freeShipping ? 'Free Shipping' : 'Standard Shipping',
        delivery_estimate: {
          minimum: { unit: 'business_day', value: 5 },
          maximum: { unit: 'business_day', value: 10 },
        },
      },
    },
  ];

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: displayName,
            description: displayDescription,
            images: [img],
          },
          unit_amount: subtotalCents,
        },
        quantity: 1,
      },
    ],
    shipping_address_collection: {
      allowed_countries: ['US', 'CA'],
    },
    shipping_options: shippingOptions,
    metadata: {
      cart_snapshot_id: cartSnapshotId,
      is_cart_checkout: 'true',
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return session;
}

/**
 * Create a Stripe Checkout session using a Price ID (legacy single-product)
 * @param {Object} options
 * @param {string} options.priceId - Stripe Price ID (price_...)
 * @param {string} options.successUrl - Redirect URL after successful payment
 * @param {string} options.cancelUrl - Redirect URL if user cancels
 * @returns {Promise<Stripe.Checkout.Session>}
 */
export async function createCheckoutSession({ priceId, successUrl, cancelUrl }) {
  if (!priceId) {
    throw new Error('Price ID is required');
  }

  // Get product configuration for this Price ID
  const productConfig = getProductByPriceId(priceId);

  if (!productConfig) {
    throw new Error(`Product configuration not found for Price ID: ${priceId}`);
  }

  // Build shipping options based on product config
  const shippingOptions = [];

  if (productConfig.freeShipping) {
    // Free shipping option (for 3-pack and 5-pack)
    shippingOptions.push({
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: {
          amount: 0,
          currency: 'usd',
        },
        display_name: 'Free Shipping',
        delivery_estimate: {
          minimum: {
            unit: 'business_day',
            value: 5,
          },
          maximum: {
            unit: 'business_day',
            value: 10,
          },
        },
      },
    });
  } else {
    // Paid shipping option (for individual - $4.00)
    shippingOptions.push({
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: {
          amount: 400, // $4.00 shipping for individual sticker
          currency: 'usd',
        },
        display_name: 'Standard Shipping',
        delivery_estimate: {
          minimum: {
            unit: 'business_day',
            value: 5,
          },
          maximum: {
            unit: 'business_day',
            value: 10,
          },
        },
      },
    });
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId, // Use Price ID from Stripe product
        quantity: 1, // Always 1, since each product is a separate SKU
      },
    ],
    // Collect shipping address
    shipping_address_collection: {
      allowed_countries: ['US', 'CA'], // Add more countries as needed
    },
    // Shipping options (conditional based on product)
    shipping_options: shippingOptions,
    // Metadata for order tracking and Printify fulfillment
    metadata: {
      product_sku: productConfig.sku,
      printify_product_id: productConfig.printifyProductId,
      printify_quantity: productConfig.quantity.toString(),
      product_key: productConfig.key || '',
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return session;
}

/**
 * Retrieve a checkout session with expanded line items
 * @param {string} sessionId - Stripe session ID
 */
export async function getCheckoutSession(sessionId) {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe is not configured');
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['line_items', 'payment_intent'],
  });
}

/**
 * Verify Stripe webhook signature
 * @param {string} payload - Raw request body
 * @param {string} signature - Stripe-Signature header
 * @returns {Stripe.Event}
 */
export function constructWebhookEvent(payload, signature) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    throw new Error('Missing required env var: STRIPE_WEBHOOK_SECRET');
  }
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

/**
 * Format amount from cents to display string
 */
export function formatPrice(amountInCents, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amountInCents / 100);
}
