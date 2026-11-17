'use client';
/* Penulisan tata kelola EAW: KRA (EAW-06), ADR (EAW-04), ARB Clearance (SRS 5.3). Aturan SEBENARNYA ada di server/DB — izin (eaw.reference.write, eaw.adr.write,
   eaw.baseline.approve, gov.arb.write/approve), KRA hanya Draf yang dapat disunting/dihapus, isi ADR terkunci setelah Proposed (trigger DB), alur ARB
   SUBMITTED → IN_REVIEW → (REVISION ↔ SUBMITTED | APPROVED | REJECTED) lewat eaw.arb_transition() dengan empat mata (pengaju tidak meninjau/memutus tiketnya sendiri),
   catatan ≥ 10 karakter untuk REVISION/REJECTED. UI hanya mempermudah dan meneruskan; galat server (403/412/422) tampil di modal tanpa menutupnya. */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { fmtNum } from '@/lib/format';
import { invalidateData } from '@/lib/query';
import { useSession } from '@/store/session';
import { toast } from '@/store/ui';
import { formDialog, Modal, openDrawer, type FormField } from '@/components/overlay';
import { Badge, Btn, Callout, DL, Field, Input, MiniTable, Section, Select, Tag, Textarea } from '@/components/ui';
import type { RowAction } from '@/components/grid/grid-page';
import { HistorySection, StatusPanel } from './eaw-status';
import { diff, draft, editableEntities, write } from './eaw-forms';
import { t } from '@/lib/i18n';

type Action = RowAction & { variant?: 'pri' | 'danger' };
const uid = () => useSession.getState().me?.userId;

/* ====================== KRA ====================== */
const DOMAINS: [string, string][] = [['proses_bisnis', t('Proses Bisnis')], ['layanan', t('Layanan')], ['data', t('Data')], ['aplikasi', t('Aplikasi')], ['infrastruktur', t('Infrastruktur')], ['keamanan', t('Keamanan')]];
const KRA_EDIT: FormField[] = [
  { name: 'nama', label: t('Nama'), req: true, max: 200, full: true },
  { name: 'versi', label: t('Versi KRA'), max: 20, placeholder: '1.0', hint: t('Menaikkan versi KRA berstatus Dipublikasi menandai objek tertaut untuk direviu (AF-07).') },
  { name: 'deskripsi', label: t('Deskripsi'), type: 'textarea' },
];
export function createKra() {
  formDialog({
    title: `+ ${t('KRA baru')}`, sub: 'POST /api/v1/eaw/references', submit: t('Simpan Draf'),
    intro: <div className="mb"><Callout tone="gold">{t('Status awal: Draf. Hanya Holding EA Office yang menyusun KRA; objek domain wajib tertaut ke KRA sedomain yang berlaku.')}</Callout></div>,
    fields: [{ name: 'domain', label: t('Domain'), type: 'select', req: true, options: [['', `— ${t('pilih')} —`], ...DOMAINS] },
      { name: 'kode', label: t('Kode'), req: true, max: 50, placeholder: 'KRA-LYN-PLATFORM', hint: t('Huruf besar, angka, _ . -') }, ...KRA_EDIT],
    onSubmit: (v) => write(() => api.post('/api/v1/eaw/references', v), t('KRA dibuat (Draf)')),
  });
}
export function editKra(row: api.Row) {
  if (!draft(row)) return;
  formDialog({
    title: `${t('Ubah')} ${row.kode}`, sub: `PATCH /api/v1/eaw/references/${String(row.id).slice(0, 8)}… · If-Match "${row.version}"`, initial: row, fields: KRA_EDIT,
    onSubmit: async (v) => {
      const body = diff(KRA_EDIT, v, row);
      if (!Object.keys(body).length) throw new Error(t('Tidak ada perubahan.'));
      const r = await api.patch(`/api/v1/eaw/references/${row.id}`, body, row.version);
      invalidateData();
      toast(t('KRA diperbarui'), r?.reviewCascade ? t('AF-07: {0} objek tertaut masuk Direviu.', r.reviewCascade.total ?? 0) : undefined, 'success');
    },
  });
}
export function deleteKra(row: api.Row) {
  if (!draft(row)) return;
  formDialog({ title: t('Hapus {0}?', row.kode), intro: <p className="mb">{t('Hapus-lunak; hanya KRA berstatus Draf.')}</p>, submit: t('Hapus'), danger: true, fields: [],
    onSubmit: () => write(() => api.del(`/api/v1/eaw/references/${row.id}`), t('KRA dihapus')) });
}
/** Pratinjau dampak AF-07 (hanya peran lintas-holding; selain itu disembunyikan) + status/riwayat. */
export function KraExtra({ row }: { row: api.Row }) {
  const q = useQuery({ queryKey: ['eaw', 'kra-impact', row.id, row.version], queryFn: () => api.get<{ total: number; willReview: number; unaffectedStatus: number; byType: Record<string, Record<string, number>>; catatan: string }>(`/api/v1/eaw/references/${row.id}/impact`), retry: false });
  return (
    <>
      <Section title={t('Dampak AF-07')} actions={q.data ? <Badge cls={q.data.willReview ? 'b-warn' : 'b-ok'}>{t('{0} akan Direviu', q.data.willReview)}</Badge> : null}>
        {q.isPending ? <span className="muted small">{t('Memuat…')}</span> : q.isError ? <span className="muted small">{t('Pratinjau dampak hanya untuk peran lintas-holding.')}</span> : (
          <>
            <p className="small muted mb">{t('{0} objek tertaut; hanya yang Dipublikasi masuk Direviu bila versi KRA dinaikkan.', fmtNum(q.data.total))}</p>
            <MiniTable rows={Object.entries(q.data.byType)} empty={t('Belum ada objek tertaut.')} columns={[
              { label: t('Jenis'), render: ([k]) => <Tag>{k}</Tag> },
              { label: t('Status'), render: ([, by]) => <span className="row" style={{ gap: 4 }}>{Object.entries(by).map(([s, n]) => <Badge key={s} value={s}>{s} · {n}</Badge>)}</span> },
            ]} />
          </>
        )}
      </Section>
      <StatusPanel type="reference" row={row} />
    </>
  );
}

/* ====================== ADR ====================== */
const ADR_FIELDS: FormField[] = [
  { name: 'title', label: t('Judul'), req: true, max: 200, full: true },
  { name: 'context', label: t('Konteks'), type: 'textarea', req: true }, { name: 'decision', label: t('Keputusan'), type: 'textarea', req: true },
  { name: 'consequences', label: t('Konsekuensi'), type: 'textarea' }, { name: 'gitRef', label: t('Referensi Git'), max: 255, placeholder: 'docs/adr/ADR-EAP-004.md' },
];
export function createAdr() {
  formDialog({
    title: `+ ${t('ADR Baru')}`, sub: 'POST /api/v1/eaw/adrs', submit: t('Simpan (Proposed)'),
    intro: <div className="mb"><Callout tone="gold">{t('ADR baru selalu berstatus Proposed. Keputusan (Accepted/Deprecated/Superseded) oleh pemegang eaw.baseline.approve; setelah itu isinya terkunci.')}</Callout></div>,
    fields: [{ name: 'adrCode', label: t('Kode ADR'), req: true, max: 20, placeholder: 'ADR-EAP-004', hint: t('Huruf besar, angka, . _ -') }, ...ADR_FIELDS],
    onSubmit: (v) => write(() => api.post('/api/v1/eaw/adrs', v), t('ADR dibuat (Proposed)')),
  });
}
export function editAdr(row: api.Row) {
  if (row.status !== 'Proposed') { toast(t('Isi ADR terkunci'), t('ADR berstatus {0}; buat ADR baru yang menggantikannya (Superseded).', row.status), 'warning'); return; }
  formDialog({
    title: `${t('Ubah')} ${row.adrCode}`, sub: `PATCH /api/v1/eaw/adrs/${String(row.id).slice(0, 8)}… · If-Match "${row.version}"`, initial: row, fields: ADR_FIELDS,
    onSubmit: async (v) => {
      const body = diff(ADR_FIELDS, v, row);
      if (!Object.keys(body).length) throw new Error(t('Tidak ada perubahan.'));
      await write(() => api.patch(`/api/v1/eaw/adrs/${row.id}`, body, row.version), t('ADR diperbarui'));
    },
  });
}
/** Keputusan atas ADR (POST /eaw/adrs/:id/status): izin eaw.baseline.approve ditegakkan trigger DB. */
export function adrActions(row: api.Row, close: () => void): Action[] {
  const decide = (status: string, supersededBy?: string) => write(() => api.post(`/api/v1/eaw/adrs/${row.id}/status`, { status, supersededBy }), t('Status ADR: {0}', status)).then(close);
  if (row.status === 'Proposed') return [{ label: t('Terima (Accepted)'), perm: 'eaw.baseline.approve', variant: 'pri', run: () => formDialog({ title: `${row.adrCode} → Accepted`, submit: t('Terima'), fields: [], intro: <p className="mb">{t('Keputusan ARB: ADR diterima dan isinya terkunci.')}</p>, onSubmit: () => decide('Accepted') }) }];
  if (row.status === 'Accepted') return [
    { label: t('Gantikan (Superseded)'), perm: 'eaw.baseline.approve', variant: 'pri', run: async () => {
      const all = await api.all('/api/v1/eaw/adrs').catch(() => [] as api.Row[]);
      formDialog({ title: `${row.adrCode} → Superseded`, submit: t('Gantikan'), intro: <p className="mb">{t('Pilih ADR pengganti (yang menggantikan keputusan ini).')}</p>,
        fields: [{ name: 'supersededBy', label: t('ADR pengganti'), type: 'select', req: true, options: [['', `— ${t('pilih')} —`], ...all.filter((a) => a.id !== row.id).map((a) => [a.id, `${a.adrCode} · ${a.title} (${a.status})`] as [string, string])] }],
        onSubmit: (v) => decide('Superseded', v.supersededBy) });
    } },
    { label: t('Usangkan (Deprecated)'), perm: 'eaw.baseline.approve', run: () => formDialog({ title: `${row.adrCode} → Deprecated`, submit: t('Usangkan'), danger: true, fields: [], intro: <p className="mb">{t('ADR tidak lagi berlaku tanpa pengganti.')}</p>, onSubmit: () => decide('Deprecated') }) },
  ];
  return [];
}

/* ====================== ARB ====================== */
const ARB_FIELDS: FormField[] = [
  { name: 'initiativeName', label: t('Nama inisiatif'), req: true, full: true, hint: t('Min. 3 karakter') },
  { name: 'businessCase', label: t('Business case'), type: 'textarea', req: true, hint: t('Min. 10 karakter') },
  { name: 'estimatedCost', label: t('Estimasi biaya (IDR)'), type: 'number', min: 0 },
];
interface Screen { score: number; threshold: number; matches: { kode: string; nama: string; status: string; similarity: number }[]; violations: { entity: string; message: string }[] }

function NewArb({ entities, close }: { entities: [string, string][]; close: () => void }) {
  const [v, setV] = React.useState<Record<string, string>>({ entityId: '', initiativeName: '', businessCase: '', estimatedCost: '', dataEntities: '' });
  const [sc, setSc] = React.useState<Screen | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<'screen' | 'save' | null>(null);
  const set = (k: string, x: string) => setV((s) => ({ ...s, [k]: x }));
  const de = () => v.dataEntities.split(',').map((x) => x.trim()).filter(Boolean);
  const screen = async () => {
    setErr(null); setBusy('screen');
    try { setSc(await api.post<Screen>('/api/v1/gov/arb/clearances/screen', { initiativeName: v.initiativeName, businessCase: v.businessCase || undefined, dataEntities: de() })); }
    catch (x) { setErr(api.explain(x)); } finally { setBusy(null); }
  };
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault(); setErr(null);
    if (!v.entityId || v.initiativeName.length < 3 || v.businessCase.length < 10) return setErr(t('Lengkapi entitas, nama inisiatif (≥ 3) dan business case (≥ 10 karakter).'));
    setBusy('save');
    try {
      await api.post('/api/v1/gov/arb/clearances', { entityId: v.entityId, initiativeName: v.initiativeName, businessCase: v.businessCase, estimatedCost: v.estimatedCost === '' ? undefined : Number(v.estimatedCost), dataEntities: de().length ? de() : undefined });
      invalidateData(); toast(t('Tiket ARB diajukan (SUBMITTED)'), undefined, 'success'); close();
    } catch (x) { setErr(api.explain(x)); } finally { setBusy(null); }
  };
  return (
    <Modal title={`+ ${t('Ajukan Tiket ARB')}`} sub="POST /api/v1/gov/arb/clearances" close={close} onSubmit={submit}
      footer={<><Btn onClick={screen} disabled={busy !== null || v.initiativeName.length < 3}>{busy === 'screen' ? '…' : t('Pra-screening')}</Btn><span className="right" /><Btn onClick={close}>{t('Batal')}</Btn>
        <Btn variant="pri" type="submit" disabled={busy !== null} onClick={() => submit()}>{busy === 'save' ? '…' : t('Ajukan')}</Btn></>}>
      <div className="mb"><Callout tone="gold">{t('Setiap pengadaan/pembuatan aplikasi baru wajib clearance ARB. Skor kemiripan dihitung server (pg_trgm; heuristik leksikal, bukan model MIND AI); pelanggaran Satu Data Korporasi (M1) ditolak otomatis.')}</Callout></div>
      <div className="form-grid">
        <Field label={t('Entitas pengaju')} req full><Select value={v.entityId} onChange={(e) => set('entityId', e.target.value)}>{entities.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label={ARB_FIELDS[0].label} req full><Input type="text" value={v.initiativeName} onChange={(e) => set('initiativeName', e.target.value)} /></Field>
        <Field label={ARB_FIELDS[1].label} req full><Textarea value={v.businessCase} onChange={(e) => set('businessCase', e.target.value)} /></Field>
        <Field label={ARB_FIELDS[2].label}><Input type="number" min={0} value={v.estimatedCost} onChange={(e) => set('estimatedCost', e.target.value)} /></Field>
        <Field label={t('Entitas data yang disimpan')} hint={t('Pisahkan koma; dipakai pemeriksaan M1 (mis. customer, vendor).')}><Input type="text" value={v.dataEntities} onChange={(e) => set('dataEntities', e.target.value)} /></Field>
      </div>
      {sc ? (
        <div className="mt">
          <Callout tone={sc.violations.length ? 'err' : sc.score >= sc.threshold ? 'warn' : 'ok'}>
            <b>{t('Skor kemiripan: {0}%', sc.score)}</b> ({t('ambang duplikasi ≥ {0}%', sc.threshold)}){sc.violations.map((x) => <div key={x.entity}>⛔ {x.message}</div>)}
          </Callout>
          {sc.matches.length ? <div className="mt-s"><MiniTable rows={sc.matches} columns={[{ label: t('Kode'), mono: true, render: (m) => m.kode }, { label: t('Aplikasi serupa'), render: (m) => m.nama }, { label: t('Kemiripan'), num: true, render: (m) => `${m.similarity}%` }, { label: t('Status'), render: (m) => <Badge value={m.status} /> }]} /></div> : null}
        </div>
      ) : null}
      {err ? <div className="mt"><Callout tone="err">{err}</Callout></div> : null}
    </Modal>
  );
}
export async function createArb() {
  const entities = await editableEntities();
  if (entities.length < 2) return toast(t('Tidak ada entitas yang dapat Anda susun'), t('Minta admin menugaskan peran penyusun pada sebuah entitas.'), 'warning');
  openDrawer((close) => <NewArb entities={entities} close={close} />);
}
export function editArb(row: api.Row) {
  if (!['SUBMITTED', 'REVISION'].includes(row.status)) { toast(t('Tiket tidak dapat disunting'), t('Hanya tiket SUBMITTED/REVISION milik pengaju.'), 'warning'); return; }
  formDialog({
    title: `${t('Ubah')} ${row.ticketNumber}`, sub: `PATCH /api/v1/gov/arb/clearances/${String(row.id).slice(0, 8)}… · If-Match "${row.version}"`, initial: row, fields: ARB_FIELDS,
    onSubmit: async (v) => {
      const body = diff(ARB_FIELDS, v, row);
      if (!Object.keys(body).length) throw new Error(t('Tidak ada perubahan.'));
      await write(() => api.patch(`/api/v1/gov/arb/clearances/${row.id}`, body, row.version), t('Tiket diperbarui'));
    },
  });
}

interface ArbStep { to: string; label: string; perm: string; note?: 'optional' | 'min10'; primary?: boolean; danger?: boolean; proposerOnly?: boolean }
const ARB_FLOW: Record<string, ArbStep[]> = {
  SUBMITTED: [{ to: 'IN_REVIEW', label: t('Mulai Tinjau'), perm: 'gov.arb.write', primary: true }],
  IN_REVIEW: [
    { to: 'APPROVED', label: t('Setujui'), perm: 'gov.arb.approve', note: 'optional', primary: true },
    { to: 'REVISION', label: t('Minta Revisi'), perm: 'gov.arb.write', note: 'min10' },
    { to: 'REJECTED', label: t('Tolak'), perm: 'gov.arb.approve', note: 'min10', danger: true },
  ],
  REVISION: [{ to: 'SUBMITTED', label: t('Kirim Ulang'), perm: 'gov.arb.write', proposerOnly: true, primary: true }],
};
/** Langkah ARB dari status saat ini (eaw.arb_transition). Empat mata dicek di server; UI memberi peringatan dini. */
export function arbActions(row: api.Row, close: () => void): Action[] {
  return (ARB_FLOW[row.status] || []).map((s) => ({
    label: s.label, perm: s.perm, variant: s.primary ? 'pri' as const : s.danger ? 'danger' as const : undefined,
    run: () => {
      const mine = row.proposedBy === uid();
      if (s.proposerOnly && !mine) { toast(t('Hanya pengaju'), t('Hanya pengaju yang dapat mengirim ulang tiketnya.'), 'warning'); return; }
      if (!s.proposerOnly && mine) { toast(t('Empat mata (maker-checker)'), t('Pengaju tidak boleh meninjau atau memutus tiketnya sendiri.'), 'warning'); return; }
      formDialog({
        title: `${s.label} · ${row.status} → ${s.to}`, sub: `POST /api/v1/gov/arb/clearances/${String(row.id).slice(0, 8)}…/transition`, submit: s.label, danger: s.danger,
        intro: <p className="mb">{s.note === 'min10' ? t('Catatan ARB wajib (min. 10 karakter).') : t('Dicatat di jejak transisi; APPROVED menerbitkan sertifikat clearance.')}</p>,
        fields: s.note ? [{ name: 'notes', label: t('Catatan ARB'), type: 'textarea', req: s.note === 'min10' }] : [],
        onSubmit: async (v) => {
          if (s.note === 'min10' && String(v.notes || '').trim().length < 10) throw new Error(t('Catatan minimal 10 karakter.'));
          const r = await api.post<{ certificate_id?: string }>(`/api/v1/gov/arb/clearances/${row.id}/transition`, { to: s.to, notes: v.notes });
          invalidateData(); toast(t('Transisi ARB tercatat'), r.certificate_id ? `${t('Sertifikat')}: ${r.certificate_id}` : `${row.status} → ${s.to}`, 'success'); close();
        },
      });
    },
  }));
}
export function ArbExtra({ row }: { row: api.Row }) {
  return (
    <>
      <Section title={t('Business case')}><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{row.businessCase || '—'}</p></Section>
      <Section title={t('Putusan')}>
        <DL pairs={[[t('Catatan ARB'), row.arbNotes], [t('Sertifikat'), row.certificateId], [t('Diputus oleh'), row.decidedBy ? <span key="d" className="mono tiny">{String(row.decidedBy).slice(0, 8)}</span> : null], [t('Diputus pada'), row.decidedAt]]} />
      </Section>
      <HistorySection type="arb_clearance" row={row} />
    </>
  );
}
