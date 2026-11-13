/**
 * Datos de prueba para demos.
 *
 *   npm run seed
 *   npm run seed -- --admin-email dueño@correo.com --admin-password Clave123 --admin-nombre "Carlos"
 *
 * Carga categorías, productos, proveedores, materiales, clientes, 30 días de
 * ventas (con kardex, boletas correlativas y resumen diario) y pedidos a medida
 * en todas las etapas, con pagos y consumo de materiales. Los eventos se aplican
 * en orden cronológico, así que stock, kardex y resúmenes cuadran igual que si
 * se hubieran registrado desde la app.
 *
 * Con --admin-email crea (o promueve) ese usuario como administrador activo.
 * Requiere que la base no tenga productos, materiales, ventas ni pedidos
 * (ejecuta antes `npm run reset -- --todo` si hace falta).
 */
import { Timestamp, type Firestore } from 'firebase-admin/firestore';

import { CATEGORIAS_SUGERIDAS, type EtapaPedido, type MetodoPago } from '../src/types/db';
import { argumentos, conectar, confirmarProyecto, contar, diaLima, fechaLima, sumarDias } from './lib/admin';

/* ---------------- utilidades ---------------- */

// Generador pseudoaleatorio con semilla: los datos salen iguales en cada ejecución
let semilla = 20261113;
function azar() {
  semilla |= 0;
  semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const entero = (min: number, max: number) => min + Math.floor(azar() * (max - min + 1));
const elegir = <T>(lista: T[]) => lista[Math.floor(azar() * lista.length)];
const cent = (soles: number) => Math.round(soles * 100);
const ts = (d: Date) => Timestamp.fromDate(d);
const metodoAlAzar = (): MetodoPago => {
  const r = azar();
  return r < 0.45 ? 'Yape' : r < 0.6 ? 'Plin' : r < 0.9 ? 'Efectivo' : 'Tarjeta';
};

type Usuario = { uid: string; nombre: string };
type Doc = Record<string, unknown>;

/* ---------------- datos base ---------------- */

const PRODUCTOS: [string, string, string, number, number, number, number][] = [
  // nombre, categoría, descripción, precio, costo, stock inicial, stock mínimo
  ['Ropero 3 puertas 1.80 m', 'Roperos', 'Melamina 18 mm nogal, 2 cajones y barra para colgar', 850, 520, 10, 2],
  ['Ropero 2 puertas con espejo', 'Roperos', 'Melamina 15 mm blanco, espejo de cuerpo entero', 620, 380, 9, 2],
  ['Ropero 4 puertas 2.00 m', 'Roperos', 'Melamina 18 mm chocolate, maletero superior', 1250, 790, 5, 1],
  ['Cómoda 4 cajones', 'Cómodas', 'Correderas metálicas, color cerezo', 380, 230, 12, 2],
  ['Cómoda 6 cajones', 'Cómodas', 'Blanco con tiradores negros', 520, 310, 7, 2],
  ['Cocina modular 1.50 m', 'Cocinas', 'Mueble bajo + alto, melamina 18 mm haya', 1450, 900, 4, 1],
  ['Reposteros aéreos 1.20 m', 'Cocinas', '3 puertas, melamina 15 mm blanco', 480, 290, 6, 1],
  ['Escritorio 1.20 m con cajón', 'Escritorios', 'Melamina 18 mm roble, cajonera lateral', 320, 190, 15, 3],
  ['Escritorio en L 1.40 m', 'Escritorios', 'Nogal con blanco, ideal para home office', 560, 340, 6, 1],
  ['Cama 2 plazas con cajones', 'Camas', '4 cajones inferiores, color chocolate', 980, 600, 4, 1],
  ['Estante 5 niveles', 'Estantes', 'Melamina 15 mm blanco, 1.80 m de alto', 260, 150, 18, 3],
  ['Velador 2 cajones', 'Veladores', 'Melamina 15 mm cerezo', 140, 80, 24, 4],
  ['Centro de TV 1.60 m', 'Centros de TV', 'Para TV de hasta 65", con repisas', 690, 420, 5, 1],
  ['Zapatera 3 niveles', 'Otros', 'Melamina 15 mm blanco, puertas abatibles', 180, 100, 10, 2],
];

const PROVEEDORES = [
  { nombre: 'Maderas del Sur', telefono: '987111222', contacto: 'Sr. Ramírez', direccion: 'Av. Industrial 456, Ate', notas: 'Entrega en 48 h. Crédito 15 días.' },
  { nombre: 'Novopan Perú', telefono: '956333444', contacto: 'Lucía Paredes', direccion: 'Av. Argentina 1800, Callao', notas: null },
  { nombre: 'Ferretería Lima', telefono: '912555666', contacto: 'Don Julio', direccion: 'Jr. Paruro 920, Cercado', notas: 'Bisagras, correderas y tornillería' },
];

const MATERIALES: [string, string, string | null, number | null, string, number, number, number, number][] = [
  // nombre, tipo, color, espesor, unidad, stock inicial, mínimo, costo, índice de proveedor
  ['Plancha melamina Blanco 18 mm', 'plancha', 'Blanco', 18, 'plancha', 16, 6, 165, 0],
  ['Plancha melamina Nogal 18 mm', 'plancha', 'Nogal', 18, 'plancha', 8, 6, 185, 0],
  ['Plancha melamina Chocolate 18 mm', 'plancha', 'Chocolate', 18, 'plancha', 8, 4, 185, 0],
  ['Plancha melamina Blanco 15 mm', 'plancha', 'Blanco', 15, 'plancha', 20, 8, 140, 1],
  ['Plancha melamina Cerezo 15 mm', 'plancha', 'Cerezo', 15, 'plancha', 5, 4, 160, 1],
  ['Plancha MDF 3 mm (fondo)', 'plancha', 'Natural', 3, 'plancha', 10, 5, 38, 0],
  ['Tapacanto Blanco 22 mm', 'tapacanto', 'Blanco', 22, 'metro', 200, 100, 0.45, 2],
  ['Tapacanto Nogal 22 mm', 'tapacanto', 'Nogal', 22, 'metro', 120, 100, 0.55, 2],
  ['Bisagra cangrejo 35 mm recta', 'bisagra', null, null, 'und', 140, 60, 1.8, 2],
  ['Bisagra cangrejo 35 mm curva', 'bisagra', null, null, 'und', 60, 60, 1.9, 2],
  ['Corredera telescópica 45 cm', 'corredera', null, null, 'par', 24, 12, 14, 2],
  ['Tornillo 4x50 mm (caja 200)', 'tornilleria', null, null, 'caja', 6, 3, 22, 2],
  ['Tirador barra 128 mm negro', 'otro', 'Negro', null, 'und', 60, 30, 3.5, 2],
];

const CLIENTES: [string, string | null, string | null][] = [
  ['María Quispe', '987654321', 'Av. Los Olivos 123, Los Olivos'],
  ['Jorge Huamán', '912345678', 'Jr. Las Begonias 456, SJL'],
  ['Rosa Ccahuana', '956781234', 'Calle 5 Mz B Lt 12, Villa El Salvador'],
  ['Luis Mendoza', '945112233', 'Av. Brasil 1450, Pueblo Libre'],
  ['Ana Torres', '934556677', 'Jr. Huancayo 210, Breña'],
  ['Pedro Salazar', '976889900', null],
  ['Carmen Rojas', '921334455', 'Av. Universitaria 3020, SMP'],
  ['Diego Chávez', '989223344', null],
  ['Lucía Vargas', '947665544', 'Calle Los Pinos 88, Surco'],
  ['Cliente de tienda', null, null],
];

/* ---------------- estado de la simulación ---------------- */

type Item = { id: string; nombre: string; stock: number; ultimoMovimientoId: string | null; ultimoCosto?: number | null; costo?: number | null };
type Resumen = {
  dia: string;
  numVentas: number;
  totalCent: number;
  costoCent: number;
  unidades: number;
  porMetodoCent: Record<MetodoPago, number>;
  pagosPedidosCent: number;
  pagosPedidosPorMetodoCent: Record<MetodoPago, number>;
  ultimaVentaId: string | null;
  ultimoPago: { pedidoId: string; indice: number } | null;
  actualizadoEn: Timestamp;
};

const ceros = () => ({ Yape: 0, Plin: 0, Efectivo: 0, Tarjeta: 0 }) as Record<MetodoPago, number>;

async function main() {
  const { db, auth, projectId } = conectar();
  const a = argumentos();

  // 1) Verificar que la base esté vacía
  for (const col of ['productos', 'materiales', 'ventas', 'pedidos']) {
    if ((await contar(db, col)) > 0) {
      console.error(`\n✘ La colección "${col}" ya tiene datos. Ejecuta primero: npm run reset -- --todo\n`);
      process.exit(1);
    }
  }
  await confirmarProyecto(projectId, 'cargar DATOS DE PRUEBA (30 días de ventas, pedidos y kardex)');

  // 2) Usuario admin (opcional) y usuarios que firmarán las operaciones
  const adminEmail = a.valor('admin-email');
  if (adminEmail) await asegurarAdmin(db, auth, adminEmail, a.valor('admin-password'), a.valor('admin-nombre'));
  const perfiles = await db.collection('perfiles').where('activo', '==', true).get();
  const usuarios: Usuario[] = perfiles.docs.map((d) => ({ uid: d.id, nombre: String(d.data().nombre) }));
  const admins: Usuario[] = perfiles.docs.filter((d) => d.data().rol === 'admin').map((d) => ({ uid: d.id, nombre: String(d.data().nombre) }));
  if (!admins.length) {
    console.error('\n✘ No hay ningún administrador activo. Usa: npm run seed -- --admin-email correo --admin-password clave --admin-nombre "Nombre"\n');
    process.exit(1);
  }
  const admin = admins[0];

  const hoy = diaLima();
  const inicio = sumarDias(hoy, -30);
  const escritor = db.bulkWriter();
  const set = (col: string, id: string, data: Doc) => escritor.set(db.collection(col).doc(id), data);
  const nuevoId = (col: string) => db.collection(col).doc().id;
  let totalMovs = 0;

  // 3) Catálogo
  const categorias = new Map<string, string>();
  CATEGORIAS_SUGERIDAS.forEach((c, i) => {
    const id = nuevoId('categorias');
    categorias.set(c.nombre, id);
    set('categorias', id, { nombre: c.nombre, icono: c.icono, orden: i + 1 });
  });

  const proveedores = PROVEEDORES.map((p) => {
    const id = nuevoId('proveedores');
    set('proveedores', id, { ...p, creadoEn: ts(fechaLima(inicio, 8)), actualizadoEn: ts(fechaLima(inicio, 8)) });
    return { id, nombre: p.nombre };
  });

  const productos: (Item & { precio: number; stockInicial: number; datos: Doc })[] = PRODUCTOS.map(([nombre, cat, descripcion, precio, costo, stock, stockMinimo]) => ({
    id: nuevoId('productos'),
    nombre,
    stock: 0,
    ultimoMovimientoId: null,
    costo,
    precio,
    stockInicial: stock,
    datos: {
      nombre,
      descripcion,
      categoriaId: categorias.get(cat) ?? null,
      categoriaNombre: cat,
      precio,
      costo,
      stockMinimo,
      fotoUrl: null,
      activo: true,
      creadoEn: ts(fechaLima(inicio, 9)),
    },
  }));

  const materiales: (Item & { unidad: string; stockInicial: number; datos: Doc; proveedor: { id: string; nombre: string } })[] = MATERIALES.map(
    ([nombre, tipo, color, espesorMm, unidad, stock, stockMinimo, costo, iProv]) => ({
      id: nuevoId('materiales'),
      nombre,
      stock: 0,
      ultimoMovimientoId: null,
      ultimoCosto: costo,
      unidad,
      stockInicial: stock,
      proveedor: proveedores[iProv],
      datos: {
        nombre,
        tipo,
        color,
        espesorMm,
        unidad,
        stockMinimo,
        proveedorId: proveedores[iProv].id,
        proveedorNombre: proveedores[iProv].nombre,
        creadoEn: ts(fechaLima(inicio, 9)),
      },
    })
  );

  const clientes = CLIENTES.map(([nombre, telefono, direccion]) => ({
    id: telefono ? `tel-${telefono}` : nuevoId('clientes'),
    nombre,
    telefono,
    direccion,
    ultimaCompraEn: null as Date | null,
  }));

  // 4) Kardex: helper que aplica un movimiento a un ítem
  const movimiento = (
    id: string,
    item: Item,
    itemTipo: 'producto' | 'material',
    tipo: 'entrada' | 'salida' | 'ajuste',
    cantidad: number,
    fecha: Date,
    usuario: Usuario,
    extra: Doc = {}
  ) => {
    const stockAnterior = item.stock;
    const stockNuevo = tipo === 'ajuste' ? stockAnterior + cantidad : tipo === 'entrada' ? stockAnterior + cantidad : stockAnterior - cantidad;
    if (stockNuevo < 0) throw new Error(`Stock negativo en ${item.nombre}`);
    item.stock = stockNuevo;
    item.ultimoMovimientoId = id;
    totalMovs++;
    set('movimientos', id, {
      tipo,
      itemTipo,
      itemId: item.id,
      itemNombre: item.nombre,
      cantidad,
      costoUnitario: null,
      stockAnterior,
      stockNuevo,
      ventaId: null,
      indiceItem: null,
      proveedorId: null,
      proveedorNombre: null,
      nota: null,
      usuarioId: usuario.uid,
      usuarioNombre: usuario.nombre,
      fecha: ts(fecha),
      ...extra,
    });
  };

  // Stock inicial (un día antes del periodo)
  const diaInicial = sumarDias(inicio, -1);
  for (const p of productos) {
    movimiento(nuevoId('movimientos'), p, 'producto', 'ajuste', p.stockInicial, fechaLima(diaInicial, 10), admin, { nota: 'Stock inicial' });
  }
  for (const m of materiales) {
    movimiento(nuevoId('movimientos'), m, 'material', 'ajuste', m.stockInicial, fechaLima(diaInicial, 10), admin, { nota: 'Stock inicial' });
  }

  // 5) Resúmenes por día
  const resumenes = new Map<string, Resumen>();
  const resumenDe = (dia: string, fecha: Date) => {
    let r = resumenes.get(dia);
    if (!r) {
      r = { dia, numVentas: 0, totalCent: 0, costoCent: 0, unidades: 0, porMetodoCent: ceros(), pagosPedidosCent: 0, pagosPedidosPorMetodoCent: ceros(), ultimaVentaId: null, ultimoPago: null, actualizadoEn: ts(fecha) };
      resumenes.set(dia, r);
    }
    r.actualizadoEn = ts(fecha);
    return r;
  };

  // 6) Pedidos a medida: plan por días relativos a hoy
  type PlanPedido = {
    cliente: number;
    descripcion: string;
    medidas: string;
    materialColor: string;
    precio: number;
    creado: number;
    entrega: number;
    adelanto: number;
    etapas: [EtapaPedido, number][];
    pagos: [number, number][]; // [día relativo, monto]
    consumos: [number, number, number][]; // [día relativo, índice de material, cantidad]
  };
  const PLAN: PlanPedido[] = [
    { cliente: 3, descripcion: 'Closet empotrado 2.80 m con puertas corredizas', medidas: '2.80 x 2.40 x 0.60 m', materialColor: 'Blanco 18 mm', precio: 3200, creado: -1, entrega: 20, adelanto: 0, etapas: [], pagos: [], consumos: [] },
    { cliente: 4, descripcion: 'Cocina en L con alacena', medidas: '2.40 + 1.60 m', materialColor: 'Blanco 18 mm y haya', precio: 4800, creado: -6, entrega: 8, adelanto: 1900, etapas: [['corte', -4]], pagos: [], consumos: [[-4, 0, 3], [-4, 6, 25]] },
    { cliente: 6, descripcion: 'Centro de entretenimiento con repisas flotantes', medidas: '2.20 x 1.80 m', materialColor: 'Nogal 18 mm', precio: 1650, creado: -12, entrega: 2, adelanto: 800, etapas: [['corte', -10], ['enchapado', -7]], pagos: [], consumos: [[-9, 1, 2], [-8, 7, 18]] },
    { cliente: 1, descripcion: 'Ropero 6 puertas a medida con cajonera', medidas: '2.70 x 2.40 x 0.55 m', materialColor: 'Chocolate 18 mm', precio: 2950, creado: -20, entrega: -2, adelanto: 1000, etapas: [['corte', -17], ['enchapado', -14], ['armado', -9]], pagos: [[-10, 800]], consumos: [[-15, 2, 4], [-15, 9, 12], [-14, 10, 4]] },
    { cliente: 8, descripcion: 'Escritorio doble con librero alto', medidas: '2.00 x 0.70 m + librero 2.00 m', materialColor: 'Blanco 15 mm', precio: 1380, creado: -18, entrega: 1, adelanto: 700, etapas: [['corte', -15], ['enchapado', -12], ['armado', -6], ['entrega', -1]], pagos: [[-1, 400]], consumos: [[-14, 3, 3], [-13, 6, 20]] },
    { cliente: 0, descripcion: 'Cocina recta 3.00 m con reposteros', medidas: '3.00 x 0.60 x 0.90 m', materialColor: 'Blanco 18 mm', precio: 5200, creado: -27, entrega: -14, adelanto: 2600, etapas: [['corte', -25], ['enchapado', -22], ['armado', -18], ['entrega', -15], ['entregado', -13]], pagos: [[-13, 2600]], consumos: [[-24, 0, 6], [-24, 6, 40], [-22, 8, 16], [-21, 10, 6]] },
    { cliente: 2, descripcion: 'Cama tarima 2 plazas con cabecera', medidas: '1.60 x 2.00 m', materialColor: 'Cerezo 15 mm', precio: 1100, creado: -16, entrega: -5, adelanto: 300, etapas: [['cancelado', -14]], pagos: [], consumos: [] },
  ];

  // 7) Eventos en orden cronológico
  type Evento = { fecha: Date; orden: number; aplicar: () => void };
  const eventos: Evento[] = [];
  const agendar = (fecha: Date, aplicar: () => void) => eventos.push({ fecha, orden: eventos.length, aplicar });

  // Ingresos de material (compras) cada 5–6 días
  for (let d = 2; d <= 29; d += entero(5, 6)) {
    const dia = sumarDias(inicio, d);
    agendar(fechaLima(dia, 9, 30), () => {
      for (const m of materiales.filter(() => azar() < 0.35)) {
        const cantidad = m.unidad === 'metro' ? entero(5, 10) * 10 : m.unidad === 'plancha' ? entero(2, 6) : entero(10, 40);
        const costo = Math.round(Number(m.ultimoCosto) * (1 + (azar() - 0.4) * 0.06) * 100) / 100;
        m.ultimoCosto = costo;
        movimiento(nuevoId('movimientos'), m, 'material', 'entrada', cantidad, fechaLima(dia, 9, 30), admin, {
          costoUnitario: costo,
          proveedorId: m.proveedor.id,
          proveedorNombre: m.proveedor.nombre,
          nota: `Factura ${entero(1000, 9999)}`,
        });
      }
    });
  }

  // Ventas de catálogo
  let numeroBoleta = 0;
  let ultimaVentaId = '';
  let anuladas = 0;
  let totalVentas = 0;
  // Hoy solo se generan ventas en horas que ya pasaron
  const horaActual = new Date(Date.now() - 5 * 3600_000).getUTCHours();
  for (let d = 1; d <= 30; d++) {
    const dia = sumarDias(inicio, d);
    const esHoy = dia === hoy;
    const domingo = new Date(`${dia}T12:00:00Z`).getUTCDay() === 0;
    const n = esHoy ? (horaActual >= 11 ? entero(1, 2) : 0) : domingo ? entero(0, 1) : entero(1, 4);
    for (let k = 0; k < n; k++) {
      const fecha = fechaLima(dia, esHoy ? entero(9, horaActual - 1) : entero(10, 19), entero(0, 59));
      agendar(fecha, () => {
        const disponibles = productos.filter((p) => p.stock > 0);
        if (!disponibles.length) return;
        const elegidos = [...disponibles].sort(() => azar() - 0.5).slice(0, azar() < 0.7 ? 1 : entero(2, 3));
        const items = elegidos.map((p) => ({ p, cantidad: Math.min(p.stock, azar() < 0.8 ? 1 : 2) }));
        const cliente = elegir(clientes);
        const vendedor = elegir(usuarios);
        const metodo = metodoAlAzar();
        const ventaId = nuevoId('ventas');
        numeroBoleta++;
        ultimaVentaId = ventaId;
        totalVentas++;
        const codigoBoleta = `B001-${String(numeroBoleta).padStart(8, '0')}`;
        const lineas = items.map(({ p, cantidad }) => ({
          productoId: p.id,
          nombre: p.nombre,
          cantidad,
          precioCent: cent(p.precio),
          costoCent: cent(Number(p.costo)),
          totalCent: cent(p.precio) * cantidad,
        }));
        const subtotalCent = lineas.reduce((s, l) => s + l.totalCent, 0);
        const descuentoCent = azar() < 0.25 ? cent(entero(1, 5) * 10) : 0;
        const conDelivery = cliente.direccion != null && azar() < 0.35;
        const deliveryCent = conDelivery ? cent(elegir([20, 25, 30, 40])) : 0;
        const totalCent = subtotalCent - descuentoCent + deliveryCent;
        const costoTotalCent = lineas.reduce((s, l) => s + l.costoCent * l.cantidad, 0);
        const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
        const conEntrega = conDelivery && azar() < 0.8;
        const fechaEntrega = conEntrega ? sumarDias(dia, entero(2, 7)) : null;
        const estadoEntrega = !fechaEntrega ? 'entregado' : fechaEntrega < hoy ? 'entregado' : elegir(['pendiente', 'en_produccion', 'listo']);
        const anular = !conEntrega && azar() < 0.03;

        lineas.forEach((l, i) => {
          const p = productos.find((x) => x.id === l.productoId)!;
          movimiento(`${ventaId}_${p.id}`, p, 'producto', 'salida', l.cantidad, fecha, vendedor, {
            costoUnitario: Number(p.costo),
            ventaId,
            indiceItem: i,
            nota: `Venta ${codigoBoleta}`,
          });
        });

        const r = resumenDe(dia, fecha);
        r.numVentas++;
        r.totalCent += totalCent;
        r.costoCent += costoTotalCent;
        r.unidades += unidades;
        r.porMetodoCent[metodo] += totalCent;
        r.ultimaVentaId = ventaId;

        cliente.ultimaCompraEn = fecha;
        let cancelacion: Doc = { canceladaEn: null, canceladaPor: null, canceladaPorNombre: null };
        if (anular) {
          anuladas++;
          const fechaAnul = new Date(fecha.getTime() + 40 * 60_000);
          lineas.forEach((l, i) => {
            const p = productos.find((x) => x.id === l.productoId)!;
            movimiento(`${ventaId}_${p.id}_anul`, p, 'producto', 'entrada', l.cantidad, fechaAnul, admin, {
              costoUnitario: Number(p.costo),
              ventaId,
              indiceItem: i,
              nota: `Anulación de ${codigoBoleta}`,
            });
          });
          r.numVentas--;
          r.totalCent -= totalCent;
          r.costoCent -= costoTotalCent;
          r.unidades -= unidades;
          r.porMetodoCent[metodo] -= totalCent;
          cancelacion = { canceladaEn: ts(fechaAnul), canceladaPor: admin.uid, canceladaPorNombre: admin.nombre };
        }

        set('ventas', ventaId, {
          numeroBoleta,
          codigoBoleta,
          clienteId: cliente.id,
          clienteNombre: cliente.nombre,
          clienteTelefono: cliente.telefono,
          vendedorId: vendedor.uid,
          vendedorNombre: vendedor.nombre,
          items: lineas,
          metodoPago: metodo,
          subtotalCent,
          descuentoCent,
          deliveryCent,
          totalCent,
          costoTotalCent,
          unidades,
          deliveryDireccion: conDelivery ? cliente.direccion : null,
          fechaEntrega,
          estadoEntrega: anular ? 'cancelado' : estadoEntrega,
          notas: null,
          fecha: ts(fecha),
          dia,
          actualizadoEn: ts(fecha),
          ...cancelacion,
        });
      });
    }
  }

  // Pedidos a medida
  let numeroPedido = 0;
  let ultimoPedidoId = '';
  const pedidos = PLAN.map((plan) => ({ plan, id: nuevoId('pedidos') }));
  for (const { plan, id } of pedidos) {
    const cliente = clientes[plan.cliente];
    const vendedor = elegir(usuarios);
    const precioCent = cent(plan.precio);
    const pedido = {
      numero: 0,
      codigo: '',
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      clienteTelefono: cliente.telefono,
      descripcion: plan.descripcion,
      medidas: plan.medidas,
      materialColor: plan.materialColor,
      notas: null as string | null,
      precioCent,
      pagadoCent: 0,
      saldoCent: precioCent,
      costoMaterialesCent: 0,
      etapa: 'cotizado' as EtapaPedido,
      historialEtapas: [] as Doc[],
      pagos: [] as Doc[],
      diasPago: [] as string[],
      fechaEntrega: sumarDias(hoy, plan.entrega),
      vendedorId: vendedor.uid,
      vendedorNombre: vendedor.nombre,
      creadoEn: null as Timestamp | null,
      actualizadoEn: null as Timestamp | null,
      ultimoMovimientoId: null as string | null,
    };
    const pagar = (dia: string, fecha: Date, montoCent: number, usuario: Usuario, nota: string | null) => {
      const metodo = metodoAlAzar();
      const indice = pedido.pagos.length;
      pedido.pagos.push({ montoCent, metodo, fecha: ts(fecha), dia, usuarioId: usuario.uid, usuarioNombre: usuario.nombre, nota });
      if (!pedido.diasPago.includes(dia)) pedido.diasPago.push(dia);
      pedido.pagadoCent += montoCent;
      pedido.saldoCent = pedido.precioCent - pedido.pagadoCent;
      const r = resumenDe(dia, fecha);
      r.pagosPedidosCent += montoCent;
      r.pagosPedidosPorMetodoCent[metodo] += montoCent;
      r.ultimoPago = { pedidoId: id, indice };
    };

    const diaCreado = sumarDias(hoy, plan.creado);
    const fechaCreado = fechaLima(diaCreado, 11, entero(0, 59));
    agendar(fechaCreado, () => {
      numeroPedido++;
      ultimoPedidoId = id;
      pedido.numero = numeroPedido;
      pedido.codigo = `P-${String(numeroPedido).padStart(4, '0')}`;
      pedido.creadoEn = ts(fechaCreado);
      pedido.actualizadoEn = ts(fechaCreado);
      pedido.historialEtapas.push({ etapa: 'cotizado', fecha: ts(fechaCreado), usuarioId: vendedor.uid, usuarioNombre: vendedor.nombre, nota: null });
      if (plan.adelanto > 0) pagar(diaCreado, fechaCreado, cent(plan.adelanto), vendedor, 'Adelanto');
      cliente.ultimaCompraEn = fechaCreado;
    });
    for (const [etapa, rel] of plan.etapas) {
      const f = fechaLima(sumarDias(hoy, rel), 17, entero(0, 50));
      agendar(f, () => {
        const quien = etapa === 'cancelado' ? admin : elegir(usuarios);
        pedido.etapa = etapa;
        pedido.historialEtapas.push({ etapa, fecha: ts(f), usuarioId: quien.uid, usuarioNombre: quien.nombre, nota: etapa === 'cancelado' ? 'Cliente desistió' : null });
        pedido.actualizadoEn = ts(f);
      });
    }
    for (const [rel, monto] of plan.pagos) {
      const dia = sumarDias(hoy, rel);
      const f = fechaLima(dia, 16, entero(0, 50));
      agendar(f, () => {
        pagar(dia, f, Math.min(cent(monto), pedido.saldoCent), elegir(usuarios), null);
        pedido.actualizadoEn = ts(f);
      });
    }
    for (const [rel, iMat, cantidad] of plan.consumos) {
      const f = fechaLima(sumarDias(hoy, rel), 15, entero(0, 50));
      agendar(f, () => {
        const m = materiales[iMat];
        const usuario = elegir(usuarios);
        const costoTotalCent = Math.round(cantidad * Number(m.ultimoCosto) * 100);
        const movId = nuevoId('movimientos');
        movimiento(movId, m, 'material', 'salida', cantidad, f, usuario, {
          costoUnitario: m.ultimoCosto,
          nota: `Pedido ${pedido.codigo}`,
          pedidoId: id,
          costoTotalCent,
        });
        pedido.costoMaterialesCent += costoTotalCent;
        pedido.ultimoMovimientoId = movId;
        pedido.actualizadoEn = ts(f);
      });
    }
    // El documento del pedido se escribe al final, ya con todo aplicado
    agendar(new Date(8640000000000000), () => set('pedidos', id, { ...pedido }));
  }

  eventos.sort((x, y) => x.fecha.getTime() - y.fecha.getTime() || x.orden - y.orden);
  for (const e of eventos) e.aplicar();

  // 8) Documentos finales con el stock resultante
  for (const p of productos) {
    set('productos', p.id, { ...p.datos, stock: p.stock, ultimoMovimientoId: p.ultimoMovimientoId, actualizadoEn: ts(new Date()) });
  }
  for (const m of materiales) {
    set('materiales', m.id, { ...m.datos, stock: m.stock, ultimoCosto: m.ultimoCosto, ultimoMovimientoId: m.ultimoMovimientoId, actualizadoEn: ts(new Date()) });
  }
  for (const c of clientes) {
    set('clientes', c.id, {
      nombre: c.nombre,
      telefono: c.telefono,
      direccion: c.direccion,
      creadoEn: ts(fechaLima(inicio, 9)),
      ultimaCompraEn: c.ultimaCompraEn ? ts(c.ultimaCompraEn) : null,
      actualizadoEn: ts(new Date()),
    });
  }
  for (const r of resumenes.values()) set('resumen_diario', r.dia, { ...r });
  set('contadores', 'boletas', { serie: 'B001', ultimo: numeroBoleta, ultimaVentaId: ultimaVentaId || null });
  set('contadores', 'pedidos', { serie: 'P', ultimo: numeroPedido, ultimoPedidoId: ultimoPedidoId || null });

  await escritor.close();

  console.log(`\n✔ Datos de prueba cargados en "${projectId}":`);
  console.log(`  ${CATEGORIAS_SUGERIDAS.length} categorías, ${productos.length} productos, ${proveedores.length} proveedores, ${materiales.length} materiales, ${clientes.length} clientes`);
  console.log(`  ${totalVentas} ventas (${anuladas} anuladas), ${pedidos.length} pedidos a medida, ${totalMovs} movimientos de kardex, ${resumenes.size} resúmenes diarios`);
  console.log(`  Operaciones firmadas por: ${usuarios.map((u) => u.nombre).join(', ')}\n`);
  process.exit(0);
}

/** Crea el usuario (si no existe) y lo deja como administrador activo */
async function asegurarAdmin(
  db: Firestore,
  auth: ReturnType<typeof conectar>['auth'],
  email: string,
  password: string | undefined,
  nombre: string | undefined
) {
  let uid: string;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
    console.log(`  Usuario ${email} ya existe: se marcará como administrador.`);
  } catch {
    if (!password || password.length < 6) {
      console.error('\n✘ Para crear el admin indica --admin-password (mínimo 6 caracteres).\n');
      process.exit(1);
    }
    uid = (await auth.createUser({ email, password, displayName: nombre ?? email.split('@')[0] })).uid;
    console.log(`  Usuario ${email} creado.`);
  }
  await db
    .collection('perfiles')
    .doc(uid)
    .set({ nombre: nombre ?? email.split('@')[0], email, rol: 'admin', activo: true, creadoEn: Timestamp.now() }, { merge: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
