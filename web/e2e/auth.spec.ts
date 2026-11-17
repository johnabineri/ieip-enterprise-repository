import { test as base, expect } from '@playwright/test';
import { test, haveCreds } from './fixtures';

base.describe('gerbang login', () => {
  base('tanpa token: kerangka aplikasi tidak tampil (layar masuk atau Keycloak)', async ({ page }) => {
    await page.goto('/eaw/dashboard/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2500);
    await expect(page.locator('.shell .nav a')).toHaveCount(0);        // tidak ada menu tanpa sesi
    const here = new URL(page.url());
    const onKeycloak = !here.pathname.startsWith('/eaw');
    const loginCard = await page.locator('.login').count();
    expect(onKeycloak || loginCard > 0).toBeTruthy();
  });
});

test.describe('sesi', () => {
  test('dengan token: kerangka tampil dan /me terbaca', async ({ authed: page }) => {
    await page.goto('/home/overview/');
    await expect(page.locator('.shell .hdr')).toBeVisible();
    await expect(page.locator('.avatar').first()).toBeVisible();
    const me = await page.evaluate(async () => { const t = sessionStorage.getItem('eap.token'); const r = await fetch('/api/v1/me', { headers: { Authorization: `Bearer ${t}` } }); return { status: r.status, body: await r.json() }; });
    expect(me.status).toBe(200);
    expect(Array.isArray(me.body.roles)).toBeTruthy();
    expect(Array.isArray(me.body.permissions)).toBeTruthy();
  });

  test('token rusak → tidak ada menu (kembali ke login), bukan layar rusak', async ({ page }) => {
    base.skip(!haveCreds, 'butuh kredensial');
    await page.addInitScript(() => sessionStorage.setItem('eap.token', 'bukan.token.sah'));
    await page.goto('/eaw/dashboard/');
    await page.waitForTimeout(3000);
    await expect(page.locator('.shell .nav a')).toHaveCount(0);
  });
});
