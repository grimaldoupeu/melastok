/**
 * Lógica transaccional de ventas, independiente de React Native.
 * La usa src/services/ventas.ts (app) y scripts/test-reglas.ts (emulador).
 *
 * Cada operación es una sola runTransaction: si cualquier lectura o validación
 * falla, no se escribe nada. Las reglas de Firestore (firestore.rules) verifican
 * con getAfter()/existsAfter() que cada escritura pertenezca a la misma venta.
 */
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';

import type { EstadoEntrega, MetodoPago } from '@/types/db';

/**
 * Máximo de productos DISTINTOS por venta (la cantidad de cada uno es libre).
 * Lo impone el límite de Firestore de 20 lecturas de documentos en las reglas
 * por transacción; el mismo número está en firestore.rules (MAX_ITEMS_VENTA).
 */
export const MAX_ITEMS_VENTA = 5;
export const SERIE_BOLETA_DEFECTO = 'B001';
export const METODOS_PAGO: MetodoPago[] = ['Yape', 'Plin', 'Efectivo', 'Tarjeta'];

export const aCent = (soles: number) => Math.round((Number(soles) || 0) * 100);
export const deCent = (cent: number) => (Number(cent) || 0) / 100;

export type Usuario = { uid: string; nombre: string };

export type NuevaVentaInput = {
  clienteId: string | null;
  clienteNombre: string;
  clienteTelefono: string | null;
  items: { productoId: string; cantidad: number }[];
  metodoPago: MetodoPago;
  descuento: number; // soles
  deliveryCosto: number; // soles
  deliveryDireccion: string | null;
  fechaEntrega: string | null; // YYYY-MM-DD
  notas: string | null;
  /** Día de la venta en hora de Lima (YYYY-MM-DD) */
  dia: string;
};

export type VentaRegistrada = { id: string; numeroBoleta: number; codigoBoleta: string };

/** Resumen diario vacío (montos en céntimos) */
export function resumenVacio(dia: string) {
  return {
    dia,
    numVentas: 0,
    totalCent: 0,
    costoCent: 0,
    unidades: 0,
    porMetodoCent: { Yape: 0, Plin: 0, Efectivo: 0, Tarjeta: 0 } as Record<MetodoPago, number>,
    pagosPedidosCent: 0,
  };
}

export class VentaError extends Error {}

/**
 * Registra una venta de forma atómica:
 * lee contador, resumen del día y productos → valida stock → descuenta stock,
 * crea la venta, un movimiento de salida por ítem, incrementa el contador y
 * suma al resumen diario.
 */
export async function registrarVentaTx(db: Firestore, input: NuevaVentaInput, vendedor: Usuario): Promise<VentaRegistrada> {
  const items = input.items.filter((i) => i.cantidad > 0);
  if (!items.length) throw new VentaError('El carrito está vacío');
  if (items.length > MAX_ITEMS_VENTA) {
    throw new VentaError(`Una venta admite hasta ${MAX_ITEMS_VENTA} productos distintos. Divide la venta en dos boletas.`);
  }
  if (new Set(items.map((i) => i.productoId)).size !== items.length) throw new VentaError('Hay productos repetidos en el carrito');
  if (items.some((i) => !Number.isInteger(i.cantidad))) throw new VentaError('Las cantidades deben ser números enteros');
  if (!input.clienteNombre.trim()) throw new VentaError('Ingresa el nombre del cliente');
  if (!METODOS_PAGO.includes(input.metodoPago)) throw new VentaError('Método de pago inválido');

  const ventaRef = doc(collection(db, 'ventas'));
  const contadorRef = doc(db, 'contadores', 'boletas');
  const resumenRef = doc(db, 'resumen_diario', input.dia);
  const productoRefs = items.map((i) => doc(db, 'productos', i.productoId));

  return runTransaction(db, async (tx) => {
    // 1) Lecturas (todas antes de cualquier escritura)
    const [contadorSnap, resumenSnap, ...productoSnaps] = await Promise.all([
      tx.get(contadorRef),
      tx.get(resumenRef),
      ...productoRefs.map((r) => tx.get(r)),
    ]);

    // 2) Validación de stock y cálculo de montos (céntimos)
    const lineas = items.map((item, idx) => {
      const snap = productoSnaps[idx];
      if (!snap.exists()) throw new VentaError('Un producto del carrito ya no existe');
      const p = snap.data() as DocumentData;
      if (p.activo === false) throw new VentaError(`"${p.nombre}" ya no está disponible`);
      const stock = Number(p.stock ?? 0);
      if (stock < item.cantidad) throw new VentaError(`Stock insuficiente de "${p.nombre}": quedan ${stock}`);
      const precioCent = aCent(p.precio);
      const costoCent = aCent(p.costo ?? 0);
      return {
        ref: productoRefs[idx],
        productoId: item.productoId,
        nombre: String(p.nombre),
        cantidad: item.cantidad,
        precioCent,
        costoCent,
        totalCent: precioCent * item.cantidad,
        stockAnterior: stock,
        stockNuevo: stock - item.cantidad,
        costo: p.costo == null ? 0 : Number(p.costo),
      };
    });

    const subtotalCent = lineas.reduce((n, l) => n + l.totalCent, 0);
    const descuentoCent = Math.max(0, aCent(input.descuento));
    const deliveryCent = Math.max(0, aCent(input.deliveryCosto));
    if (descuentoCent > subtotalCent) throw new VentaError('El descuento no puede superar el subtotal');
    const totalCent = subtotalCent - descuentoCent + deliveryCent;
    const costoTotalCent = lineas.reduce((n, l) => n + l.costoCent * l.cantidad, 0);
    const unidades = lineas.reduce((n, l) => n + l.cantidad, 0);

    const contador = contadorSnap.exists() ? (contadorSnap.data() as DocumentData) : null;
    const serie = String(contador?.serie ?? SERIE_BOLETA_DEFECTO);
    const numeroBoleta = Number(contador?.ultimo ?? 0) + 1;
    const codigoBoleta = `${serie}-${String(numeroBoleta).padStart(8, '0')}`;

    // 3) Escrituras
    tx.set(ventaRef, {
      numeroBoleta,
      codigoBoleta,
      clienteId: input.clienteId,
      clienteNombre: input.clienteNombre.trim(),
      clienteTelefono: input.clienteTelefono?.trim() || null,
      vendedorId: vendedor.uid,
      vendedorNombre: vendedor.nombre,
      items: lineas.map((l) => ({
        productoId: l.productoId,
        nombre: l.nombre,
        cantidad: l.cantidad,
        precioCent: l.precioCent,
        costoCent: l.costoCent,
        totalCent: l.totalCent,
      })),
      metodoPago: input.metodoPago,
      subtotalCent,
      descuentoCent,
      deliveryCent,
      totalCent,
      costoTotalCent,
      unidades,
      deliveryDireccion: input.deliveryDireccion?.trim() || null,
      fechaEntrega: input.fechaEntrega,
      estadoEntrega: (input.fechaEntrega ? 'pendiente' : 'entregado') satisfies EstadoEntrega,
      notas: input.notas?.trim() || null,
      fecha: serverTimestamp(),
      dia: input.dia,
      actualizadoEn: serverTimestamp(),
      canceladaEn: null,
      canceladaPor: null,
      canceladaPorNombre: null,
    });

    lineas.forEach((l, indiceItem) => {
      tx.update(l.ref, {
        stock: l.stockNuevo,
        ultimoMovimientoId: `${ventaRef.id}_${l.productoId}`,
        actualizadoEn: serverTimestamp(),
      });
      tx.set(doc(db, 'movimientos', `${ventaRef.id}_${l.productoId}`), {
        tipo: 'salida',
        itemTipo: 'producto',
        itemId: l.productoId,
        itemNombre: l.nombre,
        cantidad: l.cantidad,
        costoUnitario: l.costo,
        stockAnterior: l.stockAnterior,
        stockNuevo: l.stockNuevo,
        ventaId: ventaRef.id,
        indiceItem,
        proveedorId: null,
        proveedorNombre: null,
        nota: `Venta ${codigoBoleta}`,
        usuarioId: vendedor.uid,
        usuarioNombre: vendedor.nombre,
        fecha: serverTimestamp(),
      });
    });

    tx.set(contadorRef, { serie, ultimo: numeroBoleta, ultimaVentaId: ventaRef.id });

    const previo = resumenSnap.exists() ? (resumenSnap.data() as DocumentData) : resumenVacio(input.dia);
    const porMetodo = { ...resumenVacio(input.dia).porMetodoCent, ...(previo.porMetodoCent ?? {}) };
    porMetodo[input.metodoPago] = Number(porMetodo[input.metodoPago] ?? 0) + totalCent;
    tx.set(resumenRef, {
      dia: input.dia,
      numVentas: Number(previo.numVentas ?? 0) + 1,
      totalCent: Number(previo.totalCent ?? 0) + totalCent,
      costoCent: Number(previo.costoCent ?? 0) + costoTotalCent,
      unidades: Number(previo.unidades ?? 0) + unidades,
      porMetodoCent: porMetodo,
      pagosPedidosCent: Number(previo.pagosPedidosCent ?? 0),
      ultimaVentaId: ventaRef.id,
      ultimoPago: (previo as DocumentData).ultimoPago ?? null,
      actualizadoEn: serverTimestamp(),
    });

    return { id: ventaRef.id, numeroBoleta, codigoBoleta };
  });
}

/**
 * Cancela una venta (solo admin): devuelve el stock de cada producto que aún
 * exista, registra movimientos de entrada, resta la venta del resumen de su día
 * y marca la venta como cancelada. Todo atómico.
 */
export async function cancelarVentaTx(db: Firestore, ventaId: string, admin: Usuario): Promise<void> {
  const ventaRef = doc(db, 'ventas', ventaId);
  await runTransaction(db, async (tx) => {
    const ventaSnap = await tx.get(ventaRef);
    if (!ventaSnap.exists()) throw new VentaError('La venta no existe');
    const v = ventaSnap.data() as DocumentData;
    if (v.estadoEntrega === 'cancelado') throw new VentaError('La venta ya está cancelada');

    const items = (v.items ?? []) as { productoId: string; nombre: string; cantidad: number; costoCent: number }[];
    const resumenRef = doc(db, 'resumen_diario', String(v.dia));
    const productoRefs = items.map((i) => doc(db, 'productos', i.productoId));
    const [resumenSnap, ...productoSnaps] = await Promise.all([tx.get(resumenRef), ...productoRefs.map((r) => tx.get(r))]);
    if (!resumenSnap.exists()) throw new VentaError('No se encontró el resumen del día de esta venta');

    tx.update(ventaRef, {
      estadoEntrega: 'cancelado',
      canceladaEn: serverTimestamp(),
      canceladaPor: admin.uid,
      canceladaPorNombre: admin.nombre,
      actualizadoEn: serverTimestamp(),
    });

    items.forEach((it, indiceItem) => {
      const snap = productoSnaps[indiceItem];
      if (!snap.exists()) return; // producto eliminado: no hay stock que devolver
      const stockAnterior = Number((snap.data() as DocumentData).stock ?? 0);
      const stockNuevo = stockAnterior + it.cantidad;
      tx.update(productoRefs[indiceItem], {
        stock: stockNuevo,
        ultimoMovimientoId: `${ventaId}_${it.productoId}_anul`,
        actualizadoEn: serverTimestamp(),
      });
      tx.set(doc(db, 'movimientos', `${ventaId}_${it.productoId}_anul`), {
        tipo: 'entrada',
        itemTipo: 'producto',
        itemId: it.productoId,
        itemNombre: it.nombre,
        cantidad: it.cantidad,
        costoUnitario: deCent(it.costoCent),
        stockAnterior,
        stockNuevo,
        ventaId,
        indiceItem,
        proveedorId: null,
        proveedorNombre: null,
        nota: `Anulación de ${v.codigoBoleta}`,
        usuarioId: admin.uid,
        usuarioNombre: admin.nombre,
        fecha: serverTimestamp(),
      });
    });

    const r = resumenSnap.data() as DocumentData;
    const metodo = v.metodoPago as MetodoPago;
    const porMetodo = { ...resumenVacio(String(v.dia)).porMetodoCent, ...(r.porMetodoCent ?? {}) };
    porMetodo[metodo] = Number(porMetodo[metodo] ?? 0) - Number(v.totalCent);
    tx.set(resumenRef, {
      dia: r.dia,
      numVentas: Number(r.numVentas) - 1,
      totalCent: Number(r.totalCent) - Number(v.totalCent),
      costoCent: Number(r.costoCent) - Number(v.costoTotalCent),
      unidades: Number(r.unidades) - Number(v.unidades),
      porMetodoCent: porMetodo,
      pagosPedidosCent: Number(r.pagosPedidosCent ?? 0),
      ultimaVentaId: ventaId,
      ultimoPago: r.ultimoPago ?? null,
      actualizadoEn: serverTimestamp(),
    });
  });
}

/** Avanza el estado de entrega (pendiente → en producción → listo → entregado) */
export const SIGUIENTE_ESTADO: Partial<Record<EstadoEntrega, EstadoEntrega>> = {
  pendiente: 'en_produccion',
  en_produccion: 'listo',
  listo: 'entregado',
};
