-- =============================================================================
-- Registro sin aprobación: la cuenta nueva entra enseguida (sin esperar al admin).
-- Al admin le llega un aviso al teléfono de que alguien se registró (solo para que sepa).
-- El admin todavía puede bloquear una cuenta en Admin si hace falta.
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================

alter table public.profiles alter column access set default 'approved';

-- Los que estaban esperando, entran
update public.profiles set access = 'approved', access_changed_at = now() where access = 'pending';

-- Aviso al teléfono: cuenta nueva (no las pruebas del /demo)
create or replace function public.notify_new_mechanic()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select trial from profiles where id = new.profile_id), false) then
    perform public.notify_admin('Cuenta nueva',
      coalesce(new.business_name, 'Alguien') || ' se registró en FacturaFácil PR.', 'tada');
  end if;
  return new;
end $$;
