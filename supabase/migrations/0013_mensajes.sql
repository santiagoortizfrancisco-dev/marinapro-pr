-- Salt Boat Repair — "Contactar al desarrollador"
-- El mecánico (o alguien que no puede entrar) escribe un mensaje desde la app.
-- El mensaje llega a Admin → Mensajes. Nadie ve el email del desarrollador.
-- Correr en Supabase > SQL Editor después de 0012.

create table if not exists public.support_messages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete set null,
  name         text,
  business     text,
  email        text,
  phone        text,
  contact      text,                 -- lo que escribió alguien sin cuenta (email o teléfono)
  message      text not null check (length(btrim(message)) between 3 and 2000),
  app_version  text,
  page         text,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index if not exists support_messages_created_idx on public.support_messages (created_at desc);

-- Solo el admin lee y marca como leído (nadie escribe directo: solo con la función de abajo)
alter table public.support_messages enable row level security;
drop policy if exists support_admin_select on public.support_messages;
create policy support_admin_select on public.support_messages for select to authenticated using (public.is_app_admin());
drop policy if exists support_admin_update on public.support_messages;
create policy support_admin_update on public.support_messages for update to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

create or replace function public.send_support_message(
  p_message text, p_contact text default null, p_version text default null, p_page text default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_name text; v_business text; v_email text; v_phone text;
begin
  if length(btrim(coalesce(p_message, ''))) < 3 then raise exception 'Escribe tu mensaje'; end if;
  if v_uid is null and length(btrim(coalesce(p_contact, ''))) < 5 then raise exception 'Escribe tu email o teléfono para contestarte'; end if;

  -- contra abuso: 5 por hora por usuario; sin cuenta, 3 por hora por contacto y 30 por hora en total
  if v_uid is not null then
    if (select count(*) from support_messages where user_id = v_uid and created_at > now() - interval '1 hour') >= 5 then
      raise exception 'Ya enviaste varios mensajes. Intenta en un rato.';
    end if;
  else
    if (select count(*) from support_messages where user_id is null and lower(contact) = lower(btrim(p_contact)) and created_at > now() - interval '1 hour') >= 3
       or (select count(*) from support_messages where user_id is null and created_at > now() - interval '1 hour') >= 30 then
      raise exception 'Ya enviaste varios mensajes. Intenta en un rato.';
    end if;
  end if;

  if v_uid is not null then
    select p.full_name, m.business_name, p.email, p.phone into v_name, v_business, v_email, v_phone
      from profiles p left join mechanics m on m.profile_id = p.id where p.id = v_uid;
  end if;

  insert into support_messages (user_id, name, business, email, phone, contact, message, app_version, page)
  values (v_uid, v_name, v_business, v_email, v_phone, nullif(btrim(coalesce(p_contact, '')), ''),
          btrim(p_message), left(p_version, 40), left(p_page, 120));
  return json_build_object('ok', true);
end $$;
grant execute on function public.send_support_message(text, text, text, text) to anon, authenticated;

-- Cuántos mensajes sin leer (para el aviso en Más)
create or replace function public.admin_unread_messages()
returns integer language sql stable security definer set search_path = public as $$
  select case when public.is_app_admin() then (select count(*)::int from support_messages where read_at is null) else 0 end
$$;
grant execute on function public.admin_unread_messages() to authenticated;
