-- MarinaPro PR — Hito 1: seguridad (Row Level Security)
-- Regla: el mecánico solo ve SUS clientes (y todo lo que cuelga de ellos);
--        el cliente solo ve SUS botes y SUS trabajos.

-- ---------------------------------------------------------------------------
-- Funciones de ayuda (security definer para no caer en recursión de políticas)
-- ---------------------------------------------------------------------------
create or replace function public.is_my_client(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clients where id = p_client and mechanic_id = auth.uid())
$$;

create or replace function public.is_me_client(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clients where id = p_client and profile_id = auth.uid())
$$;

create or replace function public.can_manage_boat(p_boat uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from boats b join clients c on c.id = b.client_id
    where b.id = p_boat and c.mechanic_id = auth.uid())
$$;

create or replace function public.is_my_boat(p_boat uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from boats b join clients c on c.id = b.client_id
    where b.id = p_boat and c.profile_id = auth.uid())
$$;

create or replace function public.can_manage_work_order(p_wo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from work_orders w where w.id = p_wo and public.can_manage_boat(w.boat_id))
$$;

create or replace function public.is_my_work_order(p_wo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from work_orders w where w.id = p_wo and public.is_my_boat(w.boat_id))
$$;

-- ---------------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.mechanics             enable row level security;
alter table public.clients               enable row level security;
alter table public.boats                 enable row level security;
alter table public.engines               enable row level security;
alter table public.service_requests      enable row level security;
alter table public.appointments          enable row level security;
alter table public.work_orders           enable row level security;
alter table public.work_order_parts      enable row level security;
alter table public.photos                enable row level security;
alter table public.invoices              enable row level security;
alter table public.maintenance_schedules enable row level security;
alter table public.notifications         enable row level security;

-- profiles: cada uno ve el suyo; el mecánico ve a sus clientes registrados; el cliente ve a su mecánico.
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or exists (select 1 from clients c where c.profile_id = profiles.id and c.mechanic_id = auth.uid())
  or exists (select 1 from clients c where c.mechanic_id = profiles.id and c.profile_id = auth.uid())
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- El rol y el email no se cambian desde la app (el rol solo con set_my_role)
revoke update on public.profiles from authenticated;
grant update (full_name, phone, town) on public.profiles to authenticated;

-- mechanics: el dueño lo ve y lo edita; sus clientes lo ven (nombre del negocio, ATH Móvil, políticas).
create policy mechanics_select on public.mechanics for select to authenticated using (
  profile_id = auth.uid()
  or exists (select 1 from clients c where c.mechanic_id = mechanics.profile_id and c.profile_id = auth.uid())
);
create policy mechanics_update on public.mechanics for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- clients
create policy clients_mechanic on public.clients for all to authenticated
  using (mechanic_id = auth.uid()) with check (mechanic_id = auth.uid());
create policy clients_self_select on public.clients for select to authenticated
  using (profile_id = auth.uid());

-- boats
create policy boats_mechanic on public.boats for all to authenticated
  using (public.is_my_client(client_id)) with check (public.is_my_client(client_id));
create policy boats_client_select on public.boats for select to authenticated
  using (public.is_me_client(client_id));
create policy boats_client_insert on public.boats for insert to authenticated
  with check (public.is_me_client(client_id));
create policy boats_client_update on public.boats for update to authenticated
  using (public.is_me_client(client_id)) with check (public.is_me_client(client_id));

-- engines
create policy engines_mechanic on public.engines for all to authenticated
  using (public.can_manage_boat(boat_id)) with check (public.can_manage_boat(boat_id));
create policy engines_client_select on public.engines for select to authenticated
  using (public.is_my_boat(boat_id));

-- service_requests: el cliente las crea y las ve; el mecánico las ve y cambia el estado.
create policy sr_mechanic on public.service_requests for all to authenticated
  using (public.can_manage_boat(boat_id)) with check (public.can_manage_boat(boat_id));
create policy sr_client_select on public.service_requests for select to authenticated
  using (public.is_my_boat(boat_id));
create policy sr_client_insert on public.service_requests for insert to authenticated
  with check (public.is_my_boat(boat_id) and public.is_me_client(client_id) and status = 'new');

-- appointments: el cliente solo puede PEDIR (status requested) para su propio bote y su mecánico.
create policy appt_mechanic on public.appointments for all to authenticated
  using (mechanic_id = auth.uid())
  with check (mechanic_id = auth.uid() and public.can_manage_boat(boat_id));
create policy appt_client_select on public.appointments for select to authenticated
  using (public.is_my_boat(boat_id));
create policy appt_client_insert on public.appointments for insert to authenticated
  with check (
    status = 'requested'
    and public.is_my_boat(boat_id)
    and exists (select 1 from boats b join clients c on c.id = b.client_id
                where b.id = appointments.boat_id and c.mechanic_id = appointments.mechanic_id)
  );

-- work_orders (la aprobación del estimado por el cliente será una función en el Hito 5)
create policy wo_mechanic on public.work_orders for all to authenticated
  using (public.can_manage_boat(boat_id)) with check (public.can_manage_boat(boat_id));
create policy wo_client_select on public.work_orders for select to authenticated
  using (public.is_my_boat(boat_id));

create policy wop_mechanic on public.work_order_parts for all to authenticated
  using (public.can_manage_work_order(work_order_id)) with check (public.can_manage_work_order(work_order_id));
create policy wop_client_select on public.work_order_parts for select to authenticated
  using (public.is_my_work_order(work_order_id));

create policy photos_mechanic on public.photos for all to authenticated
  using (public.can_manage_work_order(work_order_id)) with check (public.can_manage_work_order(work_order_id));
create policy photos_client_select on public.photos for select to authenticated
  using (public.is_my_work_order(work_order_id));

create policy invoices_mechanic on public.invoices for all to authenticated
  using (public.can_manage_work_order(work_order_id)) with check (public.can_manage_work_order(work_order_id));
create policy invoices_client_select on public.invoices for select to authenticated
  using (public.is_my_work_order(work_order_id));

create policy ms_mechanic on public.maintenance_schedules for all to authenticated
  using (public.can_manage_boat(boat_id)) with check (public.can_manage_boat(boat_id));
create policy ms_client_select on public.maintenance_schedules for select to authenticated
  using (public.is_my_boat(boat_id));

-- notifications: cada uno ve las suyas y las marca leídas. Las crean funciones del servidor.
create policy notif_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
