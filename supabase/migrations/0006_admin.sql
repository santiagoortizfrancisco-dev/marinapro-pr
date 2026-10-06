-- Marine Mechanics PR — Admin sencillo (solo para el dueño del app)
-- Ve cuántos mecánicos hay y cuánto usa cada uno. NO ve los nombres ni teléfonos de los clientes de ellos.
-- Correr en Supabase > SQL Editor después de 0005.

create table if not exists public.app_admins (
  email       text primary key,
  created_at  timestamptz not null default now()
);
alter table public.app_admins enable row level security;   -- sin políticas: la app no la puede leer ni cambiar

insert into public.app_admins (email) values ('santiagoortizfrancisco@gmail.com')
on conflict (email) do nothing;

-- ¿El que está usando el app es admin?
create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from app_admins a join profiles p on lower(p.email) = lower(a.email)
     where p.id = auth.uid())
$$;
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

-- Resumen por mecánico: solo números y fechas.
create or replace function public.admin_overview()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Solo para el administrador'; end if;
  return coalesce((
    select json_agg(row_to_json(x) order by x.last_activity desc nulls last, x.created_at desc)
    from (
      select
        p.id,
        p.email,
        p.full_name,
        m.business_name,
        p.created_at,
        u.last_sign_in_at,
        (select count(*) from clients c where c.mechanic_id = p.id)                                         as clients,
        (select count(*) from boats b join clients c on c.id = b.client_id where c.mechanic_id = p.id)       as boats,
        (select count(*) from appointments a where a.mechanic_id = p.id)                                     as appointments,
        (select count(*) from work_orders w join boats b on b.id = w.boat_id join clients c on c.id = b.client_id
          where c.mechanic_id = p.id)                                                                        as work_orders,
        (select count(*) from invoices i where i.mechanic_id = p.id)                                         as invoices,
        (select coalesce(sum(i.total), 0) from invoices i where i.mechanic_id = p.id and i.paid_at is not null) as paid_total,
        greatest(
          (select max(c.created_at) from clients c where c.mechanic_id = p.id),
          (select max(a.created_at) from appointments a where a.mechanic_id = p.id),
          (select max(w.created_at) from work_orders w join boats b on b.id = w.boat_id join clients c on c.id = b.client_id where c.mechanic_id = p.id),
          (select max(i.created_at) from invoices i where i.mechanic_id = p.id)
        )                                                                                                    as last_activity
      from profiles p
      left join mechanics m on m.profile_id = p.id
      left join auth.users u on u.id = p.id
      where p.role = 'mechanic' or p.role is null
    ) x
  ), '[]'::json);
end $$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
