-- =============================================================================
-- El tipo de negocio (oficio) se escoge UNA sola vez, al crear la cuenta.
-- Después queda fijo: solo el administrador del app lo puede cambiar
-- (así nadie lo cambia por error y se le pone el app "de otro oficio").
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================

alter table public.mechanics add column if not exists business_type_set boolean not null default false;

-- Las cuentas que ya existen ya escogieron (o quedaron como botes): fijas
update public.mechanics set business_type_set = true where not business_type_set;

create or replace function public.lock_business_type()
returns trigger language plpgsql set search_path = public as $$
begin
  -- El administrador del app (o el SQL Editor de Supabase, sin usuario) puede cambiarlo siempre
  if auth.uid() is null or public.is_app_admin() then
    new.business_type_set := true;
    return new;
  end if;
  if old.business_type_set then
    if new.business_type is distinct from old.business_type then
      raise exception 'El tipo de negocio ya se escogió. Para cambiarlo, escríbele al administrador.';
    end if;
    new.business_type_set := true; -- nadie lo "desbloquea"
  elsif new.business_type is distinct from old.business_type or new.business_type_set then
    -- La primera vez (al crear la cuenta): se guarda y queda fijo
    new.business_type_set := true;
  end if;
  return new;
end $$;

-- Corre antes que trade_policies (orden alfabético) para que un cambio no permitido ni llegue a las políticas
drop trigger if exists lock_business_type on public.mechanics;
create trigger lock_business_type before update on public.mechanics
  for each row execute function public.lock_business_type();
