import { create } from 'zustand';

import type { Product } from '@/types/db';

export type CartItem = {
  product: Product;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  add: (product: Product, quantity?: number) => 'ok' | 'sin_stock';
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  increment: (productId: string) => 'ok' | 'sin_stock';
  decrement: (productId: string) => void;
  clear: () => void;
};

export const useCart = create<CartState>((set, get) => ({
  items: [],

  add: (product, quantity = 1) => {
    const items = get().items;
    const existing = items.find((i) => i.product.id === product.id);
    const current = existing?.quantity ?? 0;
    if (current + quantity > product.stock) return 'sin_stock';
    if (existing) {
      set({
        items: items.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + quantity, product } : i
        ),
      });
    } else {
      set({ items: [...items, { product, quantity }] });
    }
    return 'ok';
  },

  remove: (productId) => set({ items: get().items.filter((i) => i.product.id !== productId) }),

  setQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().remove(productId);
      return;
    }
    set({
      items: get().items.map((i) =>
        i.product.id === productId ? { ...i, quantity: Math.min(quantity, i.product.stock) } : i
      ),
    });
  },

  increment: (productId) => {
    const item = get().items.find((i) => i.product.id === productId);
    if (!item) return 'sin_stock';
    if (item.quantity + 1 > item.product.stock) return 'sin_stock';
    get().setQuantity(productId, item.quantity + 1);
    return 'ok';
  },

  decrement: (productId) => {
    const item = get().items.find((i) => i.product.id === productId);
    if (!item) return;
    get().setQuantity(productId, item.quantity - 1);
  },

  clear: () => set({ items: [] }),
}));

/** Selectores derivados */
export const selectCartCount = (s: CartState) => s.items.reduce((n, i) => n + i.quantity, 0);
export const selectCartSubtotal = (s: CartState) =>
  s.items.reduce((n, i) => n + i.quantity * Number(i.product.price), 0);
export const selectQuantityOf = (productId: string) => (s: CartState) =>
  s.items.find((i) => i.product.id === productId)?.quantity ?? 0;
