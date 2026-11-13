/**
 * Servicio de clientes (colección "clientes").
 * Si el cliente tiene teléfono, su id es "tel-<9 dígitos>": así la misma persona
 * no se duplica entre ventas y no hace falta una consulta para encontrarla.
 */
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import type { Cliente } from '@/types/db';

const COL = 'clientes';

function toCliente(snap: QueryDocumentSnapshot<DocumentData>): Cliente {
  const d = snap.data();
  return {
    id: snap.id,
    nombre: String(d.nombre ?? ''),
    telefono: d.telefono ?? null,
    direccion: d.direccion ?? null,
    ultimaCompraEn: d.ultimaCompraEn?.toDate?.() ?? null,
  };
}

/** Normaliza un teléfono peruano a 9 dígitos (o null) */
export function normalizarTelefono(telefono: string | null | undefined): string | null {
  const digits = (telefono ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('51')) return digits.slice(2);
  return digits.length === 9 ? digits : null;
}

/** Id del cliente: por teléfono si lo tiene; si no, un id nuevo */
export function idDeCliente(telefono: string | null | undefined): string {
  const tel = normalizarTelefono(telefono);
  return tel ? `tel-${tel}` : doc(collection(db, COL)).id;
}

/** Clientes recientes (para buscar al registrar una venta), en tiempo real */
export function observarClientesRecientes(cb: (clientes: Cliente[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const q = query(collection(db, COL), orderBy('ultimaCompraEn', 'desc'), limit(300));
  return onSnapshot(q, (snap) => cb(snap.docs.map(toCliente)), onError);
}

/** Crea o actualiza el cliente después de una venta */
export async function guardarClienteDeVenta(c: { id: string; nombre: string; telefono: string | null; direccion: string | null }) {
  const ref = doc(db, COL, c.id);
  const existe = (await getDoc(ref)).exists();
  await setDoc(
    ref,
    {
      nombre: c.nombre.trim(),
      telefono: normalizarTelefono(c.telefono),
      ...(c.direccion ? { direccion: c.direccion.trim() } : existe ? {} : { direccion: null }),
      ultimaCompraEn: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
      ...(existe ? {} : { creadoEn: serverTimestamp() }),
    },
    { merge: true }
  );
}
