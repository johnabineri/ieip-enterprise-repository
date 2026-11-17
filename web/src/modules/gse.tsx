'use client';
/* GSE — Generative Software Engineering: Proyek Scaffolding (wizard Scaffold Baru, gerbang AF-06, push/PR, bundel), Template & Blueprint (buat/ubah/hapus),
   Flow Builder + eksekusi saga (gse-flow.tsx). Web IDE (editor + commit) dan status PR kini di gse-ide.tsx dan gse-pr.tsx (eap/ui sudah diarsipkan).
   Aturan SEBENARNYA di server/DB; peran penulis = gse.project.run (ROLE_EAP_GSE_DEVELOPER). */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { GridPage } from '@/components/grid/grid-page';
import { col } from '@/components/grid/cols';
import { Drawer, confirmDialog, formDialog, openDrawer } from '@/components/overlay';
import { Btn, Tag } from '@/components/ui';
import { can } from '@/store/session';
import { toast } from '@/store/ui';
import { invalidateData } from '@/lib/query';
import { t } from '@/lib/i18n';
import FlowPage from './gse-flow';
import IdePage from './gse-ide';
import PrPage from './gse-pr';
import { GateChip, GATES, ProjectSummary, StatusBadge, openProject, openWizard, secs } from './gse-project';

/* ---------------------------------------------------------------- proyek ---------------------------------------------------------------- */
function Proyek() {
  const tq = useQuery({ queryKey: ['gse-tpls'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/gse/templates')).data });
  const names = new Map((tq.data || []).map((x) => [x.id, x.nama]));
  return <GridPage title={t('Proyek Scaffolding')} description={t('Scaffold full-stack dari template; hanya untuk aplikasi di katalog EAW berstatus minimal Divalidasi (gerbang AF-06). Hasil = branch + PR, tidak pernah ke main.')}
    path="/api/v1/gse/projects" exportName="proyek-gse" titleOf={(r) => r.kode} notice={<ProjectSummary />} deps={[tq.data]}
    create={{ label: `⚙ ${t('Scaffold Baru')}`, perm: 'gse.project.run', variant: 'pri', run: () => openWizard() }}
    onDetail={(r) => openProject(r.id)}
    columns={[col.mono('kode', t('Aplikasi'), { cellStyle: { fontWeight: 700 } }), col.calc(t('Template'), (r) => (r.templateIds || []).map((i: string) => names.get(i) || '?').join(' + ') || '—', { minWidth: 200, wrapText: true, autoHeight: true }),
      col.mono('branch', 'Branch', { maxWidth: 260 }), col.calc(t('Gerbang'), (r) => GATES.map((g) => r.gates?.[g]?.status || '-').join(' '), { minWidth: 190, cellRenderer: (p: { data?: api.Row }) => <span style={{ display: 'inline-flex', gap: 4 }}>{GATES.map((g) => <GateChip key={g} g={p.data?.gates?.[g]} />)}</span> }),
      col.num('fileCount', t('Berkas'), 0, { maxWidth: 110 }), col.calc(t('Durasi'), (r) => secs(r.durationMs), { maxWidth: 130 }),
      col.calc(t('Status'), (r) => r.status, { maxWidth: 170, cellRenderer: (p: { data?: api.Row }) => (p.data ? <StatusBadge s={p.data.status} /> : null) })]} />;
}

/* ---------------------------------------------------------------- template ---------------------------------------------------------------- */
const CATS = ['shell', 'frontend', 'backend', 'ddl', 'ci'];
const SAMPLE = JSON.stringify([{ path: 'README.md', content: '# {{app_nama}}\n' }], null, 2);
const parseFiles = (s: string) => { try { const x = JSON.parse(s); if (!Array.isArray(x)) throw 0; return x; } catch { throw new Error(t('Berkas harus berupa JSON array [{"path","content"}] yang sah')); } };

function createTemplate() {
  formDialog({
    title: t('Template Baru'), sub: 'POST /api/v1/gse/templates', initial: { kategori: 'backend', versi: '1.0.0', files: SAMPLE },
    fields: [{ name: 'kode', label: t('Kode'), req: true, placeholder: 'tpl-saya', hint: t('huruf kecil, angka, tanda hubung'), max: 50 }, { name: 'kategori', label: t('Kategori'), type: 'select', options: CATS.map((c) => [c, c]) },
      { name: 'nama', label: t('Nama'), req: true, full: true }, { name: 'stack', label: 'Stack', full: true }, { name: 'versi', label: t('Versi') }, { name: 'deskripsi', label: t('Deskripsi') },
      { name: 'files', label: t('Berkas (JSON: [{"path","content"}] dengan {{variabel}})'), type: 'textarea', req: true, full: true }],
    onSubmit: async (v) => { await api.post('/api/v1/gse/templates', { kode: v.kode, nama: v.nama, kategori: v.kategori, stack: v.stack, versi: v.versi, deskripsi: v.deskripsi, files: parseFiles(v.files) }); invalidateData(); toast(t('Template tersimpan'), v.kode, 'success'); },
  });
}
function editTemplate(tp: api.Row) {
  formDialog({
    title: `${t('Ubah')} ${tp.kode}`, sub: `PATCH /api/v1/gse/templates/${String(tp.id).slice(0, 8)}`, initial: { nama: tp.nama, stack: tp.stack || '', versi: tp.versi, deskripsi: tp.deskripsi || '', files: JSON.stringify(tp.files, null, 2) },
    fields: [{ name: 'nama', label: t('Nama'), req: true, full: true }, { name: 'stack', label: 'Stack', full: true }, { name: 'versi', label: t('Versi') }, { name: 'deskripsi', label: t('Deskripsi') },
      { name: 'files', label: t('Berkas (JSON: [{"path","content"}] dengan {{variabel}})'), type: 'textarea', req: true, full: true }],
    onSubmit: async (v) => { await api.patch(`/api/v1/gse/templates/${tp.id}`, { nama: v.nama, stack: v.stack, versi: v.versi, deskripsi: v.deskripsi, files: parseFiles(v.files) }, tp.version); invalidateData(); toast(t('Template tersimpan'), tp.kode, 'success'); },
  });
}

function TemplateDrawer({ id, close }: { id: string; close: () => void }) {
  const q = useQuery({ queryKey: ['gse-template', id], queryFn: () => api.get<api.Row>(`/api/v1/gse/templates/${id}`) });
  const [i, setI] = React.useState(0);
  const tp = q.data; const run = can('gse.project.run');
  if (!tp) return <Drawer title={t('Template')} close={close}><div className="small muted">{q.isError ? api.explain(q.error) : t('Memuat…')}</div></Drawer>;
  return (
    <Drawer title={tp.nama} sub={tp.stack || ''} wide close={close}
      footer={run ? <><Btn onClick={() => { close(); editTemplate(tp); }}>{t('Ubah')}</Btn>
        <Btn variant="danger" onClick={() => confirmDialog({ title: t('Hapus template ini?'), text: tp.kode, danger: true, ok: t('Hapus'), onOk: async () => { await api.del(`/api/v1/gse/templates/${tp.id}`); invalidateData(); close(); toast(t('Template dihapus'), undefined, 'success'); } })}>{t('Hapus')}</Btn></> : undefined}>
      <div className="row"><Tag>{tp.kode}</Tag><Tag>v{tp.versi}</Tag><Tag>{tp.kategori}</Tag></div>
      <p className="small mt-s">{tp.deskripsi || ''}</p>
      <h3 className="mt">{t('Berkas templat')} ({tp.files.length})</h3>
      <div className="small mt-s">{t('Variabel')}: {['app_kode', 'app_kode_lower', 'app_nama', 'platform', 'workspace_mode', 'federation_scope', 'iam_schema', 'repo_git'].map((v) => <code key={v} style={{ marginRight: 6 }}>{`{{${v}}}`}</code>)}</div>
      <div className="stack mt-s">{tp.files.map((f: any, k: number) => <div key={f.path}><a href="#" onClick={(e) => { e.preventDefault(); setI(k); }}><code className="tiny" style={k === i ? { fontWeight: 700 } : undefined}>{f.path}</code></a></div>)}</div>
      <pre className="code mt">{tp.files[i]?.content ?? ''}</pre>
    </Drawer>
  );
}

function Template() {
  return <GridPage title={t('Template & Blueprint')} description={t('Blueprint deterministik ber-{{variabel}} (kemampuan platform, bukan seed aplikasi): shell, frontend, backend, DDL, CI.')}
    path="/api/v1/gse/templates" all exportName="template-gse" titleOf={(r) => r.nama}
    create={{ label: `+ ${t('Template')}`, perm: 'gse.project.run', variant: 'pri', run: () => createTemplate() }}
    onDetail={(r) => openDrawer((close) => <TemplateDrawer id={r.id} close={close} />)}
    columns={[col.mono('kode', t('Kode'), { cellStyle: { fontWeight: 700 } }), col.strong('nama', t('Nama')), col.tag('kategori', t('Kategori')), col.text('stack', 'Stack'), col.text('versi', t('Versi'), { maxWidth: 100 }), col.num('fileCount', t('Berkas'), 0, { maxWidth: 110 })]} />;
}

export default { proyek: Proyek, template: Template, flow: FlowPage, ide: IdePage, pr: PrPage };
