'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import PageLayout from '@/components/PageLayout';
import Card from '@/components/Card';
import { useCart } from '@/context/CartContext';
import StatusAlert from '@/components/shop/StatusAlert';
import { Minus, Plus, Trash2, ShoppingBag, Loader2, Shield } from 'lucide-react';
export default function CartPage() {
  const { items, totalQuantity, subtotalCents, shippingCents, totalCents, freeShipping, updateQuantity, removeItem, clearCart } = useCart();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const [showCancelled, setShowCancelled] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setShowSuccess(true);
      clearCart();
      window.history.replaceState({}, '', '/shop/cart');
    }
    if (params.get('cancelled') === 'true') {
      setShowCancelled(true);
      window.history.replaceState({}, '', '/shop/cart');
    }
  }, [clearCart]);

  const handleCheckout = async () => {
    if (items.length === 0) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart: items.map((i) => ({ slug: i.slug, productKey: i.productKey, quantity: i.quantity })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to start checkout. Please try again.');
        setIsLoading(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError('Unable to start checkout. Please try again or contact support.');
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError('Network error. Please check your connection and try again.');
      setIsLoading(false);
    }
  };

  if (showSuccess) {
    return (
      <PageLayout>
        <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 py-12">
          <StatusAlert
            variant="success"
            title="Order Confirmed!"
            message="Thank you for your order. You'll receive a confirmation email shortly with tracking information."
          />
          <Link href="/shop" className="inline-block mt-6 text-primary hover:underline font-bold uppercase tracking-wider">
            Continue Shopping
          </Link>
        </div>
      </PageLayout>
    );
  }

  if (items.length === 0 && !showSuccess) {
    return (
      <PageLayout>
        <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 py-16 lg:py-24 text-center">
          <div className="max-w-md mx-auto">
            <ShoppingBag className="w-16 h-16 mx-auto text-foreground/30 mb-6" />
            <h1 className="text-2xl font-bold uppercase tracking-wider mb-4">Your cart is empty</h1>
            <p className="text-foreground/70 mb-8">
              Add some stickers to get started. Mix and match designs — free shipping on 3 or more!
            </p>
            <Link
              href="/shop"
              className="inline-block py-4 px-8 bg-primary hover:bg-primary-dark border border-primary font-bold text-sm tracking-wider uppercase transition-all"
            >
              Shop Stickers
            </Link>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 py-8 lg:py-16">
        <h1 className="text-3xl font-bold uppercase tracking-wider mb-8">Cart</h1>

        {showCancelled && (
          <div className="mb-8">
            <StatusAlert
              variant="cancelled"
              title="Checkout Cancelled"
              message="Your checkout was cancelled. No payment was processed. Your cart is still here when you're ready."
              onDismiss={() => setShowCancelled(false)}
            />
          </div>
        )}

        {error && (
          <div className="mb-8">
            <StatusAlert variant="error" title="Checkout Error" message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <Card key={item.slug} className="p-4 sm:p-6">
                <div className="flex gap-4 sm:gap-6">
                  <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 bg-gradient-to-br from-primary/10 to-transparent rounded overflow-hidden">
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      className="object-contain p-2"
                      sizes="96px"
                      unoptimized
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/shop/${item.slug}`} className="font-bold uppercase tracking-wider hover:text-primary transition-colors block mb-2">
                      {item.name}
                    </Link>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      <div className="flex items-center border border-border">
                        <button
                          onClick={() => updateQuantity(item.slug, item.quantity - 1)}
                          className="p-2 hover:bg-primary/10 transition-colors"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="px-4 py-2 min-w-[3rem] text-center font-medium">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.slug, item.quantity + 1)}
                          className="p-2 hover:bg-primary/10 transition-colors"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <button
                        onClick={() => removeItem(item.slug)}
                        className="flex items-center gap-1 text-sm text-foreground/60 hover:text-primary transition-colors"
                        aria-label="Remove from cart"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div>
            <Card className="p-6 sticky top-24">
              <h2 className="text-sm uppercase tracking-wider font-bold mb-4">Order Summary</h2>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-foreground/70">Subtotal ({totalQuantity} {totalQuantity === 1 ? 'sticker' : 'stickers'})</span>
                  <span className="font-medium">${(subtotalCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-foreground/70">Shipping</span>
                  <span className="font-medium">
                    {freeShipping ? <span className="text-green-400">FREE</span> : `$${(shippingCents / 100).toFixed(2)}`}
                  </span>
                </div>
                {!freeShipping && totalQuantity > 0 && (
                  <p className="text-xs text-foreground/50">
                    Add {3 - totalQuantity} more {3 - totalQuantity === 1 ? 'sticker' : 'stickers'} for free shipping
                  </p>
                )}
                <div className="flex justify-between pt-3 border-t border-border">
                  <span className="text-sm uppercase tracking-wider font-bold">Total</span>
                  <span className="text-2xl font-bold text-primary">${(totalCents / 100).toFixed(2)}</span>
                </div>
              </div>
              <button
                onClick={handleCheckout}
                disabled={isLoading}
                className="w-full mt-6 py-4 bg-primary hover:bg-primary-dark border border-primary font-bold text-base tracking-wider uppercase transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5" />
                    Proceed to Checkout
                  </>
                )}
              </button>
              <p className="text-center text-xs text-foreground/50 mt-4">
                <Shield className="w-3 h-3 inline-block mr-1" />
                Secure checkout powered by Stripe
              </p>
            </Card>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
