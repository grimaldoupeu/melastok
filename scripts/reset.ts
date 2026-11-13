/**
 * Deja la base limpia antes de entregar la app (o para empezar de cero).
 *
 *   npm run reset                         → pregunta si borrar también el catálogo
 *   npm run reset -- --todo               → borra operación + catálogo
 *   npm run reset -- --conservar-catalogo → borra solo la operación
 *
 * Borra SIEMPRE: ventas, pedidos, movimientos (kardex), resumen_diario y clientes.
 * Reinicia los correlativos: la próxima boleta será B001-00000001 y el próximo
 * pedido P-0001.
 * Con --todo borra además productos, categorías, materiales y proveedores.
 * Si conserva el catálogo, el stock actual de cada producto y material queda
 * registrado en el kardex nuevo como "Stock inicial".
 * Los usuarios (perfiles y cuentas de acceso) NO se borran.
 *
 * Pide escribir el ID del proyecto antes de borrar. Haz un respaldo antes:
 *   npm run backup
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { argumentos, borrarColeccion, COLECCIONES_CATALOGO, COLECCIONES_OPERACION, conectar, confirmarProyecto, contar, preguntar } from './lib/admin';

async function main() {
  const { db, projectId } = conectar();
  const a = argumentos();

  let borrarCatalogo: boolean;
  if (a.tiene('todo')) borrarCatalogo = true;
  else if (a.tiene('conservar-catalogo')) borrarCatalogo = false;
  else {
    const r = await preguntar('\n¿Borrar también productos, categorías, materiales y proveedores? (s/N): ');
    borrarCatalogo = /^s(i|í)?$/i.test(r);
  }

  const colecciones = [...COLECCIONES_OPERACION, ...(borrarCatalogo ? COLECCIONES_CATALOGO : [])];
  console.log(`\nProyecto: ${projectId}`);
  console.log('Se borrará:');
  for (const c of colecciones) console.log(`  - ${c.padEnd(16)} ${await contar(db, c)} documentos`);
  console.log('Se reiniciarán los correlativos a B001-00000000 y P-0000.');
  console.log(borrarCatalogo ? 'El catálogo también se borra.' : 'Se conserva el catálogo (productos, categorías, materiales y proveedores).');
  console.log('Los usuarios no se tocan.');

  await confirmarProyecto(projectId, 'BORRAR estos datos de forma permanente');

  for (const c of colecciones) {
    const n = await borrarColeccion(db, c);
    console.log(`  ✔ ${c}: ${n} borrados`);
  }

  await db.collection('contadores').doc('boletas').set({ serie: 'B001', ultimo: 0, ultimaVentaId: null });
  await db.collection('contadores').doc('pedidos').set({ serie: 'P', ultimo: 0, ultimoPedidoId: null });
  console.log('  ✔ contadores reiniciados (B001-00000000, P-0000)');

  if (!borrarCatalogo) await registrarStockInicial(db);

  console.log('\n✔ Base limpia. Recuerda que las cuentas de usuario siguen activas.\n');
  process.exit(0);
}

/** Con el kardex vacío, registra el stock actual de cada ítem como "Stock inicial" */
async function registrarStockInicial(db: ReturnType<typeof conectar>['db']) {
  const admin = (await db.collection('perfiles').where('rol', '==', 'admin').where('activo', '==', true).limit(1).get()).docs[0];
  const usuario = admin ? { uid: admin.id, nombre: String(admin.data().nombre) } : { uid: 'sistema', nombre: 'Sistema' };
  const escritor = db.bulkWriter();
  let n = 0;
  for (const [col, itemTipo] of [
    ['productos', 'producto'],
    ['materiales', 'material'],
  ] as const) {
    const snap = await db.collection(col).get();
    for (const d of snap.docs) {
      const stock = Number(d.data().stock ?? 0);
      if (stock > 0) {
        const mov = db.collection('movimientos').doc();
        escritor.set(mov, {
          tipo: 'ajuste',
          itemTipo,
          itemId: d.id,
          itemNombre: String(d.data().nombre),
          cantidad: stock,
          costoUnitario: null,
          stockAnterior: 0,
          stockNuevo: stock,
          ventaId: null,
          indiceItem: null,
          proveedorId: null,
          proveedorNombre: null,
          nota: 'Stock inicial',
          usuarioId: usuario.uid,
          usuarioNombre: usuario.nombre,
          fecha: Timestamp.now(),
        });
        escritor.update(d.ref, { ultimoMovimientoId: mov.id, ...(col === 'productos' ? { ultimaVentaId: FieldValue.delete() } : {}) });
        n++;
      } else {
        escritor.update(d.ref, { ultimoMovimientoId: null, ...(col === 'productos' ? { ultimaVentaId: FieldValue.delete() } : {}) });
      }
    }
  }
  await escritor.close();
  console.log(`  ✔ kardex nuevo: ${n} ítems con "Stock inicial"`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
