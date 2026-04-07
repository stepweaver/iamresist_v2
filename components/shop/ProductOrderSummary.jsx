'use client';

import { ShoppingCart, Loader2, Shield } from 'lucide-react';
import Card from '@/components/Card';

/**
 * Order summary and checkout button for product pages.
 * @param {number} subtotal
 * @param {boolean} qualifiesForFreeShipping
 * @param {boolean} isLoading
 * @param {() => void} onCheckout
 */
export default function ProductOrderSummary({
  subtotal,
  qualifiesForFreeShipping,
  isLoading,
  onCheckout,
}) {
  return (
    <Card className="p-6 space-y-6">
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-foreground/70">Subtotal</span>
          <span className="font-medium">${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-foreground/70">Shipping</span>
          <span className="font-medium">
            {qualifiesForFreeShipping ? (
              <span className="text-green-400">FREE</span>
            ) : (
              'Calculated at checkout'
            )}
          </span>
        </div>
        <div className="flex justify-between pt-3 border-t border-border">
          <span className="text-sm uppercase tracking-wider text-foreground/70">
            Total
          </span>
          <span className="text-2xl font-bold text-primary">
            ${subtotal.toFixed(2)}
            {qualifiesForFreeShipping && (
              <span className="text-sm text-green-400 ml-2 font-normal">
                + FREE Shipping
              </span>
            )}
          </span>
        </div>
      </div>

      <button
        onClick={onCheckout}
        disabled={isLoading}
        className="w-full py-4 bg-primary hover:bg-primary-dark border border-primary font-bold text-base tracking-wider uppercase transition-all duration-200 flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <ShoppingCart className="w-5 h-5" />
            Checkout Now
          </>
        )}
      </button>

      <p className="text-center text-xs text-foreground/50">
        <Shield className="w-3 h-3 inline-block mr-1" />
        Secure checkout powered by Stripe
      </p>
    </Card>
  );
}
