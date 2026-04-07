'use client';

import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { getSubtotalCents, getShippingCents, getTotalCents, qualifiesForFreeShipping } from '@/lib/shopPricing';
import { MAX_LINE_ITEM_QUANTITY, MAX_CART_TOTAL_QUANTITY } from '@/lib/constants/shopLimits';

const LEGACY_STORAGE_KEY = 'iamresist_cart';
const STORAGE_KEY = 'iamresist_cart_v2';

const CartContext = createContext(null);

function clampInt(n, min, max) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/** Align with server checkout: integer qty, caps, merge same slug+productKey */
function sanitizeCartItems(list) {
  if (!Array.isArray(list)) return [];
  const merged = new Map();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const slug = typeof raw.slug === 'string' ? raw.slug : '';
    const productKey = typeof raw.productKey === 'string' ? raw.productKey : '';
    if (!slug || !productKey) continue;
    const q = clampInt(raw.quantity, 1, MAX_LINE_ITEM_QUANTITY);
    const k = `${slug}::${productKey}`;
    const prev = merged.get(k);
    const nextQty = Math.min(
      MAX_LINE_ITEM_QUANTITY,
      (prev?.quantity ?? 0) + q
    );
    merged.set(k, {
      slug,
      productKey,
      quantity: nextQty,
      name: raw.name,
      image: raw.image,
    });
  }
  let out = Array.from(merged.values());
  let total = out.reduce((s, i) => s + i.quantity, 0);
  while (total > MAX_CART_TOTAL_QUANTITY && out.length > 0) {
    const last = out[out.length - 1];
    const over = total - MAX_CART_TOTAL_QUANTITY;
    if (last.quantity > over) {
      last.quantity -= over;
      total = MAX_CART_TOTAL_QUANTITY;
    } else {
      total -= last.quantity;
      out = out.slice(0, -1);
    }
  }
  return out;
}

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setItems(sanitizeCartItems(parsed));
        }
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore storage errors
    }
  }, [items]);

  const addItem = useCallback((product, quantity, productKey) => {
    if (!product || quantity < 1) return;
    const key = productKey ?? product.bundles?.[0]?.productKey;
    if (!key) return;
    const q = clampInt(quantity, 1, MAX_LINE_ITEM_QUANTITY);

    setItems((prev) => {
      const sanitized = sanitizeCartItems(prev);
      const existing = sanitized.find((i) => i.slug === product.slug && i.productKey === key);
      const newQty = Math.min(
        MAX_LINE_ITEM_QUANTITY,
        (existing?.quantity ?? 0) + q
      );
      const entry = {
        slug: product.slug,
        productKey: key,
        quantity: newQty,
        name: product.name,
        image: product.image,
      };
      let next;
      if (existing) {
        next = sanitized.map((i) =>
          i.slug === product.slug && i.productKey === key ? entry : i
        );
      } else {
        next = [...sanitized, { ...entry, quantity: q }];
      }
      return sanitizeCartItems(next);
    });
  }, []);

  const removeItem = useCallback((slug) => {
    setItems((prev) => prev.filter((i) => i.slug !== slug));
  }, []);

  const updateQuantity = useCallback((slug, quantity) => {
    const q = clampInt(quantity, 0, MAX_LINE_ITEM_QUANTITY);
    if (q < 1) {
      setItems((prev) => prev.filter((i) => i.slug !== slug));
      return;
    }
    setItems((prev) =>
      sanitizeCartItems(
        prev.map((i) => (i.slug === slug ? { ...i, quantity: q } : i))
      )
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotalCents = getSubtotalCents(totalQuantity);
  const shippingCents = getShippingCents(totalQuantity);
  const totalCents = getTotalCents(totalQuantity);
  const freeShipping = qualifiesForFreeShipping(totalQuantity);

  const value = {
    items,
    totalQuantity,
    subtotalCents,
    shippingCents,
    totalCents,
    freeShipping,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
