/**
 * Servicio de ventas (colección "ventas") para la app.
 * La lógica transaccional vive en ventas-core.ts (también probada en el emulador).
 */
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { toISODate } from '@/lib/format';
import { guardarClienteDeVenta, idDeCliente } from '@/services/clientes';
import {
  cancelarVentaTx,
  deCent,
  registrarVentaTx,
  type NuevaVentaInput,
  type Usuario,
  type VentaRegistrada,
} from '@/services/ventas-core';
import type { EstadoEntrega, MetodoPago, Venta } from '@/types/db';

export { MAX_ITEMS_VENTA, SIGUIENTE_ESTADO, VentaError } from '@/services/ventas-core';

const COL = 'ventas';

export function toVenta(snap: DocumentSnapshot<DocumentData>): Venta | null {
  if (!snap.exists()) return null;
  const d = snap.data();
  const items = (d.items ?? []) as { productoId: string; nombre: string; cantidad: number; precioCent: number; costoCent: number; totalCent: number }[];
  return {
    id: snap.id,
    numeroBoleta: Number(d.numeroBoleta ?? 0),
    codigoBoleta: String(d.codigoBoleta ?? ''),
    clienteId: d.clienteId ?? null,
    clienteNombre: String(d.clienteNombre ?? ''),
    clienteTelefono: d.clienteTelefono ?? null,
    vendedorId: String(d.vendedorId ?? ''),
    vendedorNombre: String(d.vendedorNombre ?? ''),
    items: items.map((i) => ({
      productoId: i.productoId,
      nombre: i.nombre,
      cantidad: Number(i.cantidad),
      precio: deCent(i.precioCent),
      costo: deCent(i.costoCent),
      total: deCent(i.totalCent),
    })),
    metodoPago: d.metodoPago as MetodoPago,
    subtotal: deCent(d.subtotalCent),
    descuento: deCent(d.descuentoCent),
    deliveryCosto: deCent(d.deliveryCent),
    deliveryDireccion: d.deliveryDireccion ?? null,
    total: deCent(d.totalCent),
    costoTotal: deCent(d.costoTotalCent),
    unidades: Number(d.unidades ?? 0),
    fechaEntrega: d.fechaEntrega ?? null,
    estadoEntrega: (d.estadoEntrega ?? 'entregado') as EstadoEntrega,
    notas: d.notas ?? null,
    // Mientras el servidor no confirma la escritura, serverTimestamp() es null
    fecha: d.fecha?.toDate?.() ?? (snap.metadata.hasPendingWrites ? new Date() : null),
    dia: String(d.dia ?? ''),
    canceladaEn: d.canceladaEn?.toDate?.() ?? null,
    canceladaPorNombre: d.canceladaPorNombre ?? null,
  };
}

export type DatosVenta = Omit<NuevaVentaInput, 'clienteId' | 'dia'> & { clienteDireccion: string | null };

/**
 * Registra la venta (transacción atómica) y luego guarda o actualiza el cliente.
 * El cliente se guarda aparte porque no afecta stock, boleta ni resumen.
 */
export async function registrarVenta(datos: DatosVenta, vendedor: Usuario): Promise<VentaRegistrada> {
  const clienteId = idDeCliente(datos.clienteTelefono);
  const resultado = await registrarVentaTx(db, { ...datos, clienteId, dia: toISODate(new Date()) }, vendedor);
  guardarClienteDeVenta({
    id: clienteId,
    nombre: datos.clienteNombre,
    telefono: datos.clienteTelefono,
    direccion: datos.clienteDireccion ?? datos.deliveryDireccion,
  }).catch(() => undefined);
  return resultado;
}

export function cancelarVenta(ventaId: string, admin: Usuario) {
  return cancelarVentaTx(db, ventaId, admin);
}

export async function cambiarEstadoEntrega(ventaId: string, estado: Exclude<EstadoEntrega, 'cancelado'>) {
  await updateDoc(doc(db, COL, ventaId), { estadoEntrega: estado, actualizadoEn: serverTimestamp() });
}

export function observarVenta(id: string, cb: (venta: Venta | null) => void, onError?: (e: unknown) => void): Unsubscribe {
  return onSnapshot(doc(db, COL, id), { includeMetadataChanges: false }, (snap) => cb(toVenta(snap)), onError);
}

/** Ventas desde una fecha (historial), las más recientes primero */
export function observarVentasDesde(desde: Date | null, cb: (ventas: Venta[]) => void, onError?: (e: unknown) => void, max = 300): Unsubscribe {
  const base = collection(db, COL);
  const q = desde
    ? query(base, where('fecha', '>=', desde), orderBy('fecha', 'desc'), limit(max))
    : query(base, orderBy('fecha', 'desc'), limit(max));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => toVenta(d)!)), onError);
}

/** Últimas N ventas (panel de inicio) */
export function observarUltimasVentas(n: number, cb: (ventas: Venta[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  return observarVentasDesde(null, cb, onError, n);
}

export type FiltroEntregas = 'activos' | EstadoEntrega;
export const ESTADOS_ACTIVOS: EstadoEntrega[] = ['pendiente', 'en_produccion', 'listo'];

/** Ventas con entrega programada, por estado (pestaña Pedidos > Entregas) */
export function observarEntregas(filtro: FiltroEntregas, cb: (ventas: Venta[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const base = collection(db, COL);
  const q =
    filtro === 'activos'
      ? query(base, where('estadoEntrega', 'in', ESTADOS_ACTIVOS), orderBy('fechaEntrega', 'asc'), limit(200))
      : filtro === 'entregado'
        ? // Solo las que tenían entrega programada (las ventas al paso nacen "entregado")
          query(base, where('estadoEntrega', '==', 'entregado'), where('fechaEntrega', '!=', null), orderBy('fechaEntrega', 'desc'), limit(100))
        : filtro === 'cancelado'
          ? query(base, where('estadoEntrega', '==', 'cancelado'), orderBy('fecha', 'desc'), limit(100))
          : query(base, where('estadoEntrega', '==', filtro), orderBy('fechaEntrega', 'asc'), limit(200));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => toVenta(d)!)), onError);
}

/** Día de hoy (Lima) para el resumen */
export const hoy = () => toISODate(new Date());
