# Salt Marine Repair (antes Salt Boat Repair / MarinaPro PR) — App para mecánicos marinos (botes y jet skis)

## Qué es
App web instalable (PWA), en español, para mecánicos de bote independientes en Puerto Rico.
Tiene dos caras dentro del mismo sistema:
- **App del mecánico** (el que paga): agenda, clientes, botes, órdenes de trabajo, piezas, fotos, facturas y recordatorios de mantenimiento.
- **App del cliente** (gratis): reporta problemas, pide citas, aprueba estimados, ve fotos, facturas e historial de su bote.

Todo lo que hace el cliente le llega al mecánico como aviso, y viceversa.

**Plan:** el dueño del proyecto (Francisco) la usa primero con su propio bote y un mecánico amigo. Luego se le da gratis a un mecánico por 1 a 3 meses. El MVP debe ser simple, rápido en el celular y confiable.

## Stack
- **Frontend:** React + Vite + TypeScript, Tailwind CSS, `vite-plugin-pwa` (instalable en iPhone y Android).
- **Backend:** Supabase (Postgres, Auth, Storage para fotos, Edge Functions, pg_cron).
- **Email:** Resend (avisos y recordatorios de mantenimiento).
- **Hosting:** Render (static site, ver `render.yaml`). Código en GitHub.
- No usar SQLite en disco del servidor: en hosting gratis el disco se borra. Todos los datos van a Supabase.

## Reglas del proyecto
- Toda la interfaz en **español de Puerto Rico** (“bote”, “guardería”, “muelle”, “marbete”, “ATH Móvil”). Código, variables y nombres de tablas en inglés.
- **Mobile-first:** diseñado para usarse con una mano en el muelle. Botones grandes, pocos pasos, buen contraste a pleno sol.
- Moneda USD, formato `$1,234.56`. Fechas `dd/mm/aaaa`, zona horaria `America/Puerto_Rico`.
- Fotos comprimidas en el celular antes de subirlas (máx. ~1600 px de lado).
- Seguridad con **Row Level Security** en todas las tablas: el mecánico solo ve sus clientes; el cliente solo ve sus botes y sus trabajos.
- Nada de datos inventados en producción. Para desarrollo, un script `seed` con datos de prueba realistas (pueblos de PR, marinas como Puerto del Rey, Villa Marina, Club Náutico de Ponce; motores Yamaha, Mercury, Suzuki).
- Antes de cada hito: proponer el plan y esperar el OK. Después: explicar cómo probarlo.
- **Bot de pruebas (obligatorio):** antes de publicar, `npm test` tiene que pasar (base de datos en `tests/db.test.mjs` + pantallas como iPhone en `tests/app.spec.ts`, contra el Supabase de prueba `tests/mock-supabase.mjs`). Cada función nueva o arreglo lleva su prueba. En GitHub corre solo en cada push y Render solo publica si pasa. Francisco lo puede correr con "Probar la app.bat".

## Roles
- `mechanic`: dueño del negocio. En el MVP, un mecánico por cuenta.
- `client`: dueño de bote. Se conecta a un mecánico por link de invitación o código QR (WhatsApp).
- Un cliente puede tener varios botes; un bote puede tener 1 o más motores.

## Modelo de datos (punto de partida)
- `profiles` (id = auth user, role, full_name, phone, email, town)
- `mechanics` (profile_id, business_name, ath_movil_number, labor_rate_hour, ivu_rate default 0.115, warranty_days default 90, policies_text, policies_version)
- `clients` (id, mechanic_id, profile_id nullable — puede existir antes de que el cliente se registre, full_name, phone, email, town, notes)
- `boats` (client_id, name, make, model, year, length_ft, hull_id, location_type: `water_slip | dry_storage | home | trailer`, marina_name, slip_number, town, lat, lng, location_notes)
- `engines` (boat_id, position: `port | starboard | center | single`, make, model, hp, serial_number, hours, fuel: `gas | diesel`)
- `service_requests` (boat_id, client_id, description, urgency, status: `new | seen | scheduled | closed`, created_at) + fotos/video/nota de voz en Storage
- `appointments` (mechanic_id, boat_id, service_request_id nullable, starts_at, duration_min, status: `requested | confirmed | done | cancelled`, notes)
- `work_orders` (boat_id, appointment_id, diagnosis, status: `estimate | approved | waiting_parts | in_progress | sea_trial | done | invoiced | paid`, labor_hours, labor_rate, estimate_approved_at, policies_accepted_version, sea_trial_done, sea_trial_method: `water | hose_muffs | not_allowed`, sea_trial_notes)
- `work_order_parts` (work_order_id, description, part_number, qty, unit_cost, supplied_by: `client | mechanic`, supplier, eta, received_at)
- `photos` (work_order_id, kind: `before | old_part | new_part | after`, storage_path, caption, taken_at)
- `invoices` (work_order_id, number, labor_subtotal, parts_subtotal, ivu_amount, total, sent_at, paid_at, payment_method: `ath_movil | cash | check | other`)
- `maintenance_schedules` (boat_id, engine_id nullable, service_type, due_date nullable, due_hours nullable, last_notified_at, status)
- `notifications` (user_id, type, payload, read_at)

## Reglas de negocio
- **Piezas:** si `supplied_by = client`, la pieza no se cobra ni lleva garantía del mecánico (solo la instalación). Si `supplied_by = mechanic`, va en la factura al costo indicado.
- **IVU:** configurable por mecánico (default 11.5%). Debe poder aplicarse a mano de obra y/o piezas por separado. Mostrar el desglose en la factura. (Confirmar tasas y aplicabilidad con un contable antes de producción.)
- **Estimado:** el cliente lo aprueba desde su app antes de empezar; al aprobar, acepta la versión vigente de las políticas (se guarda versión y fecha/hora).
- **Prueba en el agua:** obligatoria para trabajos de motor, propulsión o eléctricos. Si el cliente no la permite, se marca `not_allowed` y la factura indica que la garantía queda anulada.
- **Fotos:** toda pieza cambiada debe tener foto `old_part` y `new_part` antes de poder marcar el trabajo como `done` (avisar, no bloquear, en el MVP).
- **Pago:** la factura muestra el número de ATH Móvil del mecánico; el mecánico marca “Pagado”. (Integración con ATH Móvil Business: fase posterior.)
- **Mantenimiento:** al cerrar un trabajo, el mecánico puede crear el próximo servicio (por fecha y/o horas de motor). Un job diario envía email y notificación 14 días y 3 días antes; desde la alerta el cliente pide cita.

## Políticas por defecto (editables por el mecánico)
Garantía de mano de obra 90 días; reclamar dentro de 30 días de notar el defecto. Piezas del mecánico: garantía del fabricante. Piezas del cliente: solo se garantiza la instalación. Trabajos eléctricos: no se garantiza cableado viejo o corroído fuera del área trabajada. Sin prueba en el agua, la garantía queda anulada. Trabajo con balance pendiente no tiene garantía. No se responde por daños indirectos. *(Texto a revisar con abogado.)*

## Hitos de desarrollo
**Decisión (2026-10-05):** primero SOLO la app del mecánico (Fase 1). La app del cliente queda para la Fase 2.
En la Fase 1 el cliente no tiene cuenta: es un registro del mecánico (`clients.profile_id` queda null) y recibe
facturas y recordatorios por WhatsApp/email sin instalar nada. Al entrar, todo usuario nuevo es mecánico
(no se muestra "Tengo un bote"). La base de datos y la RLS del cliente se quedan como están para la Fase 2.

1. ✅ **Base:** PWA, Supabase, login con código por email (SMTP Gmail marinepropr@gmail.com), roles, navegación inferior, migraciones + RLS + seed. Publicada en Render.

**Fase 1 — app del mecánico**
2. **Clientes y botes:** CRUD de clientes, botes (ubicación: agua/muelle, guardería, casa, trailer; pueblo; pin en mapa) y motores. Llamar / WhatsApp al cliente.
3. **Agenda:** vista de día y semana; crear, confirmar, mover y cancelar citas.
4. **Órdenes de trabajo:** estimado → el mecánico marca "aprobado por el cliente" (guarda versión de políticas y fecha) → estados → piezas (quién las compra) → fotos antes/después y pieza vieja/nueva → prueba en el agua.
5. **Factura y pago:** factura con IVU, link público para enviar por WhatsApp y email (el cliente no necesita cuenta), ATH Móvil, marcar pagado, historial.
6. **Mantenimiento:** próximos servicios por bote/motor, job diario (pg_cron + Edge Function) que envía email al cliente.
7. **Prueba real:** el mecánico amigo la usa 1 a 3 meses; dominio propio si hace falta.

**Fase 2 — app del cliente (después)**
8. Invitación por link/QR, ver mis botes, reportar problema (texto + fotos/video), pedir cita, aprobar estimados en la app, avisos.

## Fuera del MVP
Directorio público de mecánicos por pueblo, firma digital, reportes de ingresos, varios mecánicos por taller, integración ATH Móvil Business, WhatsApp API, inventario de piezas.
