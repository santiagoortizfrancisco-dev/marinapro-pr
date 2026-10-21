-- =============================================================================
-- Link de prueba (/demo): cualquiera entra al app sin registrarse.
-- Cada visitante recibe su PROPIO taller de ejemplo (usuario anónimo de Supabase), con clientes,
-- botes, citas y facturas de mentira. No ve datos reales de nadie, no queda "por aprobar",
-- no sale en Admin ni en el directorio, y se borra solo a los 7 días.
-- Requiere: Supabase > Authentication > Sign In / Providers > "Allow anonymous sign-ins" = ON.
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================

alter table public.profiles add column if not exists trial boolean not null default false;

-- ¿El usuario que llama es un visitante anónimo (de prueba)?
create or replace function public.is_anonymous_user(p_user uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select coalesce((select u.is_anonymous from auth.users u where u.id = p_user), false)
$$;
revoke all on function public.is_anonymous_user(uuid) from public, anon, authenticated;

-- Nadie se aprueba solo… excepto la prueba (que es de mentira y está aparte)
create or replace function public.guard_profile_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.access is distinct from old.access and not public.is_app_admin()
     and not (new.trial and public.is_anonymous_user(new.id)) then
    new.access := old.access;
  end if;
  return new;
end $$;

-- Arma el taller de prueba del visitante (solo la primera vez)
create or replace function public.start_trial()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_today  date := (now() at time zone 'America/Puerto_Rico')::date;
  c1 uuid; c2 uuid; c3 uuid;
  b1 uuid; b2 uuid; b3 uuid;
  e1 uuid;
  a1 uuid;
  w1 uuid; w2 uuid; w3 uuid;
begin
  if v_me is null then raise exception 'No autenticado'; end if;
  if not public.is_anonymous_user(v_me) then raise exception 'Solo para la prueba'; end if;
  if exists (select 1 from mechanics where profile_id = v_me) then return; end if;

  insert into profiles (id) values (v_me) on conflict (id) do nothing;
  update profiles set role = 'mechanic', full_name = 'Taller de Prueba', phone = '787-555-0100', town = 'Fajardo',
                      trial = true, access = 'approved'
   where id = v_me;
  insert into mechanics (profile_id, business_name, ath_movil_number, labor_rate_hour, policies_text)
  values (v_me, 'Taller de Prueba', '787-555-0100', 85, default_policies());

  -- Clientes y botes de ejemplo
  insert into clients (mechanic_id, full_name, phone, town, notes)
  values (v_me, 'Ana Martínez (ejemplo)', '787-555-0111', 'Fajardo', 'PRUEBA') returning id into c1;
  insert into clients (mechanic_id, full_name, phone, town, notes)
  values (v_me, 'José Rodríguez (ejemplo)', '939-555-0122', 'Ponce', 'PRUEBA') returning id into c2;
  insert into clients (mechanic_id, full_name, phone, town, notes)
  values (v_me, 'Luis Ortiz (ejemplo)', '787-555-0133', 'Ceiba', 'PRUEBA') returning id into c3;

  insert into boats (client_id, name, make, model, year, length_ft, location_type, marina_name, slip_number, town)
  values (c1, 'La Tranquila', 'Grady-White', 'Freedom 255', 2018, 25, 'water_slip', 'Puerto del Rey', 'C-42', 'Fajardo') returning id into b1;
  insert into boats (client_id, name, make, model, year, length_ft, location_type, marina_name, slip_number, town)
  values (c2, 'Marlin Azul', 'Contender', '35 ST', 2020, 35, 'water_slip', 'Club Náutico de Ponce', 'B-7', 'Ponce') returning id into b2;
  insert into boats (client_id, name, make, model, year, length_ft, location_type, marina_name, town, location_notes)
  values (c3, 'Brisa del Este', 'Robalo', 'R222', 2019, 22, 'dry_storage', 'Villa Marina', 'Fajardo', 'Guardería, rack 3') returning id into b3;

  insert into engines (boat_id, position, make, model, hp, hours, fuel)
  values (b1, 'single', 'Yamaha', 'F250', 250, 412.5, 'gas') returning id into e1;
  insert into engines (boat_id, position, make, model, hp, hours, fuel) values (b2, 'port', 'Mercury', 'Verado 300', 300, 280, 'gas');
  insert into engines (boat_id, position, make, model, hp, hours, fuel) values (b2, 'starboard', 'Mercury', 'Verado 300', 300, 281, 'gas');
  insert into engines (boat_id, position, make, model, hp, hours, fuel) values (b3, 'single', 'Suzuki', 'DF200', 200, 150, 'gas');

  -- Citas: hoy y mañana
  insert into appointments (mechanic_id, boat_id, starts_at, duration_min, status, title)
  values (v_me, b1, ((v_today + time '09:00') at time zone 'America/Puerto_Rico'), 120, 'confirmed', 'Servicio de 100 horas')
  returning id into a1;
  insert into appointments (mechanic_id, boat_id, starts_at, duration_min, status, title)
  values (v_me, b3, ((v_today + 1 + time '10:00') at time zone 'America/Puerto_Rico'), 90, 'confirmed', 'No arranca en frío');

  -- Un trabajo en proceso (de la cita de hoy)
  insert into work_orders (boat_id, appointment_id, complaint, status, labor_hours, labor_rate, estimate_approved_at, estimate_approved_by)
  values (b1, a1, 'Le toca el servicio de 100 horas', 'in_progress', 2, 85, now(), 'mechanic') returning id into w1;
  insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by, received_at)
  values (w1, 'part', 'Kit de servicio Yamaha 100 h', 1, 120, 'mechanic', now());

  -- Uno facturado con depósito (sale en "Me deben" con su balance)
  insert into work_orders (boat_id, complaint, work_done, status, labor_hours, labor_rate, sea_trial_required, estimate_approved_at, estimate_approved_by, completed_at)
  values (b2, 'Bomba de agua no tira', 'Cambio de impeller en los dos motores', 'done', 3, 85, false, now() - interval '5 days', 'mechanic', now() - interval '2 days')
  returning id into w2;
  insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by, received_at)
  values (w2, 'part', 'Impeller Mercury', 2, 45, 'mechanic', now());
  insert into payments (work_order_id, amount, method, paid_at) values (w2, 100, 'ath_movil', now() - interval '5 days');
  perform public.create_invoice(w2);

  -- Uno ya pagado (sale en "Cobrado este mes")
  insert into work_orders (boat_id, complaint, work_done, status, labor_hours, labor_rate, sea_trial_required, estimate_approved_at, estimate_approved_by, completed_at)
  values (b3, 'Batería no carga', 'Batería nueva y limpieza de terminales', 'done', 1, 85, false, now() - interval '3 days', 'mechanic', now() - interval '1 day')
  returning id into w3;
  insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by, received_at)
  values (w3, 'part', 'Batería marina', 1, 160, 'mechanic', now());
  perform public.create_invoice(w3);
  insert into payments (work_order_id, amount, method)
  select w3, total, 'cash' from invoices where work_order_id = w3;

  -- Le toca servicio pronto
  insert into maintenance_schedules (boat_id, engine_id, service_type, due_date, status)
  values (b1, e1, 'Cambio de aceite e impeller', v_today + 10, 'pending');
end $$;
revoke all on function public.start_trial() from public, anon;
grant execute on function public.start_trial() to authenticated;

-- Admin: las pruebas no cuentan como mecánicos
create or replace function public.admin_overview()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Solo para el administrador'; end if;
  return coalesce((
    select json_agg(row_to_json(x) order by x.last_activity desc nulls last, x.created_at desc)
    from (
      select
        p.id,
        p.email,
        p.full_name,
        m.business_name,
        p.created_at,
        u.last_sign_in_at,
        (select count(*) from clients c where c.mechanic_id = p.id)                                         as clients,
        (select count(*) from boats b join clients c on c.id = b.client_id where c.mechanic_id = p.id)       as boats,
        (select count(*) from appointments a where a.mechanic_id = p.id)                                     as appointments,
        (select count(*) from work_orders w join boats b on b.id = w.boat_id join clients c on c.id = b.client_id
          where c.mechanic_id = p.id)                                                                        as work_orders,
        (select count(*) from invoices i where i.mechanic_id = p.id)                                         as invoices,
        (select coalesce(sum(i.total), 0) from invoices i where i.mechanic_id = p.id and i.paid_at is not null) as paid_total,
        greatest(
          (select max(c.created_at) from clients c where c.mechanic_id = p.id),
          (select max(a.created_at) from appointments a where a.mechanic_id = p.id),
          (select max(w.created_at) from work_orders w join boats b on b.id = w.boat_id join clients c on c.id = b.client_id where c.mechanic_id = p.id),
          (select max(i.created_at) from invoices i where i.mechanic_id = p.id)
        )                                                                                                    as last_activity
      from profiles p
      left join mechanics m on m.profile_id = p.id
      left join auth.users u on u.id = p.id
      where (p.role = 'mechanic' or p.role is null) and not p.trial and not coalesce(u.is_anonymous, false)
    ) x
  ), '[]'::json);
end $$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- Admin: cuántas pruebas se han abierto (para saber si la gente la usa)
create or replace function public.admin_trial_count()
returns json language sql stable security definer set search_path = public, auth as $$
  select case when public.is_app_admin() then json_build_object(
    'last_7_days', (select count(*) from profiles where trial and created_at > now() - interval '7 days'),
    'today', (select count(*) from profiles where trial and created_at > date_trunc('day', now() at time zone 'America/Puerto_Rico') at time zone 'America/Puerto_Rico'))
  else null end
$$;
revoke all on function public.admin_trial_count() from public, anon;
grant execute on function public.admin_trial_count() to authenticated;

-- Borrar las pruebas de más de 7 días (todo lo de ellas se borra en cascada)
create or replace function public.purge_old_trials()
returns integer language plpgsql security definer set search_path = public, auth as $$
declare v_n integer;
begin
  delete from auth.users where is_anonymous and created_at < now() - interval '7 days';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.purge_old_trials() from public, anon, authenticated;

-- Todos los días a las 4:00 AM de PR (8:00 UTC), si pg_cron está prendido en el proyecto
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'borrar-pruebas';
    perform cron.schedule('borrar-pruebas', '0 8 * * *', 'select public.purge_old_trials()');
  end if;
end $$;
