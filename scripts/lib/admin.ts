/**
 * Utilidades comunes de los scripts de administración (seed, reset, backup, restore).
 *
 * Se conectan con firebase-admin usando la clave de cuenta de servicio:
 *   - con --cliente <nombre>: clientes/<nombre>/serviceAccount.json (proyecto de ese cliente),
 *   - si no: serviceAccount.json en la raíz (proyecto de demostración), o
 *   - la ruta indicada en la variable GOOGLE_APPLICATION_CREDENTIALS.
 * clientes/ y serviceAccount.json están en .gitignore.
 * firebase-admin NO pasa por las reglas de seguridad: úsalos con cuidado.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

import { cert, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export const COLECCIONES_OPERACION = ['ventas', 'pedidos', 'movimientos', 'resumen_diario', 'clientes'] as const;
export const COLECCIONES_CATALOGO = ['productos', 'categorias', 'materiales', 'proveedores'] as const;
export const TODAS_LAS_COLECCIONES = ['perfiles', ...COLECCIONES_CATALOGO, ...COLECCIONES_OPERACION, 'contadores'] as const;

export type Conexion = { app: App; db: Firestore; auth: ReturnType<typeof getAuth>; projectId: string };

export function conectar(clienteForzado?: string): Conexion {
  // Emulador (pruebas): no necesita clave
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const projectId = process.env.GCLOUD_PROJECT || 'demo-melastock';
    const app = initializeApp({ projectId });
    return { app, db: getFirestore(app), auth: getAuth(app), projectId };
  }
  const cliente = clienteForzado ?? argumentos().valor('cliente');
  const ruta = cliente
    ? resolve(carpetaCliente(cliente), 'serviceAccount.json')
    : process.env.GOOGLE_APPLICATION_CREDENTIALS || resolve(process.cwd(), 'serviceAccount.json');
  if (!existsSync(ruta)) {
    console.error(`\n✘ No se encontró la clave de cuenta de servicio en:\n  ${ruta}\n`);
    console.error('  Descárgala en Firebase Console > Configuración del proyecto > Cuentas de servicio >');
    console.error(`  "Generar nueva clave privada" y guárdala en esa ruta.\n`);
    process.exit(1);
  }
  const clave = JSON.parse(readFileSync(ruta, 'utf8')) as { project_id: string };
  const app = initializeApp({ credential: cert(ruta), projectId: clave.project_id });
  return { app, db: getFirestore(app), auth: getAuth(app), projectId: clave.project_id };
}

/** Opciones que llevan un valor a continuación (el resto son banderas) */
const OPCIONES_CON_VALOR = new Set(['--admin-email', '--admin-password', '--admin-nombre', '--cliente', '--email', '--password', '--nombre']);

/** Carpeta de configuración de un cliente: clientes/<nombre> */
export function carpetaCliente(nombre: string): string {
  if (!/^[a-z0-9-]{2,40}$/.test(nombre)) {
    console.error(`\n✘ Nombre de cliente inválido: "${nombre}". Usa minúsculas, números y guiones (ej. taller-juan).\n`);
    process.exit(1);
  }
  return resolve(process.cwd(), 'clientes', nombre);
}

/** Carpeta de respaldos: backups/ (demo) o backups/<cliente>/ */
export function carpetaBackups(): string {
  const cliente = argumentos().valor('cliente');
  return cliente ? resolve(process.cwd(), 'backups', cliente) : resolve(process.cwd(), 'backups');
}

/**
 * Lee la línea de comandos: `--opcion valor`, `--bandera` y argumentos sueltos.
 * Con npm hay que separar con `--`, por ejemplo: npm run reset -- --todo
 */
export function argumentos(): { valor: (k: string) => string | undefined; tiene: (k: string) => boolean; sueltos: string[] } {
  const args = process.argv.slice(2);
  const sueltos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && OPCIONES_CON_VALOR.has(args[i - 1])));
  return {
    valor: (k) => {
      const i = args.indexOf(`--${k}`);
      return i >= 0 ? args[i + 1] : undefined;
    },
    tiene: (k) => args.includes(`--${k}`),
    sueltos,
  };
}

export async function preguntar(texto: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const r = await rl.question(texto);
  rl.close();
  return r.trim();
}

/** Pide escribir el ID del proyecto para continuar. Termina el proceso si no coincide. */
export async function confirmarProyecto(projectId: string, accion: string) {
  console.log(`\n⚠  Vas a ${accion} en el proyecto Firebase "${projectId}".`);
  const r = await preguntar(`   Para confirmar, escribe el ID del proyecto (${projectId}): `);
  if (r !== projectId) {
    console.log('\n✘ No coincide. No se hizo ningún cambio.\n');
    process.exit(1);
  }
}

/** Cuenta los documentos de una colección */
export async function contar(db: Firestore, col: string): Promise<number> {
  const snap = await db.collection(col).count().get();
  return snap.data().count;
}

/** Borra una colección completa (con subcolecciones) */
export async function borrarColeccion(db: Firestore, col: string): Promise<number> {
  const n = await contar(db, col);
  if (n > 0) await db.recursiveDelete(db.collection(col));
  return n;
}

/* ---------------- fechas en hora de Lima (UTC-5) ---------------- */

export function diaLima(d: Date = new Date()): string {
  return new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
}

export function sumarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Fecha y hora de Lima → Date */
export function fechaLima(dia: string, hora: number, minuto = 0): Date {
  const [y, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hora + 5, minuto));
}

/** Fecha de hoy para nombres de archivo: YYYY-MM-DD */
export function hoyArchivo(): string {
  return diaLima();
}
