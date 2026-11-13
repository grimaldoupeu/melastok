/**
 * Lectura de resumen_diario/{YYYY-MM-DD}. Lo escriben solo las transacciones de
 * ventas y pagos de pedidos; Inicio y Reportes leen de aquí en lugar de recorrer
 * todas las ventas.
 */
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { deCent } from '@/services/ventas-core';
import type { MetodoPago, ResumenDiario } from '@/types/db';

const COL = 'resumen_diario';

const METODOS: MetodoPago[] = ['Yape', 'Plin', 'Efectivo', 'Tarjeta'];

function porMetodo(m: Record<string, number> | undefined): Record<MetodoPago, number> {
  return Object.fromEntries(METODOS.map((k) => [k, deCent(m?.[k] ?? 0)])) as Record<MetodoPago, number>;
}

export function resumenVacioUI(dia: string): ResumenDiario {
  return {
    dia,
    numVentas: 0,
    totalVentas: 0,
    costoVentas: 0,
    unidades: 0,
    ventasPorMetodo: porMetodo(undefined),
    pagosPedidos: 0,
    pagosPedidosPorMetodo: porMetodo(undefined),
  };
}

function toResumen(d: DocumentData): ResumenDiario {
  return {
    dia: String(d.dia),
    numVentas: Number(d.numVentas ?? 0),
    totalVentas: deCent(d.totalCent),
    costoVentas: deCent(d.costoCent),
    unidades: Number(d.unidades ?? 0),
    ventasPorMetodo: porMetodo(d.porMetodoCent),
    pagosPedidos: deCent(d.pagosPedidosCent),
    pagosPedidosPorMetodo: porMetodo(d.pagosPedidosPorMetodoCent),
  };
}

/** Resumen de un día (vacío si aún no hubo operaciones) */
export function observarResumen(dia: string, cb: (r: ResumenDiario) => void, onError?: (e: unknown) => void): Unsubscribe {
  return onSnapshot(doc(db, COL, dia), (snap) => cb(snap.exists() ? toResumen(snap.data()) : resumenVacioUI(dia)), onError);
}

const rangoQuery = (desde: string, hasta: string) =>
  query(collection(db, COL), where('dia', '>=', desde), where('dia', '<=', hasta), orderBy('dia'));

/** Resúmenes entre dos días (incluidos), en tiempo real. Solo trae los días con operaciones. */
export function observarResumenes(desde: string, hasta: string, cb: (r: ResumenDiario[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  return onSnapshot(rangoQuery(desde, hasta), (snap) => cb(snap.docs.map((d) => toResumen(d.data()))), onError);
}

export async function listarResumenes(desde: string, hasta: string): Promise<ResumenDiario[]> {
  const snap = await getDocs(rangoQuery(desde, hasta));
  return snap.docs.map((d) => toResumen(d.data()));
}

/** Suma varios resúmenes */
export function sumarResumenes(lista: ResumenDiario[], dia = ''): ResumenDiario {
  const acc = resumenVacioUI(dia);
  for (const r of lista) {
    acc.numVentas += r.numVentas;
    acc.totalVentas += r.totalVentas;
    acc.costoVentas += r.costoVentas;
    acc.unidades += r.unidades;
    acc.pagosPedidos += r.pagosPedidos;
    for (const m of METODOS) {
      acc.ventasPorMetodo[m] += r.ventasPorMetodo[m];
      acc.pagosPedidosPorMetodo[m] += r.pagosPedidosPorMetodo[m];
    }
  }
  return acc;
}
