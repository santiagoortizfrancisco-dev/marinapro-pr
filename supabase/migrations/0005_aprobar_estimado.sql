-- MarinaPro PR — El cliente aprueba el estimado desde el link de WhatsApp
-- Correr en Supabase > SQL Editor después de 0004.

alter table public.work_orders
  add column if not exists estimate_approved_by text check (estimate_approved_by in ('client', 'mechanic')),
  add column if not exists approval_seen_at timestamptz;   -- cuándo el mecánico vio el aviso de "el cliente aprobó"

-- Aprobar con el link secreto (sin cuenta). Guarda la fecha, quién aprobó y la versión de las políticas.
-- Si ya estaba aprobado o ya tiene factura, no cambia nada.
create or replace function public.approve_estimate(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_wo   work_orders%rowtype;
  v_ver  integer;
begin
  select * into v_wo from work_orders where public_token = p_token for update;
  if not found then raise exception 'No existe ese estimado'; end if;

  if v_wo.estimate_approved_at is null and not exists (select 1 from invoices where work_order_id = v_wo.id) then
    select m.policies_version into v_ver
      from boats b join clients c on c.id = b.client_id join mechanics m on m.profile_id = c.mechanic_id
     where b.id = v_wo.boat_id;
    update work_orders
       set estimate_approved_at = now(),
           estimate_approved_by = 'client',
           policies_accepted_version = v_ver,
           approval_seen_at = null,
           status = case when status = 'estimate' then 'approved' else status end
     where id = v_wo.id
    returning * into v_wo;
  end if;

  return json_build_object('approved_at', v_wo.estimate_approved_at, 'approved_by', v_wo.estimate_approved_by);
end $$;
revoke all on function public.approve_estimate(uuid) from public;
grant execute on function public.approve_estimate(uuid) to anon, authenticated;
