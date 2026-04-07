/**
 * Stripe checkout.session.completed → DB order, email, Printify orchestration
 */

import "server-only";
import {
  getCheckoutSession,
  STICKER_PRODUCT,
  getProductByKey,
  getProductByPriceId,
  getProductByUnitAmount,
  getProductDisplayName,
  getProductBySku,
} from '@/lib/stripe';
import {
  createOrder,
  updateOrderFulfillment,
  getOrderByStripeSession,
  getCartSnapshot,
  deleteCartSnapshot,
  markEmailSent,
  markFulfillmentFailed,
  beginFulfillmentAttempt,
  OrderTransitionConflictError,
} from '@/lib/db';
import { PrintifyProvider } from '@/lib/fulfillment/printify';
import { sendOrderConfirmation } from '@/lib/email';

function buildShippingAddr(shippingDetails) {
  const shippingAddress = shippingDetails?.address;
  if (!shippingAddress) return null;
  return {
    name: shippingDetails.name,
    line1: shippingAddress.line1,
    line2: shippingAddress.line2,
    city: shippingAddress.city,
    state: shippingAddress.state,
    postal_code: shippingAddress.postal_code,
    country: shippingAddress.country,
  };
}

async function loadCartLineItemsFromSession(fullSession) {
  const meta = fullSession.metadata || {};
  if (meta.cart_snapshot_id) {
    const raw = await getCartSnapshot(meta.cart_snapshot_id);
    if (raw == null) return { items: [], snapshotId: meta.cart_snapshot_id };
    const arr = Array.isArray(raw) ? raw : [];
    return { items: arr, snapshotId: meta.cart_snapshot_id };
  }
  if (meta.cart_json) {
    try {
      const parsed = JSON.parse(meta.cart_json);
      return { items: Array.isArray(parsed) ? parsed : [], snapshotId: null };
    } catch {
      return { items: [], snapshotId: null };
    }
  }
  return { items: [], snapshotId: null };
}

function lineItemsFromOrderRow(order) {
  const raw = order.line_items;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((i) => ({
    slug: i.slug,
    sku: i.sku,
    printifyProductId: i.printify_product_id,
    quantity: i.quantity,
    productName: i.product_name,
  }));
}

function buildProductInfoForEmail(order, fullSession) {
  const lineItems = lineItemsFromOrderRow(order);
  if (lineItems.length > 0) {
    return {
      lineItems: lineItems.map((i) => ({ name: i.productName, quantity: i.quantity })),
    };
  }
  const sku = order.product_sku || STICKER_PRODUCT.sku;
  const name =
    getProductBySku(sku)?.productName ||
    getProductDisplayName(sku);
  return {
    name,
    description: name || 'Premium die-cut vinyl sticker',
  };
}

async function trySendConfirmationEmail(order, _fullSession) {
  if (order.email_sent_at) return;
  try {
    const productInfo = buildProductInfoForEmail(order, _fullSession);
    const emailResult = await sendOrderConfirmation(order, productInfo);
    if (emailResult?.success) {
      await markEmailSent(order.id);
      console.log('Order confirmation email sent:', emailResult.emailId);
    }
  } catch (e) {
    console.error('Order confirmation email failed:', e);
  }
}

function fulfillmentIsComplete(status) {
  return ['submitted', 'in_production', 'shipped', 'delivered'].includes(status);
}

async function tryFulfillOrder(order, fullSession, session) {
  const status = order.fulfillment_status || 'pending';
  const fid = order.fulfillment_order_id;

  if (['shipped', 'delivered', 'cancelled'].includes(status)) return;
  if (fid && fulfillmentIsComplete(status)) return;

  const lock = await beginFulfillmentAttempt(order.id);
  if (!lock) return;

  const printify = new PrintifyProvider();
  const shippingDetails = fullSession.shipping_details;
  const addr = buildShippingAddr(shippingDetails);
  try {

  if (fid) {
    const retry = await printify.retrySendToProduction(fid);
    if (retry.success) {
      await updateOrderFulfillment(order.id, {
        fulfillmentStatus: 'submitted',
        fulfillmentLastError: null,
        fulfillmentLastErrorAt: null,
        fulfillmentInflight: false,
      });
      console.log('Printify send_to_production retry succeeded:', fid);
    } else {
      await markFulfillmentFailed(order.id, formatProviderError(retry.error, retry.providerError));
    }
    return;
  }

  const existingExternal = await printify.findOrderByExternalId(order.id);
  if (existingExternal) {
    const retry = await printify.retrySendToProduction(existingExternal);
    if (retry.success) {
      await updateOrderFulfillment(order.id, {
        fulfillmentOrderId: existingExternal,
        fulfillmentStatus: 'submitted',
        fulfillmentLastError: null,
        fulfillmentLastErrorAt: null,
        fulfillmentInflight: false,
      });
    } else {
      await markFulfillmentFailed(order.id, formatProviderError(retry.error, retry.providerError));
    }
    return;
  }

  const isCartCheckout = fullSession.metadata?.is_cart_checkout === 'true';
  let cartLineItems = [];
  let snapshotId = null;
  if (isCartCheckout) {
    const loaded = await loadCartLineItemsFromSession(fullSession);
    cartLineItems = loaded.items;
    snapshotId = loaded.snapshotId;
    if (cartLineItems.length === 0) {
      cartLineItems = lineItemsFromOrderRow(order);
    }
  }

  if (isCartCheckout && cartLineItems.length > 0) {
    const hasPrintify = cartLineItems.some((i) => i.printifyProductId);
    if (!hasPrintify) {
      console.error('No Printify product IDs in cart - order not submitted to fulfillment');
      await updateOrderFulfillment(order.id, { fulfillmentStatus: 'pending', fulfillmentInflight: false });
      return;
    }
    const result = await printify.createOrder({
      orderId: order.id,
      shippingAddress: { ...addr, name: shippingDetails?.name },
      customerEmail: session.customer_details?.email || order.customer_email,
      lineItems: cartLineItems.map((i) => ({
        printifyProductId: i.printifyProductId,
        quantity: i.quantity,
      })),
    });
    await applyPrintifyResult(order.id, result);
    if (snapshotId && result.success) {
      try {
        await deleteCartSnapshot(snapshotId);
      } catch (e) {
        console.warn('deleteCartSnapshot:', e.message);
      }
    }
    return;
  }

  const lineItem = fullSession.line_items?.data?.[0];
  let productConfig = null;
  if (lineItem?.price?.id) {
    productConfig = getProductByPriceId(lineItem.price.id);
    const unitAmount = lineItem.price?.unit_amount;
    if (
      productConfig?.unitAmountCents != null &&
      unitAmount != null &&
      productConfig.unitAmountCents !== unitAmount
    ) {
      productConfig = getProductByUnitAmount(unitAmount, fullSession.metadata?.product_key) ?? productConfig;
    }
  }
  if (!productConfig && fullSession.metadata?.product_key) {
    productConfig = getProductByKey(fullSession.metadata.product_key);
  }
  if (!productConfig && lineItem?.price?.unit_amount) {
    productConfig = getProductByUnitAmount(
      lineItem.price.unit_amount,
      fullSession.metadata?.product_key
    );
  }
  if (!productConfig && order.product_sku) {
    productConfig = getProductBySku(order.product_sku);
  }

  const productSku =
    productConfig?.sku || fullSession.metadata?.product_sku || order.product_sku || STICKER_PRODUCT.sku;
  const quantity =
    productConfig?.quantity ??
    order.quantity ??
    parseInt(fullSession.metadata?.printify_quantity || '1', 10);

  const printifyProductId =
    fullSession.metadata?.printify_product_id ||
    productConfig?.printifyProductId ||
    STICKER_PRODUCT.printifyProductId;

  if (!printifyProductId) {
    console.error('No Printify product ID - order not submitted to fulfillment');
    await updateOrderFulfillment(order.id, { fulfillmentStatus: 'pending', fulfillmentInflight: false });
    return;
  }

  const result = await printify.createOrder({
    orderId: order.id,
    shippingAddress: { ...addr, name: shippingDetails?.name },
    productSku: printifyProductId,
    quantity,
    customerEmail: session.customer_details?.email || order.customer_email,
  });
  await applyPrintifyResult(order.id, result);
  } catch (error) {
    await markFulfillmentFailed(order.id, formatProviderError(error.message || 'fulfillment_error'));
  }
}

async function applyPrintifyResult(orderId, result) {
  if (result.success) {
    await updateOrderFulfillment(orderId, {
      fulfillmentOrderId: result.externalOrderId,
      fulfillmentStatus: 'submitted',
      fulfillmentLastError: null,
      fulfillmentLastErrorAt: null,
      fulfillmentInflight: false,
    });
    console.log('Order submitted to Printify:', result.externalOrderId);
    return;
  }
  if (result.partial && result.externalOrderId) {
    await updateOrderFulfillment(orderId, {
      fulfillmentOrderId: result.externalOrderId,
      fulfillmentStatus: 'fulfillment_failed',
      fulfillmentLastError: formatProviderError(result.error || 'send_to_production failed', result.providerError),
      fulfillmentLastErrorAt: new Date().toISOString(),
      fulfillmentInflight: false,
    });
    console.error('Printify partial success (order created, production failed):', result.error);
    return;
  }
  console.error('Printify createOrder failed:', result.error);
  await markFulfillmentFailed(orderId, formatProviderError(result.error || 'Printify createOrder failed', result.providerError));
}

function formatProviderError(message, providerError) {
  if (!providerError) return String(message || 'provider_error');
  return JSON.stringify({
    message: message || providerError.message || 'provider_error',
    status: providerError.status ?? null,
    retryable: providerError.retryable === true,
    responseBody: providerError.responseBody ?? null,
  });
}

async function reconcileExistingOrder(order, fullSession, session) {
  await trySendConfirmationEmail(order, fullSession);
  await tryFulfillOrder(order, fullSession, session);
}

async function createCartOrder(session, fullSession, addr, cartLineItems, snapshotId) {
  const shippingDetails = fullSession.shipping_details;
  const dbLineItems = cartLineItems.map((i) => ({
    slug: i.slug,
    sku: i.sku,
    printify_product_id: i.printifyProductId,
    quantity: i.quantity,
    product_name: i.productName,
  }));

  const order = await createOrder({
    stripeSessionId: session.id,
    stripePaymentIntent: session.payment_intent,
    customerEmail: session.customer_details?.email,
    shippingAddress: addr,
    productSku: 'MIXED',
    quantity: cartLineItems.reduce((s, i) => s + i.quantity, 0),
    amountTotal: session.amount_total,
    fulfillmentProvider: 'printify',
    lineItems: dbLineItems,
  });

  if (snapshotId) {
    try {
      await deleteCartSnapshot(snapshotId);
    } catch (e) {
      console.warn('deleteCartSnapshot after create:', e.message);
    }
  }

  await trySendConfirmationEmail(order, fullSession);

  const printify = new PrintifyProvider();
  const hasPrintify = cartLineItems.some((i) => i.printifyProductId);
  if (!hasPrintify) {
    console.error('No Printify product IDs in cart - order not submitted to fulfillment');
    await updateOrderFulfillment(order.id, { fulfillmentStatus: 'pending' });
    return;
  }

  const result = await printify.createOrder({
    orderId: order.id,
    shippingAddress: { ...addr, name: shippingDetails?.name },
    customerEmail: session.customer_details?.email,
    lineItems: cartLineItems.map((i) => ({
      printifyProductId: i.printifyProductId,
      quantity: i.quantity,
    })),
  });
  await applyPrintifyResult(order.id, result);
}

async function createSingleProductOrder(session, fullSession, addr) {
  const lineItem = fullSession.line_items?.data?.[0];
  let productConfig = null;
  if (lineItem?.price?.id) {
    productConfig = getProductByPriceId(lineItem.price.id);
    const unitAmount = lineItem.price?.unit_amount;
    if (
      productConfig?.unitAmountCents != null &&
      unitAmount != null &&
      productConfig.unitAmountCents !== unitAmount
    ) {
      productConfig = getProductByUnitAmount(unitAmount, fullSession.metadata?.product_key) ?? productConfig;
    }
  }
  if (!productConfig && fullSession.metadata?.product_key) {
    productConfig = getProductByKey(fullSession.metadata.product_key);
  }
  if (!productConfig && lineItem?.price?.unit_amount) {
    productConfig = getProductByUnitAmount(
      lineItem.price.unit_amount,
      fullSession.metadata?.product_key
    );
  }

  const productSku =
    productConfig?.sku || fullSession.metadata?.product_sku || STICKER_PRODUCT.sku;
  const quantity =
    productConfig?.quantity ?? parseInt(fullSession.metadata?.printify_quantity || '1', 10);

  const order = await createOrder({
    stripeSessionId: session.id,
    stripePaymentIntent: session.payment_intent,
    customerEmail: session.customer_details?.email,
    shippingAddress: addr,
    productSku,
    quantity,
    amountTotal: session.amount_total,
    fulfillmentProvider: 'printify',
  });

  await trySendConfirmationEmail(order, fullSession);

  const printifyProductId =
    fullSession.metadata?.printify_product_id ||
    productConfig?.printifyProductId ||
    STICKER_PRODUCT.printifyProductId;

  if (!printifyProductId) {
    console.error('No Printify product ID - order not submitted to fulfillment');
    await updateOrderFulfillment(order.id, { fulfillmentStatus: 'pending' });
    return;
  }

  const shippingDetails = fullSession.shipping_details;
  const printify = new PrintifyProvider();
  const result = await printify.createOrder({
    orderId: order.id,
    shippingAddress: { ...addr, name: shippingDetails?.name },
    productSku: printifyProductId,
    quantity,
    customerEmail: session.customer_details?.email,
  });
  await applyPrintifyResult(order.id, result);
}

async function createNewOrderFromSession(session, fullSession) {
  const shippingDetails = fullSession.shipping_details;
  const addr = buildShippingAddr(shippingDetails);

  const isCartCheckout = fullSession.metadata?.is_cart_checkout === 'true';
  if (isCartCheckout) {
    const { items: cartLineItems, snapshotId } = await loadCartLineItemsFromSession(fullSession);
    if (cartLineItems.length > 0) {
      await createCartOrder(session, fullSession, addr, cartLineItems, snapshotId);
      return;
    }
  }

  await createSingleProductOrder(session, fullSession, addr);
}

/**
 * @param {import('stripe').Stripe.Checkout.Session} session - Webhook payload session object
 */
export async function processStripeCheckoutSessionCompleted(session) {
  const fullSession = await getCheckoutSession(session.id);
  const existing = await getOrderByStripeSession(session.id);
  if (existing) {
    await reconcileExistingOrder(existing, fullSession, session);
    return;
  }

  try {
    await createNewOrderFromSession(session, fullSession);
  } catch (e) {
    if (e instanceof OrderTransitionConflictError) return;
    if (e.code === '23505') {
      const row = await getOrderByStripeSession(session.id);
      if (row) {
        await reconcileExistingOrder(row, fullSession, session);
        return;
      }
    }
    throw e;
  }
}
