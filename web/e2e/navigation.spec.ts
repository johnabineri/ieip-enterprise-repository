import { test, expect, collect } from './fixtures';

/* Setiap menu yang terlihat oleh akun uji harus terbuka tanpa galat JS, tanpa 5xx dari API, dan bukan halaman pengganti ("belum dimigrasi"). 403 untuk data yang
   tidak berhak boleh (tampil sebagai callout). Cakupan = menu yang dimunculkan peran akun uji (UI hanya menyaring tampilan; API/DB yang memutuskan). */
test('semua menu yang terlihat terbuka bersih', async ({ authed: page }) => {
  test.setTimeout(600_000);
  await page.goto('/home/overview/');
  await expect(page.locator('.hdr')).toBeVisible();
  const codes = await page.locator('.ws-tab').allInnerTexts();
  test.skip(codes.length === 0, 'akun tanpa peran: tidak ada workspace');
  const failures: string[] = []; let visited = 0;
  for (let i = 0; i < codes.length; i++) {
    await page.locator('.ws-tab').nth(i).click();
    await expect(page.locator('.nav a').first()).toBeVisible();
    const hrefs = await page.locator('.nav a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!));
    for (const href of hrefs) {
      let errs: string[];
      try {
        errs = await collect(page, async () => {
          await page.goto(href);
          await expect(page.locator('.page-hd').first()).toBeVisible({ timeout: 25_000 });
          await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
          const body = (await page.locator('.page').innerText()).toLowerCase();
          if (body.includes('belum dimigrasi') || body.includes('not yet migrated')) throw new Error('halaman pengganti (belum dimigrasi)');
        });
      } catch (e) { errs = [(e as Error).message.split('\n')[0]]; }
      visited++;
      if (errs.length) failures.push(`${href} → ${errs.join('; ')}`);
    }
  }
  console.log(`menu diperiksa: ${visited}`);
  expect(failures, failures.join('\n')).toEqual([]);
});
