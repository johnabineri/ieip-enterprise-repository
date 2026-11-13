#!/usr/bin/env node
// =====================================================================================================================
// Data contoh EAP ujung ke ujung: SEDDI CMP didaftarkan di katalog EAP sampai DIPUBLIKASI, lalu terbukti kembali ke CMP
// (eaw.application_registry → publikasi pub_eap_ref → kalla_cmp.ref.applications).
//
// BUKAN SEED (Zero Pre-Seed): seluruh data masuk lewat API EAP sebagai pengguna Keycloak nyata, dengan semua aturan DB
// berlaku (RLS, AF-05, empat mata, KRA se-domain, relasi wajib, ARB). Pola yang sama dengan pendaftaran BASE.
//   nurul.aisyah  = Enterprise Application Architect — penyusun, validasi (Divalidasi), penerbit (Dipublikasi), pengaju ARB
//   andi.pratama  = Ketua ARB — penetap (Ditetapkan, maker ≠ checker), pemutus tiket ARB, penerima ADR
//
// Idempoten: objek dicari dulu (kode/nama) sebelum dibuat; transisi hanya maju dari status sekarang. Aman dijalankan ulang.
//
// Pemakaian (stack dev Compose berjalan):
//   node eap/scripts/sample-cmp-e2e.mjs
// Env opsional: EAP_GW (http://127.0.0.1:8088), EAP_HOST (keis.localhost), KC_URL (http://127.0.0.1:8180),
//   KC_HOST (localhost:8180 — harus cocok dengan OIDC_ISSUER API), KC_CLIENT (cmp-dev-cli), E2E_PASSWORD (Kalla@2026),
//   ENTITY_CODE (KALLA), PG_EXEC ("docker exec -i balla_kalla-postgres"), SKIP_CMP_CHECK=1.
// =====================================================================================================================
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const GW = new URL(process.env.EAP_GW ?? 'http://127.0.0.1:8088');
const EAP_HOST = process.env.EAP_HOST ?? 'keis.localhost';
const KC = new URL(process.env.KC_URL ?? 'http://127.0.0.1:8180');
const KC_HOST = process.env.KC_HOST ?? 'localhost:8180';
const KC_CLIENT = process.env.KC_CLIENT ?? 'cmp-dev-cli';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Kalla@2026';
const ENTITY_CODE = process.env.ENTITY_CODE ?? 'KALLA';
const PG_EXEC = process.env.PG_EXEC ?? 'docker exec -i balla_kalla-postgres';
const MAKER = 'nurul.aisyah';
const CHECKER = 'andi.pratama';

// ---------------------------------------------------------------- HTTP (Node fetch tidak me-resolve *.localhost di Windows)
function raw(url, host, method, path, { body, headers = {}, form } = {}) {
  return new Promise((resolve, reject) => {
    const data = form ? new URLSearchParams(form).toString() : body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({
      hostname: url.hostname, port: url.port, method, path,
      headers: { Host: host, Accept: 'application/json', ...(data ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers },
    }, (res) => {
      let s = ''; res.setEncoding('utf8'); res.on('data', (d) => (s += d));
      res.on('end', () => { let j = null; try { j = s ? JSON.parse(s) : null; } catch { j = s; } resolve({ status: res.statusCode, headers: res.headers, body: j }); });
    });
    req.on('error', reject); req.setTimeout(60_000, () => req.destroy(new Error(`timeout ${method} ${path}`)));
    if (data) req.write(data); req.end();
  });
}
const tokens = {};
async function token(user) {
  if (tokens[user] && tokens[user].exp > Date.now() + 30_000) return tokens[user].t;
  const r = await raw(KC, KC_HOST, 'POST', '/realms/keis/protocol/openid-connect/token',
    { form: { grant_type: 'password', client_id: KC_CLIENT, username: user, password: PASSWORD } });
  if (r.status !== 200) throw new Error(`login ${user} gagal (${r.status}): ${JSON.stringify(r.body).slice(0, 200)}`);
  tokens[user] = { t: r.body.access_token, exp: Date.now() + r.body.expires_in * 1000 };
  return tokens[user].t;
}
let calls = 0;
async function api(user, method, path, body, { ifMatch, ok = [200, 201, 204] } = {}) {
  calls++;
  if (calls % 60 === 0) await new Promise((r) => setTimeout(r, 1000));            // gateway api-ratelimit 80/dtk
  const headers = { Authorization: `Bearer ${await token(user)}`, ...(ifMatch ? { 'If-Match': ifMatch } : {}) };
  const r = await raw(GW, EAP_HOST, method, path, { body, headers });
  if (!ok.includes(r.status)) {
    const b = r.body && typeof r.body === 'object' ? `${r.body.title ?? ''} — ${r.body.detail ?? JSON.stringify(r.body).slice(0, 300)}` : String(r.body).slice(0, 300);
    const e = new Error(`${user} ${method} ${path} → ${r.status}: ${b}`); e.status = r.status; e.body = r.body; throw e;
  }
  return r;
}
const get = async (user, path) => (await api(user, 'GET', path)).body;
const list = async (user, path) => {                                              // ikuti nextCursor
  const out = []; let cursor = null;
  do {
    const sep = path.includes('?') ? '&' : '?';
    const b = await get(user, `${path}${sep}limit=100${cursor ? `&cursor=${cursor}` : ''}`);
    out.push(...(Array.isArray(b) ? b : b.data ?? [])); cursor = b?.nextCursor ?? null;
  } while (cursor);
  return out;
};

// ---------------------------------------------------------------- log
const stats = { created: 0, reused: 0, transitions: 0 };
const log = (...a) => console.log(...a);
const step = (t) => log(`\n== ${t}`);
const made = (what) => { stats.created++; log(`  + ${what}`); };
const reuse = (what) => { stats.reused++; log(`  · ${what} (sudah ada)`); };

// ---------------------------------------------------------------- AF-05
const FLOW = ['Draf', 'Divalidasi', 'Ditetapkan', 'Dipublikasi'];
const ACTOR = { Divalidasi: MAKER, Ditetapkan: CHECKER, Dipublikasi: MAKER };
const NOTE = {
  Divalidasi: 'Validasi EA Office: KRA se-domain berlaku, relasi wajib lengkap (data contoh CMP).',
  Ditetapkan: 'Ditetapkan ARB sebagai baseline arsitektur SEDDI CMP (lihat CMP-ADR-001..003).',
  Dipublikasi: 'Dipublikasi ke katalog grup oleh EA Office.',
};
async function advance(type, id, label, from, to = 'Dipublikasi') {
  let cur = from;
  if (!FLOW.includes(cur)) throw new Error(`${label}: status ${cur} di luar alur maju (tangani manual)`);
  while (FLOW.indexOf(cur) < FLOW.indexOf(to)) {
    const next = FLOW[FLOW.indexOf(cur) + 1];
    await api(ACTOR[next], 'POST', '/api/v1/eaw/transitions', { objekType: type, objekId: id, to: next, catatan: NOTE[next] });
    stats.transitions++; cur = next;
  }
  log(`  ✓ ${label}: ${from === to ? to : `${from} → ${to}`}`);
  return cur;
}

// ---------------------------------------------------------------- data contoh SEDDI CMP
const KRAS = [
  { key: 'proses_bisnis', kode: 'KRA-PB-DATA-INDUK', nama: 'Proses Tata Kelola Data Induk Grup', deskripsi: 'Proses baku pengelolaan data induk grup: pengajuan perubahan berpasangan (maker-checker), mutu data, distribusi ke platform konsumen.' },
  { key: 'data', kode: 'KRA-DATA-SATU-DATA', nama: 'Prinsip Satu Data Korporasi (golden record SEDDI)', deskripsi: 'Data induk (party, organisasi, pegawai, produk, keuangan, referensi) hanya dikelola di SEDDI CMP; platform lain membaca replika ref.* (aturan M1).' },
  { key: 'layanan', kode: 'KRA-LYN-PLATFORM', nama: 'Katalog Layanan Platform Bersama KEIS', deskripsi: 'Layanan platform bersama yang dipakai lintas badan hukum: golden record, change request, replikasi, identitas, hak subjek data.' },
  { key: 'aplikasi', kode: 'KRA-APL-KEIS', nama: 'Arsitektur Referensi Platform & Workspace KEIS', deskripsi: 'Pola platform → workspace KEIS: NestJS/Fastify, PostgreSQL ber-RLS, Keycloak OIDC, outbox + NATS, SPA Next.js.' },
  { key: 'infrastruktur', kode: 'KRA-INF-KEIS', nama: 'Infrastruktur Kontainer & Basis Data KEIS', deskripsi: 'Kubernetes on-prem, klaster PostgreSQL bersama, Keycloak, NATS JetStream, penyimpanan objek.' },
  { key: 'keamanan', kode: 'KRA-SEC-PDP', nama: 'Keamanan Informasi & Pelindungan Data Pribadi (UU 27/2022)', deskripsi: 'Enkripsi PII, RLS default-deny, maker-checker, jejak audit append-only, MFA admin, kunci di Vault.' },
];
const PROC = [
  { key: 'pr1', nama: 'Pengelolaan Data Induk Grup', level: 1, pemilikJabatan: 'Head of Data Governance', input: 'Usulan data induk dari unit/SBU', output: 'Golden record data induk' },
  { key: 'pr2', nama: 'Pengajuan & Persetujuan Perubahan Data Induk', level: 2, parent: 'pr1', pemilikJabatan: 'Data Steward Domain', input: 'Change request (maker)', output: 'Perubahan disetujui checker & tercatat audit' },
  { key: 'pr3', nama: 'Pemantauan Mutu Data Induk', level: 2, parent: 'pr1', pemilikJabatan: 'Data Quality Officer', input: 'Aturan mutu & data induk', output: 'Scorecard & isu mutu' },
  { key: 'pr4', nama: 'Distribusi Data Induk ke Platform Konsumen', level: 2, parent: 'pr1', pemilikJabatan: 'Platform Engineer CMP', input: 'Golden record', output: 'Replika ref.* di EAP/BASE/STRIDE' },
  { key: 'pr5', nama: 'Sinkronisasi Kepegawaian dari HRIS (PULSE)', level: 2, parent: 'pr1', pemilikJabatan: 'HRIS Administrator', input: 'Peristiwa base.pulse.*', output: 'mdm.employees/employments mutakhir' },
  { key: 'pr6', nama: 'Pengelolaan Identitas & Hak Akses Terpusat', level: 1, pemilikJabatan: 'Head of IT Security', input: 'Permintaan akses', output: 'Peran & klaim workspace' },
  { key: 'pr7', nama: 'Pemenuhan Hak Subjek Data Pribadi', level: 1, pemilikJabatan: 'Data Protection Officer', input: 'Permintaan subjek data', output: 'Permintaan dipenuhi dalam tenggat' },
  { key: 'pr8', nama: 'Pengelolaan Kunci Enkripsi Data Pribadi', level: 2, parent: 'pr7', pemilikJabatan: 'Security Engineer', input: 'Kebijakan rotasi kunci', output: 'Kunci PII berversi di Vault' },
];
const DATA = [
  { key: 'd1', namaKanonikal: 'Party (golden record)', klasifikasi: 'terbatas', pii: true, sumberOtoritatif: 'kalla_cmp.mdm.parties', retensiHari: 3650 },
  { key: 'd2', namaKanonikal: 'Badan Hukum', klasifikasi: 'internal', pii: false, sumberOtoritatif: 'kalla_cmp.mdm.companies' },
  { key: 'd3', namaKanonikal: 'Unit Organisasi', klasifikasi: 'internal', pii: false, sumberOtoritatif: 'kalla_cmp.mdm.org_units' },
  { key: 'd4', namaKanonikal: 'Pegawai (master SEDDI)', klasifikasi: 'terbatas', pii: false, sumberOtoritatif: 'kalla_cmp.mdm.employees' },   // sudah ada (BASE) → dipakai ulang
  { key: 'd5', namaKanonikal: 'Produk', klasifikasi: 'internal', pii: false, sumberOtoritatif: 'kalla_cmp.mdm.products' },
  { key: 'd6', namaKanonikal: 'Bagan Akun Grup', klasifikasi: 'internal', pii: false, sumberOtoritatif: 'kalla_cmp.mdm.chart_of_accounts' },
  { key: 'd7', namaKanonikal: 'Change Request Data Induk', klasifikasi: 'internal', pii: false, sumberOtoritatif: 'kalla_cmp.mdm.change_requests', retensiHari: 3650 },
  { key: 'd8', namaKanonikal: 'Akun Pengguna & Peran', klasifikasi: 'terbatas', pii: true, sumberOtoritatif: 'kalla_cmp.iam.users' },
  { key: 'd9', namaKanonikal: 'Persetujuan Subjek Data (Consent)', klasifikasi: 'terbatas', pii: true, sumberOtoritatif: 'kalla_cmp.mdm.party_consents' },
  { key: 'd10', namaKanonikal: 'Log Akses PII', klasifikasi: 'rahasia', pii: true, sumberOtoritatif: 'kalla_cmp.mdm.pii_access_logs', retensiHari: 1825 },
  { key: 'd11', namaKanonikal: 'Jejak Audit Data Induk', klasifikasi: 'rahasia', pii: false, sumberOtoritatif: 'kalla_cmp.shared.audit_logs', retensiHari: 3650 },
].map((d) => ({ steward: 'Data Steward SEDDI (CMP)', ...d }));
const SVC = [
  { key: 's1', nama: 'Layanan Golden Record Party', tipe: 'internal', kategori: 'utama', slo: '99,5% bulanan; p95 < 300 ms', kanal: 'REST /api/v1/parties' },
  { key: 's2', nama: 'Layanan Change Request Data Induk (maker-checker)', tipe: 'internal', kategori: 'utama', slo: 'Keputusan ≤ 2 hari kerja', kanal: 'Admin SPA CMP + REST' },
  { key: 's3', nama: 'Layanan Replikasi Data Induk (pub_cmp_ref)', tipe: 'internal', kategori: 'utama', slo: 'Lag replikasi < 60 dtk', kanal: 'Replikasi logis PostgreSQL + NATS' },
  { key: 's4', nama: 'Layanan Identitas & Klaim Workspace (IAM)', tipe: 'internal', kategori: 'utama', slo: '99,9% bulanan', kanal: 'OIDC Keycloak + iam.workspace_claims' },
  { key: 's5', nama: 'Layanan Hak Subjek Data (DSR)', tipe: 'pelanggan-mitra', kategori: 'pendukung', slo: 'Dipenuhi ≤ 3×24 jam', kanal: 'Portal & API privasi' },
  { key: 's6', nama: 'Layanan Mutu Data (Scorecard DQ)', tipe: 'internal', kategori: 'pendukung', slo: 'Scorecard harian', kanal: 'Admin SPA CMP' },
  { key: 's7', nama: 'Layanan Manajemen Kunci PII', tipe: 'internal', kategori: 'pendukung', slo: 'Rotasi kunci tanpa henti layanan', kanal: 'Vault Transit (rencana)' },
].map((s) => ({ pemilik: 'Platform Owner SEDDI CMP', ...s }));
const INFRA = [
  { key: 'i1', nama: 'Klaster PostgreSQL KEIS (kalla_cmp)', tipe: 'klaster-db', lokasi: 'DC Kalla Makassar', kapasitas: 'PostgreSQL 18, replikasi logis', drTier: 'Tier 1' },
  { key: 'i2', nama: 'Klaster Kubernetes KEIS', tipe: 'klaster-k8s', lokasi: 'DC Kalla Makassar', kapasitas: 'Namespace keis', drTier: 'Tier 1' },
  { key: 'i3', nama: 'Keycloak Realm keis (IdP)', tipe: 'klaster-k8s', lokasi: 'DC Kalla Makassar', kapasitas: 'Realm keis', drTier: 'Tier 1' },
  { key: 'i4', nama: 'NATS JetStream (event backbone KEIS)', tipe: 'jaringan', lokasi: 'DC Kalla Makassar', kapasitas: 'Stream keis.*', drTier: 'Tier 2' },
  { key: 'i5', nama: 'HashiCorp Vault (rencana)', tipe: 'klaster-k8s', lokasi: 'DC Kalla Makassar', kapasitas: 'Transit + KV', drTier: 'Tier 1' },
];
const CTRL = [
  { key: 'c1', aspek: 'kerahasiaan', standarRujukan: 'UU PDP — enkripsi PII pgcrypto + pencarian HMAC', statusPenerapan: 'penuh' },
  { key: 'c2', aspek: 'kerahasiaan', standarRujukan: 'RLS default-deny per transaksi (SET LOCAL)', statusPenerapan: 'penuh' },
  { key: 'c3', aspek: 'keutuhan', standarRujukan: 'Maker-checker change request (pembuat ≠ penyetuju)', statusPenerapan: 'penuh' },
  { key: 'c4', aspek: 'kenirsangkalan', standarRujukan: 'Jejak audit append-only shared.audit_logs', statusPenerapan: 'penuh' },
  { key: 'c5', aspek: 'keaslian', standarRujukan: 'OIDC Keycloak + MFA administrator', statusPenerapan: 'sebagian' },
  { key: 'c6', aspek: 'ketersediaan', standarRujukan: 'Replikasi logis + cadangan PITR', statusPenerapan: 'sebagian' },
  { key: 'c7', aspek: 'kerahasiaan', standarRujukan: 'Kunci PII di Vault dengan rotasi berkala', statusPenerapan: 'belum' },
];
const PLATFORM = {
  kode: 'CMP', nama: 'SEDDI CMP — Corporate Master Platform', jenis: 'umum', ownerBisnis: 'Chief Data Officer Holding', timPengembang: 'Tim ICT Dev Kalla',
  risikoAi: 'none', slo: 'Ketersediaan 99,5% bulanan; lag replikasi < 60 dtk', lifecycle: 'active', kritikalitas: 'critical',
  uiStandard: 'Next.js App Router (ekspor statis) + shadcn/ui + AG Grid, tema Kalla (stack.md)',
  techStack: 'NestJS (Fastify) + Drizzle · PostgreSQL 18 (RLS, pgcrypto, replikasi logis) · Keycloak OIDC · outbox + NATS JetStream · Docker/Kubernetes',
};
const WS = [
  { kode: 'CMP-MDM', nama: 'Master Data — Organisasi, Party, Pegawai, Produk, Keuangan, Referensi', workspace: 'mdm', kritikalitas: 'critical' },
  { kode: 'CMP-GOV', nama: 'Tata Kelola Data — Change Request, Mutu, Survivorship, Steward', workspace: 'governance', kritikalitas: 'high' },
  { kode: 'CMP-PDP', nama: 'Pelindungan Data Pribadi — Persetujuan, Hak Subjek, Log PII', workspace: 'privacy', kritikalitas: 'high', risikoAi: 'none' },
  { kode: 'CMP-IAM', nama: 'Identitas & Akses Terpusat KEIS', workspace: 'iam', kritikalitas: 'critical' },
  { kode: 'CMP-DIST', nama: 'Distribusi Data Induk — Publikasi & CDC', workspace: 'distribution', kritikalitas: 'critical' },
  { kode: 'CMP-KMS', nama: 'Manajemen Kunci PII — Integrasi Vault', workspace: 'kms', kritikalitas: 'high', lifecycle: 'planned', viaArb: true },
].map((w) => ({ jenis: 'umum', ownerBisnis: PLATFORM.ownerBisnis, timPengembang: PLATFORM.timPengembang, risikoAi: 'none', slo: PLATFORM.slo,
  lifecycle: 'active', workspaceMode: 'INTERNAL_ROUTED', ...w }));
// relasi: [sumber, tipe, target] — kunci: CMP*/BASE* = aplikasi, pr = proses, d = data, s = layanan, i = infra, c = kontrol
const REL = [
  ['CMP', 'realization', 's1'], ['CMP', 'realization', 's4'], ['CMP', 'serving', 'pr1'], ['CMP', 'access', 'd1'],
  ['CMP', 'assignment', 'i1'], ['CMP', 'assignment', 'i2'], ['CMP', 'association', 'c1'], ['CMP', 'association', 'c2'], ['CMP', 'association', 'c4'],
  ['CMP-MDM', 'realization', 's1'], ['CMP-MDM', 'serving', 'pr1'], ...['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].map((d) => ['CMP-MDM', 'access', d]),
  ['CMP-MDM', 'assignment', 'i1'], ['CMP-MDM', 'association', 'c1'], ['CMP-MDM', 'association', 'c2'],
  ['CMP-GOV', 'realization', 's2'], ['CMP-GOV', 'realization', 's6'], ['CMP-GOV', 'serving', 'pr2'], ['CMP-GOV', 'serving', 'pr3'],
  ['CMP-GOV', 'access', 'd7'], ['CMP-GOV', 'access', 'd1'], ['CMP-GOV', 'access', 'd11'], ['CMP-GOV', 'assignment', 'i1'], ['CMP-GOV', 'association', 'c3'], ['CMP-GOV', 'association', 'c4'],
  ['CMP-PDP', 'realization', 's5'], ['CMP-PDP', 'serving', 'pr7'], ['CMP-PDP', 'access', 'd9'], ['CMP-PDP', 'access', 'd10'], ['CMP-PDP', 'access', 'd1'],
  ['CMP-PDP', 'assignment', 'i1'], ['CMP-PDP', 'association', 'c1'], ['CMP-PDP', 'association', 'c4'],
  ['CMP-IAM', 'realization', 's4'], ['CMP-IAM', 'serving', 'pr6'], ['CMP-IAM', 'access', 'd8'], ['CMP-IAM', 'assignment', 'i3'], ['CMP-IAM', 'assignment', 'i1'],
  ['CMP-IAM', 'association', 'c5'], ['CMP-IAM', 'association', 'c2'], ['CMP-IAM', 'serving', 'BASE-SET'],
  ['CMP-DIST', 'realization', 's3'], ['CMP-DIST', 'serving', 'pr4'], ['CMP-DIST', 'serving', 'pr5'], ...['d1', 'd2', 'd3', 'd4'].map((d) => ['CMP-DIST', 'access', d]),
  ['CMP-DIST', 'assignment', 'i4'], ['CMP-DIST', 'assignment', 'i1'], ['CMP-DIST', 'association', 'c6'], ['CMP-DIST', 'flow', 'BASE'],
  ['CMP-KMS', 'realization', 's7'], ['CMP-KMS', 'serving', 'pr8'], ['CMP-KMS', 'access', 'd1'], ['CMP-KMS', 'access', 'd10'],
  ['CMP-KMS', 'assignment', 'i5'], ['CMP-KMS', 'association', 'c7'], ['CMP-KMS', 'association', 'c1'],
  ['s1', 'serving', 'pr1'], ['s2', 'serving', 'pr2'], ['s3', 'serving', 'pr4'], ['s4', 'serving', 'pr6'], ['s5', 'serving', 'pr7'], ['s6', 'serving', 'pr3'], ['s7', 'serving', 'pr8'],
  ['pr1', 'composition', 'pr2'], ['pr1', 'composition', 'pr3'], ['pr1', 'composition', 'pr4'], ['pr1', 'composition', 'pr5'], ['pr7', 'composition', 'pr8'],
  ['pr2', 'access', 'd7'], ['pr3', 'access', 'd1'], ['pr4', 'access', 'd1'], ['pr5', 'access', 'd4'], ['pr6', 'access', 'd8'], ['pr7', 'access', 'd9'], ['pr8', 'access', 'd10'],
];
const ADRS = [
  { adrCode: 'CMP-ADR-001', title: 'SEDDI CMP sumber tunggal data induk; konsumen membaca replika ref.*',
    context: 'Setiap platform KEIS (EAP, BASE, STRIDE, SVP) membutuhkan party, organisasi, pegawai, produk dan bagan akun yang konsisten.',
    decision: 'Data induk hanya ditulis di SEDDI CMP lewat change request maker-checker. Konsumen menerima replika baca-saja ref.* lewat publikasi pub_cmp_ref (kolom terbatas) dan TIDAK membuat tabel master lokal (aturan M1).',
    consequences: 'Satu golden record; perubahan skema publikasi wajib diselaraskan konsumen (gerbang cross_check_consumers). Konsumen bergantung pada ketersediaan replikasi.',
    links: [['application', 'CMP'], ['application', 'CMP-DIST'], ['data_entity', 'd1'], ['service', 's3']] },
  { adrCode: 'CMP-ADR-002', title: 'PII dienkripsi pgcrypto dengan pencarian HMAC; kunci di Vault',
    context: 'UU 27/2022 mewajibkan pelindungan data pribadi; data party/pegawai memuat NIK, NPWP, telepon, surel.',
    decision: 'Kolom PII disimpan terenkripsi (pgcrypto) dan dicari lewat HMAC. Kunci hanya dipasang per transaksi (app.pii_key) dan dikelola di Vault (CMP-KMS); reveal/anonimisasi lewat fungsi definer dengan peran sesi pii_officer.',
    consequences: 'Pencarian teks bebas atas PII tidak mungkin; rotasi kunci butuh proses re-enkripsi berversi.',
    links: [['application', 'CMP-PDP'], ['application', 'CMP-KMS'], ['control', 'c1'], ['control', 'c7']] },
  { adrCode: 'CMP-ADR-003', title: 'IAM terpusat KEIS di CMP (skema iam), klaim per workspace',
    context: 'Peran pengguna lintas platform (PULSE, FORTRESS, AEGIS, INTEGRA, STRIDE) perlu satu konsol dan satu jejak audit.',
    decision: 'Penugasan peran disimpan di CMP (skema iam, bukan set — ADR-CMP-001) dan dibaca platform lewat iam.workspace_claims oleh login khusus klaim; Keycloak hanya otentikasi.',
    consequences: 'Platform tidak menyimpan peran sendiri; pemisahan tugas ditegakkan sekali di CMP.',
    links: [['application', 'CMP-IAM'], ['service', 's4'], ['control', 'c5']] },
];

// ---------------------------------------------------------------- helpers per jenis objek
const PATH = { process: 'processes', data_entity: 'data-entities', service: 'services', infra_asset: 'infra-assets', control: 'controls', framework: 'frameworks' };
const DOMAIN = { process: 'proses_bisnis', data_entity: 'data', service: 'layanan', infra_asset: 'infrastruktur', control: 'keamanan', application: 'aplikasi' };
const NAME = { process: 'nama', data_entity: 'namaKanonikal', service: 'nama', infra_asset: 'nama', control: 'standarRujukan', framework: 'layananUtama' };

async function main() {
  log(`EAP gateway ${GW.href} (Host ${EAP_HOST}) · Keycloak ${KC.href} (Host ${KC_HOST}) · penyusun ${MAKER} · penetap ${CHECKER}`);
  await token(MAKER); await token(CHECKER);

  step('0. Entitas pemilik');
  const ent = (await get(MAKER, '/api/v1/eaw/entity-org')).data.find((e) => e.code === ENTITY_CODE);
  if (!ent) throw new Error(`entitas ${ENTITY_CODE} tidak terlihat di /eaw/entity-org`);
  const entityId = ent.id; log(`  ✓ ${ENTITY_CODE} · ${ent.name}`);

  // 1. KRA per domain → Dipublikasi (objek hanya dapat naik status bila KRA se-domain berlaku)
  step('1. Referensi arsitektur (KRA) — 6 domain');
  const kra = {};
  const refs = (await get(MAKER, '/api/v1/eaw/references')).data;
  for (const k of KRAS) {
    let r = refs.find((x) => x.kode === k.kode);
    if (r) reuse(`KRA ${k.kode}`);
    else { r = (await api(MAKER, 'POST', '/api/v1/eaw/references', { domain: k.key, kode: k.kode, nama: k.nama, deskripsi: k.deskripsi, versi: '1.0' })).body; made(`KRA ${k.kode} (${k.key})`); }
    kra[k.key] = r.id;
    await advance('reference', r.id, `KRA ${k.kode}`, r.status);
  }

  // 2. Objek domain (Draf) bertaut KRA se-domain
  const ids = {}; const status = {};
  async function ensureObj(type, spec) {
    const { key, parent, ...body } = spec;
    const all = await list(MAKER, `/api/v1/eaw/objects/${PATH[type]}?entityId=${entityId}`);
    let o = all.find((x) => x[NAME[type]] === body[NAME[type]]);
    const want = { ...body, ...(parent ? { parentId: ids[parent] } : {}), ...(type in DOMAIN ? { referensiId: kra[DOMAIN[type]] } : {}) };
    if (!o) {
      o = (await api(MAKER, 'POST', `/api/v1/eaw/objects/${PATH[type]}`, { ...want, entityId })).body; made(`${type} "${body[NAME[type]]}"`);
    } else {
      reuse(`${type} "${body[NAME[type]]}"`);
      // lengkapi tautan KRA pada objek Draf yang sudah ada (mis. entitas data BASE yang dipakai ulang)
      if (o.status === 'Draf' && type in DOMAIN && o.referensiId !== kra[DOMAIN[type]]) {
        const etag = (await api(MAKER, 'GET', `/api/v1/eaw/objects/${PATH[type]}/${o.id}`)).headers.etag;
        o = (await api(MAKER, 'PATCH', `/api/v1/eaw/objects/${PATH[type]}/${o.id}`, { referensiId: kra[DOMAIN[type]] }, { ifMatch: etag })).body;
        log(`    ↳ KRA ${DOMAIN[type]} ditautkan`);
      }
    }
    ids[key] = o.id; status[key] = o.status; return o;
  }
  step('2. Proses bisnis (Domain 1)'); for (const p of PROC) await ensureObj('process', p);
  step('3. Entitas data (Domain 2)'); for (const d of DATA) await ensureObj('data_entity', d);
  step('4. Layanan enterprise (Domain 3)'); for (const s of SVC) await ensureObj('service', s);
  step('5. Aset infrastruktur (Domain 5)'); for (const i of INFRA) await ensureObj('infra_asset', i);
  step('6. Kontrol keamanan (Domain 6)'); for (const c of CTRL) await ensureObj('control', c);
  step('7. Kerangka kerja (6 domain)');
  await ensureObj('framework', { key: 'fw', layananUtama: 'SEDDI CMP — Data Induk Terpusat Grup', tipe: 'utama' });

  // 3. Aplikasi: platform (adopsi) + workspace (adopsi; CMP-KMS lewat tiket ARB)
  step('8. Platform & workspace (Domain 4)');
  const apps = Object.fromEntries((await list(MAKER, '/api/v1/eaw/applications')).map((a) => [a.kode, a]));
  const appIds = {}; const appStatus = {};
  for (const k of ['BASE', 'BASE-SET']) { if (apps[k]) { appIds[k] = apps[k].id; } else log(`  ! ${k} belum terdaftar — relasi ke ${k} dilewati`); }
  async function ensureApp(def) {
    const { viaArb, ...body } = def;
    let a = apps[body.kode];
    if (a) reuse(`aplikasi ${body.kode}`);
    else {
      a = (await api(MAKER, 'POST', '/api/v1/eaw/applications', { ...body, referensiId: kra.aplikasi, entityId })).body; made(`aplikasi ${body.kode} (${a.jenisNode})`);
    }
    if (a.status === 'Draf' && a.referensiId !== kra.aplikasi) {
      const etag = (await api(MAKER, 'GET', `/api/v1/eaw/applications/${a.id}`)).headers.etag;
      a = (await api(MAKER, 'PATCH', `/api/v1/eaw/applications/${a.id}`, { referensiId: kra.aplikasi }, { ifMatch: etag })).body;
    }
    appIds[body.kode] = a.id; appStatus[body.kode] = a.status; return a;
  }
  await ensureApp(PLATFORM);
  for (const w of WS.filter((x) => !x.viaArb)) await ensureApp({ ...w, platform: 'CMP', adopsi: true });   // sudah beroperasi sebelum EAP

  step('9. Tiket ARB untuk workspace baru CMP-KMS (empat mata)');
  const kms = WS.find((x) => x.viaArb);
  const INIT = 'CMP-KMS — Integrasi Vault untuk kunci enkripsi PII';
  let t = (await list(MAKER, `/api/v1/gov/arb/clearances?entityId=${entityId}`)).find((x) => x.initiativeName === INIT);
  if (!apps[kms.kode]) {
    if (!t) {
      const sc = (await api(MAKER, 'POST', '/api/v1/gov/arb/clearances/screen', { initiativeName: INIT, businessCase: 'Kunci PII CMP kini dari variabel lingkungan; dipindah ke Vault Transit dengan rotasi berkala (ADR CMP-ADR-002).' })).body;
      log(`  · pre-screening: skor kemiripan ${sc.score}/100 (ambang ${sc.threshold}), pelanggaran M1: ${sc.violations.length}`);
      t = (await api(MAKER, 'POST', '/api/v1/gov/arb/clearances', { entityId, initiativeName: INIT, estimatedCost: 150000000,
        businessCase: 'Kunci enkripsi PII SEDDI CMP saat ini dipasang dari variabel lingkungan. Inisiatif ini memindahkannya ke HashiCorp Vault (Transit + KV) dengan rotasi berkala dan jejak akses, sesuai UU PDP dan CMP-ADR-002.' })).body;
      made(`tiket ARB ${t.ticketNumber} (SUBMITTED)`);
    } else reuse(`tiket ARB ${t.ticketNumber} (${t.status})`);
    if (t.status === 'SUBMITTED') { t = (await api(CHECKER, 'POST', `/api/v1/gov/arb/clearances/${t.id}/transition`, { to: 'IN_REVIEW', notes: 'Ditinjau ARB: selaras KRA-SEC-PDP.' })).body.ticket; log('  ✓ IN_REVIEW oleh Ketua ARB'); }
    if (t.status === 'IN_REVIEW') { t = (await api(CHECKER, 'POST', `/api/v1/gov/arb/clearances/${t.id}/transition`, { to: 'APPROVED', notes: 'Disetujui: tidak duplikatif, tidak membuat master lokal, mendukung UU PDP.' })).body.ticket; log(`  ✓ APPROVED · sertifikat ${t.certificateId}`); }
    if (t.status !== 'APPROVED') throw new Error(`tiket ARB ${t.ticketNumber} berstatus ${t.status} — tangani manual`);
  }
  await ensureApp({ ...kms, platform: 'CMP', ...(t ? { arbClearanceId: t.id } : {}) });

  // 4. Relasi (selagi sumber masih Draf), ditandai ke kerangka kerja
  step('10. Relasi wajib & lineage (ditandai ke kerangka kerja)');
  const ref = (k) => k.startsWith('CMP') || k.startsWith('BASE') ? ['application', appIds[k]]
    : [{ pr: 'process', d: 'data_entity', s: 'service', i: 'infra_asset', c: 'control' }[k.match(/^[a-z]+/)[0]], ids[k]];
  const srcState = (k) => (k.startsWith('CMP') || k.startsWith('BASE') ? appStatus[k] : status[k]);
  const relCache = new Map();
  let relNew = 0, relOld = 0, relSkip = 0;
  for (const [s, tipe, tg] of REL) {
    const [st, sid] = ref(s); const [tt, tid] = ref(tg);
    if (!sid || !tid) { relSkip++; continue; }
    if (!relCache.has(sid)) relCache.set(sid, await list(MAKER, `/api/v1/eaw/relations?objekType=${st}&objekId=${sid}`));
    if (relCache.get(sid).some((r) => r.sumberId === sid && r.targetId === tid && r.tipe === tipe)) { relOld++; continue; }
    if (srcState(s) !== 'Draf') { relSkip++; log(`  ! ${s} -${tipe}→ ${tg} dilewati: sumber sudah ${srcState(s)}`); continue; }
    const r = (await api(MAKER, 'POST', '/api/v1/eaw/relations', { sumberType: st, sumberId: sid, targetType: tt, targetId: tid, tipe, kerangkaId: ids.fw })).body;
    relCache.get(sid).push(r); relNew++;
  }
  stats.created += relNew; stats.reused += relOld;
  log(`  ✓ relasi: ${relNew} baru, ${relOld} sudah ada${relSkip ? `, ${relSkip} dilewati` : ''}`);

  // 5. Kesiapan EAW-05 sebelum validasi
  step('11. Kesiapan relasi wajib (EAW-05)');
  for (const k of ['CMP', ...WS.map((w) => w.kode)]) {
    const r = await get(MAKER, `/api/v1/eaw/readiness/application/${appIds[k]}`);
    log(`  ${r.ready ? '✓' : '✗'} ${k}: ${r.rules.map((x) => `${x.rule} ${x.n}`).join(' · ')}`);
    if (!r.ready && r.status === 'Draf') throw new Error(`${k} belum siap divalidasi`);
  }

  // 6. AF-05: objek domain → Dipublikasi; platform dulu, lalu workspace (workspace tidak boleh melampaui platform)
  step('12. Alur AF-05: Draf → Divalidasi → Ditetapkan → Dipublikasi');
  for (const group of [PROC, DATA, SVC, INFRA, CTRL]) {
    const type = { pr: 'process', d: 'data_entity', s: 'service', i: 'infra_asset', c: 'control' }[group[0].key.match(/^[a-z]+/)[0]];
    for (const o of group) await advance(type, ids[o.key], `${type} ${o[NAME[type]] ?? o.nama}`, status[o.key]);
  }
  await advance('application', appIds.CMP, 'platform CMP', appStatus.CMP);
  for (const w of WS) await advance('application', appIds[w.kode], `workspace ${w.kode}`, appStatus[w.kode]);
  await advance('framework', ids.fw, 'kerangka kerja SEDDI CMP', status.fw);

  // 7. ADR: Proposed (penyusun) → tautan objek → Accepted (Ketua ARB)
  step('13. Keputusan arsitektur (ADR)');
  const keyRef = (t, k) => (t === 'application' ? appIds[k] : ids[k]);
  for (const a of ADRS) {
    const { links, ...body } = a;
    let adr = (await api(MAKER, 'GET', `/api/v1/eaw/adrs/${a.adrCode}`, undefined, { ok: [200, 404] })).body;
    if (adr?.id) reuse(`ADR ${a.adrCode} (${adr.status})`);
    else { adr = (await api(MAKER, 'POST', '/api/v1/eaw/adrs', body)).body; made(`ADR ${a.adrCode}`); }
    const have = await get(MAKER, `/api/v1/eaw/adrs/${adr.id}/links`);
    const haveIds = new Set((Array.isArray(have) ? have : have.data ?? []).map((l) => l.objek_id ?? l.objekId));   // endpoint ini mengembalikan kolom snake_case
    for (const [t2, k] of links) if (!haveIds.has(keyRef(t2, k))) await api(MAKER, 'POST', `/api/v1/eaw/adrs/${adr.id}/links`, { objekType: t2, objekId: keyRef(t2, k) });
    if (adr.status === 'Proposed') { await api(CHECKER, 'POST', `/api/v1/eaw/adrs/${adr.id}/status`, { status: 'Accepted' }); log(`  ✓ ${a.adrCode} Accepted oleh Ketua ARB`); }
  }

  // 8. Diagram konteks (objek terikat) + ekspor tervalidasi XSD
  step('14. Diagram konteks ArchiMate');
  const DNAME = 'Konteks SEDDI CMP';
  let dg = (await get(MAKER, `/api/v1/eaw/diagrams?entityId=${entityId}`)).data.find((x) => x.nama === DNAME);
  if (dg) reuse(`diagram "${DNAME}"`);
  else { dg = (await api(MAKER, 'POST', '/api/v1/eaw/diagrams', { entityId, nama: DNAME, frameworkId: ids.fw, content: { nodes: [], edges: [] } })).body; made(`diagram "${DNAME}"`); }
  const dget = await api(MAKER, 'GET', `/api/v1/eaw/diagrams/${dg.id}`);
  if (!(dget.body.content?.nodes ?? []).length) {
    const imp = await api(MAKER, 'POST', `/api/v1/eaw/diagrams/${dg.id}/import`, { objectType: 'application', objectId: appIds.CMP }, { ifMatch: dget.headers.etag });
    log(`  ✓ impor objek CMP + relasinya: ${imp.body.added ?? imp.body.content?.nodes?.length ?? '?'} node`);
  } else log(`  · diagram sudah berisi ${dget.body.content.nodes.length} node`);
  const ex = await raw(GW, EAP_HOST, 'GET', `/api/v1/eaw/diagrams/${dg.id}/exchange`, { headers: { Authorization: `Bearer ${await token(MAKER)}` } });
  log(`  ✓ ekspor Open Group Exchange: HTTP ${ex.status} · X-ArchiMate-XSD: ${ex.headers['x-archimate-xsd'] ?? '-'}`);

  // 9. Master IT Roadmap (tingkat grup)
  step('15. Master IT Roadmap');
  const PH = { nama: 'SEDDI CMP — Penguatan 2026/27', mulai: '2026-07-01', selesai: '2027-06-30', deskripsi: 'Penguatan platform data induk: SPA baru, sinkron HRIS otomatis, katalog EAP, integrasi Vault.' };
  const rm = await get(MAKER, '/api/v1/eaw/roadmap');
  let ph = rm.phases.find((p) => p.nama === PH.nama);
  if (ph) reuse(`fase "${PH.nama}"`); else { ph = (await api(MAKER, 'POST', '/api/v1/eaw/roadmap/phases', PH)).body; ph.items = []; made(`fase "${PH.nama}"`); }
  const ITEMS = [
    { jenis: 'deliverable', judul: 'Admin SPA cmp/web (Next.js) menggantikan cmp/admin', target: '2026-11-12', status: 'selesai', objectType: 'application', objectId: appIds.CMP },
    { jenis: 'deliverable', judul: 'Sinkron HRIS PULSE → CMP otomatis (hire, rehire, mutasi)', target: '2026-11-06', status: 'selesai', objectType: 'process', objectId: ids.pr5 },
    { jenis: 'milestone', judul: 'Seluruh workspace SEDDI CMP Dipublikasi di katalog EAP', target: '2026-11-13', status: 'selesai', objectType: 'framework', objectId: ids.fw },
    { jenis: 'deliverable', judul: 'Integrasi Vault untuk kunci PII (CMP-KMS)', target: '2027-03-31', status: 'direncanakan', objectType: 'application', objectId: appIds['CMP-KMS'] },
  ];
  for (const it of ITEMS) {
    if ((ph.items ?? []).some((x) => x.judul === it.judul)) { reuse(`butir "${it.judul}"`); continue; }
    await api(MAKER, 'POST', '/api/v1/eaw/roadmap/items', { phaseId: ph.id, ...it }); made(`butir "${it.judul}" (${it.status})`);
  }

  // 10. Penerbitan dokumen baseline kerangka kerja (versi baru hanya bila belum ada)
  step('16. Penerbitan dokumen baseline');
  const pubs = (await get(MAKER, `/api/v1/eaw/publications?scopeKey=${ids.fw}`)).data;
  if (pubs.length) reuse(`dokumen kerangka kerja v${pubs[0].version ?? pubs[0].versi ?? '?'}`);
  else { const p = (await api(MAKER, 'POST', '/api/v1/eaw/publications', { scopeType: 'framework', frameworkId: ids.fw, format: 'html' })).body; made(`dokumen HTML kerangka kerja (versi ${p.version ?? p.versi ?? 1}, sha256 ${String(p.sha256 ?? '').slice(0, 12)}…)`); }

  // 11. Bukti: analisis dampak + kembali ke CMP
  step('17. Bukti ujung ke ujung');
  const imp = await get(MAKER, `/api/v1/eaw/impact?objectType=data_entity&objectId=${ids.d1}&direction=impact&maxDepth=3`);
  log(`  ✓ analisis dampak "Party (golden record)": ${(imp.nodes ?? []).length} objek bergantung (hingga 3 tingkat)`);
  if (process.env.SKIP_CMP_CHECK !== '1') {
    const codes = ['CMP', ...WS.map((w) => w.kode)];
    let rows = [];
    for (let i = 0; i < 30; i++) {
      const [bin, ...pre] = PG_EXEC.split(/\s+/).filter(Boolean);              // tanpa shell: argumen sebagai array
      const sql = `select code||'|'||application_kind||'|'||lifecycle_status from ref.applications where code = any('{${codes.join(',')}}'::text[]) and deleted_at is null order by code`;
      const out = execFileSync(bin, [...pre, 'psql', '-X', '-tA', '-U', 'postgres', '-d', 'kalla_cmp', '-c', sql], { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
      rows = out.replace(/\r/g, '').split('\n').filter(Boolean);
      if (rows.length === codes.length) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    log(`  ${rows.length === codes.length ? '✓' : '✗'} kalla_cmp.ref.applications memuat ${rows.length}/${codes.length} aplikasi CMP (replikasi pub_eap_ref):`);
    rows.forEach((r) => log(`      ${r}`));
    if (rows.length !== codes.length) process.exitCode = 1;
  }
  log(`\nSelesai: ${stats.created} dibuat, ${stats.reused} dipakai ulang, ${stats.transitions} transisi AF-05.`);
}

main().catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
