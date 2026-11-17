import { test, expect } from './fixtures';

test.describe('kerangka: palet perintah, tema, gaya, bahasa', () => {
  test('Ctrl+K membuka palet, menyaring, Enter berpindah halaman, tanpa nomor layar', async ({ authed: page }) => {
    await page.goto('/home/overview/'); await expect(page.locator('.hdr')).toBeVisible();
    await page.locator('.ws-tab').first().waitFor({ timeout: 8000 }).catch(() => undefined);   // menu dibangun dari /me
    test.skip((await page.locator('.ws-tab').count()) === 0, 'akun tanpa menu');
    await page.keyboard.press('Control+K');
    const dlg = page.locator('.cmdk.on'); await expect(dlg).toBeVisible();
    const items = dlg.locator('.cmdk-item');
    test.skip((await items.count()) === 0, 'akun tanpa menu');
    for (const sub of await dlg.locator('.cmdk-item .muted').allInnerTexts()) expect(sub).not.toMatch(/^\d+\.\d+$|^EAW-\d+$/);
    const label = (await items.first().locator('span').nth(1).innerText()).trim();
    await dlg.locator('input').fill(label.slice(0, 6));
    await expect(items.first()).toContainText(label.slice(0, 6), { ignoreCase: true });
    await page.keyboard.press('Enter');
    await expect(dlg).toBeHidden();
    await expect(page.locator('.page-hd').first()).toBeVisible();
  });

  test('tema gelap diterapkan ke .eap-root dan bertahan', async ({ authed: page }) => {
    await page.goto('/home/overview/'); await page.locator('.hdr .avatar').click();
    await page.locator('.pop.on .chip', { hasText: /Gelap|Dark/ }).click();
    await expect(page.locator('.eap-root')).toHaveAttribute('data-theme', 'dark');
    await page.reload(); await expect(page.locator('.eap-root')).toHaveAttribute('data-theme', 'dark');
    await page.locator('.hdr .avatar').click(); await page.locator('.pop.on .chip', { hasText: /Sistem|System/ }).click();
  });

  test('gaya tidak bocor ke Host: body tanpa margin/reset, semua di bawah .eap-root', async ({ authed: page }) => {
    await page.goto('/home/overview/');
    const r = await page.evaluate(() => ({ bodyMargin: getComputedStyle(document.body).margin, root: !!document.querySelector('.eap-root'), tailwind: !!document.querySelector('style[data-tailwind]') }));
    expect(r.root).toBeTruthy(); expect(r.bodyMargin).toBe('0px'); expect(r.tailwind).toBe(false);
  });

  test('tombol EN/ID menukar label menu dan menyimpan preferensi', async ({ authed: page }) => {
    await page.goto('/eaw/dashboard/');
    await page.locator('.nav a').first().waitFor({ timeout: 8000 }).catch(() => undefined);
    test.skip((await page.locator('.nav a').count()) === 0, 'akun tanpa menu EAW');
    await page.evaluate(() => localStorage.setItem('eap.lang', 'id')); await page.reload();
    const idLabel = (await page.locator('.nav a .lbl').first().innerText()).trim();
    await page.locator('.lang-btn').click();
    await expect.poll(async () => (await page.locator('.nav a .lbl').first().innerText()).trim()).not.toBe(idLabel);
    expect(await page.evaluate(() => localStorage.getItem('eap.lang'))).toBe('en');
    await page.locator('.lang-btn').click();
    await expect.poll(async () => (await page.locator('.nav a .lbl').first().innerText()).trim()).toBe(idLabel);
  });
});
