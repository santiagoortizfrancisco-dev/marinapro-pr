-- Marine Mechanics PR — Paquetes de un toque
-- Un paquete es una lista de servicios y piezas que el mecánico repite (ej. "Servicio de 100 horas").
-- En el trabajo, "+ Paquete" añade todas las líneas de una vez. Se crean con "Guardar como paquete".
-- mechanic_id null = paquete de ejemplo (sin precios); el precio sale de "Mis piezas y servicios".
-- Correr en Supabase > SQL Editor después de 0010.

create table if not exists public.service_packages (
  id           uuid primary key default gen_random_uuid(),
  mechanic_id  uuid references public.mechanics(profile_id) on delete cascade,
  name         text not null check (length(btrim(name)) > 0),
  -- [{ "kind": "service" | "part", "name": "Impeller", "qty": 1, "price": 45.00 | null }]
  items        jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  use_count    integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists service_packages_mechanic_idx on public.service_packages (mechanic_id);

alter table public.service_packages enable row level security;
drop policy if exists packages_select on public.service_packages;
create policy packages_select on public.service_packages for select to authenticated
  using (mechanic_id is null or mechanic_id = auth.uid());
drop policy if exists packages_own on public.service_packages;
create policy packages_own on public.service_packages for all to authenticated
  using (mechanic_id = auth.uid()) with check (mechanic_id = auth.uid());

-- 3 paquetes de ejemplo (solo si todavía no hay ninguno de ejemplo)
insert into public.service_packages (mechanic_id, name, items)
select null, v.name, v.items::jsonb
  from (values
    ('Servicio de 100 horas (fuera de borda)', '[
      {"kind":"service","name":"Servicio de 100 horas","qty":1,"price":null},
      {"kind":"part","name":"Aceite de motor (cuarto)","qty":6,"price":null},
      {"kind":"part","name":"Filtro de aceite","qty":1,"price":null},
      {"kind":"part","name":"Filtro separador de agua","qty":1,"price":null},
      {"kind":"part","name":"Bujía","qty":4,"price":null},
      {"kind":"part","name":"Impeller","qty":1,"price":null},
      {"kind":"part","name":"Aceite de pata (gear lube)","qty":1,"price":null},
      {"kind":"part","name":"Ánodo de zinc","qty":1,"price":null}
    ]'),
    ('Cambio de aceite', '[
      {"kind":"service","name":"Cambio de aceite y filtro","qty":1,"price":null},
      {"kind":"part","name":"Aceite de motor (cuarto)","qty":6,"price":null},
      {"kind":"part","name":"Filtro de aceite","qty":1,"price":null}
    ]'),
    ('Cambio de impeller', '[
      {"kind":"service","name":"Cambio de impeller","qty":1,"price":null},
      {"kind":"part","name":"Impeller","qty":1,"price":null},
      {"kind":"part","name":"Empaque / junta","qty":1,"price":null}
    ]')
  ) as v(name, items)
 where not exists (select 1 from public.service_packages where mechanic_id is null);
