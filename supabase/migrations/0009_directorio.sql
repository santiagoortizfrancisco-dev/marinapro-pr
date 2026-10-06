-- Marine Mechanics PR — Directorio público de mecánicos + solicitudes de cita + anuncios
-- Todo empieza CERRADO: nadie ve el directorio hasta que el admin lo abre.
-- Correr en Supabase > SQL Editor después de 0008.

-- ---------------------------------------------------------------------------
-- Perfil público del mecánico
-- ---------------------------------------------------------------------------
alter table public.mechanics
  add column if not exists listed             boolean not null default false,   -- el mecánico quiere salir
  add column if not exists approved           boolean not null default false,   -- el admin lo aprobó
  add column if not exists slug               text,                             -- su dirección: /mecanicos/<slug>
  add column if not exists public_description text,
  add column if not exists public_towns       text[] not null default '{}',
  add column if not exists public_services    text[] not null default '{}',
  add column if not exists public_brands      text[] not null default '{}',
  add column if not exists public_locations   text[] not null default '{}';
create unique index if not exists mechanics_slug_idx on public.mechanics (lower(slug));

-- Solo el admin cambia "approved" (el mecánico no se aprueba solo)
create or replace function public.guard_mechanic_approved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.approved is distinct from old.approved and not public.is_app_admin() then
    new.approved := old.approved;
  end if;
  return new;
end $$;
drop trigger if exists mechanics_guard_approved on public.mechanics;
create trigger mechanics_guard_approved before update on public.mechanics
  for each row execute function public.guard_mechanic_approved();

-- ---------------------------------------------------------------------------
-- Ajustes del app (directorio abierto o cerrado). Solo por funciones.
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key    text primary key,
  value  jsonb not null
);
alter table public.app_settings enable row level security;
insert into public.app_settings (key, value) values ('directory_open', 'false') on conflict (key) do nothing;

create or replace function public.directory_is_open()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (value)::text = 'true' from app_settings where key = 'directory_open'), false)
$$;
grant execute on function public.directory_is_open() to anon, authenticated;

create or replace function public.admin_set_directory_open(p_open boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Solo para el administrador'; end if;
  insert into app_settings (key, value) values ('directory_open', to_jsonb(p_open))
  on conflict (key) do update set value = excluded.value;
end $$;
revoke all on function public.admin_set_directory_open(boolean) from public, anon;
grant execute on function public.admin_set_directory_open(boolean) to authenticated;

create or replace function public.admin_set_approved(p_mechanic uuid, p_approved boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Solo para el administrador'; end if;
  update mechanics set approved = p_approved where profile_id = p_mechanic;
end $$;
revoke all on function public.admin_set_approved(uuid, boolean) from public, anon;
grant execute on function public.admin_set_approved(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Lo que se ve en público de un mecánico (nunca sus clientes, precios ni facturas)
-- ---------------------------------------------------------------------------
create or replace function public.public_card(m mechanics)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'slug', m.slug, 'name', coalesce(m.business_name, p.full_name), 'owner', p.full_name,
    'town', p.town, 'phone', p.phone, 'logo_path', m.logo_path, 'brand_color', m.brand_color,
    'description', m.public_description, 'towns', m.public_towns, 'services', m.public_services,
    'brands', m.public_brands, 'locations', m.public_locations)
  from profiles p where p.id = m.profile_id
$$;
revoke all on function public.public_card(mechanics) from public, anon, authenticated;

-- Buscar mecánicos (pueblo / servicio / marca). Cerrado = lista vacía (menos para el admin, que lo revisa antes de abrir).
create or replace function public.directory_search(p_town text default null, p_service text default null, p_brand text default null)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(public.public_card(m) order by m.business_name), '[]'::json)
    from mechanics m
   where (public.directory_is_open() or public.is_app_admin()) and m.listed and m.approved and m.slug is not null
     and (p_town is null or p_town = any (m.public_towns))
     and (p_service is null or p_service = any (m.public_services))
     and (p_brand is null or p_brand = any (m.public_brands))
$$;
grant execute on function public.directory_search(text, text, text) to anon, authenticated;

-- Perfil por su dirección. El mecánico se ve a sí mismo (vista previa) y el admin ve todos.
create or replace function public.directory_profile(p_slug text)
returns json language sql stable security definer set search_path = public as $$
  select public.public_card(m)
    from mechanics m
   where lower(m.slug) = lower(p_slug)
     and ((public.directory_is_open() and m.listed and m.approved) or m.profile_id = auth.uid() or public.is_app_admin())
$$;
grant execute on function public.directory_profile(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Solicitudes de cita desde el directorio (sin cuenta)
-- ---------------------------------------------------------------------------
alter table public.service_requests
  add column if not exists source          text not null default 'app' check (source in ('app', 'directory')),
  add column if not exists contact_name    text,
  add column if not exists contact_phone   text,
  add column if not exists preferred_when  text,
  add column if not exists boat_location   text,
  add column if not exists spam            boolean not null default false;

create or replace function public.submit_directory_request(
  p_slug text, p_name text, p_phone text, p_boat text, p_boat_make text,
  p_location text, p_problem text, p_when text, p_website text default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_mech    uuid;
  v_phone   text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_client  uuid;
  v_boat    uuid;
begin
  -- trampa para robots: un campo escondido que una persona nunca llena
  if coalesce(p_website, '') <> '' then return json_build_object('ok', true); end if;
  if length(btrim(coalesce(p_name, ''))) < 2 or length(v_phone) < 7 or length(btrim(coalesce(p_problem, ''))) < 3 then
    raise exception 'Faltan datos';
  end if;

  select profile_id into v_mech from mechanics
   where lower(slug) = lower(p_slug) and listed and approved and public.directory_is_open();
  if v_mech is null then raise exception 'Ese mecánico no está disponible'; end if;

  -- máximo 3 solicitudes por teléfono en 24 horas (contra spam)
  if (select count(*) from service_requests
       where source = 'directory' and regexp_replace(coalesce(contact_phone, ''), '\D', '', 'g') = v_phone
         and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'Ya enviaste varias solicitudes hoy. Intenta mañana o escríbele por WhatsApp.';
  end if;

  -- el cliente: si ya existe con ese teléfono para este mecánico, se usa el mismo
  select id into v_client from clients
   where mechanic_id = v_mech and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_phone limit 1;
  if v_client is null then
    insert into clients (mechanic_id, full_name, phone, notes)
    values (v_mech, btrim(p_name), btrim(p_phone), 'Llegó por el directorio')
    returning id into v_client;
  end if;

  select id into v_boat from boats where client_id = v_client and lower(name) = lower(btrim(coalesce(p_boat, ''))) limit 1;
  if v_boat is null then
    insert into boats (client_id, name, make, location_notes)
    values (v_client, coalesce(nullif(btrim(p_boat), ''), 'Bote'), nullif(btrim(p_boat_make), ''), nullif(btrim(p_location), ''))
    returning id into v_boat;
  end if;

  insert into service_requests (boat_id, client_id, description, status, source, contact_name, contact_phone, preferred_when, boat_location)
  values (v_boat, v_client, btrim(p_problem), 'new', 'directory', btrim(p_name), btrim(p_phone), p_when, nullif(btrim(p_location), ''));

  return json_build_object('ok', true);
end $$;
grant execute on function public.submit_directory_request(text, text, text, text, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Anuncios (tiendas de piezas marinas). Los maneja el admin.
-- ---------------------------------------------------------------------------
create table if not exists public.ads (
  id          uuid primary key default gen_random_uuid(),
  advertiser  text not null,
  image_path  text not null,
  link_url    text,
  active      boolean not null default true,
  clicks      integer not null default 0,
  views       integer not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.ads enable row level security;
drop policy if exists ads_admin on public.ads;
create policy ads_admin on public.ads for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

create or replace function public.ads_active()
returns json language plpgsql security definer set search_path = public as $$
declare v json;
begin
  if not public.directory_is_open() and not public.is_app_admin() then return '[]'::json; end if;
  select coalesce(json_agg(json_build_object('id', id, 'advertiser', advertiser, 'image_path', image_path, 'link_url', link_url) order by random()), '[]'::json)
    into v from ads where active;
  update ads set views = views + 1 where active;
  return v;
end $$;
grant execute on function public.ads_active() to anon, authenticated;

create or replace function public.ad_click(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update ads set clicks = clicks + 1 where id = p_id and active
$$;
grant execute on function public.ad_click(uuid) to anon, authenticated;

-- Carpeta pública para las imágenes de los anuncios; solo el admin sube
insert into storage.buckets (id, name, public) values ('ads', 'ads', true) on conflict (id) do nothing;
drop policy if exists ads_admin_write on storage.objects;
create policy ads_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'ads' and public.is_app_admin());
drop policy if exists ads_admin_delete on storage.objects;
create policy ads_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ads' and public.is_app_admin());

-- Para el Admin: quién quiere salir en el directorio y si está aprobado
create or replace function public.admin_directory_list()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Solo para el administrador'; end if;
  return coalesce((
    select json_agg(json_build_object('id', m.profile_id, 'name', coalesce(m.business_name, p.full_name), 'email', p.email,
                                      'slug', m.slug, 'listed', m.listed, 'approved', m.approved,
                                      'towns', m.public_towns, 'services', m.public_services) order by m.approved, m.business_name)
      from mechanics m join profiles p on p.id = m.profile_id
     where m.listed or m.approved), '[]'::json);
end $$;
revoke all on function public.admin_directory_list() from public, anon;
grant execute on function public.admin_directory_list() to authenticated;
