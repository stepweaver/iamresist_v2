import 'server-only';

function opt(name, fallback = '') {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') return fallback;
  return String(v).trim();
}

/**
 * Commerce env. Stripe keys are optional at module load so `next build` can run without them;
 * checkout/webhook fail at runtime with clear errors if missing.
 */
export const shopEnv = {
  STRIPE_SECRET_KEY: opt('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: opt('STRIPE_WEBHOOK_SECRET'),
  RESEND_API_KEY: opt('RESEND_API_KEY'),
  ORDER_FROM_EMAIL: opt('ORDER_FROM_EMAIL', 'onboarding@resend.dev'),
  ORDER_FROM_NAME: opt('ORDER_FROM_NAME', 'I AM [RESIST]'),
  // Resistance Brief (owned audience MVP)
  BRIEF_FROM_EMAIL: opt('BRIEF_FROM_EMAIL', opt('ORDER_FROM_EMAIL', 'onboarding@resend.dev')),
  BRIEF_FROM_NAME: opt('BRIEF_FROM_NAME', opt('ORDER_FROM_NAME', 'I AM [RESIST]')),
  SUBSCRIBE_TOKEN_SECRET: opt('SUBSCRIBE_TOKEN_SECRET'),
  SUBSCRIBE_IP_HASH_SALT: opt('SUBSCRIBE_IP_HASH_SALT'),
  // Resend now uses Segments; we accept either name to avoid breaking older configs.
  RESISTANCE_BRIEF_SEGMENT_ID: opt('RESISTANCE_BRIEF_SEGMENT_ID'),
  RESISTANCE_BRIEF_AUDIENCE_ID: opt('RESISTANCE_BRIEF_AUDIENCE_ID'),
  PRINTIFY_API_TOKEN: opt('PRINTIFY_API_TOKEN'),
  PRINTIFY_SHOP_ID: opt('PRINTIFY_SHOP_ID'),
  PRINTIFY_WEBHOOK_SECRET: opt('PRINTIFY_WEBHOOK_SECRET'),
  PRINTIFY_PRODUCT_ID: opt('PRINTIFY_PRODUCT_ID'),
};
