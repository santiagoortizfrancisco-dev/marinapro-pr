-- =============================================================================
-- Depósitos y abonos: el cliente puede pagar por partes (antes o después de la factura).
-- Cada pago se guarda aparte; cuando lo pagado llega al total de la factura, se marca Pagada sola.
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================

create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  work_order_id  uuid not null references public.work_orders(id) on delete cascade,
  amount         numeric(10,2) not null check (amount > 0),
  method         text not null default 'cash' check (method in ('ath_movil', 'cash', 'check', 'other')),
  paid_at        timestamptz not null default now(),
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists payments_work_order_idx on public.payments(work_order_id);

alter table public.payments enable row level security;
drop policy if exists payments_mechanic on public.payments;
create policy payments_mechanic on public.payments for all to authenticated
  using (public.can_manage_work_order(work_order_id)) with check (public.can_manage_work_order(work_order_id));
grant select, insert, update, delete on public.payments to authenticated;

-- Cuadra la factura con lo pagado: si ya se pagó todo → Pagada; si se quitó un pago y falta → sin pagar.
-- Las facturas viejas (marcadas pagadas sin pagos guardados) no se tocan.
create or replace function public.settle_work_order(p_wo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_inv   invoices%rowtype;
  v_paid  numeric;
  v_n     integer;
  v_last  payments%rowtype;
begin
  select * into v_inv from invoices where work_order_id = p_wo;
  if not found then return; end if;
  select coalesce(sum(amount), 0), count(*) into v_paid, v_n from payments where work_order_id = p_wo;
  if v_n = 0 then return; end if;

  if v_paid >= v_inv.total - 0.004 then
    if v_inv.paid_at is null then
      select * into v_last from payments where work_order_id = p_wo order by paid_at desc, created_at desc limit 1;
      update invoices set paid_at = v_last.paid_at, payment_method = v_last.method where id = v_inv.id;
      update work_orders set status = 'paid' where id = p_wo;
    end if;
  elsif v_inv.paid_at is not null then
    update invoices set paid_at = null, payment_method = null where id = v_inv.id;
    update work_orders set status = 'invoiced' where id = p_wo and status = 'paid';
  end if;
end $$;
revoke all on function public.settle_work_order(uuid) from public, anon, authenticated;

create or replace function public.payments_settle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.settle_work_order(coalesce(new.work_order_id, old.work_order_id));
  return null;
end $$;
revoke all on function public.payments_settle() from public, anon, authenticated;
drop trigger if exists payments_settle on public.payments;
create trigger payments_settle after insert or update or delete on public.payments
  for each row execute function public.payments_settle();

create or replace function public.invoices_settle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.settle_work_order(new.work_order_id);
  return null;
end $$;
revoke all on function public.invoices_settle() from public, anon, authenticated;
drop trigger if exists invoices_settle on public.invoices;
create trigger invoices_settle after insert or update of total on public.invoices
  for each row execute function public.invoices_settle();

-- ---------------------------------------------------------------------------
-- Estimado / factura del cliente: ahora trae los pagos (depósitos y abonos)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_document(p_token uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_inv  invoices%rowtype;
  v_wo   uuid;
  v_kind text;
  t      record;
begin
  select * into v_inv from invoices where public_token = p_token;
  if found then
    v_wo := v_inv.work_order_id;
    v_kind := 'invoice';
  else
    select id into v_wo from work_orders where public_token = p_token;
    if v_wo is null then return null; end if;
    v_kind := 'estimate';
  end if;
  select * into t from public.wo_totals(v_wo);

  return (
    select json_build_object(
      'kind', v_kind,
      'number', v_inv.number,
      'date', coalesce(v_inv.created_at, wo.created_at),
      'paid_at', v_inv.paid_at,
      'payment_method', v_inv.payment_method,
      'business', json_build_object('name', coalesce(m.business_name, p.full_name), 'owner', p.full_name, 'phone', p.phone,
                                    'email', p.email, 'town', p.town, 'ath_movil', m.ath_movil_number,
                                    'logo_path', m.logo_path, 'brand_color', m.brand_color),
      'client', json_build_object('name', c.full_name),
      'boat', json_build_object('name', b.name, 'make', b.make, 'model', b.model, 'year', b.year,
                                'marina', b.marina_name, 'slip', b.slip_number, 'town', b.town),
      'work', json_build_object('complaint', wo.complaint, 'diagnosis', wo.diagnosis, 'work_done', wo.work_done,
                                'status', wo.status, 'approved_at', wo.estimate_approved_at,
                                'sea_trial_required', wo.sea_trial_required, 'sea_trial_done', wo.sea_trial_done,
                                'sea_trial_method', wo.sea_trial_method, 'sea_trial_notes', wo.sea_trial_notes),
      'parts', coalesce((select json_agg(json_build_object('kind', pt.kind, 'description', pt.description, 'part_number', pt.part_number,
                                'qty', pt.qty, 'unit_cost', pt.unit_cost, 'supplied_by', pt.supplied_by) order by pt.created_at)
                           from work_order_parts pt where pt.work_order_id = wo.id), '[]'::json),
      'totals', case when v_kind = 'invoice'
        then json_build_object('labor_hours', v_inv.labor_hours, 'labor_rate', v_inv.labor_rate, 'labor', v_inv.labor_subtotal,
                               'parts', v_inv.parts_subtotal, 'ivu', v_inv.ivu_amount, 'ivu_rate', v_inv.ivu_rate,
                               'ivu_on_labor', v_inv.ivu_on_labor, 'ivu_on_parts', v_inv.ivu_on_parts, 'total', v_inv.total)
        else json_build_object('labor_hours', wo.labor_hours, 'labor_rate', wo.labor_rate, 'labor', t.labor,
                               'parts', t.parts, 'ivu', t.ivu, 'ivu_rate', t.ivu_rate,
                               'ivu_on_labor', wo.charge_ivu_labor, 'ivu_on_parts', wo.charge_ivu_parts, 'total', t.total) end,
      'payments', coalesce((select json_agg(json_build_object('amount', py.amount, 'method', py.method, 'paid_at', py.paid_at) order by py.paid_at, py.created_at)
                              from payments py where py.work_order_id = wo.id), '[]'::json),
      'warranty_days', m.warranty_days,
      'policies', m.policies_text
    )
    from work_orders wo
    join boats b on b.id = wo.boat_id
    join clients c on c.id = b.client_id
    join mechanics m on m.profile_id = c.mechanic_id
    join profiles p on p.id = m.profile_id
    where wo.id = v_wo
  );
end $$;
revoke all on function public.get_public_document(uuid) from public;
grant execute on function public.get_public_document(uuid) to anon, authenticated;
