import { test, expect } from './fixtures';
import { api, fieldIn, modal, needPerms, pick, pickFirst, sweep, submit, expectModalClosed, expectModalError, uniq, writeEnabled } from './helpers';

/* UJI TULIS GSE + CONSOLE — opt-in (E2E_WRITE=1), mengikuti peran akun uji. Hanya alur yang BISA dibersihkan penuh (hapus lunak): template, flow (tanpa menjalankan saga),
   model/dataset AI, konektor & model kanonikal draft EIO. TIDAK diotomatiskan karena meninggalkan jejak permanen: scaffold proyek, run saga, revisi Web IDE, pertukaran EIO, faktur, REQ. */
test.skip(!writeEnabled, 'Set E2E_WRITE=1 untuk uji tulis');
test.describe.configure({ mode: 'serial' });

const plus = async (page: import('@playwright/test').Page, label: RegExp) => { await page.getByRole('button', { name: label }).first().click(); await expect(modal(page)).toBeVisible(); };

test('GSE Template: buat (JSON salah ditolak) → ubah → hapus', async ({ authed: page, cleanup }) => {
  await page.goto('/gse/template/'); await needPerms(page, test.skip, 'gse.project.run');
  const kode = uniq('tpl', false).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  cleanup(() => sweep(page, '/api/v1/gse/templates', 'kode', (id) => `/api/v1/gse/templates/${id}`));
  await plus(page, /\+ Template/); let m = modal(page);
  await fieldIn(m, 'Kode').fill(kode); await fieldIn(m, /^Nama/).fill('Template Uji E2E');
  await fieldIn(m, /^Berkas/).fill('bukan json'); await submit(page); await expectModalError(page, /JSON array|sah/i);
  await fieldIn(m, /^Berkas/).fill('[{"path":"README.md","content":"# {{app_nama}}"}]'); await submit(page); await expectModalClosed(page);
  await expect.poll(async () => ((await api(page, 'GET', '/api/v1/gse/templates')).body.data ?? []).some((x: any) => x.kode === kode)).toBeTruthy();
  await page.reload(); await page.locator('.ag-row', { hasText: kode }).first().click();
  await page.locator('.drawer-ft button', { hasText: /^Ubah$/ }).click(); m = modal(page);
  await fieldIn(m, 'Versi').fill('1.1.0'); await submit(page); await expectModalClosed(page);
  await expect.poll(async () => ((await api(page, 'GET', '/api/v1/gse/templates')).body.data ?? []).find((x: any) => x.kode === kode)?.versi).toBe('1.1.0');
  await page.reload(); await page.locator('.ag-row', { hasText: kode }).first().click();
  await page.locator('.drawer-ft button', { hasText: /^Hapus$/ }).click(); await submit(page); await expectModalClosed(page);
  await expect.poll(async () => ((await api(page, 'GET', '/api/v1/gse/templates')).body.data ?? []).some((x: any) => x.kode === kode)).toBeFalsy();
});

test('GSE Flow: saga tanpa kompensasi tidak valid → dilengkapi → valid → commit → hapus', async ({ authed: page, cleanup }) => {
  await page.goto('/gse/flow/'); await needPerms(page, test.skip, 'gse.project.run');
  const nama = uniq('Flow Uji');
  cleanup(() => sweep(page, '/api/v1/gse/flows', 'nama', (id) => `/api/v1/gse/flows/${id}`));
  await page.getByRole('button', { name: '+ Saga' }).click();
  await page.locator('.card input[type=text]').first().fill(nama);
  const steps = page.locator('.card .card input[type=text]');                                   // per langkah: nama, service, kompensasi, idempotencyKey
  await steps.nth(0).fill('reserve'); await steps.nth(1).fill('inv'); await steps.nth(2).fill('');
  await page.getByRole('button', { name: 'Simpan draf' }).click();
  await expect(page.locator('.callout.err').first()).toContainText(/tanpa kompensasi/i);       // validasi DB (trigger gse.flow)
  await steps.nth(2).fill('release'); await page.getByRole('button', { name: 'Simpan draf' }).click();
  await expect(page.locator('.callout.ok').first()).toContainText(/Lolos validasi/i);
  await page.getByRole('button', { name: 'Commit' }).click();
  await expect.poll(async () => ((await api(page, 'GET', '/api/v1/gse/flows')).body.data ?? []).find((x: any) => x.nama === nama)?.status).toBe('committed');
  await page.getByRole('button', { name: 'Hapus' }).first().click(); await submit(page); await expectModalClosed(page);
  await expect.poll(async () => ((await api(page, 'GET', '/api/v1/gse/flows')).body.data ?? []).some((x: any) => x.nama === nama)).toBeFalsy();
});

test('CONSOLE AI register: D-05 ditegakkan DB, model & dataset buat → hapus (dipakai → 409)', async ({ authed: page, cleanup }) => {
  await page.goto('/console/ai/'); await needPerms(page, test.skip, 'console.ai.admin');
  const kode = uniq('mdl', true);                                          // kode model tanpa spasi
  cleanup(async () => {
    const ds = (await api(page, 'GET', '/api/v1/console/ai/datasets')).body.data ?? [];
    for (const d of ds) if (String(d.nama).includes('E2E-')) await api(page, 'DELETE', `/api/v1/console/ai/datasets/${d.id}`);
    await sweep(page, '/api/v1/console/ai/models', 'kode', (id) => `/api/v1/console/ai/models/${id}`);
  });
  await plus(page, /\+ Model/); let m = modal(page);
  await fieldIn(m, 'Kode').fill(kode); await fieldIn(m, /^Nama/).fill('Model Uji E2E');
  await pick(fieldIn(m, 'Lokasi'), 'cloud'); await pick(fieldIn(m, 'Klasifikasi data maks.'), 'rahasia');
  await submit(page); await expectModalError(page, /ck_ai_model_d05|D-05/i);
  await pick(fieldIn(m, 'Klasifikasi data maks.'), 'internal'); await submit(page); await expectModalClosed(page);
  await expect(page.locator('tr', { hasText: 'Model Uji E2E' })).toBeVisible();
  await plus(page, /\+ Dataset/); m = modal(page);
  await fieldIn(m, /^Nama/).fill(uniq('Dataset Uji')); await pick(fieldIn(m, 'Klasifikasi'), 'rahasia'); await m.locator('input[type=checkbox]').check();
  await pick(fieldIn(m, 'Model pemroses'), kode); await submit(page); await expectModalError(page, /D-05/);   // dataset sensitif butuh model on-prem
  await pick(fieldIn(m, 'Klasifikasi'), 'internal'); await m.locator('input[type=checkbox]').uncheck(); await submit(page); await expectModalClosed(page);
  await page.locator('tr', { hasText: 'Model Uji E2E' }).first().getByRole('button', { name: 'Hapus' }).click(); await submit(page);
  await expectModalError(page, /masih dipakai dataset/i);                                                       // 409 dari API
});

test('CONSOLE EIO: konektor + model kanonikal draft buat → hapus', async ({ authed: page, cleanup }) => {
  await page.goto('/console/eio/'); await needPerms(page, test.skip, 'console.eio.write');
  const kode = uniq('E2E', true).replace(/[^A-Z0-9_.-]/g, '-'); const kodeModel = `${kode}-M`;
  cleanup(async () => {
    await sweep(page, '/api/v1/console/eio/connectors', 'kode', (id) => `/api/v1/console/eio/connectors/${id}`);
    const ms = (await api(page, 'GET', '/api/v1/console/eio/canonical-models')).body.data ?? [];
    for (const x of ms) if (String(x.kode).includes('E2E-') && x.status === 'draft') await api(page, 'DELETE', `/api/v1/console/eio/canonical-models/${x.id}`);
  });
  const card = (n: string) => page.locator('section.card', { has: page.locator('h2', { hasText: n }) });
  await card('Registri Konektor').getByRole('button', { name: /\+ Konektor/ }).click(); let m = modal(page); await expect(m).toBeVisible();
  const t = m.locator('input[type=text]'); await t.nth(0).fill('kode-huruf-kecil'); await t.nth(1).fill('Konektor Uji'); await t.nth(2).fill('EAP'); await t.nth(3).fill('UI');
  await submit(page); await expectModalError(page, /huruf besar/i);                                              // validasi klien
  await t.nth(0).fill(kode); await submit(page); await expectModalClosed(page);
  await expect(card('Registri Konektor').locator('tr', { hasText: kode })).toBeVisible();
  await card('Model Kanonikal').getByRole('button', { name: /\+ Model/ }).click(); m = modal(page); await expect(m).toBeVisible();
  await m.locator('input[type=text]').nth(0).fill(kodeModel); await m.locator('input[type=text]').nth(1).fill('Model Kanonikal Uji'); await m.locator('textarea').fill('bukan json');
  await submit(page); await expectModalError(page, /JSON tidak sah/i);
  await m.locator('textarea').fill('[{"name":"order_id","type":"string","required":true}]'); await submit(page); await expectModalClosed(page);
  const row = card('Model Kanonikal').locator('tr', { hasText: kodeModel }); await expect(row).toContainText('draft');
  await row.getByRole('button', { name: 'Hapus' }).click(); await submit(page); await expectModalClosed(page);
  await expect(card('Model Kanonikal').locator('tr', { hasText: kodeModel })).toHaveCount(0);
  await card('Registri Konektor').locator('tr', { hasText: kode }).getByRole('button', { name: 'Detail' }).click();
  await page.locator('.drawer-ft button', { hasText: /^Hapus$/ }).click(); await submit(page); await expectModalClosed(page);
  await expect(card('Registri Konektor').locator('tr', { hasText: kode })).toHaveCount(0);
});
