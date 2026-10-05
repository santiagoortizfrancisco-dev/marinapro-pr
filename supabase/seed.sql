-- MarinaPro PR — datos de PRUEBA (solo desarrollo, nunca en producción)
--
-- Cómo usarlo:
--   1. Entra a la app con tu email y escoge "Soy mecánico".
--   2. Cambia el email de abajo por ese mismo email.
--   3. Corre este archivo en Supabase > SQL Editor.
-- Crea 3 clientes de prueba (sin cuenta todavía), 4 botes, motores, citas, un trabajo y mantenimientos.
-- Se puede correr de nuevo: primero borra los clientes de prueba que creó antes (notes = 'SEED').

do $$
declare
  v_email     text := 'CAMBIA-ESTE@email.com';
  v_mech      uuid;
  c_ana       uuid; c_jose uuid; c_luis uuid;
  b_tranquila uuid; b_boricua uuid; b_marlin uuid; b_brisa uuid;
  e_port      uuid;
  v_appt      uuid;
  v_wo        uuid;
  v_today     date := (now() at time zone 'America/Puerto_Rico')::date;
begin
  select p.id into v_mech
    from profiles p join mechanics m on m.profile_id = p.id
   where lower(p.email) = lower(v_email);
  if v_mech is null then
    raise exception 'No hay un mecánico con el email %. Entra a la app primero y escoge "Soy mecánico".', v_email;
  end if;

  delete from clients where mechanic_id = v_mech and notes = 'SEED';

  update mechanics set ath_movil_number = coalesce(ath_movil_number, '787-555-0100'),
                       labor_rate_hour = case when labor_rate_hour = 0 then 85 else labor_rate_hour end
   where profile_id = v_mech;

  insert into clients (mechanic_id, full_name, phone, email, town, notes)
  values (v_mech, 'Ana Martínez Colón', '787-555-0111', 'ana.prueba@ejemplo.com', 'Fajardo', 'SEED') returning id into c_ana;
  insert into clients (mechanic_id, full_name, phone, email, town, notes)
  values (v_mech, 'José Rodríguez Vega', '939-555-0122', 'jose.prueba@ejemplo.com', 'Ponce', 'SEED') returning id into c_jose;
  insert into clients (mechanic_id, full_name, phone, email, town, notes)
  values (v_mech, 'Luis Ortiz Santiago', '787-555-0133', null, 'Ceiba', 'SEED') returning id into c_luis;

  -- Botes
  insert into boats (client_id, name, make, model, year, length_ft, location_type, marina_name, slip_number, town, lat, lng)
  values (c_ana, 'La Tranquila', 'Grady-White', 'Freedom 255', 2018, 25, 'water_slip', 'Puerto del Rey', 'C-42', 'Fajardo', 18.2868, -65.6340)
  returning id into b_tranquila;
  insert into boats (client_id, name, make, model, year, length_ft, location_type, marina_name, slip_number, town, lat, lng)
  values (c_ana, 'Pa'' la Playa', 'Boston Whaler', 'Montauk 170', 2015, 17, 'trailer', null, null, 'Fajardo', null, null)
  returning id into b_boricua;
  insert into boats (client_id, name, make, model, year, length_ft, location_type, marina_name, slip_number, town, lat, lng, location_notes)
  values (c_jose, 'Marlin Azul', 'Contender', '35 ST', 2020, 35, 'water_slip', 'Club Náutico de Ponce', 'B-7', 'Ponce', 17.9680, -66.6170, 'Muelle B, al lado de la rampa')
  returning id into b_marlin;
  insert into boats (client_id, name, make, model, year, length_ft, location_type, marina_name, town, location_notes)
  values (c_luis, 'Brisa del Este', 'Robalo', 'R222', 2019, 22, 'dry_storage', 'Villa Marina', 'Fajardo', 'Guardería, rack 3 nivel 2')
  returning id into b_brisa;

  -- Motores
  insert into engines (boat_id, position, make, model, hp, serial_number, hours, fuel)
  values (b_tranquila, 'port', 'Yamaha', 'F200', 200, '6AW-1012345', 412.5, 'gas') returning id into e_port;
  insert into engines (boat_id, position, make, model, hp, serial_number, hours, fuel)
  values (b_tranquila, 'starboard', 'Yamaha', 'F200', 200, '6AW-1012346', 410.0, 'gas');
  insert into engines (boat_id, position, make, model, hp, serial_number, hours, fuel)
  values (b_boricua, 'single', 'Mercury', 'FourStroke 90', 90, '2B-998877', 640.0, 'gas');
  insert into engines (boat_id, position, make, model, hp, serial_number, hours, fuel) values
    (b_marlin, 'port', 'Mercury', 'Verado 400', 400, '3C-112233', 285.0, 'gas'),
    (b_marlin, 'starboard', 'Mercury', 'Verado 400', 400, '3C-112234', 283.5, 'gas');
  insert into engines (boat_id, position, make, model, hp, serial_number, hours, fuel)
  values (b_brisa, 'single', 'Suzuki', 'DF250', 250, '25003F-554433', 198.0, 'gas');

  -- Solicitud del cliente y citas (hora de Puerto Rico)
  insert into service_requests (boat_id, client_id, description, urgency, status)
  values (b_marlin, c_jose, 'El motor de babor no arranca en frío y da alarma de presión de aceite.', 'high', 'scheduled');

  insert into appointments (mechanic_id, boat_id, starts_at, duration_min, status, notes)
  values (v_mech, b_tranquila, (v_today + time '09:00') at time zone 'America/Puerto_Rico', 120, 'confirmed', 'Servicio de 100 horas, ambos motores')
  returning id into v_appt;
  insert into appointments (mechanic_id, boat_id, starts_at, duration_min, status, notes) values
    (v_mech, b_marlin, (v_today + 1 + time '13:30') at time zone 'America/Puerto_Rico', 90, 'requested', 'Diagnóstico motor de babor'),
    (v_mech, b_brisa,  (v_today + 3 + time '08:00') at time zone 'America/Puerto_Rico', 60, 'confirmed', 'Cambio de impeller');

  -- Un trabajo en progreso con piezas (una la trajo el cliente)
  insert into work_orders (boat_id, appointment_id, diagnosis, status, labor_hours, labor_rate)
  values (b_tranquila, v_appt, 'Servicio de 100 horas: aceite, filtros, ánodos y bujías.', 'in_progress', 3.5, 85)
  returning id into v_wo;
  insert into work_order_parts (work_order_id, description, part_number, qty, unit_cost, supplied_by, supplier) values
    (v_wo, 'Kit de mantenimiento 100 h Yamaha F200', '90430-08003', 2, 89.95, 'mechanic', 'West Marine San Juan'),
    (v_wo, 'Ánodos de zinc', '6AW-45251-00', 4, 18.50, 'mechanic', 'Marine Max Fajardo'),
    (v_wo, 'Aceite Yamalube 10W-30 (galón)', null, 4, 0, 'client', null);

  -- Mantenimientos próximos
  insert into maintenance_schedules (boat_id, engine_id, service_type, due_date, due_hours) values
    (b_tranquila, e_port, 'Cambio de impeller', v_today + 14, 500),
    (b_brisa, null, 'Pintura de fondo (antifouling)', v_today + 45, null),
    (b_boricua, null, 'Renovar marbete', v_today + 3, null);

  raise notice 'Listo: datos de prueba creados para %', v_email;
end $$;
