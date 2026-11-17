'use client';
/* Penerbit Dokumen Arsitektur (EAW-09, AF-08) + Impor Data (CSV / Exchange XML). Dokumen dihasilkan SERVER dari objek baseline (≥ Ditetapkan), tidak pernah diterima
   dari klien: berversi per (cakupan, format), ber-sha256, append-only; kerangka kerja wajib memenuhi 6 domain. HTML dipratinjau di iframe ber-sandbox dan diunduh sebagai
   lampiran; PDF dirender server dari HTML tersimpan (butuh peramban headless di image eaw). Impor: dry-run menjalankan INSERT sungguhan di transaksi yang dibatalkan
   (semua constraint/trigger/RLS menilai), commit semua-atau-tidak-sama-sekali untuk berkas yang SAMA. */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { downloadApi } from '@/lib/download';
import { fmtDT, fmtNum } from '@/lib/format';
import { invalidateData, useLookup } from '@/lib/query';
import { can } from '@/store/session';
import { toast } from '@/store/ui';
import { confirmDialog } from '@/components/overlay';
import { Badge, Btn, Callout, Card, Field, Input, MiniTable, PageHd, Select, Tag } from '@/components/ui';
import { t } from '@/lib/i18n';

/* ---------------------------------------------------------------- impor ---------------------------------------------------------------- */
const TYPES: [string, string][] = [['processes', t('Proses Bisnis (D1)')], ['data-entities', t('Entitas Data (D2)')], ['services', t('Layanan (D3)')], ['applications', t('Aplikasi / Platform / Workspace (D4)')],
  ['infra-assets', t('Aset Infrastruktur (D5)')], ['controls', t('Kontrol Keamanan (D6)')], ['relations', t('Relasi antar-objek')], ['diagram-xml', t('Diagram ArchiMate (Exchange XML)')]];

function ImportCard() {
  const ents = useLookup('entities');
  const log = useQuery({ queryKey: ['eaw-import-log'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/eaw/import/log').catch(() => ({ data: [] }))).data });
  const [type, setType] = React.useState('processes'); const [text, setText] = React.useState<string | null>(null); const [file, setFile] = React.useState('');
  const [entity, setEntity] = React.useState(''); const [nama, setNama] = React.useState(''); const [view, setView] = React.useState(''); const [xsdWarn, setXsdWarn] = React.useState(false);
  const [report, setReport] = React.useState<api.Row | null>(null); const [reportFor, setReportFor] = React.useState<string | null>(null); const [busy, setBusy] = React.useState(false);
  const isXml = type === 'diagram-xml'; const writer = can('eaw.model.write') || can('eaw.catalog.write');
  const post = (dryRun: boolean) => (isXml ? api.post('/api/v1/eaw/diagrams/import-xml', { entityId: entity, xml: text, nama: nama || undefined, view: view || undefined, xsd: xsdWarn ? 'warn' : undefined, dryRun, filename: file })
    : api.post('/api/v1/eaw/import', { type, csv: text, dryRun, filename: file }));
  const reset = () => { setReport(null); setReportFor(null); };
  const onFile = (f?: File) => { if (!f) return; const rd = new FileReader(); rd.onload = () => { setText(String(rd.result)); setFile(f.name); reset(); }; rd.onerror = () => toast(t('Gagal'), t('Gagal membaca berkas'), 'error'); rd.readAsText(f, 'utf-8'); };
  const validate = async () => { setBusy(true); try { setReport(await post(true)); setReportFor(text); } catch (e) { const b = (e as api.ApiError).body; if (b?.report) { setReport(b.report); setReportFor(text); } else { setReport(null); toast(t('Gagal'), api.explain(e), 'error'); } } finally { setBusy(false); } };
  const commit = () => confirmDialog({ title: t('Commit impor?'), text: t('Seluruh baris dibuat berstatus Draf dalam satu transaksi dan tercatat di jejak impor.'), ok: t('Commit'),
    onOk: async () => {
      try { const r = await post(false); setReport(r); setReportFor(text); invalidateData(); log.refetch(); toast(t('Impor di-commit'), isXml ? t('Diagram dibuat — buka di Kanvas ArchiMate') : t('{0} objek dibuat (Draf)', r.created), 'success'); }
      catch (e) { const b = (e as api.ApiError).body; if (b?.report) { setReport(b.report); setReportFor(text); toast(t('Impor dibatalkan'), t('Ada baris tidak valid — tidak ada data yang di-commit.'), 'error'); } else throw e; }
    } });
  const r = report; const fresh = reportFor === text; const ready = !!r && r.valid && fresh && !r.committed;
  const errs: api.Row[] = r?.errors || []; const warns: string[] = r?.warnings || [];
  return (
    <Card title={t('Impor Data (CSV / Exchange XML) — tervalidasi sebelum commit')}>
      <div className="grid g-1-2">
        <div className="stack">
          <Field label={t('Jenis data')}><Select value={type} onChange={(e) => { setType(e.target.value); setText(null); setFile(''); reset(); }}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          {isXml ? <>
            <Field label={t('Entitas pemilik diagram')} req><Select value={entity} onChange={(e) => { setEntity(e.target.value); reset(); }}><option value="">— {t('pilih entitas')} —</option>{ents.rows.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}</Select></Field>
            <Field label={t('Nama diagram')} hint={t('kosong = nama model')}><Input type="text" value={nama} onChange={(e) => { setNama(e.target.value); reset(); }} /></Field>
            <Field label="View" hint={t('kosong = view pertama')}><Input type="text" value={view} onChange={(e) => { setView(e.target.value); reset(); }} /></Field>
            <label className="tiny row" style={{ gap: 6 }}><input type="checkbox" checked={xsdWarn} onChange={(e) => { setXsdWarn(e.target.checked); reset(); }} />{t('Terima walau tidak sah terhadap XSD (galat skema menjadi peringatan)')}</label>
            <input type="file" accept=".xml,text/xml,application/xml" onChange={(e) => onFile(e.target.files?.[0])} style={{ maxWidth: 260 }} />
            <div className="tiny muted">{text ? `${file} · ${fmtNum(text.length)} ${t('karakter')}` : t('Belum ada berkas.')} {t('Hanya isi satu view yang diimpor; tipe di luar subset EAP diperingatkan. DTD/entitas ditolak; divalidasi terhadap XSD resmi ArchiMate 3.1 (Open Group); maks. 2 MB.')}</div></>
            : <>
              <div className="row"><Btn sm onClick={() => downloadApi(`/api/v1/eaw/import/template?type=${type}`, `template-${type}.csv`)}>⇩ {t('Templat CSV')}</Btn><input type="file" accept=".csv,.txt,text/csv" onChange={(e) => onFile(e.target.files?.[0])} style={{ maxWidth: 230 }} /></div>
              <div className="tiny muted">{text ? `${file} · ${fmtNum(text.length)} ${t('karakter')}` : t('Belum ada berkas.')} {t('Entitas, KRA, dan induk dirujuk lewat kode/nama; maks. 2.000 baris.')}</div></>}
          <div className="row"><Btn disabled={!text || busy || (isXml && !entity)} onClick={validate}>✓ {t('Validasi (dry-run)')}</Btn><Btn variant="pri" disabled={!writer || !ready} title={ready ? '' : t('Validasi dulu sampai 0 galat')} onClick={commit}>⇧ Commit</Btn></div>
          <h3>{t('Jejak impor (hanya yang di-commit)')}</h3>
          {log.data?.length ? <div className="stack small">{log.data.slice(0, 6).map((l, i) => <div key={i} className="row"><Tag>{l.type}</Tag><span style={{ flex: 1 }}>{l.filename || '—'} · {l.created}/{l.rows} {t('baris')}</span><code className="tiny">{String(l.sha256).slice(0, 8)}</code></div>)}</div> : <span className="small muted">{t('Belum ada impor di-commit.')}</span>}
        </div>
        <div>
          {!r ? <p className="tiny muted">{t('Pilih berkas lalu klik Validasi. Validasi menjalankan INSERT sungguhan di dalam transaksi yang dibatalkan — seluruh constraint, trigger, dan izin DB ikut menilai tiap baris.')}</p> : <>
            <Callout tone={r.valid ? 'ok' : 'err'} icon={r.valid ? '✓' : '✕'}>
              {r.counts ? <><b>{r.valid ? (r.committed ? t('Diagram dibuat') : t('Valid — siap di-commit')) : t('{0} galat', errs.length)}</b> · {t('model')} “{r.modelName || '—'}” · view <b>{r.viewName || t('(tanpa view)')}</b> · {r.counts.nodes} node, {r.counts.edges} {t('relasi')}{r.xsd?.checked ? ` · XSD ${r.xsd.valid ? t('sah') : t('tidak sah')}` : ''}</>
                : <><b>{r.valid ? (r.committed ? t('Valid — sudah di-commit') : t('Valid — siap di-commit')) : t('{0} galat', r.errorCount ?? errs.length)}</b> · {r.rows} {t('baris data')} · {r.valid ? `${r.wouldCreate} ${r.committed ? t('objek dibuat') : t('objek akan dibuat')}` : `${r.wouldCreate} ${t('objek valid')}`}</>}
              {!fresh ? <div className="tiny mt-s">{t('Berkas berubah sejak validasi — validasi ulang sebelum commit.')}</div> : null}
            </Callout>
            {warns.length ? <div className="mt-s"><Callout tone="warn" icon="⚠"><b>{t('{0} peringatan', warns.length)}</b> {t('(tidak memblokir)')}<ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{warns.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}</ul></Callout></div> : null}
            {errs.length ? <div className="tbl-wrap mt-s" style={{ maxHeight: 300, overflow: 'auto' }}><table className="tbl"><thead><tr><th>{t('Baris')}</th><th>{t('Kolom')}</th><th>{t('Pesan')}</th></tr></thead><tbody>{errs.map((e, i) => <tr key={i}><td className="num">{e.line ?? '—'}</td><td>{e.field || '—'}</td><td>{e.message}</td></tr>)}</tbody></table></div> : null}
          </>}
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- penerbit ---------------------------------------------------------------- */
export default function Publisher() {
  const ents = useLookup('entities');
  const fws = useQuery({ queryKey: ['eaw-pub-fws'], queryFn: () => api.all<api.Row>('/api/v1/eaw/objects/frameworks').catch(() => [] as api.Row[]) });
  const [scopeType, setScopeType] = React.useState<'entity' | 'framework'>('entity'); const [entityId, setEntityId] = React.useState(''); const [frameworkId, setFrameworkId] = React.useState('');
  const [format, setFormat] = React.useState<'html' | 'markdown'>('html'); const [includeDraft, setIncludeDraft] = React.useState(false); const [pv, setPv] = React.useState<api.Row | null>(null); const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (!entityId && ents.rows.length) setEntityId((ents.rows.find((e) => e.groupKind === 'holding') || ents.rows[0]).id); }, [ents.rows, entityId]);
  React.useEffect(() => { if (!frameworkId && fws.data?.[0]) setFrameworkId(fws.data[0].id); }, [fws.data, frameworkId]);
  const scopeKey = scopeType === 'framework' ? frameworkId : entityId;
  const hist = useQuery({ queryKey: ['eaw-publications', scopeKey], enabled: !!scopeKey, queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/eaw/publications', { scopeKey })).data });
  const sc = () => ({ scopeType, entityId: scopeType === 'entity' ? entityId : undefined, frameworkId: scopeType === 'framework' ? frameworkId : undefined, format });
  const upd = (fn: () => void) => { fn(); setPv(null); };
  const preview = async () => { setBusy(true); try { setPv(await api.get('/api/v1/eaw/publisher/preview', { ...sc(), includeDraft: includeDraft ? 'true' : undefined })); } catch (e) { toast(t('Gagal'), api.explain(e), 'error'); } finally { setBusy(false); } };
  const publish = () => confirmDialog({ title: t('Terbitkan dokumen resmi?'), text: t('Dokumen disusun ulang di server, berversi, dan tidak dapat diubah.'), ok: t('Terbitkan'),
    onOk: async () => { const r = await api.post('/api/v1/eaw/publications', sc()); toast(t('Dokumen v{0} terbit', r.versi), `sha256 ${String(r.sha256).slice(0, 12)}…`, 'success'); setPv(null); hist.refetch(); invalidateData(); } });
  const verify = async (id: string) => { try { const r = await api.get(`/api/v1/eaw/publications/${id}/verify`); toast(r.ok ? t('Integritas terjaga') : t('HASH TIDAK COCOK'), `${String(r.actual).slice(0, 16)}…`, r.ok ? 'success' : 'error'); } catch (e) { toast(t('Gagal'), api.explain(e), 'error'); } };
  const head = <PageHd title={t('Penerbit Dokumen Arsitektur')} sub={t('Dokumen Arsitektur untuk Keputusan Direksi dihasilkan otomatis dari data EAW — bukan ditulis manual (AF-08). Dokumen resmi memuat objek baseline, berversi, ber-sha256, dan append-only.')} />;
  const approver = can('eaw.document.approve');
  return (
    <>
      {head}
      <div className="grid g-1-2">
        <Card title={t('Konfigurasi')}>
          <div className="stack">
            <Field label={t('Cakupan')}><div className="chips">
              <label className="chip"><input type="radio" name="pbs" checked={scopeType === 'entity'} onChange={() => upd(() => setScopeType('entity'))} /> {t('Entitas (+ turunan)')}</label>
              <label className="chip"><input type="radio" name="pbs" checked={scopeType === 'framework'} onChange={() => upd(() => setScopeType('framework'))} /> {t('Kerangka Kerja')}</label></div></Field>
            {scopeType === 'entity' ? <Field label={t('Entitas')}><Select value={entityId} onChange={(e) => upd(() => setEntityId(e.target.value))}>{ents.rows.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}</Select></Field>
              : <Field label={t('Kerangka Kerja')}><Select value={frameworkId} onChange={(e) => upd(() => setFrameworkId(e.target.value))}>{fws.data?.length ? fws.data.map((f) => <option key={f.id} value={f.id}>{f.layananUtama} ({f.entityCode})</option>) : <option value="">— {t('belum ada kerangka')} —</option>}</Select></Field>}
            <Field label={t('Format')}><div className="chips">
              <label className="chip"><input type="radio" name="pbf" checked={format === 'html'} onChange={() => upd(() => setFormat('html'))} /> {t('HTML (cetak ke PDF)')}</label>
              <label className="chip"><input type="radio" name="pbf" checked={format === 'markdown'} onChange={() => upd(() => setFormat('markdown'))} /> Markdown</label></div></Field>
            <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={includeDraft} onChange={(e) => upd(() => setIncludeDraft(e.target.checked))} /> {t('Pratinjau termasuk objek non-baseline (tidak dapat diterbitkan)')}</label>
            <div className="row"><Btn disabled={busy || !scopeKey} onClick={preview}>👁 {t('Pratinjau')}</Btn>
              {approver ? <Btn variant="pri" disabled={!scopeKey} onClick={publish}>⇧ {t('Terbitkan resmi')}</Btn> : <Btn variant="pri" aria-disabled="true" style={{ opacity: 0.55 }} title={t('Butuh izin {0}', 'eaw.document.approve')} onClick={() => toast(t('403 — Akses ditolak'), t('Peran Anda tidak memiliki izin {0}.', 'eaw.document.approve'), 'error')}>🔒 {t('Terbitkan resmi')}</Btn>}</div>
            {pv ? <>
              <div className="small">{pv.canPublish ? <Badge cls="b-ok">{t('siap terbit')}</Badge> : <Badge cls="b-err">{t('belum dapat terbit')}</Badge>} {t('versi berikutnya')}: <b>v{pv.nextVersion}</b> · {pv.counts.total} {t('objek')} · {pv.counts.relations} {t('relasi')} · {pv.counts.diagrams} {t('diagram')}</div>
              {pv.blockers.length ? <div className="stack small">{pv.blockers.map((b: string, i: number) => <Callout key={i} tone={b.startsWith('Pratinjau') ? 'info' : 'err'} icon={b.startsWith('Pratinjau') ? 'ℹ' : '✕'}>{b}</Callout>)}</div> : null}
              {pv.warnings.length ? <><h3>{t('Catatan kelengkapan')} ({pv.warnings.length})</h3><ul className="small" style={{ paddingLeft: 18, maxHeight: 180, overflow: 'auto' }}>{pv.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul></> : null}</>
              : <p className="tiny muted">{t('Klik Pratinjau untuk melihat dokumen yang akan dihasilkan. Dokumen resmi hanya memuat objek berstatus Ditetapkan/Dipublikasi/Direviu dan disusun ulang di server saat terbit.')}</p>}
          </div>
        </Card>
        <div className="stack">
          <Card title={t('Pratinjau')} flush={!!pv}>
            {pv ? (pv.format === 'html' ? <iframe sandbox="" title={t('Pratinjau dokumen')} srcDoc={pv.content} style={{ width: '100%', height: '62vh', border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }} />
              : <pre className="code" style={{ maxHeight: '62vh' }}>{pv.content}</pre>) : <div className="empty"><div className="big">📄</div>{t('Belum ada pratinjau.')}</div>}
          </Card>
          <Card title={t('Riwayat terbit (append-only)')} flush={!!hist.data?.length}>
            {hist.data?.length ? <MiniTable rows={hist.data} columns={[
              { label: t('Versi'), render: (h: api.Row) => <><b>v{h.versi}</b> {h.format}</> }, { label: t('Terbit'), render: (h: api.Row) => <span className="small mono">{fmtDT(h.createdAt)}</span> }, { label: t('Objek'), num: true, render: (h: api.Row) => h.counts?.total ?? '—' },
              { label: 'SHA-256', render: (h: api.Row) => <code className="tiny">{String(h.sha256).slice(0, 12)}…</code> },
              { label: '', render: (h: api.Row) => <><Btn sm onClick={() => downloadApi(`/api/v1/eaw/publications/${h.id}/content`, `dokumen-arsitektur-v${h.versi}.${h.format === 'markdown' ? 'md' : 'html'}`)}>⇩</Btn>{h.format === 'html' ? <> <Btn sm onClick={() => downloadApi(`/api/v1/eaw/publications/${h.id}/pdf`, `dokumen-arsitektur-v${h.versi}.pdf`)}>PDF</Btn></> : null} <Btn sm onClick={() => verify(h.id)}>✓ {t('Verifikasi')}</Btn></> }]} />
              : <div className="empty small">{t('Belum ada dokumen terbit untuk cakupan ini.')}</div>}
          </Card>
        </div>
      </div>
      <div className="mt"><ImportCard /></div>
    </>
  );
}
