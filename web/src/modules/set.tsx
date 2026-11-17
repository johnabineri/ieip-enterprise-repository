'use client';
/* SET — Settings & RBAC: struktur organisasi (view atas replika CMP; atribut KAF/IKA/KRA bawaan dapat diubah oleh eaw.org.write holding-wide), akun beserta
   penugasan peran (beri/cabut peran, aktif/nonaktif — set.account.admin; DB menjaga admin-only), katalog peran, laporan API Client & Secrets (baca-saja) dan jejak audit
   append-only. Aturan SEBENARNYA di server/DB; galat tampil di modal. Tampilan = mockup (kartu, .tbl, .tag). */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { fmtDT, fmtNum } from '@/lib/format';
import { invalidateData, lookup } from '@/lib/query';
import { can } from '@/store/session';
import { toast } from '@/store/ui';
import { GridPage } from '@/components/grid/grid-page';
import { col } from '@/components/grid/cols';
import { Drawer, confirmDialog, formDialog, openDrawer } from '@/components/overlay';
import { Badge, Btn, Callout, Card, DL, Field, Kpi, MiniTable, PageHd, Section, Select, Tag } from '@/components/ui';
import { t } from '@/lib/i18n';

const activeCol = col.badge('isActive', t('Status'), { label: (r) => (r.isActive ? 'active' : 'inactive') });

/* ---------------------------------------------------------------- 5.1 organisasi ---------------------------------------------------------------- */
async function editOrg(row: api.Row) {
  const refs = await api.all('/api/v1/eaw/references').catch(() => [] as api.Row[]);
  formDialog({
    title: `${t('Atribut arsitektur')} · ${row.code}`, sub: `PUT /api/v1/eaw/entity-org/${String(row.id).slice(0, 8)}…/metadata`, submit: t('Simpan'),
    initial: { kafLevel: row.kafLevel ?? '', ikaLevel: row.ikaLevel == null ? '' : String(row.ikaLevel), referenceId: row.referenceId ?? '', notes: row.notes ?? '' },
    intro: <div className="mb"><Callout tone="gold">{t('Nama dan hierarki dikelola di SEDDI CMP (SSOT). Di sini hanya atribut milik EAP: tingkat KAF, IKA manual, dan KRA bawaan. Butuh eaw.org.write holding-wide.')}</Callout></div>,
    fields: [{ name: 'kafLevel', label: t('Tingkat KAF'), type: 'select', options: [['', '—'], ...['holding', 'ecosystem', 'sbu', 'unit'].map((x) => [x, x] as [string, string])] },
      { name: 'ikaLevel', label: t('Level IKA (manual)'), type: 'select', options: [['', '—'], ...[1, 2, 3, 4, 5].map((x) => [String(x), `L${x}`] as [string, string])] },
      { name: 'referenceId', label: t('KRA bawaan'), type: 'select', full: true, options: [['', `— ${t('tanpa KRA')} —`], ...refs.map((r) => [r.id, `${r.kode} · ${r.nama} (${r.status})`] as [string, string])] },
      { name: 'notes', label: t('Catatan'), type: 'textarea', full: true }],
    onSubmit: async (v) => {
      await api.put(`/api/v1/eaw/entity-org/${row.id}/metadata`, { kafLevel: v.kafLevel, ikaLevel: v.ikaLevel ? Number(v.ikaLevel) : undefined, referenceId: v.referenceId, notes: v.notes === undefined ? (row.notes ? '' : undefined) : v.notes });   // kosong → '' hanya bila sebelumnya terisi (COALESCE di server mengabaikan null)
      invalidateData(true); toast(t('Atribut entitas disimpan'), row.code, 'success');
    },
  });
}
function Org() {
  return <GridPage title={t('Struktur Organisasi')} description={t('Hierarki entitas dari CMP (replika baca-saja); di EAP hanya atribut KAF/IKA dan KRA bawaan yang dimiliki.')}
    path="/api/v1/eaw/entity-org" all exportName="entitas" rowId={(r) => r.id}
    edit={{ perm: 'eaw.org.write', label: t('Atribut arsitektur'), run: (r) => editOrg(r) }}
    detail={(r) => [[t('Kode'), r.code], [t('Nama'), r.name], [t('Jenis'), r.groupKind], ['KAF', r.kafLevel ?? '—'], [t('KAF terkonfirmasi'), r.kafLevelConfirmed ? t('ya') : t('belum')], ['IKA', r.ikaLevel == null ? '—' : `L${r.ikaLevel}`], [t('Catatan'), r.notes || '—']]}
    columns={[col.mono('code', t('Kode')), col.strong('name', t('Nama')), col.tag('groupKind', t('Jenis')), col.num('kafLevel', 'KAF', 0, { maxWidth: 90 }), col.num('ikaLevel', 'IKA', 0, { maxWidth: 90 }),
      col.bool('kafLevelConfirmed', t('KAF terkonfirmasi')), activeCol]} />;
}

/* ---------------------------------------------------------------- 5.2 akun ---------------------------------------------------------------- */
/** Nama yang aman ditampilkan: username CMP, atau penanda akun yang belum tertaut (subjek IdP terpotong). */
const accountName = (u: api.Row): string => u.username ?? (u.subject ? `${t('(belum tertaut ke CMP)')} ${u.subject}…` : t('Akun'));

/** POLA YANG DISARANKAN: pra-tugaskan akun dengan memilih orang dari direktori CMP — tertaut sejak awal, peran dapat diberikan sebelum login. */
async function addFromDirectory() {
  let dir: api.Row[] = [];
  try { dir = (await api.get<{ data: api.Row[] }>('/api/v1/set/directory', { limit: 200 })).data; } catch (e) { return toast(t('Gagal'), api.explain(e), 'error'); }
  if (!dir.length) return toast(t('Tidak ada pengguna CMP yang dapat ditambahkan'), t('Semua pengguna CMP aktif sudah punya akun EAP.'), 'info');
  formDialog({
    title: t('Tambah akun dari CMP'), sub: 'POST /api/v1/set/users', submit: t('Tambah akun'),
    intro: <div className="mb"><Callout tone="info">{t('Pilih orang dari direktori CMP. Akun langsung tertaut ke identitasnya dan peran dapat diberikan sebelum ia login; saat login pertama akun ini diambil alih otomatis. Akun baru tidak punya peran.')}</Callout></div>,
    fields: [{ name: 'cmpUserId', label: t('Pengguna CMP'), type: 'select', req: true, full: true, options: [['', `— ${t('pilih')} —`], ...dir.map((d) => [d.id, `${d.username} · ${d.displayName ?? ''}`] as [string, string])] }],
    onSubmit: async (v) => {
      const r = await api.post<api.Row>('/api/v1/set/users', { cmpUserId: v.cmpUserId });
      invalidateData(); toast(t('Akun ditambahkan'), `${r.username} — ${t('menunggu login pertama')}`, 'success');
      openDrawer((close) => <UserDrawer id={r.id} close={close} />);
    },
  });
}

function UserDrawer({ id, close }: { id: string; close: () => void }) {
  const q = useQuery({ queryKey: ['set-users-all'], queryFn: () => api.all<api.Row>('/api/v1/set/users') });
  const roles = useQuery({ queryKey: ['set-roles'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/set/roles')).data });
  const u = q.data?.find((x) => x.id === id); const admin = can('set.account.admin');
  const who = u ? accountName(u) : '';
  const [role, setRole] = React.useState(''); const [scope, setScope] = React.useState(''); const [until, setUntil] = React.useState('');
  const [ents, setEnts] = React.useState<api.Row[]>([]); const [err, setErr] = React.useState<string | null>(null); const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { lookup('entities').then((m) => setEnts(m.rows)); }, []);
  if (!u) return <Drawer title={t('Akun')} close={close}><div className="small muted">{q.isError ? api.explain(q.error) : t('Memuat…')}</div></Drawer>;
  const refresh = () => { q.refetch(); invalidateData(); };
  const assign = async () => {
    setErr(null); if (!role) return setErr(t('Pilih peran.'));
    setBusy(true);
    try { await api.post('/api/v1/set/user-roles', { userId: id, roleCode: role, entityScope: scope || undefined, validUntil: until ? new Date(`${until}T23:59:59`).toISOString() : undefined });
      toast(t('Peran ditugaskan'), `${who} ← ${role}`, 'success'); setRole(''); setScope(''); setUntil(''); refresh(); }
    catch (e) { setErr(api.explain(e)); } finally { setBusy(false); }
  };
  const revoke = (a: api.Row) => confirmDialog({ title: t('Cabut peran {0}?', a.roleCode), text: who, danger: true, ok: t('Cabut'), onOk: async () => { await api.del(`/api/v1/set/user-roles/${a.id}`); refresh(); toast(t('Peran dicabut'), a.roleCode, 'success'); } });
  const setActive = (on: boolean) => confirmDialog({ title: on ? t('Aktifkan akun ini?') : t('Nonaktifkan akun ini?'), text: who, danger: !on, ok: on ? t('Aktifkan') : t('Nonaktifkan'),
    onOk: async () => { await api.patch(`/api/v1/set/users/${id}`, { isActive: on }); refresh(); toast(t('Akun diperbarui'), `${who} → ${on ? 'active' : 'inactive'}`, 'success'); } });
  return (
    <Drawer title={u.displayName || u.username || t('Akun belum tertaut ke CMP')} sub={u.username || u.subject} wide close={close} footer={admin ? <Btn variant={u.isActive ? 'danger' : 'pri'} onClick={() => setActive(!u.isActive)}>{u.isActive ? t('Nonaktifkan akun') : t('Aktifkan akun')}</Btn> : undefined}>
      {!u.linked ? <div className="mb"><Callout tone="warn">{t('Akun ini belum tertaut ke identitas CMP (mis. dibuat dari data demo sebelum pengguna login). Nama dan username baru muncul setelah pengguna login pertama dengan username yang cocok. Selama belum tertaut, pencabutan otomatis dari sinkron mutasi pegawai CMP tidak dapat berlaku. Untuk akun baru, gunakan + Tambah dari CMP.')}</Callout></div>
        : u.pending ? <div className="mb"><Callout tone="info">{t('Menunggu login pertama: identitas CMP sudah tertaut dan peran berlaku sejak sekarang. Saat orangnya login, akun ini diambil alih otomatis (akun dan peran yang sama).')}</Callout></div> : null}
      <DL pairs={[[t('Nama pengguna'), u.username ?? '—'], [t('Nama'), u.displayName ?? '—'], [t('Status'), <Badge key="s" value={u.isActive ? 'active' : 'inactive'} />], [t('Login terakhir'), u.lastLoginAt ? fmtDT(u.lastLoginAt) : t('belum pernah login')],
        ...(u.subject ? [[t('Subjek IdP'), <span key="sj" className="mono tiny">{u.subject}…</span>] as const] : [])]} />
      <Section title={`${t('Penugasan peran')} (${u.assignments.length})`}>
        <MiniTable rows={u.assignments} empty={t('Belum ada peran.')} columns={[
          { label: t('Peran'), render: (a: api.Row) => <Tag>{a.roleCode}</Tag> }, { label: t('Lingkup'), render: (a: api.Row) => a.entityScope || t('semua entitas') },
          { label: t('Berlaku sampai'), render: (a: api.Row) => (a.validUntil ? fmtDT(a.validUntil) : '—') },
          { label: '', render: (a: api.Row) => (admin ? <Btn sm variant="danger" onClick={() => revoke(a)}>{t('Cabut')}</Btn> : null) }]} />
      </Section>
      {admin ? <Section title={t('Tugaskan peran')}>
        <div className="form-grid">
          <Field label={t('Peran')} req><Select value={role} onChange={(e) => setRole(e.target.value)}><option value="">— {t('pilih peran')} —</option>{(roles.data || []).filter((r) => r.isActive).map((r) => <option key={r.id} value={r.roleCode}>{r.roleCode} · {r.roleName}</option>)}</Select></Field>
          <Field label={t('Lingkup entitas')} hint={t('kosong = holding-wide (semua entitas)')}><Select value={scope} onChange={(e) => setScope(e.target.value)}><option value="">{t('semua entitas')}</option>{ents.map((e) => <option key={e.id} value={e.code}>{e.code} · {e.name}</option>)}</Select></Field>
          <Field label={t('Berlaku sampai (opsional)')}><input className="input" type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
          <div className="field" style={{ alignSelf: 'end' }}><Btn variant="pri" disabled={busy} onClick={assign}>{busy ? '…' : t('Tugaskan')}</Btn></div>
        </div>
        {err ? <div className="mt"><Callout tone="err">{err}</Callout></div> : null}
        <p className="tiny muted mt-s">{t('Peran diberikan eksplisit — akun baru tidak punya peran. Pencabutan = hapus lunak; jejak tetap di Audit Trail.')}</p>
      </Section> : null}
    </Drawer>
  );
}

function RbacSync() {
  const q = useQuery({ queryKey: ['set-rbac-sync'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/set/rbac-sync', { limit: 8 }).catch(() => null))?.data ?? null });
  if (!q.data) return null;
  return (
    <div className="mb"><Card title={t('Sinkron mutasi pegawai CMP → RBAC (terbaru)')} flush={!!q.data.length} meta={t('pencabutan otomatis tidak diikuti pemberian otomatis — tugaskan ulang bila perlu')}>
      {q.data.length ? <MiniTable rows={q.data} columns={[{ label: t('Diterima'), render: (e: api.Row) => <span className="mono tiny">{fmtDT(e.receivedAt)}</span> }, { label: t('Peristiwa'), render: (e: api.Row) => <span className="tiny">{e.eventType}</span> },
        { label: t('Aksi'), render: (e: api.Row) => <Tag>{e.action}</Tag> }, { label: t('Akun terdampak'), num: true, render: (e: api.Row) => e.usersAffected }, { label: t('Peran dicabut'), num: true, render: (e: api.Row) => e.rolesRevoked },
        { label: t('Rincian'), render: (e: api.Row) => <span className="small">{(e.revoked || []).map((r: api.Row) => `${r.username ?? r.userId?.slice(0, 8)}: ${r.roleCode}`).join(', ') || e.reason || '—'}</span> }]} />
        : <div className="empty small">{t('Belum ada sinkron.')}</div>}
    </Card></div>
  );
}

function Users() {
  return <GridPage title={t('Akun Pengguna')} description={t('Akun EAP. Disarankan: tambahkan orang dari direktori CMP sebelum login pertama (+ Tambah dari CMP) supaya akun tertaut sejak awal; akun juga terbentuk otomatis saat login pertama (tanpa peran).')}
    path="/api/v1/set/users" exportName="akun" notice={<RbacSync />}
    create={{ label: `+ ${t('Tambah dari CMP')}`, perm: 'set.account.admin', run: () => addFromDirectory() }}
    onDetail={(r) => openDrawer((close) => <UserDrawer id={r.id} close={close} />)}
    columns={[col.calc(t('Nama pengguna'), (r) => accountName(r), { cellClass: 'mono', maxWidth: 260 }), col.calc(t('Nama'), (r) => r.displayName ?? '—', { cellStyle: { fontWeight: 600 } }),
      col.calc(t('Peran'), (r) => (r.assignments || []).map((a: api.Row) => a.roleCode).join(', '), { minWidth: 260 }), activeCol,
      col.calc(t('Login terakhir'), (r) => (r.lastLoginAt ? fmtDT(r.lastLoginAt) : r.pending ? t('menunggu login pertama') : t('belum pernah login')), { maxWidth: 210 })]}
    titleOf={(r) => r.displayName || accountName(r)} />;
}

/* ---------------------------------------------------------------- 5.3 peran ---------------------------------------------------------------- */
function Roles() {
  return <GridPage title={t('Roles & Permissions')} description={t('Katalog peran resmi beserta izin (kode <workspace>.<modul>.<aksi>).')}
    path="/api/v1/set/roles" all exportName="peran"
    columns={[col.mono('roleCode', t('Kode')), col.strong('roleName', t('Nama')), col.num('tier', 'Tier', 0, { maxWidth: 90 }), col.tag('editScope', t('Cakupan ubah')),
      col.bool('canViewAll', t('Lihat semua')), col.calc(t('Izin'), (r) => (r.permissions || []).length, { maxWidth: 100, type: 'rightAligned', cellClass: 'num' })]}
    titleOf={(r) => r.roleName}
    detail={(r) => [[t('Kode'), r.roleCode], [t('Nama'), r.roleName], [t('Deskripsi'), r.description], [t('Cakupan ubah'), r.editScope], [t('Lihat semua'), r.canViewAll ? t('ya') : t('tidak')]]}
    DetailExtra={({ row }) => (
      <Section title={`${t('Izin')} (${(row.permissions || []).length})`}>
        <div className="chips">{(row.permissions || []).map((p: string) => <Tag key={p}>{p}</Tag>)}</div>
      </Section>
    )} />;
}

/* ---------------------------------------------------------------- 5.4 API client & secrets ---------------------------------------------------------------- */
const Yes = ({ ok, y = t('ya'), n = t('tidak') }: { ok: boolean; y?: string; n?: string }) => <Badge cls={ok ? 'b-ok' : ''}>{ok ? y : n}</Badge>;
const Code = ({ v }: { v?: unknown }) => (v ? <code className="tiny">{String(v)}</code> : <span className="small muted">—</span>);
function Integrations() {
  const q = useQuery({ queryKey: ['set-integrations'], queryFn: () => api.get<api.Row>('/api/v1/set/integrations') });
  const head = <PageHd title={t('API Client, Secrets & Service Tokens')} sub={t('Konfigurasi nyata yang dipakai API EAP: verifikasi token, konektor eksternal, keberadaan rahasia (nilai tidak pernah ditampilkan), dan identitas layanan ke database. Halaman ini baca-saja — pengubahan lewat konfigurasi/infrastruktur.')} />;
  if (q.isError) return <>{head}{(q.error as api.ApiError).status === 403 ? <Card><div className="empty"><div className="big">🔒</div>{t('Memerlukan izin set.account.read (Auditor/SysAdmin).')}</div></Card> : <Callout tone="err">{api.explain(q.error)}</Callout>}</>;
  const r = q.data; if (!r) return <>{head}<div className="small muted">{t('Memuat…')}</div></>;
  const a = r.auth; const spa = (typeof window !== 'undefined' && (window as any).EAP_CONFIG?.oidcClientId) || 'eap-spa';
  const clients = [{ clientId: spa, kind: t('publik (SPA)'), flow: 'Authorization Code + PKCE S256', source: t('konfigurasi UI') }, ...r.clients.map((c: api.Row) => ({ clientId: c.clientId, kind: t('resource server (bearer-only)'), flow: t('menerima token dengan aud ini'), source: c.source }))];
  const detail = (c: api.Row) => Object.entries(c.detail || {}).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length)).map(([k, v]) => <span key={k}><span className="tiny muted">{k}</span> {typeof v === 'boolean' ? <Yes ok={v} /> : <Code v={Array.isArray(v) ? v.join(', ') : String(v)} />} &nbsp; </span>);
  return (
    <>
      {head}
      <div className="grid g4 mb"><Kpi label={t('Verifikasi token')} value={a.mode === 'jwks' ? 'JWKS' : 'HS256 dev'} tgt={a.algorithms.join(' / ')} /><Kpi label={t('Kunci JWKS')} value={a.jwks.reachable ? a.jwks.keys.length : '—'} tgt={a.jwks.reachable ? `${t('terjangkau')} · ${a.jwks.ms} ms` : a.jwks.error} />
        <Kpi label={t('Konektor terkonfigurasi')} value={`${r.connectors.filter((c: api.Row) => c.configured).length}/${r.connectors.length}`} /><Kpi label={t('Rahasia terisi')} value={`${r.secrets.items.filter((s: api.Row) => s.set).length}/${r.secrets.items.length}`} tgt={r.secrets.vault ? 'Vault' : 'env'} /></div>
      <div className="grid g2">
        <Card title={t('Verifikasi token (D-13)')}><DL pairs={[['Mode', a.mode === 'jwks' ? <Badge key="m" cls="b-ok">JWKS (RS256/ES256)</Badge> : <Badge key="m" cls="b-warn">{t('HS256 — hanya dev/uji')}</Badge>], ['Issuer', <Code key="i" v={a.issuer} />], [t('Audiens'), <Code key="a" v={a.audience} />], ['JWKS', <Code key="j" v={a.jwksUri} />],
          [t('Klaim wajib'), a.requiredClaims.map((c: string) => <Tag key={c}>{c}</Tag>)], [t('Masa berlaku maks.'), `${a.maxTokenLifetimeSeconds / 60} ${t('menit')}`], [t('Lingkungan'), r.production ? <Badge key="p" cls="b-info">{t('produksi')}</Badge> : <Badge key="p">{t('non-produksi')}</Badge>]]} /></Card>
        <Card title={t('Kunci publik JWKS')} flush={!!a.jwks.keys.length} meta={t('rotasi kunci dikelola Keycloak; API mengambil ulang JWKS otomatis')}>
          {a.jwks.keys.length ? <MiniTable rows={a.jwks.keys} columns={[{ label: 'kid', render: (k: api.Row) => <span className="mono tiny" title={k.kid || ''}>{k.kid ? (k.kid.length > 14 ? `${k.kid.slice(0, 12)}…` : k.kid) : '—'}</span> }, { label: 'kty', render: (k: api.Row) => k.kty || '—' }, { label: 'alg', render: (k: api.Row) => k.alg || '—' }, { label: 'use', render: (k: api.Row) => k.use || '—' }]} />
            : <div className="empty small">{a.jwks.error || t('Tidak ada kunci')}</div>}</Card>
      </div>
      <div className="mt"><Card title={t('Klien OIDC')} flush meta={t('API tidak memegang kredensial admin Keycloak — daftar lengkap klien ada di konsol Keycloak')}>
        <MiniTable rows={clients} columns={[{ label: 'client_id', render: (c) => <b className="mono">{c.clientId}</b> }, { label: t('Jenis'), render: (c) => c.kind }, { label: t('Alur'), render: (c) => c.flow }, { label: t('Sumber'), render: (c) => <span className="small muted">{c.source}</span> }]} /></Card></div>
      <div className="mt"><Card title={t('Konektor eksternal')} flush meta={`${t('dibaca dari layanan')} ${r.service} · ${t('konfigurasi dibagikan ke semua layanan EAP')}`}>
        <MiniTable rows={r.connectors} columns={[{ label: t('Konektor'), render: (c: api.Row) => <b className="small">{c.name}</b> }, { label: t('Status'), render: (c: api.Row) => <Yes ok={c.configured} y={t('terkonfigurasi')} n={t('nonaktif')} /> }, { label: t('Detail'), render: detail }]} /></Card></div>
      <div className="grid g2 mt">
        <Card title={t('Rahasia')} flush meta={`${t('sumber')}: ${r.secrets.vault ? 'Vault' : t('env (Compose .env / Secret K8s) — Vault belum diintegrasikan')}`}>
          <MiniTable rows={r.secrets.items} columns={[{ label: t('Variabel'), render: (s: api.Row) => <><code>{s.name}</code>{s.note ? <div className="tiny muted">{s.note}</div> : null}</> }, { label: t('Terisi'), render: (s: api.Row) => <Yes ok={s.set} /> }, { label: t('Dipakai oleh'), render: (s: api.Row) => <span className="small">{s.consumer}</span> }]} /></Card>
        <Card title={t('Identitas layanan ke database')} flush>
          <div className="small" style={{ padding: '10px 14px 4px' }}>{r.workloadIdentity.model}.{r.workloadIdentity.spiffe ? '' : <span className="muted"> {t('SPIFFE/SPIRE belum ada.')}</span>}</div>
          <MiniTable rows={r.workloadIdentity.logins} columns={[{ label: 'Login', render: (l: api.Row) => <><span className="mono">{l.login}</span>{l.login === r.workloadIdentity.session ? <> <Badge cls="b-info">{t('sesi ini')}</Badge></> : null}</> }, { label: t('Anggota'), render: (l: api.Row) => l.memberOf.map((m: string) => <Tag key={m}>{m}</Tag>) }, { label: t('Batas koneksi'), num: true, render: (l: api.Row) => (l.connectionLimit < 0 ? '∞' : fmtNum(l.connectionLimit)) }]} /></Card>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- 5.5 audit ---------------------------------------------------------------- */
function Audit() {
  return <GridPage title={t('Audit Trail')} description={t('Jejak perubahan append-only (shared.audit_logs). Hanya pemegang set.audit.read.')}
    path="/api/v1/audit/logs" exportName="audit" rowId={(r) => String(r.id)}
    columns={[col.dateTime('changed_at', t('Waktu')), col.tag('action', t('Aksi'), { maxWidth: 110 }), col.calc(t('Tabel'), (r) => `${r.table_schema}.${r.table_name}`, { minWidth: 200 }), col.mono('record_id', t('Rekaman')), col.mono('changed_by', t('Pengubah'))]}
    filters={[{ name: 'action', label: t('Semua aksi'), options: ['insert', 'update', 'delete'] }]}
    titleOf={(r) => `${r.table_schema}.${r.table_name}`}
    detail={(r) => [[t('Waktu'), r.changed_at], [t('Aksi'), r.action], [t('Tabel'), `${r.table_schema}.${r.table_name}`], [t('Rekaman'), r.record_id], [t('Pengubah'), r.changed_by],
      [t('Nilai lama'), r.old_values ? <pre key="o" className="code">{JSON.stringify(r.old_values, null, 2)}</pre> : null],
      [t('Nilai baru'), r.new_values ? <pre key="n" className="code">{JSON.stringify(r.new_values, null, 2)}</pre> : null]]} />;
}

export default { org: Org, users: Users, roles: Roles, api: Integrations, audit: Audit };
