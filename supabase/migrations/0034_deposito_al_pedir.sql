-- =============================================================================
-- Citas por internet: el depósito se pide en el momento.
-- Al pedir la cita por el link del salón, la cita ya trae el depósito del salón (Más → Citas por internet),
-- y la clienta pasa directo a la página de su cita (/cita/:id) para enviarlo y tocar "Acepto y ya envié el depósito".
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================
create or replace function public.online_deposit_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'online' and new.deposit_asked is null then
    select booking_deposit into new.deposit_asked from mechanics where profile_id = new.mechanic_id;
  end if;
  return new;
end $$;
drop trigger if exists appointments_online_deposit on public.appointments;
create trigger appointments_online_deposit before insert on public.appointments
  for each row execute function public.online_deposit_on_insert();
