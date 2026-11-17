'use client';
/* SET › Roles & Permissions — tab "Matriks Izin" dan "RACI" (mockup pages-ops.js `set/roles`, versi live): peran dan izin terlihat dalam SATU layar.
   Data NYATA dari GET /api/v1/set/roles (peran + kode izin) dan /set/permissions (katalog izin). Hanya baca — katalog peran/izin dikelola lewat seed
   (scripts/gen_seed_set.py), bukan form. RACI TURUNAN dari izin: A = memegang izin gerbang persetujuan fitur, R = izin tulis/jalankan/admin
   (R* bila peran berlingkup entitas), I = hanya baca. "Consulted" (C) pada RACI PRD §13.2 adalah peran proses, bukan izin sistem, sehingga tidak dapat
   diturunkan dan tidak ditampilkan. Menambah izin ke katalog → tambahkan ke RACI_FEATURES (uji: tiap izin katalog muncul di minimal satu baris). */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { useSession } from '@/store/session';
import { Callout, Card } from '@/components/ui';
import { t } from '@/lib/i18n';
import { cx } from '@/lib/utils';

export function useRoleCatalog() {
  const roles = useQuery({ queryKey: ['set-roles'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/set/roles')).data });
  const perms = useQuery({ queryKey: ['set-perms'], queryFn: async () => (await api.get<{ data: api.Row[] }>('/api/v1/set/permissions')).data, retry: false });
  return { roles, perms };
}

/** Fitur → izin gerbang persetujuan (A), izin tulis/jalankan/admin (R), izin baca (I). */
type Feature = { A?: string[]; R?: string[]; I?: string[] };
export const RACI_FEATURES: [string, Feature][] = [
  [t('Objek arsitektur 6 domain (D1–D6)'), { A: ['eaw.baseline.approve'], R: ['eaw.model.write', 'eaw.validation.approve'], I: ['eaw.model.read'] }],
  [t('Katalog aplikasi, platform & workspace (D4)'), { A: ['eaw.baseline.approve'], R: ['eaw.catalog.write', 'eaw.platform.write', 'eaw.workspace.assign', 'eaw.validation.approve'], I: ['eaw.catalog.read'] }],
  [t('KRA Manager (referensi arsitektur)'), { A: ['eaw.baseline.approve'], R: ['eaw.reference.write'], I: ['eaw.reference.read'] }],
  [t('Framework Builder (kerangka kerja)'), { A: ['eaw.baseline.approve'], R: ['eaw.model.write', 'eaw.validation.approve'], I: ['eaw.model.read'] }],
  [t('Kanvas ArchiMate'), { R: ['eaw.model.write'], I: ['eaw.model.read'] }],
  [t('Lineage & Impact'), { I: ['eaw.model.read'] }],
  [t('Dashboard Arsitektur & Repository'), { I: ['eaw.catalog.read'] }],
  [t('Tiket & putusan ARB'), { A: ['gov.arb.approve'], R: ['gov.arb.write'], I: ['gov.arb.read'] }],
  [t('ADR'), { R: ['eaw.adr.write'], I: ['eaw.adr.read'] }],
  [t('Reviu objek (Direviu → Draf)'), { R: ['eaw.review.run'], I: ['eaw.workflow.read'] }],
  [t('Penerbitan dokumen arsitektur'), { A: ['eaw.document.approve'], R: ['eaw.publication.approve'], I: ['eaw.model.read'] }],
  [t('Master IT Roadmap'), { R: ['eaw.roadmap.write'], I: ['eaw.catalog.read'] }],
  [t('Struktur organisasi, KAF & IKA'), { R: ['eaw.org.write'], I: ['eaw.org.read'] }],
  [t('Scaffolding proyek (GSE)'), { R: ['gse.project.run'], I: ['gse.project.read'] }],
  [t('Elisitasi kebutuhan (REQ)'), { R: ['req.session.write'] }],
  [t('AI register, guardrail & kill-switch'), { R: ['console.ai.admin', 'console.security.admin'], I: ['console.dashboard.read'] }],
  [t('Snapshot IKA (tren)'), { R: ['console.dashboard.write'], I: ['console.dashboard.read'] }],
  [t('Konektor, model kanonikal & rute EIO'), { R: ['console.eio.write'], I: ['console.dashboard.read'] }],
  [t('Mediasi EIO (data plane)'), { R: ['console.eio.run'], I: ['console.dashboard.read'] }],
  [t('FinOps'), { I: ['console.finops.read'] }],
  [t('Akun & penugasan peran'), { R: ['set.account.admin'], I: ['set.account.read'] }],
  [t('API Client & Secrets'), { R: ['set.account.admin'], I: ['set.account.read'] }],
  [t('Audit trail'), { I: ['set.audit.read'] }],
];

type Cell = 'A' | 'R' | 'R*' | 'I' | '-';
const raciCell = (role: api.Row, f: Feature): Cell => {
  const has = (codes?: string[]) => (codes || []).some((c) => (role.permissions || []).includes(c));
  if (has(f.A)) return 'A';
  if (has(f.R)) return role.editScope === 'entity' ? 'R*' : 'R';
  if (has(f.I)) return 'I';
  return '-';
};
const cellCls = (v: Cell) => (v === 'A' ? 'm-A' : v.startsWith('R') ? 'm-R' : v === 'I' ? 'm-I' : '');
const shortRole = (code: string) => code.replace(/^ROLE_EAP_/, '').split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
const vertical = (h: number): React.CSSProperties => ({ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: h, textTransform: 'none', letterSpacing: 0 });

function Gate({ q, children }: { q: { isError: boolean; error: unknown; isPending: boolean }; children: React.ReactNode }) {
  if (q.isError) return <Callout tone="err">{api.explain(q.error)}</Callout>;
  if (q.isPending) return <div className="muted small">{t('Memuat…')}</div>;
  return <>{children}</>;
}

/** Matriks Peran × Izin: baris = peran aktif, kolom = izin (dikelompokkan per workspace); baris peran Anda disorot; baris bawah = jumlah peran pemegang izin. */
export function MatrixTab() {
  const { roles, perms } = useRoleCatalog();
  const mine = useSession((s) => s.me?.roles) || [];
  const active = React.useMemo(() => (roles.data || []).filter((r) => r.isActive), [roles.data]);
  // kolom = KATALOG izin (izin yang belum dipegang peran mana pun tetap terlihat); bila katalog tak terbaca, gabungan izin peran
  const cols = React.useMemo(() => {
    const desc = new Map<string, string>((perms.data || []).map((p) => [p.permission_code as string, (p.description as string) || '']));
    const codes = [...new Set([...(perms.data || []).map((p) => p.permission_code as string), ...active.flatMap((r) => r.permissions as string[])])].sort();
    return { codes, desc };
  }, [perms.data, active]);
  const groups = React.useMemo(() => {
    const g: { ws: string; n: number }[] = [];
    cols.codes.forEach((c) => { const ws = c.split('.')[0]; if (g.length && g[g.length - 1].ws === ws) g[g.length - 1].n++; else g.push({ ws, n: 1 }); });
    return g;
  }, [cols.codes]);
  return (
    <Gate q={roles}>
      <Card flush title={t('Matriks Peran × Izin ({0} izin dari set.role_permissions)', cols.codes.length)} meta={t('baris disorot = peran Anda · ditegakkan DB (RLS + trigger admin-only)')}>
        <div className="tbl-wrap">
          <table className="tbl matrix matrix-compact">
            <thead>
              <tr>
                <th rowSpan={2} className="role-col">{t('Peran')}</th>
                {groups.map((g) => <th key={g.ws} colSpan={g.n} className="c grp">{g.ws.toUpperCase()}</th>)}
                <th rowSpan={2} className="c" style={vertical(120)}>{t('Jumlah izin')}</th>
              </tr>
              <tr>{cols.codes.map((c) => <th key={c} className="c" title={`${c}${cols.desc.get(c) ? ' — ' + cols.desc.get(c) : ''}`} style={{ ...vertical(150), fontFamily: 'var(--mono)' }}>{c.split('.').slice(1).join('.')}</th>)}</tr>
            </thead>
            <tbody>
              {active.map((r) => (
                <tr key={r.id} style={mine.includes(r.roleCode) ? { background: 'var(--accent-soft)' } : undefined}>
                  <td className="role-col" title={r.description || undefined}><b className="small">{r.roleName}</b><div className="tiny mono faint">{r.roleCode}</div></td>
                  {cols.codes.map((c) => <td key={c} className="c" title={`${r.roleCode} · ${c}`}>{(r.permissions as string[]).includes(c) ? <span className="perm-y">●</span> : <span className="perm-n">·</span>}</td>)}
                  <td className="c">{(r.permissions as string[]).length}</td>
                </tr>
              ))}
              <tr className="matrix-sum">
                <td className="role-col"><b className="small">{t('Jumlah peran pemegang')}</b></td>
                {cols.codes.map((c) => <td key={c} className="c tiny">{active.filter((r) => (r.permissions as string[]).includes(c)).length}</td>)}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </Gate>
  );
}

/** RACI turunan dari izin nyata: baris = fitur, kolom = peran aktif. */
export function RaciTab() {
  const { roles } = useRoleCatalog();
  const mine = useSession((s) => s.me?.roles) || [];
  const active = React.useMemo(() => (roles.data || []).filter((r) => r.isActive), [roles.data]);
  return (
    <Gate q={roles}>
      <Card flush title={t('RACI turunan dari izin nyata')} meta={t('dihitung dari /api/v1/set/roles — berubah otomatis saat izin peran diubah')}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="role-col">{t('Fitur / Modul')}</th>
                {active.map((r) => <th key={r.id} className={cx('c', mine.includes(r.roleCode) && 'mine')} title={r.roleName} style={vertical(150)}>{shortRole(r.roleCode)}</th>)}
              </tr>
            </thead>
            <tbody>
              {RACI_FEATURES.map(([nama, f]) => (
                <tr key={nama}>
                  <td className="role-col"><b className="small">{nama}</b><div className="tiny mono faint">{[...(f.A || []), ...(f.R || []), ...(f.I || [])].join(' · ')}</div></td>
                  {active.map((r) => { const v = raciCell(r, f); return <td key={r.id} className="c"><span className={cellCls(v)} style={{ display: 'inline-block', minWidth: 30, padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>{v}</span></td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ margin: '10px 14px' }}><Callout tone="info">
          <b>A</b> = {t('memegang izin gerbang persetujuan fitur')} · <b>R</b> = {t('izin tulis/jalankan/admin')} · <b>R*</b> = {t('R berlingkup entitas penugasan')} · <b>I</b> = {t('hanya baca')} · <b>-</b> = {t('tanpa akses')}.{' '}
          <b>C (Consulted)</b> {t('pada RACI PRD §13.2 adalah peran proses, bukan izin sistem, sehingga tidak dapat diturunkan dan tidak ditampilkan. Fitur tanpa izin persetujuan (mis. ADR, Roadmap) tidak punya kolom A.')}
        </Callout></div>
      </Card>
    </Gate>
  );
}
