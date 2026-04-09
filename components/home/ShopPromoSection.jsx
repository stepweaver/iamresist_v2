import Image from 'next/image';
import Link from 'next/link';
import Card from '@/components/Card';
import { getProductBySlug } from '@/lib/shopProducts';

export default function ShopPromoSection() {
  const featuredProduct = getProductBySlug('taco');

  return (
    <div className="mb-6 sm:mb-8">
      <Card className="p-4 sm:p-6 border-primary/30 hover:border-primary transition-colors">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <span className="kicker text-primary text-xs sm:text-sm tracking-[0.4em] block font-bold mb-1">
                Display Your Dissent
              </span>
              <h2 className="font-ui text-lg sm:text-xl font-bold mb-2">SHOP</h2>
              <p className="prose-copy text-xs sm:text-sm text-foreground/70">
                Premium vinyl stickers featuring the I AM [RESIST] flag.
              </p>
            </div>
            <Link
              href="/shop"
              className="button-label px-4 sm:px-6 py-2 sm:py-3 bg-primary hover:bg-primary-dark border border-primary font-bold text-xs sm:text-sm tracking-wider transition-all duration-200 text-center whitespace-nowrap text-white"
            >
              Shop Now →
            </Link>
          </div>
          {featuredProduct && (
            <Link
              href={`/shop/${featuredProduct.slug}`}
              className="flex items-center gap-4 p-3 sm:p-4 rounded-lg border border-border hover:border-primary bg-background/50 transition-colors group"
            >
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 rounded-md overflow-hidden bg-primary/10">
                <Image
                  src={featuredProduct.image}
                  alt={featuredProduct.name}
                  fill
                  className="object-contain p-1.5 group-hover:scale-105 transition-transform duration-200"
                  sizes="96px"
                  unoptimized
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="timestamp text-[10px] text-foreground/50 mb-0.5">Featured</p>
                <h3 className="font-ui text-sm sm:text-base font-bold text-foreground group-hover:text-primary transition-colors truncate">
                  {featuredProduct.name}
                </h3>
                <p className="prose-copy text-xs text-foreground/60 italic truncate">
                  {featuredProduct.tagline}
                </p>
                <p className="text-xs text-primary font-medium mt-1">View product →</p>
              </div>
            </Link>
          )}
        </div>
      </Card>
    </div>
  );
}
