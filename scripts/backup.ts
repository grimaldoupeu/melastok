/**
 * Respaldo de todas las colecciones de MelaStock a un archivo JSON.
 *
 *   npm run backup
 *
 * Crea backups/melastock-YYYY-MM-DD.json (si ya existe uno de hoy, agrega la hora).
 * La carpeta backups/ está en .gitignore porque contiene datos de clientes.
 * Las cuentas de acceso (Authentication) no se incluyen; los perfiles sí.
 * Restaurar con: npm run restore
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { conectar, hoyArchivo, TODAS_LAS_COLECCIONES } from './lib/admin';
import { aJSON, type Respaldo } from './lib/respaldo';

async function main() {
  const { db, projectId } = conectar();
  const respaldo: Respaldo = { app: 'MelaStock', version: 1, proyecto: projectId, creadoEn: new Date().toISOString(), colecciones: {} };

  console.log(`\nRespaldando "${projectId}"…`);
  let total = 0;
  for (const col of TODAS_LAS_COLECCIONES) {
    const snap = await db.collection(col).get();
    respaldo.colecciones[col] = Object.fromEntries(snap.docs.map((d) => [d.id, aJSON(d.data()) as Record<string, never>]));
    total += snap.size;
    console.log(`  ${col.padEnd(16)} ${snap.size}`);
  }

  const carpeta = resolve(process.cwd(), 'backups');
  mkdirSync(carpeta, { recursive: true });
  let archivo = resolve(carpeta, `melastock-${hoyArchivo()}.json`);
  if (existsSync(archivo)) {
    const hora = new Date(Date.now() - 5 * 3600_000).toISOString().slice(11, 16).replace(':', '');
    archivo = resolve(carpeta, `melastock-${hoyArchivo()}-${hora}.json`);
  }
  writeFileSync(archivo, JSON.stringify(respaldo, null, 1));
  console.log(`\n✔ ${total} documentos guardados en:\n  ${archivo}\n`);
  console.log('  Guarda una copia fuera de la PC (Drive, USB). Contiene datos de clientes: no lo compartas.\n');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
