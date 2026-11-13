/**
 * Transacciones de inventario, independientes de React Native
 * (las usa la app y scripts/test-reglas.ts en el emulador).
 *
 * Regla de oro: el stock de un producto o material SOLO cambia junto con un
 * movimiento NUEVO del kardex creado en la misma transacción. El ítem guarda
 * ultimoMovimientoId y las reglas comprueban con getAfter()/existsAfter() que
 * ese movimiento cuadre (stockAnterior, stockNuevo, cantidad).
 */
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';

import type { ItemTipo } from '@/types/db';

export type Usuario = { uid: string; nombre: string };

export class InventarioError extends Error {}

const coleccionDe = (t: ItemTipo) => (t === 'producto' ? 'productos' : 'materiales');

/** Suma/resta de cantidades de material (admite decimales: metros, kg) */
export const redondearCantidad = (n: number) => Math.round(n * 1000) / 1000;

type MovimientoBase = {
  tipo: 'entrada' | 'salida' | 'ajuste';
  itemTipo: ItemTipo;
  itemId: string;
  itemNombre: string;
  cantidad: number;
  costoUnitario: number | null;
  stockAnterior: number;
  stockNuevo: number;
  proveedorId: string | null;
  proveedorNombre: string | null;
  nota: string | null;
};

function datosMovimiento(m: MovimientoBase, usuario: Usuario) {
  return {
    ...m,
    ventaId: null,
    indiceItem: null,
    usuarioId: usuario.uid,
    usuarioNombre: usuario.nombre,
    fecha: serverTimestamp(),
  };
}

/**
 * Ingreso de material (compra / reposición). Lo pueden hacer admin y vendedor.
 * Suma el stock, actualiza el último costo y registra el movimiento de entrada.
 */
export async function ingresarMaterialTx(
  db: Firestore,
  input: { materialId: string; cantidad: number; costoUnitario: number | null; proveedor: { id: string; nombre: string } | null; nota: string | null },
  usuario: Usuario
): Promise<string> {
  const cantidad = redondearCantidad(input.cantidad);
  if (!(cantidad > 0)) throw new InventarioError('Ingresa una cantidad mayor a 0');
  if (input.costoUnitario != null && !(input.costoUnitario >= 0)) throw new InventarioError('El costo no puede ser negativo');
  const ref = doc(db, 'materiales', input.materialId);
  const movRef = doc(collection(db, 'movimientos'));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new InventarioError('El material ya no existe');
    const m = snap.data() as DocumentData;
    const stockAnterior = Number(m.stock ?? 0);
    const stockNuevo = stockAnterior + cantidad;
    tx.update(ref, {
      stock: stockNuevo,
      ...(input.costoUnitario != null ? { ultimoCosto: input.costoUnitario } : {}),
      ultimoMovimientoId: movRef.id,
      actualizadoEn: serverTimestamp(),
    });
    tx.set(
      movRef,
      datosMovimiento(
        {
          tipo: 'entrada',
          itemTipo: 'material',
          itemId: input.materialId,
          itemNombre: String(m.nombre),
          cantidad,
          costoUnitario: input.costoUnitario,
          stockAnterior,
          stockNuevo,
          proveedorId: input.proveedor?.id ?? null,
          proveedorNombre: input.proveedor?.nombre ?? null,
          nota: input.nota?.trim() || null,
        },
        usuario
      )
    );
  });
  return movRef.id;
}

/**
 * Salida de material por consumo en producción (admin y vendedor).
 * Si se indica un pedido a medida, en la misma transacción se suma el costo
 * del material consumido (cantidad × último costo, en céntimos) a su
 * costoMaterialesCent.
 */
export async function salidaMaterialTx(
  db: Firestore,
  input: { materialId: string; cantidad: number; nota: string | null; pedidoId?: string | null },
  usuario: Usuario
): Promise<string> {
  const cantidad = redondearCantidad(input.cantidad);
  if (!(cantidad > 0)) throw new InventarioError('Ingresa una cantidad mayor a 0');
  const ref = doc(db, 'materiales', input.materialId);
  const pedidoRef = input.pedidoId ? doc(db, 'pedidos', input.pedidoId) : null;
  const movRef = doc(collection(db, 'movimientos'));

  await runTransaction(db, async (tx) => {
    const [snap, pedidoSnap] = await Promise.all([tx.get(ref), pedidoRef ? tx.get(pedidoRef) : Promise.resolve(null)]);
    if (!snap.exists()) throw new InventarioError('El material ya no existe');
    const m = snap.data() as DocumentData;
    const stockAnterior = Number(m.stock ?? 0);
    const stockNuevo = stockAnterior - cantidad;
    if (stockNuevo < 0) throw new InventarioError(`Stock insuficiente de "${m.nombre}": quedan ${stockAnterior} ${m.unidad ?? ''}`.trim());
    const costoUnitario = m.ultimoCosto == null ? null : Number(m.ultimoCosto);
    const costoTotalCent = costoUnitario == null ? 0 : Math.round(cantidad * costoUnitario * 100);

    let pedidoCodigo: string | null = null;
    if (pedidoRef) {
      if (!pedidoSnap || !pedidoSnap.exists()) throw new InventarioError('El pedido ya no existe');
      const p = pedidoSnap.data() as DocumentData;
      if (p.etapa === 'cancelado') throw new InventarioError('El pedido está cancelado');
      pedidoCodigo = String(p.codigo);
      tx.update(pedidoRef, {
        costoMaterialesCent: Number(p.costoMaterialesCent ?? 0) + costoTotalCent,
        ultimoMovimientoId: movRef.id,
        actualizadoEn: serverTimestamp(),
      });
    }

    tx.update(ref, { stock: stockNuevo, ultimoMovimientoId: movRef.id, actualizadoEn: serverTimestamp() });
    const nota = input.nota?.trim() || (pedidoCodigo ? `Pedido ${pedidoCodigo}` : null);
    tx.set(movRef, {
      ...datosMovimiento(
        {
          tipo: 'salida',
          itemTipo: 'material',
          itemId: input.materialId,
          itemNombre: String(m.nombre),
          cantidad,
          costoUnitario,
          stockAnterior,
          stockNuevo,
          proveedorId: null,
          proveedorNombre: null,
          nota,
        },
        usuario
      ),
      ...(pedidoRef ? { pedidoId: pedidoRef.id, costoTotalCent } : {}),
    });
  });
  return movRef.id;
}

/**
 * Ajuste de stock (solo admin): fija el stock al valor contado y registra un
 * movimiento de ajuste con el motivo. cantidad = stockNuevo - stockAnterior.
 */
export async function ajustarStockTx(
  db: Firestore,
  input: { itemTipo: ItemTipo; itemId: string; stockNuevo: number; motivo: string },
  admin: Usuario
): Promise<string> {
  const motivo = input.motivo.trim();
  if (motivo.length < 3) throw new InventarioError('Indica el motivo del ajuste');
  const stockNuevo = input.itemTipo === 'producto' ? input.stockNuevo : redondearCantidad(input.stockNuevo);
  if (!(stockNuevo >= 0)) throw new InventarioError('El stock no puede ser negativo');
  if (input.itemTipo === 'producto' && !Number.isInteger(stockNuevo)) throw new InventarioError('El stock de un producto debe ser un número entero');
  const ref = doc(db, coleccionDe(input.itemTipo), input.itemId);
  const movRef = doc(collection(db, 'movimientos'));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new InventarioError('El ítem ya no existe');
    const d = snap.data() as DocumentData;
    const stockAnterior = Number(d.stock ?? 0);
    if (stockAnterior === stockNuevo) throw new InventarioError('El stock nuevo es igual al actual');
    tx.update(ref, { stock: stockNuevo, ultimoMovimientoId: movRef.id, actualizadoEn: serverTimestamp() });
    tx.set(
      movRef,
      datosMovimiento(
        {
          tipo: 'ajuste',
          itemTipo: input.itemTipo,
          itemId: input.itemId,
          itemNombre: String(d.nombre),
          cantidad: stockNuevo - stockAnterior,
          costoUnitario: null,
          stockAnterior,
          stockNuevo,
          proveedorId: null,
          proveedorNombre: null,
          nota: motivo,
        },
        admin
      )
    );
  });
  return movRef.id;
}

/**
 * Crea un producto o material (solo admin). Si trae stock inicial, en la misma
 * transacción registra el ajuste "Stock inicial" en el kardex.
 */
export async function crearItemConStockTx(
  db: Firestore,
  itemTipo: ItemTipo,
  datos: Record<string, unknown> & { nombre: string },
  stockInicial: number,
  admin: Usuario
): Promise<string> {
  const stock = itemTipo === 'producto' ? Math.max(0, Math.round(stockInicial)) : Math.max(0, redondearCantidad(stockInicial));
  const ref = doc(collection(db, coleccionDe(itemTipo)));
  const movRef = doc(collection(db, 'movimientos'));

  await runTransaction(db, async (tx) => {
    tx.set(ref, {
      ...datos,
      stock,
      ...(stock > 0 ? { ultimoMovimientoId: movRef.id } : {}),
      creadoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
    });
    if (stock > 0) {
      tx.set(
        movRef,
        datosMovimiento(
          {
            tipo: 'ajuste',
            itemTipo,
            itemId: ref.id,
            itemNombre: datos.nombre,
            cantidad: stock,
            costoUnitario: null,
            stockAnterior: 0,
            stockNuevo: stock,
            proveedorId: null,
            proveedorNombre: null,
            nota: 'Stock inicial',
          },
          admin
        )
      );
    }
  });
  return ref.id;
}
