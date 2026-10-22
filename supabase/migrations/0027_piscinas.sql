-- =============================================================================
-- Nuevo oficio: PISCINAS (limpieza y mantenimiento de piscinas).
-- Cada cliente con su(s) piscina(s); limpiezas semanales, químicos, filtro y bomba.
-- La prueba (/demo) y los ejemplos de la cuenta nueva traen piscinas de ejemplo.
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================

alter table public.mechanics drop constraint if exists mechanics_business_type_check;
alter table public.mechanics add constraint mechanics_business_type_check
  check (business_type in ('marine', 'ac', 'plumbing', 'electrical', 'auto', 'general', 'beauty', 'pool'));

-- La prueba (/demo): ahora también de piscinas
create or replace function public.start_trial(p_type text default 'marine')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_type   text := case when p_type in ('marine', 'ac', 'plumbing', 'electrical', 'auto', 'general', 'pool') then p_type else 'marine' end;
  v_marine boolean := (v_type = 'marine');
  v_today  date := (now() at time zone 'America/Puerto_Rico')::date;
  -- Lo de ejemplo de cada oficio: [cosa 1, 2, 3], [cita 1, 2], [línea 1, 2, 3], próximo servicio
  c jsonb := case v_type
    when 'auto' then '{"name":"Taller de Prueba","items":[["Toyota Corolla","Toyota","Corolla",2018,"Bayamón","Marquesina"],["Ford F-150","Ford","F-150",2020,"Caguas","Frente a la casa"],["Honda CR-V","Honda","CR-V",2016,"Ponce","Estacionamiento del trabajo"]],"appts":["Cambio de aceite","Frenos chillan"],"lines":["Aceite y filtro","Pastillas de freno","Batería"],"next":"Cambio de aceite"}'
    when 'ac' then '{"name":"Negocio de Prueba","items":[["Unidad de la sala (24,000 BTU)","Mitsubishi","Mini split",2021,"Bayamón","Segundo piso"],["Unidades de la oficina (3)","Carrier","Mini split",2019,"Caguas","Oficina 204"],["Consola del cuarto","LG","Inverter",2022,"Ponce","Cuarto principal"]],"appts":["Mantenimiento de unidad","No enfría"],"lines":["Limpieza de unidad","Capacitor","Recarga de gas"],"next":"Mantenimiento de unidad"}'
    when 'plumbing' then '{"name":"Negocio de Prueba","items":[["Casa en Bayamón",null,null,null,"Bayamón","Urb. Santa Juanita"],["Apartamento en Guaynabo",null,null,null,"Guaynabo","Edificio B, apto 3"],["Local en Caguas",null,null,null,"Caguas","Al lado de la panadería"]],"appts":["Salidero en el baño","Calentador no calienta"],"lines":["Reparación de salidero","Llave de paso","Calentador de agua"],"next":"Revisión de tuberías"}'
    when 'electrical' then '{"name":"Negocio de Prueba","items":[["Casa en Bayamón",null,null,null,"Bayamón","Urb. Santa Juanita"],["Apartamento en Guaynabo",null,null,null,"Guaynabo","Edificio B, apto 3"],["Local en Caguas",null,null,null,"Caguas","Al lado de la panadería"]],"appts":["Breaker se dispara","Instalar abanico de techo"],"lines":["Instalación de abanico","Breaker 20A","Tomacorriente GFCI"],"next":"Revisión del panel eléctrico"}'
    when 'pool' then '{"name":"Negocio de Prueba","items":[["Piscina de la casa",null,null,null,"Dorado","Urb. Dorado del Mar"],["Piscina del condominio",null,null,null,"Guaynabo","Condominio Los Pinos"],["Piscina y jacuzzi",null,null,null,"Humacao","Palmas del Mar, casa 12"]],"appts":["Limpieza semanal","Agua verde"],"lines":["Limpieza semanal","Cloro y químicos","Cambio de arena del filtro"],"next":"Limpieza semanal"}'
    when 'general' then '{"name":"Negocio de Prueba","items":[["Casa en Bayamón",null,null,null,"Bayamón","Urb. Santa Juanita"],["Apartamento en Guaynabo",null,null,null,"Guaynabo","Edificio B, apto 3"],["Local en Caguas",null,null,null,"Caguas","Al lado de la panadería"]],"appts":["Reparación","Visita para estimado"],"lines":["Visita y diagnóstico","Materiales","Reparación"],"next":"Mantenimiento"}'
    else '{"name":"Taller de Prueba","items":[["La Tranquila","Grady-White","Freedom 255",2018,"Fajardo","Puerto del Rey, muelle C-42"],["Marlin Azul","Contender","35 ST",2020,"Ponce","Club Náutico de Ponce, muelle B-7"],["Brisa del Este","Robalo","R222",2019,"Fajardo","Villa Marina, guardería rack 3"]],"appts":["Servicio de 100 horas","No arranca en frío"],"lines":["Kit de servicio Yamaha 100 h","Impeller Mercury","Batería marina"],"next":"Cambio de aceite e impeller"}'
  end;
  cl uuid[] := '{}';
  it uuid[] := '{}';
  v_id uuid;
  e1 uuid;
  a1 uuid;
  w1 uuid; w2 uuid; w3 uuid;
  i integer;
begin
  if v_me is null then raise exception 'No autenticado'; end if;
  if not public.is_anonymous_user(v_me) then raise exception 'Solo para la prueba'; end if;
  if exists (select 1 from mechanics where profile_id = v_me) then return; end if;

  -- Salón de belleza / uñas / spa: su propia prueba
  if p_type = 'beauty' then
    insert into profiles (id) values (v_me) on conflict (id) do nothing;
    perform public.start_trial_beauty();
    return;
  end if;

  insert into profiles (id) values (v_me) on conflict (id) do nothing;
  update profiles set role = 'mechanic', full_name = c->>'name', phone = '787-555-0100', town = 'Bayamón',
                      trial = true, access = 'approved'
   where id = v_me;
  insert into mechanics (profile_id, business_name, ath_movil_number, labor_rate_hour, policies_text, business_type)
  values (v_me, c->>'name', '787-555-0100', 85, default_policies(), v_type);

  -- Clientes de ejemplo, cada uno con su bote / carro / equipo / propiedad
  for i in 0..2 loop
    insert into clients (mechanic_id, full_name, phone, town, notes)
    values (v_me, (array['Ana Martínez (ejemplo)', 'José Rodríguez (ejemplo)', 'Luis Ortiz (ejemplo)'])[i + 1],
            (array['787-555-0111', '939-555-0122', '787-555-0133'])[i + 1], c->'items'->i->>4, 'PRUEBA')
    returning id into v_id;
    cl := cl || v_id;
    insert into boats (client_id, name, make, model, year, location_type, town, location_notes)
    values (v_id, c->'items'->i->>0, c->'items'->i->>1, c->'items'->i->>2, (c->'items'->i->>3)::int,
            case when v_marine then (array['water_slip', 'water_slip', 'dry_storage'])[i + 1] else 'home' end,
            c->'items'->i->>4, c->'items'->i->>5)
    returning id into v_id;
    it := it || v_id;
  end loop;

  if v_marine then
    insert into engines (boat_id, position, make, model, hp, hours, fuel)
    values (it[1], 'single', 'Yamaha', 'F250', 250, 412.5, 'gas') returning id into e1;
    insert into engines (boat_id, position, make, model, hp, hours, fuel) values (it[2], 'port', 'Mercury', 'Verado 300', 300, 280, 'gas');
    insert into engines (boat_id, position, make, model, hp, hours, fuel) values (it[2], 'starboard', 'Mercury', 'Verado 300', 300, 281, 'gas');
    insert into engines (boat_id, position, make, model, hp, hours, fuel) values (it[3], 'single', 'Suzuki', 'DF200', 200, 150, 'gas');
  end if;

  -- Citas: hoy y mañana
  insert into appointments (mechanic_id, boat_id, starts_at, duration_min, status, title)
  values (v_me, it[1], ((v_today + time '09:00') at time zone 'America/Puerto_Rico'), 120, 'confirmed', c->'appts'->>0)
  returning id into a1;
  insert into appointments (mechanic_id, boat_id, starts_at, duration_min, status, title)
  values (v_me, it[3], ((v_today + 1 + time '10:00') at time zone 'America/Puerto_Rico'), 90, 'confirmed', c->'appts'->>1);

  -- Un trabajo en proceso (de la cita de hoy)
  insert into work_orders (boat_id, appointment_id, complaint, status, labor_hours, labor_rate, sea_trial_required, estimate_approved_at, estimate_approved_by)
  values (it[1], a1, c->'appts'->>0, 'in_progress', 2, 85, v_marine, now(), 'mechanic') returning id into w1;
  insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by, received_at)
  values (w1, 'part', c->'lines'->>0, 1, 120, 'mechanic', now());

  -- Uno facturado con depósito (sale en "Me deben" con su balance)
  insert into work_orders (boat_id, complaint, work_done, status, labor_hours, labor_rate, sea_trial_required, estimate_approved_at, estimate_approved_by, completed_at)
  values (it[2], c->'appts'->>1, c->'lines'->>1, 'done', 3, 85, false, now() - interval '5 days', 'mechanic', now() - interval '2 days')
  returning id into w2;
  insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by, received_at)
  values (w2, 'part', c->'lines'->>1, 2, 45, 'mechanic', now());
  insert into payments (work_order_id, amount, method, paid_at) values (w2, 100, 'ath_movil', now() - interval '5 days');
  perform public.create_invoice(w2);

  -- Uno ya pagado (sale en "Cobrado este mes")
  insert into work_orders (boat_id, complaint, work_done, status, labor_hours, labor_rate, sea_trial_required, estimate_approved_at, estimate_approved_by, completed_at)
  values (it[3], c->'lines'->>2, c->'lines'->>2, 'done', 1, 85, false, now() - interval '3 days', 'mechanic', now() - interval '1 day')
  returning id into w3;
  insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by, received_at)
  values (w3, 'part', c->'lines'->>2, 1, 160, 'mechanic', now());
  perform public.create_invoice(w3);
  insert into payments (work_order_id, amount, method)
  select w3, total, 'cash' from invoices where work_order_id = w3;

  -- Le toca servicio pronto
  insert into maintenance_schedules (boat_id, engine_id, service_type, due_date, status)
  values (it[1], e1, c->>'next', v_today + 10, 'pending');
end $$;
revoke all on function public.start_trial(text) from public, anon;
grant execute on function public.start_trial(text) to authenticated;

-- Los ejemplos de la cuenta nueva: ahora también de piscinas
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
    when 'pool' then '{"items":[["Piscina de la casa",null,null,null,"Dorado","Urb. Dorado del Mar"],["Piscina del condominio",null,null,null,"Guaynabo","Condominio Los Pinos"],["Piscina y jacuzzi",null,null,null,"Humacao","Palmas del Mar, casa 12"]],"appts":["Limpieza semanal","Agua verde"],"lines":["Limpieza semanal","Cloro y químicos","Cambio de arena del filtro"],"next":"Limpieza semanal"}'
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

-- El aviso de registro nuevo dice "Piscinas"
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
               when 'plumbing' then 'Plomería' when 'electrical' then 'Electricidad' when 'auto' then 'Mecánica de autos' when 'pool' then 'Piscinas' else 'Otro servicio' end;
  insert into admin_signups (profile_id, full_name, business_name, business_type, email, phone, town)
  values (new.profile_id, p.full_name, new.business_name, new.business_type, v_email, p.phone, p.town);
  perform public.notify_admin('Cuenta nueva: ' || coalesce(new.business_name, p.full_name, 'alguien'),
    concat_ws(' · ', p.full_name, v_label, p.phone, v_email), 'tada');
  return new;
end $$;
revoke all on function public.notify_signup() from public, anon, authenticated;
