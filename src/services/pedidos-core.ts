/**
 * Transacciones de pedidos a medida, independientes de React Native
 * (las usa la app y scripts/test-reglas.ts en el emulador).
 *
 * - crearPedidoTx: correlativo P-0001, etapa "cotizado" y adelanto opcional.
 * - registrarPagoTx: agrega el pago, recalcula pagado/saldo y suma el monto a
 *   resumen_diario/{hoy}.pagosPedidosCent, todo atómico.
 * - cambiarEtapaTx: avanza o retrocede la etapa y la anota en el historial.
 * Los arreglos (pagos, historialEtapas) no admiten serverTimestamp(), por eso
 * llevan Timestamp.now(); las reglas exigen que esté a ±15 min de la hora del servidor.
 */
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  type Firestore,
  type Transaction,
} from 'firebase/firestore';

import { aCent, METODOS_PAGO, resumenVacio, type Usuario } from '@/services/ventas-core';
import { ETAPAS_FLUJO, type EtapaPedido, type MetodoPago } from '@/types/db';

export class PedidoError extends Error {}

export const SERIE_PEDIDO = 'P';

export type NuevoPedidoInput = {
  clienteId: string | null;
  clienteNombre: string;
  clienteTelefono: string | null;
  descripcion: string;
  medidas: string | null;
  materialColor: string | null;
  notas: string | null;
  precio: number; // soles
  fechaEntrega: string | null;
  adelanto: { monto: number; metodo: MetodoPago; nota: string | null } | null;
  /** Día de hoy en Lima (YYYY-MM-DD) */
  dia: string;
};

function nuevoPago(montoCent: number, metodo: MetodoPago, nota: string | null, dia: string, usuario: Usuario) {
  return {
    montoCent,
    metodo,
    fecha: Timestamp.now(),
    dia,
    usuarioId: usuario.uid,
    usuarioNombre: usuario.nombre,
    nota: nota?.trim() || null,
  };
}

/** Suma un pago de pedido al resumen del día (dentro de la transacción) */
async function leerResumen(tx: Transaction, db: Firestore, dia: string) {
  const ref = doc(db, 'resumen_diario', dia);
  const snap = await tx.get(ref);
  return { ref, previo: snap.exists() ? (snap.data() as DocumentData) : null };
}

function escribirResumenConPago(
  tx: Transaction,
  ref: ReturnType<typeof doc>,
  previo: DocumentData | null,
  dia: string,
  montoCent: number,
  pedidoId: string,
  indice: number
) {
  const base = previo ?? { ...resumenVacio(dia), ultimaVentaId: null };
  tx.set(ref, {
    dia,
    numVentas: Number(base.numVentas ?? 0),
    totalCent: Number(base.totalCent ?? 0),
    costoCent: Number(base.costoCent ?? 0),
    unidades: Number(base.unidades ?? 0),
    porMetodoCent: { ...resumenVacio(dia).porMetodoCent, ...(base.porMetodoCent ?? {}) },
    pagosPedidosCent: Number(base.pagosPedidosCent ?? 0) + montoCent,
    ultimaVentaId: base.ultimaVentaId ?? null,
    ultimoPago: { pedidoId, indice },
    actualizadoEn: serverTimestamp(),
  });
}

export async function crearPedidoTx(db: Firestore, input: NuevoPedidoInput, vendedor: Usuario): Promise<{ id: string; codigo: string }> {
  if (!input.clienteNombre.trim()) throw new PedidoError('Ingresa el nombre del cliente');
  if (input.descripcion.trim().length < 3) throw new PedidoError('Describe el mueble a fabricar');
  const precioCent = aCent(input.precio);
  if (precioCent <= 0) throw new PedidoError('Ingresa el precio del pedido');
  const adelantoCent = input.adelanto ? aCent(input.adelanto.monto) : 0;
  if (adelantoCent < 0) throw new PedidoError('El adelanto no puede ser negativo');
  if (adelantoCent > precioCent) throw new PedidoError('El adelanto no puede superar el precio');
  if (input.adelanto && adelantoCent > 0 && !METODOS_PAGO.includes(input.adelanto.metodo)) throw new PedidoError('Método de pago inválido');

  const pedidoRef = doc(collection(db, 'pedidos'));
  const contadorRef = doc(db, 'contadores', 'pedidos');

  return runTransaction(db, async (tx) => {
    const contadorSnap = await tx.get(contadorRef);
    const resumen = adelantoCent > 0 ? await leerResumen(tx, db, input.dia) : null;

    const contador = contadorSnap.exists() ? (contadorSnap.data() as DocumentData) : null;
    const serie = String(contador?.serie ?? SERIE_PEDIDO);
    const numero = Number(contador?.ultimo ?? 0) + 1;
    const codigo = `${serie}-${String(numero).padStart(4, '0')}`;
    const pagos = adelantoCent > 0 ? [nuevoPago(adelantoCent, input.adelanto!.metodo, input.adelanto!.nota ?? 'Adelanto', input.dia, vendedor)] : [];

    tx.set(pedidoRef, {
      numero,
      codigo,
      clienteId: input.clienteId,
      clienteNombre: input.clienteNombre.trim(),
      clienteTelefono: input.clienteTelefono?.trim() || null,
      descripcion: input.descripcion.trim(),
      medidas: input.medidas?.trim() || null,
      materialColor: input.materialColor?.trim() || null,
      notas: input.notas?.trim() || null,
      precioCent,
      pagadoCent: adelantoCent,
      saldoCent: precioCent - adelantoCent,
      costoMaterialesCent: 0,
      etapa: 'cotizado',
      historialEtapas: [{ etapa: 'cotizado', fecha: Timestamp.now(), usuarioId: vendedor.uid, usuarioNombre: vendedor.nombre, nota: null }],
      pagos,
      fechaEntrega: input.fechaEntrega,
      vendedorId: vendedor.uid,
      vendedorNombre: vendedor.nombre,
      creadoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
      ultimoMovimientoId: null,
    });
    tx.set(contadorRef, { serie, ultimo: numero, ultimoPedidoId: pedidoRef.id });
    if (resumen) escribirResumenConPago(tx, resumen.ref, resumen.previo, input.dia, adelantoCent, pedidoRef.id, 0);
    return { id: pedidoRef.id, codigo };
  });
}

/** Registra un pago (adelanto o parcial) y lo suma a la caja del día */
export async function registrarPagoTx(
  db: Firestore,
  input: { pedidoId: string; monto: number; metodo: MetodoPago; nota: string | null; dia: string },
  usuario: Usuario
): Promise<void> {
  const montoCent = aCent(input.monto);
  if (montoCent <= 0) throw new PedidoError('Ingresa un monto mayor a 0');
  if (!METODOS_PAGO.includes(input.metodo)) throw new PedidoError('Método de pago inválido');
  const pedidoRef = doc(db, 'pedidos', input.pedidoId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(pedidoRef);
    if (!snap.exists()) throw new PedidoError('El pedido no existe');
    const p = snap.data() as DocumentData;
    if (p.etapa === 'cancelado') throw new PedidoError('El pedido está cancelado');
    const saldoCent = Number(p.saldoCent ?? 0);
    if (montoCent > saldoCent) throw new PedidoError(`El pago supera el saldo (S/ ${(saldoCent / 100).toFixed(2)})`);
    const resumen = await leerResumen(tx, db, input.dia);

    const pagos = [...((p.pagos ?? []) as unknown[])];
    const indice = pagos.length;
    pagos.push(nuevoPago(montoCent, input.metodo, input.nota, input.dia, usuario));
    const pagadoCent = Number(p.pagadoCent ?? 0) + montoCent;
    tx.update(pedidoRef, {
      pagos,
      pagadoCent,
      saldoCent: Number(p.precioCent) - pagadoCent,
      actualizadoEn: serverTimestamp(),
    });
    escribirResumenConPago(tx, resumen.ref, resumen.previo, input.dia, montoCent, input.pedidoId, indice);
  });
}

/** Cambia la etapa (avanzar, retroceder o cancelar) y la registra en el historial */
export async function cambiarEtapaTx(
  db: Firestore,
  input: { pedidoId: string; etapa: EtapaPedido; nota: string | null },
  usuario: Usuario
): Promise<void> {
  const pedidoRef = doc(db, 'pedidos', input.pedidoId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(pedidoRef);
    if (!snap.exists()) throw new PedidoError('El pedido no existe');
    const p = snap.data() as DocumentData;
    if (p.etapa === 'cancelado') throw new PedidoError('El pedido está cancelado');
    if (p.etapa === input.etapa) throw new PedidoError('El pedido ya está en esa etapa');
    const historial = [...((p.historialEtapas ?? []) as unknown[])];
    historial.push({ etapa: input.etapa, fecha: Timestamp.now(), usuarioId: usuario.uid, usuarioNombre: usuario.nombre, nota: input.nota?.trim() || null });
    tx.update(pedidoRef, { etapa: input.etapa, historialEtapas: historial, actualizadoEn: serverTimestamp() });
  });
}

/** Etapa siguiente / anterior en el flujo normal */
export function etapaSiguiente(e: EtapaPedido): EtapaPedido | null {
  const i = ETAPAS_FLUJO.indexOf(e);
  return i >= 0 && i < ETAPAS_FLUJO.length - 1 ? ETAPAS_FLUJO[i + 1] : null;
}

export function etapaAnterior(e: EtapaPedido): EtapaPedido | null {
  const i = ETAPAS_FLUJO.indexOf(e);
  return i > 0 ? ETAPAS_FLUJO[i - 1] : null;
}
