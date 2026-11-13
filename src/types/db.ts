/* ------------------------------------------------------------------ */
/* Firebase (nuevo backend)                                            */
/* ------------------------------------------------------------------ */

export type Rol = 'admin' | 'vendedor';

/** Documento de la colección "perfiles" (id = uid de Firebase Auth) */
export type Perfil = {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  creadoEn: Date | null;
};

/** Documento de la colección "categorias" */
export type Categoria = {
  id: string;
  nombre: string;
  icono: string; // nombre de Ionicons
  orden: number;
};

/** Documento de la colección "productos" */
export type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoriaId: string | null;
  categoriaNombre: string | null; // desnormalizado
  precio: number;
  costo: number | null;
  stock: number;
  stockMinimo: number;
  fotoUrl: string | null;
  activo: boolean;
  creadoEn: Date | null;
  actualizadoEn: Date | null;
};

/** Íconos disponibles para categorías (Ionicons) */
export const CATEGORIA_ICONOS = [
  'shirt-outline',
  'albums-outline',
  'restaurant-outline',
  'desktop-outline',
  'bed-outline',
  'library-outline',
  'moon-outline',
  'tv-outline',
  'file-tray-stacked-outline',
  'home-outline',
  'grid-outline',
  'cube-outline',
] as const;

/** Categorías sugeridas para un catálogo vacío */
export const CATEGORIAS_SUGERIDAS: { nombre: string; icono: string }[] = [
  { nombre: 'Roperos', icono: 'shirt-outline' },
  { nombre: 'Cómodas', icono: 'albums-outline' },
  { nombre: 'Cocinas', icono: 'restaurant-outline' },
  { nombre: 'Escritorios', icono: 'desktop-outline' },
  { nombre: 'Camas', icono: 'bed-outline' },
  { nombre: 'Estantes', icono: 'library-outline' },
  { nombre: 'Veladores', icono: 'moon-outline' },
  { nombre: 'Centros de TV', icono: 'tv-outline' },
  { nombre: 'Otros', icono: 'cube-outline' },
];

/** Documento de la colección "clientes" */
export type Cliente = {
  id: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  ultimaCompraEn: Date | null;
};

export type EstadoEntrega = 'pendiente' | 'en_produccion' | 'listo' | 'entregado' | 'cancelado';
export type MetodoPago = 'Yape' | 'Plin' | 'Efectivo' | 'Tarjeta';

/** Ítem embebido en la venta (montos en soles para la UI) */
export type VentaItem = {
  productoId: string;
  nombre: string;
  cantidad: number;
  precio: number;
  costo: number;
  total: number;
};

/**
 * Documento de la colección "ventas" ya convertido para la UI.
 * En Firestore los montos se guardan en céntimos enteros (sufijo Cent)
 * para que las reglas puedan validar sumas exactas.
 */
export type Venta = {
  id: string;
  numeroBoleta: number;
  codigoBoleta: string;
  clienteId: string | null;
  clienteNombre: string;
  clienteTelefono: string | null;
  vendedorId: string;
  vendedorNombre: string;
  items: VentaItem[];
  metodoPago: MetodoPago;
  subtotal: number;
  descuento: number;
  deliveryCosto: number;
  deliveryDireccion: string | null;
  total: number;
  costoTotal: number;
  unidades: number;
  fechaEntrega: string | null; // YYYY-MM-DD
  estadoEntrega: EstadoEntrega;
  notas: string | null;
  fecha: Date | null;
  dia: string; // YYYY-MM-DD (Lima)
  canceladaEn: Date | null;
  canceladaPorNombre: string | null;
};

/** Etapas del taller para pedidos a medida */
export type EtapaPedido = 'cotizado' | 'corte' | 'enchapado' | 'armado' | 'entrega' | 'entregado' | 'cancelado';

/** Flujo normal (la barra de progreso). "entrega" = terminado, listo para entregar. */
export const ETAPAS_FLUJO: EtapaPedido[] = ['cotizado', 'corte', 'enchapado', 'armado', 'entrega', 'entregado'];

export const ETAPA_LABEL: Record<EtapaPedido, string> = {
  cotizado: 'Cotizado',
  corte: 'Corte',
  enchapado: 'Enchapado',
  armado: 'Armado',
  entrega: 'Listo para entrega',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

export type PagoPedido = {
  monto: number;
  metodo: MetodoPago;
  fecha: Date | null;
  dia: string;
  usuarioId: string;
  usuarioNombre: string;
  nota: string | null;
};

export type HistorialEtapa = {
  etapa: EtapaPedido;
  fecha: Date | null;
  usuarioId: string;
  usuarioNombre: string;
  nota: string | null;
};

/** Documento de la colección "pedidos" (pedidos a medida), montos en soles para la UI */
export type Pedido = {
  id: string;
  numero: number;
  codigo: string; // P-0001
  clienteId: string | null;
  clienteNombre: string;
  clienteTelefono: string | null;
  descripcion: string;
  medidas: string | null;
  materialColor: string | null;
  notas: string | null;
  precio: number;
  pagado: number;
  saldo: number;
  costoMateriales: number;
  etapa: EtapaPedido;
  historialEtapas: HistorialEtapa[];
  pagos: PagoPedido[];
  fechaEntrega: string | null; // YYYY-MM-DD
  vendedorId: string;
  vendedorNombre: string;
  creadoEn: Date | null;
  actualizadoEn: Date | null;
};

/** Tipos de material del taller */
export type TipoMaterial = 'plancha' | 'tapacanto' | 'bisagra' | 'corredera' | 'tornilleria' | 'otro';

export const TIPOS_MATERIAL: { value: TipoMaterial; label: string; icon: string }[] = [
  { value: 'plancha', label: 'Planchas', icon: 'layers-outline' },
  { value: 'tapacanto', label: 'Tapacanto', icon: 'remove-outline' },
  { value: 'bisagra', label: 'Bisagras', icon: 'git-compare-outline' },
  { value: 'corredera', label: 'Correderas', icon: 'swap-horizontal-outline' },
  { value: 'tornilleria', label: 'Tornillería', icon: 'settings-outline' },
  { value: 'otro', label: 'Otros', icon: 'ellipsis-horizontal-outline' },
];

export const UNIDADES_MATERIAL = ['und', 'plancha', 'metro', 'caja', 'par', 'kg', 'rollo'];

/** Documento de la colección "materiales" */
export type Material = {
  id: string;
  nombre: string;
  tipo: TipoMaterial;
  color: string | null;
  espesorMm: number | null;
  unidad: string;
  stock: number;
  stockMinimo: number;
  ultimoCosto: number | null;
  proveedorId: string | null;
  proveedorNombre: string | null; // desnormalizado
  actualizadoEn: Date | null;
};

/** Documento de la colección "proveedores" */
export type Proveedor = {
  id: string;
  nombre: string;
  telefono: string | null;
  contacto: string | null;
  direccion: string | null;
  notas: string | null;
};

export type TipoMovimiento = 'entrada' | 'salida' | 'ajuste';
export type ItemTipo = 'producto' | 'material';

/** Documento de la colección "movimientos" (kardex). Inmutable. */
export type Movimiento = {
  id: string;
  tipo: TipoMovimiento;
  itemTipo: ItemTipo;
  itemId: string;
  itemNombre: string;
  /** entrada/salida: cantidad positiva; ajuste: diferencia (stockNuevo - stockAnterior) */
  cantidad: number;
  costoUnitario: number | null;
  stockAnterior: number;
  stockNuevo: number;
  ventaId: string | null;
  proveedorId: string | null;
  proveedorNombre: string | null;
  nota: string | null;
  usuarioId: string;
  usuarioNombre: string;
  fecha: Date | null;
};

/* ------------------------------------------------------------------ */
/* Supabase (en migración; se eliminará en la fase 7)                  */
/* ------------------------------------------------------------------ */

export type Category = {
  id: number;
  name: string;
  icon: string;
  sort_order: number;
};

export type Product = {
  id: string;
  name: string;
  description: string | null;
  category_id: number | null;
  price: number;
  cost: number | null;
  stock: number;
  min_stock: number;
  image_url: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  categories?: Pick<Category, 'id' | 'name' | 'icon'> | null;
};

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  created_at: string;
};

export type SaleStatus = 'pendiente' | 'en_produccion' | 'listo' | 'entregado' | 'cancelado';

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  pendiente: 'Pendiente',
  en_produccion: 'En producción',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

export const ACTIVE_STATUSES: SaleStatus[] = ['pendiente', 'en_produccion', 'listo'];

/** Siguiente estado en el flujo de un pedido */
export const NEXT_STATUS: Partial<Record<SaleStatus, SaleStatus>> = {
  pendiente: 'en_produccion',
  en_produccion: 'listo',
  listo: 'entregado',
};

export type PaymentMethod = 'Yape' | 'Plin' | 'Efectivo' | 'Tarjeta';
export const PAYMENT_METHODS: PaymentMethod[] = ['Yape', 'Plin', 'Efectivo', 'Tarjeta'];

export type Sale = {
  id: string;
  receipt_number: number;
  receipt_code: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  seller_id: string | null;
  seller_name: string | null;
  status: SaleStatus;
  payment_method: PaymentMethod;
  subtotal: number;
  discount: number;
  delivery_cost: number;
  delivery_address: string | null;
  total: number;
  delivery_date: string | null; // YYYY-MM-DD
  notes: string | null;
  created_at: string;
  updated_at: string;
  sale_items?: SaleItem[];
};

export type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
};
