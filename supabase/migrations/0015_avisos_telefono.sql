-- Salt Boat Repair — Avisos al teléfono del admin (app gratis "ntfy")
-- Cuando alguien crea una cuenta, pide salir en el directorio o escribe un mensaje, al admin le llega una notificación.
-- El canal secreto NO va aquí (el código es público): se guarda aparte en app_settings ('ntfy_topic').
-- Si no hay canal o falla el envío, no pasa nada: nunca frena el registro ni el mensaje.
-- Correr en Supabase > SQL Editor después de 0014.

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net no está disponible: los avisos quedan apagados';
end $$;

create or replace function public.notify_admin(p_title text, p_message text, p_tags text default 'boat')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_topic text := (select value #>> '{}' from app_settings where key = 'ntfy_topic');
begin
  if v_topic is null or v_topic = '' or to_regproc('net.http_post') is null then return; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using 'https://ntfy.sh',
          jsonb_build_object('topic', v_topic, 'title', left(p_title, 120), 'message', left(p_message, 300),
                             'tags', jsonb_build_array(p_tags), 'click', 'https://marinapro-pr.onrender.com/mas/admin'),
          '{"Content-Type": "application/json"}'::jsonb;
exception when others then
  raise notice 'No se pudo enviar el aviso: %', sqlerrm;
end $$;
revoke all on function public.notify_admin(text, text, text) from public, anon, authenticated;

-- Cuenta nueva por aprobar (cuando completa su registro y nace su negocio)
create or replace function public.notify_new_mechanic()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select access from profiles where id = new.profile_id) = 'pending' then
    perform public.notify_admin('Nueva cuenta por aprobar',
      coalesce(new.business_name, 'Un mecánico') || ' se registró. Toca para aprobarlo en Admin.', 'wrench');
  end if;
  return new;
end $$;
drop trigger if exists mechanics_notify_new on public.mechanics;
create trigger mechanics_notify_new after insert on public.mechanics
  for each row execute function public.notify_new_mechanic();

-- Pide salir en el directorio
create or replace function public.notify_listing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.listed and not old.listed and not new.approved then
    perform public.notify_admin('Perfil público por aprobar',
      coalesce(new.business_name, 'Un mecánico') || ' quiere salir en el directorio.', 'globe_with_meridians');
  end if;
  return new;
end $$;
drop trigger if exists mechanics_notify_listing on public.mechanics;
create trigger mechanics_notify_listing after update of listed on public.mechanics
  for each row execute function public.notify_listing();

-- Mensaje nuevo con "Contactar al desarrollador"
create or replace function public.notify_support_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_admin('Mensaje nuevo de ' || coalesce(new.business, new.name, 'alguien sin cuenta'),
    new.message, 'speech_balloon');
  return new;
end $$;
drop trigger if exists support_messages_notify on public.support_messages;
create trigger support_messages_notify after insert on public.support_messages
  for each row execute function public.notify_support_message();
