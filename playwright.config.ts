import { defineConfig, devices } from '@playwright/test'

// Bot de pruebas de pantallas: usa el app como un iPhone, contra el Supabase de PRUEBA (no toca datos reales).
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  workers: 1, // las pruebas comparten el Supabase de prueba
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4321',
    locale: 'es-PR',
    timezoneId: 'America/Puerto_Rico',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'iPhone', use: { ...devices['iPhone 13'] } }],
  webServer: [
    { command: 'node tests/mock-supabase.mjs', url: 'http://localhost:54321/__state', reuseExistingServer: !process.env.CI },
    { command: 'npm run build:test && npx vite preview --outDir dist-test --port 4321 --strictPort', url: 'http://localhost:4321', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
})
