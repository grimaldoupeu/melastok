/**
 * Servicio de categorías de productos (colección "categorias").
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { CATEGORIAS_SUGERIDAS, type Categoria } from '@/types/db';

const COL = 'categorias';

function toCategoria(snap: QueryDocumentSnapshot<DocumentData>): Categoria {
  const d = snap.data();
  return {
    id: snap.id,
    nombre: String(d.nombre ?? ''),
    icono: String(d.icono ?? 'cube-outline'),
    orden: Number(d.orden ?? 0),
  };
}

const categoriasQuery = () => query(collection(db, COL), orderBy('orden'), orderBy('nombre'));

export function observarCategorias(cb: (categorias: Categoria[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  return onSnapshot(categoriasQuery(), (snap) => cb(snap.docs.map(toCategoria)), onError);
}

export async function listarCategorias(): Promise<Categoria[]> {
  const snap = await getDocs(categoriasQuery());
  return snap.docs.map(toCategoria);
}

export async function crearCategoria(data: { nombre: string; icono: string; orden?: number }): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    nombre: data.nombre.trim(),
    icono: data.icono,
    orden: data.orden ?? 99,
  });
  return ref.id;
}

export async function actualizarCategoria(id: string, data: Partial<Pick<Categoria, 'nombre' | 'icono' | 'orden'>>) {
  await updateDoc(doc(db, COL, id), data);
}

export async function eliminarCategoria(id: string) {
  await deleteDoc(doc(db, COL, id));
}

/** Carga las categorías sugeridas (solo cuando la colección está vacía) */
export async function cargarCategoriasSugeridas(): Promise<number> {
  const existentes = await listarCategorias();
  if (existentes.length) return 0;
  const batch = writeBatch(db);
  CATEGORIAS_SUGERIDAS.forEach((c, i) => {
    batch.set(doc(collection(db, COL)), { nombre: c.nombre, icono: c.icono, orden: i + 1 });
  });
  await batch.commit();
  return CATEGORIAS_SUGERIDAS.length;
}
