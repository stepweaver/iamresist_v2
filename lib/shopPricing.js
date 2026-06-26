/**
 * Volume-tier pricing for mix-and-match sticker cart.
 *
 * Standard stickers ($6 base): 1=$6, 2=$12, 3=$14, 4=$20, 5=$20
 * Bumper stickers ($10 base):   1=$10, 2=$20, 3=$24, 4=$34, 5=$36
 *
 * Each category prices independently; shipping is based on combined quantity.
 */

const STANDARD_TIER_CENTS = { 1: 600, 2: 1200, 3: 1400, 4: 2000, 5: 2000 };
const BUMPER_TIER_CENTS   = { 1: 1000, 2: 2000, 3: 2400, 4: 3400, 5: 3600 };

const STANDARD_FIVE_PACK_CENTS = 2000;
const BUMPER_FIVE_PACK_CENTS   = 3600;

const BUMPER_PRODUCT_KEYS = new Set([
  'antifaIndividual',
  'antifaThreePack',
  'antifaFivePack',
]);

function isBumperItem(item) {
  return BUMPER_PRODUCT_KEYS.has(item.productKey);
}

function tieredCents(quantity, tierCents, fivePackCents) {
  if (quantity <= 0) return 0;
  let cents = 0;
  let q = quantity;
  while (q >= 5) {
    cents += fivePackCents;
    q -= 5;
  }
  if (q > 0) cents += tierCents[q];
  return cents;
}

/**
 * Calculate cart subtotal in cents.
 *
 * Pass an array of cart items `[{ productKey, quantity }]` for product-aware
 * pricing (bumper stickers priced at $10-tier, standard at $6-tier).
 * Passing a plain number is supported as a legacy fallback (assumes all
 * standard stickers — matches the old behavior exactly).
 */
export function getSubtotalCents(cartItems) {
  if (typeof cartItems === 'number') {
    return tieredCents(cartItems, STANDARD_TIER_CENTS, STANDARD_FIVE_PACK_CENTS);
  }
  const standardQty = cartItems
    .filter((i) => !isBumperItem(i))
    .reduce((sum, i) => sum + i.quantity, 0);
  const bumperQty = cartItems
    .filter((i) => isBumperItem(i))
    .reduce((sum, i) => sum + i.quantity, 0);
  return (
    tieredCents(standardQty, STANDARD_TIER_CENTS, STANDARD_FIVE_PACK_CENTS) +
    tieredCents(bumperQty, BUMPER_TIER_CENTS, BUMPER_FIVE_PACK_CENTS)
  );
}

export function getShippingCents(totalQuantity) {
  return totalQuantity >= 3 ? 0 : 400;
}

export function getTotalCents(cartItems, totalQuantity) {
  // Legacy: getTotalCents(number) — assumes all standard stickers
  if (typeof cartItems === 'number') {
    return getSubtotalCents(cartItems) + getShippingCents(cartItems);
  }
  return getSubtotalCents(cartItems) + getShippingCents(totalQuantity);
}

export function qualifiesForFreeShipping(totalQuantity) {
  return totalQuantity >= 3;
}
