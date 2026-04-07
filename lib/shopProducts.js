/**
 * Single source of truth for shop sticker products
 * Used by shop listing page and product detail pages
 */

const SHARED_FEATURES = ['Car-durable vinyl', 'UV-resistant', 'Weatherproof', '3-5 years outdoor use'];
const SHARED_SPECS = [
  { label: 'Material', value: 'Premium vinyl (matte finish)' },
  { label: 'Size', value: '2" × 3" die-cut' },
  { label: 'Durability', value: '3-5 years outdoor use' },
  { label: 'Application', value: 'Cars, laptops, water bottles, windows' },
];

/**
 * Resolve priceId from env at runtime (client or server)
 */
function getPriceId(envKey) {
  if (typeof process === 'undefined' || !process.env) return '';
  return process.env[envKey] || process.env[envKey.replace('NEXT_PUBLIC_', '')] || '';
}

/**
 * Build bundles with resolved priceIds
 */
function buildBundles(bundleConfig) {
  return bundleConfig.map((b) => ({
    ...b,
    priceId: getPriceId(b.priceIdKey),
    savings: b.freeShipping ? 'Free Shipping' : undefined,
  }));
}

export const SHOP_PRODUCTS = [
  {
    slug: 'sticker',
    name: 'I AM [RESIST] Vinyl Sticker',
    price: 6.0,
    tagline: 'Display resistance everywhere',
    description:
      "A premium die-cut vinyl sticker featuring the I AM [RESIST] flag. Designed as a quiet mark of refusal — not loud, not disposable — but meant to endure. Printed on weather-resistant, UV-protected vinyl and built to last through sun, rain, heat, and cold. Suitable for cars, laptops, water bottles, toolboxes, and anywhere resistance belongs. This isn't merch. It's a signal.",
    basePrice: 6.0,
    freeShippingThreshold: 20.0,
    image: '/resist_sticker.png',
    features: SHARED_FEATURES,
    specs: SHARED_SPECS,
    bundles: buildBundles([
      { quantity: 1, price: 6.0, label: '1 Sticker', productKey: 'individual', priceIdKey: 'NEXT_PUBLIC_STRIPE_PRICE_ID_INDIVIDUAL', freeShipping: false },
      { quantity: 3, price: 14.0, label: '3 Stickers', productKey: 'threePack', priceIdKey: 'NEXT_PUBLIC_STRIPE_PRICE_ID_3PACK', freeShipping: true },
      { quantity: 5, price: 20.0, label: '5 Stickers', productKey: 'fivePack', priceIdKey: 'NEXT_PUBLIC_STRIPE_PRICE_ID_5PACK', freeShipping: true },
    ]),
  },
  {
    slug: 'gadsden',
    name: 'Gadsden Parody Vinyl Sticker',
    price: 6.0,
    tagline: "Don't tread on resistance",
    description:
      "Real patriots don't cosplay freedom. They defend it — consistently, for everyone. A premium die-cut vinyl sticker with a side of satire. Printed on weather-resistant, UV-protected vinyl and built to last through sun, rain, heat, and cold. Suitable for cars, laptops, water bottles, toolboxes, and anywhere resistance belongs.",
    basePrice: 6.0,
    freeShippingThreshold: 20.0,
    image: '/gadsen_sticker.png',
    features: SHARED_FEATURES,
    specs: SHARED_SPECS,
    bundles: buildBundles([
      { quantity: 1, price: 6.0, label: '1 Sticker', productKey: 'gadsdenIndividual', priceIdKey: 'NEXT_PUBLIC_STRIPE_PRICE_ID_GADSDEN_INDIVIDUAL', freeShipping: false },
      { quantity: 3, price: 14.0, label: '3 Stickers', productKey: 'gadsdenThreePack', priceIdKey: 'NEXT_PUBLIC_STRIPE_PRICE_ID_GADSDEN_3PACK', freeShipping: true },
      { quantity: 5, price: 20.0, label: '5 Stickers', productKey: 'gadsdenFivePack', priceIdKey: 'NEXT_PUBLIC_STRIPE_PRICE_ID_GADSDEN_5PACK', freeShipping: true },
    ]),
  },
  {
    slug: 'taco',
    name: 'Trump TACO Vinyl Sticker',
    price: 6.0,
    tagline: 'Because some things deserve a taco',
    description:
      "That's not the president! It's a chicken! Same quality as our other stickers — car-durable, weatherproof, UV-resistant — with a side of satire. Printed on weather-resistant, UV-protected vinyl and built to last through sun, rain, heat, and cold. Suitable for cars, laptops, water bottles, toolboxes, and anywhere a little humor belongs.",
    basePrice: 6.0,
    freeShippingThreshold: 20.0,
    image: '/trump_chicken.png',
    features: SHARED_FEATURES,
    specs: [
      ...SHARED_SPECS.filter((s) => s.label !== 'Size'),
      { label: 'Size', value: '3.5" × 3.5" square vinyl' },
    ],
    bundles: buildBundles([
      { quantity: 1, price: 6.0, label: '1 Sticker', productKey: 'tacoIndividual', priceIdKey: 'NEXT_PUBLIC_STRIPE_PRICE_ID_TACO_INDIVIDUAL', freeShipping: false },
      { quantity: 3, price: 14.0, label: '3 Stickers', productKey: 'tacoThreePack', priceIdKey: 'NEXT_PUBLIC_STRIPE_PRICE_ID_TACO_3PACK', freeShipping: true },
      { quantity: 5, price: 20.0, label: '5 Stickers', productKey: 'tacoFivePack', priceIdKey: 'NEXT_PUBLIC_STRIPE_PRICE_ID_TACO_5PACK', freeShipping: true },
    ]),
  },
  {
    slug: 'all-mad-here',
    name: 'All Mad Here Vinyl Sticker',
    price: 6.0,
    tagline: "We're all mad here",
    description:
      "A premium die-cut vinyl sticker inspired by the Mad Hatter's tea party. Same quality as our other stickers — car-durable, weatherproof, UV-resistant — for cars, laptops, water bottles, and anywhere a little wonder belongs.",
    basePrice: 6.0,
    freeShippingThreshold: 20.0,
    image: '/all_mad_here.PNG',
    features: SHARED_FEATURES,
    specs: SHARED_SPECS,
    bundles: buildBundles([
      { quantity: 1, price: 6.0, label: '1 Sticker', productKey: 'allMadIndividual', priceIdKey: 'NEXT_PUBLIC_STRIPE_PRICE_ID_ALL_MAD_INDIVIDUAL', freeShipping: false },
      { quantity: 3, price: 14.0, label: '3 Stickers', productKey: 'allMadThreePack', priceIdKey: 'NEXT_PUBLIC_STRIPE_PRICE_ID_ALL_MAD_3PACK', freeShipping: true },
      { quantity: 5, price: 20.0, label: '5 Stickers', productKey: 'allMadFivePack', priceIdKey: 'NEXT_PUBLIC_STRIPE_PRICE_ID_ALL_MAD_5PACK', freeShipping: true },
    ]),
  },
];

export const PRODUCT_SLUGS = SHOP_PRODUCTS.map((p) => p.slug);

/**
 * Get product by slug
 * @param {string} slug - Product slug (sticker, gadsden, taco, all-mad-here)
 * @returns {Object|null} Product config or null
 */
export function getProductBySlug(slug) {
  return SHOP_PRODUCTS.find((p) => p.slug === slug) || null;
}
