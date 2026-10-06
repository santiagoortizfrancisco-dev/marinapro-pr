-- Marine Mechanics PR — "Le toca servicio" (mantenimiento por meses, como se trabaja en PR)
-- Correr en Supabase > SQL Editor después de 0007.

alter table public.maintenance_schedules
  add column if not exists interval_months integer,                                              -- cada cuántos meses se repite
  add column if not exists work_order_id   uuid references public.work_orders(id) on delete set null, -- el trabajo que lo creó
  add column if not exists notes           text;

create index if not exists maintenance_schedules_work_order_idx on public.maintenance_schedules (work_order_id);
