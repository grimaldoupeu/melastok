-- =====================================================================
--  MelaStock · Esquema de base de datos (Supabase / Postgres)
--  GAMA Studio
--
--  Ejecutar completo en: Supabase Dashboard > SQL Editor > New query
--  Luego ejecutar seed.sql para cargar datos de ejemplo.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. PERFILES Y ROLES
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default 'Usuario',
  role        text not null default 'vendedor' check (role in ('admin', 'vendedor')),
  phone       text,
  created_at  timestamptz not null default now()
);

-- Crea el perfil automáticamente cuando se registra un usuario en Auth.
-- El nombre se toma de user_metadata.full_name (se puede poner al crear el
-- usuario desde el Dashboard: "User Metadata" -> {"full_name": "Carlos"}).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'vendedor')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper: ¿el usuario actual es admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- 2. CATÁLOGO
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id          serial primary key,
  name        text not null unique,
  icon        text not null default 'cube-outline',   -- nombre de Ionicons
  sort_order  int  not null default 0
);

create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  category_id  int references public.categories (id) on delete set null,
  price        numeric(10,2) not null check (price >= 0),
  cost         numeric(10,2) check (cost >= 0),
  stock        int not null default 0 check (stock >= 0),
  min_stock    int not null default 1 check (min_stock >= 0),
  image_url    text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists products_category_idx on public.products (category_id);

-- ---------------------------------------------------------------------
-- 3. MATERIALES (planchas, tapacanto, bisagras, correderas, tornillería)
-- ---------------------------------------------------------------------
create table if not exists public.materials (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  type          text not null default 'otro'
                check (type in ('plancha','tapacanto','bisagra','corredera','tornilleria','otro')),
  color         text,
  thickness_mm  numeric(5,1),
  unit          text not null default 'und',          -- und, plancha, metro, caja, par
  stock         numeric(12,2) not null default 0 check (stock >= 0),
  min_stock     numeric(12,2) not null default 0 check (min_stock >= 0),
  unit_cost     numeric(10,2),
  supplier      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.material_movements (
  id           uuid primary key default gen_random_uuid(),
  material_id  uuid not null references public.materials (id) on delete cascade,
  type         text not null check (type in ('entrada','salida','ajuste')),
  quantity     numeric(12,2) not null,
  note         text,
  user_id      uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);
create index if not exists material_movements_material_idx
  on public.material_movements (material_id, created_at desc);

-- ---------------------------------------------------------------------
-- 4. CLIENTES
-- ---------------------------------------------------------------------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  address     text,
  created_at  timestamptz not null default now()
);
create index if not exists customers_phone_idx on public.customers (phone);

-- ---------------------------------------------------------------------
-- 5. VENTAS / PEDIDOS
--    Una venta con fecha de entrega es también un "pedido" que pasa por
--    estados: pendiente -> en_produccion -> listo -> entregado (o cancelado).
--    Una venta sin fecha de entrega nace como "entregado".
-- ---------------------------------------------------------------------
create table if not exists public.receipt_counter (
  id    int primary key default 1 check (id = 1),
  serie text not null default 'B001',
  last  int not null default 0
);
insert into public.receipt_counter (id) values (1) on conflict do nothing;

create table if not exists public.sales (
  id                uuid primary key default gen_random_uuid(),
  receipt_number    int not null unique,
  receipt_code      text not null unique,            -- B001-00000012
  customer_id       uuid references public.customers (id) on delete set null,
  customer_name     text not null,
  customer_phone    text,
  seller_id         uuid references public.profiles (id),
  seller_name       text,
  status            text not null default 'pendiente'
                    check (status in ('pendiente','en_produccion','listo','entregado','cancelado')),
  payment_method    text not null check (payment_method in ('Yape','Plin','Efectivo','Tarjeta')),
  subtotal          numeric(10,2) not null,
  discount          numeric(10,2) not null default 0,
  delivery_cost     numeric(10,2) not null default 0,
  delivery_address  text,
  total             numeric(10,2) not null,
  delivery_date     date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists sales_created_idx on public.sales (created_at desc);
create index if not exists sales_status_idx  on public.sales (status);

create table if not exists public.sale_items (
  id            uuid primary key default gen_random_uuid(),
  sale_id       uuid not null references public.sales (id) on delete cascade,
  product_id    uuid references public.products (id) on delete set null,
  product_name  text not null,
  quantity      int not null check (quantity > 0),
  unit_price    numeric(10,2) not null,
  total         numeric(10,2) not null
);
create index if not exists sale_items_sale_idx on public.sale_items (sale_id);
create index if not exists sale_items_product_idx on public.sale_items (product_id);

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products
  for each row execute procedure public.set_updated_at();
drop trigger if exists materials_updated_at on public.materials;
create trigger materials_updated_at before update on public.materials
  for each row execute procedure public.set_updated_at();
drop trigger if exists sales_updated_at on public.sales;
create trigger sales_updated_at before update on public.sales
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------
-- 6. RPC: registrar venta (transacción completa)
--    - genera número de boleta correlativo (bloqueando el contador)
--    - valida y descuenta stock de cada producto
--    - crea/actualiza cliente por teléfono
--    - inserta venta e ítems
-- ---------------------------------------------------------------------
create or replace function public.create_sale(
  p_customer_name     text,
  p_customer_phone    text,
  p_items             jsonb,          -- [{product_id, quantity}]
  p_payment_method    text,
  p_discount          numeric default 0,
  p_delivery_cost     numeric default 0,
  p_delivery_address  text default null,
  p_delivery_date     date default null,
  p_notes             text default null
)
returns public.sales
language plpgsql
security definer set search_path = public
as $$
declare
  v_counter     public.receipt_counter%rowtype;
  v_number      int;
  v_code        text;
  v_customer_id uuid;
  v_sale        public.sales;
  v_item        jsonb;
  v_product     public.products%rowtype;
  v_qty         int;
  v_subtotal    numeric(10,2) := 0;
  v_total       numeric(10,2);
  v_seller_name text;
  v_status      text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;
  if p_payment_method not in ('Yape','Plin','Efectivo','Tarjeta') then
    raise exception 'Método de pago inválido';
  end if;
  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'Ingresa el nombre del cliente';
  end if;

  -- Vendedor
  select full_name into v_seller_name from public.profiles where id = auth.uid();

  -- Cliente (reutiliza por teléfono si existe)
  if coalesce(trim(p_customer_phone), '') <> '' then
    select id into v_customer_id from public.customers
      where phone = trim(p_customer_phone) limit 1;
  end if;
  if v_customer_id is null then
    insert into public.customers (name, phone, address)
      values (trim(p_customer_name), nullif(trim(p_customer_phone), ''), nullif(trim(p_delivery_address), ''))
      returning id into v_customer_id;
  else
    update public.customers
      set name = trim(p_customer_name),
          address = coalesce(nullif(trim(p_delivery_address), ''), address)
      where id = v_customer_id;
  end if;

  -- Validar stock y calcular subtotal (bloqueo de filas)
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::int;
    select * into v_product from public.products
      where id = (v_item ->> 'product_id')::uuid for update;
    if not found then
      raise exception 'Producto no encontrado';
    end if;
    if v_qty <= 0 then
      raise exception 'Cantidad inválida para %', v_product.name;
    end if;
    if v_product.stock < v_qty then
      raise exception 'Stock insuficiente de "%": quedan %', v_product.name, v_product.stock;
    end if;
    v_subtotal := v_subtotal + (v_product.price * v_qty);
  end loop;

  v_total := greatest(v_subtotal - coalesce(p_discount, 0) + coalesce(p_delivery_cost, 0), 0);

  -- Correlativo
  select * into v_counter from public.receipt_counter where id = 1 for update;
  v_number := v_counter.last + 1;
  update public.receipt_counter set last = v_number where id = 1;
  v_code := v_counter.serie || '-' || lpad(v_number::text, 8, '0');

  v_status := case when p_delivery_date is null then 'entregado' else 'pendiente' end;

  insert into public.sales (
    receipt_number, receipt_code, customer_id, customer_name, customer_phone,
    seller_id, seller_name, status, payment_method, subtotal, discount,
    delivery_cost, delivery_address, total, delivery_date, notes
  ) values (
    v_number, v_code, v_customer_id, trim(p_customer_name), nullif(trim(p_customer_phone), ''),
    auth.uid(), v_seller_name, v_status, p_payment_method, v_subtotal, coalesce(p_discount, 0),
    coalesce(p_delivery_cost, 0), nullif(trim(p_delivery_address), ''), v_total, p_delivery_date,
    nullif(trim(p_notes), '')
  ) returning * into v_sale;

  -- Ítems + descuento de stock
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::int;
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;
    insert into public.sale_items (sale_id, product_id, product_name, quantity, unit_price, total)
      values (v_sale.id, v_product.id, v_product.name, v_qty, v_product.price, v_product.price * v_qty);
    update public.products set stock = stock - v_qty where id = v_product.id;
  end loop;

  return v_sale;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. RPC: cambiar estado de pedido (cancelar devuelve stock, solo admin)
-- ---------------------------------------------------------------------
create or replace function public.update_sale_status(p_sale_id uuid, p_status text)
returns public.sales
language plpgsql
security definer set search_path = public
as $$
declare
  v_sale public.sales;
  v_item record;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_status not in ('pendiente','en_produccion','listo','entregado','cancelado') then
    raise exception 'Estado inválido';
  end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if v_sale.status = 'cancelado' then raise exception 'La venta ya está cancelada'; end if;

  if p_status = 'cancelado' then
    if not public.is_admin() then
      raise exception 'Solo un administrador puede cancelar ventas';
    end if;
    for v_item in select product_id, quantity from public.sale_items where sale_id = p_sale_id loop
      if v_item.product_id is not null then
        update public.products set stock = stock + v_item.quantity where id = v_item.product_id;
      end if;
    end loop;
  end if;

  update public.sales set status = p_status where id = p_sale_id returning * into v_sale;
  return v_sale;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. RPC: movimiento de stock de materiales
-- ---------------------------------------------------------------------
create or replace function public.adjust_material_stock(
  p_material_id uuid, p_type text, p_quantity numeric, p_note text default null
)
returns public.materials
language plpgsql
security definer set search_path = public
as $$
declare
  v_mat public.materials;
  v_new numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_type not in ('entrada','salida','ajuste') then raise exception 'Tipo inválido'; end if;
  if p_quantity < 0 then raise exception 'La cantidad no puede ser negativa'; end if;
  select * into v_mat from public.materials where id = p_material_id for update;
  if not found then raise exception 'Material no encontrado'; end if;

  v_new := case p_type
    when 'entrada' then v_mat.stock + p_quantity
    when 'salida'  then v_mat.stock - p_quantity
    else p_quantity
  end;
  if v_new < 0 then
    raise exception 'Stock insuficiente de "%": quedan %', v_mat.name, v_mat.stock;
  end if;

  update public.materials set stock = v_new where id = p_material_id returning * into v_mat;
  insert into public.material_movements (material_id, type, quantity, note, user_id)
    values (p_material_id, p_type, p_quantity, nullif(trim(p_note), ''), auth.uid());
  return v_mat;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. VISTAS de reportes (hora de Lima)
-- ---------------------------------------------------------------------
create or replace view public.v_sales_daily
with (security_invoker = true) as
  select
    (created_at at time zone 'America/Lima')::date as day,
    count(*)::int                                    as sales_count,
    sum(total)::numeric(12,2)                        as total
  from public.sales
  where status <> 'cancelado'
  group by 1
  order by 1;

create or replace view public.v_top_products
with (security_invoker = true) as
  select
    si.product_id,
    si.product_name,
    sum(si.quantity)::int           as units,
    sum(si.total)::numeric(12,2)    as revenue
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.status <> 'cancelado'
    and s.created_at >= (now() - interval '30 days')
  group by si.product_id, si.product_name
  order by revenue desc;

-- ---------------------------------------------------------------------
-- 10. SEGURIDAD (RLS)
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.categories          enable row level security;
alter table public.products            enable row level security;
alter table public.materials           enable row level security;
alter table public.material_movements  enable row level security;
alter table public.customers           enable row level security;
alter table public.sales               enable row level security;
alter table public.sale_items          enable row level security;
alter table public.receipt_counter     enable row level security;

-- profiles
drop policy if exists "profiles: leer todos" on public.profiles;
create policy "profiles: leer todos" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles: editar propio" on public.profiles;
create policy "profiles: editar propio" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profiles: admin edita" on public.profiles;
create policy "profiles: admin edita" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- categories / products / materials: todos leen, solo admin escribe
drop policy if exists "categories: leer" on public.categories;
create policy "categories: leer" on public.categories for select to authenticated using (true);
drop policy if exists "categories: admin" on public.categories;
create policy "categories: admin" on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "products: leer" on public.products;
create policy "products: leer" on public.products for select to authenticated using (true);
drop policy if exists "products: admin" on public.products;
create policy "products: admin" on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "materials: leer" on public.materials;
create policy "materials: leer" on public.materials for select to authenticated using (true);
drop policy if exists "materials: admin" on public.materials;
create policy "materials: admin" on public.materials for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "movements: leer" on public.material_movements;
create policy "movements: leer" on public.material_movements for select to authenticated using (true);

-- customers: todos leen/crean/editan
drop policy if exists "customers: leer" on public.customers;
create policy "customers: leer" on public.customers for select to authenticated using (true);
drop policy if exists "customers: escribir" on public.customers;
create policy "customers: escribir" on public.customers for insert to authenticated with check (true);
drop policy if exists "customers: editar" on public.customers;
create policy "customers: editar" on public.customers for update to authenticated using (true) with check (true);

-- sales / items: todos leen (las escrituras van por RPC security definer)
drop policy if exists "sales: leer" on public.sales;
create policy "sales: leer" on public.sales for select to authenticated using (true);
drop policy if exists "sale_items: leer" on public.sale_items;
create policy "sale_items: leer" on public.sale_items for select to authenticated using (true);

drop policy if exists "counter: leer" on public.receipt_counter;
create policy "counter: leer" on public.receipt_counter for select to authenticated using (true);

grant usage on schema public to authenticated;
grant select on public.v_sales_daily, public.v_top_products to authenticated;
grant execute on function public.create_sale(text,text,jsonb,text,numeric,numeric,text,date,text) to authenticated;
grant execute on function public.update_sale_status(uuid,text) to authenticated;
grant execute on function public.adjust_material_stock(uuid,text,numeric,text) to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 11. REALTIME (panel de inicio en tiempo real)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'sales'
  ) then
    alter publication supabase_realtime add table public.sales;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 12. STORAGE: bucket público para fotos de productos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('productos', 'productos', true)
  on conflict (id) do nothing;

drop policy if exists "productos: leer publico" on storage.objects;
create policy "productos: leer publico" on storage.objects
  for select using (bucket_id = 'productos');
drop policy if exists "productos: subir" on storage.objects;
create policy "productos: subir" on storage.objects
  for insert to authenticated with check (bucket_id = 'productos');
drop policy if exists "productos: actualizar" on storage.objects;
create policy "productos: actualizar" on storage.objects
  for update to authenticated using (bucket_id = 'productos');
drop policy if exists "productos: borrar" on storage.objects;
create policy "productos: borrar" on storage.objects
  for delete to authenticated using (bucket_id = 'productos');

-- =====================================================================
--  Para convertir un usuario en administrador:
--    update public.profiles set role = 'admin' where id = '<uuid del usuario>';
-- =====================================================================
