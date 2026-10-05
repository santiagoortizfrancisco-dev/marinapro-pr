-- MarinaPro PR — Trabajos, fotos y factura
-- Correr en Supabase > SQL Editor después de 0003.

-- ---------------------------------------------------------------------------
-- Datos del negocio
-- ---------------------------------------------------------------------------
alter table public.mechanics
  add column if not exists next_invoice_number integer not null default 1;

-- ---------------------------------------------------------------------------
-- Trabajos (órdenes de trabajo)
-- ---------------------------------------------------------------------------
alter table public.work_orders
  add column if not exists public_token      uuid not null default gen_random_uuid(),
  add column if not exists complaint         text,          -- problema que reporta el cliente
  add column if not exists work_done         text,          -- lo que se hizo (para el cliente)
  add column if not exists charge_ivu_labor  boolean not null default true,
  add column if not exists charge_ivu_parts  boolean not null default true,
  add column if not exists estimate_sent_at  timestamptz,
  add column if not exists completed_at      timestamptz;
create unique index if not exists work_orders_public_token_idx on public.work_orders (public_token);

-- ---------------------------------------------------------------------------
-- Facturas
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists mechanic_id   uuid references public.mechanics(profile_id) on delete cascade,
  add column if not exists public_token  uuid not null default gen_random_uuid(),
  add column if not exists ivu_rate      numeric(6,4),
  add column if not exists labor_hours   numeric(6,2),
  add column if not exists labor_rate    numeric(10,2),
  add column if not exists ivu_on_labor  boolean,
  add column if not exists ivu_on_parts  boolean;
create unique index if not exists invoices_public_token_idx on public.invoices (public_token);
create unique index if not exists invoices_mechanic_number_idx on public.invoices (mechanic_id, number);

-- ---------------------------------------------------------------------------
-- Totales de un trabajo (uso interno de las funciones de abajo)
-- Las piezas que trajo el cliente no se cobran.
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
    select round(w.labor_hours * w.labor_rate, 2) as labor,
           coalesce((select round(sum(p.qty * p.unit_cost), 2) from work_order_parts p
                      where p.work_order_id = p_wo and p.supplied_by = 'mechanic'), 0) as parts,
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
-- Hacer (o actualizar) la factura de un trabajo. Numera 0001, 0002... por mecánico.
-- ---------------------------------------------------------------------------
create or replace function public.create_invoice(p_wo uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_mech  uuid;
  v_inv   uuid;
  v_n     integer;
  t       record;
  w       record;
begin
  if not public.can_manage_work_order(p_wo) then raise exception 'No autorizado'; end if;

  select c.mechanic_id into v_mech
    from work_orders wo join boats b on b.id = wo.boat_id join clients c on c.id = b.client_id
   where wo.id = p_wo;
  select * into w from work_orders where id = p_wo;
  select * into t from public.wo_totals(p_wo);

  select id into v_inv from invoices where work_order_id = p_wo;
  if v_inv is not null then
    update invoices set labor_subtotal = t.labor, parts_subtotal = t.parts, ivu_amount = t.ivu, total = t.total,
                        ivu_rate = t.ivu_rate, labor_hours = w.labor_hours, labor_rate = w.labor_rate,
                        ivu_on_labor = w.charge_ivu_labor, ivu_on_parts = w.charge_ivu_parts
     where id = v_inv;
    return v_inv;
  end if;

  select next_invoice_number into v_n from mechanics where profile_id = v_mech for update;
  update mechanics set next_invoice_number = v_n + 1 where profile_id = v_mech;

  insert into invoices (work_order_id, mechanic_id, number, labor_subtotal, parts_subtotal, ivu_amount, total,
                        ivu_rate, labor_hours, labor_rate, ivu_on_labor, ivu_on_parts)
  values (p_wo, v_mech, lpad(v_n::text, 4, '0'), t.labor, t.parts, t.ivu, t.total,
          t.ivu_rate, w.labor_hours, w.labor_rate, w.charge_ivu_labor, w.charge_ivu_parts)
  returning id into v_inv;

  update work_orders set status = 'invoiced' where id = p_wo and status <> 'paid';
  return v_inv;
end $$;
revoke all on function public.create_invoice(uuid) from public, anon;
grant execute on function public.create_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Estimado o factura para el cliente (link de WhatsApp, sin cuenta).
-- Solo se puede ver con el token secreto del link.
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
      'parts', coalesce((select json_agg(json_build_object('description', pt.description, 'part_number', pt.part_number,
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

-- ---------------------------------------------------------------------------
-- Fotos: carpeta privada. Cada mecánico solo puede usar su carpeta (su id).
-- Ruta: <mecanico>/<trabajo>/<foto>.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists photos_own_select on storage.objects;
create policy photos_own_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists photos_own_insert on storage.objects;
create policy photos_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists photos_own_delete on storage.objects;
create policy photos_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Logo y color del negocio (salen en la app, el estimado y la factura)
-- ---------------------------------------------------------------------------
alter table public.mechanics
  add column if not exists logo_path   text,
  add column if not exists brand_color text not null default '#0b3b5c';

-- Carpeta pública para logos (el cliente ve el logo en la factura sin cuenta)
insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
on conflict (id) do nothing;

drop policy if exists logos_own_insert on storage.objects;
create policy logos_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists logos_own_update on storage.objects;
create policy logos_own_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists logos_own_delete on storage.objects;
create policy logos_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists logos_own_select on storage.objects;
create policy logos_own_select on storage.objects for select to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Primer mecánico de prueba: JQR Boat Repair (logo incluido en el app)
-- Por ahora en la cuenta de Francisco; cuando JQR se registre, cambiar el email.
-- ---------------------------------------------------------------------------
update public.mechanics m
   set business_name = 'JQR Boat Repair',
       logo_path     = '/brands/jqr-boat-repair.jpg',
       brand_color   = '#0b0b0f'
  from public.profiles p
 where p.id = m.profile_id
   and lower(p.email) = 'santiagoortizfrancisco@gmail.com';

-- ---------------------------------------------------------------------------
-- Mecánicos invitados: cuenta lista antes de que entren por primera vez.
-- Si alguien entra con un email de esta lista, queda como mecánico con su
-- negocio, logo y color, sin llenar nada. (Solo se edita desde el SQL Editor.)
-- ---------------------------------------------------------------------------
create table if not exists public.mechanic_invites (
  email             text primary key,
  full_name         text not null,
  business_name     text,
  phone             text,
  town              text,
  ath_movil_number  text,
  labor_rate_hour   numeric(10,2),
  logo_path         text,
  brand_color       text,
  created_at        timestamptz not null default now()
);
alter table public.mechanic_invites enable row level security;   -- sin políticas: la app no la puede leer

create or replace function public.default_policies()
returns text language sql immutable as $$
select 'Garantía de mano de obra: 90 días. Debe reclamar dentro de 30 días de notar el defecto.
Piezas suplidas por el mecánico: garantía del fabricante.
Piezas suplidas por el cliente: solo se garantiza la instalación.
Trabajos eléctricos: no se garantiza cableado viejo o corroído fuera del área trabajada.
Si el cliente no permite la prueba en el agua, la garantía queda anulada.
Un trabajo con balance pendiente no tiene garantía.
No nos hacemos responsables por daños indirectos.'
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv mechanic_invites%rowtype;
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;

  select * into inv from mechanic_invites where lower(email) = lower(new.email);
  if found then
    update profiles set role = 'mechanic', full_name = inv.full_name, phone = inv.phone, town = inv.town
     where id = new.id;
    insert into mechanics (profile_id, business_name, ath_movil_number, labor_rate_hour, logo_path, brand_color, policies_text)
    values (new.id, coalesce(inv.business_name, inv.full_name), inv.ath_movil_number, coalesce(inv.labor_rate_hour, 0),
            inv.logo_path, coalesce(inv.brand_color, '#0b3b5c'), default_policies())
    on conflict (profile_id) do nothing;
  end if;
  return new;
end $$;
