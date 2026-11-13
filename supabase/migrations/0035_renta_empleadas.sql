-- =============================================================================
-- Empleadas que le pagan RENTA al salón por su espacio (en vez de comisión).
-- Cada empleada: comisión (como siempre) o renta con su cantidad, por semana o por mes.
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================
alter table public.staff add column if not exists pay_type text not null default 'commission';
alter table public.staff add column if not exists rent_amount numeric(10,2);
alter table public.staff add column if not exists rent_period text not null default 'week';
do $$ begin
  alter table public.staff add constraint staff_pay_type_check check (pay_type in ('commission', 'rent'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.staff add constraint staff_rent_period_check check (rent_period in ('week', 'month'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.staff add constraint staff_rent_amount_check check (rent_amount is null or rent_amount >= 0);
exception when duplicate_object then null; end $$;
