import { create } from 'zustand';

import { MAX_ITEMS_VENTA } from '@/services/ventas-core';
import type { Producto } from '@/types/db';

export type AddResult = 'ok' | 'sin_stock' | 'max_items';

export type CartItem = {
  producto: Producto;
  cantidad: number;
};

type CartState = {
  items: CartItem[];
  add: (producto: Producto, cantidad?: number) => AddResult;
  remove: (productoId: string) => void;
  setQuantity: (productoId: string, cantidad: number) => void;
  increment: (productoId: string) => 'ok' | 'sin_stock';
  decrement: (productoId: string) => void;
  /** Actualiza precio/stock de los productos del carrito con datos frescos del catálogo */
  sync: (productos: Producto[]) => void;
  clear: () => void;
};

export const useCart = create<CartState>((set, get) => ({
  items: [],

  add: (producto, cantidad = 1) => {
    const items = get().items;
    const existing = items.find((i) => i.producto.id === producto.id);
    const current = existing?.cantidad ?? 0;
    if (current + cantidad > producto.stock) return 'sin_stock';
    if (!existing && items.length >= MAX_ITEMS_VENTA) return 'max_items';
    if (existing) {
      set({
        items: items.map((i) => (i.producto.id === producto.id ? { ...i, cantidad: i.cantidad + cantidad, producto } : i)),
      });
    } else {
      set({ items: [...items, { producto, cantidad }] });
    }
    return 'ok';
  },

  remove: (productoId) => set({ items: get().items.filter((i) => i.producto.id !== productoId) }),

  setQuantity: (productoId, cantidad) => {
    if (cantidad <= 0) {
      get().remove(productoId);
      return;
    }
    set({
      items: get().items.map((i) => (i.producto.id === productoId ? { ...i, cantidad: Math.min(cantidad, i.producto.stock) } : i)),
    });
  },

  increment: (productoId) => {
    const item = get().items.find((i) => i.producto.id === productoId);
    if (!item) return 'sin_stock';
    if (item.cantidad + 1 > item.producto.stock) return 'sin_stock';
    get().setQuantity(productoId, item.cantidad + 1);
    return 'ok';
  },

  decrement: (productoId) => {
    const item = get().items.find((i) => i.producto.id === productoId);
    if (!item) return;
    get().setQuantity(productoId, item.cantidad - 1);
  },

  sync: (productos) => {
    const byId = new Map(productos.map((p) => [p.id, p]));
    set({
      items: get()
        .items.map((i) => {
          const fresh = byId.get(i.producto.id);
          if (!fresh || !fresh.activo) return null;
          return { producto: fresh, cantidad: Math.min(i.cantidad, fresh.stock) };
        })
        .filter((i): i is CartItem => !!i && i.cantidad > 0),
    });
  },

  clear: () => set({ items: [] }),
}));

/** Selectores derivados */
export const selectCartCount = (s: CartState) => s.items.reduce((n, i) => n + i.cantidad, 0);
export const selectCartSubtotal = (s: CartState) => s.items.reduce((n, i) => n + i.cantidad * Number(i.producto.precio), 0);
export const selectQuantityOf = (productoId: string) => (s: CartState) => s.items.find((i) => i.producto.id === productoId)?.cantidad ?? 0;
