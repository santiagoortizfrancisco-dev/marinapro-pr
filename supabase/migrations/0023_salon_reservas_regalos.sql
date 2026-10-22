-- =============================================================================
-- Salón: 1) recordatorio de la cita de mañana, 2) citas pedidas por internet
-- con el link del salón, 3) tarjetas de regalo.
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Recordatorios: cuándo se le recordó la cita, y de dónde vino la cita
-- ---------------------------------------------------------------------------
alter table public.appointments add column if not exists reminded_at timestamptz;
alter table public.appointments add column if not exists source text not null default 'app';
do $$ begin
  alter table public.appointments add constraint appointments_source_check check (source in ('app', 'online'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2) Citas por internet: el link del salón y su horario
-- ---------------------------------------------------------------------------
alter table public.mechanics add column if not exists booking_on boolean not null default false;
alter table public.mechanics add column if not exists booking_slug text;
-- Horario por día de la semana (0 = domingo … 6 = sábado): ["09:00","18:00"] o null si cierra
alter table public.mechanics add column if not exists booking_hours jsonb not null
  default '{"0":null,"1":["09:00","18:00"],"2":["09:00","18:00"],"3":["09:00","18:00"],"4":["09:00","18:00"],"5":["09:00","18:00"],"6":["09:00","18:00"]}'::jsonb;
create unique index if not exists mechanics_booking_slug_idx on public.mechanics (lower(booking_slug)) where booking_slug is not null;
do $$ begin
  alter table public.mechanics add constraint mechanics_booking_slug_check check (booking_slug is null or booking_slug ~ '^[a-z0-9][a-z0-9-]{2,40}$');
exception when duplicate_object then null; end $$;

-- Lo que ve la clienta en el link: el salón, su menú, sus empleadas y su horario (nada privado)
create or replace function public.booking_page(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', coalesce(m.business_name, p.full_name), 'town', p.town, 'phone', p.phone,
    'logo_path', m.logo_path, 'brand_color', m.brand_color, 'hours', m.booking_hours,
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'category', c.category, 'duration_min', c.duration_min, 'price', c.last_price) order by c.category, c.name)
                  from catalog_items c where c.mechanic_id = m.profile_id and c.kind = 'service'), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'color', s.color) order by s.name)
                  from staff s where s.mechanic_id = m.profile_id and s.active), '[]'::jsonb))
    from mechanics m join profiles p on p.id = m.profile_id
   where m.booking_on and lower(m.booking_slug) = lower(p_slug)
$$;
grant execute on function public.booking_page(text) to anon, authenticated;

-- Las horas ocupadas de un día (solo hora, duración y empleada; nunca quién es la clienta)
create or replace function public.booking_busy(p_slug text, p_day date)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('starts_at', a.starts_at, 'duration_min', a.duration_min, 'staff_id', a.staff_id)), '[]'::jsonb)
    from appointments a join mechanics m on m.profile_id = a.mechanic_id
   where m.booking_on and lower(m.booking_slug) = lower(p_slug)
     and a.status <> 'cancelled'
     and (a.starts_at at time zone 'America/Puerto_Rico')::date = p_day
$$;
grant execute on function public.booking_busy(text, date) to anon, authenticated;

-- La clienta pide la cita: queda "pedida" y el salón la confirma
create or replace function public.booking_request(
  p_slug text, p_name text, p_phone text, p_services uuid[], p_staff uuid, p_starts_at timestamptz, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  m        mechanics%rowtype;
  v_local  timestamp := p_starts_at at time zone 'America/Puerto_Rico';
  v_hours  jsonb;
  v_mins   integer;
  v_title  text;
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_client uuid;
  v_boat   uuid;
  v_appt   uuid;
  v_wo     uuid;
  v_busy   integer;
  v_staffn integer;
begin
  select * into m from mechanics where booking_on and lower(booking_slug) = lower(p_slug);
  if not found then raise exception 'Este salón no está recibiendo citas por internet.'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(p_name) > 80 then raise exception 'Escribe tu nombre.'; end if;
  if length(v_digits) < 7 or length(v_digits) > 15 then raise exception 'Escribe tu teléfono.'; end if;
  if p_starts_at < now() + interval '30 minutes' or p_starts_at > now() + interval '90 days' then raise exception 'Escoge otra hora.'; end if;
  if p_staff is not null and not exists (select 1 from staff where id = p_staff and mechanic_id = m.profile_id and active) then raise exception 'Escoge otra empleada.'; end if;
  -- Para que nadie llene la agenda: máximo 3 citas pedidas por teléfono al día
  if (select count(*) from appointments a join boats b on b.id = a.boat_id join clients c on c.id = b.client_id
       where a.mechanic_id = m.profile_id and a.source = 'online' and a.created_at > now() - interval '1 day'
         and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_digits) >= 3 then
    raise exception 'Ya pediste varias citas hoy. Llama al salón.';
  end if;

  -- Los servicios (solo del menú de este salón): suman el tiempo
  select coalesce(sum(coalesce(duration_min, 30)), 0), string_agg(name, ' + ' order by name)
    into v_mins, v_title
    from catalog_items where id = any(coalesce(p_services, '{}')) and mechanic_id = m.profile_id and kind = 'service';
  if v_mins = 0 then v_mins := 60; end if;

  -- Dentro del horario del salón
  v_hours := m.booking_hours -> extract(dow from v_local)::int::text;
  if v_hours is null or jsonb_typeof(v_hours) <> 'array'
     or v_local::time < (v_hours ->> 0)::time
     or (v_local + make_interval(mins => v_mins))::time > (v_hours ->> 1)::time then
    raise exception 'El salón está cerrado a esa hora.';
  end if;

  -- Que esté libre: con esa empleada, o (si no escogió) que quede alguien libre
  select count(*) into v_busy from appointments a
   where a.mechanic_id = m.profile_id and a.status <> 'cancelled'
     and tstzrange(a.starts_at, a.starts_at + make_interval(mins => a.duration_min)) && tstzrange(p_starts_at, p_starts_at + make_interval(mins => v_mins))
     and (p_staff is null or a.staff_id is null or a.staff_id = p_staff);
  select count(*) into v_staffn from staff where mechanic_id = m.profile_id and active;
  if (p_staff is not null and v_busy > 0) or (p_staff is null and v_busy >= greatest(1, v_staffn)) then
    raise exception 'Esa hora ya se cogió. Escoge otra.';
  end if;

  -- La clienta: si ya existe (mismo teléfono) se usa; si no, se crea
  select c.id into v_client from clients c
   where c.mechanic_id = m.profile_id and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_digits
   order by c.created_at limit 1;
  if v_client is null then
    insert into clients (mechanic_id, full_name, phone) values (m.profile_id, trim(p_name), trim(p_phone)) returning id into v_client;
  end if;
  select id into v_boat from boats where client_id = v_client order by created_at limit 1;
  if v_boat is null then
    insert into boats (client_id, name, location_type) values (v_client, (select full_name from clients where id = v_client), 'home') returning id into v_boat;
  end if;

  insert into appointments (mechanic_id, boat_id, staff_id, starts_at, duration_min, status, title, notes, systems, source)
  values (m.profile_id, v_boat, p_staff, p_starts_at, v_mins, 'requested', v_title, nullif(left(trim(coalesce(p_note, '')), 300), ''), '{}', 'online')
  returning id into v_appt;

  -- Su cuenta lista (sin precio: se pone al cobrar)
  insert into work_orders (boat_id, appointment_id, staff_id, complaint, status, labor_hours, labor_rate, sea_trial_required, estimate_approved_at, estimate_approved_by, approval_seen_at)
  values (v_boat, v_appt, p_staff, v_title, 'approved', 0, 0, false, now(), 'mechanic', now())
  returning id into v_wo;
  insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by)
  select v_wo, 'service', name, 1, coalesce(last_price, 0), 'mechanic'
    from catalog_items where id = any(coalesce(p_services, '{}')) and mechanic_id = m.profile_id and kind = 'service';

  return v_appt;
end $$;
revoke all on function public.booking_request(text, text, text, uuid[], uuid, timestamptz, text) from public;
grant execute on function public.booking_request(text, text, text, uuid[], uuid, timestamptz, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Tarjetas de regalo
-- ---------------------------------------------------------------------------
create table if not exists public.gift_cards (
  id              uuid primary key default gen_random_uuid(),
  mechanic_id     uuid not null references public.mechanics(profile_id) on delete cascade,
  code            text not null,
  amount          numeric(10,2) not null check (amount > 0),
  balance         numeric(10,2) not null check (balance >= 0),
  recipient_name  text,
  buyer_name      text,
  phone           text,
  method          text not null default 'cash' check (method in ('ath_movil', 'cash', 'check', 'other')),
  note            text,
  sold_at         timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (mechanic_id, code)
);
alter table public.gift_cards enable row level security;
drop policy if exists gift_cards_own on public.gift_cards;
create policy gift_cards_own on public.gift_cards for all to authenticated
  using (mechanic_id = auth.uid()) with check (mechanic_id = auth.uid());
grant select, insert, update, delete on public.gift_cards to authenticated;

-- Un pago puede ser con tarjeta de regalo: se le resta a la tarjeta (y se le devuelve si se borra el pago)
alter table public.payments add column if not exists gift_card_id uuid references public.gift_cards(id) on delete set null;

create or replace function public.payments_gift_card()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_card gift_cards%rowtype;
begin
  if tg_op = 'INSERT' and new.gift_card_id is not null then
    select * into v_card from gift_cards where id = new.gift_card_id for update;
    if not found or v_card.mechanic_id <> (select a.mechanic_id from work_orders w join boats b on b.id = w.boat_id join clients a on a.id = b.client_id where w.id = new.work_order_id) then
      raise exception 'Esa tarjeta de regalo no es de este negocio.';
    end if;
    if v_card.balance < new.amount - 0.004 then
      raise exception 'A la tarjeta solo le quedan %', to_char(v_card.balance, 'FM$999,990.00');
    end if;
    update gift_cards set balance = balance - new.amount where id = v_card.id;
    return new;
  elsif tg_op = 'DELETE' and old.gift_card_id is not null then
    update gift_cards set balance = least(amount, balance + old.amount) where id = old.gift_card_id;
    return old;
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.payments_gift_card() from public, anon, authenticated;
drop trigger if exists payments_gift_card_ins on public.payments;
create trigger payments_gift_card_ins before insert on public.payments for each row execute function public.payments_gift_card();
drop trigger if exists payments_gift_card_del on public.payments;
create trigger payments_gift_card_del after delete on public.payments for each row execute function public.payments_gift_card();
