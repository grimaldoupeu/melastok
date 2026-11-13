import { MAX_ITEMS_VENTA } from '@/services/ventas-core';
import type { AddResult } from '@/store/cart';

/** Mensaje para el toast cuando no se pudo agregar un producto al carrito (o null si se agregó) */
export function mensajeAgregar(r: AddResult, nombre: string): string | null {
  if (r === 'sin_stock') return `No hay más stock de ${nombre}`;
  if (r === 'max_items') return `Una boleta admite hasta ${MAX_ITEMS_VENTA} productos distintos`;
  return null;
}
