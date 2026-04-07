/** Shared limits for checkout validation and Printify payloads (keep in sync). */

export const MAX_CART_LINES = 20;
export const MAX_LINE_ITEM_QUANTITY = 99;
export const MAX_CART_TOTAL_QUANTITY = 200;
/** Stripe metadata values max 500 chars; we store a snapshot UUID instead of raw JSON. */
export const STRIPE_METADATA_MAX_LENGTH = 500;
