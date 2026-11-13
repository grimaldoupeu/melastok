/**
 * Servicio de materiales (colección "materiales").
 * El stock solo cambia por src/services/inventario.ts (con movimiento de kardex).
 */
import {
  collection,
  deleteDoc,
  doc,
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
import type { Material, TipoMaterial } from '@/types/db';

const COL = 'materiales';

export function toMaterial(snap: DocumentSnapshot<DocumentData>): Material | null {
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id,
    nombre: String(d.nombre ?? ''),
    tipo: (d.tipo ?? 'otro') as TipoMaterial,
    color: d.color ?? null,
    espesorMm: d.espesorMm == null ? null : Number(d.espesorMm),
    unidad: String(d.unidad ?? 'und'),
    stock: Number(d.stock ?? 0),
    stockMinimo: Number(d.stockMinimo ?? 0),
    ultimoCosto: d.ultimoCosto == null ? null : Number(d.ultimoCosto),
    proveedorId: d.proveedorId ?? null,
    proveedorNombre: d.proveedorNombre ?? null,
    actualizadoEn: d.actualizadoEn?.toDate?.() ?? null,
  };
}

export function observarMateriales(cb: (materiales: Material[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const q = query(collection(db, COL), orderBy('tipo'), orderBy('nombre'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => toMaterial(d)!)), onError);
}

export function observarMaterial(id: string, cb: (material: Material | null) => void, onError?: (e: unknown) => void): Unsubscribe {
  return onSnapshot(doc(db, COL, id), (snap) => cb(toMaterial(snap)), onError);
}

export type MaterialInput = {
  nombre: string;
  tipo: TipoMaterial;
  color: string | null;
  espesorMm: number | null;
  unidad: string;
  stockMinimo: number;
  ultimoCosto: number | null;
  proveedorId: string | null;
  proveedorNombre: string | null;
};

/** Edita los datos del material (no el stock) */
export async function actualizarMaterial(id: string, data: Partial<MaterialInput>) {
  await updateDoc(doc(db, COL, id), { ...data, actualizadoEn: serverTimestamp() });
}

export async function eliminarMaterial(id: string) {
  await deleteDoc(doc(db, COL, id));
}

/** Al renombrar o borrar un proveedor, actualiza el nombre guardado en sus materiales */
export async function sincronizarNombreProveedor(proveedorId: string, proveedorNombre: string | null) {
  const snap = await getDocs(query(collection(db, COL), where('proveedorId', '==', proveedorId)));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) =>
    batch.update(d.ref, { proveedorNombre, ...(proveedorNombre === null ? { proveedorId: null } : {}), actualizadoEn: serverTimestamp() })
  );
  await batch.commit();
}
