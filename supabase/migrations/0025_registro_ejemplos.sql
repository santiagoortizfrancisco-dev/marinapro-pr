-- =============================================================================
-- Registro rápido con ejemplos y aviso al administrador
--  1) La cuenta nueva empieza con datos de EJEMPLO de su oficio (para ver cómo funciona);
--     se borran con un botón ("Borrar ejemplos").
--  2) Cuando alguien termina de registrarse (escoge su oficio), al administrador le llega
--     el aviso al teléfono y queda en Admin → Registros nuevos: nombre, negocio, oficio,
--     email y teléfono.
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================

alter table public.clients add column if not exists is_example boolean not null default false;
alter table public.staff   add column if not exists is_example boolean not null default false;

-- ---------------------------------------------------------------------------
-- 1) Ejemplos en una cuenta de verdad
-- ---------------------------------------------------------------------------
create or replace function public.load_examples()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_type   text;
  v_marine boolean;
  v_today  date := (now() at time zone 'America/Puerto_Rico')::date;
  c jsonb;
  it uuid[] := '{}';
  v_id uuid; e1 uuid; a1 uuid; w1 uuid; w2 uuid; w3 uuid;
  s1 uuid; s2 uuid; cl uuid; bt uuid; a uuid; w uuid;
  i integer;
  names text[] := array['Ana Martínez (ejemplo)', 'Karla Rivera (ejemplo)', 'Yesenia Ortiz (ejemplo)', 'Mari Santiago (ejemplo)'];
  phones text[] := array['787-555-0111', '939-555-0122', '787-555-0133', '787-555-0144'];
  svc text[] := array['Uñas acrílicas (set completo)', 'Pedicura spa', 'Relleno de acrílico', 'Manicura con gel'];
  price numeric[] := array[40, 35, 30, 25];
  mins int[] := array[90, 60, 60, 45];
begin
  if v_me is null then raise exception 'No autenticado'; end if;
  if public.is_anonymous_user(v_me) then return; end if;
  select business_type into v_type from mechanics where profile_id = v_me;
  if v_type is null then return; end if;
  -- Solo en una cuenta que todavía no tiene clientes (no se mezclan con los de verdad)
  if exists (select 1 from clients where mechanic_id = v_me) then return; end if;

  if v_type = 'beauty' then
    perform public.seed_beauty_services(v_me);
    insert into staff (mechanic_id, name, color, commission_rate, is_example) values (v_me, 'Yari (ejemplo)', '#db2777', 0.40, true) returning id into s1;
    insert into staff (mechanic_id, name, color, commission_rate, is_example) values (v_me, 'Kamila (ejemplo)', '#7c3aed', 0.35, true) returning id into s2;
    for i in 1..4 loop
      insert into clients (mechanic_id, full_name, phone, notes, is_example)
      values (v_me, names[i], phones[i], case i when 1 then 'Le gusta el almendrado largo.' when 2 then 'Tinte: 6.1 + 20 vol.' else null end, true)
      returning id into cl;
      insert into boats (client_id, name, location_type) values (cl, names[i], 'home') returning id into bt;
      insert into appointments (mechanic_id, boat_id, staff_id, starts_at, duration_min, status, title)
      values (v_me, bt, case when i % 2 = 1 then s1 else s2 end,
              ((v_today + (i > 2)::int + (time '09:00' + (i - 1) * interval '90 minutes')) at time zone 'America/Puerto_Rico'),
              mins[i], 'confirmed', svc[i])
      returning id into a;
      insert into work_orders (boat_id, appointment_id, staff_id, complaint, status, labor_hours, labor_rate, sea_trial_required, estimate_approved_at, estimate_approved_by)
      values (bt, a, case when i % 2 = 1 then s1 else s2 end, svc[i], 'approved', 0, 0, false, now(), 'mechanic') returning id into w;
      insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by) values (w, 'service', svc[i], 1, 0, 'mechanic');
      -- Una visita pasada ya cobrada (historial, comisiones y Cobrado)
      insert into appointments (mechanic_id, boat_id, staff_id, starts_at, duration_min, status, title)
      values (v_me, bt, case when i % 2 = 1 then s1 else s2 end, now() - (i * interval '6 days'), mins[i], 'done', svc[i]) returning id into a;
      insert into work_orders (boat_id, appointment_id, staff_id, complaint, status, labor_hours, labor_rate, sea_trial_required, estimate_approved_at, estimate_approved_by, completed_at)
      values (bt, a, case when i % 2 = 1 then s1 else s2 end, svc[i], 'done', 0, 0, false, now() - (i * interval '6 days'), 'mechanic', now() - (i * interval '6 days')) returning id into w;
      insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by) values (w, 'service', svc[i], 1, price[i], 'mechanic');
      perform public.create_invoice(w);
      if i < 4 then
        insert into payments (work_order_id, amount, method, tip, paid_at)
        select w, total, (array['ath_movil', 'cash', 'ath_movil'])[i], (array[5, 0, 10])[i], now() - (i * interval '6 days') from invoices where work_order_id = w;
      end if;
    end loop;
    return;
  end if;

  -- Los demás oficios: 3 clientes con su bote / carro / equipo / propiedad, citas y cobros
  v_marine := (v_type = 'marine');
  c := case v_type
    when 'auto' then '{"items":[["Toyota Corolla","Toyota","Corolla",2018,"Bayamón","Marquesina"],["Ford F-150","Ford","F-150",2020,"Caguas","Frente a la casa"],["Honda CR-V","Honda","CR-V",2016,"Ponce","Estacionamiento del trabajo"]],"appts":["Cambio de aceite","Frenos chillan"],"lines":["Aceite y filtro","Pastillas de freno","Batería"],"next":"Cambio de aceite"}'
    when 'ac' then '{"items":[["Unidad de la sala (24,000 BTU)","Mitsubishi","Mini split",2021,"Bayamón","Segundo piso"],["Unidades de la oficina (3)","Carrier","Mini split",2019,"Caguas","Oficina 204"],["Consola del cuarto","LG","Inverter",2022,"Ponce","Cuarto principal"]],"appts":["Mantenimiento de unidad","No enfría"],"lines":["Limpieza de unidad","Capacitor","Recarga de gas"],"next":"Mantenimiento de unidad"}'
    when 'plumbing' then '{"items":[["Casa en Bayamón",null,null,null,"Bayamón","Urb. Santa Juanita"],["Apartamento en Guaynabo",null,null,null,"Guaynabo","Edificio B, apto 3"],["Local en Caguas",null,null,null,"Caguas","Al lado de la panadería"]],"appts":["Salidero en el baño","Calentador no calienta"],"lines":["Reparación de salidero","Llave de paso","Calentador de agua"],"next":"Revisión de tuberías"}'
    when 'electrical' then '{"items":[["Casa en Bayamón",null,null,null,"Bayamón","Urb. Santa Juanita"],["Apartamento en Guaynabo",null,null,null,"Guaynabo","Edificio B, apto 3"],["Local en Caguas",null,null,null,"Caguas","Al lado de la panadería"]],"appts":["Breaker se dispara","Instalar abanico de techo"],"lines":["Instalación de abanico","Breaker 20A","Tomacorriente GFCI"],"next":"Revisión del panel eléctrico"}'
    when 'general' then '{"items":[["Casa en Bayamón",null,null,null,"Bayamón","Urb. Santa Juanita"],["Apartamento en Guaynabo",null,null,null,"Guaynabo","Edificio B, apto 3"],["Local en Caguas",null,null,null,"Caguas","Al lado de la panadería"]],"appts":["Reparación","Visita para estimado"],"lines":["Visita y diagnóstico","Materiales","Reparación"],"next":"Mantenimiento"}'
    else '{"items":[["La Tranquila","Grady-White","Freedom 255",2018,"Fajardo","Puerto del Rey, muelle C-42"],["Marlin Azul","Contender","35 ST",2020,"Ponce","Club Náutico de Ponce, muelle B-7"],["Brisa del Este","Robalo","R222",2019,"Fajardo","Villa Marina, guardería rack 3"]],"appts":["Servicio de 100 horas","No arranca en frío"],"lines":["Kit de servicio Yamaha 100 h","Impeller Mercury","Batería marina"],"next":"Cambio de aceite e impeller"}'
  end;

  for i in 0..2 loop
    insert into clients (mechanic_id, full_name, phone, town, notes, is_example)
    values (v_me, (array['Ana Martínez (ejemplo)', 'José Rodríguez (ejemplo)', 'Luis Ortiz (ejemplo)'])[i + 1],
            (array['787-555-0111', '939-555-0122', '787-555-0133'])[i + 1], c->'items'->i->>4, null, true)
    returning id into v_id;
    insert into boats (client_id, name, make, model, year, location_type, town, location_notes)
    values (v_id, c->'items'->i->>0, c->'items'->i->>1, c->'items'->i->>2, (c->'items'->i->>3)::int,
            case when v_marine then (array['water_slip', 'water_slip', 'dry_storage'])[i + 1] else 'home' end,
            c->'items'->i->>4, c->'items'->i->>5)
    returning id into v_id;
    it := it || v_id;
  end loop;

  if v_marine then
    insert into engines (boat_id, position, make, model, hp, hours, fuel) values (it[1], 'single', 'Yamaha', 'F250', 250, 412.5, 'gas') returning id into e1;
    insert into engines (boat_id, position, make, model, hp, hours, fuel) values (it[2], 'port', 'Mercury', 'Verado 300', 300, 280, 'gas');
    insert into engines (boat_id, position, make, model, hp, hours, fuel) values (it[2], 'starboard', 'Mercury', 'Verado 300', 300, 281, 'gas');
  end if;

  insert into appointments (mechanic_id, boat_id, starts_at, duration_min, status, title)
  values (v_me, it[1], ((v_today + time '09:00') at time zone 'America/Puerto_Rico'), 120, 'confirmed', c->'appts'->>0) returning id into a1;
  insert into appointments (mechanic_id, boat_id, starts_at, duration_min, status, title)
  values (v_me, it[3], ((v_today + 1 + time '10:00') at time zone 'America/Puerto_Rico'), 90, 'confirmed', c->'appts'->>1);

  insert into work_orders (boat_id, appointment_id, complaint, status, labor_hours, labor_rate, sea_trial_required, estimate_approved_at, estimate_approved_by)
  values (it[1], a1, c->'appts'->>0, 'in_progress', 2, 85, v_marine, now(), 'mechanic') returning id into w1;
  insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by, received_at) values (w1, 'part', c->'lines'->>0, 1, 120, 'mechanic', now());

  insert into work_orders (boat_id, complaint, work_done, status, labor_hours, labor_rate, sea_trial_required, estimate_approved_at, estimate_approved_by, completed_at)
  values (it[2], c->'appts'->>1, c->'lines'->>1, 'done', 3, 85, false, now() - interval '5 days', 'mechanic', now() - interval '2 days') returning id into w2;
  insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by, received_at) values (w2, 'part', c->'lines'->>1, 2, 45, 'mechanic', now());
  insert into payments (work_order_id, amount, method, paid_at) values (w2, 100, 'ath_movil', now() - interval '5 days');
  perform public.create_invoice(w2);

  insert into work_orders (boat_id, complaint, work_done, status, labor_hours, labor_rate, sea_trial_required, estimate_approved_at, estimate_approved_by, completed_at)
  values (it[3], c->'lines'->>2, c->'lines'->>2, 'done', 1, 85, false, now() - interval '3 days', 'mechanic', now() - interval '1 day') returning id into w3;
  insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by, received_at) values (w3, 'part', c->'lines'->>2, 1, 160, 'mechanic', now());
  perform public.create_invoice(w3);
  insert into payments (work_order_id, amount, method) select w3, total, 'cash' from invoices where work_order_id = w3;

  insert into maintenance_schedules (boat_id, engine_id, service_type, due_date, status) values (it[1], e1, c->>'next', v_today + 10, 'pending');
end $$;
revoke all on function public.load_examples() from public, anon;
grant execute on function public.load_examples() to authenticated;

-- Borrar los ejemplos (con todo lo de ellos); si no quedan facturas, la numeración vuelve a #0001
create or replace function public.clear_examples()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'No autenticado'; end if;
  delete from clients where mechanic_id = v_me and is_example;
  delete from staff where mechanic_id = v_me and is_example;
  if not exists (select 1 from invoices where mechanic_id = v_me) then
    update mechanics set next_invoice_number = 1 where profile_id = v_me;
  end if;
end $$;
revoke all on function public.clear_examples() from public, anon;
grant execute on function public.clear_examples() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Registros nuevos: aviso al administrador (teléfono y Admin)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_signups (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid references public.profiles(id) on delete set null,
  full_name      text,
  business_name  text,
  business_type  text,
  email          text,
  phone          text,
  town           text,
  created_at     timestamptz not null default now(),
  seen_at        timestamptz
);
alter table public.admin_signups enable row level security;  -- sin políticas: solo por las funciones de admin
grant select, insert, update, delete on public.admin_signups to authenticated;

create or replace function public.notify_signup()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p profiles%rowtype;
  v_email text;
  v_label text;
begin
  -- Cuando termina de registrarse: escoge su oficio por primera vez (las pruebas del /demo no cuentan)
  if old.business_type_set or not new.business_type_set then return new; end if;
  select * into p from profiles where id = new.profile_id;
  if coalesce(p.trial, false) or public.is_anonymous_user(new.profile_id) then return new; end if;
  select email into v_email from auth.users where id = new.profile_id;
  v_label := case new.business_type when 'beauty' then 'Salón / uñas / spa' when 'marine' then 'Botes' when 'ac' then 'Aire acondicionado'
               when 'plumbing' then 'Plomería' when 'electrical' then 'Electricidad' when 'auto' then 'Mecánica de autos' else 'Otro servicio' end;
  insert into admin_signups (profile_id, full_name, business_name, business_type, email, phone, town)
  values (new.profile_id, p.full_name, new.business_name, new.business_type, v_email, p.phone, p.town);
  perform public.notify_admin('Cuenta nueva: ' || coalesce(new.business_name, p.full_name, 'alguien'),
    concat_ws(' · ', p.full_name, v_label, p.phone, v_email), 'tada');
  return new;
end $$;
revoke all on function public.notify_signup() from public, anon, authenticated;
drop trigger if exists mechanics_notify_signup on public.mechanics;
create trigger mechanics_notify_signup after update on public.mechanics
  for each row execute function public.notify_signup();

-- El aviso viejo (al crear la fila, antes de saber el oficio) ya no hace falta: este lo reemplaza
drop trigger if exists mechanics_notify_new on public.mechanics;

create or replace function public.admin_new_signups()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Solo para el administrador'; end if;
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from (select * from admin_signups order by created_at desc limit 100) s), '[]'::jsonb);
end $$;
revoke all on function public.admin_new_signups() from public, anon;
grant execute on function public.admin_new_signups() to authenticated;

create or replace function public.admin_unseen_signups()
returns integer language sql stable security definer set search_path = public as $$
  select case when public.is_app_admin() then (select count(*)::int from admin_signups where seen_at is null) else 0 end
$$;
revoke all on function public.admin_unseen_signups() from public, anon;
grant execute on function public.admin_unseen_signups() to authenticated;

create or replace function public.admin_mark_signups_seen()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Solo para el administrador'; end if;
  update admin_signups set seen_at = now() where seen_at is null;
end $$;
revoke all on function public.admin_mark_signups_seen() from public, anon;
grant execute on function public.admin_mark_signups_seen() to authenticated;
