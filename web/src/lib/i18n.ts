/* i18n SPA CMP: dua bahasa — Inggris (BAWAAN) & Indonesia. Kunci terjemahan = teks Indonesia di kode (sumber kebenaran tetap
   Indonesia, sesuai konvensi repo); kamus EN di ./i18n-en.ts. Teks tanpa entri kamus tampil apa adanya (aman bila terlewat).
   Bahasa disimpan per peramban (localStorage cmp.lang); mengganti bahasa memuat ulang halaman supaya teks yang dibentuk di luar
   React (kolom grid, lookup, toast) ikut berganti. Pesan galat dari server (aturan DB) tetap berbahasa Indonesia. */
import { EN } from './i18n-en';

export type Lang = 'en' | 'id';
export const LANGS: [Lang, string][] = [['en', 'English'], ['id', 'Bahasa Indonesia']];
const KEY = 'eap.lang';

function initial(): Lang {
  if (typeof window === 'undefined') return 'en';
  try { const v = localStorage.getItem(KEY); if (v === 'en' || v === 'id') return v; } catch { /* penyimpanan diblokir */ }
  return 'en';
}

/** Bahasa aktif halaman ini (tetap sampai dimuat ulang). */
export const lang: Lang = initial();
/** Locale Intl untuk tanggal & angka. */
export const locale = (): string => (lang === 'en' ? 'en-GB' : 'id-ID');

/** Terjemahan: t('Simpan') → 'Save' (EN). Parameter posisi {0}, {1}, … diisi dari args. */
export function t(text: string, ...args: unknown[]): string {
  let out = lang === 'en' ? (EN[text] ?? text) : text;
  if (args.length) out = out.replace(/\{(\d+)\}/g, (_, i: string) => String(args[Number(i)] ?? ''));
  return out;
}

export function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* abaikan */ }
  location.reload();
}

if (typeof document !== 'undefined') document.documentElement.lang = lang;
