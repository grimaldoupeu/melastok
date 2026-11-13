# MelaStock — guía para Claude Code

App Android (Expo SDK 58 + TypeScript + Expo Router) para un taller/tienda de muebles de melamina en Perú. Desarrollada por GAMA Studio. Idioma: español. Moneda: soles (S/). Zona horaria: America/Lima (UTC-5, sin horario de verano; ver `src/lib/format.ts`).

Lee también `AGENTS.md` (convenciones de Expo) y `README.md` (modelo de datos, scripts y despliegue). Antes de dar una tarea por terminada: `npm run typecheck` y `npm run lint`; si tocaste reglas o transacciones, también `npm run test:reglas`.

## Backend

- Firebase Auth (correo y contraseña) + Cloud Firestore. Proyecto: `melastock-e890d` (`.firebaserc`).
- Fotos de productos en Cloudinary (upload preset sin firma); la URL se guarda en `productos.fotoUrl`.
- Variables en `.env` con prefijo `EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_CLOUDINARY_*`, `EXPO_PUBLIC_BUSINESS_*` (ver `.env.example`).
- `src/lib/firebase.native.ts` (Android/iOS, sesión en AsyncStorage) y `src/lib/firebase.ts` (web); lo común en `firebase-core.ts`. Importa siempre desde `@/lib/firebase`.

## Convenciones del proyecto

- Rutas en `src/app/` (Expo Router). `Tabs` se importa de `expo-router/js-tabs`; `Stack`, `Link`, `useRouter` de `expo-router`. Al agregar una ruta, regístrala en `src/app/_layout.tsx`; los tipos de rutas se regeneran al correr `expo start`.
- **Las pantallas no llaman a Firestore directamente**: todo pasa por `src/services/*.ts`.
- Tiempo real con `src/hooks/use-realtime.ts` (onSnapshot a través de un servicio); cargas puntuales con `src/hooks/use-async.ts`.
- Componentes base en `src/components/ui.tsx`; tema en `src/constants/theme.ts`.
- Estado global solo para el carrito (`src/store/cart.ts`, Zustand).
- Textos de UI en español; montos con `soles()`; fechas con los helpers de `src/lib/format.ts` (nunca `toLocaleString`).
- React Compiler está activo: no escribir refs durante el render ni llamar `setState` de forma síncrona dentro de `useEffect` (el lint lo bloquea). Para inicializar formularios desde datos cargados, usa un subcomponente con `key`; para valores iniciales con `Date.now()`, usa el inicializador diferido de `useState`.
- Roles: `admin` y `vendedor`. Un perfil creado por el propio usuario nace inactivo y queda pendiente hasta que el admin lo aprueba.

## Reglas de Firestore y transacciones

- Cualquier cambio en `firestore.rules` se prueba con `npm run test:reglas` (emulador; necesita Java 11+ en el PATH, por ejemplo el JDK de Android Studio en `C:\Program Files\Android\Android Studio\jbr\bin`) y se despliega con `npm run deploy:reglas`.
- Las transacciones críticas viven en archivos `*-core.ts` sin dependencias de React Native (`ventas-core.ts`, `inventario-core.ts`, `pedidos-core.ts`) para poder probarlas en el emulador con `scripts/test-reglas.ts`. Agrega ahí los casos nuevos (permitidos y bloqueados).
- Las reglas encadenan las escrituras de una misma transacción con `getAfter()`/`existsAfter()`. Firestore permite 20 lecturas de documentos por transacción en las reglas, por eso una venta admite como máximo `MAX_ITEMS_VENTA` (5) productos distintos; ese número está en `ventas-core.ts` y en `firestore.rules`.
- Stock de productos y materiales: SOLO cambia junto con un movimiento nuevo del kardex en la misma transacción (el ítem guarda `ultimoMovimientoId`). Nunca escribas `stock` directamente; usa `src/services/inventario.ts` o `src/services/ventas.ts`.
- Montos de ventas, pedidos y resúmenes en Firestore: céntimos enteros (`totalCent`, `precioCent`, etc.), para que las reglas validen sumas exactas. Los servicios los convierten a soles para la UI.
- `resumen_diario/{dia}` solo cambia junto con una venta nueva, una anulación o un pago de pedido nuevo; Inicio, Reportes y el cierre de caja leen de ahí.
- Fechas dentro de arreglos (pagos, historial de etapas) usan `Timestamp.now()` porque Firestore no admite `serverTimestamp()` en arreglos; las reglas exigen ±15 min respecto al servidor.

## Scripts de administración

`scripts/seed.ts`, `reset.ts`, `backup.ts`, `restore.ts` usan `firebase-admin` con `serviceAccount.json` en la raíz (en `.gitignore`; nunca lo subas). No pasan por las reglas: los datos que escriben deben respetar el mismo modelo que las transacciones. Todos piden escribir el ID del proyecto antes de modificar datos. Con `FIRESTORE_EMULATOR_HOST` definido se conectan al emulador sin clave.

## Reglas de trabajo con el usuario

- Trabajar por fases o tareas acotadas; al terminar: typecheck, lint, checklist de pruebas, commit y esperar confirmación antes de seguir.
- Preguntar antes de asumir datos externos (credenciales, planes de pago, servicios de terceros).
