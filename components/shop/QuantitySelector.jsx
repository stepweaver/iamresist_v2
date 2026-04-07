'use client';

import { useState } from 'react';
import { Minus, Plus, Check } from 'lucide-react';

const MIN = 1;
const MAX = 10;

/**
 * Quantity stepper for adding stickers to cart
 */
export default function QuantitySelector({ initialQuantity = 1, onAddToCart, disabled, added }) {
  const [value, setValue] = useState(initialQuantity);

  const handleChange = (delta) => {
    setValue((prev) => Math.min(MAX, Math.max(MIN, prev + delta)));
  };

  const handleAdd = () => {
    onAddToCart?.(value);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm uppercase tracking-wider text-foreground/70 font-bold mb-4">
        Quantity
      </h3>
      <div className="flex items-center gap-4">
        <div className="flex items-center border-2 border-border">
          <button
            type="button"
            onClick={() => handleChange(-1)}
            disabled={value <= MIN}
            className="p-3 hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Decrease quantity"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="px-6 py-3 min-w-[4rem] text-center font-bold text-lg">{value}</span>
          <button
            type="button"
            onClick={() => handleChange(1)}
            disabled={value >= MAX}
            className="p-3 hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Increase quantity"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <span className="text-sm text-foreground/60">Free shipping on 3+</span>
      </div>
      <button
        type="button"
        onClick={handleAdd}
        disabled={disabled || added}
        className={`w-full py-4 bg-primary hover:bg-primary-dark border border-primary font-bold text-base tracking-wider uppercase transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${added ? 'animate-button-confirm' : ''}`}
      >
        {added ? (
          <>
            <Check className="w-5 h-5" />
            Added!
          </>
        ) : (
          <>
            <Plus className="w-5 h-5" />
            Add {value} to Cart
          </>
        )}
      </button>
    </div>
  );
}
