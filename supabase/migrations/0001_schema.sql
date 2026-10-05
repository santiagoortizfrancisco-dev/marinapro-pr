-- MarinaPro PR — Hito 1: tablas
-- Correr en Supabase > SQL Editor (en orden: 0001, 0002). Se puede correr una sola vez.


-- ---------------------------------------------------------------------------
-- Perfiles (1 por usuario de Auth)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text check (role in ('mechanic', 'client')),   -- null hasta que escoja
  full_name   text,
  phone       text,
  email       text,
  town        text,
  created_at  timestamptz not null default now()
);

-- El mecánico usa su mismo id de usuario como llave (mechanic_id = auth.uid()).
create table public.mechanics (
  profile_id        uuid primary key references public.profiles(id) on delete cascade,
  business_name     text,
  ath_movil_number  text,
  labor_rate_hour   numeric(10,2) not null default 0,
  ivu_rate          numeric(6,4)  not null default 0.115,
  ivu_on_labor      boolean not null default true,
  ivu_on_parts      boolean not null default true,
  warranty_days     integer not null default 90,
  policies_text     text not null default '',
  policies_version  integer not null default 1,
  created_at        timestamptz not null default now()
);

-- Clientes del mecánico. profile_id queda null hasta que el cliente acepte la invitación.
create table public.clients (
  id           uuid primary key default gen_random_uuid(),
  mechanic_id  uuid not null references public.mechanics(profile_id) on delete cascade,
  profile_id   uuid references public.profiles(id) on delete set null,
  full_name    text not null,
  phone        text,
  email        text,
  town         text,
  notes        text,
  invite_code  text unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  created_at   timestamptz not null default now()
);
create index on public.clients (mechanic_id);
create index on public.clients (profile_id);

create table public.boats (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  name            text not null,
  make            text,
  model           text,
  year            integer,
  length_ft       numeric(5,1),
  hull_id         text,
  location_type   text not null default 'water_slip' check (location_type in ('water_slip', 'dry_storage', 'home', 'trailer')),
  marina_name     text,
  slip_number     text,
  town            text,
  lat             double precision,
  lng             double precision,
  location_notes  text,
  created_at      timestamptz not null default now()
);
create index on public.boats (client_id);

create table public.engines (
  id             uuid primary key default gen_random_uuid(),
  boat_id        uuid not null references public.boats(id) on delete cascade,
  position       text not null default 'single' check (position in ('port', 'starboard', 'center', 'single')),
  make           text,
  model          text,
  hp             integer,
  serial_number  text,
  hours          numeric(8,1),
  fuel           text not null default 'gas' check (fuel in ('gas', 'diesel')),
  created_at     timestamptz not null default now()
);
create index on public.engines (boat_id);

create table public.service_requests (
  id           uuid primary key default gen_random_uuid(),
  boat_id      uuid not null references public.boats(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  description  text not null,
  urgency      text not null default 'normal' check (urgency in ('low', 'normal', 'high')),
  status       text not null default 'new' check (status in ('new', 'seen', 'scheduled', 'closed')),
  media_paths  text[] not null default '{}',   -- fotos / video / nota de voz en Storage
  created_at   timestamptz not null default now()
);
create index on public.service_requests (boat_id);

create table public.appointments (
  id                  uuid primary key default gen_random_uuid(),
  mechanic_id         uuid not null references public.mechanics(profile_id) on delete cascade,
  boat_id             uuid not null references public.boats(id) on delete cascade,
  service_request_id  uuid references public.service_requests(id) on delete set null,
  starts_at           timestamptz not null,
  duration_min        integer not null default 60,
  status              text not null default 'requested' check (status in ('requested', 'confirmed', 'done', 'cancelled')),
  notes               text,
  created_at          timestamptz not null default now()
);
create index on public.appointments (mechanic_id, starts_at);
create index on public.appointments (boat_id);

create table public.work_orders (
  id                         uuid primary key default gen_random_uuid(),
  boat_id                    uuid not null references public.boats(id) on delete cascade,
  appointment_id             uuid references public.appointments(id) on delete set null,
  diagnosis                  text,
  status                     text not null default 'estimate' check (status in ('estimate', 'approved', 'waiting_parts', 'in_progress', 'sea_trial', 'done', 'invoiced', 'paid')),
  labor_hours                numeric(6,2) not null default 0,
  labor_rate                 numeric(10,2) not null default 0,
  estimate_approved_at       timestamptz,
  policies_accepted_version  integer,
  sea_trial_required         boolean not null default true,
  sea_trial_done             boolean not null default false,
  sea_trial_method           text check (sea_trial_method in ('water', 'hose_muffs', 'not_allowed')),
  sea_trial_notes            text,
  created_at                 timestamptz not null default now()
);
create index on public.work_orders (boat_id);

create table public.work_order_parts (
  id             uuid primary key default gen_random_uuid(),
  work_order_id  uuid not null references public.work_orders(id) on delete cascade,
  description    text not null,
  part_number    text,
  qty            numeric(8,2) not null default 1,
  unit_cost      numeric(10,2) not null default 0,
  supplied_by    text not null default 'mechanic' check (supplied_by in ('client', 'mechanic')),
  supplier       text,
  eta            date,
  received_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index on public.work_order_parts (work_order_id);

create table public.photos (
  id             uuid primary key default gen_random_uuid(),
  work_order_id  uuid not null references public.work_orders(id) on delete cascade,
  kind           text not null check (kind in ('before', 'old_part', 'new_part', 'after')),
  storage_path   text not null,
  caption        text,
  taken_at       timestamptz not null default now()
);
create index on public.photos (work_order_id);

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  work_order_id   uuid not null unique references public.work_orders(id) on delete cascade,
  number          text not null,
  labor_subtotal  numeric(10,2) not null default 0,
  parts_subtotal  numeric(10,2) not null default 0,
  ivu_amount      numeric(10,2) not null default 0,
  total           numeric(10,2) not null default 0,
  sent_at         timestamptz,
  paid_at         timestamptz,
  payment_method  text check (payment_method in ('ath_movil', 'cash', 'check', 'other')),
  created_at      timestamptz not null default now()
);

create table public.maintenance_schedules (
  id                uuid primary key default gen_random_uuid(),
  boat_id           uuid not null references public.boats(id) on delete cascade,
  engine_id         uuid references public.engines(id) on delete cascade,
  service_type      text not null,
  due_date          date,
  due_hours         numeric(8,1),
  last_notified_at  timestamptz,
  status            text not null default 'pending' check (status in ('pending', 'notified', 'scheduled', 'done', 'skipped')),
  created_at        timestamptz not null default now()
);
create index on public.maintenance_schedules (boat_id);
create index on public.maintenance_schedules (due_date) where status in ('pending', 'notified');

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null,
  payload     jsonb not null default '{}',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Al registrarse un usuario se crea su perfil (sin rol todavía)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Escoger rol (una sola vez). Si es mecánico, crea su fila en mechanics con las políticas por defecto.
-- ---------------------------------------------------------------------------
create or replace function public.set_my_role(
  p_role text,
  p_full_name text,
  p_phone text default null,
  p_town text default null,
  p_business_name text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_current text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_role not in ('mechanic', 'client') then raise exception 'Rol inválido'; end if;

  select role into v_current from profiles where id = auth.uid() for update;
  if v_current is not null then raise exception 'El rol ya fue escogido'; end if;

  update profiles
     set role = p_role, full_name = p_full_name, phone = p_phone, town = p_town
   where id = auth.uid();

  if p_role = 'mechanic' then
    insert into mechanics (profile_id, business_name, policies_text)
    values (auth.uid(), coalesce(p_business_name, p_full_name),
'Garantía de mano de obra: 90 días. Debe reclamar dentro de 30 días de notar el defecto.
Piezas suplidas por el mecánico: garantía del fabricante.
Piezas suplidas por el cliente: solo se garantiza la instalación.
Trabajos eléctricos: no se garantiza cableado viejo o corroído fuera del área trabajada.
Si el cliente no permite la prueba en el agua, la garantía queda anulada.
Un trabajo con balance pendiente no tiene garantía.
No nos hacemos responsables por daños indirectos.')
    on conflict (profile_id) do nothing;
  end if;
end $$;

revoke all on function public.set_my_role(text, text, text, text, text) from public, anon;
grant execute on function public.set_my_role(text, text, text, text, text) to authenticated;
