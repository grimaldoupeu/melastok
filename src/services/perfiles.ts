/**
 * Servicio de perfiles de usuario (colección "perfiles", id = uid de Auth).
 */
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type DocumentSnapshot,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import type { Perfil, Rol } from '@/types/db';

const COL = 'perfiles';

function toPerfil(snap: DocumentSnapshot<DocumentData>): Perfil | null {
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id,
    nombre: String(d.nombre ?? 'Usuario'),
    email: String(d.email ?? ''),
    rol: d.rol === 'admin' ? 'admin' : 'vendedor',
    activo: d.activo !== false,
    creadoEn: d.creadoEn?.toDate?.() ?? null,
  };
}

export async function obtenerPerfil(uid: string): Promise<Perfil | null> {
  return toPerfil(await getDoc(doc(db, COL, uid)));
}

/** Escucha el perfil en tiempo real (cambios de rol o desactivación se aplican al instante) */
export function observarPerfil(uid: string, cb: (perfil: Perfil | null) => void, onError?: (e: unknown) => void) {
  return onSnapshot(doc(db, COL, uid), (snap) => cb(toPerfil(snap)), onError);
}

/** Crea el perfil de un usuario. Un usuario solo puede crear el suyo como vendedor; el admin puede crear cualquiera. */
export async function crearPerfil(uid: string, data: { nombre: string; email: string; rol: Rol; activo?: boolean }) {
  await setDoc(doc(db, COL, uid), {
    nombre: data.nombre,
    email: data.email,
    rol: data.rol,
    activo: data.activo ?? true,
    creadoEn: serverTimestamp(),
  });
}

/**
 * Si el usuario autenticado aún no tiene perfil (creado desde la consola o registrado
 * por su cuenta en Auth), lo crea como vendedor INACTIVO: queda pendiente hasta que
 * el admin lo apruebe en "Gestionar usuarios". Las reglas solo permiten esta forma.
 */
export async function asegurarPerfil(uid: string, nombre: string, email: string): Promise<Perfil> {
  const existente = await obtenerPerfil(uid);
  if (existente) return existente;
  await crearPerfil(uid, { nombre, email, rol: 'vendedor', activo: false });
  return { id: uid, nombre, email, rol: 'vendedor', activo: false, creadoEn: new Date() };
}

/** Aprueba un perfil pendiente (solo admin) */
export async function aprobarPerfil(uid: string) {
  await actualizarPerfil(uid, { activo: true });
}

export async function actualizarPerfil(uid: string, data: Partial<Pick<Perfil, 'nombre' | 'rol' | 'activo'>>) {
  await updateDoc(doc(db, COL, uid), { ...data, actualizadoEn: serverTimestamp() });
}

/** Lista todos los perfiles en tiempo real (pantalla Usuarios, solo admin) */
export function observarPerfiles(cb: (perfiles: Perfil[]) => void, onError?: (e: unknown) => void) {
  const q = query(collection(db, COL), orderBy('nombre'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => toPerfil(d)!).filter(Boolean)), onError);
}
