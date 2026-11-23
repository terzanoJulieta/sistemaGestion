-- =====================================================================
-- Sistema de Gestión del Comercio - Esquema inicial
-- Ejecutar completo en Supabase: SQL Editor → New query → pegar → Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- Categorías (rubros)
-- ---------------------------------------------------------------------
create table public.categorias (
  id          bigint generated always as identity primary key,
  nombre      text not null unique,
  created_at  timestamptz not null default now()
);

insert into public.categorias (nombre) values
  ('Cotillón'), ('Ropa'), ('Juguetes'), ('Librería');

-- ---------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------
create sequence public.codigo_interno_seq start 1;

-- Genera un EAN-13 interno con prefijo 20 (rango reservado para uso en
-- el propio comercio). Sirve para productos que no traen código y para
-- imprimir etiquetas más adelante.
create or replace function public.generar_codigo_interno()
returns text
language plpgsql
as $$
declare
  base  text;
  suma  int := 0;
  i     int;
  dig   int;
begin
  loop
    base := '20' || lpad(nextval('public.codigo_interno_seq')::text, 10, '0');
    suma := 0;
    for i in 1..12 loop
      dig := substr(base, i, 1)::int;
      suma := suma + case when i % 2 = 0 then dig * 3 else dig end;
    end loop;
    base := base || ((10 - (suma % 10)) % 10)::text;
    exit when not exists (select 1 from public.productos where codigo_barras = base);
  end loop;
  return base;
end;
$$;

create table public.productos (
  id              bigint generated always as identity primary key,
  codigo_barras   text not null unique,
  codigo_interno  boolean not null default false, -- true si el código lo generó el sistema
  nombre          text not null,
  descripcion     text,
  categoria_id    bigint references public.categorias(id) on delete set null,
  talle           text,
  color           text,
  precio_costo    numeric(12,2) not null default 0 check (precio_costo >= 0),
  precio_venta    numeric(12,2) not null default 0 check (precio_venta >= 0),
  stock_actual    integer not null default 0,
  stock_minimo    integer not null default 0 check (stock_minimo >= 0),
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index productos_nombre_idx on public.productos using gin (to_tsvector('simple', nombre));
create index productos_categoria_idx on public.productos (categoria_id);

create or replace function public.productos_before_write()
returns trigger
language plpgsql
as $$
begin
  if new.codigo_barras is null or btrim(new.codigo_barras) = '' then
    new.codigo_barras := public.generar_codigo_interno();
    new.codigo_interno := true;
  else
    new.codigo_barras := btrim(new.codigo_barras);
    if tg_op = 'INSERT' then
      new.codigo_interno := false;
    elsif new.codigo_barras is distinct from old.codigo_barras then
      new.codigo_interno := false;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger productos_before_write
  before insert or update on public.productos
  for each row execute function public.productos_before_write();

-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
create table public.clientes (
  id              bigint generated always as identity primary key,
  nombre          text not null,
  documento       text,           -- DNI o CUIT
  telefono        text,
  email           text,
  direccion       text,
  limite_credito  numeric(12,2) check (limite_credito is null or limite_credito >= 0),
  observaciones   text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index clientes_nombre_idx on public.clientes (lower(nombre));

-- ---------------------------------------------------------------------
-- Ventas
-- ---------------------------------------------------------------------
create table public.ventas (
  id             bigint generated always as identity primary key, -- número de comprobante
  fecha          timestamptz not null default now(),
  cliente_id     bigint references public.clientes(id) on delete restrict,
  subtotal       numeric(12,2) not null,
  descuento      numeric(12,2) not null default 0 check (descuento >= 0),
  total          numeric(12,2) not null check (total >= 0),
  medio_pago     text not null check (medio_pago in
                   ('efectivo','debito','credito','transferencia','cuenta_corriente')),
  estado         text not null default 'confirmada' check (estado in ('confirmada','anulada')),
  observaciones  text,
  usuario_id     uuid default auth.uid(),
  anulada_at     timestamptz,
  constraint venta_cc_requiere_cliente
    check (medio_pago <> 'cuenta_corriente' or cliente_id is not null)
);

create index ventas_fecha_idx on public.ventas (fecha desc);
create index ventas_cliente_idx on public.ventas (cliente_id);

create table public.venta_items (
  id               bigint generated always as identity primary key,
  venta_id         bigint not null references public.ventas(id) on delete cascade,
  producto_id      bigint not null references public.productos(id) on delete restrict,
  descripcion      text not null,   -- nombre del producto al momento de la venta
  cantidad         integer not null check (cantidad > 0),
  precio_unitario  numeric(12,2) not null check (precio_unitario >= 0),
  subtotal         numeric(12,2) not null
);

create index venta_items_venta_idx on public.venta_items (venta_id);

-- ---------------------------------------------------------------------
-- Movimientos de stock (historial)
-- ---------------------------------------------------------------------
create table public.movimientos_stock (
  id                bigint generated always as identity primary key,
  fecha             timestamptz not null default now(),
  producto_id       bigint not null references public.productos(id) on delete cascade,
  tipo              text not null check (tipo in ('ingreso','ajuste','venta','anulacion_venta','inicial')),
  cantidad          integer not null,       -- positivo suma, negativo resta
  stock_resultante  integer not null,
  motivo            text,
  venta_id          bigint references public.ventas(id) on delete set null,
  usuario_id        uuid default auth.uid()
);

create index movimientos_stock_producto_idx on public.movimientos_stock (producto_id, fecha desc);

-- ---------------------------------------------------------------------
-- Pagos (de clientes en cuenta corriente)
-- ---------------------------------------------------------------------
create table public.pagos (
  id             bigint generated always as identity primary key,
  fecha          timestamptz not null default now(),
  cliente_id     bigint not null references public.clientes(id) on delete restrict,
  monto          numeric(12,2) not null check (monto > 0),
  medio_pago     text not null check (medio_pago in ('efectivo','debito','credito','transferencia')),
  observaciones  text,
  anulado        boolean not null default false,
  usuario_id     uuid default auth.uid()
);

create index pagos_cliente_idx on public.pagos (cliente_id, fecha desc);

-- ---------------------------------------------------------------------
-- Cuenta corriente: vistas
-- ---------------------------------------------------------------------
create view public.cuenta_corriente_movimientos
with (security_invoker = true) as
  select v.cliente_id,
         v.fecha,
         'venta'::text      as tipo,
         v.id               as venta_id,
         null::bigint       as pago_id,
         'Venta N° ' || v.id as concepto,
         v.total            as debe,
         0::numeric(12,2)   as haber
    from public.ventas v
   where v.medio_pago = 'cuenta_corriente' and v.estado = 'confirmada'
  union all
  select p.cliente_id,
         p.fecha,
         'pago'::text,
         null::bigint,
         p.id,
         'Pago (' || p.medio_pago || ')' || coalesce(' - ' || p.observaciones, ''),
         0::numeric(12,2),
         p.monto
    from public.pagos p
   where not p.anulado;

create view public.clientes_saldo
with (security_invoker = true) as
  select c.*,
         coalesce((select sum(m.debe - m.haber)
                     from public.cuenta_corriente_movimientos m
                    where m.cliente_id = c.id), 0)::numeric(12,2) as saldo
    from public.clientes c;

-- ---------------------------------------------------------------------
-- Funciones de negocio (se llaman desde la app con supabase.rpc)
-- ---------------------------------------------------------------------

-- Ingreso o ajuste manual de stock
create or replace function public.registrar_movimiento_stock(
  p_producto_id bigint,
  p_tipo        text,
  p_cantidad    integer,
  p_motivo      text default null
) returns integer
language plpgsql
as $$
declare
  v_stock integer;
begin
  if p_tipo not in ('ingreso','ajuste','inicial') then
    raise exception 'Tipo de movimiento inválido: %', p_tipo;
  end if;
  if p_cantidad = 0 then
    raise exception 'La cantidad no puede ser cero';
  end if;
  if p_tipo = 'ingreso' and p_cantidad < 0 then
    raise exception 'Un ingreso debe tener cantidad positiva';
  end if;

  update public.productos
     set stock_actual = stock_actual + p_cantidad
   where id = p_producto_id
  returning stock_actual into v_stock;

  if not found then
    raise exception 'Producto inexistente';
  end if;

  insert into public.movimientos_stock (producto_id, tipo, cantidad, stock_resultante, motivo)
  values (p_producto_id, p_tipo, p_cantidad, v_stock, p_motivo);

  return v_stock;
end;
$$;

-- Crea una venta completa: cabecera, ítems, descuento de stock y,
-- si es a cuenta corriente, queda registrada como deuda del cliente.
-- p_items: [{"producto_id": 1, "cantidad": 2, "precio_unitario": 1500}, ...]
create or replace function public.crear_venta(
  p_items          jsonb,
  p_medio_pago     text,
  p_cliente_id     bigint default null,
  p_descuento      numeric default 0,
  p_observaciones  text default null
) returns bigint
language plpgsql
as $$
declare
  v_venta_id   bigint;
  v_subtotal   numeric(12,2) := 0;
  v_total      numeric(12,2);
  v_item       jsonb;
  v_prod       public.productos%rowtype;
  v_cant       integer;
  v_precio     numeric(12,2);
  v_stock      integer;
  v_limite     numeric(12,2);
  v_saldo      numeric(12,2);
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;
  if p_medio_pago = 'cuenta_corriente' and p_cliente_id is null then
    raise exception 'Para vender a cuenta corriente hay que elegir un cliente';
  end if;

  -- Calcular subtotal y validar ítems
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cant := (v_item->>'cantidad')::integer;
    if v_cant is null or v_cant <= 0 then
      raise exception 'Cantidad inválida';
    end if;
    select * into v_prod from public.productos where id = (v_item->>'producto_id')::bigint;
    if not found then
      raise exception 'Producto inexistente (id %)', v_item->>'producto_id';
    end if;
    v_precio := coalesce((v_item->>'precio_unitario')::numeric, v_prod.precio_venta);
    v_subtotal := v_subtotal + round(v_precio * v_cant, 2);
  end loop;

  v_total := v_subtotal - coalesce(p_descuento, 0);
  if v_total < 0 then
    raise exception 'El descuento no puede superar el subtotal';
  end if;

  -- Límite de crédito del cliente
  if p_medio_pago = 'cuenta_corriente' then
    select limite_credito, saldo into v_limite, v_saldo
      from public.clientes_saldo where id = p_cliente_id;
    if not found then
      raise exception 'Cliente inexistente';
    end if;
    if v_limite is not null and v_saldo + v_total > v_limite then
      raise exception 'El cliente supera su límite de crédito (saldo actual: %, límite: %)', v_saldo, v_limite;
    end if;
  end if;

  insert into public.ventas (cliente_id, subtotal, descuento, total, medio_pago, observaciones)
  values (p_cliente_id, v_subtotal, coalesce(p_descuento, 0), v_total, p_medio_pago, p_observaciones)
  returning id into v_venta_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cant := (v_item->>'cantidad')::integer;
    select * into v_prod from public.productos
     where id = (v_item->>'producto_id')::bigint
     for update;
    v_precio := coalesce((v_item->>'precio_unitario')::numeric, v_prod.precio_venta);

    insert into public.venta_items (venta_id, producto_id, descripcion, cantidad, precio_unitario, subtotal)
    values (v_venta_id, v_prod.id,
            v_prod.nombre || coalesce(' ' || v_prod.talle, '') || coalesce(' ' || v_prod.color, ''),
            v_cant, v_precio, round(v_precio * v_cant, 2));

    update public.productos set stock_actual = stock_actual - v_cant
     where id = v_prod.id
    returning stock_actual into v_stock;

    insert into public.movimientos_stock (producto_id, tipo, cantidad, stock_resultante, venta_id)
    values (v_prod.id, 'venta', -v_cant, v_stock, v_venta_id);
  end loop;

  return v_venta_id;
end;
$$;

-- Anula una venta: devuelve el stock y la saca de la cuenta corriente.
create or replace function public.anular_venta(p_venta_id bigint)
returns void
language plpgsql
as $$
declare
  v_estado text;
  v_it     record;
  v_stock  integer;
begin
  select estado into v_estado from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'Venta inexistente';
  end if;
  if v_estado = 'anulada' then
    raise exception 'La venta ya está anulada';
  end if;

  update public.ventas set estado = 'anulada', anulada_at = now() where id = p_venta_id;

  for v_it in select producto_id, cantidad from public.venta_items where venta_id = p_venta_id loop
    update public.productos set stock_actual = stock_actual + v_it.cantidad
     where id = v_it.producto_id
    returning stock_actual into v_stock;

    insert into public.movimientos_stock (producto_id, tipo, cantidad, stock_resultante, venta_id, motivo)
    values (v_it.producto_id, 'anulacion_venta', v_it.cantidad, v_stock, p_venta_id, 'Anulación venta N° ' || p_venta_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Seguridad (RLS): solo usuarios logueados pueden ver y modificar datos
-- ---------------------------------------------------------------------
alter table public.categorias        enable row level security;
alter table public.productos         enable row level security;
alter table public.clientes          enable row level security;
alter table public.ventas            enable row level security;
alter table public.venta_items       enable row level security;
alter table public.movimientos_stock enable row level security;
alter table public.pagos             enable row level security;

create policy "usuarios logueados" on public.categorias        for all to authenticated using (true) with check (true);
create policy "usuarios logueados" on public.productos         for all to authenticated using (true) with check (true);
create policy "usuarios logueados" on public.clientes          for all to authenticated using (true) with check (true);
create policy "usuarios logueados" on public.ventas            for all to authenticated using (true) with check (true);
create policy "usuarios logueados" on public.venta_items       for all to authenticated using (true) with check (true);
create policy "usuarios logueados" on public.pagos             for all to authenticated using (true) with check (true);
-- El historial de stock solo se escribe desde las funciones; se puede leer.
create policy "lectura logueados"  on public.movimientos_stock for select to authenticated using (true);
create policy "alta logueados"     on public.movimientos_stock for insert to authenticated with check (true);

revoke all on function public.registrar_movimiento_stock(bigint, text, integer, text) from public, anon;
revoke all on function public.crear_venta(jsonb, text, bigint, numeric, text) from public, anon;
revoke all on function public.anular_venta(bigint) from public, anon;
grant execute on function public.registrar_movimiento_stock(bigint, text, integer, text) to authenticated;
grant execute on function public.crear_venta(jsonb, text, bigint, numeric, text) to authenticated;
grant execute on function public.anular_venta(bigint) to authenticated;
grant usage on sequence public.codigo_interno_seq to authenticated;
