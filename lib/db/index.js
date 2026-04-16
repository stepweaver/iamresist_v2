/**
 * Database client for Supabase Postgres
 * Handles order storage and retrieval.
 */

import "server-only";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export class OrderTransitionConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "OrderTransitionConflictError";
    this.code = "ORDER_TRANSITION_CONFLICT";
    this.details = details;
  }
}

export class OrderNotFoundError extends Error {
  constructor(orderId) {
    super(`Order not found: ${orderId}`);
    this.name = "OrderNotFoundError";
    this.code = "ORDER_NOT_FOUND";
    this.orderId = orderId;
  }
}

export function getSupabase() {
  return supabaseAdmin();
}

async function retryOperation(operation, maxRetries = 3, initialDelay = 100) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error.code === '23505' || error.code === '23503') {
        throw error;
      }
      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Minimal read to keep Supabase project active (used by cron keep-alive).
 * Throws on error so the caller can return 500.
 */
export async function ping() {
  const supabase = getSupabase();
  const { error } = await supabase.from('orders').select('id').limit(1);
  if (error) throw error;
}

export async function createOrder({
  stripeSessionId,
  stripePaymentIntent,
  customerEmail,
  shippingAddress,
  productSku,
  quantity,
  amountTotal,
  fulfillmentProvider = 'printify',
  lineItems,
}) {
  const supabase = getSupabase();
  const insertData = {
    stripe_session_id: stripeSessionId,
    stripe_payment_intent: stripePaymentIntent,
    customer_email: customerEmail,
    shipping_name: shippingAddress?.name ?? null,
    shipping_address_line1: shippingAddress?.line1 ?? null,
    shipping_address_line2: shippingAddress?.line2 ?? null,
    shipping_city: shippingAddress?.city ?? null,
    shipping_state: shippingAddress?.state ?? null,
    shipping_postal_code: shippingAddress?.postal_code ?? null,
    shipping_country: shippingAddress?.country ?? null,
    product_sku: productSku ?? (lineItems ? 'MIXED' : null),
    quantity: quantity ?? (lineItems ? lineItems.reduce((s, i) => s + i.quantity, 0) : 1),
    amount_total: amountTotal,
    fulfillment_provider: fulfillmentProvider,
    fulfillment_status: 'pending',
  };
  if (lineItems && lineItems.length > 0) {
    insertData.line_items = lineItems;
  }
  const result = await retryOperation(async () => {
    const { data, error } = await supabase
      .from('orders')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;
    return { rows: [data] };
  });
  return result.rows[0];
}

export async function getOrderByStripeSession(stripeSessionId) {
  const supabase = getSupabase();
  const result = await retryOperation(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('stripe_session_id', stripeSessionId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return { rows: data ? [data] : [] };
  });
  return result.rows[0] ?? null;
}

/**
 * @returns {Promise<object|null>} Order row or null if not found
 * @throws On database/infrastructure errors (distinct from not found)
 */
export async function getOrderById(orderId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (error) throw new Error(`getOrderById failed: ${error.message}`);
  return data ?? null;
}

export async function getOrderByFulfillmentOrderId(fulfillmentOrderId) {
  if (fulfillmentOrderId == null || fulfillmentOrderId === '') return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('fulfillment_order_id', String(fulfillmentOrderId))
    .maybeSingle();

  if (error) throw new Error(`getOrderByFulfillmentOrderId failed: ${error.message}`);
  return data ?? null;
}

export async function insertCartSnapshot(cartJson) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('checkout_cart_snapshots')
    .insert({ cart_json: cartJson })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function getCartSnapshot(snapshotId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('checkout_cart_snapshots')
    .select('cart_json')
    .eq('id', snapshotId)
    .maybeSingle();
  if (error) throw new Error(`getCartSnapshot failed: ${error.message}`);
  return data?.cart_json ?? null;
}

export async function deleteCartSnapshot(snapshotId) {
  const supabase = getSupabase();
  const { error } = await supabase.from('checkout_cart_snapshots').delete().eq('id', snapshotId);
  if (error) throw error;
}

export async function markEmailSent(orderId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('orders')
    .update({
      email_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markFulfillmentFailed(orderId, message) {
  const now = new Date().toISOString();
  return updateOrderFulfillment(orderId, {
    fulfillmentStatus: 'fulfillment_failed',
    fulfillmentLastError: message ? String(message).slice(0, 2000) : null,
    fulfillmentLastErrorAt: now,
    fulfillmentInflight: false,
  });
}

export async function updateOrderFulfillment(orderId, {
  fulfillmentOrderId,
  fulfillmentStatus,
  trackingNumber,
  trackingUrl,
  fulfillmentLastError,
  fulfillmentLastErrorAt,
  fulfillmentInflight,
  shipmentEmailSentAt,
  expectedFromStatuses,
}) {
  const current = await getOrderById(orderId);
  if (!current) throw new OrderNotFoundError(orderId);
  if (
    Array.isArray(expectedFromStatuses) &&
    expectedFromStatuses.length > 0 &&
    !expectedFromStatuses.includes(current.fulfillment_status)
  ) {
    throw new OrderTransitionConflictError('Invalid fulfillment transition', {
      orderId,
      from: current.fulfillment_status,
      expectedFromStatuses,
    });
  }

  const supabase = getSupabase();
  const updateData = {
    updated_at: new Date().toISOString(),
  };
  if (fulfillmentOrderId !== undefined) updateData.fulfillment_order_id = fulfillmentOrderId;
  if (fulfillmentStatus !== undefined) updateData.fulfillment_status = fulfillmentStatus;
  if (trackingNumber !== undefined) updateData.tracking_number = trackingNumber;
  if (trackingUrl !== undefined) updateData.tracking_url = trackingUrl;
  if (fulfillmentLastError !== undefined) updateData.fulfillment_last_error = fulfillmentLastError;
  if (fulfillmentLastErrorAt !== undefined) updateData.fulfillment_last_error_at = fulfillmentLastErrorAt;
  if (fulfillmentInflight !== undefined) updateData.fulfillment_inflight = fulfillmentInflight;
  if (shipmentEmailSentAt !== undefined) updateData.shipment_email_sent_at = shipmentEmailSentAt;

  let query = supabase.from('orders').update(updateData).eq('id', orderId);
  if (Array.isArray(expectedFromStatuses) && expectedFromStatuses.length > 0) {
    query = query.in('fulfillment_status', expectedFromStatuses);
  }
  const { data, error } = await query.select().maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new OrderTransitionConflictError('Fulfillment update race/conflict', {
      orderId,
      expectedFromStatuses,
    });
  }
  return data;
}

/**
 * @returns {Promise<object|null>} Updated row or null if no order matched fulfillment id
 */
export async function updateOrderByFulfillmentId(fulfillmentOrderId, {
  fulfillmentStatus,
  trackingNumber,
  trackingUrl,
}) {
  const updateData = {
    updated_at: new Date().toISOString(),
  };
  if (fulfillmentStatus !== undefined) updateData.fulfillment_status = fulfillmentStatus;
  if (trackingNumber !== undefined) updateData.tracking_number = trackingNumber;
  if (trackingUrl !== undefined) updateData.tracking_url = trackingUrl;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('orders')
    .update(updateData)
    .eq('fulfillment_order_id', fulfillmentOrderId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/**
 * Acquire fulfillment processing lock for retry-safe orchestration.
 * Returns null on transition conflict.
 */
export async function beginFulfillmentAttempt(orderId) {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('orders')
    .update({
      fulfillment_inflight: true,
      fulfillment_last_attempt_at: now,
      updated_at: now,
    })
    .eq('id', orderId)
    .eq('fulfillment_inflight', false)
    .in('fulfillment_status', ['pending', 'fulfillment_failed', 'paid', 'email_sent'])
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { data: bumped, error: bumpError } = await supabase
    .from('orders')
    .update({
      fulfillment_attempt_count: (data.fulfillment_attempt_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select()
    .single();
  if (bumpError) throw bumpError;
  return bumped;
}

export async function markShipmentEmailSent(orderId) {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('orders')
    .update({
      shipment_email_sent_at: now,
      updated_at: now,
    })
    .eq('id', orderId)
    .is('shipment_email_sent_at', null)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * Subscribers (Resistance Brief) — minimal owned-audience layer.
 */

export async function upsertPendingSubscriber({
  email,
  source,
  consentVersion,
  consentText,
  signupIpHash,
  userAgent,
}) {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const insertData = {
    email: String(email).trim().toLowerCase(),
    status: 'pending',
    source: source ?? null,
    consent_version: consentVersion ?? null,
    consent_text: consentText ?? null,
    signup_ip_hash: signupIpHash ?? null,
    user_agent: userAgent ?? null,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('subscribers')
    .upsert(insertData, { onConflict: 'email' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function confirmSubscriber({
  email,
  confirmedIpHash,
}) {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('subscribers')
    .update({
      status: 'active',
      confirmed_at: now,
      confirmed_ip_hash: confirmedIpHash ?? null,
      updated_at: now,
    })
    .eq('email', String(email).trim().toLowerCase())
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}
