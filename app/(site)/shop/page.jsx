import SectionDivider from '@/components/SectionDivider';
import Link from 'next/link';
import { ShoppingCart, Shield, Truck } from 'lucide-react';
import { SHOP_PRODUCTS } from '@/lib/shopProducts';
import ProductCard from '@/components/shop/ProductCard';
import { buildPageMetadata } from '@/lib/metadata';

export const metadata = buildPageMetadata({
  title: 'Shop | I AM [RESIST]',
  description:
    'Premium vinyl stickers featuring the I AM [RESIST] flag. Display resistance everywhere. Car-durable, weatherproof, UV-resistant. Starting at $6.',
  urlPath: '/shop',
  images: [
    { url: '/resist_sticker.png', width: 1200, height: 1200, alt: 'I AM [RESIST] Vinyl Sticker' },
  ],
});

export default function ShopPage() {
  return (
    <main
      id="main-content"
      className="min-h-screen overflow-x-hidden"
      style={{
        backgroundImage:
          'linear-gradient(rgba(211, 47, 47, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(211, 47, 47, 0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="border-b border-border pt-2 pb-10 sm:pb-14">
        <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3">
          <span className="kicker text-xs sm:text-sm tracking-[0.4em] block mb-2">
            SUPPLY DROP
          </span>
          <h1 className="section-title text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold mb-2">
            FIELD KIT
          </h1>
          <p className="system-label text-sm text-foreground/50 mb-6">
            Patch / Sticker / Signal Marker
          </p>
          <SectionDivider className="mb-6 max-w-2xl" />
          <p className="prose-copy text-base sm:text-lg lg:text-xl text-foreground/70 max-w-2xl leading-relaxed">
            Resistance logistics. Display the flag. Every order supports independent resistance journalism.
          </p>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 py-4">
        <nav className="nav-label text-xs text-foreground/60">
          <Link href="/" className="hover:text-primary transition-colors">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span className="text-primary">Shop</span>
        </nav>
      </div>

      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 py-12 sm:py-16 lg:py-20">
        <p className="timestamp text-[10px] text-foreground/50 mb-6">Inventory</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {SHOP_PRODUCTS.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      </div>

      <div className="border-t border-border py-12 sm:py-16">
        <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3">
          <div className="grid sm:grid-cols-3 gap-6 sm:gap-8 text-center">
            <div className="space-y-3">
              <div className="w-12 h-12 mx-auto bg-primary/20 rounded-full flex items-center justify-center">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-ui text-sm font-bold">Secure Checkout</h3>
              <p className="prose-copy text-xs text-foreground/60">
                All payments processed securely through Stripe
              </p>
            </div>
            <div className="space-y-3">
              <div className="w-12 h-12 mx-auto bg-primary/20 rounded-full flex items-center justify-center">
                <Truck className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-ui text-sm font-bold">Fast Shipping</h3>
              <p className="prose-copy text-xs text-foreground/60">
                Free shipping on orders $20+ (US & Canada)
              </p>
            </div>
            <div className="space-y-3">
              <div className="w-12 h-12 mx-auto bg-primary/20 rounded-full flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-ui text-sm font-bold">Quality Guaranteed</h3>
              <p className="prose-copy text-xs text-foreground/60">
                Premium materials, built to last
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border py-12 lg:py-16">
        <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 text-center">
          <p className="prose-copy text-lg lg:text-xl text-foreground/70 mb-4">
            Every purchase supports independent resistance journalism.
          </p>
          <p className="font-display text-2xl lg:text-3xl font-bold tracking-wider text-primary">
            I AM [RESIST]
          </p>
        </div>
      </div>
    </main>
  );
}
