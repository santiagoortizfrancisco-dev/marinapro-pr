-- =============================================================================
-- Tarjetas de regalo por internet (Navidad): el negocio anuncia un link por
-- WhatsApp; la clienta escoge la cantidad, paga por ATH Móvil y avisa. Al
-- negocio le sale "¿Te llegó?" y con "Sí, me llegó" la tarjeta se crea sola.
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================

create table if not exists public.gift_card_orders (
  id              uuid primary key default gen_random_uuid(),
  mechanic_id     uuid not null references public.mechanics(profile_id) on delete cascade,
  amount          numeric(10,2) not null check (amount >= 5 and amount <= 1000),
  buyer_name      text not null check (length(trim(buyer_name)) > 0),
  buyer_phone     text not null,
  recipient_name  text,
  status          text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  reported_at     timestamptz,                     -- la clienta dijo que ya envió el ATH Móvil
  gift_card_id    uuid references public.gift_cards(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists gift_card_orders_mechanic_idx on public.gift_card_orders(mechanic_id, status);
alter table public.gift_card_orders enable row level security;
drop policy if exists gift_card_orders_own on public.gift_card_orders;
create policy gift_card_orders_own on public.gift_card_orders for all to authenticated
  using (mechanic_id = auth.uid()) with check (mechanic_id = auth.uid());
grant select, insert, update, delete on public.gift_card_orders to authenticated;

-- El negocio del link: por su nombre de reservas (si tiene) o por su número
create or replace function public.gift_shop_owner(p_ref text)
returns uuid language sql stable security definer set search_path = public as $$
  select profile_id from mechanics
   where profile_id::text = p_ref or (booking_slug is not null and lower(booking_slug) = lower(p_ref))
   limit 1
$$;
revoke all on function public.gift_shop_owner(text) from public, anon, authenticated;

-- La página para comprar (solo si el negocio tiene ATH Móvil)
create or replace function public.gift_shop_page(p_ref text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('business', coalesce(m.business_name, p.full_name), 'town', p.town, 'phone', p.phone,
                            'logo_path', m.logo_path, 'ath', m.ath_movil_number)
    from mechanics m join profiles p on p.id = m.profile_id
   where m.profile_id = public.gift_shop_owner(p_ref) and coalesce(m.ath_movil_number, '') <> ''
$$;
revoke all on function public.gift_shop_page(text) from public;
grant execute on function public.gift_shop_page(text) to anon, authenticated;

-- La clienta pide su tarjeta
create or replace function public.gift_order_create(p_ref text, p_amount numeric, p_buyer text, p_phone text, p_recipient text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := public.gift_shop_owner(p_ref);
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_id     uuid;
begin
  if v_me is null or not exists (select 1 from mechanics where profile_id = v_me and coalesce(ath_movil_number, '') <> '') then
    raise exception 'Este negocio no está vendiendo tarjetas por aquí.';
  end if;
  if p_amount is null or p_amount < 5 or p_amount > 1000 then raise exception 'Escoge una cantidad entre $5 y $1,000.'; end if;
  if length(trim(coalesce(p_buyer, ''))) = 0 then raise exception 'Escribe tu nombre.'; end if;
  if length(v_digits) < 10 then raise exception 'Escribe tu número de WhatsApp (10 dígitos).'; end if;
  -- para que nadie llene la lista: máximo 5 pedidos sin confirmar por teléfono
  if (select count(*) from gift_card_orders where mechanic_id = v_me and status = 'pending'
        and regexp_replace(buyer_phone, '\D', '', 'g') = v_digits) >= 5 then
    raise exception 'Ya tienes pedidos esperando. El negocio te avisa cuando los confirme.';
  end if;
  insert into gift_card_orders (mechanic_id, amount, buyer_name, buyer_phone, recipient_name)
  values (v_me, round(p_amount, 2), left(trim(p_buyer), 80), left(trim(p_phone), 30), nullif(left(trim(coalesce(p_recipient, '')), 80), ''))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.gift_order_create(text, numeric, text, text, text) from public;
grant execute on function public.gift_order_create(text, numeric, text, text, text) to anon, authenticated;

-- Lo que ve la clienta de su pedido
create or replace function public.gift_order_public(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('business', coalesce(m.business_name, p.full_name), 'phone', p.phone, 'logo_path', m.logo_path,
           'ath', m.ath_movil_number, 'amount', o.amount, 'buyer', o.buyer_name, 'recipient', o.recipient_name,
           'status', o.status, 'reported_at', o.reported_at, 'gift_card_id', o.gift_card_id)
    from gift_card_orders o join mechanics m on m.profile_id = o.mechanic_id join profiles p on p.id = m.profile_id
   where o.id = p_id
$$;
revoke all on function public.gift_order_public(uuid) from public;
grant execute on function public.gift_order_public(uuid) to anon, authenticated;

-- La clienta avisa: "Ya envié el ATH Móvil"
create or replace function public.gift_order_paid(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update gift_card_orders set reported_at = coalesce(reported_at, now()) where id = p_id and status = 'pending'
$$;
revoke all on function public.gift_order_paid(uuid) from public;
grant execute on function public.gift_order_paid(uuid) to anon, authenticated;

-- El negocio: "Sí, me llegó" → se crea la tarjeta (pagada por ATH Móvil) y se devuelve
create or replace function public.gift_order_confirm(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o       gift_card_orders%rowtype;
  v_biz   text;
  v_code  text;
  v_card  gift_cards%rowtype;
begin
  select * into o from gift_card_orders where id = p_id and mechanic_id = auth.uid() for update;
  if not found then raise exception 'Ese pedido no es de tu negocio.'; end if;
  if o.status = 'done' then
    select * into v_card from gift_cards where id = o.gift_card_id;
    return to_jsonb(v_card);
  end if;
  if o.status <> 'pending' then raise exception 'Ese pedido está cancelado.'; end if;
  select coalesce(nullif(upper(left(regexp_replace(translate(business_name, 'ÁÉÍÓÚÑáéíóúñ', 'AEIOUNaeiouN'), '[^A-Za-z]', '', 'g'), 4)), ''), 'REGALO')
    into v_biz from mechanics where profile_id = o.mechanic_id;
  for i in 1..20 loop
    v_code := v_biz || '-' || (1000 + floor(random() * 9000))::int;
    exit when not exists (select 1 from gift_cards where mechanic_id = o.mechanic_id and code = v_code);
  end loop;
  insert into gift_cards (mechanic_id, code, amount, balance, recipient_name, buyer_name, phone, method, note)
  values (o.mechanic_id, v_code, o.amount, o.amount, o.recipient_name, o.buyer_name, o.buyer_phone, 'ath_movil', 'Comprada por internet')
  returning * into v_card;
  update gift_card_orders set status = 'done', gift_card_id = v_card.id where id = o.id;
  return to_jsonb(v_card);
end $$;
revoke all on function public.gift_order_confirm(uuid) from public, anon;
grant execute on function public.gift_order_confirm(uuid) to authenticated;

-- La época (Navidad) también en estas páginas
create or replace function public.public_season(p_kind text, p_ref text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid;
begin
  if p_kind = 'doc' then
    select i.mechanic_id into v_me from invoices i where i.public_token::text = p_ref;
    if v_me is null then
      select c.mechanic_id into v_me from work_orders w join boats b on b.id = w.boat_id join clients c on c.id = b.client_id
       where w.public_token::text = p_ref;
    end if;
  elsif p_kind = 'cita' then
    select a.mechanic_id into v_me from appointments a where a.id::text = p_ref;
  elsif p_kind = 'reservar' then
    select m.profile_id into v_me from mechanics m where m.booking_on and lower(m.booking_slug) = lower(p_ref);
  elsif p_kind = 'regalo' then
    select g.mechanic_id into v_me from gift_cards g where g.id::text = p_ref;
  elsif p_kind = 'regalar' then
    v_me := public.gift_shop_owner(p_ref);
  elsif p_kind = 'pedido' then
    select o.mechanic_id into v_me from gift_card_orders o where o.id::text = p_ref;
  end if;
  return (select season from mechanics where profile_id = v_me);
end $$;
revoke all on function public.public_season(text, text) from public;
grant execute on function public.public_season(text, text) to anon, authenticated;
