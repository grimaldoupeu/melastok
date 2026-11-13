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

export type MaterialType = 'plancha' | 'tapacanto' | 'bisagra' | 'corredera' | 'tornilleria' | 'otro';

export const MATERIAL_TYPES: { value: MaterialType; label: string; icon: string }[] = [
  { value: 'plancha', label: 'Planchas', icon: 'layers-outline' },
  { value: 'tapacanto', label: 'Tapacanto', icon: 'remove-outline' },
  { value: 'bisagra', label: 'Bisagras', icon: 'git-compare-outline' },
  { value: 'corredera', label: 'Correderas', icon: 'swap-horizontal-outline' },
  { value: 'tornilleria', label: 'Tornillería', icon: 'settings-outline' },
  { value: 'otro', label: 'Otros', icon: 'ellipsis-horizontal-outline' },
];

export const MATERIAL_UNITS = ['und', 'plancha', 'metro', 'caja', 'par', 'kg', 'rollo'];

export type Material = {
  id: string;
  name: string;
  type: MaterialType;
  color: string | null;
  thickness_mm: number | null;
  unit: string;
  stock: number;
  min_stock: number;
  unit_cost: number | null;
  supplier: string | null;
  created_at: string;
  updated_at: string;
};

export type MovementType = 'entrada' | 'salida' | 'ajuste';

export type MaterialMovement = {
  id: string;
  material_id: string;
  type: MovementType;
  quantity: number;
  note: string | null;
  user_id: string | null;
  created_at: string;
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
