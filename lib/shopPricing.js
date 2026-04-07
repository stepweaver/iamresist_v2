/**
 * Volume-tier pricing for mix-and-match sticker cart
 * Same as bundle pricing: 1=$6, 2=$12, 3=$14, 4=$20, 5=$20
 * 6+: greedy decomposition (5-packs, then 3-packs, then individuals)
 */

const TIER_CENTS = { 1: 600, 2: 1200, 3: 1400, 4: 2000, 5: 2000 };

export function getSubtotalCents(totalQuantity) {
  if (totalQuantity <= 0) return 0;
  let cents = 0;
  let q = totalQuantity;
  while (q >= 5) {
    cents += 2000;
    q -= 5;
  }
  if (q > 0) cents += TIER_CENTS[q];
  return cents;
}

export function getShippingCents(totalQuantity) {
  return totalQuantity >= 3 ? 0 : 400;
}

export function getTotalCents(totalQuantity) {
  return getSubtotalCents(totalQuantity) + getShippingCents(totalQuantity);
}

export function qualifiesForFreeShipping(totalQuantity) {
  return totalQuantity >= 3;
}
