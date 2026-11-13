/**
 * Pruebas de las reglas de ventas contra el emulador de Firestore.
 *
 *   npm run test:reglas
 *
 * (equivale a: firebase emulators:exec --project demo-melastock --only firestore
 *  "npx tsx scripts/test-reglas.ts"). Requiere Java 11+ en el PATH.
 *
 * Usa la misma registrarVentaTx/cancelarVentaTx que la app y además intenta
 * los atajos que las reglas deben bloquear (bajar stock sin vender, inflar el
 * resumen, saltarse el correlativo, etc.).
 */
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  runTransaction,
  serverTimestamp,
  setDoc,
  terminate,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';

import { ajustarStockTx, crearItemConStockTx, ingresarMaterialTx, salidaMaterialTx } from '../src/services/inventario-core';
import { cambiarEtapaTx, crearPedidoTx, registrarPagoTx, type NuevoPedidoInput } from '../src/services/pedidos-core';
import { cancelarVentaTx, MAX_ITEMS_VENTA, registrarVentaTx, type NuevaVentaInput } from '../src/services/ventas-core';

const PROJECT = 'demo-melastock';
const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

/* ---------------- utilidades ---------------- */

type Val = string | number | boolean | null | Val[] | { [k: string]: Val };

function enc(v: Val): object {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}

/** Escribe un documento saltándose las reglas (token "owner" del emulador) */
async function semilla(path: string, data: Record<string, Val>) {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }),
  });
  if (!res.ok) throw new Error(`semilla ${path}: ${res.status} ${await res.text()}`);
}

async function limpiar() {
  await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}

const apps: FirebaseApp[] = [];
function clienteComo(uid: string): Firestore {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo' }, `app-${uid}-${apps.length}`);
  apps.push(app);
  const db = getFirestore(app);
  const [host, port] = HOST.split(':');
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid, user_id: uid } });
  return db;
}

let ok = 0;
let fallos = 0;
async function prueba(nombre: string, debe: 'permitir' | 'denegar', fn: () => Promise<unknown>) {
  try {
    await fn();
    if (debe === 'permitir') {
      ok++;
      console.log(`  ✔ ${nombre}`);
    } else {
      fallos++;
      console.log(`  ✘ ${nombre} — se esperaba DENEGAR y se permitió`);
    }
  } catch (e) {
    const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
    const msg = `${code} ${e instanceof Error ? e.message : String(e)}`.trim();
    if (debe === 'denegar' && /permission|PERMISSION_DENIED|insufficient/i.test(msg)) {
      ok++;
      console.log(`  ✔ ${nombre} (denegado)`);
    } else {
      fallos++;
      console.log(`  ✘ ${nombre} — ${debe === 'permitir' ? 'falló' : 'error inesperado'}: ${msg.split('\n')[0]}`);
    }
  }
}

function hoyLima(): string {
  const l = new Date(Date.now() - 5 * 3600_000);
  return l.toISOString().slice(0, 10);
}

/* ---------------- datos ---------------- */

const ADMIN = { uid: 'admin1', nombre: 'Admin' };
const VEND = { uid: 'vend1', nombre: 'Carlos' };
const INACTIVO = { uid: 'inactivo1', nombre: 'Pendiente' };

async function sembrar() {
  await limpiar();
  await semilla('perfiles/admin1', { nombre: 'Admin', email: 'a@x.pe', rol: 'admin', activo: true });
  await semilla('perfiles/vend1', { nombre: 'Carlos', email: 'c@x.pe', rol: 'vendedor', activo: true });
  await semilla('perfiles/inactivo1', { nombre: 'Pendiente', email: 'p@x.pe', rol: 'vendedor', activo: false });
  for (let i = 1; i <= 8; i++) {
    await semilla(`productos/p${i}`, {
      nombre: `Producto ${i}`,
      descripcion: null,
      categoriaId: null,
      categoriaNombre: null,
      precio: 100 + i + 0.5,
      costo: 60.25,
      stock: 50,
      stockMinimo: 2,
      fotoUrl: null,
      activo: true,
    });
  }
  await semilla('materiales/m1', {
    nombre: 'Plancha melamina Nogal 18 mm',
    tipo: 'plancha',
    color: 'Nogal',
    espesorMm: 18,
    unidad: 'plancha',
    stock: 10,
    stockMinimo: 4,
    ultimoCosto: 185,
    proveedorId: null,
    proveedorNombre: null,
  });
  await semilla('materiales/m2', {
    nombre: 'Tapacanto Blanco 22 mm',
    tipo: 'tapacanto',
    color: 'Blanco',
    espesorMm: 22,
    unidad: 'metro',
    stock: 100.3,
    stockMinimo: 50,
    ultimoCosto: 0.45,
    proveedorId: null,
    proveedorNombre: null,
  });
  await semilla('proveedores/prov1', { nombre: 'Maderas del Sur', telefono: '987111222', contacto: null, direccion: null, notas: null });
}

function venta(items: { productoId: string; cantidad: number }[], extra: Partial<NuevaVentaInput> = {}): NuevaVentaInput {
  return {
    clienteId: null,
    clienteNombre: 'María Quispe',
    clienteTelefono: '987654321',
    items,
    metodoPago: 'Yape',
    descuento: 10.1,
    deliveryCosto: 25,
    deliveryDireccion: 'Av. Los Olivos 123',
    fechaEntrega: null,
    notas: null,
    dia: hoyLima(),
    ...extra,
  };
}

/* ---------------- pruebas ---------------- */

async function main() {
  await sembrar();
  const dbV = clienteComo(VEND.uid);
  const dbA = clienteComo(ADMIN.uid);
  const dbI = clienteComo(INACTIVO.uid);
  const dia = hoyLima();

  console.log('\nVentas válidas (límite de lecturas por transacción):');
  const ventas: string[] = [];
  for (let n = 1; n <= MAX_ITEMS_VENTA; n++) {
    await prueba(`venta con ${n} producto(s) distinto(s)`, 'permitir', async () => {
      const items = Array.from({ length: n }, (_, i) => ({ productoId: `p${i + 1}`, cantidad: i + 1 }));
      const r = await registrarVentaTx(dbV, venta(items, { metodoPago: n % 2 ? 'Yape' : 'Efectivo' }), VEND);
      ventas.push(r.id);
    });
  }
  await prueba('venta con fecha de entrega (pedido pendiente)', 'permitir', async () => {
    const r = await registrarVentaTx(dbV, venta([{ productoId: 'p6', cantidad: 2 }], { fechaEntrega: '2099-01-01' }), VEND);
    ventas.push(r.id);
  });
  await prueba('venta de un admin', 'permitir', () => registrarVentaTx(dbA, venta([{ productoId: 'p7', cantidad: 1 }]), ADMIN));

  console.log('\nConsistencia de datos:');
  await prueba('correlativo = número de ventas y stock descontado', 'permitir', async () => {
    const c = (await getDoc(doc(dbA, 'contadores', 'boletas'))).data()!;
    const p1 = (await getDoc(doc(dbA, 'productos', 'p1'))).data()!;
    const total = MAX_ITEMS_VENTA + 2;
    if (c.ultimo !== total) throw new Error(`contador ${c.ultimo} != ${total}`);
    if (p1.stock !== 50 - MAX_ITEMS_VENTA) throw new Error(`stock p1 = ${p1.stock}`);
  });
  await prueba('resumen diario suma las ventas', 'permitir', async () => {
    const r = (await getDoc(doc(dbA, 'resumen_diario', dia))).data()!;
    if (r.numVentas !== MAX_ITEMS_VENTA + 2) throw new Error(`numVentas ${r.numVentas}`);
    const yape = r.porMetodoCent.Yape;
    const efectivo = r.porMetodoCent.Efectivo;
    if (yape + efectivo !== r.totalCent) throw new Error('porMetodo no cuadra con totalCent');
  });

  console.log('\nAtajos que deben bloquearse:');
  await prueba('vendedor baja stock sin venta', 'denegar', () => updateDoc(doc(dbV, 'productos', 'p8'), { stock: 10 }));
  await prueba('vendedor baja stock citando una venta antigua', 'denegar', () =>
    updateDoc(doc(dbV, 'productos', 'p8'), { stock: 49, ultimaVentaId: ventas[0], actualizadoEn: serverTimestamp() })
  );
  await prueba('vendedor cambia el precio', 'denegar', () => updateDoc(doc(dbV, 'productos', 'p8'), { precio: 1 }));
  await prueba('vendedor sube el contador sin venta', 'denegar', async () => {
    const c = (await getDoc(doc(dbV, 'contadores', 'boletas'))).data()!;
    await setDoc(doc(dbV, 'contadores', 'boletas'), { serie: c.serie, ultimo: c.ultimo + 1, ultimaVentaId: ventas[0] });
  });
  await prueba('vendedor infla el resumen citando una venta antigua', 'denegar', async () => {
    const r = (await getDoc(doc(dbV, 'resumen_diario', dia))).data()!;
    await setDoc(doc(dbV, 'resumen_diario', dia), {
      ...r,
      numVentas: r.numVentas + 1,
      totalCent: r.totalCent + 100,
      porMetodoCent: { ...r.porMetodoCent, Yape: r.porMetodoCent.Yape + 100 },
      ultimaVentaId: ventas[0],
      actualizadoEn: serverTimestamp(),
    });
  });
  await prueba('venta sin contador ni resumen', 'denegar', () =>
    runTransaction(dbV, async (tx) => {
      tx.set(doc(dbV, 'ventas', 'fantasma'), { clienteNombre: 'X' });
    })
  );
  await prueba('venta con fecha (día) de ayer', 'denegar', () =>
    registrarVentaTx(dbV, venta([{ productoId: 'p8', cantidad: 1 }], { dia: '2020-01-01' }), VEND)
  );
  await prueba('movimiento de salida inventado', 'denegar', () =>
    setDoc(doc(dbV, 'movimientos', `${ventas[0]}_p8`), {
      tipo: 'salida',
      itemTipo: 'producto',
      itemId: 'p8',
      itemNombre: 'Producto 8',
      cantidad: 1,
      costoUnitario: 0,
      stockAnterior: 50,
      stockNuevo: 49,
      ventaId: ventas[0],
      indiceItem: 0,
      proveedorId: null,
      proveedorNombre: null,
      nota: null,
      usuarioId: VEND.uid,
      usuarioNombre: VEND.nombre,
      fecha: serverTimestamp(),
    })
  );
  await prueba('usuario inactivo registra venta', 'denegar', () =>
    registrarVentaTx(dbI, venta([{ productoId: 'p8', cantidad: 1 }]), INACTIVO)
  );
  await prueba('usuario inactivo lee productos', 'denegar', () => getDoc(doc(dbI, 'productos', 'p1')));
  await prueba('vendedor cancela una venta', 'denegar', () => cancelarVentaTx(dbV, ventas[0], VEND));
  await prueba('vendedor marca una venta como cancelada sin transacción', 'denegar', () =>
    updateDoc(doc(dbV, 'ventas', ventas[0]), { estadoEntrega: 'cancelado', actualizadoEn: serverTimestamp() })
  );

  console.log('\nOperaciones permitidas:');
  const pedido = ventas[ventas.length - 1];
  await prueba('vendedor avanza el estado de entrega', 'permitir', () =>
    updateDoc(doc(dbV, 'ventas', pedido), { estadoEntrega: 'en_produccion', actualizadoEn: serverTimestamp() })
  );
  await prueba('admin cancela una venta (devuelve stock y resta resumen)', 'permitir', async () => {
    const antesR = (await getDoc(doc(dbA, 'resumen_diario', dia))).data()!;
    const v = (await getDoc(doc(dbA, 'ventas', ventas[1]))).data()!;
    const antesStock = (await getDoc(doc(dbA, 'productos', 'p1'))).data()!.stock;
    await cancelarVentaTx(dbA, ventas[1], ADMIN);
    const r = (await getDoc(doc(dbA, 'resumen_diario', dia))).data()!;
    const stock = (await getDoc(doc(dbA, 'productos', 'p1'))).data()!.stock;
    if (r.totalCent !== antesR.totalCent - v.totalCent) throw new Error('el resumen no restó la venta');
    if (stock !== antesStock + 1) throw new Error(`stock p1 ${stock}, esperado ${antesStock + 1}`);
  });
  await prueba('admin cancela de nuevo la misma venta', 'denegar', () => cancelarVentaTx(dbA, ventas[1], ADMIN).catch((e) => {
    throw new Error(/ya está cancelada/.test(e.message) ? 'PERMISSION_DENIED (bloqueado por la app)' : e.message);
  }));
  await prueba('stock insuficiente se rechaza en la app', 'denegar', () =>
    registrarVentaTx(dbV, venta([{ productoId: 'p8', cantidad: 999 }]), VEND).catch((e) => {
      throw new Error(/Stock insuficiente/.test(e.message) ? 'PERMISSION_DENIED (bloqueado por la app)' : e.message);
    })
  );

  /* ---------------- Inventario (fase 4) ---------------- */
  const prov = { id: 'prov1', nombre: 'Maderas del Sur' };

  console.log('\nInventario permitido:');
  await prueba('vendedor ingresa material con costo y proveedor', 'permitir', async () => {
    await ingresarMaterialTx(dbV, { materialId: 'm1', cantidad: 6, costoUnitario: 190.5, proveedor: prov, nota: 'Compra' }, VEND);
    const m = (await getDoc(doc(dbA, 'materiales', 'm1'))).data()!;
    if (m.stock !== 16 || m.ultimoCosto !== 190.5) throw new Error(`stock ${m.stock}, costo ${m.ultimoCosto}`);
  });
  await prueba('vendedor ingresa material con decimales (100.3 + 0.1 + 0.2)', 'permitir', async () => {
    await ingresarMaterialTx(dbV, { materialId: 'm2', cantidad: 0.1, costoUnitario: null, proveedor: null, nota: null }, VEND);
    await ingresarMaterialTx(dbV, { materialId: 'm2', cantidad: 0.2, costoUnitario: null, proveedor: null, nota: null }, VEND);
  });
  await prueba('vendedor registra consumo de material (salida)', 'permitir', () =>
    salidaMaterialTx(dbV, { materialId: 'm2', cantidad: 12.75, nota: 'Ropero #12' }, VEND)
  );
  await prueba('admin ajusta stock de producto con motivo', 'permitir', async () => {
    await ajustarStockTx(dbA, { itemTipo: 'producto', itemId: 'p8', stockNuevo: 47, motivo: 'Conteo físico' }, ADMIN);
    const p = (await getDoc(doc(dbA, 'productos', 'p8'))).data()!;
    if (p.stock !== 47) throw new Error(`stock ${p.stock}`);
  });
  await prueba('admin ajusta stock de material a decimal', 'permitir', () =>
    ajustarStockTx(dbA, { itemTipo: 'material', itemId: 'm2', stockNuevo: 80.5, motivo: 'Merma' }, ADMIN)
  );
  await prueba('admin edita precio y nombre de un producto (sin tocar stock)', 'permitir', () =>
    updateDoc(doc(dbA, 'productos', 'p8'), { precio: 120, nombre: 'Producto 8 editado', actualizadoEn: serverTimestamp() })
  );
  await prueba('admin crea producto con stock inicial (kardex)', 'permitir', () =>
    crearItemConStockTx(
      dbA,
      'producto',
      { nombre: 'Nuevo ropero', descripcion: null, categoriaId: null, categoriaNombre: null, precio: 500, costo: 300, stockMinimo: 1, fotoUrl: null, activo: true },
      4,
      ADMIN
    )
  );
  await prueba('admin crea material sin stock', 'permitir', () =>
    crearItemConStockTx(
      dbA,
      'material',
      { nombre: 'Bisagra cangrejo', tipo: 'bisagra', color: null, espesorMm: null, unidad: 'und', stockMinimo: 20, ultimoCosto: 1.8, proveedorId: null, proveedorNombre: null },
      0,
      ADMIN
    )
  );
  await prueba('admin crea proveedor', 'permitir', () =>
    setDoc(doc(dbA, 'proveedores', 'prov2'), { nombre: 'Ferretería Lima', telefono: null, contacto: null, direccion: null, notas: null })
  );

  console.log('\nInventario bloqueado:');
  await prueba('vendedor ajusta stock', 'denegar', () =>
    ajustarStockTx(dbV, { itemTipo: 'material', itemId: 'm1', stockNuevo: 99, motivo: 'Conteo' }, VEND)
  );
  await prueba('admin cambia stock de producto sin movimiento', 'denegar', () =>
    updateDoc(doc(dbA, 'productos', 'p8'), { stock: 100, actualizadoEn: serverTimestamp() })
  );
  await prueba('admin crea producto con stock sin movimiento', 'denegar', () =>
    setDoc(doc(dbA, 'productos', 'px'), {
      nombre: 'Trucho', descripcion: null, categoriaId: null, categoriaNombre: null, precio: 1, costo: null,
      stock: 5, stockMinimo: 1, fotoUrl: null, activo: true,
    })
  );
  await prueba('vendedor sube stock de material sin movimiento', 'denegar', () =>
    updateDoc(doc(dbV, 'materiales', 'm1'), { stock: 999, actualizadoEn: serverTimestamp() })
  );
  await prueba('vendedor reutiliza un movimiento antiguo para subir stock', 'denegar', async () => {
    const m = (await getDoc(doc(dbV, 'materiales', 'm1'))).data()!;
    await updateDoc(doc(dbV, 'materiales', 'm1'), { stock: m.stock + 6, ultimoMovimientoId: m.ultimoMovimientoId, actualizadoEn: serverTimestamp() });
  });
  await prueba('vendedor ingresa material poniendo otro último costo', 'denegar', () =>
    runTransaction(dbV, async (tx) => {
      const ref = doc(dbV, 'materiales', 'm1');
      const m = (await tx.get(ref)).data()!;
      const movRef = doc(dbV, 'movimientos', 'mov-costo-falso');
      tx.update(ref, { stock: m.stock + 1, ultimoCosto: 1, ultimoMovimientoId: movRef.id, actualizadoEn: serverTimestamp() });
      tx.set(movRef, {
        tipo: 'entrada', itemTipo: 'material', itemId: 'm1', itemNombre: m.nombre, cantidad: 1, costoUnitario: 190.5,
        stockAnterior: m.stock, stockNuevo: m.stock + 1, ventaId: null, indiceItem: null, proveedorId: null,
        proveedorNombre: null, nota: null, usuarioId: VEND.uid, usuarioNombre: VEND.nombre, fecha: serverTimestamp(),
      });
    })
  );
  await prueba('vendedor crea movimiento de ingreso sin tocar el material', 'denegar', async () => {
    const m = (await getDoc(doc(dbV, 'materiales', 'm1'))).data()!;
    await setDoc(doc(dbV, 'movimientos', 'mov-suelto'), {
      tipo: 'entrada', itemTipo: 'material', itemId: 'm1', itemNombre: m.nombre, cantidad: 3, costoUnitario: null,
      stockAnterior: m.stock, stockNuevo: m.stock + 3, ventaId: null, indiceItem: null, proveedorId: null,
      proveedorNombre: null, nota: null, usuarioId: VEND.uid, usuarioNombre: VEND.nombre, fecha: serverTimestamp(),
    });
  });
  await prueba('vendedor ingresa stock a un producto (no material)', 'denegar', () =>
    runTransaction(dbV, async (tx) => {
      const ref = doc(dbV, 'productos', 'p8');
      const p = (await tx.get(ref)).data()!;
      const movRef = doc(dbV, 'movimientos', 'mov-prod-entrada');
      tx.update(ref, { stock: p.stock + 5, ultimoMovimientoId: movRef.id, actualizadoEn: serverTimestamp() });
      tx.set(movRef, {
        tipo: 'entrada', itemTipo: 'producto', itemId: 'p8', itemNombre: p.nombre, cantidad: 5, costoUnitario: null,
        stockAnterior: p.stock, stockNuevo: p.stock + 5, ventaId: null, indiceItem: null, proveedorId: null,
        proveedorNombre: null, nota: null, usuarioId: VEND.uid, usuarioNombre: VEND.nombre, fecha: serverTimestamp(),
      });
    })
  );
  await prueba('vendedor crea un material', 'denegar', () =>
    crearItemConStockTx(dbV, 'material', { nombre: 'X material', tipo: 'otro', color: null, espesorMm: null, unidad: 'und', stockMinimo: 0, ultimoCosto: null, proveedorId: null, proveedorNombre: null }, 0, VEND)
  );
  await prueba('vendedor crea un proveedor', 'denegar', () =>
    setDoc(doc(dbV, 'proveedores', 'prov3'), { nombre: 'Proveedor X', telefono: null, contacto: null, direccion: null, notas: null })
  );
  await prueba('vendedor edita un movimiento del kardex', 'denegar', async () => {
    const id = `${ventas[0]}_p1`;
    await updateDoc(doc(dbV, 'movimientos', id), { cantidad: 99 });
  });
  await prueba('consumo mayor al stock se rechaza en la app', 'denegar', () =>
    salidaMaterialTx(dbV, { materialId: 'm1', cantidad: 9999, nota: null }, VEND).catch((e) => {
      throw new Error(/Stock insuficiente/.test(e.message) ? 'PERMISSION_DENIED (bloqueado por la app)' : e.message);
    })
  );

  /* ---------------- Pedidos a medida (fase 5) ---------------- */
  const pedidoBase = (extra: Partial<NuevoPedidoInput> = {}): NuevoPedidoInput => ({
    clienteId: null,
    clienteNombre: 'Jorge Huamán',
    clienteTelefono: '912345678',
    descripcion: 'Cocina a medida 2.40 m, melamina blanca',
    medidas: '2.40 x 0.60 x 0.90',
    materialColor: 'Blanco 18 mm',
    notas: null,
    precio: 2500,
    fechaEntrega: '2099-12-31',
    adelanto: null,
    dia,
    ...extra,
  });
  const resumenHoy = async () => (await getDoc(doc(dbA, 'resumen_diario', dia))).data()!;
  const pedidoDoc = async (id: string) => (await getDoc(doc(dbA, 'pedidos', id))).data()!;
  let pedidoA = '';
  let pedidoB = '';

  console.log('\nPedidos a medida permitidos:');
  await prueba('vendedor crea pedido sin adelanto (P-0001)', 'permitir', async () => {
    const r = await crearPedidoTx(dbV, pedidoBase(), VEND);
    pedidoA = r.id;
    if (r.codigo !== 'P-0001') throw new Error(`código ${r.codigo}`);
  });
  await prueba('vendedor crea pedido con adelanto (suma a pagosPedidos)', 'permitir', async () => {
    const antes = (await resumenHoy()).pagosPedidosCent;
    const r = await crearPedidoTx(dbV, pedidoBase({ precio: 1800.5, adelanto: { monto: 500.25, metodo: 'Yape', nota: null } }), VEND);
    pedidoB = r.id;
    const despues = (await resumenHoy()).pagosPedidosCent;
    const p = await pedidoDoc(pedidoB);
    if (despues - antes !== 50025) throw new Error(`resumen sumó ${despues - antes}`);
    if (p.saldoCent !== 180050 - 50025) throw new Error(`saldo ${p.saldoCent}`);
  });
  await prueba('vendedor registra pago parcial (saldo y resumen)', 'permitir', async () => {
    const antes = (await resumenHoy()).pagosPedidosCent;
    await registrarPagoTx(dbV, { pedidoId: pedidoB, monto: 300, metodo: 'Efectivo', nota: 'Segundo pago', dia }, VEND);
    const p = await pedidoDoc(pedidoB);
    if (p.pagos.length !== 2 || p.pagadoCent !== 80025) throw new Error(`pagado ${p.pagadoCent}`);
    if ((await resumenHoy()).pagosPedidosCent - antes !== 30000) throw new Error('el resumen no sumó el pago');
  });
  await prueba('primer pago de un pedido creado sin adelanto', 'permitir', () =>
    registrarPagoTx(dbV, { pedidoId: pedidoA, monto: 1000, metodo: 'Plin', nota: null, dia }, VEND)
  );
  await prueba('venta después de pagos conserva los pagos del resumen', 'permitir', async () => {
    const antes = await resumenHoy();
    await registrarVentaTx(dbV, venta([{ productoId: 'p3', cantidad: 1 }]), VEND);
    const despues = await resumenHoy();
    if (despues.pagosPedidosCent !== antes.pagosPedidosCent) throw new Error('la venta alteró pagosPedidos');
  });
  await prueba('vendedor avanza etapa (cotizado → corte → enchapado)', 'permitir', async () => {
    await cambiarEtapaTx(dbV, { pedidoId: pedidoA, etapa: 'corte', nota: null }, VEND);
    await cambiarEtapaTx(dbV, { pedidoId: pedidoA, etapa: 'enchapado', nota: 'Tapacanto blanco' }, VEND);
  });
  await prueba('vendedor retrocede etapa (enchapado → corte)', 'permitir', async () => {
    await cambiarEtapaTx(dbV, { pedidoId: pedidoA, etapa: 'corte', nota: 'Pieza mal cortada' }, VEND);
    const p = await pedidoDoc(pedidoA);
    if (p.historialEtapas.length !== 4) throw new Error(`historial ${p.historialEtapas.length}`);
  });
  await prueba('consumo de material ligado a pedido suma costoMateriales', 'permitir', async () => {
    const m = (await getDoc(doc(dbA, 'materiales', 'm1'))).data()!;
    await salidaMaterialTx(dbV, { materialId: 'm1', cantidad: 2.5, nota: null, pedidoId: pedidoA }, VEND);
    const p = await pedidoDoc(pedidoA);
    const esperado = Math.round(2.5 * m.ultimoCosto * 100);
    if (p.costoMaterialesCent !== esperado) throw new Error(`costo ${p.costoMaterialesCent}, esperado ${esperado}`);
  });
  await prueba('vendedor edita descripción y fecha de entrega', 'permitir', () =>
    updateDoc(doc(dbV, 'pedidos', pedidoA), { descripcion: 'Cocina 2.40 m con alacena', fechaEntrega: '2099-11-30', actualizadoEn: serverTimestamp() })
  );
  await prueba('admin cambia el precio (recalcula saldo)', 'permitir', async () => {
    const p = await pedidoDoc(pedidoA);
    await updateDoc(doc(dbA, 'pedidos', pedidoA), { precioCent: 260000, saldoCent: 260000 - p.pagadoCent, actualizadoEn: serverTimestamp() });
  });

  console.log('\nPedidos a medida bloqueados:');
  await prueba('vendedor cancela un pedido', 'denegar', () => cambiarEtapaTx(dbV, { pedidoId: pedidoB, etapa: 'cancelado', nota: null }, VEND));
  await prueba('vendedor cambia el precio', 'denegar', async () => {
    const p = await pedidoDoc(pedidoB);
    await updateDoc(doc(dbV, 'pedidos', pedidoB), { precioCent: 100, saldoCent: 100 - p.pagadoCent, actualizadoEn: serverTimestamp() });
  });
  await prueba('pago sin sumarlo al resumen del día', 'denegar', async () => {
    const p = await pedidoDoc(pedidoB);
    await updateDoc(doc(dbV, 'pedidos', pedidoB), {
      pagos: [...p.pagos, { montoCent: 100, metodo: 'Yape', fecha: Timestamp.now(), dia, usuarioId: VEND.uid, usuarioNombre: VEND.nombre, nota: null }],
      pagadoCent: p.pagadoCent + 100,
      saldoCent: p.saldoCent - 100,
      actualizadoEn: serverTimestamp(),
    });
  });
  await prueba('inflar el resumen citando un pago antiguo', 'denegar', async () => {
    const r = await resumenHoy();
    await setDoc(doc(dbV, 'resumen_diario', dia), { ...r, pagosPedidosCent: r.pagosPedidosCent + 50025, ultimoPago: { pedidoId: pedidoB, indice: 0 }, actualizadoEn: serverTimestamp() });
  });
  await prueba('pago con saldo mal calculado', 'denegar', () =>
    runTransaction(dbV, async (tx) => {
      const ref = doc(dbV, 'pedidos', pedidoB);
      const p = (await tx.get(ref)).data()!;
      const rRef = doc(dbV, 'resumen_diario', dia);
      const r = (await tx.get(rRef)).data()!;
      const pagos = [...p.pagos, { montoCent: 100, metodo: 'Yape', fecha: Timestamp.now(), dia, usuarioId: VEND.uid, usuarioNombre: VEND.nombre, nota: null }];
      tx.update(ref, { pagos, pagadoCent: p.pagadoCent + 100, saldoCent: p.saldoCent, actualizadoEn: serverTimestamp() });
      tx.set(rRef, { ...r, pagosPedidosCent: r.pagosPedidosCent + 100, ultimoPago: { pedidoId: pedidoB, indice: p.pagos.length }, actualizadoEn: serverTimestamp() });
    })
  );
  await prueba('pago fechado ayer', 'denegar', () => registrarPagoTx(dbV, { pedidoId: pedidoB, monto: 10, metodo: 'Yape', nota: null, dia: '2020-01-01' }, VEND));
  await prueba('pago mayor al saldo se rechaza en la app', 'denegar', () =>
    registrarPagoTx(dbV, { pedidoId: pedidoB, monto: 999999, metodo: 'Yape', nota: null, dia }, VEND).catch((e) => {
      throw new Error(/supera el saldo/.test(e.message) ? 'PERMISSION_DENIED (bloqueado por la app)' : e.message);
    })
  );
  await prueba('sumar costo de materiales sin movimiento', 'denegar', async () => {
    const p = await pedidoDoc(pedidoB);
    await updateDoc(doc(dbV, 'pedidos', pedidoB), { costoMaterialesCent: p.costoMaterialesCent + 5000, ultimoMovimientoId: 'no-existe', actualizadoEn: serverTimestamp() });
  });
  await prueba('consumo para pedido con costo falseado', 'denegar', () =>
    runTransaction(dbV, async (tx) => {
      const mRef = doc(dbV, 'materiales', 'm1');
      const pRef = doc(dbV, 'pedidos', pedidoB);
      const m = (await tx.get(mRef)).data()!;
      const p = (await tx.get(pRef)).data()!;
      const movRef = doc(dbV, 'movimientos', 'mov-costo-pedido');
      tx.update(mRef, { stock: m.stock - 1, ultimoMovimientoId: movRef.id, actualizadoEn: serverTimestamp() });
      tx.update(pRef, { costoMaterialesCent: p.costoMaterialesCent + 1, ultimoMovimientoId: movRef.id, actualizadoEn: serverTimestamp() });
      tx.set(movRef, {
        tipo: 'salida', itemTipo: 'material', itemId: 'm1', itemNombre: m.nombre, cantidad: 1, costoUnitario: m.ultimoCosto,
        stockAnterior: m.stock, stockNuevo: m.stock - 1, ventaId: null, indiceItem: null, proveedorId: null,
        proveedorNombre: null, nota: null, usuarioId: VEND.uid, usuarioNombre: VEND.nombre, fecha: serverTimestamp(),
        pedidoId: pedidoB, costoTotalCent: 1,
      });
    })
  );
  await prueba('crear pedido sin pasar por el contador', 'denegar', async () => {
    const p = await pedidoDoc(pedidoA);
    await setDoc(doc(dbV, 'pedidos', 'pedido-trucho'), { ...p, codigo: 'P-9999', numero: 9999, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
  });
  await prueba('admin cancela un pedido', 'permitir', () => cambiarEtapaTx(dbA, { pedidoId: pedidoB, etapa: 'cancelado', nota: 'Cliente desistió' }, ADMIN));
  await prueba('modificar un pedido cancelado', 'denegar', () => cambiarEtapaTx(dbA, { pedidoId: pedidoB, etapa: 'corte', nota: null }, ADMIN).catch((e) => {
    throw new Error(/cancelado/.test(e.message) ? 'PERMISSION_DENIED (bloqueado por la app)' : e.message);
  }));
  await prueba('modificar un pedido cancelado saltándose la app', 'denegar', () =>
    updateDoc(doc(dbA, 'pedidos', pedidoB), { descripcion: 'Reabierto a la mala', actualizadoEn: serverTimestamp() })
  );

  console.log(`\nResultado: ${ok} OK, ${fallos} fallos\n`);
  await Promise.all(apps.map(async (a) => {
    await terminate(getFirestore(a));
    await deleteApp(a);
  }));
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
