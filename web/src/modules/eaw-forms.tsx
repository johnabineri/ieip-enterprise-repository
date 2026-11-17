'use client';
/* Aksi tulis EAW (buat / ubah / hapus Draf) untuk objek domain 6 (`/eaw/objects/<path>`) dan aplikasi (`/eaw/applications`). Formulir = modal bergaya mockup
   (.form-grid/.field/.callout). Aturan sebenarnya di server/DB: izin (eaw.model.write / eaw.catalog.write), cakupan entitas (RLS + eaw.can_edit),
   hanya Draf yang dapat diubah/dihapus (trigger AF-05), konkurensi If-Match (412/428), validasi constraint DB (422). UI hanya mempermudah. */
import * as React from 'react';
import * as api from '@/lib/api';
import { invalidateData, lookup } from '@/lib/query';
import { useSession } from '@/store/session';
import { toast } from '@/store/ui';
import { confirmDialog, formDialog, type FormField, type Values } from '@/components/overlay';
import { Callout } from '@/components/ui';
import type { ObjType } from './eaw-status';
import { t } from '@/lib/i18n';

const pick = (label: string, opts: string[], blank = true): { type: 'select'; options: [string, string][] } => ({ type: 'select', options: [...(blank ? [['', `— ${label} —`] as [string, string]] : []), ...opts.map((o) => [o, o] as [string, string])] });

export interface ObjSpec { path: string; label: string; type: ObjType; domain: string; fields: FormField[] }
export const OBJ: Record<string, ObjSpec> = {
  processes: { path: 'processes', type: 'process', domain: 'proses_bisnis', label: t('Proses'), fields: [
    { name: 'nama', label: t('Nama'), req: true, max: 200, full: true }, { name: 'level', label: t('Level'), type: 'number', req: true, min: 1, hint: t('1 = rantai nilai (L1), 2 = L2, …') },
    { name: 'pemilikJabatan', label: t('Pemilik (jabatan)'), max: 100 }, { name: 'input', label: t('Input'), type: 'textarea', max: 2000 }, { name: 'output', label: t('Output'), type: 'textarea', max: 2000 }] },
  'data-entities': { path: 'data-entities', type: 'data_entity', domain: 'data', label: t('Entitas data'), fields: [
    { name: 'namaKanonikal', label: t('Nama kanonikal'), req: true, max: 200, full: true }, { name: 'klasifikasi', label: t('Klasifikasi'), req: true, ...pick(t('pilih'), ['publik', 'internal', 'terbatas', 'rahasia']) },
    { name: 'pii', label: 'PII', type: 'checkbox', placeholder: t('mengandung data pribadi') }, { name: 'steward', label: t('Steward'), max: 100 }, { name: 'sumberOtoritatif', label: t('Sumber otoritatif'), max: 100 },
    { name: 'retensiHari', label: t('Retensi (hari)'), type: 'number', min: 0 }] },
  services: { path: 'services', type: 'service', domain: 'layanan', label: t('Layanan'), fields: [
    { name: 'nama', label: t('Nama'), req: true, max: 200, full: true }, { name: 'tipe', label: t('Tipe'), req: true, ...pick(t('pilih'), ['internal', 'pelanggan-mitra']) },
    { name: 'kategori', label: t('Kategori'), req: true, ...pick(t('pilih'), ['utama', 'pendukung']) }, { name: 'pemilik', label: t('Pemilik'), max: 100 }, { name: 'slo', label: 'SLO', max: 200 }, { name: 'kanal', label: t('Kanal'), max: 100 }] },
  'infra-assets': { path: 'infra-assets', type: 'infra_asset', domain: 'infrastruktur', label: t('Aset infrastruktur'), fields: [
    { name: 'nama', label: t('Nama'), req: true, max: 200, full: true }, { name: 'tipe', label: t('Tipe'), req: true, ...pick(t('pilih'), ['klaster-k8s', 'klaster-db', 'gpu', 'jaringan', 'cloud', 'dc-fisik']) },
    { name: 'lokasi', label: t('Lokasi'), max: 100 }, { name: 'kapasitas', label: t('Kapasitas'), max: 100 }, { name: 'drTier', label: 'DR tier', max: 20 }] },
  controls: { path: 'controls', type: 'control', domain: 'keamanan', label: t('Kontrol keamanan'), fields: [
    { name: 'aspek', label: t('Aspek'), req: true, ...pick(t('pilih'), ['kerahasiaan', 'keutuhan', 'ketersediaan', 'keaslian', 'kenirsangkalan']) },
    { name: 'standarRujukan', label: t('Standar rujukan'), max: 100 }, { name: 'statusPenerapan', label: t('Penerapan'), req: true, ...pick(t('pilih'), ['belum', 'sebagian', 'penuh']) }] },
};

/** Entitas yang boleh disusun pengguna (cermin eaw.can_edit; RLS tetap memutuskan). */
export async function editableEntities(): Promise<[string, string][]> {
  const sc = useSession.getState().me?.scope;
  const rows = (await lookup('entities')).rows.filter((e) => e.groupKind !== 'business_unit' || sc?.editEntityCodes.includes(e.code));
  const ok = rows.filter((e) => sc?.editAll || sc?.editEntityCodes.includes(e.code));
  return [['', `— ${t('pilih entitas')} —`], ...ok.map((e) => [e.id, `${e.code} · ${e.name}`] as [string, string])];
}

/** Pilihan referensi KRA sedomain (KRA harus berlaku — Ditetapkan/Dipublikasi — saat Divalidasi; DB menolak lintas domain). */
async function kraField(domain: string): Promise<FormField> {
  const refs = await api.all('/api/v1/eaw/references').catch(() => [] as api.Row[]);
  return { name: 'referensiId', label: t('Referensi KRA'), type: 'select', hint: t('Wajib tertaut (KRA berlaku, sedomain) sebelum Divalidasi.'),
    options: [['', `— ${t('tanpa KRA')} —`], ...refs.filter((r) => r.domain === domain).map((r) => [r.id, `${r.kode} · ${r.nama} (${r.status})`] as [string, string])] };
}

/** Tipe relasi bawaan aplikasi(workspace) → objek domain (matriks eaw.relation_allowed: sumber = aplikasi). */
export const APP_LINK: Partial<Record<ObjType, string>> = { process: 'serving', data_entity: 'access', service: 'realization', infra_asset: 'assignment', control: 'association' };

/** Workspace yang relasinya boleh diubah (hanya sumber berstatus Draf — aturan DB eaw.relation). */
export async function draftWorkspaces(): Promise<[string, string][]> {
  const apps = await api.all('/api/v1/eaw/applications').catch(() => [] as api.Row[]);
  return apps.filter((a) => a.jenisNode === 'workspace' && a.status === 'Draf').sort((a, b) => String(a.kode).localeCompare(String(b.kode)))
    .map((a) => [a.id, `${a.kode} · ${a.nama}`] as [string, string]);
}
async function workspaceField(type: ObjType): Promise<FormField | null> {
  if (!APP_LINK[type]) return null;
  const ws = await draftWorkspaces();
  return { name: 'workspaceId', label: t('Workspace yang menjalankan'), type: 'select', full: true,
    hint: t('Menghubungkan lewat relasi (sumber = workspace, tipe {0}). Hanya workspace berstatus Draf yang dapat diubah relasinya; tambahan lain lewat tombol + Workspace di drawer.', APP_LINK[type]!),
    options: [['', `— ${t('tanpa workspace')} —`], ...ws] };
}

/** Pilihan proses induk (hanya L1/L2 — hierarki maksimum 3 tingkat, kolom `level` 1–3); proses itu sendiri tidak ditawarkan. */
async function parentField(selfId?: string): Promise<FormField> {
  const procs = await api.all('/api/v1/eaw/objects/processes').catch(() => [] as api.Row[]);
  return { name: 'parentId', label: t('Proses induk'), type: 'select', full: true, hint: t('Kosong = proses puncak (L1). Level proses = level induk + 1.'),
    options: [['', `— ${t('tanpa induk (L1)')} —`], ...procs.filter((r) => r.level < 3 && r.id !== selfId).sort((a, b) => a.level - b.level || String(a.nama).localeCompare(String(b.nama)))
      .map((r) => [r.id, `L${r.level} · ${r.nama}`] as [string, string])] };
}
/** Level harus = level induk + 1 dan induk sama-entitas (DB tidak memeriksa level; diperiksa di sini agar pohon tidak miring). */
async function checkParent(v: Values, entityId: string | undefined, selfId?: string) {
  if (!v.parentId) { if (Number(v.level) !== 1) throw new Error(t('Proses tanpa induk harus Level 1.')); return; }
  if (v.parentId === selfId) throw new Error(t('Proses tidak dapat menjadi induk dirinya sendiri.'));
  const par = await api.get<api.Row>(`/api/v1/eaw/objects/processes/${v.parentId}`);
  if (Number(v.level) !== Number(par.level) + 1) throw new Error(t('Level harus {0} (induk "{1}" berlevel {2}).', Number(par.level) + 1, par.nama, par.level));
  if (entityId && par.entityId !== entityId) throw new Error(t('Induk harus berada di entitas pemilik yang sama.'));
}

/** Perbedaan nilai formulir terhadap baris awal → badan PATCH (nilai dikosongkan = null). */
export function diff(fields: FormField[], v: Values, row: api.Row): Values {
  const out: Values = {};
  for (const f of fields) {
    const was = row[f.name] ?? (f.type === 'checkbox' ? false : undefined);
    const now = v[f.name];
    if ((was ?? undefined) !== (now ?? undefined)) out[f.name] = now ?? null;
  }
  return out;
}
/** Menulis lalu menyegarkan data; galat DILEMPAR agar modal tetap terbuka dan menampilkan alasan server (problem+json). */
export const write = async (fn: () => Promise<unknown>, ok: string) => { await fn(); invalidateData(); toast(ok, undefined, 'success'); };
export const draft = (row: api.Row) => { if (row.status !== 'Draf') { toast(t('Hanya Draf yang dapat diubah'), t('Status {0} dikunci; perubahan lewat alur AF-05 (transisi status).', row.status), 'warning'); return false; } return true; };

export async function createObject(o: ObjSpec) {
  const entities = await editableEntities();
  const wsField = await workspaceField(o.type);
  if (entities.length < 2) return toast(t('Tidak ada entitas yang dapat Anda susun'), t('Minta admin menugaskan peran penyusun pada sebuah entitas.'), 'warning');
  formDialog({
    title: `+ ${o.label}`, sub: `POST /api/v1/eaw/objects/${o.path}`, submit: t('Simpan Draf'),
    intro: <div className="mb"><Callout tone="gold">{t('Status awal: Draf (AF-05). Validasi/penetapan lewat alur status; relasi wajib dilengkapi sebelum Divalidasi.')}</Callout></div>,
    fields: [{ name: 'entityId', label: t('Entitas pemilik'), type: 'select', req: true, options: entities, full: true }, ...o.fields, ...(o.type === 'process' ? [await parentField()] : []), ...(wsField ? [wsField] : []), await kraField(o.domain)],
    onSubmit: async (v) => {
      if (o.type === 'process') await checkParent(v, v.entityId);
      const { workspaceId, ...payload } = v;
      const made = await api.post<api.Row>(`/api/v1/eaw/objects/${o.path}`, { ...payload, ...(o.type === 'process' && !v.parentId ? { parentId: undefined } : {}) });
      invalidateData();
      if (workspaceId) {
        try { await api.post('/api/v1/eaw/relations', { sumberType: 'application', sumberId: workspaceId, targetType: o.type, targetId: made.id, tipe: APP_LINK[o.type] }); }
        catch (e) { toast(t('{0} dibuat, tetapi relasi ke workspace gagal', o.label), api.explain(e), 'warning'); return; }
        invalidateData(); toast(t('{0} dibuat (Draf) dan dihubungkan ke workspace', o.label), undefined, 'success'); return;
      }
      toast(t('{0} dibuat (Draf)', o.label), undefined, 'success');
    },
  });
}
export async function editObject(o: ObjSpec, row: api.Row) {
  if (!draft(row)) return;
  const fields = [...o.fields, ...(o.type === 'process' ? [await parentField(row.id)] : []), await kraField(o.domain)];
  formDialog({
    title: `${t('Ubah')} ${o.label}`, sub: `PATCH /api/v1/eaw/objects/${o.path}/${String(row.id).slice(0, 8)}… · If-Match "${row.version}"`, initial: row, fields,
    onSubmit: async (v) => {
      const body = diff(fields, v, row);
      if (!Object.keys(body).length) throw new Error(t('Tidak ada perubahan.'));
      if (o.type === 'process' && ('parentId' in body || 'level' in body)) await checkParent({ ...v, level: v.level ?? row.level }, row.entityId, row.id);
      await write(() => api.patch(`/api/v1/eaw/objects/${o.path}/${row.id}`, body, row.version), t('{0} diperbarui', o.label));
    },
  });
}
export function deleteObject(o: ObjSpec, row: api.Row) {
  if (!draft(row)) return;
  confirmDialog({ title: t('Hapus {0} Draf?', o.label), text: t('Penghapusan bersifat hapus-lunak dan hanya untuk Draf dalam cakupan Anda.'), danger: true, ok: t('Hapus'),
    onOk: () => write(() => api.del(`/api/v1/eaw/objects/${o.path}/${row.id}`), t('{0} dihapus', o.label)) });
}

/* ---------- aplikasi (formulir sesuai mockup A.appForm: 4 metadata wajib EAW-02) ---------- */
const APP_FIELDS = (platforms: [string, string][]): FormField[] => [
  { name: 'kode', label: t('Kode'), req: true, max: 50, placeholder: t('mis. FORTRESS'), hint: t('Huruf besar, angka, _ . -') },
  { name: 'nama', label: t('Nama'), req: true, max: 200, placeholder: t('Mutu & GRC FORTRESS') },
  { name: 'platform', label: t('Platform induk'), type: 'select', options: platforms, hint: t('Kosong = ini platform') },
  { name: 'jenis', label: t('Jenis'), type: 'select', req: true, options: [['umum', t('Umum (platform holding)')], ['khusus', t('Khusus (STRIDE per SBU)')]] },
  { name: 'workspaceMode', label: t('Mode workspace'), type: 'select', options: [['INTERNAL_ROUTED', 'INTERNAL_ROUTED'], ['FEDERATED_REMOTE', 'FEDERATED_REMOTE']] },
  { name: 'repoGit', label: t('Repositori Git (D-02)'), max: 255, placeholder: 'git.kalla/base' },
  { name: 'ownerBisnis', label: t('Pemilik Bisnis (jabatan)'), req: true, max: 100, placeholder: t('mis. Kepala Divisi Mutu') },
  { name: 'timPengembang', label: t('Tim Pengembang'), req: true, max: 100, placeholder: t('mis. Tim GRC Tech') },
  { name: 'risikoAi', label: t('Risiko AI'), type: 'select', req: true, options: [['', `— ${t('pilih')} —`], ...['none', 'low', 'medium', 'high'].map((x) => [x, x] as [string, string])] },
  { name: 'slo', label: 'SLO', req: true, max: 200, placeholder: t('mis. 99,5% · p95 ≤ 500ms') },
];
export async function createApplication() {
  const entities = await editableEntities();
  if (entities.length < 2) return toast(t('Tidak ada entitas yang dapat Anda susun'), t('Minta admin menugaskan peran penyusun pada sebuah entitas.'), 'warning');
  const apps = await api.all('/api/v1/eaw/applications').catch(() => [] as api.Row[]);
  const platforms: [string, string][] = [['', `— ${t('platform (tanpa induk)')} —`], ...apps.filter((a) => a.jenisNode === 'platform').map((a) => [a.kode, `${a.kode} · ${a.nama}`] as [string, string])];
  formDialog({
    title: t('Daftarkan Aplikasi / Workspace'), sub: 'POST /api/v1/eaw/applications · scope eaw.catalog.write', submit: t('Simpan Draf'), initial: { jenis: 'umum', workspaceMode: 'INTERNAL_ROUTED' },
    intro: <div className="mb"><Callout tone="gold"><b>{t('4 metadata wajib (EAW-02)')}</b> — {t('penyimpanan ditolak bila tidak lengkap.')}</Callout></div>,
    fields: [...APP_FIELDS(platforms), await kraField('aplikasi'), { name: 'entityId', label: t('Entitas pemilik'), type: 'select', req: true, options: entities }],
    onSubmit: (v) => write(() => api.post('/api/v1/eaw/applications', v), t('Aplikasi didaftarkan (Draf)')),
  });
}
export async function editApplication(row: api.Row) {
  if (!draft(row)) return;
  const fields = [...APP_FIELDS([]).filter((f) => !['kode', 'platform'].includes(f.name)), await kraField('aplikasi')];
  formDialog({
    title: `${t('Ubah')} ${row.kode}`, sub: `PATCH /api/v1/eaw/applications/${String(row.id).slice(0, 8)}… · If-Match "${row.version}"`, initial: row, fields,
    onSubmit: async (v) => {
      const body = diff(fields, v, row);
      if (!Object.keys(body).length) throw new Error(t('Tidak ada perubahan.'));
      await write(() => api.patch(`/api/v1/eaw/applications/${row.id}`, body, row.version), t('Aplikasi diperbarui'));
    },
  });
}
export function deleteApplication(row: api.Row) {
  if (!draft(row)) return;
  confirmDialog({ title: t('Hapus {0}?', row.kode), text: t('Hapus-lunak; hanya aplikasi berstatus Draf dalam cakupan Anda.'), danger: true, ok: t('Hapus'),
    onOk: () => write(() => api.del(`/api/v1/eaw/applications/${row.id}`), t('Aplikasi dihapus')) });
}
