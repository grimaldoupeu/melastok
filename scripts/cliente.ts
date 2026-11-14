/**
 * Alta y mantenimiento de clientes: UN PROYECTO FIREBASE POR TIENDA.
 *
 * Cada cliente tiene su carpeta clientes/<nombre>/ (en .gitignore) con:
 *   .env                 → firebaseConfig del proyecto del cliente, Cloudinary y datos del negocio
 *   serviceAccount.json  → clave de cuenta de servicio de SU proyecto
 *
 *   npm run cliente -- lista
 *   npm run cliente -- nuevo <nombre>                    crea la carpeta y la plantilla .env
 *   npm run cliente -- estado <nombre>                   verifica .env y clave
 *   npm run cliente -- reglas <nombre>                   despliega reglas e índices en su proyecto
 *   npm run cliente -- admin <nombre> --email x --password y --nombre "Z" [--categorias]
 *                                                        crea su administrador (y categorías sugeridas)
 *   npm run cliente -- apk <nombre>                      genera su APK en EAS (espera a que termine)
 *
 * Los scripts de datos también aceptan --cliente <nombre>:
 *   npm run backup -- --cliente <nombre>    (respaldos en backups/<nombre>/)
 *   npm run reset -- --cliente <nombre>
 *   npm run restore -- --cliente <nombre>
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { Timestamp } from 'firebase-admin/firestore';

import { CATEGORIAS_SUGERIDAS } from '../src/types/db';
import { argumentos, carpetaCliente, conectar, confirmarProyecto, contar } from './lib/admin';

const VARIABLES = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  'EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME',
  'EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET',
  'EXPO_PUBLIC_BUSINESS_NAME',
  'EXPO_PUBLIC_BUSINESS_PHONE',
  'EXPO_PUBLIC_BUSINESS_ADDRESS',
];

const PLANTILLA = `# MelaStock · configuración del cliente
# 1) Firebase: Consola > Configuración del proyecto > Tus apps > App web > firebaseConfig
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=

# 2) Cloudinary (fotos de productos). Puede ser la misma cuenta de GAMA Studio.
EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=
EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=

# 3) Datos de la tienda (salen en la boleta de WhatsApp). Todos obligatorios.
EXPO_PUBLIC_BUSINESS_NAME=
EXPO_PUBLIC_BUSINESS_PHONE=
EXPO_PUBLIC_BUSINESS_ADDRESS=
`;

function leerEnv(nombre: string): Record<string, string> {
  const ruta = resolve(carpetaCliente(nombre), '.env');
  if (!existsSync(ruta)) {
    console.error(`\n✘ No existe ${relative(process.cwd(), ruta)}. Créalo con: npm run cliente -- nuevo ${nombre}\n`);
    process.exit(1);
  }
  const env: Record<string, string> = {};
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

/** Verifica que el cliente esté completo. Devuelve el ID de su proyecto. */
function verificar(nombre: string, { exigirClave = true } = {}): string {
  const env = leerEnv(nombre);
  const faltan = VARIABLES.filter((k) => !env[k]);
  const errores: string[] = [];
  if (faltan.length) errores.push(`Variables vacías en .env: ${faltan.join(', ')}`);
  const projectId = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  if (projectId === 'melastock-e890d') errores.push('El .env apunta al proyecto de DEMOSTRACIÓN (melastock-e890d). Cada cliente necesita su propio proyecto Firebase.');
  const clave = resolve(carpetaCliente(nombre), 'serviceAccount.json');
  if (exigirClave) {
    if (!existsSync(clave)) errores.push('Falta serviceAccount.json del proyecto del cliente');
    else {
      const id = (JSON.parse(readFileSync(clave, 'utf8')) as { project_id?: string }).project_id;
      if (id !== projectId) errores.push(`serviceAccount.json es del proyecto "${id}" pero el .env apunta a "${projectId}"`);
    }
  }
  if (errores.length) {
    console.error(`\n✘ El cliente "${nombre}" no está listo:\n  - ${errores.join('\n  - ')}\n`);
    process.exit(1);
  }
  return projectId;
}

function ejecutar(comando: string) {
  console.log(`\n$ ${comando}\n`);
  const r = spawnSync(comando, { stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`\n✘ El comando terminó con error (${r.status}).\n`);
    process.exit(r.status ?? 1);
  }
}

async function main() {
  const a = argumentos();
  const [accion, nombre] = a.sueltos;

  if (!accion || accion === 'ayuda') {
    console.log(readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*|^ \* ?/gm, ''));
    return;
  }

  if (accion === 'lista') {
    const dir = resolve(process.cwd(), 'clientes');
    const nombres = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
    if (!nombres.length) console.log('\nAún no hay clientes. Crea uno con: npm run cliente -- nuevo <nombre>\n');
    for (const n of nombres) {
      const env = existsSync(resolve(dir, n, '.env')) ? leerEnv(n) : {};
      const clave = existsSync(resolve(dir, n, 'serviceAccount.json')) ? 'clave ✔' : 'sin clave';
      console.log(`  ${n.padEnd(24)} ${env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '(sin proyecto)'}  ·  ${env.EXPO_PUBLIC_BUSINESS_NAME || ''}  ·  ${clave}`);
    }
    return;
  }

  if (!nombre) {
    console.error('\n✘ Indica el nombre del cliente. Ej.: npm run cliente -- estado taller-juan\n');
    process.exit(1);
  }
  const carpeta = carpetaCliente(nombre);

  switch (accion) {
    case 'nuevo': {
      mkdirSync(carpeta, { recursive: true });
      const env = resolve(carpeta, '.env');
      if (existsSync(env)) console.log(`\n  ${relative(process.cwd(), env)} ya existe; no se sobrescribe.`);
      else writeFileSync(env, PLANTILLA);
      console.log(`
✔ Carpeta lista: ${relative(process.cwd(), carpeta)}

Pasos para "${nombre}":
  1. En console.firebase.google.com crea un proyecto nuevo (plan Spark).
     - Authentication > Sign-in method > habilita Correo electrónico/contraseña.
     - Firestore Database > Crear base de datos (modo producción, región southamerica-east1 o us-east1).
     - Configuración del proyecto > Tus apps > Agregar app web > copia firebaseConfig.
  2. Completa clientes/${nombre}/.env (todas las variables son obligatorias).
  3. Configuración del proyecto > Cuentas de servicio > Generar nueva clave privada
     → guárdala como clientes/${nombre}/serviceAccount.json
  4. npm run cliente -- estado ${nombre}
  5. npm run cliente -- reglas ${nombre}
  6. npm run cliente -- admin ${nombre} --email ... --password ... --nombre "..." --categorias
  7. npm run cliente -- apk ${nombre}
`);
      return;
    }

    case 'estado': {
      const id = verificar(nombre);
      const { db } = conectar(nombre);
      console.log(`\n✔ "${nombre}" → proyecto ${id}`);
      for (const c of ['perfiles', 'categorias', 'productos', 'materiales', 'ventas', 'pedidos']) console.log(`  ${c.padEnd(12)} ${await contar(db, c)}`);
      console.log('');
      process.exit(0);
    }

    case 'reglas': {
      const id = verificar(nombre, { exigirClave: false });
      ejecutar(`firebase deploy --only firestore --project ${id} --non-interactive`);
      console.log(`\n✔ Reglas e índices desplegados en ${id}\n`);
      return;
    }

    case 'admin': {
      const id = verificar(nombre);
      const email = a.valor('email')?.trim().toLowerCase();
      const password = a.valor('password');
      const nombreAdmin = a.valor('nombre')?.trim();
      if (!email || !nombreAdmin || !password || password.length < 6) {
        console.error('\n✘ Usa: npm run cliente -- admin <cliente> --email correo --password clave(6+) --nombre "Nombre"\n');
        process.exit(1);
      }
      const { db, auth } = conectar(nombre);
      await confirmarProyecto(id, `crear el administrador ${email}`);
      let uid: string;
      try {
        uid = (await auth.getUserByEmail(email)).uid;
        await auth.updateUser(uid, { password, displayName: nombreAdmin });
        console.log(`  El usuario ya existía: se actualizó su contraseña.`);
      } catch {
        uid = (await auth.createUser({ email, password, displayName: nombreAdmin })).uid;
        console.log(`  Usuario ${email} creado.`);
      }
      await db.collection('perfiles').doc(uid).set({ nombre: nombreAdmin, email, rol: 'admin', activo: true, creadoEn: Timestamp.now() }, { merge: true });
      console.log(`  ✔ ${nombreAdmin} es administrador de ${id}.`);
      if (a.tiene('categorias')) {
        if ((await contar(db, 'categorias')) > 0) console.log('  Ya hay categorías: no se cargan las sugeridas.');
        else {
          const lote = db.batch();
          CATEGORIAS_SUGERIDAS.forEach((c, i) => lote.set(db.collection('categorias').doc(), { nombre: c.nombre, icono: c.icono, orden: i + 1 }));
          await lote.commit();
          console.log(`  ✔ ${CATEGORIAS_SUGERIDAS.length} categorías sugeridas cargadas.`);
        }
      }
      console.log('\n  Entrégale al cliente su correo y contraseña; podrá cambiarla en Mi perfil.\n');
      process.exit(0);
    }

    case 'apk': {
      const id = verificar(nombre);
      console.log(`\nGenerando el APK de "${nombre}" (proyecto ${id}).`);
      console.log('Las variables del cliente se cargan en el entorno "production" de EAS justo antes del build.');
      console.log('No generes el APK de otro cliente hasta que este termine.\n');
      ejecutar(`npx eas-cli@latest env:push --environment production --path "${resolve(carpeta, '.env')}" --force`);
      ejecutar('npx eas-cli@latest build -p android --profile production --non-interactive');
      console.log(`\n✔ APK de "${nombre}" listo. Descárgalo desde el enlace de arriba (o en expo.dev > Builds).\n`);
      return;
    }

    default:
      console.error(`\n✘ Acción desconocida "${accion}". Usa: lista, nuevo, estado, reglas, admin, apk\n`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
