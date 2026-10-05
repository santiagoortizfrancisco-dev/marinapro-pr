# MarinaPro PR

App (PWA) para mecánicos de bote en Puerto Rico. Ver `CLAUDE.md` para el plan completo.

## Correr en la computadora

```bash
npm install
npm run dev
```

Abre http://localhost:5173. Sin `.env` la app entra en **modo demo** (solo para ver pantallas).
Para verla en el celular (misma Wi-Fi), usa la dirección "Network" que imprime `npm run dev`.

## Conectar Supabase (una sola vez)

1. Crea un proyecto en https://supabase.com (región `us-east-1` es la más cerca de PR).
2. **SQL Editor** → pega y corre, en orden:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_rls.sql`
3. **Authentication → Email Templates → Magic Link**: añade el código al email para que se pueda entrar
   desde la app instalada en el iPhone (el link abre Safari, no la app):
   ```html
   <h2>Tu código para entrar a MarinaPro</h2>
   <p style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
   <p>O toca aquí: <a href="{{ .ConfirmationURL }}">Entrar</a></p>
   ```
4. **Authentication → URL Configuration**: Site URL = la dirección de Render; en *Redirect URLs* añade
   `http://localhost:5173` y la de Render.
5. Copia `.env.example` como `.env` y pon `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
   (Project Settings → API). **Nunca** la `service_role`.
6. Datos de prueba (opcional): entra a la app, escoge "Soy mecánico", cambia el email en
   `supabase/seed.sql` y córrelo en el SQL Editor.

## Publicar en Render

1. Sube el código a GitHub.
2. Render → **New → Blueprint** → escoge el repo (usa `render.yaml`).
3. Pon `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` cuando lo pida.
4. Cada `git push` a `main` vuelve a publicar.
