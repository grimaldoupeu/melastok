/**
 * Lectura del kardex (colección "movimientos"). Los movimientos se crean solo
 * dentro de las transacciones de ventas-core.ts e inventario-core.ts.
 */
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import type { ItemTipo, Movimiento, TipoMovimiento } from '@/types/db';

const COL = 'movimientos';

function toMovimiento(snap: QueryDocumentSnapshot<DocumentData>): Movimiento {
  const d = snap.data();
  return {
    id: snap.id,
    tipo: d.tipo as TipoMovimiento,
    itemTipo: d.itemTipo as ItemTipo,
    itemId: String(d.itemId),
    itemNombre: String(d.itemNombre ?? ''),
    cantidad: Number(d.cantidad ?? 0),
    costoUnitario: d.costoUnitario == null ? null : Number(d.costoUnitario),
    stockAnterior: Number(d.stockAnterior ?? 0),
    stockNuevo: Number(d.stockNuevo ?? 0),
    ventaId: d.ventaId ?? null,
    proveedorId: d.proveedorId ?? null,
    proveedorNombre: d.proveedorNombre ?? null,
    nota: d.nota ?? null,
    usuarioId: String(d.usuarioId ?? ''),
    usuarioNombre: String(d.usuarioNombre ?? ''),
    fecha: d.fecha?.toDate?.() ?? (snap.metadata.hasPendingWrites ? new Date() : null),
  };
}

type Cb = (movimientos: Movimiento[]) => void;

/** Kardex de un producto o material */
export function observarKardexItem(itemId: string, cb: Cb, onError?: (e: unknown) => void, max = 30): Unsubscribe {
  const q = query(collection(db, COL), where('itemId', '==', itemId), orderBy('fecha', 'desc'), limit(max));
  return onSnapshot(q, (snap) => cb(snap.docs.map(toMovimiento)), onError);
}

/** Ingresos de un proveedor */
export function observarKardexProveedor(proveedorId: string, cb: Cb, onError?: (e: unknown) => void, max = 30): Unsubscribe {
  const q = query(collection(db, COL), where('proveedorId', '==', proveedorId), orderBy('fecha', 'desc'), limit(max));
  return onSnapshot(q, (snap) => cb(snap.docs.map(toMovimiento)), onError);
}

/** Últimos movimientos de todo el inventario */
export function observarKardexReciente(cb: Cb, onError?: (e: unknown) => void, max = 200): Unsubscribe {
  const q = query(collection(db, COL), orderBy('fecha', 'desc'), limit(max));
  return onSnapshot(q, (snap) => cb(snap.docs.map(toMovimiento)), onError);
}
