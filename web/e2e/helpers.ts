import { expect, type Locator, type Page } from '@playwright/test';

/* Pembantu uji TULIS. Panggilan API dilakukan DARI DALAM halaman (fetch same-origin dengan token sesi) karena Node tidak me-resolve *.localhost.
   Semua data uji bernama `E2E-<run>…` dan dibersihkan lewat API (hapus lunak) di akhir tiap uji — termasuk saat uji gagal. */

export const RUN = Date.now().toString(36).toUpperCase();
let seq = 0;
/** Nama unik per uji; `up` = huruf besar untuk kode (KODE_RE). */
export const uniq = (p: string, up = false) => { const s = `E2E-${RUN}-${++seq}`; return up ? `${p}-${s}`.toUpperCase() : `${p} ${s}`; };

export const writeEnabled = process.env.E2E_WRITE === '1';

export async function api(page: Page, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return page.evaluate(async ([m, p, b, h]) => {
    const t = sessionStorage.getItem('eap.token');
    const r = await fetch(p as string, { method: m as string, headers: { Authorization: `Bearer ${t}`, ...(b !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(h as Record<string, string>) }, body: b !== undefined ? JSON.stringify(b) : undefined });
    const text = await r.text(); let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { /* bukan JSON */ }
    return { status: r.status, body: json, etag: r.headers.get('etag') };
  }, [method, path, body, headers] as const);
}

export interface Me { roles: string[]; permissions: string[]; scope: { viewAll: boolean; editAll: boolean; editEntityCodes: string[] } }
export async function me(page: Page): Promise<Me> { return (await api(page, 'GET', '/api/v1/me')).body; }
/** Lewati uji bila akun tidak punya SEMUA izin yang dibutuhkan (uji tulis mengikuti peran akun). */
export async function needPerms(page: Page, skip: (c: boolean, d: string) => void, ...perms: string[]) {
  const m = await me(page); const miss = perms.filter((p) => !m.permissions.includes(p));
  skip(miss.length > 0, `akun uji tidak punya izin: ${miss.join(', ')}`);
  return m;
}

export const modal = (page: Page) => page.locator('.modal.on');
/** Kolom formulir menurut teks label (Field tidak mengaitkan for/id). */
export const fieldIn = (root: Locator, label: string | RegExp) => root.locator('.field', { hasText: label }).locator('input, select, textarea').first();

export async function pick(sel: Locator, match: string | RegExp) {
  const opts = await sel.locator('option').allInnerTexts();
  const i = opts.findIndex((o) => (typeof match === 'string' ? o.startsWith(match) || o.includes(match) : match.test(o)));
  if (i < 0) throw new Error(`opsi tidak ditemukan: ${match} dari [${opts.slice(0, 6).join(' | ')}…]`);
  await sel.selectOption({ index: i });
}
/** Pilih opsi pertama setelah placeholder (indeks 1). */
export async function pickFirst(sel: Locator) { await sel.selectOption({ index: 1 }); }

export async function submit(page: Page) { await modal(page).locator('button[type=submit]').click(); }
export async function expectModalClosed(page: Page) { await expect(modal(page)).toHaveCount(0, { timeout: 15_000 }); }
export async function expectModalError(page: Page, re: RegExp) { await expect(modal(page).locator('.callout.err')).toContainText(re, { timeout: 15_000 }); }
export async function toastText(page: Page, re: RegExp) { await expect(page.locator('.toast').filter({ hasText: re }).last()).toBeVisible({ timeout: 15_000 }); }

/** Hapus-lunak semua baris daftar yang namanya berawalan `E2E-<RUN>` (idempoten; dipanggil dari cleanup). */
export async function sweep(page: Page, listPath: string, nameKey: string, delPath: (id: string) => string, rows: (b: any) => any[] = (b) => (Array.isArray(b) ? b : b?.data ?? [])) {
  const r = await api(page, 'GET', listPath);
  for (const x of rows(r.body)) if (String(x[nameKey] ?? '').includes(`E2E-${RUN}`)) await api(page, 'DELETE', delPath(x.id));
}
