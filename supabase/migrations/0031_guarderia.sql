-- =============================================================================
-- Nuevo oficio: GUARDERÍA / MARINA (renta mensual de espacios para botes).
--  · Lista de precios: espacios (rack, muelle/slip, patio con carretón) por pie, fijo o por tamaño,
--    y cobros sueltos (rampa, noche, bajar/subir el bote, luz, agua…).
--  · Contrato de cada bote: su espacio, desde cuándo, el precio del mes, y cuándo vence (contrato y seguro).
--  · Cobros sueltos que se acumulan en el mes.
--  · "Facturar el mes": una factura por bote con la renta + lo suelto; vence a los N días;
--    cargo por atraso opcional.
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================

alter table public.mechanics drop constraint if exists mechanics_business_type_check;
alter table public.mechanics add constraint mechanics_business_type_check
  check (business_type in ('marine', 'ac', 'plumbing', 'electrical', 'auto', 'general', 'beauty', 'pool', 'storage'));

-- Cómo factura la guardería
alter table public.mechanics add column if not exists storage_due_days integer not null default 10;
alter table public.mechanics add column if not exists storage_late_fee numeric(10,2);
do $$ begin
  alter table public.mechanics add constraint mechanics_storage_due_days_check check (storage_due_days between 0 and 60);
exception when duplicate_object then null; end $$;

-- Cuándo vence una factura (la de la guardería; las demás no tienen)
alter table public.invoices add column if not exists due_date date;

-- ---------------------------------------------------------------------------
-- Lista de precios
-- ---------------------------------------------------------------------------
create table if not exists public.storage_rates (
  id           uuid primary key default gen_random_uuid(),
  mechanic_id  uuid not null references public.mechanics(profile_id) on delete cascade,
  kind         text not null check (kind in ('space', 'extra')),       -- espacio mensual o cobro suelto
  name         text not null,
  basis        text not null default 'flat' check (basis in ('per_foot', 'flat', 'bands')),
  price        numeric(10,2),                                           -- por pie o fijo
  bands        jsonb,                                                   -- [{"max_ft":20,"price":80},…] (por tamaño)
  unit         text not null default 'mes',                             -- mes, uso, noche, vez
  active       boolean not null default true,
  sort         integer not null default 0,
  created_at   timestamptz not null default now()
);
alter table public.storage_rates enable row level security;
drop policy if exists storage_rates_own on public.storage_rates;
create policy storage_rates_own on public.storage_rates for all to authenticated
  using (mechanic_id = auth.uid()) with check (mechanic_id = auth.uid());
grant select, insert, update, delete on public.storage_rates to authenticated;

-- ---------------------------------------------------------------------------
-- Contrato de cada bote
-- ---------------------------------------------------------------------------
create table if not exists public.storage_contracts (
  id                uuid primary key default gen_random_uuid(),
  mechanic_id       uuid not null references public.mechanics(profile_id) on delete cascade,
  boat_id           uuid not null references public.boats(id) on delete cascade,
  rate_id           uuid references public.storage_rates(id) on delete set null,
  space_label       text,                                  -- Rack A-12, Muelle C-4…
  monthly_price     numeric(10,2) not null check (monthly_price >= 0),
  start_date        date not null default (now() at time zone 'America/Puerto_Rico')::date,
  end_date          date,                                  -- vacío = mes a mes
  insurance_expires date,
  status            text not null default 'active' check (status in ('active', 'ended')),
  notes             text,
  created_at        timestamptz not null default now()
);
create index if not exists storage_contracts_mech_idx on public.storage_contracts (mechanic_id, status);
alter table public.storage_contracts enable row level security;
drop policy if exists storage_contracts_own on public.storage_contracts;
create policy storage_contracts_own on public.storage_contracts for all to authenticated
  using (mechanic_id = auth.uid()) with check (mechanic_id = auth.uid());
grant select, insert, update, delete on public.storage_contracts to authenticated;

-- ---------------------------------------------------------------------------
-- Cobros sueltos (rampa, noche, bajada…) que se suman a la factura del mes
-- ---------------------------------------------------------------------------
create table if not exists public.storage_charges (
  id             uuid primary key default gen_random_uuid(),
  mechanic_id    uuid not null references public.mechanics(profile_id) on delete cascade,
  boat_id        uuid not null references public.boats(id) on delete cascade,
  rate_id        uuid references public.storage_rates(id) on delete set null,
  description    text not null,
  qty            numeric(8,2) not null default 1 check (qty > 0),
  unit_price     numeric(10,2) not null check (unit_price >= 0),
  charged_on     date not null default (now() at time zone 'America/Puerto_Rico')::date,
  work_order_id  uuid references public.work_orders(id) on delete set null,   -- ya facturado
  created_at     timestamptz not null default now()
);
create index if not exists storage_charges_open_idx on public.storage_charges (mechanic_id) where work_order_id is null;
alter table public.storage_charges enable row level security;
drop policy if exists storage_charges_own on public.storage_charges;
create policy storage_charges_own on public.storage_charges for all to authenticated
  using (mechanic_id = auth.uid()) with check (mechanic_id = auth.uid());
grant select, insert, update, delete on public.storage_charges to authenticated;

-- Qué meses ya se facturaron (para no facturar dos veces el mismo mes)
create table if not exists public.storage_bills (
  contract_id    uuid not null references public.storage_contracts(id) on delete cascade,
  month          date not null,                                            -- el día 1 del mes
  work_order_id  uuid references public.work_orders(id) on delete set null,
  primary key (contract_id, month)
);
alter table public.storage_bills enable row level security;
drop policy if exists storage_bills_own on public.storage_bills;
create policy storage_bills_own on public.storage_bills for all to authenticated
  using (exists (select 1 from storage_contracts c where c.id = contract_id and c.mechanic_id = auth.uid()))
  with check (exists (select 1 from storage_contracts c where c.id = contract_id and c.mechanic_id = auth.uid()));
grant select, insert, update, delete on public.storage_bills to authenticated;

-- ---------------------------------------------------------------------------
-- La lista de precios de ejemplo (el negocio la cambia)
-- ---------------------------------------------------------------------------
create or replace function public.seed_storage_rates(p_mech uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_mech is distinct from auth.uid() and not coalesce(public.is_app_admin(), false) then raise exception 'No autorizado'; end if;
  if exists (select 1 from storage_rates where mechanic_id = p_mech) then return; end if;
  insert into storage_rates (mechanic_id, kind, name, basis, price, bands, unit, sort) values
    (p_mech, 'space', 'Guardería en seco (rack)', 'per_foot', 12, null, 'mes', 1),
    (p_mech, 'space', 'Muelle / slip', 'per_foot', 15, null, 'mes', 2),
    (p_mech, 'space', 'Patio con carretón', 'bands', null, '[{"max_ft":20,"price":80},{"max_ft":25,"price":100},{"max_ft":30,"price":125},{"max_ft":99,"price":160}]', 'mes', 3),
    (p_mech, 'extra', 'Uso de rampa', 'flat', 15, null, 'uso', 1),
    (p_mech, 'extra', 'Noche / transitorio', 'per_foot', 2, null, 'noche', 2),
    (p_mech, 'extra', 'Bajar o subir el bote', 'flat', 25, null, 'vez', 3),
    (p_mech, 'extra', 'Lavado del bote', 'flat', 40, null, 'vez', 4),
    (p_mech, 'extra', 'Luz', 'flat', 30, null, 'mes', 5),
    (p_mech, 'extra', 'Agua', 'flat', 15, null, 'mes', 6);
end $$;
revoke all on function public.seed_storage_rates(uuid) from public, anon;
grant execute on function public.seed_storage_rates(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Facturar el mes: una factura por bote (renta + cobros sueltos + atraso si aplica)
-- ---------------------------------------------------------------------------
create or replace function public.storage_bill_month(p_month date default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  m        mechanics%rowtype;
  v_month  date := date_trunc('month', coalesce(p_month, (now() at time zone 'America/Puerto_Rico')::date))::date;
  v_next   date;
  v_label  text;
  k        record;
  v_wo     uuid;
  v_n      integer := 0;
  v_late   boolean;
begin
  if v_me is null then raise exception 'No autenticado'; end if;
  select * into m from mechanics where profile_id = v_me;
  if not found then raise exception 'No autorizado'; end if;
  v_next := (v_month + interval '1 month')::date;
  v_label := (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from v_month)::int]
             || ' ' || extract(year from v_month)::int;

  for k in
    select c.*, b.name as boat_name, b.length_ft, b.client_id, coalesce(r.name, 'Espacio') as rate_name
      from storage_contracts c join boats b on b.id = c.boat_id left join storage_rates r on r.id = c.rate_id
     where c.mechanic_id = v_me and c.status = 'active'
       and c.start_date < v_next and (c.end_date is null or c.end_date >= v_month)
       and not exists (select 1 from storage_bills sb where sb.contract_id = c.id and sb.month = v_month)
  loop
    insert into work_orders (boat_id, complaint, work_done, status, labor_hours, labor_rate, sea_trial_required, estimate_approved_at, estimate_approved_by, completed_at, charge_ivu_labor, charge_ivu_parts)
    values (k.boat_id, 'Renta de ' || v_label, 'Renta de ' || v_label, 'done', 0, 0, false, now(), 'mechanic', now(), m.ivu_on_labor, m.ivu_on_parts)
    returning id into v_wo;

    insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by)
    values (v_wo, 'service', 'Renta de ' || v_label || ' · ' || k.rate_name || coalesce(' ' || k.space_label, '')
            || coalesce(' (' || trim(to_char(k.length_ft, 'FM990.0')) || ' pies)', ''), 1, k.monthly_price, 'mechanic');

    -- Lo suelto de ese bote que todavía no se ha facturado (hasta el fin de ese mes)
    insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by)
    select v_wo, 'service', s.description || ' · ' || to_char(s.charged_on, 'DD/MM'), s.qty, s.unit_price, 'mechanic'
      from storage_charges s
     where s.mechanic_id = v_me and s.boat_id = k.boat_id and s.work_order_id is null and s.charged_on < v_next;
    update storage_charges set work_order_id = v_wo
     where mechanic_id = v_me and boat_id = k.boat_id and work_order_id is null and charged_on < v_next;

    -- Cargo por atraso: si el cliente tiene facturas de la guardería vencidas sin pagar
    v_late := m.storage_late_fee is not null and exists (
      select 1 from invoices i join work_orders w on w.id = i.work_order_id join boats b on b.id = w.boat_id
       where b.client_id = k.client_id and i.mechanic_id = v_me and i.paid_at is null
         and i.due_date is not null and i.due_date < (now() at time zone 'America/Puerto_Rico')::date);
    if v_late then
      insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by)
      values (v_wo, 'service', 'Cargo por atraso', 1, m.storage_late_fee, 'mechanic');
    end if;

    perform public.create_invoice(v_wo);
    update invoices set due_date = greatest(v_month, (now() at time zone 'America/Puerto_Rico')::date) + m.storage_due_days
     where work_order_id = v_wo;
    insert into storage_bills (contract_id, month, work_order_id) values (k.id, v_month, v_wo);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.storage_bill_month(date) from public, anon;
grant execute on function public.storage_bill_month(date) to authenticated;

-- ---------------------------------------------------------------------------
-- La factura que ve el cliente: cuándo vence
-- ---------------------------------------------------------------------------
create or replace function public.invoice_due_date(p_token uuid)
returns date language sql stable security definer set search_path = public as $$
  select due_date from invoices where public_token = p_token
$$;
grant execute on function public.invoice_due_date(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- La guardería es un oficio más: la prueba (/demo) la acepta (con botes de ejemplo)
-- y al admin le sale con su nombre cuando alguien se registra.
-- ---------------------------------------------------------------------------
do $$
declare d text;
begin
  d := pg_get_functiondef('public.start_trial(text)'::regprocedure);
  if position('''storage''' in d) = 0 then
    execute replace(d, '''general'', ''pool'')', '''general'', ''pool'', ''storage'')');
  end if;
  d := pg_get_functiondef('public.notify_signup()'::regprocedure);
  if position('''storage''' in d) = 0 then
    execute replace(d, 'when ''pool'' then ''Piscinas''', 'when ''pool'' then ''Piscinas'' when ''storage'' then ''Guardería / Marina''');
  end if;
end $$;
