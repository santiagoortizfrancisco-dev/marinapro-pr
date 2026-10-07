-- Salt Boat Repair — Registro con aprobación
-- Cualquiera se registra desde el link; queda "por aprobar" hasta que el admin lo aprueba en Admin.
-- Los que ya usan el app quedan aprobados. Correr en Supabase > SQL Editor después de 0013.

-- Solo la primera vez: se crea la columna y los que ya existen hoy (pilotos, el admin) quedan aprobados.
-- Si se pega este SQL otra vez, no aprueba a nadie más.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'access') then
    alter table public.profiles
      add column access text not null default 'pending' check (access in ('pending', 'approved', 'rejected')),
      add column access_changed_at timestamptz;
    update public.profiles set access = 'approved';
  end if;
end $$;

-- Nadie se aprueba solo (la app tampoco puede tocar esta columna: solo full_name, phone y town)
create or replace function public.guard_profile_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.access is distinct from old.access and not public.is_app_admin() then
    new.access := old.access;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_access on public.profiles;
create trigger profiles_guard_access before update on public.profiles
  for each row execute function public.guard_profile_access();

-- Admin: los que esperan aprobación (y los rechazados, por si se arrepiente)
create or replace function public.admin_pending_accounts()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Solo para el administrador'; end if;
  return coalesce((
    select json_agg(json_build_object(
             'id', p.id, 'full_name', p.full_name, 'business_name', m.business_name, 'email', p.email,
             'phone', p.phone, 'town', p.town, 'access', p.access, 'created_at', p.created_at)
           order by p.created_at desc)
      from profiles p left join mechanics m on m.profile_id = p.id
     where p.access in ('pending', 'rejected')), '[]'::json);
end $$;
revoke all on function public.admin_pending_accounts() from public, anon;
grant execute on function public.admin_pending_accounts() to authenticated;

create or replace function public.admin_set_access(p_user uuid, p_access text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Solo para el administrador'; end if;
  if p_access not in ('pending', 'approved', 'rejected') then raise exception 'Valor inválido'; end if;
  update profiles set access = p_access, access_changed_at = now() where id = p_user;
end $$;
revoke all on function public.admin_set_access(uuid, text) from public, anon;
grant execute on function public.admin_set_access(uuid, text) to authenticated;

-- Cuántos esperan aprobación (para el aviso rojo en Más)
create or replace function public.admin_pending_count()
returns integer language sql stable security definer set search_path = public as $$
  select case when public.is_app_admin() then (select count(*)::int from profiles where access = 'pending') else 0 end
$$;
grant execute on function public.admin_pending_count() to authenticated;
