-- Marine Mechanics PR — Probar "Pedir cita" con el directorio cerrado
-- El admin y el mismo mecánico pueden enviar una solicitud de prueba aunque el directorio esté cerrado.
-- El público sigue sin poder hasta que el admin lo abra. Correr en Supabase > SQL Editor después de 0009.

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

  -- Abierto: cualquiera. Cerrado: solo el admin o el mismo mecánico (para probarlo antes de abrir).
  select profile_id into v_mech from mechanics
   where lower(slug) = lower(p_slug)
     and ((listed and approved and public.directory_is_open()) or public.is_app_admin() or profile_id = auth.uid());
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
