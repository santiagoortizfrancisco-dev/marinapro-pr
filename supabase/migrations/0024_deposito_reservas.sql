-- =============================================================================
-- Citas por internet con depósito: el salón decide si pide depósito (y cuánto).
-- La clienta no lo ve al reservar: se le pide en el mensaje cuando el salón le confirma
-- la cita, con el ATH Móvil del salón.
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================

alter table public.mechanics add column if not exists booking_deposit numeric(10,2);
do $$ begin
  alter table public.mechanics add constraint mechanics_booking_deposit_check check (booking_deposit is null or booking_deposit > 0);
exception when duplicate_object then null; end $$;
