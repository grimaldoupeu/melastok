/**
 * Restaura un respaldo creado con `npm run backup`.
 *
 *   npm run restore                                        → usa el respaldo más reciente de backups/
 *   npm run restore -- backups/melastock-2026-11-13.json   → un archivo concreto
 *   npm run restore -- --combinar                          → no borra lo actual; solo sobrescribe
 *                                                            los documentos con el mismo ID
 *
 * Por defecto, cada colección incluida en el respaldo se BORRA y se vuelve a
 * escribir tal como estaba, para dejar la base exactamente en ese estado.
 * Pide escribir el ID del proyecto antes de continuar.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { argumentos, borrarColeccion, carpetaBackups, conectar, confirmarProyecto } from './lib/admin';
import { deJSON, type Respaldo } from './lib/respaldo';

function respaldoMasReciente(): string | null {
  const carpeta = carpetaBackups();
  if (!existsSync(carpeta)) return null;
  const archivos = readdirSync(carpeta).filter((f) => /^melastock-.*\.json$/.test(f)).sort();
  return archivos.length ? resolve(carpeta, archivos[archivos.length - 1]) : null;
}

async function main() {
  const { db, projectId } = conectar();
  const a = argumentos();
  const archivo = a.sueltos[0] ? resolve(process.cwd(), a.sueltos[0]) : respaldoMasReciente();
  if (!archivo || !existsSync(archivo)) {
    console.error('\n✘ No se encontró el archivo de respaldo. Indica la ruta: npm run restore -- backups/melastock-AAAA-MM-DD.json\n');
    process.exit(1);
  }
  const respaldo = JSON.parse(readFileSync(archivo, 'utf8')) as Respaldo;
  if (respaldo.app !== 'MelaStock' || respaldo.version !== 1) {
    console.error('\n✘ El archivo no es un respaldo de MelaStock.\n');
    process.exit(1);
  }
  const combinar = a.tiene('combinar');

  console.log(`\nArchivo:  ${archivo}`);
  console.log(`Creado:   ${respaldo.creadoEn} (proyecto ${respaldo.proyecto})`);
  console.log(`Destino:  ${projectId}`);
  if (respaldo.proyecto !== projectId) console.log('⚠  El respaldo es de OTRO proyecto.');
  for (const [col, docs] of Object.entries(respaldo.colecciones)) console.log(`  ${col.padEnd(16)} ${Object.keys(docs).length}`);
  console.log(combinar ? 'Modo combinar: no se borra nada; se sobrescriben los documentos del respaldo.' : 'Se BORRARÁ el contenido actual de esas colecciones y se reemplazará por el respaldo.');

  await confirmarProyecto(projectId, combinar ? 'restaurar (combinando) este respaldo' : 'REEMPLAZAR los datos por este respaldo');

  for (const [col, docs] of Object.entries(respaldo.colecciones)) {
    if (!combinar) await borrarColeccion(db, col);
    const escritor = db.bulkWriter();
    for (const [id, data] of Object.entries(docs)) escritor.set(db.collection(col).doc(id), deJSON(data) as Record<string, unknown>);
    await escritor.close();
    console.log(`  ✔ ${col}: ${Object.keys(docs).length} restaurados`);
  }
  console.log('\n✔ Respaldo restaurado. Las cuentas de acceso (correo y contraseña) no forman parte del respaldo.\n');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
