import { defineConfig } from '@playwright/test';

/* Uji otomatis eap/web (Playwright). Berjalan terhadap stack Compose yang SUDAH hidup (gateway keis.localhost:8088, Keycloak :8180) — tidak menjalankan server sendiri.
   Kredensial lewat env: E2E_USERNAME, E2E_PASSWORD (akun uji; tanpa itu uji ber-login dilewati). Peran akun menentukan menu yang teruji; suite BACA-SAJA (tidak menulis data). */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://keis.localhost:8088',
    viewport: { width: 1440, height: 900 },
    // peramban sistem agar tidak mengunduh Chromium; set E2E_CHANNEL=msedge bila Chrome tidak ada
    channel: process.env.E2E_CHANNEL || 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
