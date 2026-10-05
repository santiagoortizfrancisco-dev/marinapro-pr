-- MarinaPro PR — Hito 2 y 3: datos completos del bote, equipos y agenda
-- Correr en Supabase > SQL Editor después de 0001 y 0002.

-- Clientes: dirección y cómo prefiere que lo contacten
alter table public.clients
  add column if not exists address text,
  add column if not exists preferred_contact text not null default 'whatsapp'
    check (preferred_contact in ('whatsapp', 'call', 'email'));

-- Botes: registro, marbete, color y notas
alter table public.boats
  add column if not exists registration_number text,   -- número de registro / matrícula (DRNA)
  add column if not exists marbete_expires date,
  add column if not exists hull_color text,
  add column if not exists notes text;

-- Motores: año, tipo de propulsión, hélice y notas
alter table public.engines
  add column if not exists year integer,
  add column if not exists drive_type text
    check (drive_type in ('outboard', 'inboard', 'sterndrive', 'jet', 'pod')),
  add column if not exists propeller text,
  add column if not exists notes text;

-- Equipos del bote: todo lo que no es el motor principal
create table if not exists public.equipment (
  id                uuid primary key default gen_random_uuid(),
  boat_id           uuid not null references public.boats(id) on delete cascade,
  category          text not null check (category in (
                      'gps', 'radar', 'sonar', 'vhf', 'autopilot', 'windlass', 'generator',
                      'batteries', 'charger', 'bilge_pump', 'ac', 'steering', 'trim', 'thruster',
                      'watermaker', 'head', 'water_system', 'lights', 'audio', 'fuel_system', 'other')),
  make              text,
  model             text,
  serial_number     text,
  location_on_boat  text,
  installed_at      date,
  warranty_until    date,
  notes             text,
  created_at        timestamptz not null default now()
);
create index if not exists equipment_boat_id_idx on public.equipment (boat_id);

alter table public.equipment enable row level security;
drop policy if exists equipment_mechanic on public.equipment;
create policy equipment_mechanic on public.equipment for all to authenticated
  using (public.can_manage_boat(boat_id)) with check (public.can_manage_boat(boat_id));
drop policy if exists equipment_client_select on public.equipment;
create policy equipment_client_select on public.equipment for select to authenticated
  using (public.is_my_boat(boat_id));

-- Citas: qué se va a hacer y en qué sistemas (motores, electrónica, windlass...)
alter table public.appointments
  add column if not exists title text,
  add column if not exists systems text[] not null default '{}';

-- Fase 1: todo usuario nuevo es mecánico (la app del cliente llega en la Fase 2)
