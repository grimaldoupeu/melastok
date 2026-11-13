# MelaStock — guía para Claude Code

App Android (Expo SDK 58 + TypeScript + Expo Router) para un taller/tienda de muebles de melamina en Perú. Desarrollada por GAMA Studio. Idioma: español. Moneda: soles (S/). Zona horaria: America/Lima (UTC-5, sin horario de verano; ver `src/lib/format.ts`).

Lee también `AGENTS.md` (convenciones de Expo). Antes de dar una tarea por terminada: `npm run typecheck` y `npm run lint`.

## Estado del backend

- **Actual (en migración)**: Supabase (Postgres + Auth + Storage). Esquema en `supabase/`.
- **Destino**: Firebase (Auth + Firestore) con imágenes en Firebase Storage (si hay plan Blaze) o Cloudinary. La migración se hace por fases según el documento de abajo; el acceso a datos queda centralizado en `src/services/*.ts` y las pantallas no llaman a Firestore directamente.

## Convenciones del proyecto

- Rutas en `src/app/` (Expo Router). `Tabs` se importa de `expo-router/js-tabs`; `Stack`, `Link`, `useRouter` de `expo-router`.
- Componentes base en `src/components/ui.tsx`; tema en `src/constants/theme.ts`.
- Estado global solo para el carrito (`src/store/cart.ts`, Zustand).
- Consultas con `src/hooks/use-query.ts` (recarga al enfocar + tiempo real).
- Textos de UI en español; montos con `soles()`; fechas con los helpers de `src/lib/format.ts` (nunca `toLocaleString`).
- React Compiler está activo: no escribir refs durante el render ni llamar `setState` de forma síncrona dentro de `useEffect` (el lint lo bloquea). Para inicializar formularios desde datos cargados, usa un subcomponente con `key`.
- Tiempo real con `src/hooks/use-realtime.ts` (onSnapshot a través de un servicio).

## Reglas de Firestore

- Cualquier cambio en `firestore.rules` se prueba con `npm run test:reglas` (emulador; necesita Java 11+ en el PATH, por ejemplo el JDK de Android Studio en `C:\Program Files\Android\Android Studio\jbr\bin`) y se despliega con `firebase deploy --only firestore`.
- Las transacciones críticas viven en archivos `*-core.ts` sin dependencias de React Native (por ejemplo `src/services/ventas-core.ts`) para poder probarlas en el emulador con `scripts/test-reglas.ts`.
- Las reglas encadenan las escrituras de una venta con `getAfter()`/`existsAfter()`. Firestore permite 20 lecturas de documentos por transacción en las reglas, por eso una venta admite como máximo `MAX_ITEMS_VENTA` (5) productos distintos; ese número está en `ventas-core.ts` y en `firestore.rules`.
- Stock de productos y materiales: SOLO cambia junto con un movimiento nuevo del kardex en la misma transacción (el ítem guarda ). Nunca escribas  directamente; usa  o .
- Montos de ventas y resúmenes en Firestore: céntimos enteros (`totalCent`, etc.), para que las reglas validen sumas exactas. La UI los convierte a soles en los servicios.

---

# Migración de MelaStock de Supabase a Firebase

No puedo crear más proyectos en Supabase, así que el backend pasa a Firebase. Toda la interfaz y las funciones actuales deben seguir funcionando igual.

## Stack del backend
- Firebase JS SDK (paquete "firebase") compatible con Expo, con persistencia de sesión usando AsyncStorage.
- Firebase Auth: email y contraseña.
- Cloud Firestore como base de datos.
- Fotos de productos: Firebase Storage necesita el plan Blaze. Antes de implementarlo, pregúntame si activé Blaze. Si no, usa Cloudinary (plan gratis, upload preset sin firma) solo para las imágenes y guarda la URL en Firestore.
- Variables en .env con el prefijo EXPO_PUBLIC_FIREBASE_*, con .env.example y .env en .gitignore.

## Modelo de datos (Firestore)
Propón y documenta las colecciones equivalentes a las tablas actuales:
perfiles (uid, nombre, rol: admin|vendedor), categorias, productos (precio, costo, stock, foto, categoría), materiales (tipo, unidad, stock, stock_minimo, ultimo_costo), proveedores, movimientos (kardex: entrada|salida|ajuste, material o producto, cantidad, costo, proveedor, usuario, fecha), clientes, ventas (con los ítems embebidos como array, cliente, pago, delivery, descuento, totales, numero_boleta, vendedor, fecha_entrega, estado de entrega), pedidos (pedidos a medida con etapas, historial de etapas y pagos) y contadores (correlativo de boletas).
Desnormaliza lo necesario para que las pantallas no hagan demasiadas lecturas (por ejemplo, guarda el nombre del cliente y del producto dentro de la venta).

## Lógica crítica (equivalente a la función create_sale)
- Registrar una venta con runTransaction: leer el stock de cada producto, validar que alcance, descontarlo, incrementar el contador de boletas, crear la venta y sus movimientos. Todo atómico; si algo falla, no se guarda nada.
- Registrar un ingreso de material con runTransaction: sumar el stock, actualizar ultimo_costo y crear el movimiento.
- Cancelar una venta (solo admin) con runTransaction, devolviendo el stock.
- Pagos de pedidos a medida: actualizar el saldo de forma atómica.
- Resúmenes para reportes: mantener un documento por día en "resumen_diario/{YYYY-MM-DD}" (total vendido, número de ventas, totales por método de pago, costo total) que se actualice dentro de la misma transacción de la venta, para que Inicio y Reportes no tengan que leer todas las ventas. Zona horaria America/Lima.

## Seguridad
- firestore.rules completas: solo usuarios autenticados; el vendedor puede leer el catálogo, crear ventas, clientes y pedidos; solo el admin puede crear, editar o borrar productos, materiales, proveedores y usuarios, cancelar ventas y hacer ajustes de stock. Nadie puede modificar el stock ni el contador fuera de una operación válida (valida los campos en las reglas en lo posible).
- firestore.indexes.json con los índices compuestos que necesiten las consultas.
- Instrucciones para desplegar reglas e índices con Firebase CLI (firebase deploy --only firestore).

## Tiempo real
Usa onSnapshot donde ahora se usa realtime de Supabase (panel de Inicio, alertas de stock, pedidos).

## Datos de prueba
Un script (scripts/seed.ts, ejecutable con npx tsx) que cargue categorías, productos, materiales, proveedores, clientes, ventas de los últimos 30 días con sus resúmenes diarios y algunos pedidos a medida en distintas etapas. Explícame cómo crear el primer usuario admin.

## Limpieza
- Eliminar @supabase/supabase-js, la carpeta supabase/ y cualquier referencia a Supabase.
- Centralizar el acceso a datos en una capa de servicios (src/services/*.ts) para que las pantallas no llamen a Firestore directamente.
- Actualizar README.md y CLAUDE.md con el nuevo backend.

## Fases (trabaja UNA a la vez)
- FASE 0: Plan. Modelo de datos, reglas, lista de archivos a cambiar. Espera mi aprobación.
- FASE 1: Configuración de Firebase, Auth, perfiles y roles.
- FASE 2: Catálogo, productos y categorías (con imágenes).
- FASE 3: Ventas (transacción, boleta, WhatsApp, historial, entregas, cancelación).
- FASE 4: Inventario, materiales, proveedores, ingresos y kardex.
- FASE 5: Pedidos a medida (etapas, pagos, saldo).
- FASE 6: Inicio y Reportes con los resúmenes diarios.
- FASE 7: Reglas, índices, script de datos de prueba, limpieza de Supabase y documentación.

## Reglas de trabajo
- Al terminar cada fase: corre typecheck y lint, dame un checklist de pruebas, haz un commit "Firebase fase N: ..." y DETENTE hasta que yo escriba "siguiente fase".
- Si necesitas algo de mí (firebaseConfig, Blaze o Cloudinary), pregúntame antes de asumir.
- Agrega este documento al CLAUDE.md.
