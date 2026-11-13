# MelaStock

App Android para talleres y tiendas de muebles de melamina en Perú: catálogo, ventas con boleta por WhatsApp, inventario de productos y materiales, pedidos y reportes.

Desarrollada por **GAMA Studio**.

## Stack

- React Native + Expo SDK 58 + TypeScript
- Expo Router (5 pestañas: Inicio, Catálogo, Inventario, Pedidos, Reportes)
- Supabase (Postgres, Auth, Storage, Realtime)
- Zustand (carrito)
- react-native-gifted-charts (gráficos)
- EAS Build (APK)

## 1. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Abre **SQL Editor** y ejecuta, en este orden:
   - `supabase/schema.sql` (tablas, funciones, RLS, realtime y bucket de fotos)
   - `supabase/seed.sql` (categorías, productos y materiales de ejemplo; opcional)
3. Crea los usuarios en **Authentication > Users > Add user** (email + contraseña, marca "Auto Confirm User").
   En *User Metadata* puedes poner el nombre que verá el saludo: `{"full_name": "Carlos"}`.
4. Para convertir un usuario en administrador, ejecuta en SQL Editor:

   ```sql
   update public.profiles set role = 'admin' where id = '<uuid del usuario>';
   ```

   Los usuarios nuevos son `vendedor` por defecto.

| Rol | Permisos |
| --- | --- |
| vendedor | Registrar ventas, cambiar estado de pedidos, ver inventario y registrar movimientos de materiales |
| admin | Todo lo anterior + crear/editar/eliminar productos y materiales, cancelar ventas (devuelve stock) |

## 2. Variables de entorno

```bash
cp .env.example .env
```

Completa `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Dashboard > Project Settings > API).
Opcionalmente `EXPO_PUBLIC_BUSINESS_NAME`, `EXPO_PUBLIC_BUSINESS_PHONE` y `EXPO_PUBLIC_BUSINESS_ADDRESS` para la cabecera de la boleta de WhatsApp.

## 3. Ejecutar en desarrollo

```bash
npm install
npx expo start
```

La app usa módulos nativos (image picker, date picker, svg), así que necesita un **development build** en lugar de Expo Go:

```bash
npx eas-cli@latest build -p android --profile development
```

Instala el APK resultante en el teléfono y luego `npx expo start` para conectarte.

## 4. Generar el APK

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

El perfil `preview` de `eas.json` genera un `.apk` instalable directamente (no `.aab`). Agrega las variables de entorno al proyecto EAS antes de compilar:

```bash
npx eas-cli@latest env:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value https://xxx.supabase.co --environment preview
npx eas-cli@latest env:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value eyJ... --environment preview
```

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm start` | Servidor de desarrollo |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build:apk` | `eas build -p android --profile preview` |

## Estructura

```
src/
  app/                 Rutas (Expo Router)
    _layout.tsx        Proveedores + guardas de autenticación
    login.tsx
    (tabs)/            Inicio, Catálogo, Inventario, Pedidos, Reportes
    venta/nueva.tsx    Carrito y cobro
    venta/exito.tsx    "¡Venta registrada!" + boleta por WhatsApp
    venta/[id].tsx     Detalle de venta / pedido
    ventas.tsx         Historial de ventas
    producto/[id].tsx  Detalle (vendedor) / editor (admin). id = "nuevo" para crear
    material/[id].tsx  Stock, movimientos y editor de material
    perfil.tsx
  components/          UI base, tarjetas, toast, selector de fecha
  hooks/               useAuth, useQuery (foco + realtime)
  lib/                 supabase, formato (S/, fechas Lima), boleta WhatsApp, storage
  store/cart.ts        Carrito (Zustand)
  types/db.ts          Tipos de la base de datos
supabase/
  schema.sql           Esquema completo
  seed.sql             Datos de ejemplo
```

## Notas de diseño

- **Boleta correlativa y stock**: la venta se registra con la función SQL `create_sale`, que en una sola transacción genera el número `B001-00000001`, valida y descuenta el stock e inserta los ítems. La serie se puede cambiar en la tabla `receipt_counter`.
- **Pedidos**: toda venta con fecha de entrega nace como pedido `pendiente` y avanza por `en_produccion` → `listo` → `entregado`. Una venta sin fecha de entrega se registra directamente como `entregado`.
- **Zona horaria**: todos los cálculos de "hoy" y "este mes" usan America/Lima (UTC-5, sin horario de verano).
- **Tiempo real**: el panel de inicio, pedidos y reportes se actualizan al instante con Supabase Realtime sobre `sales` y `products`.
