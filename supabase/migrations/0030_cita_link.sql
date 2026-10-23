-- =============================================================================
-- Salón: el link de la cita para la clienta.
-- Le llega por WhatsApp: ve su cita, el estimado (servicios y precio), el depósito
-- y el ATH Móvil del salón. Toca "Acepto y ya envié el depósito" y al salón le sale
-- el aviso para verificarlo en su ATH Móvil y anotarlo con un toque.
-- El link lleva el id de la cita (imposible de adivinar); solo enseña esa cita.
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================

alter table public.appointments
  add column if not exists deposit_asked       numeric(10,2),
  add column if not exists client_ok_at        timestamptz,
  add column if not exists deposit_reported_at timestamptz,
  add column if not exists deposit_ok_at       timestamptz;

create or replace function public.cita_public(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'business', coalesce(m.business_name, p.full_name), 'phone', p.phone, 'town', p.town,
    'logo_path', m.logo_path, 'ath', m.ath_movil_number, 'policies', m.policies_text, 'ivu_rate', m.ivu_rate,
    'client', split_part(c.full_name, ' ', 1), 'starts_at', a.starts_at, 'duration_min', a.duration_min,
    'status', a.status, 'staff', s.name, 'deposit', a.deposit_asked,
    'client_ok_at', a.client_ok_at, 'reported_at', a.deposit_reported_at, 'deposit_ok_at', a.deposit_ok_at,
    'charge_ivu', coalesce(w.charge_ivu_labor, false),
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', x.description, 'price', x.qty * x.unit_cost) order by x.created_at)
                  from work_order_parts x where x.work_order_id = w.id), '[]'::jsonb))
    from appointments a
    join boats b on b.id = a.boat_id
    join clients c on c.id = b.client_id
    join mechanics m on m.profile_id = a.mechanic_id
    join profiles p on p.id = m.profile_id
    left join staff s on s.id = a.staff_id
    left join lateral (select * from work_orders wo where wo.appointment_id = a.id order by wo.created_at limit 1) w on true
   where a.id = p_id
$$;
grant execute on function public.cita_public(uuid) to anon, authenticated;

-- La clienta acepta (y dice que envió el depósito, si se le pidió)
create or replace function public.cita_reply(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update appointments
     set client_ok_at = coalesce(client_ok_at, now()),
         deposit_reported_at = case when coalesce(deposit_asked, 0) > 0 and deposit_ok_at is null then now() else deposit_reported_at end
   where id = p_id and status <> 'cancelled'
$$;
grant execute on function public.cita_reply(uuid) to anon, authenticated;
