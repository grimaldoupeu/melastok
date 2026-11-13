# MelaStock

App Android para talleres y tiendas de muebles de melamina en Perú: catálogo, ventas con boleta por WhatsApp, inventario de productos y materiales con kardex, pedidos a medida, reportes y cierre de caja.

Desarrollada por **GAMA Studio**.

- [Guía para el dueño de la tienda](#guía-para-el-dueño-de-la-tienda)
- [Guía técnica](#guía-técnica)

---

# Guía para el dueño de la tienda

## Usuarios y permisos

Hay dos tipos de usuario:

| Puede… | Vendedor | Administrador |
| --- | :---: | :---: |
| Vender, enviar boletas por WhatsApp | ✅ | ✅ |
| Registrar pedidos a medida, cobrar pagos, avanzar etapas | ✅ | ✅ |
| Registrar ingresos y consumos de material | ✅ | ✅ |
| Ver su propio cierre de caja | ✅ | ✅ |
| Crear y editar productos, categorías, materiales y proveedores | | ✅ |
| Ajustar stock (con motivo, queda en el kardex) | | ✅ |
| Anular ventas, cancelar pedidos, cambiar el precio de un pedido | | ✅ |
| Ver costos, ganancia de pedidos y el cierre de caja de todos | | ✅ |
| Crear, aprobar y desactivar usuarios | | ✅ |

### Crear un vendedor

1. Entra con tu cuenta de administrador.
2. Toca tu foto (arriba a la derecha en **Inicio**) → **Gestionar usuarios** → botón **+**.
3. Escribe nombre, correo y una contraseña de al menos 6 caracteres, elige **Vendedor** y toca **Crear usuario**.
4. Pásale el correo y la contraseña al vendedor. Podrá cambiar su contraseña desde **Mi perfil**.

### Aprobar usuarios pendientes

Si alguien inicia sesión con una cuenta que no creaste tú, verá el mensaje *"Tu cuenta está pendiente de aprobación"* y no podrá usar nada.

1. Ve a **Gestionar usuarios**. Los pendientes aparecen arriba, en amarillo.
2. Toca **Aprobar** si lo conoces. Su app se desbloquea sola en ese momento.
3. Para quitarle el acceso a alguien (por ejemplo, un vendedor que ya no trabaja contigo), toca **Desactivar**. Se le cierra la sesión al instante.

## El día a día

- **Vender**: Catálogo → toca **+** en cada producto → **Ver carrito** → completa cliente y pago → **Cobrar**. Al terminar, **Enviar boleta por WhatsApp**. Una boleta admite hasta 5 productos distintos (la cantidad de cada uno es libre).
- **Pedidos a medida**: Pedidos → **A medida** → **+**. Registra descripción, medidas, precio, fecha de entrega y el adelanto. Desde el pedido avanzas las etapas (Corte, Enchapado, Armado, Listo para entrega, Entregado), registras pagos y envías el estado y el saldo al cliente por WhatsApp. Los pedidos atrasados se ven en rojo.
- **Materiales**: Inventario → Materiales → elige el material → **Ingreso** (compras, con costo y proveedor) o **Consumo** (lo que se usa en el taller). En el consumo puedes elegir el pedido a medida en que se usó: así el administrador ve cuánto costaron sus materiales y la ganancia estimada.
- **Stock bajo**: Inicio e Inventario avisan cuando un producto o material llega a su stock mínimo.

## Cierre de caja

1. **Inicio** → **Cierre de caja** (o toca "Ventas de hoy").
2. Verás el **total en caja** y lo que corresponde a **Efectivo, Yape, Plin y Tarjeta**, sumando ventas del catálogo y pagos de pedidos a medida, más el detalle de cada operación. Las ventas anuladas aparecen tachadas y no suman.
3. Para revisar otro día, usa las flechas o toca la fecha.
4. Como administrador puedes filtrar por vendedor. Cada vendedor ve solo lo que registró él.
5. **Compartir cierre por WhatsApp** envía el resumen del día (por ejemplo, a tu propio número o al grupo del negocio).

Compara el total de **Efectivo** con el dinero físico en caja, y los de Yape/Plin/Tarjeta con tus aplicaciones y el POS.

## Reportes

Reportes → elige **Día**, **Semana** o **Mes** y muévete con las flechas. Verás ingresos con su variación frente al periodo anterior, gráfico por día, métodos de pago, productos más vendidos, ventas por vendedor, margen y ticket promedio. El administrador ve además la ganancia estimada de los pedidos a medida entregados.

---

# Guía técnica

## Stack

- React Native + Expo SDK 58 + TypeScript, Expo Router (pestañas Inicio, Catálogo, Inventario, Pedidos, Reportes)
- Firebase: Authentication (correo y contraseña) y Cloud Firestore
- Cloudinary (plan gratis, upload preset sin firma) para fotos de productos
- Zustand (carrito), react-native-gifted-charts (gráficos)
- EAS Build para el APK

## Configuración inicial

1. **Firebase** ([console.firebase.google.com](https://console.firebase.google.com), plan gratuito Spark):
   - *Authentication > Sign-in method*: habilita **Correo electrónico/contraseña**.
   - *Firestore Database*: crea la base en modo producción.
   - *Configuración del proyecto > Tus apps > App web*: copia `firebaseConfig`.
2. **Cloudinary**: crea un *upload preset* **sin firma** (unsigned) con carpeta `melastock/productos`.
3. Copia `.env.example` a `.env` y completa `EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_CLOUDINARY_*` y los datos del negocio para la boleta.
4. `npm install`

## Reglas e índices de Firestore

Las reglas (`firestore.rules`) validan cada operación: el stock solo cambia junto con un movimiento del kardex, el correlativo de boletas y pedidos solo sube junto con su documento, y el resumen diario solo cambia con una venta, anulación o pago nuevo (comprobado con `getAfter()`/`existsAfter()` en la misma transacción).

```bash
npm i -g firebase-tools
firebase login
npm run deploy:reglas          # = firebase deploy --only firestore (reglas + índices)
npm run test:reglas            # 71 pruebas en el emulador
```

`npm run test:reglas` necesita Java 11+ en el PATH. En Windows sirve el JDK de Android Studio:

```bash
export PATH="/c/Program Files/Android/Android Studio/jbr/bin:$PATH"   # Git Bash
```

Prueba siempre las reglas antes de desplegarlas.

## Cuenta de servicio (para los scripts)

Los scripts de `scripts/` usan `firebase-admin`, que necesita una clave privada:

1. Firebase Console → ⚙ **Configuración del proyecto** → pestaña **Cuentas de servicio**.
2. Con *Node.js* seleccionado, toca **Generar nueva clave privada** → **Generar clave**.
3. Se descarga un `.json`. Renómbralo a `serviceAccount.json` y muévelo a la **raíz del proyecto** (junto a `package.json`).

`serviceAccount.json` está en `.gitignore`. **Nunca lo subas a GitHub ni lo compartas**: da acceso total a la base de datos sin pasar por las reglas. Si se filtra, bórralo en *Google Cloud Console > IAM > Cuentas de servicio > Claves* y genera otro.

## Scripts de administración

Todos piden escribir el ID del proyecto antes de modificar datos.

| Comando | Qué hace |
| --- | --- |
| `npm run seed` | Carga datos de demostración: catálogo, materiales, proveedores, clientes, 30 días de ventas con kardex y resúmenes, y pedidos a medida en todas las etapas. Requiere la base vacía. |
| `npm run seed -- --admin-email correo --admin-password clave --admin-nombre "Nombre"` | Igual, y además crea (o promueve) ese usuario como **administrador**. |
| `npm run reset` | Borra ventas, pedidos, kardex, resúmenes y clientes, y reinicia los correlativos (próxima boleta `B001-00000001`, próximo pedido `P-0001`). Pregunta si borrar también el catálogo. Los usuarios no se tocan. |
| `npm run reset -- --todo` | Lo anterior y además productos, categorías, materiales y proveedores. |
| `npm run reset -- --conservar-catalogo` | Solo operación; el stock actual queda como "Stock inicial" en el kardex nuevo. |
| `npm run backup` | Guarda todas las colecciones en `backups/melastock-AAAA-MM-DD.json`. |
| `npm run restore` | Restaura el respaldo más reciente (o `npm run restore -- backups/archivo.json`). Reemplaza el contenido de las colecciones; con `--combinar` solo sobrescribe los documentos del respaldo. |

**Antes de entregar la app al cliente:** `npm run backup` → `npm run reset` (elige si conservar el catálogo) → crea su usuario administrador.

**Primer administrador** (si no usas `--admin-email`): créalo en *Authentication > Users > Add user* y en *Firestore* crea `perfiles/{uid}` con `nombre` (texto), `email` (texto), `rol` = `"admin"` y `activo` = `true`.

## Respaldos

- Haz `npm run backup` al menos una vez por semana y antes de cualquier `reset` o `restore`.
- La carpeta `backups/` está en `.gitignore` porque contiene datos de clientes. Copia los archivos a un lugar seguro (Drive, USB).
- Los respaldos incluyen los perfiles pero **no** las cuentas de acceso (correo y contraseña de Authentication).

## Desarrollo

```bash
npx eas-cli@latest build -p android --profile development   # una vez, o al agregar módulos nativos
npm run dev                                                  # expo start --dev-client
npm run typecheck && npm run lint
```

## APK para producción

```bash
npx eas-cli@latest build -p android --profile preview
```

Antes, carga las variables `EXPO_PUBLIC_*` en EAS (*expo.dev > proyecto > Environment variables*) o con `eas env:create`.

## Estructura

```
src/
  app/            Pantallas (Expo Router): (tabs)/, venta/, pedido/, producto/, material/,
                  proveedor/, caja, kardex, categorias, usuarios, perfil, login, pendiente
  components/     UI base, tarjetas, modales
  services/       Acceso a datos (las pantallas no llaman a Firestore directamente)
    *-core.ts     Transacciones sin dependencias de React Native (probadas en el emulador)
  hooks/          useAuth, useRealtime (onSnapshot), useAsync
  lib/            firebase (core / web / nativo), formato S/ y fechas de Lima, boleta WhatsApp
  types/db.ts     Modelo de datos
scripts/          seed, reset, backup, restore, test-reglas
firestore.rules   Reglas de seguridad
firestore.indexes.json
```

## Modelo de datos (Firestore)

Montos de ventas, pedidos y resúmenes en **céntimos enteros**. Fechas en hora de Lima (`dia` = `YYYY-MM-DD`).

| Colección | Contenido |
| --- | --- |
| `perfiles/{uid}` | nombre, email, rol (`admin`/`vendedor`), activo |
| `categorias` | nombre, icono, orden |
| `productos` | precio, costo, stock, stockMinimo, fotoUrl, categoría (nombre desnormalizado), ultimoMovimientoId |
| `materiales` | tipo, color, espesor, unidad, stock, stockMinimo, ultimoCosto, proveedor |
| `proveedores` | nombre, teléfono, contacto, dirección, notas |
| `movimientos` | kardex: entrada/salida/ajuste de producto o material, stock anterior y nuevo, usuario, venta o pedido relacionado |
| `clientes` | nombre, teléfono (id `tel-<9 dígitos>`), dirección |
| `ventas` | boleta, cliente, vendedor, ítems embebidos, pago, delivery, descuento, totales, entrega |
| `pedidos` | pedidos a medida: etapa, historial de etapas, pagos, saldo, costo de materiales, diasPago |
| `contadores/boletas`, `contadores/pedidos` | correlativos |
| `resumen_diario/{dia}` | ventas, costo, unidades y pagos de pedidos del día, con desglose por método |
