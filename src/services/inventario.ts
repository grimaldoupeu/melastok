/**
 * Operaciones de inventario para la app (envuelven las transacciones de
 * inventario-core.ts con la instancia de Firestore).
 */
import { db } from '@/lib/firebase';
import {
  ajustarStockTx,
  crearItemConStockTx,
  ingresarMaterialTx,
  salidaMaterialTx,
  type Usuario,
} from '@/services/inventario-core';
import type { MaterialInput } from '@/services/materiales';
import type { ProductoInput } from '@/services/productos';
import type { ItemTipo } from '@/types/db';

export { InventarioError } from '@/services/inventario-core';

export function ingresarMaterial(
  input: { materialId: string; cantidad: number; costoUnitario: number | null; proveedor: { id: string; nombre: string } | null; nota: string | null },
  usuario: Usuario
) {
  return ingresarMaterialTx(db, input, usuario);
}

export function registrarConsumoMaterial(input: { materialId: string; cantidad: number; nota: string | null; pedidoId?: string | null }, usuario: Usuario) {
  return salidaMaterialTx(db, input, usuario);
}

export function ajustarStock(input: { itemTipo: ItemTipo; itemId: string; stockNuevo: number; motivo: string }, admin: Usuario) {
  return ajustarStockTx(db, input, admin);
}

export function crearProducto(datos: ProductoInput & { fotoUrl?: string | null }, stockInicial: number, admin: Usuario) {
  return crearItemConStockTx(db, 'producto', { ...datos, fotoUrl: datos.fotoUrl ?? null }, stockInicial, admin);
}

export function crearMaterial(datos: MaterialInput, stockInicial: number, admin: Usuario) {
  return crearItemConStockTx(db, 'material', datos, stockInicial, admin);
}
