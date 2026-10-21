-- =============================================================================
-- FacturaFácil PR: el app sirve para todo tipo de servicio en la calle.
-- Cada negocio dice a qué se dedica (botes, aire acondicionado, plomería, electricidad, autos u otro)
-- y el app usa sus palabras. Los que ya usan el app quedan como "botes" (no les cambia nada).
-- No crea tablas nuevas. Se puede correr más de una vez sin romper nada.
-- =============================================================================

alter table public.mechanics add column if not exists business_type text not null default 'marine';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mechanics_business_type_check') then
    alter table public.mechanics add constraint mechanics_business_type_check
      check (business_type in ('marine', 'ac', 'plumbing', 'electrical', 'auto', 'general'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Prueba (/demo) del oficio que escoja el visitante
-- ---------------------------------------------------------------------------
drop function if exists public.start_trial();
create or replace function public.start_trial(p_type text default 'marine')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_type   text := case when p_type in ('marine', 'ac', 'plumbing', 'electrical', 'auto', 'general') then p_type else 'marine' end;
  v_marine boolean := (v_type = 'marine');
  v_today  date := (now() at time zone 'America/Puerto_Rico')::date;
  -- Lo de ejemplo de cada oficio: [cosa 1, 2, 3], [cita 1, 2], [línea 1, 2, 3], próximo servicio
  c jsonb := case v_type
    when 'auto' then '{"name":"Taller de Prueba","items":[["Toyota Corolla","Toyota","Corolla",2018,"Bayamón","Marquesina"],["Ford F-150","Ford","F-150",2020,"Caguas","Frente a la casa"],["Honda CR-V","Honda","CR-V",2016,"Ponce","Estacionamiento del trabajo"]],"appts":["Cambio de aceite","Frenos chillan"],"lines":["Aceite y filtro","Pastillas de freno","Batería"],"next":"Cambio de aceite"}'
    when 'ac' then '{"name":"Negocio de Prueba","items":[["Unidad de la sala (24,000 BTU)","Mitsubishi","Mini split",2021,"Bayamón","Segundo piso"],["Unidades de la oficina (3)","Carrier","Mini split",2019,"Caguas","Oficina 204"],["Consola del cuarto","LG","Inverter",2022,"Ponce","Cuarto principal"]],"appts":["Mantenimiento de unidad","No enfría"],"lines":["Limpieza de unidad","Capacitor","Recarga de gas"],"next":"Mantenimiento de unidad"}'
    when 'plumbing' then '{"name":"Negocio de Prueba","items":[["Casa en Bayamón",null,null,null,"Bayamón","Urb. Santa Juanita"],["Apartamento en Guaynabo",null,null,null,"Guaynabo","Edificio B, apto 3"],["Local en Caguas",null,null,null,"Caguas","Al lado de la panadería"]],"appts":["Salidero en el baño","Calentador no calienta"],"lines":["Reparación de salidero","Llave de paso","Calentador de agua"],"next":"Revisión de tuberías"}'
    when 'electrical' then '{"name":"Negocio de Prueba","items":[["Casa en Bayamón",null,null,null,"Bayamón","Urb. Santa Juanita"],["Apartamento en Guaynabo",null,null,null,"Guaynabo","Edificio B, apto 3"],["Local en Caguas",null,null,null,"Caguas","Al lado de la panadería"]],"appts":["Breaker se dispara","Instalar abanico de techo"],"lines":["Instalación de abanico","Breaker 20A","Tomacorriente GFCI"],"next":"Revisión del panel eléctrico"}'
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

-- ---------------------------------------------------------------------------
-- Estimado / factura del cliente: dice a qué se dedica el negocio (para usar sus palabras)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_document(p_token uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_inv  invoices%rowtype;
  v_wo   uuid;
  v_kind text;
  t      record;
begin
  select * into v_inv from invoices where public_token = p_token;
  if found then
    v_wo := v_inv.work_order_id;
    v_kind := 'invoice';
  else
    select id into v_wo from work_orders where public_token = p_token;
    if v_wo is null then return null; end if;
    v_kind := 'estimate';
  end if;
  select * into t from public.wo_totals(v_wo);

  return (
    select json_build_object(
      'kind', v_kind,
      'number', v_inv.number,
      'date', coalesce(v_inv.created_at, wo.created_at),
      'paid_at', v_inv.paid_at,
      'payment_method', v_inv.payment_method,
      'business', json_build_object('name', coalesce(m.business_name, p.full_name), 'owner', p.full_name, 'phone', p.phone,
                                    'email', p.email, 'town', p.town, 'ath_movil', m.ath_movil_number,
                                    'logo_path', m.logo_path, 'brand_color', m.brand_color,
                                    'business_type', m.business_type),
      'client', json_build_object('name', c.full_name),
      'boat', json_build_object('name', b.name, 'make', b.make, 'model', b.model, 'year', b.year,
                                'marina', b.marina_name, 'slip', b.slip_number, 'town', b.town),
      'work', json_build_object('complaint', wo.complaint, 'diagnosis', wo.diagnosis, 'work_done', wo.work_done,
                                'status', wo.status, 'approved_at', wo.estimate_approved_at,
                                'sea_trial_required', wo.sea_trial_required, 'sea_trial_done', wo.sea_trial_done,
                                'sea_trial_method', wo.sea_trial_method, 'sea_trial_notes', wo.sea_trial_notes),
      'parts', coalesce((select json_agg(json_build_object('kind', pt.kind, 'description', pt.description, 'part_number', pt.part_number,
                                'qty', pt.qty, 'unit_cost', pt.unit_cost, 'supplied_by', pt.supplied_by) order by pt.created_at)
                           from work_order_parts pt where pt.work_order_id = wo.id), '[]'::json),
      'totals', case when v_kind = 'invoice'
        then json_build_object('labor_hours', v_inv.labor_hours, 'labor_rate', v_inv.labor_rate, 'labor', v_inv.labor_subtotal,
                               'parts', v_inv.parts_subtotal, 'ivu', v_inv.ivu_amount, 'ivu_rate', v_inv.ivu_rate,
                               'ivu_on_labor', v_inv.ivu_on_labor, 'ivu_on_parts', v_inv.ivu_on_parts, 'total', v_inv.total)
        else json_build_object('labor_hours', wo.labor_hours, 'labor_rate', wo.labor_rate, 'labor', t.labor,
                               'parts', t.parts, 'ivu', t.ivu, 'ivu_rate', t.ivu_rate,
                               'ivu_on_labor', wo.charge_ivu_labor, 'ivu_on_parts', wo.charge_ivu_parts, 'total', t.total) end,
      'payments', coalesce((select json_agg(json_build_object('amount', py.amount, 'method', py.method, 'paid_at', py.paid_at) order by py.paid_at, py.created_at)
                              from payments py where py.work_order_id = wo.id), '[]'::json),
      'warranty_days', m.warranty_days,
      'policies', m.policies_text
    )
    from work_orders wo
    join boats b on b.id = wo.boat_id
    join clients c on c.id = b.client_id
    join mechanics m on m.profile_id = c.mechanic_id
    join profiles p on p.id = m.profile_id
    where wo.id = v_wo
  );
end $$;
revoke all on function public.get_public_document(uuid) from public;
grant execute on function public.get_public_document(uuid) to anon, authenticated;
