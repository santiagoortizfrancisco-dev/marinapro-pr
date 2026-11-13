-- =============================================================================
-- Conectar con ChatGPT (solo LEER). Cada negocio saca una llave secreta en
-- Más → Conectar con ChatGPT y la pone en su GPT. ChatGPT llama a gpt_query con
-- esa llave y recibe los números del negocio. No puede cambiar ni borrar nada.
-- La llave no se guarda: solo su huella (sha256). Se puede correr más de una vez.
-- =============================================================================

create table if not exists public.gpt_keys (
  mechanic_id   uuid primary key references public.mechanics(profile_id) on delete cascade,
  key_hash      text not null unique,
  key_hint      text not null,                 -- los últimos 4, para reconocerla
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
alter table public.gpt_keys enable row level security;
drop policy if exists gpt_keys_own on public.gpt_keys;
create policy gpt_keys_own on public.gpt_keys for all to authenticated
  using (mechanic_id = auth.uid()) with check (mechanic_id = auth.uid());
grant select, insert, update, delete on public.gpt_keys to authenticated;

-- Sacar una llave nueva (la vieja deja de servir). Devuelve la llave UNA sola vez.
create or replace function public.gpt_new_key()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := auth.uid();
  v_key text;
begin
  if v_me is null or not exists (select 1 from mechanics where profile_id = v_me) then
    raise exception 'Solo el dueño del negocio puede sacar la llave';
  end if;
  v_key := 'ff_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  delete from gpt_keys where mechanic_id = v_me;
  insert into gpt_keys (mechanic_id, key_hash, key_hint)
  values (v_me, encode(sha256(convert_to(v_key, 'UTF8')), 'hex'), right(v_key, 4));
  return v_key;
end $$;
revoke all on function public.gpt_new_key() from public, anon;
grant execute on function public.gpt_new_key() to authenticated;

-- Lo que ChatGPT puede preguntar. p_what: negocio | resumen | ventas | citas | deudas | rentas | empleadas | clientas
create or replace function public.gpt_query(
  p_key text, p_what text, p_from date default null, p_to date default null, p_search text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me    uuid;
  v_today date := (now() at time zone 'America/Puerto_Rico')::date;
  v_from  date := coalesce(p_from, date_trunc('month', (now() at time zone 'America/Puerto_Rico'))::date);
  v_to    date := coalesce(p_to, (date_trunc('month', (now() at time zone 'America/Puerto_Rico')) + interval '1 month - 1 day')::date);
  v_a     timestamptz;
  v_b     timestamptz;
  v_out   jsonb;
begin
  select mechanic_id into v_me from gpt_keys
   where key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
  if v_me is null then
    raise exception 'Llave no válida. Saca una nueva en FacturaFácil PR: Más → Conectar con ChatGPT.';
  end if;
  if v_to < v_from then v_to := v_from; end if;
  if v_to - v_from > 400 then v_to := v_from + 400; end if;
  v_a := (v_from::timestamp) at time zone 'America/Puerto_Rico';
  v_b := ((v_to + 1)::timestamp) at time zone 'America/Puerto_Rico';

  if p_what = 'negocio' then
    select jsonb_build_object(
      'negocio', m.business_name, 'hoy', v_today, 'moneda', 'USD', 'ivu', m.ivu_rate,
      'empleadas', coalesce((select jsonb_agg(jsonb_build_object(
          'nombre', s.name, 'activa', s.active,
          'trabaja_por', case when s.pay_type = 'rent' then 'renta' else 'comision' end,
          'comision', case when s.pay_type = 'rent' then null else s.commission_rate end,
          'renta', case when s.pay_type = 'rent' then s.rent_amount end,
          'renta_cada', case when s.pay_type = 'rent' then case s.rent_period when 'month' then 'mes' else 'semana' end end,
          'espacio', s.rent_space) order by s.name)
        from staff s where s.mechanic_id = v_me and not s.is_example), '[]'::jsonb),
      'servicios', coalesce((select jsonb_agg(jsonb_build_object('nombre', c.name, 'precio', c.last_price, 'minutos', c.duration_min, 'categoria', c.category) order by c.name)
        from catalog_items c where c.mechanic_id = v_me and c.kind = 'service'), '[]'::jsonb))
    into v_out from mechanics m where m.profile_id = v_me;

  elsif p_what = 'ventas' then
    select jsonb_build_object('desde', v_from, 'hasta', v_to, 'ventas', coalesce(jsonb_agg(x order by x->>'fecha'), '[]'::jsonb)) into v_out
    from (select jsonb_build_object(
        'fecha', to_char(p.paid_at at time zone 'America/Puerto_Rico', 'YYYY-MM-DD HH24:MI'),
        'cliente', c.full_name, 'servicio', coalesce(w.complaint, w.diagnosis), 'empleada', s.name,
        'metodo', case p.method when 'ath_movil' then 'ATH Móvil' when 'cash' then 'efectivo' when 'check' then 'cheque' else 'otro' end,
        'tarjeta_regalo', p.gift_card_id is not null,
        'monto', p.amount, 'propina', p.tip) x
      from payments p join work_orders w on w.id = p.work_order_id join boats b on b.id = w.boat_id
      join clients c on c.id = b.client_id left join staff s on s.id = w.staff_id
      where c.mechanic_id = v_me and p.paid_at >= v_a and p.paid_at < v_b limit 2000) q;

  elsif p_what = 'citas' then
    select jsonb_build_object('desde', v_from, 'hasta', v_to, 'citas', coalesce(jsonb_agg(x order by x->>'fecha'), '[]'::jsonb)) into v_out
    from (select jsonb_build_object(
        'fecha', to_char(a.starts_at at time zone 'America/Puerto_Rico', 'YYYY-MM-DD HH24:MI'),
        'minutos', a.duration_min, 'cliente', c.full_name, 'servicios', a.title, 'empleada', s.name,
        'estado', case a.status when 'requested' then 'pedida' when 'confirmed' then 'confirmada' when 'done' then 'hecha' else 'cancelada' end,
        'por_internet', a.source = 'online', 'deposito', a.deposit_asked, 'deposito_recibido', a.deposit_ok_at is not null) x
      from appointments a join boats b on b.id = a.boat_id join clients c on c.id = b.client_id
      left join staff s on s.id = a.staff_id
      where a.mechanic_id = v_me and a.starts_at >= v_a and a.starts_at < v_b limit 2000) q;

  elsif p_what = 'deudas' then
    select jsonb_build_object('deudas', coalesce(jsonb_agg(x order by x->>'fecha'), '[]'::jsonb),
                              'total', coalesce(sum((x->>'debe')::numeric), 0)) into v_out
    from (select jsonb_build_object('factura', i.number, 'fecha', to_char(i.created_at at time zone 'America/Puerto_Rico', 'YYYY-MM-DD'),
        'cliente', c.full_name, 'total', i.total,
        'debe', i.total - coalesce((select sum(p.amount) from payments p where p.work_order_id = i.work_order_id), 0)) x
      from invoices i join work_orders w on w.id = i.work_order_id join boats b on b.id = w.boat_id join clients c on c.id = b.client_id
      where i.mechanic_id = v_me and i.paid_at is null
        and i.total > coalesce((select sum(p.amount) from payments p where p.work_order_id = i.work_order_id), 0)) q;

  elsif p_what = 'rentas' then
    select jsonb_build_object('desde', v_from, 'hasta', v_to, 'total', coalesce(sum(r.amount), 0),
      'rentas', coalesce(jsonb_agg(jsonb_build_object('fecha', r.paid_on, 'semana_del', r.week_start, 'inquilino', r.tenant, 'concepto', r.concept, 'monto', r.amount) order by r.paid_on), '[]'::jsonb))
    into v_out from rent_entries r where r.mechanic_id = v_me and r.paid_on between v_from and v_to;

  elsif p_what = 'empleadas' then
    select jsonb_build_object('desde', v_from, 'hasta', v_to, 'empleadas', coalesce(jsonb_agg(x order by (x->>'ventas')::numeric desc), '[]'::jsonb)) into v_out
    from (select jsonb_build_object('nombre', s.name,
        'trabaja_por', case when s.pay_type = 'rent' then 'renta' else 'comision' end,
        'ventas', coalesce(v.total, 0), 'propinas', coalesce(v.tips, 0), 'servicios_cobrados', coalesce(v.n, 0),
        'comision_ganada', case when s.pay_type = 'rent' then 0 else round(coalesce(v.total, 0) * s.commission_rate, 2) end,
        'renta_pagada', coalesce((select sum(r.amount) from rent_entries r where r.staff_id = s.id and r.paid_on between v_from and v_to), 0)) x
      from staff s
      left join lateral (select sum(p.amount) total, sum(p.tip) tips, count(distinct w.id) n
        from payments p join work_orders w on w.id = p.work_order_id
        where w.staff_id = s.id and p.paid_at >= v_a and p.paid_at < v_b) v on true
      where s.mechanic_id = v_me and not s.is_example) q;

  elsif p_what = 'clientas' then
    select jsonb_build_object('clientes', coalesce(jsonb_agg(x order by x->>'ultima_visita' desc nulls last), '[]'::jsonb)) into v_out
    from (select jsonb_build_object('nombre', c.full_name, 'pueblo', c.town,
        'visitas', (select count(*) from appointments a join boats b on b.id = a.boat_id where b.client_id = c.id and a.status = 'done'),
        'ultima_visita', (select to_char(max(a.starts_at) at time zone 'America/Puerto_Rico', 'YYYY-MM-DD') from appointments a join boats b on b.id = a.boat_id where b.client_id = c.id and a.status = 'done'),
        'proxima_cita', (select to_char(min(a.starts_at) at time zone 'America/Puerto_Rico', 'YYYY-MM-DD HH24:MI') from appointments a join boats b on b.id = a.boat_id where b.client_id = c.id and a.status in ('requested', 'confirmed') and a.starts_at >= now()),
        'total_pagado', (select coalesce(sum(p.amount), 0) from payments p join work_orders w on w.id = p.work_order_id join boats b on b.id = w.boat_id where b.client_id = c.id)) x
      from clients c
      where c.mechanic_id = v_me and not c.is_example
        and (coalesce(p_search, '') = '' or c.full_name ilike '%' || p_search || '%')
      limit 500) q;

  elsif p_what = 'resumen' then
    select jsonb_build_object('desde', v_from, 'hasta', v_to,
      'cobrado', coalesce(sum(p.amount), 0), 'propinas', coalesce(sum(p.tip), 0), 'pagos', count(p.*),
      'por_metodo', coalesce((select jsonb_object_agg(k, t) from (
          select case p2.method when 'ath_movil' then 'ATH Móvil' when 'cash' then 'efectivo' when 'check' then 'cheque' else 'otro' end k, sum(p2.amount) t
          from payments p2 join work_orders w2 on w2.id = p2.work_order_id join boats b2 on b2.id = w2.boat_id join clients c2 on c2.id = b2.client_id
          where c2.mechanic_id = v_me and p2.paid_at >= v_a and p2.paid_at < v_b group by 1) m), '{}'::jsonb),
      'facturado', (select coalesce(sum(i.total), 0) from invoices i where i.mechanic_id = v_me and i.created_at >= v_a and i.created_at < v_b),
      'ivu_facturado', (select coalesce(sum(i.ivu_amount), 0) from invoices i where i.mechanic_id = v_me and i.created_at >= v_a and i.created_at < v_b),
      'citas', (select jsonb_build_object('total', count(*), 'hechas', count(*) filter (where status = 'done'),
                  'canceladas', count(*) filter (where status = 'cancelled'), 'pendientes', count(*) filter (where status in ('requested', 'confirmed')))
                from appointments a where a.mechanic_id = v_me and a.starts_at >= v_a and a.starts_at < v_b),
      'rentas_cobradas', (select coalesce(sum(r.amount), 0) from rent_entries r where r.mechanic_id = v_me and r.paid_on between v_from and v_to))
    into v_out
    from payments p join work_orders w on w.id = p.work_order_id join boats b on b.id = w.boat_id join clients c on c.id = b.client_id
    where c.mechanic_id = v_me and p.paid_at >= v_a and p.paid_at < v_b;

  else
    raise exception 'Pregunta no conocida: %. Usa negocio, resumen, ventas, citas, deudas, rentas, empleadas o clientas.', p_what;
  end if;

  return v_out;
end $$;
revoke all on function public.gpt_query(text, text, date, date, text) from public;
grant execute on function public.gpt_query(text, text, date, date, text) to anon, authenticated;

-- Marcar cuándo se usó la llave (aparte, porque gpt_query es de solo leer)
create or replace function public.gpt_touch(p_key text)
returns void language sql security definer set search_path = public as $$
  update gpt_keys set last_used_at = now() where key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
$$;
revoke all on function public.gpt_touch(text) from public;
grant execute on function public.gpt_touch(text) to anon, authenticated;
