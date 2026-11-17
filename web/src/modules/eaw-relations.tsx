'use client';
/* Relasi antar-objek (EAW-05, ArchiMate 3.2) di drawer Detail: daftar relasi keluar/masuk, tambah (sumber = objek ini = objek "atas"), hapus.
   Pasangan/tipe sah (matriks eaw.relation_allowed), kunci status (hanya sumber Draf yang relasinya dapat diubah) dan RLS ditegakkan DB; matriks di bawah
   hanya mencerminkannya agar pilihan formulir tidak menyesatkan. Relasi wajib adalah prasyarat Divalidasi (lihat blok kesiapan di eaw-status). */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { invalidateData } from '@/lib/query';
import { can } from '@/store/session';
import { toast } from '@/store/ui';
import { confirmDialog, Modal, openDrawer } from '@/components/overlay';
import { Btn, Callout, Field, MiniTable, Section, Select, Tag } from '@/components/ui';
import { StatusPanel, type ObjType } from './eaw-status';
import { APP_LINK, draftWorkspaces } from './eaw-forms';
import { t } from '@/lib/i18n';

/** Matriks sumber → target → tipe (cermin eaw.relation_allowed di eap/database/215_eaw_relations.sql). */
const MATRIX: Partial<Record<ObjType, Partial<Record<ObjType, string[]>>>> = {
  application: { service: ['serving', 'realization'], process: ['serving', 'association'], data_entity: ['access'], infra_asset: ['assignment', 'association'], control: ['association'], application: ['flow', 'serving', 'used-by'] },
  service: { process: ['realization', 'association', 'serving'] },
  process: { data_entity: ['access'], process: ['composition', 'triggering', 'flow'] },
};
const TARGET_PATH: Partial<Record<ObjType, string>> = {
  application: '/api/v1/eaw/applications', service: '/api/v1/eaw/objects/services', process: '/api/v1/eaw/objects/processes',
  data_entity: '/api/v1/eaw/objects/data-entities', infra_asset: '/api/v1/eaw/objects/infra-assets', control: '/api/v1/eaw/objects/controls',
};
const TYPE_LABEL: Partial<Record<ObjType, string>> = { application: t('Aplikasi'), service: t('Layanan'), process: t('Proses'), data_entity: t('Entitas data'), infra_asset: t('Infrastruktur'), control: t('Kontrol') };
const labelOf = (r: api.Row) => r.kode ? `${r.kode} · ${r.nama}` : r.nama || r.namaKanonikal || [r.aspek, r.standarRujukan].filter(Boolean).join(' · ') || String(r.id).slice(0, 8);

function AddRelation({ type, row, close }: { type: ObjType; row: api.Row; close: () => void }) {
  const outs = MATRIX[type] || {};
  const targets = Object.keys(outs) as ObjType[];
  const [target, setTarget] = React.useState<ObjType>(targets[0]);
  const [tipe, setTipe] = React.useState<string>(outs[targets[0]]![0]);
  const [tid, setTid] = React.useState('');
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const cands = useQuery({ queryKey: ['eaw', 'rel-targets', target], queryFn: () => api.all(TARGET_PATH[target]!) });
  const pickTarget = (x: ObjType) => { setTarget(x); setTipe(outs[x]![0]); setTid(''); };
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault(); setErr(null);
    if (!tid) return setErr(t('Pilih objek target.'));
    setBusy(true);
    try {
      await api.post('/api/v1/eaw/relations', { sumberType: type, sumberId: row.id, targetType: target, targetId: tid, tipe });
      invalidateData(); toast(t('Relasi ditambahkan'), undefined, 'success'); close();
    } catch (x) { setErr(api.explain(x)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`+ ${t('Relasi')}`} sub="POST /api/v1/eaw/relations" close={close} onSubmit={submit}
      footer={<><span className="right" /><Btn onClick={close}>{t('Batal')}</Btn><Btn variant="pri" type="submit" disabled={busy} onClick={() => submit()}>{busy ? '…' : t('Simpan')}</Btn></>}>
      <div className="mb"><Callout tone="info">{t('Sumber relasi = objek ini (objek "atas"). Hanya objek berstatus Draf yang relasinya dapat diubah.')}</Callout></div>
      <div className="form-grid">
        <Field label={t('Jenis target')} req><Select value={target} onChange={(e) => pickTarget(e.target.value as ObjType)}>{targets.map((x) => <option key={x} value={x}>{TYPE_LABEL[x]}</option>)}</Select></Field>
        <Field label={t('Tipe relasi')} req><Select value={tipe} onChange={(e) => setTipe(e.target.value)}>{(outs[target] || []).map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
        <Field label={t('Objek target')} req full hint={cands.isPending ? t('Memuat…') : undefined}>
          <Select value={tid} onChange={(e) => setTid(e.target.value)}>
            <option value="">— {t('pilih')} —</option>
            {(cands.data || []).filter((c) => c.id !== row.id).map((c) => <option key={c.id} value={c.id}>{labelOf(c)}{c.status ? ` (${c.status})` : ''}</option>)}
          </Select>
        </Field>
      </div>
      {err ? <div className="mt"><Callout tone="err">{err}</Callout></div> : null}
    </Modal>
  );
}

/** Menghubungkan objek ini ke sebuah workspace: relasi kanonik sumber = aplikasi/workspace → objek ini (workspace harus Draf; ditegakkan DB). */
function LinkWorkspace({ type, row, close }: { type: ObjType; row: api.Row; close: () => void }) {
  const tipes = MATRIX.application?.[type] || [APP_LINK[type]!];
  const ws = useQuery({ queryKey: ['eaw', 'draft-workspaces'], queryFn: draftWorkspaces });
  const [wid, setWid] = React.useState('');
  const [tipe, setTipe] = React.useState<string>(APP_LINK[type] || tipes[0]);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault(); setErr(null);
    if (!wid) return setErr(t('Pilih workspace.'));
    setBusy(true);
    try {
      await api.post('/api/v1/eaw/relations', { sumberType: 'application', sumberId: wid, targetType: type, targetId: row.id, tipe });
      invalidateData(); toast(t('Dihubungkan ke workspace'), undefined, 'success'); close();
    } catch (x) { setErr(api.explain(x)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`+ ${t('Workspace')}`} sub="POST /api/v1/eaw/relations (sumber = workspace)" close={close} onSubmit={submit}
      footer={<><span className="right" /><Btn onClick={close}>{t('Batal')}</Btn><Btn variant="pri" type="submit" disabled={busy} onClick={() => submit()}>{busy ? '…' : t('Simpan')}</Btn></>}>
      <div className="mb"><Callout tone="info">{t('Workspace menjalankan/melayani objek ini. Hanya workspace berstatus Draf yang relasinya dapat diubah.')}</Callout></div>
      <div className="form-grid">
        <Field label={t('Workspace')} req full hint={ws.isPending ? t('Memuat…') : undefined}>
          <Select value={wid} onChange={(e) => setWid(e.target.value)}>
            <option value="">— {t('pilih')} —</option>
            {(ws.data || []).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </Select>
        </Field>
        <Field label={t('Tipe relasi')} req><Select value={tipe} onChange={(e) => setTipe(e.target.value)}>{tipes.map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
      </div>
      {!ws.isPending && !(ws.data || []).length ? <div className="mt"><Callout tone="warn">{t('Tidak ada workspace berstatus Draf yang dapat dihubungkan.')}</Callout></div> : null}
      {err ? <div className="mt"><Callout tone="err">{err}</Callout></div> : null}
    </Modal>
  );
}

export function RelationsSection({ type, row }: { type: ObjType; row: api.Row }) {
  const q = useQuery({ queryKey: ['eaw', 'relations', type, row.id, row.version], queryFn: () => api.get<{ data: api.Row[] }>('/api/v1/eaw/relations', { objekType: type, objekId: row.id }), retry: false });
  const canOut = !!MATRIX[type] && row.status === 'Draf' && can('eaw.model.write');
  const remove = (r: api.Row) => confirmDialog({ title: t('Hapus relasi?'), text: `${r.sumberLabel} —${r.tipe}→ ${r.targetLabel}`, danger: true, ok: t('Hapus'),
    onOk: async () => { await api.del(`/api/v1/eaw/relations/${r.id}`); invalidateData(); toast(t('Relasi dihapus'), undefined, 'success'); } });
  return (
    <Section title={`${t('Relasi')}${q.data ? ` (${q.data.data.length})` : ''}`}
      actions={<>
        {APP_LINK[type] && can('eaw.model.write') ? <Btn sm onClick={() => openDrawer((close) => <LinkWorkspace type={type} row={row} close={close} />)}>+ {t('Workspace')}</Btn> : null}
        {canOut ? <Btn sm onClick={() => openDrawer((close) => <AddRelation type={type} row={row} close={close} />)}>+ {t('Relasi')}</Btn> : null}
      </>}>
      {q.isError ? <span className="muted small">{t('Relasi tidak tersedia untuk peran Anda.')}</span> : (
        <MiniTable rows={q.data?.data} empty={q.isPending ? t('Memuat…') : t('Belum ada relasi.')} columns={[
          { label: t('Arah'), render: (r) => (r.sumberId === row.id ? t('keluar →') : t('← masuk')) },
          { label: t('Tipe'), render: (r) => <Tag>{r.tipe}</Tag> },
          { label: t('Objek terkait'), render: (r) => { const out = r.sumberId === row.id; return <span>{out ? r.targetLabel : r.sumberLabel}<span className="tiny muted"> · {TYPE_LABEL[(out ? r.targetType : r.sumberType) as ObjType]}</span></span>; } },
          { label: '', render: (r) => (r.sumberId === row.id && row.status === 'Draf' && can('eaw.model.write') ? <button type="button" className="x" aria-label={t('Hapus relasi?')} onClick={() => remove(r)}>×</button> : null) },
        ]} />
      )}
    </Section>
  );
}

/** Isi bawah drawer objek: relasi + kesiapan + riwayat. */
export const objectExtra = (type: ObjType) => function ObjectExtra({ row }: { row: api.Row }) {
  return <><RelationsSection type={type} row={row} /><StatusPanel type={type} row={row} /></>;
};
