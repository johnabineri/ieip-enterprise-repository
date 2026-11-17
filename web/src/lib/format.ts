import { locale, t } from '@/lib/i18n';
/* Format tampilan (locale mengikuti bahasa — i18n.ts). Tanggal kerja = WITA dari server; jangan memotong string ISO waktu (UTC) — pakai toLocale*. */
export const fmtDate = (v?: string | null) =>
  (v ? new Date(String(v).length <= 10 ? `${v}T00:00:00` : v).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDT = (v?: string | null) => (v ? new Date(v).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const fmtNum = (v: unknown, d?: number) =>
  (v == null || v === '' ? '—' : Number(v).toLocaleString(locale(), d == null ? {} : { minimumFractionDigits: d, maximumFractionDigits: d }));
export const short = (id?: string | null) => (id ? String(id).slice(0, 8) : '—');
export const dash = (v: unknown) => (v == null || v === '' ? '—' : String(v));
/** Bagian tanggal 'YYYY-MM-DD' dari nilai DATE (bukan timestamp). */
export const day = (v?: string | null) => (v ? String(v).slice(0, 10) : '');
export const period = (a?: string | null, b?: string | null) => `${fmtDate(a)} – ${b ? fmtDate(b) : '…'}`;
export const validity = (r: { valid_from?: string | null; valid_to?: string | null }) => (r.valid_from || r.valid_to ? period(r.valid_from, r.valid_to) : '—');

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';
const TONE: Record<Exclude<Tone, 'neutral'>, string> = {
  ok: 'ditetapkan dipublikasi accepted active approved applied clean passed success verified done reconciled current berlaku lulus granted resolved confirmed aktif',
  warn: 'proposed draf direviu in_review revision pending draft submitted needs_review in_progress prospect on_hold dormant warning medium on_leave open planned running waived',
  bad: 'deprecated rejected blocked suspended locked disabled failed error blacklisted high critical terminated dissolved cancelled duplicate_suspected anonymized denied closed retired obsolete discontinued',
  info: 'superseded divalidasi merged inactive ended low read write info not_duplicate',
};
const toneOf: Record<string, Tone> = {};
Object.entries(TONE).forEach(([t, w]) => w.split(' ').forEach((x) => { toneOf[x] = t as Tone; }));
/** Nada lencana dari nilai status (active → ok, rejected → bad, …). */
export const toneFor = (label: unknown): Tone => toneOf[String(label ?? '').toLowerCase()] || 'neutral';

/** CSV ber-BOM, pemisah ';' (Excel id-ID). */
export function toCsv(head: string[], rows: unknown[][]) {
  const q = (v: unknown) => { const s = String(v == null ? '' : v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + [head.map(q).join(';')].concat(rows.map((r) => r.map(q).join(';'))).join('\r\n');
}
export function downloadText(name: string, text: string, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
