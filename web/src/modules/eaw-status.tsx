'use client';
/* Alur status AF-05 di drawer Detail: siklus (mockup: A.lifecycle), kesiapan relasi/atribut wajib (GET /eaw/readiness), tombol langkah berikutnya, dan riwayat
   (GET /eaw/workflow). SELURUH aturan ada di fungsi DB eaw.transition(): izin per transisi, catatan ≥ 5 karakter (Ditetapkan/Direviu/→Draf), empat mata
   (penyusun tidak menetapkan objeknya sendiri), tautan KRA, relasi wajib, profil platform. UI hanya menampilkan dan meneruskan; galat DB tampil di modal. */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { fmtDT } from '@/lib/format';
import { invalidateData } from '@/lib/query';
import { useSession } from '@/store/session';
import { toast } from '@/store/ui';
import { confirmDialog } from '@/components/overlay';
import { Badge, Lifecycle, MiniTable, Section } from '@/components/ui';
import type { PageAction, RowAction } from '@/components/grid/grid-page';
import { t } from '@/lib/i18n';

export type ObjType = 'application' | 'reference' | 'framework' | 'process' | 'data_entity' | 'service' | 'infra_asset' | 'control';
interface Step { to: string; label: string; perm: string; note?: boolean; primary?: boolean; danger?: boolean }

/** Transisi yang diizinkan DB (eaw.transition) per status asal; label mengikuti mockup (live-domains.js NEXT). */
const FLOW: Record<string, Step[]> = {
  Draf: [{ to: 'Divalidasi', label: t('Ajukan Validasi'), perm: 'eaw.validation.approve', primary: true }],
  Divalidasi: [
    { to: 'Ditetapkan', label: t('Tetapkan (ARB)'), perm: 'eaw.baseline.approve', note: true, primary: true },
    { to: 'Draf', label: t('Kembalikan ke Draf'), perm: 'eaw.validation.approve', note: true },
  ],
  Ditetapkan: [{ to: 'Dipublikasi', label: t('Publikasikan'), perm: 'eaw.publication.approve', primary: true }],
  Dipublikasi: [{ to: 'Direviu', label: t('Mulai Reviu (AF-07)'), perm: 'eaw.review.run', note: true, primary: true }],
  Direviu: [
    { to: 'Divalidasi', label: t('Validasi Ulang'), perm: 'eaw.validation.approve', primary: true },
    { to: 'Draf', label: t('Kembalikan ke Draf'), perm: 'eaw.review.run', note: true },
  ],
};

const path = (type: ObjType, id: string) => (type === 'application' ? `/api/v1/eaw/applications/${id}/transition` : type === 'reference' ? `/api/v1/eaw/references/${id}/transition` : '/api/v1/eaw/transitions');
const body = (type: ObjType, id: string, to: string, catatan?: string) => (type === 'application' || type === 'reference' ? { to, catatan } : { objekType: type, objekId: id, to, catatan });

/** Menjalankan transisi; galat DB (403/422) DILEMPAR agar modal menampilkannya. */
async function run(type: ObjType, row: api.Row, s: Step, catatan: string | undefined, close: () => void) {
  try {
    await api.post(path(type, row.id), body(type, row.id, s.to, catatan));
  } catch (e) {
    // Baris di layar basi (status sudah diubah pengguna/proses lain): muat ulang data & tutup laci supaya tombol langkah mengikuti status terbaru.
    // Galat lain (izin, catatan kurang, empat mata, kesiapan) TIDAK menutup laci — pengguna masih perlu memperbaikinya.
    if (e instanceof api.ApiError && (e.status === 412 || /transisi\s+\S+\s*->\s*\S+\s+tidak diizinkan/i.test(e.detail || ''))) {
      invalidateData(); close();
      toast(t('Status objek sudah berubah'), t('Data dimuat ulang; buka kembali objek untuk melihat status terbaru.'), 'warning');
    }
    throw e;
  }
  invalidateData();
  toast(t('Transisi tercatat'), `${row.status} → ${s.to}`, 'success');
  close();
}

/** Aksi drawer: satu tombol per transisi yang mungkin dari status saat ini (terkunci 🔒 bila peran tak berizin). */
export function transitionActions(type: ObjType) {
  return (row: api.Row, close: () => void): (RowAction & { variant?: 'pri' | 'danger' })[] =>
    (FLOW[row.status] || []).map((s) => ({
      label: s.label, perm: s.perm, variant: s.primary ? 'pri' as const : undefined,
      run: () => {
        const me = useSession.getState().me;
        if (s.to === 'Ditetapkan' && row.createdBy && me?.userId === row.createdBy) {
          toast(t('Empat mata (maker-checker)'), t('Penyusun objek tidak boleh menetapkan objeknya sendiri; minta peran lain.'), 'warning'); return;
        }
        confirmDialog({
          title: `${s.label} · ${row.status} → ${s.to}`, ok: s.label, reason: s.note ? t('Catatan keputusan (min. 5 karakter)') : false, min: 5,
          text: s.note ? t('Rujuk keputusan ARB/ADR atau alasan revisi. Dicatat di jejak transisi (append-only).') : t('Transisi dicatat di jejak append-only dan diperiksa aturan AF-05 oleh database.'),
          onOk: (catatan) => run(type, row, s, catatan, close),
        });
      },
    }));
}

/** Siklus status di atas drawer (mockup: "Siklus status (AF-05)"). */
export function StatusTop({ row }: { row: api.Row }) {
  return <section><h3>{t('Siklus status (AF-05)')}</h3><div className="mt-s"><Lifecycle status={row.status} /></div></section>;
}

/** Riwayat transisi append-only (GET /eaw/workflow); `type` boleh jenis objek EAW atau `arb_clearance`. RLS: hanya peran lihat-semua atau pelaku transisi. */
export function HistorySection({ type, row }: { type: string; row: api.Row }) {
  const hist = useQuery({ queryKey: ['eaw', 'workflow', type, row.id, row.version, row.status], queryFn: () => api.get<{ data: api.Row[] }>('/api/v1/eaw/workflow', { objekType: type, objekId: row.id }), retry: false });
  const me = useSession((s) => s.me);
  return (
    <Section title={t('Riwayat status')}>
      {hist.isPending ? <span className="muted small">{t('Memuat…')}</span> : hist.isError ? <span className="muted small">{t('Riwayat tidak tersedia untuk peran Anda.')}</span> : (
        <MiniTable rows={hist.data?.data} empty={t('Belum ada transisi.')} columns={[
          { label: t('Waktu'), render: (h) => fmtDT(h.waktu) },
          { label: t('Perubahan'), render: (h) => <span className="row" style={{ gap: 4 }}>{h.status_dari ? <Badge value={h.status_dari} /> : '—'} → <Badge value={h.status_ke} /></span> },
          { label: t('Pelaku'), render: (h) => (h.pelaku === me?.userId ? t('Anda') : <span className="mono tiny">{String(h.pelaku).slice(0, 8)}</span>) },
          { label: t('Catatan'), render: (h) => h.catatan },
        ]} />
      )}
    </Section>
  );
}

/** Kesiapan relasi/atribut wajib + riwayat transisi. */
export function StatusPanel({ type, row }: { type: ObjType; row: api.Row }) {
  const ready = useQuery({ queryKey: ['eaw', 'readiness', type, row.id, row.version], queryFn: () => api.get<{ ready: boolean; rules: { rule: string; ok: boolean; n: number; pesan: string }[] }>(`/api/v1/eaw/readiness/${type}/${row.id}`), retry: false, enabled: type !== 'reference' });
  return (
    <>
      {ready.data?.rules?.length ? (
        <Section title={t('Kesiapan Divalidasi (EAW-05)')} actions={<Badge cls={ready.data.ready ? 'b-ok' : 'b-warn'}>{ready.data.ready ? t('siap') : t('belum siap')}</Badge>}>
          <div className="list" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
            {ready.data.rules.map((r) => (
              <div key={r.rule} className="li"><span className="ic">{r.ok ? '✓' : '✗'}</span><span className="bd"><div className="t">{r.pesan}</div><div className="d">{r.rule} · n = {r.n}</div></span></div>
            ))}
          </div>
        </Section>
      ) : null}
      <HistorySection type={type} row={row} />
    </>
  );
}
export type { PageAction };
