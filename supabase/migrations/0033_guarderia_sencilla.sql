-- =============================================================================
-- Guardería, más sencilla:
--  · Cada zona tiene su precio: por pie al mes o fijo al mes. Al poner un bote en un espacio,
--    el precio del mes sale solo (pies del bote × precio de la zona).
--  · La línea de la renta en la factura: "Renta de octubre 2026 · Patio A · A-12 · 25 pies".
--  · Las guarderías empiezan con reglas de guardería (no la garantía de mecánico).
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================

alter table public.storage_zones add column if not exists price numeric(10,2) check (price is null or price >= 0);
alter table public.storage_zones add column if not exists per_foot boolean not null default true;

create or replace function public.storage_bill_month(p_month date default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  m        mechanics%rowtype;
  v_month  date := date_trunc('month', coalesce(p_month, (now() at time zone 'America/Puerto_Rico')::date))::date;
  v_next   date;
  v_label  text;
  k        record;
  v_wo     uuid;
  v_n      integer := 0;
  v_late   boolean;
begin
  if v_me is null then raise exception 'No autenticado'; end if;
  select * into m from mechanics where profile_id = v_me;
  if not found then raise exception 'No autorizado'; end if;
  v_next := (v_month + interval '1 month')::date;
  v_label := (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from v_month)::int]
             || ' ' || extract(year from v_month)::int;

  for k in
    select c.*, b.name as boat_name, b.length_ft, b.client_id, coalesce(r.name, 'Espacio') as rate_name
      from storage_contracts c join boats b on b.id = c.boat_id left join storage_rates r on r.id = c.rate_id
     where c.mechanic_id = v_me and c.status = 'active'
       and c.start_date < v_next and (c.end_date is null or c.end_date >= v_month)
       and not exists (select 1 from storage_bills sb where sb.contract_id = c.id and sb.month = v_month)
  loop
    insert into work_orders (boat_id, complaint, work_done, status, labor_hours, labor_rate, sea_trial_required, estimate_approved_at, estimate_approved_by, completed_at, charge_ivu_labor, charge_ivu_parts)
    values (k.boat_id, 'Renta de ' || v_label, 'Renta de ' || v_label, 'done', 0, 0, false, now(), 'mechanic', now(), m.ivu_on_labor, m.ivu_on_parts)
    returning id into v_wo;

    insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by)
    -- "Renta de octubre 2026 · Patio A · A-12 · 25 pies" (claro para el cliente)
    values (v_wo, 'service', 'Renta de ' || v_label || ' · ' || coalesce(nullif(k.space_label, ''), k.rate_name)
            || coalesce(' · ' || trim(to_char(k.length_ft, 'FM990.##')) || ' pies', ''), 1, k.monthly_price, 'mechanic');

    -- Lo suelto de ese bote que todavía no se ha facturado (hasta el fin de ese mes)
    insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by)
    select v_wo, 'service', s.description || ' · ' || to_char(s.charged_on, 'DD/MM'), s.qty, s.unit_price, 'mechanic'
      from storage_charges s
     where s.mechanic_id = v_me and s.boat_id = k.boat_id and s.work_order_id is null and s.charged_on < v_next;
    update storage_charges set work_order_id = v_wo
     where mechanic_id = v_me and boat_id = k.boat_id and work_order_id is null and charged_on < v_next;

    -- Cargo por atraso: si el cliente tiene facturas de la guardería vencidas sin pagar
    v_late := m.storage_late_fee is not null and exists (
      select 1 from invoices i join work_orders w on w.id = i.work_order_id join boats b on b.id = w.boat_id
       where b.client_id = k.client_id and i.mechanic_id = v_me and i.paid_at is null
         and i.due_date is not null and i.due_date < (now() at time zone 'America/Puerto_Rico')::date);
    if v_late then
      insert into work_order_parts (work_order_id, kind, description, qty, unit_cost, supplied_by)
      values (v_wo, 'service', 'Cargo por atraso', 1, m.storage_late_fee, 'mechanic');
    end if;

    perform public.create_invoice(v_wo);
    update invoices set due_date = greatest(v_month, (now() at time zone 'America/Puerto_Rico')::date) + m.storage_due_days
     where work_order_id = v_wo;
    insert into storage_bills (contract_id, month, work_order_id) values (k.id, v_month, v_wo);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;


-- Reglas de ejemplo de la guardería (el dueño las cambia en Mi negocio)
create or replace function public.storage_default_rules()
returns text language sql immutable as $$
  select 'La renta del espacio se paga por adelantado y vence en la fecha indicada en la factura. Pagos atrasados pueden llevar recargo.
El bote tiene que tener seguro vigente y marbete al día.
Para bajar o sacar el bote, avise con anticipación.
La guardería no responde por daños causados por tormentas, huracanes u otras causas fuera de su control.
(Texto a revisar con un abogado.)'
$$;

-- Al escoger "Guardería / Marina", si todavía tiene la garantía de mecánico que viene por defecto, se cambia
create or replace function public.storage_rules_on_trade()
returns trigger language plpgsql as $$
begin
  if new.business_type = 'storage' and coalesce(new.policies_text, '') ilike 'Garantía de mano de obra%' then
    new.policies_text := public.storage_default_rules();
  end if;
  return new;
end $$;
drop trigger if exists mechanics_storage_rules on public.mechanics;
create trigger mechanics_storage_rules before insert or update of business_type on public.mechanics
  for each row execute function public.storage_rules_on_trade();

update public.mechanics set policies_text = public.storage_default_rules()
 where business_type = 'storage' and policies_text ilike 'Garantía de mano de obra%';
