-- =============================================================================
-- Página informativa (/info): "¿Quieres más información?"
-- Cualquiera (sin cuenta) deja su nombre, email, tipo de negocio y un mensaje (sin teléfono);
-- al administrador le llega el aviso al teléfono y queda en Admin → Piden información.
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================

create table if not exists public.info_requests (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  email          text not null,
  business_type  text,
  message        text,
  created_at     timestamptz not null default now(),
  seen_at        timestamptz
);
alter table public.info_requests enable row level security;  -- sin políticas: solo por las funciones
grant select, insert, update, delete on public.info_requests to authenticated;

create or replace function public.request_info(p_name text, p_email text, p_type text default null, p_message text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if length(trim(coalesce(p_name, ''))) < 2 or length(p_name) > 80 then raise exception 'Escribe tu nombre.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 120 then raise exception 'Escribe tu email.'; end if;
  -- Para que nadie la llene de basura: máximo 3 por email al día y 50 en total por hora
  if (select count(*) from info_requests where email = v_email and created_at > now() - interval '1 day') >= 3
     or (select count(*) from info_requests where created_at > now() - interval '1 hour') >= 50 then
    raise exception 'Ya recibimos tu mensaje. Te escribimos pronto.';
  end if;
  insert into info_requests (full_name, email, business_type, message)
  values (left(trim(p_name), 80), v_email, nullif(left(trim(coalesce(p_type, '')), 60), ''), nullif(left(trim(coalesce(p_message, '')), 500), ''));
  perform public.notify_admin('Piden información: ' || left(trim(p_name), 60),
    concat_ws(' · ', nullif(trim(coalesce(p_type, '')), ''), v_email, nullif(left(trim(coalesce(p_message, '')), 150), '')), 'envelope');
end $$;
revoke all on function public.request_info(text, text, text, text) from public;
grant execute on function public.request_info(text, text, text, text) to anon, authenticated;

create or replace function public.admin_info_requests()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Solo para el administrador'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (select * from info_requests order by created_at desc limit 100) r), '[]'::jsonb);
end $$;
revoke all on function public.admin_info_requests() from public, anon;
grant execute on function public.admin_info_requests() to authenticated;

create or replace function public.admin_unseen_info()
returns integer language sql stable security definer set search_path = public as $$
  select case when public.is_app_admin() then (select count(*)::int from info_requests where seen_at is null) else 0 end
$$;
revoke all on function public.admin_unseen_info() from public, anon;
grant execute on function public.admin_unseen_info() to authenticated;

create or replace function public.admin_mark_info_seen()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Solo para el administrador'; end if;
  update info_requests set seen_at = now() where seen_at is null;
end $$;
revoke all on function public.admin_mark_info_seen() from public, anon;
grant execute on function public.admin_mark_info_seen() to authenticated;
