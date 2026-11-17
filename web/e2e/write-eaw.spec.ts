import { test, expect } from './fixtures';
import { api, fieldIn, modal, needPerms, pick, pickFirst, sweep, submit, expectModalClosed, expectModalError, toastText, uniq, writeEnabled } from './helpers';

/* UJI TULIS EAW — opt-in (E2E_WRITE=1) dan MENGIKUTI PERAN akun uji (izin kurang → dilewati). Data uji `E2E-<run>…` dibersihkan lewat API (hapus lunak) di akhir tiap uji.
   Aturan yang dibuktikan adalah aturan SERVER/DB (RLS, AF-05, readiness); UI hanya jalur. */
test.skip(!writeEnabled, 'Set E2E_WRITE=1 untuk uji tulis');
test.describe.configure({ mode: 'serial' });

const create = async (page: import('@playwright/test').Page, label: RegExp) => { await page.locator('.page-hd').getByRole('button', { name: label }).first().click(); await expect(modal(page)).toBeVisible(); };
const openRow = async (page: import('@playwright/test').Page, text: string) => { await page.locator('.ag-row', { hasText: text }).first().click(); await expect(page.locator('.drawer.on')).toBeVisible(); };
const confirmDelete = async (page: import('@playwright/test').Page) => { await page.locator('.drawer-ft button', { hasText: /^Hapus$/ }).click(); await expect(modal(page)).toBeVisible(); await submit(page); await expectModalClosed(page); };

test('Layanan (D3): buat → ubah (If-Match) → hapus Draf', async ({ authed: page, cleanup }) => {
  await page.goto('/eaw/layanan/'); await needPerms(page, test.skip, 'eaw.model.write');
  const nama = uniq('Layanan Uji'); const nama2 = `${nama} (diubah)`;
  cleanup(() => sweep(page, '/api/v1/eaw/objects/services?limit=100', 'nama', (id) => `/api/v1/eaw/objects/services/${id}`));
  await create(page, /^\+ /);
  const m = modal(page);
  await pickFirst(fieldIn(m, 'Entitas pemilik')); await fieldIn(m, /^Nama/).fill(nama);
  await pick(fieldIn(m, 'Tipe'), 'internal'); await pick(fieldIn(m, 'Kategori'), 'utama');
  await submit(page); await expectModalClosed(page);
  await expect.poll(async () => ((await api(page, 'GET', '/api/v1/eaw/objects/services?limit=100')).body.data ?? []).some((x: any) => x.nama === nama)).toBeTruthy();
  await page.reload(); await openRow(page, nama);
  await page.locator('.drawer-ft button', { hasText: /^Ubah$/ }).click();
  await fieldIn(modal(page), /^Nama/).fill(nama2); await submit(page); await expectModalClosed(page);
  await expect.poll(async () => ((await api(page, 'GET', '/api/v1/eaw/objects/services?limit=100')).body.data ?? []).some((x: any) => x.nama === nama2)).toBeTruthy();
  await page.reload(); await openRow(page, nama2); await confirmDelete(page);
  await expect.poll(async () => ((await api(page, 'GET', '/api/v1/eaw/objects/services?limit=100')).body.data ?? []).some((x: any) => x.nama === nama2)).toBeFalsy();
});

test('KRA: buat Draf → ubah → hapus', async ({ authed: page, cleanup }) => {
  await page.goto('/eaw/kra/'); const m0 = await needPerms(page, test.skip, 'eaw.reference.write');
  test.skip(!m0.scope.editAll, 'KRA hanya dapat disusun peran holding-wide');
  const kode = uniq('KRA', true).replace(/[^A-Z0-9_.-]/g, '-');
  cleanup(() => sweep(page, '/api/v1/eaw/references?limit=100', 'kode', (id) => `/api/v1/eaw/references/${id}`));
  await create(page, /^\+ /);
  const m = modal(page);
  await pick(fieldIn(m, 'Domain'), 'Proses'); await fieldIn(m, 'Kode').fill(kode); await fieldIn(m, /^Nama/).fill('KRA Uji E2E');
  await submit(page); await expectModalClosed(page);
  await expect.poll(async () => ((await api(page, 'GET', '/api/v1/eaw/references?limit=100')).body.data ?? []).some((x: any) => x.kode === kode)).toBeTruthy();
  await page.reload(); await openRow(page, kode);
  await page.locator('.drawer-ft button', { hasText: /^Ubah$/ }).click();
  await fieldIn(modal(page), /^Nama/).fill('KRA Uji E2E (diubah)'); await submit(page); await expectModalClosed(page);
  await page.reload(); await openRow(page, kode); await expect(page.locator('.drawer')).toContainText('(diubah)');
  await confirmDelete(page);
  await expect.poll(async () => ((await api(page, 'GET', '/api/v1/eaw/references?limit=100')).body.data ?? []).some((x: any) => x.kode === kode)).toBeFalsy();
});

test('Framework Builder: buat → validasi ditolak server (6 domain) → ubah → hapus', async ({ authed: page, cleanup }) => {
  await page.goto('/eaw/kerangka/'); await needPerms(page, test.skip, 'eaw.model.write', 'eaw.validation.approve');
  const nama = uniq('Kerangka Uji');
  cleanup(() => sweep(page, '/api/v1/eaw/objects/frameworks?limit=100', 'layananUtama', (id) => `/api/v1/eaw/objects/frameworks/${id}`));
  await page.locator('.page-hd').getByRole('button', { name: /Kerangka Kerja/ }).first().click();
  const m = modal(page); await expect(m).toBeVisible();
  await fieldIn(m, 'Layanan utama').fill(nama); await pickFirst(fieldIn(m, 'Entitas')); await submit(page); await expectModalClosed(page);
  const card = page.locator('.grid.g3 > section.card', { hasText: nama }); await expect(card).toBeVisible();
  await expect(card).toContainText('0/6');
  await card.getByRole('button', { name: 'Kelola' }).click(); await expect(page.locator('.drawer.on')).toBeVisible();
  await page.locator('.drawer-ft button', { hasText: 'Ajukan Validasi' }).click(); await submit(page);
  await expectModalError(page, /kekurangan relasi|validasi ditolak/i);                 // aturan DB: eaw.relation_check
  await modal(page).getByRole('button', { name: 'Batal' }).click();
  await page.locator('.drawer-ft button', { hasText: /^Ubah$/ }).click();
  await fieldIn(modal(page), 'Layanan utama').fill(`${nama} (diubah)`); await submit(page); await expectModalClosed(page);
  await expect(page.locator('.drawer-hd h2')).toContainText('(diubah)');
  await page.locator('.drawer-ft button', { hasText: /^Hapus$/ }).click(); await submit(page); await expectModalClosed(page);
  await expect.poll(async () => (await api(page, 'GET', '/api/v1/eaw/objects/frameworks?limit=100')).body.data.some((x: any) => String(x.layananUtama).includes(nama))).toBeFalsy();
});

test('Roadmap: fase + butir → status (terhambat butuh alasan) → hapus', async ({ authed: page, cleanup }) => {
  await page.goto('/eaw/roadmap/'); await needPerms(page, test.skip, 'eaw.roadmap.write');
  const fase = uniq('Fase Uji'); const butir = uniq('Butir Uji');
  cleanup(async () => {
    const r = (await api(page, 'GET', '/api/v1/eaw/roadmap')).body;
    for (const f of r.phases) { if (!String(f.nama).includes(`E2E-`)) continue; if (!String(f.nama).includes(fase.split(' ').pop()!)) continue; for (const i of f.items) await api(page, 'DELETE', `/api/v1/eaw/roadmap/items/${i.id}`); await api(page, 'DELETE', `/api/v1/eaw/roadmap/phases/${f.id}`); }
  });
  await page.getByRole('button', { name: /^\+ Fase/ }).click(); let m = modal(page); await expect(m).toBeVisible();
  await fieldIn(m, 'Nama fase').fill(fase); await fieldIn(m, 'Mulai').fill('2031-01-01'); await fieldIn(m, 'Selesai').fill('2031-03-31'); await submit(page); await expectModalClosed(page);
  const card = page.locator('section.card', { has: page.locator('h2', { hasText: fase }) }); await expect(card).toBeVisible();
  await page.getByRole('button', { name: /^\+ Butir/ }).first().click(); m = modal(page); await expect(m).toBeVisible();
  await pick(fieldIn(m, 'Fase'), fase); await fieldIn(m, 'Judul').fill(butir); await fieldIn(m, 'Target').fill('2031-06-01');      // di luar rentang fase
  await submit(page); await expectModalError(page, /di luar rentang fase/i);                                                    // aturan DB
  await fieldIn(m, 'Target').fill('2031-02-01'); await submit(page); await expectModalClosed(page);
  const row = card.locator('tbody tr', { hasText: butir }); await expect(row).toBeVisible();
  await row.locator('select').selectOption('terhambat'); await expect(modal(page)).toBeVisible();                              // alasan wajib
  await modal(page).locator('textarea').fill('abc'); await submit(page); await expectModalError(page, /minimal 5/i);
  await modal(page).locator('textarea').fill('Menunggu keputusan anggaran.'); await submit(page); await expectModalClosed(page);
  await expect(card.locator('tbody tr', { hasText: butir })).toContainText('Terhambat');
  await card.locator('tbody tr', { hasText: butir }).getByRole('button', { name: 'Hapus' }).click(); await submit(page); await expectModalClosed(page);
  await card.getByRole('button', { name: 'Hapus' }).last().click(); await submit(page); await expectModalClosed(page);
  await expect(page.locator('section.card', { has: page.locator('h2', { hasText: fase }) })).toHaveCount(0);
});

test('Kanvas ArchiMate: buat diagram → tambah elemen → simpan (persisten) → hapus', async ({ authed: page, cleanup }) => {
  await page.goto('/eaw/kanvas/'); await needPerms(page, test.skip, 'eaw.model.write');
  const nama = uniq('Kanvas Uji');
  cleanup(() => sweep(page, '/api/v1/eaw/diagrams', 'nama', (id) => `/api/v1/eaw/diagrams/${id}`));
  await page.locator('.canvas-wrap, .empty').first().waitFor();
  await page.getByRole('button', { name: /Baru|Diagram baru/ }).first().click(); const m = modal(page); await expect(m).toBeVisible();
  await fieldIn(m, 'Nama').fill(nama); await pickFirst(fieldIn(m, 'Entitas')); await submit(page); await expectModalClosed(page);
  await page.locator('.palette .pi', { hasText: 'Business Process' }).click();
  await page.locator('.palette .pi', { hasText: 'Application Component' }).click();
  await expect(page.locator('.anode')).toHaveCount(2);
  await expect(page.locator('.row.mb .small.muted')).toContainText(/belum disimpan|unsaved/i);
  await page.getByRole('button', { name: /Simpan|Save/ }).first().click();
  await expect(page.locator('.row.mb .small.muted')).toContainText(/tersimpan|saved/i);
  const d = (await api(page, 'GET', '/api/v1/eaw/diagrams')).body.data.find((x: any) => x.nama === nama); expect(d).toBeTruthy();
  expect((await api(page, 'GET', `/api/v1/eaw/diagrams/${d.id}`)).body.content.nodes).toHaveLength(2);      // persisten di server
  page.once('dialog', (x) => x.accept());
  await page.getByRole('button', { name: /Hapus diagram/ }).click(); await submit(page); await expectModalClosed(page);
  await expect.poll(async () => ((await api(page, 'GET', '/api/v1/eaw/diagrams')).body.data ?? []).some((x: any) => x.nama === nama)).toBeFalsy();
});
