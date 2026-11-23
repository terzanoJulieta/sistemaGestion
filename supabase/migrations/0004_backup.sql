-- =====================================================================
-- Restauración de backups
-- Ejecutar completo en Supabase: SQL Editor → New query → pegar → Run
-- =====================================================================

-- Durante una restauración, el trigger de productos no toca los datos
create or replace function public.productos_before_write()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.restaurando', true) = 'on' then
    return new;
  end if;
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

-- Reemplaza TODOS los datos por los del backup (archivo .json descargado
-- desde la app). Se hace en una sola operación: si algo falla, no cambia nada.
create or replace function public.restaurar_backup(p_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t      text;
  tablas text[] := array['categorias','productos','clientes','ventas','venta_items',
                         'pagos','devoluciones','devolucion_items','movimientos_stock'];
  v_res  jsonb := '{}'::jsonb;
  v_n    integer;
  v_max  bigint;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    raise exception 'Hay que iniciar sesión para restaurar un backup';
  end if;
  if p_backup is null or p_backup->>'sistema' is distinct from 'sistema-gestion-comercio' then
    raise exception 'El archivo no es un backup de este sistema';
  end if;

  perform set_config('app.restaurando', 'on', true);

  -- Borrar en orden inverso por las relaciones entre tablas
  for i in reverse array_length(tablas, 1)..1 loop
    execute format('delete from public.%I where true', tablas[i]);
  end loop;

  -- Cargar en orden
  foreach t in array tablas loop
    execute format(
      'insert into public.%1$I overriding system value
         select * from jsonb_populate_recordset(null::public.%1$I, $1)', t)
    using coalesce(p_backup->'datos'->t, '[]'::jsonb);
    get diagnostics v_n = row_count;
    v_res := v_res || jsonb_build_object(t, v_n);

    -- Que los próximos números sigan después del último restaurado
    execute format('select coalesce(max(id), 0) from public.%I', t) into v_max;
    perform setval(pg_get_serial_sequence('public.' || t, 'id'), v_max + 1, false);
  end loop;

  -- Secuencia de códigos internos de productos
  select coalesce(max(substr(codigo_barras, 3, 10)::bigint), 0) into v_max
    from public.productos
   where codigo_interno and codigo_barras ~ '^20[0-9]{11}$';
  perform setval('public.codigo_interno_seq', v_max + 1, false);

  perform set_config('app.restaurando', 'off', true);
  return v_res;
end;
$$;

revoke all on function public.restaurar_backup(jsonb) from public, anon;
grant execute on function public.restaurar_backup(jsonb) to authenticated;
