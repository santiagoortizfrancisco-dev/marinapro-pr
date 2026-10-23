-- =============================================================================
-- Guardería: ZONAS y ESPACIOS numerados (tierra y agua / muelles).
--  · El dueño crea zonas ("Patio A", "Muelle C") y sus espacios (A-1, A-2…).
--  · Cada contrato puede tener su espacio. Nunca dos botes en el mismo espacio (lo bloquea la base de datos).
--  · Si el bote sale al agua por un tiempo, su espacio en tierra queda reservado para él y, si quiere,
--    se le pone un muelle mientras tanto (away_spot_id).
--  · Un espacio se puede reservar a mano o poner fuera de servicio.
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================

create table if not exists public.storage_zones (
  id           uuid primary key default gen_random_uuid(),
  mechanic_id  uuid not null references public.mechanics(profile_id) on delete cascade,
  name         text not null,
  kind         text not null default 'land' check (kind in ('land', 'water')),   -- tierra o agua / muelle
  sort         integer not null default 0,
  created_at   timestamptz not null default now()
);
alter table public.storage_zones enable row level security;
drop policy if exists storage_zones_own on public.storage_zones;
create policy storage_zones_own on public.storage_zones for all to authenticated
  using (mechanic_id = auth.uid()) with check (mechanic_id = auth.uid());
grant select, insert, update, delete on public.storage_zones to authenticated;

create table if not exists public.storage_spots (
  id            uuid primary key default gen_random_uuid(),
  mechanic_id   uuid not null references public.mechanics(profile_id) on delete cascade,
  zone_id       uuid not null references public.storage_zones(id) on delete cascade,
  label         text not null,                                            -- A-12, C-4…
  status        text not null default 'ok' check (status in ('ok', 'reserved', 'out_of_service')),
  note          text,                                                     -- para quién está reservado, por qué está fuera
  sort          integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (zone_id, label)
);
create index if not exists storage_spots_zone_idx on public.storage_spots (zone_id, sort);
alter table public.storage_spots enable row level security;
drop policy if exists storage_spots_own on public.storage_spots;
create policy storage_spots_own on public.storage_spots for all to authenticated
  using (mechanic_id = auth.uid()) with check (mechanic_id = auth.uid());
grant select, insert, update, delete on public.storage_spots to authenticated;

-- El contrato y su espacio (y el muelle temporal si salió al agua)
alter table public.storage_contracts add column if not exists spot_id uuid references public.storage_spots(id) on delete set null;
alter table public.storage_contracts add column if not exists away_since timestamptz;            -- salió al agua: su espacio queda reservado
alter table public.storage_contracts add column if not exists away_spot_id uuid references public.storage_spots(id) on delete set null;
create unique index if not exists storage_contracts_one_per_spot on public.storage_contracts (spot_id) where status = 'active' and spot_id is not null;
create unique index if not exists storage_contracts_one_per_away_spot on public.storage_contracts (away_spot_id) where status = 'active' and away_spot_id is not null;

-- Candado: un espacio no puede tener dos botes (ni como espacio fijo ni como muelle temporal),
-- tiene que ser del mismo negocio y no puede estar fuera de servicio.
create or replace function public.storage_check_spot()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  sid   uuid;
  sp    storage_spots%rowtype;
  taken text;
begin
  if new.status <> 'active' then new.away_since := null; new.away_spot_id := null; return new; end if;
  if new.away_since is null then new.away_spot_id := null; end if;
  if new.spot_id is not null and new.spot_id = new.away_spot_id then raise exception 'El muelle temporal tiene que ser otro espacio'; end if;
  foreach sid in array array_remove(array[new.spot_id, new.away_spot_id], null) loop
    select * into sp from storage_spots where id = sid;
    if sp.mechanic_id is distinct from new.mechanic_id then raise exception 'Ese espacio no existe'; end if;
    -- Solo se revisa si es un espacio nuevo para este bote (si se daña con el bote adentro, el bote se queda)
    if sp.status = 'out_of_service' and (tg_op = 'INSERT' or (sid is distinct from old.spot_id and sid is distinct from old.away_spot_id)) then
      raise exception 'El espacio % está fuera de servicio', sp.label;
    end if;
    select b.name into taken from storage_contracts c join boats b on b.id = c.boat_id
     where c.status = 'active' and c.id <> new.id and (c.spot_id = sid or c.away_spot_id = sid) limit 1;
    if taken is not null then raise exception 'El espacio % ya está ocupado por %', sp.label, taken; end if;
  end loop;
  return new;
end $$;
drop trigger if exists storage_contracts_spot on public.storage_contracts;
create trigger storage_contracts_spot before insert or update on public.storage_contracts
  for each row execute function public.storage_check_spot();

-- Crear una zona con sus espacios numerados de un solo toque (A-1 … A-20)
create or replace function public.storage_add_spots(p_zone uuid, p_prefix text, p_from integer, p_count integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  z storage_zones%rowtype;
  i integer;
  n integer := 0;
  base integer;
begin
  select * into z from storage_zones where id = p_zone;
  if z.mechanic_id is distinct from auth.uid() then raise exception 'No autorizado'; end if;
  if p_count < 1 or p_count > 300 then raise exception 'Entre 1 y 300 espacios'; end if;
  select coalesce(max(sort), 0) into base from storage_spots where zone_id = p_zone;
  for i in p_from .. p_from + p_count - 1 loop
    insert into storage_spots (mechanic_id, zone_id, label, sort)
    values (z.mechanic_id, p_zone, coalesce(p_prefix, '') || i, base + i - p_from + 1)
    on conflict (zone_id, label) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.storage_add_spots(uuid, text, integer, integer) from public, anon;
grant execute on function public.storage_add_spots(uuid, text, integer, integer) to authenticated;
