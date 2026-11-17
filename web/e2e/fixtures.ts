import { test as base, expect, type Page } from '@playwright/test';

/* Login uji: password grant ke Keycloak (klien dev `cmp-dev-cli`, hanya lingkungan pengembangan) → token disuntikkan ke sessionStorage `eap.token` sebelum SPA dimuat
   (SPA tidak punya login pengembangan; alur PKCE-nya sendiri tidak diotomatiskan). Bahasa dipaku `id` kecuali sudah ada preferensi. */
const USER = process.env.E2E_USERNAME, PASS = process.env.E2E_PASSWORD;
const TOKEN_URL = process.env.E2E_TOKEN_URL || 'http://localhost:8180/realms/keis/protocol/openid-connect/token';
const CLIENT = process.env.E2E_CLIENT_ID || 'cmp-dev-cli';

export const haveCreds = !!(USER && PASS);

export const test = base.extend<{ authed: Page; cleanup: (fn: () => Promise<unknown>) => void }, { token: string }>({
  token: [async ({}, use) => {
    if (!haveCreds) { await use(''); return; }
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'password', client_id: CLIENT, username: USER!, password: PASS! }) });
    if (!r.ok) throw new Error(`Token Keycloak gagal (HTTP ${r.status}) — periksa E2E_USERNAME/E2E_PASSWORD/E2E_TOKEN_URL`);
    await use((await r.json()).access_token);
  }, { scope: 'worker' }],
  authed: async ({ page, token }, use, info) => {
    info.skip(!haveCreds, 'Set E2E_USERNAME dan E2E_PASSWORD untuk menjalankan uji ber-login');
    await page.addInitScript(([t]) => { try { sessionStorage.setItem('eap.token', t); if (!localStorage.getItem('eap.lang')) localStorage.setItem('eap.lang', 'id'); } catch { /* abaikan */ } }, [token]);
    await use(page);
  },
  /** Daftarkan pembersihan data uji: dijalankan terbalik setelah uji (lulus ATAU gagal), galatnya ditelan. */
  cleanup: async ({ authed }, use) => {   // bergantung pada `authed` agar halaman masih hidup saat pembersihan
    void authed;
    const fns: Array<() => Promise<unknown>> = [];
    await use((fn) => { fns.push(fn); });
    for (const fn of fns.reverse()) { try { await fn(); } catch { /* sudah terhapus / tidak pernah dibuat */ } }
  },
});
export { expect };

/** Kumpulkan galat halaman + respons API 5xx selama `fn` (kembalikan daftar; kosong = bersih). */
export async function collect(page: Page, fn: () => Promise<void>) {
  const errors: string[] = [];
  const onErr = (e: Error) => errors.push(`pageerror: ${e.message}`);
  const onRes = (r: { status(): number; url(): string }) => { if (r.status() >= 500 && r.url().includes('/api/v1/')) errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); };
  page.on('pageerror', onErr); page.on('response', onRes);
  try { await fn(); } finally { page.off('pageerror', onErr); page.off('response', onRes); }
  return errors;
}
