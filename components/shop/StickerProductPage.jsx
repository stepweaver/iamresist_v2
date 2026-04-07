'use client';

/**
 * Shared product page for all sticker products
 * Renders quantity selector, add to cart, and product details
 */

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import PageLayout from '@/components/PageLayout';
import Card from '@/components/Card';
import SectionDivider from '@/components/SectionDivider';
import StatusAlert from '@/components/shop/StatusAlert';
import QuantitySelector from '@/components/shop/QuantitySelector';
import { useCart } from '@/context/CartContext';
import { Shield, Sun, Droplets, Truck } from 'lucide-react';

const FEATURE_ITEMS = [
  { icon: Shield, text: 'Car-durable vinyl' },
  { icon: Sun, text: 'UV-resistant, fade-resistant ink' },
  { icon: Droplets, text: 'Weatherproof construction' },
  { icon: Truck, text: 'Designed to last outdoors' },
];

export default function StickerProductPage({ product }) {
  const { addItem } = useCart();
  const [showAdded, setShowAdded] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

  const productKey = product.bundles?.[0]?.productKey;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('cancelled') === 'true') {
      setShowCancelled(true);
      window.history.replaceState({}, '', `/shop/${product.slug}`);
    }
  }, [product.slug]);

  const handleAddToCart = (quantity) => {
    if (!productKey) return;
    addItem(product, quantity, productKey);
    setShowAdded(true);
    setTimeout(() => setShowAdded(false), 2000);
  };

  return (
    <PageLayout>
      {/* Breadcrumb */}
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 py-4">
        <nav className="nav-label text-xs text-foreground/60">
          <Link href="/" className="hover:text-primary transition-colors">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link href="/shop" className="hover:text-primary transition-colors">
            Shop
          </Link>
          <span className="mx-2">/</span>
          <span className="text-primary">{product.name}</span>
        </nav>
      </div>

      {/* Status Alerts */}
      {showAdded && (
        <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 mb-8">
          <StatusAlert
            variant="success"
            title="Added to Cart"
            message={
              <span>
                <Link href="/shop/cart" className="underline hover:no-underline font-bold">
                  View cart
                </Link>
                {' '}to checkout or continue shopping.
              </span>
            }
          />
        </div>
      )}
      {showCancelled && (
        <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 mb-8">
          <StatusAlert
            variant="cancelled"
            title="Checkout Cancelled"
            message="Your checkout was cancelled. No payment was processed. Feel free to try again when you're ready."
            onDismiss={() => setShowCancelled(false)}
          />
        </div>
      )}
      {/* Product Section */}
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 py-8 lg:py-16">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-start">
          {/* Left: Product Image */}
          <div className="space-y-6">
            <Card className="p-8 lg:p-12">
              <div className="relative aspect-square w-full max-w-lg mx-auto">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-lg" />
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  className="object-contain p-4 logo-shadow-hero"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority
                  unoptimized
                />
              </div>
            </Card>
            <p className="text-center text-xs text-foreground/40 uppercase tracking-wider">
              Actual sticker is die-cut to shape
            </p>
          </div>

          {/* Right: Product Details */}
          <div className="space-y-8">
            <div>
              <span className="kicker text-primary text-xs sm:text-sm tracking-[0.4em] font-bold block mb-2">
                Limited Edition
              </span>
              <h1 className="font-ui text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
                {product.name}
              </h1>
              <p className="prose-copy text-lg text-foreground/70 italic mb-4">{product.tagline}</p>
              <SectionDivider className="mb-6" />
              <p className="prose-copy text-foreground/80 leading-relaxed">{product.description}</p>
            </div>

            {/* Quantity & Add to Cart */}
            <QuantitySelector
              onAddToCart={handleAddToCart}
              disabled={!productKey}
              added={showAdded}
            />

            {/* Features */}
            <div className="grid grid-cols-2 gap-4">
              {FEATURE_ITEMS.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm">
                  <feature.icon className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-foreground/80">{feature.text}</span>
                </div>
              ))}
            </div>

            {/* Cart CTA */}
            <div className="pt-4">
              <Link
                href="/shop/cart"
                className="button-label inline-block py-3 px-6 border-2 border-primary text-primary hover:bg-primary hover:text-background font-bold text-sm tracking-wider transition-all"
              >
                View Cart
              </Link>
            </div>

            {/* Specs */}
            <div className="space-y-4">
              <h3 className="font-ui text-sm text-primary font-bold">
                Specifications
              </h3>
              <div className="grid gap-3">
                {product.specs.map((spec, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between text-sm py-2 border-b border-border/50"
                  >
                    <span className="text-foreground/60">{spec.label}</span>
                    <span className="text-foreground/90 font-medium">{spec.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mission Reminder */}
      <div className="border-t border-border py-12 lg:py-16">
        <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 text-center">
          <p className="prose-copy text-lg lg:text-xl text-foreground/70 mb-4">
            Every sticker is a statement. Every purchase supports independent resistance
            journalism.
          </p>
          <p className="font-display text-2xl lg:text-3xl font-bold tracking-wider text-primary">
            I AM [RESIST]
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
