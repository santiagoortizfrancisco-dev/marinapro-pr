-- =============================================================================
-- Empleadas que le pagan RENTA al salón por su espacio (en vez de comisión).
-- Cada empleada: comisión (como siempre) o renta con su cantidad, por semana o por mes.
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================
alter table public.staff add column if not exists pay_type text not null default 'commission';
alter table public.staff add column if not exists rent_amount numeric(10,2);
alter table public.staff add column if not exists rent_period text not null default 'week';
do $$ begin
  alter table public.staff add constraint staff_pay_type_check check (pay_type in ('commission', 'rent'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.staff add constraint staff_rent_period_check check (rent_period in ('week', 'month'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.staff add constraint staff_rent_amount_check check (rent_amount is null or rent_amount >= 0);
exception when duplicate_object then null; end $$;

-- El espacio que renta (ej. "Estación 2", "Cuarto de masajes")
alter table public.staff add column if not exists rent_space text;

-- ---------------------------------------------------------------------------
-- Registro semanal de rentas (como el papel del salón): cada renta cobrada en la semana
-- ---------------------------------------------------------------------------
create table if not exists public.rent_entries (
  id           uuid primary key default gen_random_uuid(),
  mechanic_id  uuid not null references public.mechanics(profile_id) on delete cascade,
  week_start   date not null,                                   -- el lunes de esa semana
  paid_on      date not null default (now() at time zone 'America/Puerto_Rico')::date,
  staff_id     uuid references public.staff(id) on delete set null,  -- vacía = otro inquilino
  tenant       text not null,                                   -- inquilino / servicio
  concept      text,                                            -- concepto / espacio rentado
  amount       numeric(10,2) not null check (amount >= 0),
  created_at   timestamptz not null default now()
);
create index if not exists rent_entries_week_idx on public.rent_entries (mechanic_id, week_start);
alter table public.rent_entries enable row level security;
drop policy if exists rent_entries_own on public.rent_entries;
create policy rent_entries_own on public.rent_entries for all to authenticated
  using (mechanic_id = auth.uid()) with check (mechanic_id = auth.uid());
grant select, insert, update, delete on public.rent_entries to authenticated;

-- Lo de abajo del papel: responsable, depósitos, observaciones, realizado y revisado por
create table if not exists public.rent_weeks (
  mechanic_id  uuid not null references public.mechanics(profile_id) on delete cascade,
  week_start   date not null,
  responsible  text,
  deposits     numeric(10,2) check (deposits is null or deposits >= 0),
  receipts     boolean not null default false,
  notes        text,
  done_by      text,
  reviewed_by  text,
  updated_at   timestamptz not null default now(),
  primary key (mechanic_id, week_start)
);
alter table public.rent_weeks enable row level security;
drop policy if exists rent_weeks_own on public.rent_weeks;
create policy rent_weeks_own on public.rent_weeks for all to authenticated
  using (mechanic_id = auth.uid()) with check (mechanic_id = auth.uid());
grant select, insert, update, delete on public.rent_weeks to authenticated;
