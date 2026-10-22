-- =============================================================================
-- Políticas del salón y menú sin precios.
--
-- Políticas: un salón no da "garantía de mano de obra", ni habla de piezas
-- ni de prueba en el agua. Cuando un negocio es de belleza y no ha escrito sus propias
-- políticas, le tocan las del salón (y al revés si vuelve a ser de otro oficio).
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================

create or replace function public.salon_policies()
returns text language sql immutable as $$
select 'Si no puedes llegar, avísanos con 24 horas de anticipación.
Si llegas más de 15 minutos tarde, puede que tengamos que acortar o mover tu cita.
Si se te levanta o se te rompe una uña en los primeros 3 días, te la arreglamos sin costo (no incluye golpes o mal uso).
Los depósitos no se devuelven si no llegas a la cita sin avisar.'
$$;

create or replace function public.trade_policies()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.business_type is distinct from old.business_type then
    -- Solo si todavía tiene las que vienen con el app (no se tocan las que el negocio escribió)
    if new.business_type = 'beauty' and coalesce(trim(new.policies_text), '') in ('', default_policies()) then
      new.policies_text := salon_policies();
      new.warranty_days := 3;
    elsif old.business_type = 'beauty' and new.business_type <> 'beauty' and coalesce(trim(new.policies_text), '') in ('', salon_policies()) then
      new.policies_text := default_policies();
      new.warranty_days := 90;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trade_policies on public.mechanics;
create trigger trade_policies before update of business_type on public.mechanics
  for each row execute function public.trade_policies();

-- Los salones que ya existen con las políticas de mecánico
update public.mechanics set policies_text = salon_policies(), warranty_days = 3
 where business_type = 'beauty' and coalesce(trim(policies_text), '') in ('', default_policies());

-- ---------------------------------------------------------------------------
-- Menú del salón SIN precios: el precio cambia por persona y se pone al cobrar.
-- (Cada salón le puede poner precio fijo al que quiera en "Mis servicios".)
-- ---------------------------------------------------------------------------
create or replace function public.seed_beauty_services(p_mech uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_mech is distinct from auth.uid() and not public.is_app_admin() then raise exception 'No autorizado'; end if;
  insert into catalog_items (mechanic_id, kind, name, category, last_price, duration_min)
  select p_mech, 'service', v.name, v.cat, null, v.mins
    from (values
      ('Uñas acrílicas (set completo)', 'Uñas', 90),
      ('Relleno de acrílico', 'Uñas', 60),
      ('Uñas de gel (set)', 'Uñas', 75),
      ('Manicura con gel', 'Uñas', 45),
      ('Manicura básica', 'Uñas', 30),
      ('Pedicura', 'Uñas', 45),
      ('Pedicura spa', 'Uñas', 60),
      ('Diseño de uñas', 'Uñas', 15),
      ('Quitar acrílico', 'Uñas', 30),
      ('Corte de dama', 'Pelo', 45),
      ('Blower', 'Pelo', 45),
      ('Tinte', 'Pelo', 120),
      ('Mechas / Balayage', 'Pelo', 180),
      ('Keratina', 'Pelo', 150),
      ('Masaje relajante (60 min)', 'Spa', 60),
      ('Facial', 'Spa', 60),
      ('Cejas', 'Spa', 15),
      ('Pestañas', 'Spa', 90)
    ) as v(name, cat, mins)
  on conflict do nothing;
end $$;
revoke all on function public.seed_beauty_services(uuid) from public, anon;
grant execute on function public.seed_beauty_services(uuid) to authenticated;

-- Los menús de salón que ya se crearon con los precios de ejemplo: se quitan esos precios
-- (solo si siguen iguales a los de ejemplo; si el salón puso el suyo, se queda)
update public.catalog_items c set last_price = null
  from public.mechanics m, (values
      ('Uñas acrílicas (set completo)', 40), ('Relleno de acrílico', 30), ('Uñas de gel (set)', 35), ('Manicura con gel', 25),
      ('Manicura básica', 15), ('Pedicura', 25), ('Pedicura spa', 35), ('Diseño de uñas', 5), ('Quitar acrílico', 15),
      ('Corte de dama', 25), ('Blower', 25), ('Tinte', 60), ('Mechas / Balayage', 120), ('Keratina', 150),
      ('Masaje relajante (60 min)', 60), ('Facial', 50), ('Cejas', 10), ('Pestañas', 60)
    ) as v(name, price)
 where m.profile_id = c.mechanic_id and m.business_type = 'beauty'
   and c.name = v.name and c.last_price = v.price;
