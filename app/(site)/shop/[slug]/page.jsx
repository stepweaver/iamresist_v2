/**
 * Dynamic product page - renders sticker product by slug
 * Routes: /shop/sticker, /shop/gadsden, /shop/taco, /shop/all-mad-here
 */

import { notFound } from 'next/navigation';
import { getProductBySlug, PRODUCT_SLUGS } from '@/lib/shopProducts';
import { buildProductMetadata, buildPageMetadata } from '@/lib/metadata';
import StickerProductPage from '@/components/shop/StickerProductPage';

export async function generateStaticParams() {
  return PRODUCT_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const slug = typeof resolvedParams?.slug === 'string' ? resolvedParams.slug : null;
  const product = slug ? getProductBySlug(slug) : null;

  if (!product || !PRODUCT_SLUGS.includes(slug)) {
    return buildPageMetadata({
      title: 'Shop',
      description: 'Premium vinyl stickers from I AM [RESIST].',
      urlPath: '/shop',
    });
  }

  return buildProductMetadata({
    name: product.name,
    tagline: product.tagline,
    description: product.description,
    urlPath: `/shop/${product.slug}`,
    image: product.image,
    imageAlt: product.name,
    price: product.basePrice,
    keywords: [
      product.slug,
      'die-cut sticker',
      'weatherproof vinyl',
      'uv-resistant sticker',
    ],
  });
}

export default async function ProductPage({ params }) {
  const resolvedParams = await params;
  const slug = typeof resolvedParams?.slug === 'string' ? resolvedParams.slug : null;
  const product = slug ? getProductBySlug(slug) : null;

  if (!product || !PRODUCT_SLUGS.includes(slug)) {
    notFound();
  }

  return <StickerProductPage product={product} />;
}