import Image from 'next/image';
import Link from 'next/link';
import Card from '@/components/Card';
import { getProductBySlug } from '@/lib/shopProducts';

export default function ShopPromoSection() {
  const featuredProduct = getProductBySlug('antifa');

  return (
    <section data-testid="home-shop" className="border-t border-border/70 pt-4 sm:pt-5">
      <Card className="border-primary/30 p-3 transition-colors hover:border-primary sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <span className="kicker block text-xs font-bold tracking-[0.28em] text-primary">
              Display Your Dissent
            </span>
            <p className="prose-copy mt-1 text-xs text-foreground/70">
              Vinyl stickers of the I AM [RESIST] flag.
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            {featuredProduct && (
              <Link
                href={`/shop/${featuredProduct.slug}`}
                className="group flex min-w-0 items-center gap-3 rounded-lg border border-border bg-background/50 p-2 transition-colors hover:border-primary"
              >
                <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-primary/10">
                  <Image
                    src={featuredProduct.image}
                    alt={featuredProduct.name}
                    fill
                    className="object-contain p-1 transition-transform duration-200 group-hover:scale-105"
                    sizes="56px"
                    unoptimized
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-ui text-sm font-bold text-foreground transition-colors group-hover:text-primary">
                    {featuredProduct.name}
                  </h3>
                  <p className="text-xs font-medium text-primary">View product →</p>
                </div>
              </Link>
            )}
            <Link
              href="/shop"
              className="button-label block whitespace-nowrap border border-primary bg-primary px-4 py-2 text-center text-xs font-bold tracking-wider text-white transition-all duration-200 hover:bg-primary-dark sm:px-5"
            >
              Shop →
            </Link>
          </div>
        </div>
      </Card>
    </section>
  );
}
