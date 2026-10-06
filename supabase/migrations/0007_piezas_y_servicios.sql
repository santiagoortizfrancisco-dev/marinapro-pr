-- Marine Mechanics PR — Piezas y servicios
-- Lista común (genérica, sin marca, sin precio) + lo que cada mecánico escribe se guarda con su último precio.
-- En el trabajo hay piezas y SERVICIOS (precio fijo); los servicios cuentan como mano de obra para el IVU.
-- Correr en Supabase > SQL Editor después de 0006.

-- Cada línea del trabajo es pieza o servicio
alter table public.work_order_parts
  add column if not exists kind text not null default 'part' check (kind in ('part', 'service'));

-- ---------------------------------------------------------------------------
-- Catálogo: mechanic_id null = lista común de Marine Mechanics PR; si no, es del mecánico
-- ---------------------------------------------------------------------------
create table if not exists public.catalog_items (
  id           uuid primary key default gen_random_uuid(),
  mechanic_id  uuid references public.mechanics(profile_id) on delete cascade,
  kind         text not null check (kind in ('part', 'service')),
  name         text not null,
  category     text,
  last_price   numeric(10,2),
  use_count    integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists catalog_items_unique_idx
  on public.catalog_items (coalesce(mechanic_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, lower(name));

alter table public.catalog_items enable row level security;
drop policy if exists catalog_select on public.catalog_items;
create policy catalog_select on public.catalog_items for select to authenticated
  using (mechanic_id is null or mechanic_id = auth.uid());
drop policy if exists catalog_own on public.catalog_items;
create policy catalog_own on public.catalog_items for all to authenticated
  using (mechanic_id = auth.uid()) with check (mechanic_id = auth.uid());

-- Guardar (o actualizar) una pieza o servicio en "Mis piezas y servicios" con el último precio
create or replace function public.remember_catalog_item(p_kind text, p_name text, p_price numeric default null)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_name text := btrim(p_name);
begin
  if auth.uid() is null or v_name = '' then return; end if;
  insert into catalog_items (mechanic_id, kind, name, last_price, use_count)
  values (auth.uid(), p_kind, v_name, p_price, 1)
  on conflict (coalesce(mechanic_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, lower(name))
  do update set last_price = coalesce(excluded.last_price, catalog_items.last_price),
                use_count = catalog_items.use_count + 1,
                updated_at = now();
end $$;
revoke all on function public.remember_catalog_item(text, text, numeric) from public, anon;
grant execute on function public.remember_catalog_item(text, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Totales: mano de obra = horas × tarifa + servicios; piezas = piezas del mecánico
-- ---------------------------------------------------------------------------
create or replace function public.wo_totals(p_wo uuid)
returns table (labor numeric, parts numeric, ivu numeric, total numeric, ivu_rate numeric)
language sql stable security definer set search_path = public as $$
  with w as (
    select wo.labor_hours, wo.labor_rate, wo.charge_ivu_labor, wo.charge_ivu_parts, m.ivu_rate
      from work_orders wo
      join boats b on b.id = wo.boat_id
      join clients c on c.id = b.client_id
      join mechanics m on m.profile_id = c.mechanic_id
     where wo.id = p_wo
  ), t as (
    select round(w.labor_hours * w.labor_rate, 2)
           + coalesce((select round(sum(p.qty * p.unit_cost), 2) from work_order_parts p
                        where p.work_order_id = p_wo and p.kind = 'service'), 0) as labor,
           coalesce((select round(sum(p.qty * p.unit_cost), 2) from work_order_parts p
                      where p.work_order_id = p_wo and p.kind = 'part' and p.supplied_by = 'mechanic'), 0) as parts,
           w.charge_ivu_labor, w.charge_ivu_parts, w.ivu_rate
      from w
  )
  select t.labor, t.parts,
         round((case when t.charge_ivu_labor then t.labor else 0 end + case when t.charge_ivu_parts then t.parts else 0 end) * t.ivu_rate, 2),
         t.labor + t.parts + round((case when t.charge_ivu_labor then t.labor else 0 end + case when t.charge_ivu_parts then t.parts else 0 end) * t.ivu_rate, 2),
         t.ivu_rate
    from t
$$;
revoke all on function public.wo_totals(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lista común (sin marca y sin precio: cada mecánico pone el suyo)
-- ---------------------------------------------------------------------------
insert into public.catalog_items (mechanic_id, kind, category, name)
select null, kind, category, name from (values
  -- Servicios
  ('service', 'Motor', 'Servicio de 100 horas'),
  ('service', 'Motor', 'Cambio de aceite y filtro'),
  ('service', 'Motor', 'Cambio de impeller'),
  ('service', 'Motor', 'Servicio de pata (aceite de pata)'),
  ('service', 'Motor', 'Cambio de bujías'),
  ('service', 'Motor', 'Cambio de filtros de combustible'),
  ('service', 'Motor', 'Limpieza de inyectores'),
  ('service', 'Motor', 'Limpieza de carburador'),
  ('service', 'Motor', 'Afinación del motor (tune-up)'),
  ('service', 'Motor', 'Cambio de termostato'),
  ('service', 'Motor', 'Reemplazo de bomba de agua'),
  ('service', 'Motor', 'Lavado del motor con agua dulce (flush)'),
  ('service', 'Motor', 'Diagnóstico con computadora'),
  ('service', 'Motor', 'Preparar el bote para guardarlo'),
  ('service', 'Propulsión', 'Instalación de hélice'),
  ('service', 'Propulsión', 'Ajuste de cables de acelerador y cambio'),
  ('service', 'Propulsión', 'Servicio de dirección hidráulica'),
  ('service', 'Propulsión', 'Servicio de trim'),
  ('service', 'Eléctrico', 'Revisión eléctrica'),
  ('service', 'Eléctrico', 'Instalación de batería'),
  ('service', 'Eléctrico', 'Instalación de GPS / chartplotter'),
  ('service', 'Eléctrico', 'Instalación de radio VHF'),
  ('service', 'Eléctrico', 'Instalación de sonda / transductor'),
  ('service', 'Eléctrico', 'Instalación de luces'),
  ('service', 'Eléctrico', 'Instalación de cargador / inversor'),
  ('service', 'Eléctrico', 'Reparación de bomba de achique'),
  ('service', 'Otros', 'Reparación de windlass'),
  ('service', 'Otros', 'Servicio de generador'),
  ('service', 'Otros', 'Servicio de aire acondicionado'),
  ('service', 'Otros', 'Diagnóstico general'),
  ('service', 'Otros', 'Prueba en el agua'),
  ('service', 'Otros', 'Cargo por visita / millaje'),
  ('service', 'Otros', 'Remolque'),
  -- Piezas
  ('part', 'Motor', 'Impeller'),
  ('part', 'Motor', 'Kit de bomba de agua'),
  ('part', 'Motor', 'Filtro de aceite'),
  ('part', 'Motor', 'Aceite de motor (cuarto)'),
  ('part', 'Motor', 'Aceite de motor (galón)'),
  ('part', 'Motor', 'Aceite de pata (gear lube)'),
  ('part', 'Motor', 'Filtro de combustible'),
  ('part', 'Motor', 'Filtro separador de agua'),
  ('part', 'Motor', 'Bujía'),
  ('part', 'Motor', 'Termostato'),
  ('part', 'Motor', 'Empaque / junta'),
  ('part', 'Motor', 'Correa'),
  ('part', 'Motor', 'Ánodo de zinc'),
  ('part', 'Motor', 'Ánodo de aluminio'),
  ('part', 'Motor', 'Kit de mantenimiento 100 horas'),
  ('part', 'Motor', 'Bomba de combustible'),
  ('part', 'Motor', 'Inyector'),
  ('part', 'Motor', 'Kit de carburador'),
  ('part', 'Motor', 'Arrancador (starter)'),
  ('part', 'Motor', 'Alternador'),
  ('part', 'Motor', 'Bobina de encendido'),
  ('part', 'Motor', 'Sensor'),
  ('part', 'Motor', 'Manguera'),
  ('part', 'Motor', 'Abrazadera'),
  ('part', 'Motor', 'Sello (seal)'),
  ('part', 'Motor', 'O-ring'),
  ('part', 'Motor', 'Filtro de agua cruda'),
  ('part', 'Propulsión', 'Hélice'),
  ('part', 'Propulsión', 'Tuerca de hélice'),
  ('part', 'Propulsión', 'Pata (lower unit)'),
  ('part', 'Propulsión', 'Transmisión'),
  ('part', 'Propulsión', 'Bomba de trim'),
  ('part', 'Propulsión', 'Fluido de trim'),
  ('part', 'Propulsión', 'Cable de acelerador'),
  ('part', 'Propulsión', 'Cable de cambio'),
  ('part', 'Propulsión', 'Bomba de dirección'),
  ('part', 'Propulsión', 'Fluido de dirección'),
  ('part', 'Propulsión', 'Cilindro de dirección'),
  ('part', 'Eléctrico', 'Batería'),
  ('part', 'Eléctrico', 'Cargador de batería'),
  ('part', 'Eléctrico', 'Fusible'),
  ('part', 'Eléctrico', 'Breaker'),
  ('part', 'Eléctrico', 'Interruptor'),
  ('part', 'Eléctrico', 'Interruptor de batería'),
  ('part', 'Eléctrico', 'Cable eléctrico (pie)'),
  ('part', 'Eléctrico', 'Terminal'),
  ('part', 'Eléctrico', 'Relay'),
  ('part', 'Eléctrico', 'Bomba de achique'),
  ('part', 'Eléctrico', 'Switch de flotador'),
  ('part', 'Eléctrico', 'Luz de navegación'),
  ('part', 'Eléctrico', 'Bombilla / LED'),
  ('part', 'Otros', 'Válvula'),
  ('part', 'Otros', 'Bomba de agua dulce'),
  ('part', 'Otros', 'Sellador marino'),
  ('part', 'Otros', 'Grasa marina'),
  ('part', 'Otros', 'Bocina')
) as v(kind, category, name)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Estimado / factura del cliente: cada línea dice si es pieza o servicio
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
                                    'logo_path', m.logo_path, 'brand_color', m.brand_color),
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
