/**
 * Servicio de pedidos a medida (colección "pedidos") para la app.
 * Las transacciones viven en pedidos-core.ts (probadas en el emulador).
 */
import {
  collection,
  doc,
  getDocs,
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
import { cambiarEtapaTx, crearPedidoTx, registrarPagoTx, type NuevoPedidoInput } from '@/services/pedidos-core';
import { aCent, deCent, type Usuario } from '@/services/ventas-core';
import type { EtapaPedido, HistorialEtapa, MetodoPago, PagoPedido, Pedido } from '@/types/db';

export { etapaAnterior, etapaSiguiente, PedidoError } from '@/services/pedidos-core';

const COL = 'pedidos';

export const ETAPAS_EN_PROCESO: EtapaPedido[] = ['cotizado', 'corte', 'enchapado', 'armado'];

export function toPedido(snap: DocumentSnapshot<DocumentData>): Pedido | null {
  if (!snap.exists()) return null;
  const d = snap.data();
  const pagos = (d.pagos ?? []) as DocumentData[];
  const historial = (d.historialEtapas ?? []) as DocumentData[];
  return {
    id: snap.id,
    numero: Number(d.numero ?? 0),
    codigo: String(d.codigo ?? ''),
    clienteId: d.clienteId ?? null,
    clienteNombre: String(d.clienteNombre ?? ''),
    clienteTelefono: d.clienteTelefono ?? null,
    descripcion: String(d.descripcion ?? ''),
    medidas: d.medidas ?? null,
    materialColor: d.materialColor ?? null,
    notas: d.notas ?? null,
    precio: deCent(d.precioCent),
    pagado: deCent(d.pagadoCent),
    saldo: deCent(d.saldoCent),
    costoMateriales: deCent(d.costoMaterialesCent),
    etapa: (d.etapa ?? 'cotizado') as EtapaPedido,
    historialEtapas: historial.map(
      (h): HistorialEtapa => ({
        etapa: h.etapa,
        fecha: h.fecha?.toDate?.() ?? null,
        usuarioId: h.usuarioId,
        usuarioNombre: h.usuarioNombre,
        nota: h.nota ?? null,
      })
    ),
    pagos: pagos.map(
      (p): PagoPedido => ({
        monto: deCent(p.montoCent),
        metodo: p.metodo as MetodoPago,
        fecha: p.fecha?.toDate?.() ?? null,
        dia: p.dia,
        usuarioId: p.usuarioId,
        usuarioNombre: p.usuarioNombre,
        nota: p.nota ?? null,
      })
    ),
    fechaEntrega: d.fechaEntrega ?? null,
    vendedorId: String(d.vendedorId ?? ''),
    vendedorNombre: String(d.vendedorNombre ?? ''),
    creadoEn: d.creadoEn?.toDate?.() ?? (snap.metadata.hasPendingWrites ? new Date() : null),
    actualizadoEn: d.actualizadoEn?.toDate?.() ?? null,
  };
}

export type FiltroPedidos = 'proceso' | 'terminados' | 'entregados' | 'cancelados';

export function observarPedidos(filtro: FiltroPedidos, cb: (p: Pedido[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const base = collection(db, COL);
  const q =
    filtro === 'proceso'
      ? query(base, where('etapa', 'in', ETAPAS_EN_PROCESO), orderBy('fechaEntrega', 'asc'), limit(200))
      : filtro === 'terminados'
        ? query(base, where('etapa', '==', 'entrega'), orderBy('fechaEntrega', 'asc'), limit(200))
        : query(base, where('etapa', '==', filtro === 'entregados' ? 'entregado' : 'cancelado'), orderBy('actualizadoEn', 'desc'), limit(100));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => toPedido(d)!)), onError);
}

/** Pedidos que aún pueden recibir consumo de material (en proceso o terminados) */
export function observarPedidosAbiertos(cb: (p: Pedido[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const q = query(collection(db, COL), where('etapa', 'in', [...ETAPAS_EN_PROCESO, 'entrega']), orderBy('fechaEntrega', 'asc'), limit(200));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => toPedido(d)!)), onError);
}

/** Pedidos que recibieron algún pago en un día (cierre de caja) */
export function observarPedidosConPagosEn(dia: string, cb: (p: Pedido[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const q = query(collection(db, COL), where('diasPago', 'array-contains', dia), limit(500));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => toPedido(d)!)), onError);
}

/** Pedidos entregados actualizados desde una fecha (reportes; filtrar luego por fecha de entrega real) */
export async function listarPedidosEntregadosDesde(desde: Date): Promise<Pedido[]> {
  const q = query(collection(db, COL), where('etapa', '==', 'entregado'), where('actualizadoEn', '>=', desde), orderBy('actualizadoEn', 'desc'), limit(500));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toPedido(d)!);
}

/** Fecha en que el pedido pasó a "entregado" (la última vez) */
export function fechaEntregado(p: Pedido): Date | null {
  for (let i = p.historialEtapas.length - 1; i >= 0; i--) {
    if (p.historialEtapas[i].etapa === 'entregado') return p.historialEtapas[i].fecha;
  }
  return null;
}

export function observarPedido(id: string, cb: (p: Pedido | null) => void, onError?: (e: unknown) => void): Unsubscribe {
  return onSnapshot(doc(db, COL, id), (snap) => cb(toPedido(snap)), onError);
}

export type DatosPedido = Omit<NuevoPedidoInput, 'clienteId' | 'dia'>;

export async function crearPedido(datos: DatosPedido, vendedor: Usuario) {
  const clienteId = idDeCliente(datos.clienteTelefono);
  const r = await crearPedidoTx(db, { ...datos, clienteId, dia: toISODate(new Date()) }, vendedor);
  guardarClienteDeVenta({ id: clienteId, nombre: datos.clienteNombre, telefono: datos.clienteTelefono, direccion: null }).catch(() => undefined);
  return r;
}

export function registrarPago(input: { pedidoId: string; monto: number; metodo: MetodoPago; nota: string | null }, usuario: Usuario) {
  return registrarPagoTx(db, { ...input, dia: toISODate(new Date()) }, usuario);
}

export function cambiarEtapa(input: { pedidoId: string; etapa: EtapaPedido; nota: string | null }, usuario: Usuario) {
  return cambiarEtapaTx(db, input, usuario);
}

/** Edita datos del pedido. El precio solo lo cambia el admin (las reglas lo validan). */
export async function editarPedido(
  pedido: Pedido,
  datos: { clienteNombre: string; clienteTelefono: string | null; descripcion: string; medidas: string | null; materialColor: string | null; notas: string | null; fechaEntrega: string | null; precio: number }
) {
  const precioCent = aCent(datos.precio);
  const pagadoCent = aCent(pedido.pagado);
  await updateDoc(doc(db, COL, pedido.id), {
    clienteNombre: datos.clienteNombre.trim(),
    clienteTelefono: datos.clienteTelefono?.trim() || null,
    descripcion: datos.descripcion.trim(),
    medidas: datos.medidas?.trim() || null,
    materialColor: datos.materialColor?.trim() || null,
    notas: datos.notas?.trim() || null,
    fechaEntrega: datos.fechaEntrega,
    precioCent,
    saldoCent: precioCent - pagadoCent,
    actualizadoEn: serverTimestamp(),
  });
}
