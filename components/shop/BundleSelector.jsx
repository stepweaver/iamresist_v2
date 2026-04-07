'use client';

import { Truck } from 'lucide-react';

/**
 * Bundle/pricing selector for product pages.
 * @param {Array<{quantity: number, label: string, price: number, savings?: string}>} bundles
 * @param {object} selectedBundle - Currently selected bundle
 * @param {(bundle: object) => void} onSelect
 * @param {boolean} qualifiesForFreeShipping
 * @param {number} freeShippingThreshold - For "add $X more" message
 * @param {number} subtotal
 */
export default function BundleSelector({
  bundles,
  selectedBundle,
  onSelect,
  qualifiesForFreeShipping,
  freeShippingThreshold,
  subtotal,
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm uppercase tracking-wider text-foreground/70 font-bold mb-4">
        Choose Your Bundle
      </h3>
      <div className="grid gap-3">
        {bundles.map((bundle) => {
          const isSelected = selectedBundle.quantity === bundle.quantity;
          const bundlePerUnit = bundle.price / bundle.quantity;
          return (
            <button
              key={bundle.quantity}
              onClick={() => onSelect(bundle)}
              className={`p-4 border-2 text-left transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isSelected ? 'border-primary bg-primary' : 'border-foreground/30'
                    }`}
                  >
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-background" />
                    )}
                  </div>
                  <span className="font-bold text-lg">{bundle.label}</span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-primary">
                    ${bundle.price.toFixed(2)}
                  </span>
                  {bundle.savings && (
                    <div className="text-xs text-green-400 mt-1">{bundle.savings}</div>
                  )}
                </div>
              </div>
              {bundle.quantity > 1 && (
                <div className="text-xs text-foreground/50 ml-8">
                  ${bundlePerUnit.toFixed(2)} per sticker
                </div>
              )}
            </button>
          );
        })}
      </div>
      {qualifiesForFreeShipping && (
        <p className="text-sm text-green-400 mt-3 flex items-center gap-2">
          <Truck className="w-4 h-4" />
          {selectedBundle.freeShipping
            ? 'Free shipping included!'
            : 'Free shipping on orders $20+'}
        </p>
      )}
      {!qualifiesForFreeShipping && selectedBundle.quantity < 5 && (
        <p className="text-xs text-foreground/50 mt-3">
          Add ${(freeShippingThreshold - subtotal).toFixed(2)} more for free shipping
        </p>
      )}
    </div>
  );
}
