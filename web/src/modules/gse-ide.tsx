'use client';
/* GSE-05 — Web IDE: editor kode proyek scaffold (Monaco dari CDN, cadangan <textarea>) + commit ke feature branch. Suntingan = REVISI append-only di server
   (berkas hasil generate tidak berubah); konkurensi lewat baseRevision — 409 membawa USULAN penggabungan 3-arah (clean/conflict/deleted/unavailable) yang
   ditinjau pengguna di diff editor (kiri = terbaru di server, kanan = hasil gabungan yang dapat disunting). Tidak ada yang tersimpan otomatis. Gerbang lokal
   (pii-guard, manifest, pemindai rahasia, ukuran, conflict-markers) diperiksa SERVER saat commit; lint/build/SCA/SBOM berjalan di CI pada PR. Push pertama
   (Proyek → Push) membuat cabang + PR; commit lanjutan fast-forward ke cabang itu, tidak pernah ke main (D-02). */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { fmtDT } from '@/lib/format';
import { downloadApi } from '@/lib/download';
import { loadMonaco } from '@/lib/monaco';
import { can } from '@/store/session';
import { toast } from '@/store/ui';
import { confirmDialog, formDialog } from '@/components/overlay';
import { Badge, Btn, Callout, Card, PageHd, Select } from '@/components/ui';
import { t } from '@/lib/i18n';

const MARK = /^<<<<<<< /gm;
const marks = (s: string) => (s.match(MARK) || []).length;
interface EditorApi { getValue: () => string; nextConflict?: () => boolean }
const EDITOR_OPTS = { theme: 'vs-dark', automaticLayout: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, tabSize: 2 };

/* ---------------------------------------------------------------- editor ---------------------------------------------------------------- */
const CodeEditor = React.forwardRef<EditorApi, { value: string; language: string; readOnly: boolean; onChange: () => void; onSave: () => void }>(function CodeEditor(p, ref) {
  const host = React.useRef<HTMLDivElement>(null); const ed = React.useRef<any>(null); const ta = React.useRef<HTMLTextAreaElement>(null);
  const cb = React.useRef(p); cb.current = p;
  const [fallback, setFallback] = React.useState(false);
  React.useImperativeHandle(ref, () => ({ getValue: () => (ed.current ? ed.current.getValue() : ta.current?.value ?? p.value) }));
  React.useEffect(() => {
    let dead = false; let editor: any;
    loadMonaco().then((m) => {
      if (dead || !host.current) return;
      editor = m.editor.create(host.current, { ...EDITOR_OPTS, value: p.value, language: p.language, readOnly: p.readOnly }); ed.current = editor;
      editor.onDidChangeModelContent(() => cb.current.onChange());
      editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => cb.current.onSave());
    }).catch(() => { if (!dead) { setFallback(true); toast(t('Editor sederhana'), t('Monaco tidak dapat dimuat dari CDN — memakai editor teks biasa.'), 'info'); } });
    return () => { dead = true; ed.current = null; editor?.dispose(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return fallback
    ? <textarea ref={ta} className="textarea mono" defaultValue={p.value} readOnly={p.readOnly} style={{ width: '100%', height: '100%', border: 0, borderRadius: 0, background: '#0E1621', color: '#E6EDF3', resize: 'none' }}
        onChange={() => p.onChange()} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); p.onSave(); } }} />
    : <div ref={host} style={{ height: '100%' }} />;
});

const MergeEditor = React.forwardRef<EditorApi, { original: string; proposed: string; language: string; onChange: () => void; onSave: () => void }>(function MergeEditor(p, ref) {
  const host = React.useRef<HTMLDivElement>(null); const diff = React.useRef<any>(null); const ta = React.useRef<HTMLTextAreaElement>(null);
  const cb = React.useRef(p); cb.current = p;
  const [fallback, setFallback] = React.useState(false);
  const value = () => (diff.current ? diff.current.getModifiedEditor().getValue() : ta.current?.value ?? p.proposed);
  React.useImperativeHandle(ref, () => ({
    getValue: value,
    nextConflict: () => {
      const d = diff.current; if (!d) return false;
      const e = d.getModifiedEditor(); const model = e.getModel(); const from = e.getPosition()?.lineNumber ?? 1; const n = model.getLineCount();
      for (let i = 1; i <= n; i++) { const ln = ((from + i - 1) % n) + 1; if (/^<<<<<<< /.test(model.getLineContent(ln))) { e.revealLineInCenter(ln); e.setPosition({ lineNumber: ln, column: 1 }); e.focus(); return true; } }
      return false;
    },
  }));
  React.useEffect(() => {
    let dead = false; let d: any; let m1: any, m2: any;
    loadMonaco().then((m) => {
      if (dead || !host.current) return;
      d = m.editor.createDiffEditor(host.current, { ...EDITOR_OPTS, readOnly: false, originalEditable: false, renderSideBySide: true }); diff.current = d;
      m1 = m.editor.createModel(p.original, p.language); m2 = m.editor.createModel(p.proposed, p.language); d.setModel({ original: m1, modified: m2 });
      const mod = d.getModifiedEditor(); mod.onDidChangeModelContent(() => cb.current.onChange()); mod.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => cb.current.onSave());
      cb.current.onChange();
      if (/^<<<<<<< /m.test(p.proposed)) setTimeout(() => { const ev = (ref as React.RefObject<EditorApi>)?.current; ev?.nextConflict?.(); }, 50);
    }).catch(() => { if (!dead) setFallback(true); });
    return () => { dead = true; diff.current = null; try { d?.dispose(); m1?.dispose(); m2?.dispose(); } catch { /* abaikan */ } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return fallback
    ? <div className="grid g2" style={{ height: '100%' }}>
        <pre className="mono tiny" style={{ margin: 0, overflow: 'auto', background: '#0E1621', color: '#9FB0C3', padding: 8 }}>{p.original}</pre>
        <textarea ref={ta} className="textarea mono" defaultValue={p.proposed} onChange={() => p.onChange()} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); p.onSave(); } }}
          style={{ width: '100%', height: '100%', border: 0, borderRadius: 0, background: '#0E1621', color: '#E6EDF3', resize: 'none' }} /></div>
    : <div ref={host} style={{ height: '100%' }} />;
});

/* ---------------------------------------------------------------- halaman ---------------------------------------------------------------- */
interface Merge { status: 'clean' | 'conflict' | 'deleted' | 'unavailable'; current: number | null; mergeBase: number | null; mine: string; theirs: { revisionId: number | null; content: string | null }; proposed: string; conflicts: number; reason?: string; n: number }

export default function Ide() {
  const canRun = can('gse.project.run');
  const pq = useQuery({ queryKey: ['gse-ide-projects'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/gse/projects', { limit: 100 })).data.filter((x) => x.fileCount > 0) });
  const [sel, setSel] = React.useState<string | null>(null); const [path, setPath] = React.useState<string | null>(null);
  const wq = useQuery({ queryKey: ['gse-ws', sel], enabled: !!sel, gcTime: 0, queryFn: () => api.get<api.Row>(`/api/v1/gse/projects/${sel}/workspace`) });
  const ws = wq.data;
  const fq = useQuery({ queryKey: ['gse-wsfile', sel, path], enabled: !!sel && !!path, gcTime: 0, staleTime: 0, queryFn: () => api.get<api.Row>(`/api/v1/gse/projects/${sel}/workspace/file`, { path: path! }) });
  const cq = useQuery({ queryKey: ['gse-wscommits', sel], enabled: !!sel, gcTime: 0, queryFn: async () => (await api.get<{ data: api.Row[] }>(`/api/v1/gse/projects/${sel}/workspace/commits`)).data });
  const [dirty, setDirty] = React.useState(false); const [merge, setMerge] = React.useState<Merge | null>(null); const [busy, setBusy] = React.useState(false);
  const [mergeLeft, setMergeLeft] = React.useState(0);
  const edRef = React.useRef<EditorApi>(null); const mgRef = React.useRef<EditorApi>(null);
  const file = fq.data;

  React.useEffect(() => { const l = pq.data; if (l?.length && (!sel || !l.some((x) => x.id === sel))) { setSel(l[0].id); setPath(null); } }, [pq.data, sel]);
  React.useEffect(() => { if (ws) { const live = ws.files.filter((f: api.Row) => !f.deleted); if (!path || !live.some((f: api.Row) => f.path === path)) setPath(live.length ? live[0].path : null); } }, [ws, path]);
  React.useEffect(() => { setDirty(false); }, [file?.revisionId, path, sel]);
  React.useEffect(() => { if (!dirty && !merge) return; const h = (e: BeforeUnloadEvent) => e.preventDefault(); window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [dirty, merge]);

  const unsaved = dirty || !!merge;
  const leave = () => !unsaved || window.confirm(merge ? t('Penggabungan belum disimpan. Tinggalkan dan buang suntingan Anda?') : t('Ada perubahan yang belum disimpan pada berkas ini. Buang perubahan?'));
  const reload = async () => { setMerge(null); await Promise.all([wq.refetch(), fq.refetch(), cq.refetch()]); };
  const current = () => edRef.current?.getValue() ?? file?.content ?? '';
  const openMerge = (e: api.ApiError, mine: string, keepBase?: number | null) => {
    const m = e.body.merge;
    setMerge({ status: m.status, current: e.body.currentRevision ?? null, mergeBase: keepBase !== undefined ? keepBase : file?.revisionId ?? null, mine, theirs: m.theirs,
      proposed: m.status === 'unavailable' ? mine : m.content ?? '', conflicts: m.conflicts ?? 0, reason: m.reason, n: Date.now() });
  };

  const save = async () => {
    if (!file || busy || !ws?.editable) return;
    if (current() === file.content) return toast(t('Tidak ada perubahan'), path!, 'info');
    setBusy(true);
    try { const mine = current(); await api.put(`/api/v1/gse/projects/${sel}/workspace/file`, { path, content: mine, baseRevision: file.revisionId }, undefined).catch((e) => { throw Object.assign(e, { mine }); });
      toast(t('Tersimpan'), `${path} (${t('revisi baru')})`, 'success'); await reload(); }
    catch (e) {
      if (e instanceof api.ApiError && e.status === 409 && e.body.merge) openMerge(e, (e as any).mine ?? current());
      else if (e instanceof api.ApiError && e.status === 409) { if (window.confirm(`${api.explain(e)}\n\n${t('Muat ulang versi terbaru dari server? Suntingan Anda di berkas ini akan hilang — salin dulu bila perlu.')}`)) await reload(); }
      else toast(t('Gagal'), api.explain(e), 'error');
    } finally { setBusy(false); }
  };

  const putMerged = async (content: string, merged: boolean) => {
    const m = merge!; setBusy(true);
    try {
      await api.put(`/api/v1/gse/projects/${sel}/workspace/file`, { path, content, baseRevision: m.current, ...(merged ? { merged: true, mergeBase: m.mergeBase } : {}) });
      toast(merged ? t('Hasil gabungan tersimpan') : t('Versi Anda tersimpan'), path!, 'success'); await reload();
    } catch (e) {
      if (e instanceof api.ApiError && e.status === 409 && e.body.merge) { openMerge(e, content, m.mergeBase); toast(t('Didahului lagi'), t('Ada perubahan baru — usulan penggabungan diperbarui.'), 'info'); }
      else toast(t('Gagal'), api.explain(e), 'error');
    } finally { setBusy(false); }
  };
  const saveMerge = () => {
    if (!merge || busy || merge.status === 'deleted') return;
    const text = mgRef.current?.getValue() ?? merge.proposed; const n = marks(text);
    if (n && !window.confirm(t('Masih ada {0} konflik bertanda. Simpan apa adanya? (bisa diselesaikan nanti, tetapi commit diblokir gerbang conflict-markers sampai selesai)', n))) return;
    putMerged(text, true);
  };
  const useMine = () => merge && window.confirm(merge.status === 'deleted' ? t('Pulihkan berkas dengan versi Anda?') : t('Timpa versi terbaru dengan versi Anda? Perubahan penyunting lain pada berkas ini akan hilang dari ruang kerja (tetap ada di riwayat revisi).')) && putMerged(merge.mine, false);
  const useTheirs = () => { if (!merge || !window.confirm(t('Buang suntingan Anda dan pakai versi terbaru dari server?'))) return; const gone = merge.status === 'deleted'; if (gone) setPath(null); reload(); };

  const newFile = () => {
    if (!leave()) return;
    formDialog({ title: t('Berkas baru'), fields: [{ name: 'path', label: t('Path berkas baru (relatif, mis. src/fitur/baru.ts)'), req: true, full: true, max: 300 }],
      onSubmit: async (v) => {
        const np = String(v.path).trim(); const put = (b: number | null) => api.put(`/api/v1/gse/projects/${sel}/workspace/file`, { path: np, content: '', baseRevision: b });
        try { await put(null); }
        catch (e) {
          // path pernah dihapus: server menolak baseRevision null karena revisi terakhir path itu masih tercatat → buat ulang di atas revisi tersebut
          const m = e instanceof api.ApiError && e.status === 409 && e.body.merge;
          if (m && m.status === 'deleted') await put(e.body.currentRevision); else throw e;
        } toast(t('Berkas dibuat'), np, 'success'); await reload(); setPath(np); } });
  };
  const del = () => file && confirmDialog({ title: t('Hapus {0} dari ruang kerja?', path!), text: t('Tercatat sebagai revisi; ikut terhapus di cabang pada commit berikutnya.'), danger: true, ok: t('Hapus'),
    onOk: async () => {
      const go = (b: number | null) => api.del(`/api/v1/gse/projects/${sel}/workspace/file?path=${encodeURIComponent(path!)}&baseRevision=${b ?? ''}`);
      try { await go(file.revisionId); }
      catch (e) {
        // diubah penyunting lain sejak dibuka: tunjukkan bahwa isi TERBARU yang akan terhapus, minta konfirmasi ulang
        const m = e instanceof api.ApiError && e.status === 409 && e.body.merge;
        if (!m || m.status !== 'modified') throw e;
        const preview = String(m.theirs.content ?? '').split('\n').slice(0, 12).join('\n');
        if (!window.confirm(t('{0} sudah diubah penyunting lain (rev {1}). Awal isi terbarunya:', path!, m.theirs.revisionId) + `\n\n${preview}\n\n` + t('Tetap hapus versi terbaru ini?'))) { await reload(); return; }
        await go((e as api.ApiError).body.currentRevision);
      }
      toast(t('Berkas dihapus'), path!, 'success'); setPath(null); await reload();
    } });
  const commit = () => {
    if (!ws) return;
    if (unsaved && !window.confirm(t('Berkas yang sedang dibuka belum disimpan dan TIDAK akan ikut commit. Lanjutkan?'))) return;
    if (!ws.baseline) return toast(t('Belum di-push'), t('Push pertama dari halaman Proyek Scaffolding (membuat cabang fitur + PR dari isi ruang kerja ini).'), 'info');
    if (!ws.changes.length) return toast(t('Tidak ada perubahan'), t('Ruang kerja sama dengan commit terakhir.'), 'info');
    formDialog({ title: t('Commit ke {0}', ws.baseline.ref), sub: t('{0} perubahan', ws.changes.length), submit: t('Commit'), initial: { message: `chore(gse): ubah ${ws.changes.length} berkas lewat editor EAP` },
      fields: [{ name: 'message', label: t('Pesan commit'), type: 'textarea', req: true, full: true, max: 2000 }],
      onSubmit: async (v) => { const r = await api.post(`/api/v1/gse/projects/${sel}/workspace/commit`, { message: String(v.message).trim() }); toast(t('Commit terkirim'), `${r.files.length} ${t('berkas')} → ${r.branch} @ ${String(r.commitSha).slice(0, 8)}`, 'success'); await reload(); } });
  };

  const head = <PageHd title={t('Editor Kode Proyek (GSE-05)')} sub={t('Sunting berkas hasil scaffold, simpan sebagai revisi (berkas hasil generate tetap utuh), lalu commit ke feature branch proyek — tidak pernah ke main (D-02). Gerbang lokal wajib lulus; CI berjalan di PR.')} />;
  if (pq.isError) return <>{head}<Callout tone="err">{api.explain(pq.error)}</Callout></>;
  if (!pq.data) return <>{head}<div className="small muted">{t('Memuat…')}</div></>;
  if (!pq.data.length) return <>{head}<Card><div className="empty"><div className="big">∅</div>{t('Belum ada proyek dengan berkas.')}</div></Card></>;
  const proj = pq.data.find((x) => x.id === sel);
  const editable = !!ws?.editable;
  const gateErr = ws ? Object.values(ws.gates as Record<string, api.Row>).some((g) => g.status === 'err') : false;
  const shown = ws ? ws.files.filter((f: api.Row) => !f.deleted || f.dirty) : [];
  const m = merge;
  const mergeTag = m && ({ clean: ['b-ok', t('tergabung otomatis — tinjau')], conflict: ['b-err', t('{0} konflik perlu diselesaikan', m.conflicts)], deleted: ['b-warn', t('berkas dihapus penyunting lain')], unavailable: ['b-warn', t('tidak dapat digabung otomatis')] } as Record<string, [string, string]>)[m.status];
  const mergeNote = !m ? '' : m.status === 'deleted' ? t('Penyunting lain menghapus berkas ini setelah Anda membukanya. Pulihkan dengan versi Anda, atau terima penghapusan.')
    : m.status === 'unavailable' ? t('Penggabungan otomatis tidak dicoba ({0}). Kanan berisi versi Anda — samakan manual dengan versi terbaru di kiri.', m.reason || t('alasan tidak diketahui'))
    : t('Kiri: versi terbaru di server (baca saja). Kanan: hasil gabungan suntingan Anda dengan versi terbaru — dapat disunting. Belum ada yang tersimpan.');

  return (
    <>
      {head}
      <div className="row mb" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Select value={sel || ''} style={{ maxWidth: 360 }} onChange={(e) => { if (!leave()) return; setMerge(null); setSel(e.target.value); setPath(null); }}>{pq.data.map((x) => <option key={x.id} value={x.id}>{x.kode} · {x.branch}</option>)}</Select>
        {ws?.baseline ? <><Badge cls="b-info">{ws.baseline.kind === 'commit' ? t('commit terakhir') : t('sudah di-push')}</Badge> <span className="tiny mono">{ws.baseline.ref} @ {String(ws.baseline.commitSha).slice(0, 8)}</span></> : ws ? <Badge>{t('belum di-push')}</Badge> : null}
        {ws && !editable ? <Badge cls="b-warn">{ws.status === 'blocked' ? t('diblokir AF-06 — baca saja') : t('baca saja (butuh gse.project.run)')}</Badge> : null}
        <span style={{ marginLeft: 'auto' }} />
        {editable ? <>
          <Btn sm onClick={newFile}>+ {t('Berkas')}</Btn><Btn sm disabled={!file || !!m} onClick={del}>{t('Hapus')}</Btn>
          <Btn sm variant="pri" disabled={!file || !!m || busy} onClick={save} title="Ctrl+S">{t('Simpan')}</Btn></> : null}
        {proj ? <Btn sm onClick={() => downloadApi(`/api/v1/gse/projects/${sel}/bundle`, `${String(proj.kode).toLowerCase()}-scaffold.tar`)}>⇩ {t('Bundel')}</Btn> : null}
        {editable && ws ? <Btn sm variant={ws.changes.length && !gateErr && ws.baseline ? 'pri' : undefined} onClick={commit}>⇧ Commit ({ws.changes.length})</Btn> : null}
      </div>
      <div className="ide">
        <div className="ft">{shown.map((x: api.Row) => (
          <div key={x.path} className={x.path === path ? 'on' : ''} style={x.deleted ? { opacity: 0.55, textDecoration: 'line-through' } : undefined} title={`${x.path}${x.origin === 'ai' ? ` — ${t('dihasilkan AI, wajib reviu')}` : ''}`}
            onClick={x.deleted ? undefined : () => { if (x.path === path || !leave()) return; setMerge(null); setPath(x.path); }}>
            {x.dirty ? <span style={{ color: 'var(--warn)' }}>● </span> : null}{x.path.split('/').pop()}{x.origin === 'ai' ? <span className="tiny" style={{ color: 'var(--info)' }}> AI</span> : null}{x.source === 'edit' && !x.deleted ? <span className="tiny faint"> ✎</span> : null}
            <div className="tiny faint">{x.path.split('/').slice(0, -1).join('/')}</div>
          </div>))}</div>
        <div className="ed">
          <div className="etabs"><div className="etab on">{m ? '⇄ ' : ''}{path ? path.split('/').pop() : '—'}</div></div>
          {m ? <div className="row" style={{ flexWrap: 'wrap', gap: 6, padding: '8px 10px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
            <span className={`badge ${mergeTag![0]}`}>{mergeTag![1]}</span><span className="tiny muted" style={{ flex: 1, minWidth: 240 }}>{mergeNote}</span>
            {m.status === 'deleted' ? <><Btn sm variant="pri" onClick={useMine}>{t('Pulihkan dengan versi saya')}</Btn><Btn sm onClick={useTheirs}>{t('Terima penghapusan')}</Btn></>
              : <><Btn sm variant="pri" disabled={busy} onClick={saveMerge} title="Ctrl+S">{t('Simpan hasil gabungan')}</Btn>
                {m.status === 'conflict' ? <Btn sm onClick={() => { if (!mgRef.current?.nextConflict?.()) toast(t('Tidak ada konflik tersisa'), t('Semua penanda konflik sudah diselesaikan.'), 'success'); }}>{t('Konflik berikutnya')} ↓</Btn> : null}
                  <Btn sm onClick={useMine} title={t('Menimpa perubahan penyunting lain')}>{t('Pakai versi saya')}</Btn><Btn sm onClick={useTheirs} title={t('Membuang suntingan Anda')}>{t('Pakai versi terbaru')}</Btn></>}
          </div> : null}
          {m && m.status !== 'deleted' ? <div className="row tiny muted" style={{ padding: '4px 10px' }}><span style={{ flex: 1 }}>{t('Terbaru di server')} · rev {String(m.theirs.revisionId ?? t('asli'))}</span>
            <span style={{ flex: 1 }}>{t('Hasil gabungan · dapat disunting')} · {mergeLeft ? <span style={{ color: 'var(--err)' }}>{t('{0} konflik tersisa', mergeLeft)}</span> : <span style={{ color: 'var(--ok)' }}>{t('tanpa penanda konflik')}</span>}</span></div> : null}
          <div style={{ flex: 1, minHeight: 0 }}>
            {m ? (m.status === 'deleted' ? <div className="empty small" style={{ color: '#8A9AAD' }}>{t('Berkas tidak ada lagi di ruang kerja.')}</div>
              : <MergeEditor key={m.n} ref={mgRef} original={m.theirs.content ?? ''} proposed={m.proposed} language={file?.language || 'plaintext'} onSave={saveMerge} onChange={() => setMergeLeft(marks(mgRef.current?.getValue() ?? m.proposed))} />)
              : file ? <CodeEditor key={`${sel}:${path}:${file.revisionId}`} ref={edRef} value={file.content} language={file.language} readOnly={!editable} onSave={save} onChange={() => setDirty((edRef.current?.getValue() ?? '') !== file.content)} />
              : <div className="empty small" style={{ color: '#8A9AAD' }}>{fq.isLoading ? t('Memuat…') : t('Tidak ada berkas.')}</div>}
          </div>
          <div className="status"><span>{file?.language || ''}</span><span>UTF-8</span><span>{editable ? t('dapat disunting') : t('baca saja')}</span>
            <span>{m ? <span style={{ color: 'var(--warn)' }}>● {t('penggabungan belum disimpan')}</span> : dirty ? <span style={{ color: 'var(--warn)' }}>● {t('belum disimpan')}</span> : ''}</span>
            <span style={{ marginLeft: 'auto' }}>{file ? `${file.bytes} B · ${file.revisionId ? `rev ${file.revisionId}` : t('asli')}` : ''}</span></div>
        </div>
      </div>
      <div className="grid g2 mt">
        <Card title={t('Gerbang lokal ruang kerja')}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{ws ? Object.entries(ws.gates as Record<string, api.Row>).map(([k, g]) => <span key={k} className={`badge ${g.status === 'ok' ? 'b-ok' : g.status === 'err' ? 'b-err' : ''}`} title={g.detail}>{k}: {g.status}</span>) : null}</div>
          <div className="tiny muted mt-s">{t('lint/build/SCA/SBOM dijalankan pipeline CI pada PR (bukan di EAP). Kode — terutama berkas AI — wajib direviu manusia sebelum merge.')}</div>
        </Card>
        <Card title={`${t('Perubahan belum di-commit')} (${ws?.changes.length ?? 0})`}>
          {ws?.changes.length ? <div className="stack small">{ws.changes.map((c: api.Row) => <div key={c.path} className="row"><span className={`badge ${c.action === 'delete' ? 'b-err' : c.action === 'create' ? 'b-ok' : 'b-info'}`}>{c.action}</span><code className="tiny">{c.path}</code></div>)}</div>
            : <span className="small muted">{t('Ruang kerja sama dengan commit terakhir.')}</span>}
        </Card>
      </div>
      {cq.data?.length ? <div className="mt"><Card title={t('Riwayat commit')} flush><table className="tbl"><thead><tr><th>{t('Waktu')}</th><th>{t('Jenis')}</th><th>{t('Cabang')}</th><th>Commit</th><th>{t('Pesan')}</th><th>{t('Berkas')}</th></tr></thead><tbody>
        {cq.data.map((c) => <tr key={c.id}><td className="tiny">{fmtDT(c.createdAt)}</td><td>{c.kind}</td><td><code className="tiny">{c.branch}</code></td><td><code className="tiny">{String(c.commitSha).slice(0, 8)}</code></td><td className="small">{c.message}</td><td className="num">{(c.files || []).length}</td></tr>)}</tbody></table></Card></div> : null}
    </>
  );
}
