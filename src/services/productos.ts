/**
 * Servicio de productos del catálogo (colección "productos").
 *
 * El stock NO se modifica desde aquí salvo al crear el producto: las ventas lo
 * descuentan en su transacción (fase 3) y los ajustes pasan por el kardex (fase 4).
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import type { Producto } from '@/types/db';

const COL = 'productos';

export function toProducto(snap: DocumentSnapshot<DocumentData>): Producto | null {
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id,
    nombre: String(d.nombre ?? ''),
    descripcion: d.descripcion ?? null,
    categoriaId: d.categoriaId ?? null,
    categoriaNombre: d.categoriaNombre ?? null,
    precio: Number(d.precio ?? 0),
    costo: d.costo == null ? null : Number(d.costo),
    stock: Number(d.stock ?? 0),
    stockMinimo: Number(d.stockMinimo ?? 0),
    fotoUrl: d.fotoUrl ?? null,
    activo: d.activo !== false,
    creadoEn: d.creadoEn?.toDate?.() ?? null,
    actualizadoEn: d.actualizadoEn?.toDate?.() ?? null,
  };
}

/** Productos visibles en el catálogo (activos), en tiempo real */
export function observarProductosActivos(cb: (productos: Producto[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const q = query(collection(db, COL), where('activo', '==', true), orderBy('nombre'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => toProducto(d)!)), onError);
}

/** Todos los productos (inventario, admin), en tiempo real */
export function observarProductos(cb: (productos: Producto[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const q = query(collection(db, COL), orderBy('nombre'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => toProducto(d)!)), onError);
}

export function observarProducto(id: string, cb: (producto: Producto | null) => void, onError?: (e: unknown) => void): Unsubscribe {
  return onSnapshot(doc(db, COL, id), (snap) => cb(toProducto(snap)), onError);
}

export async function obtenerProducto(id: string): Promise<Producto | null> {
  return toProducto(await getDoc(doc(db, COL, id)));
}

export type ProductoInput = {
  nombre: string;
  descripcion: string | null;
  categoriaId: string | null;
  categoriaNombre: string | null;
  precio: number;
  costo: number | null;
  stockMinimo: number;
  activo: boolean;
};

export async function crearProducto(data: ProductoInput & { stock: number; fotoUrl?: string | null }): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    fotoUrl: data.fotoUrl ?? null,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
  return ref.id;
}

/** Actualiza los datos del producto. `stock` solo lo puede tocar el admin (las reglas lo validan). */
export async function actualizarProducto(id: string, data: Partial<ProductoInput> & { stock?: number; fotoUrl?: string | null }) {
  await updateDoc(doc(db, COL, id), { ...data, actualizadoEn: serverTimestamp() });
}

export async function eliminarProducto(id: string) {
  await deleteDoc(doc(db, COL, id));
}

/** Al renombrar una categoría, actualiza el nombre desnormalizado en sus productos */
export async function sincronizarNombreCategoria(categoriaId: string, categoriaNombre: string | null) {
  const snap = await getDocs(query(collection(db, COL), where('categoriaId', '==', categoriaId)));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { categoriaNombre, ...(categoriaNombre === null ? { categoriaId: null } : {}) }));
  await batch.commit();
}
