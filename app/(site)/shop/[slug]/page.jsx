/**
 * Dynamic product page - renders sticker product by slug
 * Routes: /shop/sticker, /shop/gadsden, /shop/taco, /shop/all-mad-here
 */

import { notFound } from 'next/navigation';
import { getProductBySlug, PRODUCT_SLUGS } from '@/lib/shopProducts';
import StickerProductPage from '@/components/shop/StickerProductPage';

export async function generateStaticParams() {
  return PRODUCT_SLUGS.map((slug) => ({ slug }));
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
