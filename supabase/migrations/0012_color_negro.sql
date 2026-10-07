-- Salt Boat Repair — La barra de arriba pasa a NEGRO (app blanca, negra y azul)
-- Los mecánicos que tenían el color que venía por defecto (azul marino #0b3b5c) pasan a negro.
-- El que escogió otro color en "Mi negocio" (ej. JQR) se queda con el suyo.
-- Correr en Supabase > SQL Editor después de 0011.

alter table public.mechanics alter column brand_color set default '#0b1220';

update public.mechanics set brand_color = '#0b1220'
 where brand_color in ('#0b3b5c', '#0c4a6e');

-- Mecánicos nuevos creados con invitación: también negro
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv mechanic_invites%rowtype;
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;

  select * into inv from mechanic_invites where lower(email) = lower(new.email);
  if found then
    update profiles set role = 'mechanic', full_name = inv.full_name, phone = inv.phone, town = inv.town
     where id = new.id;
    insert into mechanics (profile_id, business_name, ath_movil_number, labor_rate_hour, logo_path, brand_color, policies_text)
    values (new.id, coalesce(inv.business_name, inv.full_name), inv.ath_movil_number, coalesce(inv.labor_rate_hour, 0),
            inv.logo_path, coalesce(inv.brand_color, '#0b1220'), default_policies())
    on conflict (profile_id) do nothing;
  end if;
  return new;
end $$;
