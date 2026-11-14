-- =============================================================================
-- Modo Navidad: cada negocio lo prende o lo apaga en Más.
-- Con Navidad prendida, el app se ve navideño y todo lo que se le envía a la
-- clientela por WhatsApp (y las páginas que abren) sale con saludo de Navidad.
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================
alter table public.mechanics add column if not exists season text;
do $$ begin
  alter table public.mechanics add constraint mechanics_season_check check (season is null or season in ('christmas'));
exception when duplicate_object then null; end $$;

-- Para las páginas públicas (factura, cita, reservar, tarjeta de regalo): ¿el negocio tiene Navidad prendida?
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
  end if;
  return (select season from mechanics where profile_id = v_me);
end $$;
revoke all on function public.public_season(text, text) from public;
grant execute on function public.public_season(text, text) to anon, authenticated;
