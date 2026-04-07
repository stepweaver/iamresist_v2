/**
 * Server-side cart validation and normalization for POST /api/checkout
 */

import { getProductByKey } from '@/lib/stripe';
import {
  MAX_CART_LINES,
  MAX_LINE_ITEM_QUANTITY,
  MAX_CART_TOTAL_QUANTITY,
} from '@/lib/constants/shopLimits';

const ALLOWED_ITEM_KEYS = new Set(['slug', 'productKey', 'quantity']);

/**
 * @param {unknown} body
 * @returns {{ ok: true, items: Array<{slug:string,productKey:string,quantity:number,printifyProductId:string,sku:string,productName:string}>} | { ok: false, error: string }}
 */
export function validateAndNormalizeCart(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body' };
  }
  const { cart } = body;
  if (!Array.isArray(cart) || cart.length === 0) {
    return { ok: false, error: 'Cart is required and must not be empty' };
  }
  if (cart.length > MAX_CART_LINES) {
    return { ok: false, error: `Cart may not exceed ${MAX_CART_LINES} distinct products` };
  }

  const merged = new Map();

  for (let i = 0; i < cart.length; i++) {
    const item = cart[i];
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'Each cart item must be an object' };
    }
    const keys = Object.keys(item);
    for (const k of keys) {
      if (!ALLOWED_ITEM_KEYS.has(k)) {
        return { ok: false, error: `Unknown field on cart item: ${k}` };
      }
    }

    const { slug, productKey, quantity } = item;
    if (typeof slug !== 'string' || !slug.trim()) {
      return { ok: false, error: 'Each item needs a non-empty slug' };
    }
    if (typeof productKey !== 'string' || !productKey.trim()) {
      return { ok: false, error: 'Each item needs a non-empty productKey' };
    }
    if (typeof quantity !== 'number' || !Number.isInteger(quantity)) {
      return { ok: false, error: 'Quantity must be an integer' };
    }
    if (quantity < 1 || quantity > MAX_LINE_ITEM_QUANTITY) {
      return { ok: false, error: `Quantity must be between 1 and ${MAX_LINE_ITEM_QUANTITY}` };
    }

    const config = getProductByKey(productKey);
    if (!config) {
      return { ok: false, error: `Invalid product key: ${productKey}` };
    }
    if (config.productSlug && config.productSlug !== slug.trim()) {
      return { ok: false, error: `Slug mismatch for productKey: ${productKey}` };
    }

    const key = productKey.trim();
    const prev = merged.get(key);
    const nextQty = (prev?.quantity ?? 0) + quantity;
    if (nextQty > MAX_LINE_ITEM_QUANTITY) {
      return { ok: false, error: `Combined quantity for ${productKey} exceeds ${MAX_LINE_ITEM_QUANTITY}` };
    }
    merged.set(key, {
      slug: slug.trim(),
      productKey: key,
      quantity: nextQty,
      printifyProductId: config.printifyProductId,
      sku: config.sku,
      productName: config.productName,
    });
  }

  const items = Array.from(merged.values()).sort((a, b) => {
    const pk = a.productKey.localeCompare(b.productKey);
    if (pk !== 0) return pk;
    return a.slug.localeCompare(b.slug);
  });

  const totalQty = items.reduce((s, x) => s + x.quantity, 0);
  if (totalQty > MAX_CART_TOTAL_QUANTITY) {
    return { ok: false, error: `Cart total quantity may not exceed ${MAX_CART_TOTAL_QUANTITY}` };
  }

  return { ok: true, items };
}
