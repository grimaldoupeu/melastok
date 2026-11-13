/**
 * Pruebas de las reglas de ventas contra el emulador de Firestore.
 *
 *   npm run test:reglas
 *
 * (equivale a: firebase emulators:exec --project demo-melastock --only firestore
 *  "npx tsx scripts/test-reglas-ventas.ts"). Requiere Java 11+ en el PATH.
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
  updateDoc,
  type Firestore,
} from 'firebase/firestore';

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
