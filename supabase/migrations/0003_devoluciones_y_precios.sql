-- =====================================================================
-- Mejoras: devoluciones parciales, % de ganancia y aumento masivo
-- Ejecutar completo en Supabase: SQL Editor → New query → pegar → Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- % de ganancia en productos (precio_costo = precio de lista)
-- ---------------------------------------------------------------------
alter table public.productos
  add column if not exists margen_ganancia numeric(7,2) check (margen_ganancia is null or margen_ganancia >= -100);

-- Productos existentes: calcular el % a partir de los precios cargados
update public.productos
   set margen_ganancia = round((precio_venta - precio_costo) / precio_costo * 100, 2)
 where margen_ganancia is null and precio_costo > 0;

-- ---------------------------------------------------------------------
-- Devoluciones (anulación parcial de ventas)
-- ---------------------------------------------------------------------
alter table public.venta_items
  add column if not exists cantidad_devuelta integer not null default 0;
alter table public.venta_items drop constraint if exists venta_items_devuelta_check;
alter table public.venta_items
  add constraint venta_items_devuelta_check check (cantidad_devuelta >= 0 and cantidad_devuelta <= cantidad);

alter table public.ventas
  add column if not exists total_devuelto numeric(12,2) not null default 0;

create table if not exists public.devoluciones (
  id          bigint generated always as identity primary key,
  fecha       timestamptz not null default now(),
  venta_id    bigint not null references public.ventas(id) on delete cascade,
  monto       numeric(12,2) not null check (monto >= 0),
  motivo      text,
  usuario_id  uuid default auth.uid()
);
create index if not exists devoluciones_venta_idx on public.devoluciones (venta_id);
create index if not exists devoluciones_fecha_idx on public.devoluciones (fecha desc);

create table if not exists public.devolucion_items (
  id             bigint generated always as identity primary key,
  devolucion_id  bigint not null references public.devoluciones(id) on delete cascade,
  venta_item_id  bigint not null references public.venta_items(id) on delete cascade,
  cantidad       integer not null check (cantidad > 0),
  monto          numeric(12,2) not null
);

alter table public.movimientos_stock drop constraint if exists movimientos_stock_tipo_check;
alter table public.movimientos_stock add constraint movimientos_stock_tipo_check
  check (tipo in ('ingreso','ajuste','venta','anulacion_venta','inicial','devolucion'));

-- Devuelve parte de una venta.
-- p_items: [{"venta_item_id": 10, "cantidad": 2}, ...]
-- El monto devuelto respeta el descuento que tuvo la venta (proporcional).
create or replace function public.devolver_items(
  p_venta_id  bigint,
  p_items     jsonb,
  p_motivo    text default null
) returns bigint
language plpgsql
as $$
declare
  v_venta   public.ventas%rowtype;
  v_dev_id  bigint;
  v_item    jsonb;
  v_vi      public.venta_items%rowtype;
  v_cant    integer;
  v_factor  numeric;
  v_monto   numeric(12,2);
  v_total   numeric(12,2) := 0;
  v_stock   integer;
begin
  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found then raise exception 'Venta inexistente'; end if;
  if v_venta.estado = 'anulada' then raise exception 'La venta está anulada'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Elegí al menos un producto para devolver';
  end if;

  -- factor de descuento: lo que realmente se cobró sobre el subtotal
  v_factor := case when v_venta.subtotal > 0 then v_venta.total / v_venta.subtotal else 1 end;

  insert into public.devoluciones (venta_id, monto, motivo)
  values (p_venta_id, 0, p_motivo)
  returning id into v_dev_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cant := (v_item->>'cantidad')::integer;
    if v_cant is null or v_cant <= 0 then continue; end if;

    select * into v_vi from public.venta_items
     where id = (v_item->>'venta_item_id')::bigint and venta_id = p_venta_id
     for update;
    if not found then raise exception 'El producto no pertenece a esta venta'; end if;
    if v_vi.cantidad_devuelta + v_cant > v_vi.cantidad then
      raise exception 'De "%" se pueden devolver como máximo %', v_vi.descripcion, v_vi.cantidad - v_vi.cantidad_devuelta;
    end if;

    v_monto := round(v_vi.precio_unitario * v_cant * v_factor, 2);
    v_total := v_total + v_monto;

    update public.venta_items set cantidad_devuelta = cantidad_devuelta + v_cant where id = v_vi.id;
    insert into public.devolucion_items (devolucion_id, venta_item_id, cantidad, monto)
    values (v_dev_id, v_vi.id, v_cant, v_monto);

    update public.productos set stock_actual = stock_actual + v_cant
     where id = v_vi.producto_id
    returning stock_actual into v_stock;
    insert into public.movimientos_stock (producto_id, tipo, cantidad, stock_resultante, venta_id, motivo)
    values (v_vi.producto_id, 'devolucion', v_cant, v_stock, p_venta_id,
            'Devolución venta N° ' || p_venta_id || coalesce(' - ' || p_motivo, ''));
  end loop;

  if v_total = 0 and not exists (select 1 from public.devolucion_items where devolucion_id = v_dev_id) then
    raise exception 'Elegí al menos un producto para devolver';
  end if;

  -- Evita diferencias de centavos: nunca se devuelve más que lo cobrado
  v_total := least(v_total, v_venta.total - v_venta.total_devuelto);
  update public.devoluciones set monto = v_total where id = v_dev_id;
  update public.ventas set total_devuelto = total_devuelto + v_total where id = p_venta_id;

  return v_dev_id;
end;
$$;

-- Anulación total: devuelve solo lo que no se había devuelto antes
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
  if not found then raise exception 'Venta inexistente'; end if;
  if v_estado = 'anulada' then raise exception 'La venta ya está anulada'; end if;

  update public.ventas set estado = 'anulada', anulada_at = now() where id = p_venta_id;

  for v_it in
    select producto_id, cantidad - cantidad_devuelta as pendiente
      from public.venta_items
     where venta_id = p_venta_id and cantidad > cantidad_devuelta
  loop
    update public.productos set stock_actual = stock_actual + v_it.pendiente
     where id = v_it.producto_id
    returning stock_actual into v_stock;

    insert into public.movimientos_stock (producto_id, tipo, cantidad, stock_resultante, venta_id, motivo)
    values (v_it.producto_id, 'anulacion_venta', v_it.pendiente, v_stock, p_venta_id, 'Anulación venta N° ' || p_venta_id);
  end loop;
end;
$$;

-- Cuenta corriente: las devoluciones de ventas fiadas bajan la deuda
create or replace view public.cuenta_corriente_movimientos
with (security_invoker = true) as
  select v.cliente_id,
         v.fecha,
         'venta'::text       as tipo,
         v.id                as venta_id,
         null::bigint        as pago_id,
         'Venta N° ' || v.id as concepto,
         v.total             as debe,
         0::numeric(12,2)    as haber
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
   where not p.anulado
  union all
  select v.cliente_id,
         d.fecha,
         'devolucion'::text,
         v.id,
         null::bigint,
         'Devolución venta N° ' || v.id || coalesce(' - ' || d.motivo, ''),
         0::numeric(12,2),
         d.monto
    from public.devoluciones d
    join public.ventas v on v.id = d.venta_id
   where v.medio_pago = 'cuenta_corriente' and v.estado = 'confirmada';

-- ---------------------------------------------------------------------
-- Aumento masivo de precios
-- p_aplicar_a: 'lista_y_venta' (sube el precio de lista y recalcula la
--              venta con el % de ganancia) | 'solo_venta'
-- p_categoria_id: null = todas
-- p_redondeo: 0 = sin redondeo, 1, 10, 50, 100... redondea el precio de venta hacia arriba
-- Devuelve la cantidad de productos actualizados.
-- ---------------------------------------------------------------------
create or replace function public.aumentar_precios(
  p_porcentaje    numeric,
  p_aplicar_a     text default 'lista_y_venta',
  p_categoria_id  bigint default null,
  p_redondeo      numeric default 0
) returns integer
language plpgsql
as $$
declare
  v_factor numeric := 1 + p_porcentaje / 100;
  v_n      integer;
begin
  if p_porcentaje is null or p_porcentaje = 0 then raise exception 'Ingresá un porcentaje'; end if;
  if v_factor <= 0 then raise exception 'Porcentaje inválido'; end if;
  if p_aplicar_a not in ('lista_y_venta', 'solo_venta') then raise exception 'Opción inválida'; end if;

  with nuevos as (
    select id,
           case when p_aplicar_a = 'lista_y_venta' then round(precio_costo * v_factor, 2) else precio_costo end as costo,
           case
             when p_aplicar_a = 'lista_y_venta' and margen_ganancia is not null and precio_costo > 0
               then round(precio_costo * v_factor * (1 + margen_ganancia / 100), 2)
             else round(precio_venta * v_factor, 2)
           end as venta
      from public.productos
     where activo and (p_categoria_id is null or categoria_id = p_categoria_id)
  )
  update public.productos p
     set precio_costo = n.costo,
         precio_venta = case when coalesce(p_redondeo, 0) > 0
                             then ceil(n.venta / p_redondeo) * p_redondeo
                             else n.venta end,
         margen_ganancia = case
                             when p_aplicar_a = 'solo_venta' and n.costo > 0
                               then round(((case when coalesce(p_redondeo, 0) > 0 then ceil(n.venta / p_redondeo) * p_redondeo else n.venta end) - n.costo) / n.costo * 100, 2)
                             else p.margen_ganancia
                           end
    from nuevos n
   where p.id = n.id;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- Seguridad y permisos de lo nuevo
-- ---------------------------------------------------------------------
alter table public.devoluciones     enable row level security;
alter table public.devolucion_items enable row level security;
drop policy if exists "usuarios logueados" on public.devoluciones;
drop policy if exists "usuarios logueados" on public.devolucion_items;
create policy "usuarios logueados" on public.devoluciones     for all to authenticated using (true) with check (true);
create policy "usuarios logueados" on public.devolucion_items for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.devoluciones, public.devolucion_items to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on public.cuenta_corriente_movimientos, public.clientes_saldo to authenticated;
grant execute on function public.devolver_items(bigint, jsonb, text) to authenticated;
grant execute on function public.aumentar_precios(numeric, text, bigint, numeric) to authenticated;
grant execute on function public.anular_venta(bigint) to authenticated;
revoke all on public.devoluciones, public.devolucion_items from anon;
revoke execute on function public.devolver_items(bigint, jsonb, text) from public, anon;
revoke execute on function public.aumentar_precios(numeric, text, bigint, numeric) from public, anon;
