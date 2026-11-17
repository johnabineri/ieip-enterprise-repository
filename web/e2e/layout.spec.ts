import { test, expect } from './fixtures';

/* Spesifikasi layout (eap/CLAUDE.md): header 48px penuh; sel brand selebar panel menu (248px / 60px dilipat); ◧ melipat panel; menu = ikon + label (tanpa span.num). */
test.describe('layout Header 1', () => {
  test.beforeEach(async ({ authed: page }) => { await page.goto('/home/overview/'); await expect(page.locator('.hdr')).toBeVisible(); });

  test('header 48px, brand selebar panel menu, ◧ setelah brand', async ({ authed: page }) => {
    const b = async (s: string) => (await page.locator(s).first().boundingBox())!;
    const hdr = await b('.hdr'), brand = await b('.hdr .brand'), nav = await b('.nav'), tg = await b('.menu-toggle');
    expect(hdr.height).toBe(48); expect(hdr.width).toBeGreaterThan(1000);
    expect(Math.round(brand.width)).toBe(248); expect(Math.round(nav.width)).toBe(248);
    expect(tg.x).toBeGreaterThanOrEqual(brand.x + brand.width);
    expect(nav.y).toBeGreaterThanOrEqual(48);
  });

  test('◧ melipat panel ke 60px dan brand mengikuti; tersimpan antar muat ulang', async ({ authed: page }) => {
    await page.locator('.menu-toggle').click();
    await expect.poll(async () => Math.round((await page.locator('.nav').boundingBox())!.width)).toBe(60);
    expect(Math.round((await page.locator('.hdr .brand').boundingBox())!.width)).toBe(60);
    await page.reload(); await expect(page.locator('.hdr')).toBeVisible();
    await expect.poll(async () => Math.round((await page.locator('.nav').boundingBox())!.width)).toBe(60);
    await page.locator('.menu-toggle').click();                           // pulihkan
    await expect.poll(async () => Math.round((await page.locator('.nav').boundingBox())!.width)).toBe(248);
  });

  test('menu = ikon + label, tanpa nomor layar', async ({ authed: page }) => {
    await page.goto('/eaw/dashboard/');
    await page.locator('.nav a').first().waitFor({ timeout: 8000 }).catch(() => undefined);
    const links = page.locator('.nav a');
    test.skip((await links.count()) === 0, 'akun tanpa peran: tidak ada menu EAW');
    expect(await page.locator('.nav a .num').count()).toBe(0);
    const n = await links.count();
    expect(await page.locator('.nav a .ic svg').count()).toBe(n);
    for (let i = 0; i < n; i++) {
      const l = links.nth(i);
      await expect(l.locator('.lbl')).not.toHaveText(/^\s*$/);
      expect((await l.getAttribute('title')) || '').not.toMatch(/^\d+\.\d+ ·/);
    }
  });

  test('seluler 600px: panel jadi laci di bawah header, tanpa scroll horizontal', async ({ authed: page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.reload(); await expect(page.locator('.hdr')).toBeVisible();
    expect((await page.locator('.nav').boundingBox())!.x).toBeLessThan(0);
    await page.locator('.menu-toggle').click();
    await expect.poll(async () => Math.round((await page.locator('.nav').boundingBox())!.x)).toBe(0);
    expect(Math.round((await page.locator('.nav').boundingBox())!.y)).toBe(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });

  test('kontrol kanan header: pencarian, entitas, EN/ID, avatar', async ({ authed: page }) => {
    await expect(page.locator('.search-btn')).toBeVisible();
    await expect(page.locator('.entity-sel')).toBeVisible();
    await expect(page.locator('.lang-btn')).toContainText('EN');
    await expect(page.locator('.hdr .avatar')).toBeVisible();
  });
});
