/**
 * Servicio de proveedores (colección "proveedores"). Escribe solo el admin.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { sincronizarNombreProveedor } from '@/services/materiales';
import type { Proveedor } from '@/types/db';

const COL = 'proveedores';

function toProveedor(snap: DocumentSnapshot<DocumentData>): Proveedor | null {
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id,
    nombre: String(d.nombre ?? ''),
    telefono: d.telefono ?? null,
    contacto: d.contacto ?? null,
    direccion: d.direccion ?? null,
    notas: d.notas ?? null,
  };
}

export function observarProveedores(cb: (proveedores: Proveedor[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  return onSnapshot(query(collection(db, COL), orderBy('nombre')), (snap) => cb(snap.docs.map((d) => toProveedor(d)!)), onError);
}

export function observarProveedor(id: string, cb: (p: Proveedor | null) => void, onError?: (e: unknown) => void): Unsubscribe {
  return onSnapshot(doc(db, COL, id), (snap) => cb(toProveedor(snap)), onError);
}

export type ProveedorInput = Omit<Proveedor, 'id'>;

export async function crearProveedor(data: ProveedorInput): Promise<string> {
  const ref = await addDoc(collection(db, COL), { ...data, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
  return ref.id;
}

export async function actualizarProveedor(id: string, data: ProveedorInput, nombreAnterior: string) {
  await updateDoc(doc(db, COL, id), { ...data, actualizadoEn: serverTimestamp() });
  if (data.nombre !== nombreAnterior) await sincronizarNombreProveedor(id, data.nombre);
}

export async function eliminarProveedor(id: string) {
  await sincronizarNombreProveedor(id, null);
  await deleteDoc(doc(db, COL, id));
}
