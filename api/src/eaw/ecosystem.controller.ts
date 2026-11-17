import { Controller, Get } from '@nestjs/common';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { DbService } from '../db/db.service';

type Level = 'err' | 'warn' | 'info';
interface Signal { level: Level; kind: string; title: string; detail: string; route?: string }
interface Kpi { id: string; label: string; value: string | null; pct: number | null; target: string; basis: string; reason?: string }

const THRESHOLD = 75;   // % kemiripan: sama dengan ambang pre-screening ARB (K-03)
const OBJ_TABLES = ['process', 'data_entity', 'service', 'application', 'infra_asset', 'control'].map((t) => `eaw.${t}`);
const pct = (n: number, d: number) => (d > 0 ? Math.round((1000 * n) / d) / 10 : null);
const fmt1 = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
/** Durasi dalam hari → teks yang tidak menyesatkan (data sangat singkat tidak dibulatkan menjadi "0 hari"). */
const fmtDays = (d: number) => (d < 1 / 24 ? `${Math.max(1, Math.round(d * 1440))} menit` : d < 1 ? `${fmt1(d * 24)} jam` : `${fmt1(d)} hari`);
const fmtSec = (s: number) => (s < 1 ? `${Math.max(1, Math.round(s * 1000))} ms` : `${fmt1(s)} dtk`);

/** Satu bagian yang gagal (mis. tabel console tak terbaca peran ini) tidak menjatuhkan seluruh respons: SAVEPOINT per bagian. */
async function safe<T>(c: any, name: string, fn: () => Promise<T>, fallback: T): Promise<{ v: T; ok: boolean }> {
  await c.query(`SAVEPOINT eco_${name}`);
  try { const v = await fn(); await c.query(`RELEASE SAVEPOINT eco_${name}`); return { v, ok: true }; }
  catch { await c.query(`ROLLBACK TO SAVEPOINT eco_${name}`); return { v: fallback, ok: false }; }
}

/**
 * Redundancy & Drift Monitor + KPI Ekosistem (dashboard EAW). SEMUA angka dihitung dari data nyata dan MENGIKUTI RLS pemanggil — tidak ada angka karangan.
 * Batas jujur: (1) redundansi = kemiripan leksikal pg_trgm nama aplikasi (heuristik deterministik, BUKAN model MIND AI); (2) tidak ada pemindai Git/APISIX,
 * jadi "shadow IT" dan "endpoint tanpa kontrak di gateway" TIDAK terdeteksi (dilaporkan di `notCovered`); (3) KPI tanpa sumber data nyata
 * (akurasi deteksi/guardrail butuh data berlabel, akun per karyawan butuh Keycloak, zero local master butuh pemindai skema) dikembalikan
 * `value:null` + `reason`, bukan diisi. Interpretasi rumus KPI adalah milik kami — dokumen PRD §15 tidak ada di workspace ini.
 */
@Controller('api/v1/eaw')
export class EcosystemController {
  constructor(private readonly db: DbService) {}

  @Get('ecosystem') @RequirePermission('eaw.catalog.read')
  ecosystem(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => {
      const redundancy: Signal[] = []; const drift: Signal[] = [];

      // --- Redundansi 1: pasangan aplikasi bernama mirip (sesama jenis node)
      const pairs = await safe(c, 'pairs', async () => (await c.query(
        `SELECT a.kode AS ka, a.nama AS na, b.kode AS kb, b.nama AS nb, round(100 * similarity(a.nama, b.nama))::int AS sim
           FROM eaw.application a JOIN eaw.application b ON a.id < b.id AND a.jenis_node = b.jenis_node
          WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL AND 100 * similarity(a.nama, b.nama) >= $1
          ORDER BY sim DESC, a.kode, b.kode LIMIT 10`, [THRESHOLD])).rows, [] as any[]);
      for (const r of pairs.v) {
        redundancy.push({ level: r.sim >= 90 ? 'err' : 'warn', kind: 'Duplikasi', title: `${r.ka} ≈ ${r.kb}`, detail: `${r.na} · ${r.nb} — ${r.sim}% mirip`, route: '/eaw/aplikasi/' });
      }
      // --- Redundansi 2: tiket ARB dengan skor ≥ ambang yang belum disetujui
      const tix = await safe(c, 'arb', async () => (await c.query(
        `SELECT ticket_number, initiative_name, ai_risk_score::float AS score, status FROM eaw.arb_clearance
          WHERE deleted_at IS NULL AND ai_risk_score >= $1 AND status <> 'APPROVED' ORDER BY ai_risk_score DESC, ticket_number LIMIT 10`, [THRESHOLD])).rows, [] as any[]);
      for (const r of tix.v) {
        redundancy.push({ level: r.status === 'REJECTED' ? 'info' : r.score >= 90 ? 'err' : 'warn', kind: 'Duplikasi', title: r.initiative_name,
          detail: `${Math.round(r.score)}% mirip aplikasi terdaftar · ${r.ticket_number} · ${r.status}`, route: '/eaw/arb/' });
      }

      // --- Drift: objek menunggu reviu AF-07 & ketidakpatuhan KRA
      const rev = await safe(c, 'review', async () => (await c.query(
        `SELECT count(*)::int AS n FROM (${OBJ_TABLES.map((t) => `SELECT 1 FROM ${t} WHERE deleted_at IS NULL AND status = 'Direviu'`).join(' UNION ALL ')}) x`)).rows[0].n, 0);
      if (rev.v > 0) drift.push({ level: 'info', kind: 'KRA', title: 'KRA naik versi', detail: `${rev.v} objek perlu direviu (AF-07)`, route: '/eaw/kra/' });
      const nonc = await safe(c, 'nonconf', async () => (await c.query('SELECT count(*)::int AS n FROM eaw.kra_nonconformance')).rows[0].n, 0);
      if (nonc.v > 0) drift.push({ level: 'warn', kind: 'KRA', title: 'Tautan KRA tidak patuh', detail: `${nonc.v} objek non-Draf tanpa KRA yang berlaku & sedomain`, route: '/eaw/kra/' });
      // --- Drift: workspace belum ditempatkan
      const unp = await safe(c, 'unplaced', async () => (await c.query(
        `SELECT count(*)::int AS n FROM eaw.application WHERE deleted_at IS NULL AND jenis_node = 'workspace' AND platform IS NULL`)).rows[0].n, 0);
      if (unp.v > 0) drift.push({ level: 'info', kind: 'Katalog', title: 'Workspace belum ditempatkan', detail: `${unp.v} workspace tanpa platform induk`, route: '/eaw/aplikasi/' });
      // --- Drift: konektor EIO (kontrak & kesehatan)
      const con = await safe(c, 'connectors', async () => (await c.query(
        `SELECT kode, nama, tipe, status, spec_snapshot IS NULL AS no_spec, jsonb_array_length(COALESCE(breaking_changes, '[]'::jsonb)) AS breaking
           FROM console.eio_connector WHERE deleted_at IS NULL ORDER BY kode`)).rows, [] as any[]);
      for (const r of con.v) {
        if (r.breaking > 0) drift.push({ level: 'err', kind: 'Drift', title: r.kode, detail: `${r.breaking} perubahan breaking pada kontrak OpenAPI terhadap baseline`, route: '/console/eio/' });
        else if (r.tipe === 'openapi' && r.no_spec) drift.push({ level: 'warn', kind: 'Drift', title: r.kode, detail: 'Konektor OpenAPI tanpa baseline kontrak (belum ada spesifikasi diambil)', route: '/console/eio/' });
        if (r.status === 'down' || r.status === 'degraded') drift.push({ level: r.status === 'down' ? 'err' : 'warn', kind: 'Konektor', title: r.kode, detail: `Status ${r.status} pada pemeriksaan terakhir`, route: '/console/eio/' });
      }

      // --- KPI
      const kpis: Kpi[] = [];
      const app = await safe(c, 'kpi_app', async () => (await c.query(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE status IN ('Ditetapkan','Dipublikasi'))::int AS baseline FROM eaw.application WHERE deleted_at IS NULL`)).rows[0], { total: 0, baseline: 0 });
      const k1 = pct(app.v.baseline, app.v.total);
      kpis.push({ id: 'K-01', label: 'Aplikasi di baseline EAW', value: app.v.total ? `${app.v.baseline} / ${app.v.total}` : null, pct: k1, target: '100% akhir Fase 2',
        basis: 'aplikasi/workspace berstatus ≥ Ditetapkan dibanding seluruh yang terdaftar (penyebut = yang terdaftar, bukan portofolio sebenarnya)', reason: app.v.total ? undefined : 'Belum ada aplikasi terdaftar' });

      const arb = await safe(c, 'kpi_arb', async () => (await c.query(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE c.status = 'APPROVED')::int AS ok
           FROM eaw.application a LEFT JOIN eaw.arb_clearance c ON c.id = a.arb_clearance_id AND c.deleted_at IS NULL
          WHERE a.deleted_at IS NULL AND a.jenis_node = 'workspace' AND NOT a.adopsi AND a.status <> 'Draf'`)).rows[0], { total: 0, ok: 0 });
      kpis.push({ id: 'K-02', label: 'Kepatuhan clearance ARB (AF-06)', value: arb.v.total ? `${fmt1(pct(arb.v.ok, arb.v.total)!)}%` : null, pct: pct(arb.v.ok, arb.v.total), target: '100% sejak Fase 1',
        basis: 'workspace non-adopsi di luar Draf yang bertiket ARB APPROVED', reason: arb.v.total ? undefined : 'Belum ada workspace non-adopsi di luar Draf' });

      const rel = await safe(c, 'kpi_rel', async () => (await c.query(
        `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM w.waktu - c.created_at) / 86400)::float AS days, count(*)::int AS n
           FROM eaw.application a JOIN eaw.arb_clearance c ON c.id = a.arb_clearance_id
           JOIN LATERAL (SELECT min(waktu) AS waktu FROM eaw.workflow WHERE objek_type = 'application' AND objek_id = a.id AND status_ke = 'Dipublikasi') w ON w.waktu IS NOT NULL
          WHERE a.deleted_at IS NULL`)).rows[0], { days: null, n: 0 } as any);
      const days: number | null = rel.v.n > 0 ? rel.v.days : null;
      kpis.push({ id: 'K-07', label: 'Waktu rilis aplikasi baru', value: days == null ? null : fmtDays(days), pct: days == null ? null : Math.min(100, Math.round((1000 * 30) / Math.max(days, 0.01)) / 10), target: '≤ 30 hari',
        basis: 'median hari dari tiket ARB dibuat sampai aplikasi pertama kali Dipublikasi (n=' + rel.v.n + ')', reason: days == null ? 'Belum ada aplikasi bertiket ARB yang Dipublikasi' : undefined });

      const gse = await safe(c, 'kpi_gse', async () => (await c.query(
        `SELECT avg(duration_ms)::float AS ms, count(*)::int AS n FROM gse.project WHERE deleted_at IS NULL AND status <> 'blocked' AND duration_ms IS NOT NULL`)).rows[0], { ms: null, n: 0 } as any);
      const sec: number | null = gse.v.n > 0 ? gse.v.ms / 1000 : null;
      kpis.push({ id: 'K-08', label: 'Rata-rata scaffold GSE', value: sec == null ? null : fmtSec(sec), pct: sec == null ? null : Math.min(100, Math.round((1000 * 45) / Math.max(sec, 0.01)) / 10), target: '≤ 45 dtk',
        basis: 'rata-rata duration_ms proyek yang dihasilkan (tidak diblokir AF-06; n=' + gse.v.n + ')', reason: sec == null ? 'Belum ada proyek scaffold atau tabel GSE tak terbaca peran ini' : undefined });

      for (const [id, label, target, reason] of [
        ['K-03', 'Akurasi deteksi redundansi', '≥ 80%', 'Butuh data berlabel (putusan benar/salah per deteksi); pre-screening kini heuristik leksikal, bukan model MIND'],
        ['K-04', 'Zero local master', '100% akhir Fase 3', 'Butuh pemindai skema basis data aplikasi; saat ini hanya cek M1 saat tiket ARB'],
        ['K-05', 'Akun login per karyawan', '1 akun SSO', 'Sumber data ada di Keycloak/CMP, belum terhubung ke EAP'],
        ['K-10', 'Akurasi guardrail REQ', '≥ 99,5%', 'Butuh korpus berlabel di luar uji otomatis; log guardrail tidak berlabel'],
      ] as const) kpis.push({ id, label, value: null, pct: null, target, basis: '', reason });
      kpis.sort((a, b) => a.id.localeCompare(b.id));

      const order: Record<Level, number> = { err: 0, warn: 1, info: 2 };
      redundancy.sort((a, b) => order[a.level] - order[b.level]); drift.sort((a, b) => order[a.level] - order[b.level]);
      return {
        generatedAt: new Date().toISOString(), threshold: THRESHOLD, redundancy, drift, kpis,
        notCovered: ['Shadow IT (basis data/server di luar katalog) — tidak ada pemindai Git/infrastruktur', 'Endpoint tanpa kontrak OpenAPI di gateway (APISIX) — hanya konektor EIO yang diperiksa', 'Model MIND AI — kemiripan = pg_trgm leksikal'],
        unavailable: [pairs, tix, rev, nonc, unp, con, app, arb, rel, gse].some((s) => !s.ok),
      };
    });
  }
}
