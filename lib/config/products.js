/**
 * Product configuration - Multiple Stripe products mapped to Printify
 *
 * To set this up:
 * 1. Create products in Stripe Dashboard (Individual, 3-Pack, 5-Pack)
 * 2. Copy the Price ID (price_...) for each product
 * 3. Add them as environment variables or update this config
 */
export const PRODUCT_CONFIG = {
  // I AM [RESIST] - Individual sticker - $6.00
  individual: {
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_INDIVIDUAL || process.env.STRIPE_PRICE_ID_INDIVIDUAL || '',
    printifyProductId: process.env.PRINTIFY_PRODUCT_ID || '',
    quantity: 1,
    unitAmountCents: 600,
    freeShipping: false, // $4 shipping
    sku: 'RESIST-STICKER-001',
    productSlug: 'sticker',
    productName: 'I AM [RESIST] Vinyl Sticker',
  },
  // I AM [RESIST] - 3-Pack - $14.00 + Free Shipping
  threePack: {
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_3PACK || process.env.STRIPE_PRICE_ID_3PACK || '',
    printifyProductId: process.env.PRINTIFY_PRODUCT_ID || '',
    quantity: 3,
    unitAmountCents: 1400,
    freeShipping: true,
    sku: 'RESIST-STICKER-003',
    productSlug: 'sticker',
    productName: 'I AM [RESIST] Vinyl Sticker',
  },
  // I AM [RESIST] - 5-Pack - $20.00 + Free Shipping
  fivePack: {
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_5PACK || process.env.STRIPE_PRICE_ID_5PACK || '',
    printifyProductId: process.env.PRINTIFY_PRODUCT_ID || '',
    quantity: 5,
    unitAmountCents: 2000,
    freeShipping: true,
    sku: 'RESIST-STICKER-005',
    productSlug: 'sticker',
    productName: 'I AM [RESIST] Vinyl Sticker',
  },
  // Gadsden Parody - Individual - $6.00
  gadsdenIndividual: {
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_GADSDEN_INDIVIDUAL || process.env.STRIPE_PRICE_ID_GADSDEN_INDIVIDUAL || '',
    printifyProductId: process.env.PRINTIFY_PRODUCT_ID_GADSDEN || process.env.PRINTIFY_PRODUCT_ID || '',
    quantity: 1,
    unitAmountCents: 600,
    freeShipping: false,
    sku: 'GADSDEN-STICKER-001',
    productSlug: 'gadsden',
    productName: 'Gadsden Parody Sticker',
  },
  // Gadsden Parody - 3-Pack - $14.00 + Free Shipping
  gadsdenThreePack: {
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_GADSDEN_3PACK || process.env.STRIPE_PRICE_ID_GADSDEN_3PACK || '',
    printifyProductId: process.env.PRINTIFY_PRODUCT_ID_GADSDEN || process.env.PRINTIFY_PRODUCT_ID || '',
    quantity: 3,
    unitAmountCents: 1400,
    freeShipping: true,
    sku: 'GADSDEN-STICKER-003',
    productSlug: 'gadsden',
    productName: 'Gadsden Parody Sticker',
  },
  // Gadsden Parody - 5-Pack - $20.00 + Free Shipping
  gadsdenFivePack: {
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_GADSDEN_5PACK || process.env.STRIPE_PRICE_ID_GADSDEN_5PACK || '',
    printifyProductId: process.env.PRINTIFY_PRODUCT_ID_GADSDEN || process.env.PRINTIFY_PRODUCT_ID || '',
    quantity: 5,
    unitAmountCents: 2000,
    freeShipping: true,
    sku: 'GADSDEN-STICKER-005',
    productSlug: 'gadsden',
    productName: 'Gadsden Parody Sticker',
  },
  // Trump TACO - Individual - $6.00
  tacoIndividual: {
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_TACO_INDIVIDUAL || process.env.STRIPE_PRICE_ID_TACO_INDIVIDUAL || '',
    printifyProductId: process.env.PRINTIFY_PRODUCT_ID_TACO || process.env.PRINTIFY_PRODUCT_ID || '',
    quantity: 1,
    unitAmountCents: 600,
    freeShipping: false,
    sku: 'TACO-STICKER-001',
    productSlug: 'taco',
    productName: 'Trump TACO Vinyl Sticker',
  },
  // Trump TACO - 3-Pack - $14.00 + Free Shipping
  tacoThreePack: {
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_TACO_3PACK || process.env.STRIPE_PRICE_ID_TACO_3PACK || '',
    printifyProductId: process.env.PRINTIFY_PRODUCT_ID_TACO || process.env.PRINTIFY_PRODUCT_ID || '',
    quantity: 3,
    unitAmountCents: 1400,
    freeShipping: true,
    sku: 'TACO-STICKER-003',
    productSlug: 'taco',
    productName: 'Trump TACO Vinyl Sticker',
  },
  // Trump TACO - 5-Pack - $20.00 + Free Shipping
  tacoFivePack: {
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_TACO_5PACK || process.env.STRIPE_PRICE_ID_TACO_5PACK || '',
    printifyProductId: process.env.PRINTIFY_PRODUCT_ID_TACO || process.env.PRINTIFY_PRODUCT_ID || '',
    quantity: 5,
    unitAmountCents: 2000,
    freeShipping: true,
    sku: 'TACO-STICKER-005',
    productSlug: 'taco',
    productName: 'Trump TACO Vinyl Sticker',
  },
  // All Mad Here - Individual - $6.00
  allMadIndividual: {
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ALL_MAD_INDIVIDUAL || process.env.STRIPE_PRICE_ID_ALL_MAD_INDIVIDUAL || '',
    printifyProductId: process.env.PRINTIFY_PRODUCT_ID_ALL_MAD_HERE || process.env.PRINTIFY_PRODUCT_ID || '',
    quantity: 1,
    unitAmountCents: 600,
    freeShipping: false,
    sku: 'ALL-MAD-STICKER-001',
    productSlug: 'all-mad-here',
    productName: 'All Mad Here Vinyl Sticker',
  },
  // All Mad Here - 3-Pack - $14.00 + Free Shipping
  allMadThreePack: {
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ALL_MAD_3PACK || process.env.STRIPE_PRICE_ID_ALL_MAD_3PACK || '',
    printifyProductId: process.env.PRINTIFY_PRODUCT_ID_ALL_MAD_HERE || process.env.PRINTIFY_PRODUCT_ID || '',
    quantity: 3,
    unitAmountCents: 1400,
    freeShipping: true,
    sku: 'ALL-MAD-STICKER-003',
    productSlug: 'all-mad-here',
    productName: 'All Mad Here Vinyl Sticker',
  },
  // All Mad Here - 5-Pack - $20.00 + Free Shipping
  allMadFivePack: {
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ALL_MAD_5PACK || process.env.STRIPE_PRICE_ID_ALL_MAD_5PACK || '',
    printifyProductId: process.env.PRINTIFY_PRODUCT_ID_ALL_MAD_HERE || process.env.PRINTIFY_PRODUCT_ID || '',
    quantity: 5,
    unitAmountCents: 2000,
    freeShipping: true,
    sku: 'ALL-MAD-STICKER-005',
    productSlug: 'all-mad-here',
    productName: 'All Mad Here Vinyl Sticker',
  },
};
