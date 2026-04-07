'use client';

/**
 * Product card for shop grid
 * Renders a single sticker product with image, details, add-to-cart, and view link
 */

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Card from '@/components/Card';
import { useCart } from '@/context/CartContext';
import { ShoppingCart, Minus, Plus, Check } from 'lucide-react';

export default function ProductCard({ product }) {
  const [imageError, setImageError] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const { addItem } = useCart();

  const productKey = product.bundles?.[0]?.productKey;
  const href = `/shop/${product.slug}`;

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!productKey) return;
    addItem(product, quantity, productKey);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <Card className="p-6 hover:border-primary transition-all duration-200 group">
      <Link href={href} className="block">
        {/* Product Image */}
        <div className="relative aspect-square w-full mb-6 bg-gradient-to-br from-primary/10 to-transparent rounded-lg overflow-hidden">
          {imageError ? (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <span className="text-sm text-foreground/50 text-center uppercase tracking-wider">
                {product.name}
              </span>
            </div>
          ) : (
            <Image
              src={product.image}
              alt={product.name}
              fill
              className="object-contain p-4 group-hover:scale-105 transition-transform duration-200"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              unoptimized
              onError={() => setImageError(true)}
            />
          )}
        </div>

        {/* Product Info */}
        <div className="space-y-3">
          <div>
            <p className="timestamp text-[10px] text-foreground/50 mb-1">Signal Marker</p>
            <h3 className="font-ui text-xl font-bold mb-2 group-hover:text-primary transition-colors">
              {product.name}
            </h3>
            <p className="prose-copy text-sm text-foreground/60 italic mb-3">{product.tagline}</p>
            <p className="prose-copy text-sm text-foreground/80 leading-relaxed line-clamp-3">
              {product.description}
            </p>
          </div>

          {/* Price */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="text-2xl font-bold text-primary">
              ${product.price.toFixed(2)}
            </span>
            <span className="system-label text-xs text-foreground/50">
              Starting at
            </span>
          </div>

          {/* Features */}
          <div className="flex flex-wrap gap-2 pt-2">
            {product.features.slice(0, 3).map((feature, idx) => (
              <span
                key={idx}
                className="text-xs px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded uppercase tracking-wider"
              >
                {feature}
              </span>
            ))}
          </div>
        </div>
      </Link>

      {/* Add to Cart - outside Link so it doesn't navigate */}
      <div className="pt-4 space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="p-2 hover:bg-primary/10 transition-colors"
              aria-label="Decrease quantity"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="px-3 py-1.5 min-w-[2.5rem] text-center text-sm font-medium">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(10, q + 1))}
              className="p-2 hover:bg-primary/10 transition-colors"
              aria-label="Increase quantity"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!productKey || added}
            className={`button-label flex-1 py-3 bg-primary hover:bg-primary-dark border border-primary font-bold text-sm tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-70 ${added ? 'animate-button-confirm' : ''}`}
          >
            {added ? (
              <>
                <Check className="w-4 h-4" />
                Added!
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4" />
                Add to Cart
              </>
            )}
          </button>
        </div>
        <Link
          href={href}
          className="nav-label block text-center text-xs text-foreground/60 hover:text-primary transition-colors"
        >
          View details
        </Link>
      </div>
    </Card>
  );
}
