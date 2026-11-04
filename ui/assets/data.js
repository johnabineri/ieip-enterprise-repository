/* SAORAJA EAP — data mock (selaras PRD/SAF/SRS V3.0). Tidak ada PII di objek EAP (D-14):
   profil tampilan berasal dari replika ref.users. */
window.DB = (function () {
  const STATUS = ['Draf', 'Divalidasi', 'Ditetapkan', 'Dipublikasi', 'Direviu'];
  const DOMAINS = [
    { id: 'proses_bisnis', n: 1, nama: 'Proses Bisnis', color: 'var(--d1)', layer: 'Business Layer' },
    { id: 'data', n: 2, nama: 'Data & Informasi', color: 'var(--d2)', layer: 'Business & Application (data object)' },
    { id: 'layanan', n: 3, nama: 'Layanan Enterprise', color: 'var(--d3)', layer: 'Business Layer' },
    { id: 'aplikasi', n: 4, nama: 'Aplikasi & Integrasi', color: 'var(--d4)', layer: 'Application Layer' },
    { id: 'infrastruktur', n: 5, nama: 'Infrastruktur & Teknologi', color: 'var(--d5)', layer: 'Technology Layer' },
    { id: 'keamanan', n: 6, nama: 'Keamanan Informasi', color: 'var(--d6)', layer: 'Cross-cutting' },
  ];

  // eaw.entity_org = VIEW atas ref.business_groups (ADR-CMP-003) + eaw.entity_org_metadata
  const ENTITIES = [
    { id: 'KALLA', nama: 'PT Kalla Group (Holding)', tingkat: 'holding', parent: null, ika: 3.4, target: 3 },
    { id: 'KAUTO', nama: 'Kalla Automotive', tingkat: 'ecosystem', parent: 'KALLA', ika: 3.1, target: 3 },
    { id: 'KCON', nama: 'Kalla Construction & Industry', tingkat: 'ecosystem', parent: 'KALLA', ika: 2.4, target: 3 },
    { id: 'KTRANS', nama: 'Kalla Transport & Logistics', tingkat: 'ecosystem', parent: 'KALLA', ika: 1.8, target: 2 },
    { id: 'KLAND', nama: 'Kalla Land & Property', tingkat: 'ecosystem', parent: 'KALLA', ika: 1.6, target: 2 },
    { id: 'HK', nama: 'PT Hadji Kalla', tingkat: 'sbu', parent: 'KAUTO', ika: 2.9, target: 2 },
    { id: 'BSU', nama: 'PT Bumi Sarana Utama', tingkat: 'sbu', parent: 'KCON', ika: 2.3, target: 2 },
    { id: 'BSB', nama: 'PT Bumi Sarana Beton', tingkat: 'sbu', parent: 'KCON', ika: 1.4, target: 2 },
    { id: 'BK', nama: 'PT Bumi Karsa', tingkat: 'sbu', parent: 'KCON', ika: 1.7, target: 2 },
    { id: 'BLT', nama: 'PT Bumi Lintas Tama', tingkat: 'sbu', parent: 'KTRANS', ika: 1.2, target: 2 },
    { id: 'BJU', nama: 'PT Bumi Jasa Utama', tingkat: 'sbu', parent: 'KTRANS', ika: 1.5, target: 2 },
    { id: 'BLU', nama: 'PT Bumi Logistik Utama', tingkat: 'sbu', parent: 'KTRANS', ika: 1.3, target: 2 },
    { id: 'CBP', nama: 'Cahaya Bone PO', tingkat: 'sbu', parent: 'KTRANS', ika: 1.0, target: 2 },
    { id: 'BAD', nama: 'PT Baruga Asrinusa Development', tingkat: 'sbu', parent: 'KLAND', ika: 1.4, target: 2 },
    { id: 'HK-MKS', nama: 'Cabang Toyota Urip Sumoharjo', tingkat: 'unit', parent: 'HK', ika: 2.2, target: 2 },
    { id: 'BSU-TRM', nama: 'Terminal Aspal Curah Bitung', tingkat: 'unit', parent: 'BSU', ika: 1.9, target: 2 },
  ];

  // IKA per entitas × domain (skala 1–5)
  const IKA_DOMAIN = {
    KALLA: [3.8, 3.6, 3.2, 3.9, 3.1, 3.0],
    KAUTO: [3.4, 3.2, 3.0, 3.5, 2.8, 2.7],
    HK:    [3.2, 3.0, 2.9, 3.3, 2.6, 2.5],
    KCON:  [2.6, 2.5, 2.2, 2.8, 2.1, 2.2],
    BSU:   [2.5, 2.3, 2.1, 2.7, 2.0, 2.1],
    BK:    [1.9, 1.7, 1.6, 2.0, 1.5, 1.5],
    KTRANS:[2.0, 1.8, 1.7, 2.1, 1.6, 1.6],
    BJU:   [1.7, 1.5, 1.4, 1.8, 1.3, 1.3],
    KLAND: [1.8, 1.6, 1.5, 1.8, 1.4, 1.4],
  };
  const IKA_TREND = [
    { p: 'Jun', v: 1.0 }, { p: 'Jul', v: 1.3 }, { p: 'Agu', v: 1.7 }, { p: 'Sep', v: 2.1 }, { p: 'Okt', v: 2.4 }, { p: 'Nov', v: 2.6 },
  ];

  const A = (o) => Object.assign({ jenis: 'umum', mode: 'FEDERATED_REMOTE', lifecycle: 'active', krit: 'high', ai: 'low', status: 'Ditetapkan', entity: 'KALLA', rel: { layanan: 1, proses: 1, data: 1, infra: 1, kontrol: 1, kra: true } }, o);
  const APPS = [
    A({ kode: 'SAORAJA-EAP', nama: 'Enterprise Architecture Platform', platform: '—', ws: '—', mode: 'INTERNAL_ROUTED', status: 'Dipublikasi', krit: 'critical', ai: 'medium', ob: 'Chief Enterprise Architect', ot: 'Tim Platform EAP', slo: '99,90% / p95 ≤ 400ms', repo: 'git.kalla/eap', scope: '—', db: 'kalla_eap' }),
    A({ kode: 'EAW', nama: 'Enterprise Architecture Workbench', platform: 'SAORAJA-EAP', ws: 'EAW', status: 'Dipublikasi', ob: 'Chief Enterprise Architect', ot: 'Tim Platform EAP', slo: '99,90%', repo: 'git.kalla/eap', scope: 'saoraja_eaw', db: 'kalla_eap.eaw' }),
    A({ kode: 'GSE', nama: 'Generative Software Engineering', platform: 'SAORAJA-EAP', ws: 'GSE', status: 'Dipublikasi', ai: 'high', ob: 'Chief Enterprise Architect', ot: 'Tim Platform EAP', slo: 'Scaffold ≤ 45 dtk', repo: 'git.kalla/eap', scope: 'saoraja_gse', db: 'kalla_eap.gse' }),
    A({ kode: 'REQ', nama: 'Requirement Elicitation Assistant', platform: 'SAORAJA-EAP', ws: 'REQ', status: 'Ditetapkan', ai: 'high', krit: 'medium', ob: 'Head of Business Analysis', ot: 'Tim AI Platform', slo: 'TTFT ≤ 800ms', repo: 'git.kalla/eap', scope: 'saoraja_req', db: 'stateless' }),
    A({ kode: 'CONSOLE', nama: 'Enterprise Control Console', platform: 'SAORAJA-EAP', ws: 'CONSOLE', status: 'Ditetapkan', ai: 'medium', ob: 'CIO', ot: 'Tim Platform EAP', slo: '99,90%', repo: 'git.kalla/eap', scope: 'saoraja_console', db: 'kalla_eap.console' }),
    A({ kode: 'SEDDI-CMP', nama: 'Corporate Master Platform', platform: '—', ws: '—', mode: 'INTERNAL_ROUTED', status: 'Ditetapkan', krit: 'critical', ob: 'Chief Data Officer', ot: 'Tim Platform SEDDI', slo: '99,95%', repo: 'git.kalla/cmp', scope: '—', db: 'kalla_cmp' }),
    A({ kode: 'PANRITA-OLP', nama: 'Omni Load Platform (FLUX ETL)', platform: '—', ws: 'FLUX', status: 'Divalidasi', lifecycle: 'planned', ob: 'Chief Data Officer', ot: 'Tim Data Engineering', slo: 'Batch ≤ 2 jam', repo: 'git.kalla/olp', scope: 'panrita_olp_flux', db: 'kalla_olp.flux' }),
    A({ kode: 'PANRITA-SSP', nama: 'Self Services Platform (ESS)', platform: '—', ws: 'ESS', status: 'Divalidasi', lifecycle: 'planned', ob: 'Direktur SDM', ot: 'Tim HR Tech', slo: '99,50%', repo: 'git.kalla/ssp', scope: 'panrita_ssp_ess', db: '— (baca kalla_base)' }),
    A({ kode: 'PULSE', nama: 'HRMS PULSE', platform: 'PANRITA-BASE', ws: 'PULSE', status: 'Ditetapkan', lifecycle: 'planned', ob: 'Direktur SDM', ot: 'Tim HR Tech', slo: '99,50%', repo: 'git.kalla/base', scope: 'panrita_base_pulse', db: 'kalla_base.pulse' }),
    A({ kode: 'AEGIS', nama: 'Risk Management AEGIS', platform: 'PANRITA-BASE', ws: 'AEGIS', mode: 'INTERNAL_ROUTED', status: 'Draf', lifecycle: 'planned', krit: 'medium', ob: 'Chief Risk Officer', ot: 'Tim GRC Tech', slo: '—', repo: 'git.kalla/base', scope: '—', db: 'kalla_base.aegis', rel: { layanan: 1, proses: 0, data: 1, infra: 0, kontrol: 0, kra: false } }),
    A({ kode: 'OPTIMA', nama: 'Asset Management OPTIMA', platform: 'PANRITA-BASE', ws: 'OPTIMA', mode: 'INTERNAL_ROUTED', status: 'Draf', lifecycle: 'planned', krit: 'medium', ob: 'Head of ICT', ot: 'Tim ICT Ops', slo: '99,00%', repo: 'git.kalla/base', scope: '—', db: 'kalla_base.optima', rel: { layanan: 1, proses: 1, data: 1, infra: 1, kontrol: 0, kra: true } }),
    A({ kode: 'FORGE', nama: 'CRM FORGE', platform: 'PANRITA-B-LINK', ws: 'FORGE', status: 'Divalidasi', lifecycle: 'planned', ai: 'medium', ob: 'Direktur Komersial', ot: 'Tim CRM', slo: '99,50%', repo: 'git.kalla/blink', scope: 'panrita_blink_forge', db: 'kalla_blink.forge' }),
    A({ kode: 'VANTAGE', nama: 'Vendor Management VANTAGE', platform: 'PANRITA-B-LINK', ws: 'VANTAGE', status: 'Divalidasi', lifecycle: 'planned', ob: 'Kepala Pengadaan Grup', ot: 'Tim Procurement Tech', slo: '99,50%', repo: 'git.kalla/blink', scope: 'panrita_blink_vantage', db: 'kalla_blink.vantage' }),
    A({ kode: 'CORE', nama: 'Financial Consolidation CORE', platform: 'PANRITA-SVP', ws: 'CORE', status: 'Draf', lifecycle: 'planned', krit: 'critical', ob: 'CFO Grup', ot: 'Tim Finance Tech', slo: '99,50%', repo: 'git.kalla/svp', scope: 'panrita_svp_core', db: 'kalla_svp.core', rel: { layanan: 1, proses: 1, data: 2, infra: 0, kontrol: 1, kra: true } }),
    A({ kode: 'VANGUARD', nama: 'Executive Dashboard VANGUARD', platform: 'PANRITA-SVP', ws: 'VANGUARD', status: 'Draf', lifecycle: 'planned', krit: 'medium', ob: 'Direktur Strategi', ot: 'Tim BI', slo: '—', repo: 'git.kalla/svp', scope: 'panrita_svp_vanguard', db: 'kalla_svp.vanguard', rel: { layanan: 0, proses: 0, data: 0, infra: 0, kontrol: 0, kra: false } }),
    A({ kode: 'ASI', nama: 'Dealer Management (Sales) ASI', platform: 'PANRITA-STRIDE-Hk', ws: 'ASI', jenis: 'khusus', status: 'Divalidasi', lifecycle: 'planned', entity: 'HK', ob: 'Direktur Penjualan HK', ot: 'Tim IT Hadji Kalla', slo: '99,50%', repo: 'git.kalla/stride-hk', scope: 'panrita_stride_hk_asi', db: 'kalla_stride_hk.asi' }),
    A({ kode: 'ASM', nama: 'Service & Parts ASM', platform: 'PANRITA-STRIDE-Hk', ws: 'ASM', jenis: 'khusus', status: 'Draf', lifecycle: 'planned', entity: 'HK', ob: 'Direktur After-Sales HK', ot: 'Tim IT Hadji Kalla', slo: '99,50%', repo: 'git.kalla/stride-hk', scope: 'panrita_stride_hk_asm', db: 'kalla_stride_hk.asm', rel: { layanan: 1, proses: 2, data: 2, infra: 1, kontrol: 1, kra: true } }),
    A({ kode: 'AV', nama: 'Aspal Curah AV', platform: 'PANRITA-STRIDE-Bsu', ws: 'AV', jenis: 'khusus', mode: 'INTERNAL_ROUTED', status: 'Draf', lifecycle: 'planned', entity: 'BSU', krit: 'medium', ob: 'GM Aspal Curah BSU', ot: 'Tim IT BSU', slo: '99,00%', repo: 'git.kalla/stride-bsu', scope: '—', db: 'kalla_stride_bsu.av', rel: { layanan: 1, proses: 1, data: 0, infra: 1, kontrol: 0, kra: true } }),
    A({ kode: 'AEPS', nama: 'Aspal Emulsi Production AEPS', platform: 'PANRITA-STRIDE-Bsu', ws: 'AEPS', jenis: 'khusus', status: 'Draf', lifecycle: 'planned', entity: 'BSU', ob: 'GM Pabrik Emulsi BSU', ot: 'Tim IT BSU', slo: '99,00%', repo: 'git.kalla/stride-bsu', scope: 'panrita_stride_bsu_aeps', db: 'kalla_stride_bsu.aeps', rel: { layanan: 1, proses: 1, data: 1, infra: 1, kontrol: 1, kra: false } }),
  ];

  const PROCESSES = [
    { id: 'L0-1', nama: 'Manajemen Permodalan & Portofolio Bisnis', level: 0, owner: 'Direktur Utama', entity: 'KALLA', status: 'Ditetapkan', kids: [] },
    { id: 'L0-2', nama: 'Pengawasan GRC & Audit Internal', level: 0, owner: 'Kepala Audit Internal', entity: 'KALLA', status: 'Ditetapkan', kids: [] },
    { id: 'L0-3', nama: 'Corporate Shared Services (SDM, Legal, IT, Finance)', level: 0, owner: 'Direktur Shared Services', entity: 'KALLA', status: 'Dipublikasi', kids: [
      { id: 'L1-SS1', nama: 'Rekrutmen hingga Purna Tugas (Hire-to-Retire)', level: 1, owner: 'Direktur SDM', entity: 'KALLA', status: 'Ditetapkan', input: 'Permintaan tenaga kerja', output: 'Karyawan aktif (NIK korporat)', kids: [
        { id: 'L2-SS11', nama: 'Mutasi & Promosi Karyawan', level: 2, owner: 'Kepala HR Ops', entity: 'KALLA', status: 'Divalidasi', input: 'SK mutasi', output: 'Event cmp.workforce.employee_mutated', kids: [
          { id: 'L3-SS111', nama: 'Sinkronisasi hak akses RBAC lintas platform', level: 3, owner: 'Admin IAM', entity: 'KALLA', status: 'Draf', input: 'Webhook employee-sync', output: 'set.user_roles terbaru', kids: [] },
        ] },
      ] },
      { id: 'L1-SS2', nama: 'Pengadaan Bersama (Procure-to-Pay)', level: 1, owner: 'Kepala Pengadaan Grup', entity: 'KALLA', status: 'Divalidasi', input: 'Purchase requisition', output: 'Pembayaran vendor', kids: [] },
    ] },
    { id: 'L0-4', nama: 'Rantai Nilai Otomotif (Hadji Kalla)', level: 0, owner: 'CEO Kalla Automotive', entity: 'KAUTO', status: 'Ditetapkan', kids: [
      { id: 'L1-HK1', nama: 'Penjualan Mobil Baru', level: 1, owner: 'Direktur Penjualan HK', entity: 'HK', status: 'Ditetapkan', input: 'Prospek pelanggan', output: 'Unit terkirim + faktur', kids: [
        { id: 'L2-HK11', nama: 'Booking & SPK Kendaraan', level: 2, owner: 'Sales Manager Cabang', entity: 'HK', status: 'Ditetapkan', input: 'Data prospek (Party PRT-)', output: 'SPK', kids: [
          { id: 'L3-HK111', nama: 'Verifikasi identitas pelanggan via SEDDI', level: 3, owner: 'Admin Sales', entity: 'HK', status: 'Divalidasi', input: 'Party ID', output: 'Status KYC', kids: [] },
        ] },
        { id: 'L2-HK12', nama: 'Trade-In Kendaraan Bekas', level: 2, owner: 'Kepala Used Car', entity: 'HK', status: 'Draf', kids: [] },
      ] },
      { id: 'L1-HK2', nama: 'Servis & Suku Cadang', level: 1, owner: 'Direktur After-Sales HK', entity: 'HK', status: 'Divalidasi', kids: [] },
      { id: 'L1-HK3', nama: 'Body & Paint', level: 1, owner: 'Kepala Bengkel BP', entity: 'HK', status: 'Draf', kids: [] },
    ] },
    { id: 'L0-5', nama: 'Rantai Nilai Manufaktur Aspal (BSU)', level: 0, owner: 'CEO Kalla Construction', entity: 'KCON', status: 'Divalidasi', kids: [
      { id: 'L1-BSU1', nama: 'Impor Aspal Curah', level: 1, owner: 'GM Aspal Curah', entity: 'BSU', status: 'Divalidasi', kids: [] },
      { id: 'L1-BSU2', nama: 'Pemrosesan Emulsi (CSS-1, CRS-1)', level: 1, owner: 'GM Pabrik Emulsi', entity: 'BSU', status: 'Draf', kids: [] },
      { id: 'L1-BSU3', nama: 'Pengujian Laboratorium Mutu', level: 1, owner: 'Kepala QC Lab', entity: 'BSU', status: 'Draf', kids: [] },
      { id: 'L1-BSU4', nama: 'Distribusi & Terminal Tangki', level: 1, owner: 'Kepala Logistik BSU', entity: 'BSU', status: 'Draf', kids: [] },
    ] },
    { id: 'L0-6', nama: 'Rantai Nilai Konstruksi (Bumi Karsa)', level: 0, owner: 'Direktur Utama BK', entity: 'BK', status: 'Draf', kids: [
      { id: 'L1-BK1', nama: 'Bidding & Tender', level: 1, owner: 'Kepala Tender', entity: 'BK', status: 'Draf', kids: [] },
      { id: 'L1-BK2', nama: 'Project Execution & Handover', level: 1, owner: 'Project Director', entity: 'BK', status: 'Draf', kids: [] },
    ] },
    { id: 'L0-7', nama: 'Rantai Nilai Properti (Kalla Land)', level: 0, owner: 'CEO Kalla Land', entity: 'KLAND', status: 'Draf', kids: [] },
    { id: 'L0-8', nama: 'Rantai Nilai Transport & Logistik', level: 0, owner: 'CEO Kalla Transport', entity: 'KTRANS', status: 'Draf', kids: [] },
  ];

  const DATA_ENTITIES = [
    { nama: 'Party', dd: 'DD-01', klas: 'rahasia', pii: true, steward: 'Data Steward Party', sor: 'kalla_cmp.mdm.parties', ret: 3650, status: 'Ditetapkan', ref: 'KRA-DAT-001' },
    { nama: 'Party Identifier (NIK/NPWP/NIB)', dd: 'DD-01', klas: 'rahasia', pii: true, steward: 'Petugas PDP', sor: 'kalla_cmp.mdm.party_identifiers', ret: 3650, status: 'Ditetapkan', ref: 'KRA-DAT-001' },
    { nama: 'Customer (peran Party)', dd: 'DD-01', klas: 'terbatas', pii: true, steward: 'Data Steward Party', sor: 'kalla_cmp.mdm.party_roles', ret: 3650, status: 'Ditetapkan', ref: 'KRA-DAT-002' },
    { nama: 'Vendor (peran Party)', dd: 'DD-01', klas: 'terbatas', pii: false, steward: 'Data Steward Party', sor: 'kalla_cmp.mdm.party_roles', ret: 3650, status: 'Ditetapkan', ref: 'KRA-DAT-002' },
    { nama: 'Company / Business Group', dd: 'DD-02', klas: 'internal', pii: false, steward: 'Data Steward Organisasi', sor: 'kalla_cmp.mdm.business_groups', ret: null, status: 'Dipublikasi', ref: 'KRA-DAT-003' },
    { nama: 'Branch / Cost Center', dd: 'DD-02', klas: 'internal', pii: false, steward: 'Data Steward Organisasi', sor: 'kalla_cmp.mdm.branches', ret: null, status: 'Dipublikasi', ref: 'KRA-DAT-003' },
    { nama: 'Location (Kemendagri)', dd: 'DD-03', klas: 'publik', pii: false, steward: 'Data Steward Geografi', sor: 'kalla_cmp.mdm.locations', ret: null, status: 'Dipublikasi', ref: 'KRA-DAT-004' },
    { nama: 'Product & Price List', dd: 'DD-04', klas: 'internal', pii: false, steward: 'Data Steward Produk', sor: 'kalla_cmp.mdm.products', ret: 1825, status: 'Ditetapkan', ref: 'KRA-DAT-005' },
    { nama: 'Chart of Accounts Grup', dd: 'DD-06', klas: 'terbatas', pii: false, steward: 'Data Steward Keuangan', sor: 'kalla_cmp.mdm.coa', ret: 3650, status: 'Ditetapkan', ref: 'KRA-DAT-006' },
    { nama: 'Employee (Corporate NIK)', dd: 'DD-07', klas: 'rahasia', pii: true, steward: 'Data Steward Workforce', sor: 'kalla_cmp.mdm.employees', ret: 3650, status: 'Ditetapkan', ref: 'KRA-DAT-007' },
    { nama: 'User Identity', dd: 'DD-13', klas: 'rahasia', pii: true, steward: 'Admin IAM', sor: 'kalla_cmp.iam.users', ret: 1825, status: 'Ditetapkan', ref: 'KRA-DAT-008' },
    { nama: 'Order', dd: '—', klas: 'internal', pii: false, steward: 'Data Steward Transaksi', sor: 'kalla_stride_hk.asi.orders', ret: 3650, status: 'Divalidasi', ref: 'KRA-DAT-010' },
    { nama: 'Invoice', dd: '—', klas: 'terbatas', pii: false, steward: 'Data Steward Keuangan', sor: 'kalla_stride_hk.fia.invoices', ret: 3650, status: 'Divalidasi', ref: 'KRA-DAT-011' },
    { nama: 'Payment', dd: '—', klas: 'terbatas', pii: false, steward: 'Data Steward Keuangan', sor: 'kalla_stride_hk.fia.payments', ret: 3650, status: 'Draf', ref: 'KRA-DAT-012' },
    { nama: 'Asset TIK', dd: 'ADR-022', klas: 'internal', pii: false, steward: 'Head of ICT', sor: 'kalla_base.optima.assets', ret: 2555, status: 'Draf', ref: 'KRA-DAT-013' },
    { nama: 'Document', dd: '—', klas: 'internal', pii: false, steward: 'Arsiparis Grup', sor: 'kalla_base.archi.documents', ret: 3650, status: 'Draf', ref: null },
  ];

  const MASTER_DOMAINS = [
    { dd: 'DD-01', nama: 'Party (Golden Record)', isi: 'PRT-######## + peran customer/vendor/employee/distributor; identifier terenkripsi AES-256 + HMAC', konsumen: 'STRIDE-*, FORGE, VANTAGE', tabel: 6, pii: true },
    { dd: 'DD-02', nama: 'Organization', isi: 'companies ⊥ business_groups, org_units, branches, cost_centers', konsumen: 'Semua platform', tabel: 5, pii: false },
    { dd: 'DD-03', nama: 'Geography', isi: 'Negara → kelurahan, kode Kemendagri tervalidasi trigger', konsumen: 'Semua platform', tabel: 5, pii: false },
    { dd: 'DD-04', nama: 'Product', isi: 'products, spesifikasi bertipe kuat, price_lists berlaku-waktu', konsumen: 'ASI, ASM, AV, AEPS, CSC, FLOW', tabel: 4, pii: false },
    { dd: 'DD-06', nama: 'Financial', isi: 'COA Grup + account_mappings, kurs, pajak, bank, termin', konsumen: 'FIA, SVP/CORE, ACCORD', tabel: 6, pii: false },
    { dd: 'DD-07', nama: 'Workforce', isi: 'employees, positions, employments (Corporate NIK tunggal)', konsumen: 'PULSE, ESS, APEX, HRE', tabel: 3, pii: true },
    { dd: 'DD-13', nama: 'Identity', isi: 'iam.users, roles, permissions, sessions', konsumen: 'Semua platform (via ref.users)', tabel: 4, pii: true },
  ];

  const SERVICES = [
    { nama: 'Pengajuan Cuti & Izin', tipe: 'internal', kat: 'pendukung', pemilik: 'Direktur SDM', slo: '99,5% · respon ≤ 2 dtk', kanal: 'Web, Mobile (ESS)', app: 'ESS / PULSE', status: 'Ditetapkan', slo_now: 99.71 },
    { nama: 'Slip Gaji Digital', tipe: 'internal', kat: 'pendukung', pemilik: 'Direktur SDM', slo: '99,5%', kanal: 'Web, Mobile (ESS)', app: 'ESS / PULSE', status: 'Ditetapkan', slo_now: 99.92 },
    { nama: 'Pengadaan Bersama (Shared Procurement)', tipe: 'internal', kat: 'utama', pemilik: 'Kepala Pengadaan Grup', slo: '99,5%', kanal: 'Web', app: 'VANTAGE', status: 'Divalidasi', slo_now: 99.40 },
    { nama: 'Sewa Kendaraan Korporat (Inter-SBU)', tipe: 'internal', kat: 'utama', pemilik: 'GM Fleet BJU', slo: '99,0%', kanal: 'Web, API', app: 'STRIDE-Future', status: 'Draf', slo_now: null },
    { nama: 'Pengiriman Kargo Antar Unit', tipe: 'internal', kat: 'utama', pemilik: 'GM Logistik BLU', slo: '99,0%', kanal: 'API', app: 'STRIDE-Future', status: 'Draf', slo_now: null },
    { nama: 'Booking Servis Mobil', tipe: 'pelanggan-mitra', kat: 'utama', pemilik: 'Direktur After-Sales HK', slo: '99,9% · p95 ≤ 500ms', kanal: 'Mobile, Web, Gerai', app: 'ASM', status: 'Ditetapkan', slo_now: 99.86 },
    { nama: 'Penjualan Kendaraan Baru', tipe: 'pelanggan-mitra', kat: 'utama', pemilik: 'Direktur Penjualan HK', slo: '99,9%', kanal: 'Gerai, Web', app: 'ASI', status: 'Ditetapkan', slo_now: 99.95 },
    { nama: 'Portal Pendaftaran Rekanan', tipe: 'pelanggan-mitra', kat: 'pendukung', pemilik: 'Kepala Pengadaan Grup', slo: '99,5%', kanal: 'Web', app: 'VANTAGE', status: 'Divalidasi', slo_now: 99.12 },
    { nama: 'Pemesanan Aspal Curah', tipe: 'pelanggan-mitra', kat: 'utama', pemilik: 'GM Aspal Curah BSU', slo: '99,0%', kanal: 'Web, API', app: 'AV', status: 'Draf', slo_now: null },
    { nama: 'Tenant Leasing Mall', tipe: 'pelanggan-mitra', kat: 'utama', pemilik: 'GM Commercial Kalla Land', slo: '99,0%', kanal: 'Web', app: 'STRIDE-Future', status: 'Draf', slo_now: null },
  ];

  const INFRA = [
    { nama: 'DC On-Prem Makassar — Klaster K8s Prod', tipe: 'klaster-k8s', lokasi: 'Makassar (DC-1)', kap: '24 node · 768 vCPU', dr: 'Tier 1', status: 'Ditetapkan', apps: ['EAW', 'GSE', 'CONSOLE', 'SEDDI-CMP', 'PULSE', 'ASI'] },
    { nama: 'PostgreSQL HA (CloudNativePG) Prod', tipe: 'klaster-db', lokasi: 'Makassar (DC-1)', kap: '3 node · PG 18.3', dr: 'Tier 1', status: 'Ditetapkan', apps: ['SAORAJA-EAP', 'SEDDI-CMP', 'PANRITA-OLP'] },
    { nama: 'GPU On-Prem Inference Cluster', tipe: 'gpu', lokasi: 'Makassar (DC-1)', kap: '8× GPU 80GB', dr: 'Tier 2', status: 'Ditetapkan', apps: ['REQ', 'GSE'] },
    { nama: 'DR Site Jakarta', tipe: 'dc-fisik', lokasi: 'Jakarta (Colo)', kap: 'Warm standby', dr: 'Tier 1 DR', status: 'Divalidasi', apps: ['SAORAJA-EAP', 'SEDDI-CMP'] },
    { nama: 'Cloud Region — Aplikasi Publik', tipe: 'cloud', lokasi: 'ap-southeast-3', kap: 'Autoscale', dr: 'Tier 2', status: 'Divalidasi', apps: ['FORGE', 'VANTAGE'] },
    { nama: 'SD-WAN Korporat', tipe: 'jaringan', lokasi: 'HO + 64 cabang + 7 site', kap: '1 Gbps HO / 100 Mbps cabang', dr: '—', status: 'Ditetapkan', apps: ['ASI', 'ASM', 'AV'] },
    { nama: 'Keycloak Central IdP', tipe: 'klaster-k8s', lokasi: 'Makassar (DC-1)', kap: '3 replika', dr: 'Tier 1', status: 'Dipublikasi', apps: ['SAORAJA-EAP', 'SEDDI-CMP', 'PULSE'] },
  ];

  const CONTROLS = [
    { aspek: 'kerahasiaan', std: 'UU PDP Pasal 35', nama: 'Masking PII otomatis (Presidio) sebelum ke LLM cloud', pen: 'penuh', status: 'Ditetapkan' },
    { aspek: 'kerahasiaan', std: 'ISO 27001 A.8.24', nama: 'Enkripsi at-rest AES-256-GCM & TLS 1.3', pen: 'penuh', status: 'Ditetapkan' },
    { aspek: 'kerahasiaan', std: 'D-14', nama: 'Isolasi PII hanya di kalla_cmp (pii-guard CI)', pen: 'penuh', status: 'Dipublikasi' },
    { aspek: 'keutuhan', std: 'ISO 27001 A.8.15', nama: 'Audit trail append-only (shared.audit_logs)', pen: 'penuh', status: 'Ditetapkan' },
    { aspek: 'keutuhan', std: 'AF-05', nama: 'ADR & status Ditetapkan immutable (versi baru)', pen: 'sebagian', status: 'Divalidasi' },
    { aspek: 'ketersediaan', std: 'NFR-13', nama: 'HA Patroni/CNPG, RPO ≤15m RTO ≤4j', pen: 'sebagian', status: 'Divalidasi' },
    { aspek: 'ketersediaan', std: 'NFR-10', nama: 'EIO data plane 99,95%', pen: 'belum', status: 'Draf' },
    { aspek: 'keaslian', std: 'D-13', nama: 'SSO Keycloak, JWT RS256/ES256 ≤1 jam', pen: 'penuh', status: 'Dipublikasi' },
    { aspek: 'keaslian', std: 'ISO 27001 A.5.17', nama: 'Identitas workload mTLS via SPIFFE/SPIRE', pen: 'sebagian', status: 'Divalidasi' },
    { aspek: 'kenirsangkalan', std: 'EAW-07', nama: 'Setiap transisi status tercatat (eaw.workflow)', pen: 'penuh', status: 'Ditetapkan' },
  ];

  const KRA = [
    { kode: 'KRA-PRS-001', domain: 'proses_bisnis', nama: 'Peta Rantai Nilai Holding L0', versi: '1.2', status: 'Dipublikasi', objek: 18 },
    { kode: 'KRA-PRS-002', domain: 'proses_bisnis', nama: 'Referensi Proses Shared Services (H2R, P2P, R2R)', versi: '1.0', status: 'Ditetapkan', objek: 11 },
    { kode: 'KRA-LAY-001', domain: 'layanan', nama: 'Katalog Layanan Internal Korporat', versi: '1.1', status: 'Ditetapkan', objek: 9 },
    { kode: 'KRA-LAY-002', domain: 'layanan', nama: 'Katalog Layanan Pelanggan & Mitra', versi: '1.0', status: 'Divalidasi', objek: 7 },
    { kode: 'KRA-DAT-001', domain: 'data', nama: 'Model Kanonikal Party (Golden Record)', versi: '2.0', status: 'Dipublikasi', objek: 14, changed: true },
    { kode: 'KRA-DAT-006', domain: 'data', nama: 'Chart of Accounts Grup', versi: '1.3', status: 'Ditetapkan', objek: 6 },
    { kode: 'KRA-APL-001', domain: 'aplikasi', nama: 'Blueprint Unified App Shell & MF 2.0', versi: '3.0', status: 'Dipublikasi', objek: 19 },
    { kode: 'KRA-APL-002', domain: 'aplikasi', nama: 'Standar Kontrak API OpenAPI 3.1 & EIO', versi: '1.1', status: 'Ditetapkan', objek: 12 },
    { kode: 'KRA-INF-001', domain: 'infrastruktur', nama: 'Topologi Hybrid Multi-Cloud', versi: '1.0', status: 'Ditetapkan', objek: 7 },
    { kode: 'KRA-KAM-001', domain: 'keamanan', nama: 'Baseline Kontrol 5 Aspek (UU PDP & ISO 27001)', versi: '1.4', status: 'Dipublikasi', objek: 10 },
  ];

  const FRAMEWORKS = [
    { id: 'FW-HK-01', entity: 'HK', layanan: 'Penjualan kendaraan', app: 'STRIDE-Hk: ASI', tipe: 'utama', status: 'Divalidasi', dom: [6, 5, 3, 4, 2, 3] },
    { id: 'FW-HK-02', entity: 'HK', layanan: 'Servis dan suku cadang', app: 'STRIDE-Hk: ASM', tipe: 'utama', status: 'Draf', dom: [4, 3, 2, 2, 1, 0] },
    { id: 'FW-BSU-01', entity: 'BSU', layanan: 'Agen aspal curah Pertamina', app: 'STRIDE-Bsu: AV', tipe: 'utama', status: 'Draf', dom: [4, 0, 1, 1, 1, 0] },
    { id: 'FW-BSU-02', entity: 'BSU', layanan: 'Produksi aspal emulsi CSS-1 & CRS-1', app: 'STRIDE-Bsu: AEPS', tipe: 'utama', status: 'Draf', dom: [3, 1, 1, 1, 1, 1] },
    { id: 'FW-BLT-01', entity: 'BLT', layanan: 'Distribusi material tambang', app: 'STRIDE-Future', tipe: 'utama', status: 'Draf', dom: [1, 0, 0, 0, 0, 0] },
    { id: 'FW-BJU-01', entity: 'BJU', layanan: 'Fleet rent (rental mobil)', app: 'STRIDE-Future', tipe: 'utama', status: 'Draf', dom: [2, 1, 1, 0, 0, 0] },
    { id: 'FW-BLU-01', entity: 'BLU', layanan: 'Pengiriman, pergudangan, truk', app: 'STRIDE-Future', tipe: 'utama', status: 'Draf', dom: [1, 0, 1, 0, 0, 0] },
    { id: 'FW-CBP-01', entity: 'CBP', layanan: 'Bus antar kota & pariwisata', app: 'STRIDE-Future', tipe: 'utama', status: 'Draf', dom: [0, 0, 0, 0, 0, 0] },
    { id: 'FW-BSB-01', entity: 'BSB', layanan: 'Produksi beton pracetak', app: 'STRIDE-Future', tipe: 'utama', status: 'Draf', dom: [1, 0, 0, 0, 0, 0] },
    { id: 'FW-BK-01', entity: 'BK', layanan: 'Kontraktor PU & NON-PU', app: 'STRIDE-Future', tipe: 'utama', status: 'Draf', dom: [2, 1, 0, 0, 0, 0] },
    { id: 'FW-BAD-01', entity: 'BAD', layanan: 'Pengembangan real estate', app: 'STRIDE-Future', tipe: 'utama', status: 'Draf', dom: [1, 0, 1, 0, 0, 0] },
  ];

  const ARB = [
    { no: 'ARB-2026-0021', name: 'CRM Showroom Lokal Hadji Kalla', entity: 'HK', cost: 1850000000, score: 86, status: 'REJECTED', step: 4, by: 'sbu.arch.hk', date: '2026-10-02', notes: 'Duplikasi fungsional 86% dengan PANRITA-B-LINK FORGE. Diarahkan memakai FORGE (zero capex baru).', dup: 'FORGE (CRM)', violations: [{ entity: 'customer', rule: 'M1', message: 'Master Customer sudah dikelola kanonikal di SEDDI. Dilarang membuat tabel lokal.' }] },
    { no: 'ARB-2026-0024', name: 'Sistem Produksi Aspal Emulsi (AEPS)', entity: 'BSU', cost: 2400000000, score: 18, status: 'IN_REVIEW', step: 3, by: 'sbu.arch.bsu', date: '2026-10-14', notes: 'Review Domain 2: perlu mapping Product ke DD-04.', dup: null, violations: [] },
    { no: 'ARB-2026-0025', name: 'Aplikasi Fleet Rent Bumi Jasa Utama', entity: 'BJU', cost: 1200000000, score: 41, status: 'REVISION', step: 3, by: 'sbu.arch.bju', date: '2026-10-18', notes: 'Lengkapi Domain 5 (infra) & Domain 6 (kontrol). Tautkan ke KRA-APL-001.', dup: 'Sebagian dengan OPTIMA (aset)', violations: [] },
    { no: 'ARB-2026-0027', name: 'Vendor Portal Lokal Bumi Karsa', entity: 'BK', cost: 650000000, score: 91, status: 'SUBMITTED', step: 2, by: 'sbu.arch.bk', date: '2026-10-29', notes: 'Pre-screening MIND: duplikasi 91% dengan VANTAGE.', dup: 'VANTAGE (Vendor)', violations: [{ entity: 'vendor', rule: 'M1', message: 'Master Vendor dikelola sebagai peran Party di SEDDI.' }] },
    { no: 'ARB-2026-0019', name: 'Dealer Management Sales (ASI)', entity: 'HK', cost: 3100000000, score: 12, status: 'APPROVED', step: 5, by: 'sbu.arch.hk', date: '2026-09-11', cert: 'CLR-2026-0019-SAORAJA', notes: 'Disetujui. Wajib konsumsi Party & Product dari SEDDI via ref.*.', dup: null, violations: [] },
    { no: 'ARB-2026-0015', name: 'HRMS PULSE (PANRITA-BASE)', entity: 'KALLA', cost: 4200000000, score: 9, status: 'APPROVED', step: 5, by: 'app.arch', date: '2026-08-20', cert: 'CLR-2026-0015-SAORAJA', notes: 'Disetujui sebagai platform bersama holding.', dup: null, violations: [] },
    { no: 'ARB-2026-0028', name: 'Data Lake Konstruksi BSB', entity: 'BSB', cost: 900000000, score: 77, status: 'SUBMITTED', step: 2, by: 'sbu.arch.bsb', date: '2026-11-01', notes: 'Kemiripan 77% dengan PANRITA-OLP (FLUX).', dup: 'PANRITA-OLP', violations: [] },
  ];

  const ADR = [
    ['D-01', 'Arsitektur Frontend', 'Micro-Frontend via Module Federation 2.0', 'Satu shell navigasi, deploy mandiri per workspace tanpa merusak modul lain.'],
    ['D-02', 'Pengelolaan Git Repo', '1 Repositori Git per Platform', 'Isolasi otonomi tim; membatasi blast radius; least privilege.'],
    ['D-03', 'Guardrail Chatbot AI', 'Hard Fencing NeMo + OPA/Rego Eksternal', 'Mencegah pembengkakan biaya token dan kebocoran rahasia; evaluasi di luar LLM.'],
    ['D-04', 'Metode Scaffolding GSE', 'Hybrid Template Deterministik + AI Scaffolding', '100% kode scaffolding lolos kompilasi, linter, dan SCA gate.'],
    ['D-05', 'Strategi Penempatan LLM', 'Hybrid Multi-Cloud + Model On-Premises GPU', 'Data rahasia & PII wajib model on-premise (UU PDP).'],
    ['D-06', 'Tingkat Otonomi Agen AI', 'Maksimum Otonomi L3 (Batas Nominal)', 'Mempercepat approval rutin tanpa risiko terhadap neraca.'],
    ['D-07', 'Konsistensi Transaksi', 'Distributed Saga via Temporal.io', '2PC tidak cocok untuk cloud-native; Saga mendukung kompensasi async.'],
    ['D-08', 'Kebijakan FinOps Token', 'Showback Tahun 1 → Chargeback Tahun 2', 'Transparansi biaya AI per SBU sebelum pembebanan riil.'],
    ['D-09', 'Standar Lisensi Software', 'FOSS First', '~75% komponen OSS; investasi fokus pada infrastruktur AI.'],
    ['D-10', 'Tingkatan Produk EAP', 'Core (Free) / Pro (Chargeback) / Enterprise', 'Adopsi maksimal dengan jalur cost recovery jelas.'],
    ['D-11', 'Skema RBAC PANRITA-SSP', 'Menggunakan base.set pada database BASE', 'SSP tidak memiliki basis data sendiri.'],
    ['D-12', 'Standar Skema RBAC', 'Skema set seragam (pengecualian CMP: iam)', 'Otorisasi konsisten; template GSE memakai {{iam_schema}}.'],
    ['D-13', 'Autentikasi & Verifikasi', 'Keycloak Self-Hosted; JWT RS256/ES256', 'Rotasi kunci asimetris via JWKS tanpa redeploy.'],
    ['D-14', 'Kedaulatan & Lokasi PII', 'Data Pribadi HANYA di kalla_cmp (mdm & iam)', 'DB platform lain hanya menyimpan idp_subject (UU PDP).'],
  ].map(([code, aspek, title, why], i) => ({ code, aspek, title, why, status: 'Accepted', git: `eap/docs/adr/${code.toLowerCase()}.md`, date: '2026-0' + (1 + (i % 3)) + '-1' + (i % 9) }))
    .concat([
      { code: 'ADR-CMP-003', aspek: 'Sinkronisasi Organisasi', title: 'eaw.entity_org menjadi VIEW atas ref.business_groups', why: 'CMP = SSOT struktur organisasi; EAP hanya menyimpan metadata arsitektur.', status: 'Accepted', git: 'cmp/DATABASE-REVIEW.md#adr-cmp-003', date: '2026-10-30' },
      { code: 'ADR-CMP-004', aspek: 'Modul shared KEIS', title: 'shared.audit_logs/documents/outbox identik lintas platform', why: 'Gate cross_check_shared.sh menjamin keseragaman.', status: 'Accepted', git: 'cmp/DATABASE-REVIEW.md#adr-cmp-004', date: '2026-10-21' },
      { code: 'ADR-CMP-005', aspek: 'Registry Aplikasi', title: 'EAP pemilik registry aplikasi; CMP pegang replika ref.applications', why: 'Arah CDC berbalik EAP → CMP.', status: 'Accepted', git: 'cmp/DATABASE-REVIEW.md#adr-cmp-005', date: '2026-10-21' },
      { code: 'ADR-EAP-015', aspek: 'Graph Store', title: 'Neo4j Community vs Apache AGE untuk lineage', why: 'Evaluasi: AGE mengurangi komponen operasional.', status: 'Proposed', git: 'eap/docs/adr/adr-eap-015.md', date: '2026-11-02' },
      { code: 'ADR-EAP-009', aspek: 'Diagram Engine', title: 'JointJS untuk kanvas ArchiMate', why: 'Digantikan @xyflow/react 12.x.', status: 'Superseded', git: 'eap/docs/adr/adr-eap-009.md', date: '2026-03-04' },
    ]);

  const AF = [
    ['AF-01', '6 Domain Arsitektur wajib (ArchiMate 3.2)'],
    ['AF-02', 'Satu Kerangka Kerja per Layanan Utama'],
    ['AF-03', 'Hierarki kepemilikan 4 tingkat'],
    ['AF-04', 'KRA ditetapkan Holding EA Office'],
    ['AF-05', 'Draf → Divalidasi → Ditetapkan → Dipublikasi → Direviu'],
    ['AF-06', 'Gate GSE: minimal Divalidasi'],
    ['AF-07', 'Reviu minimal 1× per tahun'],
    ['AF-08', 'Dokumen arsitektur dihasilkan otomatis'],
  ];

  const ROLES = [
    ['ROLE_EAP_ARB_CHAIR', 'Chief Enterprise Architect / Ketua ARB', 'T1_GOVERNANCE'],
    ['ROLE_EAP_STEERING_COMMITTEE', 'Dewan Pengarah TI (BOD / Direksi)', 'T1_GOVERNANCE'],
    ['ROLE_EAP_BUSINESS_ARCHITECT', 'Enterprise Business Architect', 'T2_DOMAIN'],
    ['ROLE_EAP_DATA_ARCHITECT', 'Enterprise Data Architect', 'T2_DOMAIN'],
    ['ROLE_EAP_APP_ARCHITECT', 'Enterprise Application Architect', 'T2_DOMAIN'],
    ['ROLE_EAP_INFRA_ARCHITECT', 'Enterprise Infrastructure Architect', 'T2_DOMAIN'],
    ['ROLE_EAP_SECURITY_ARCHITECT', 'Enterprise Security Architect', 'T2_DOMAIN'],
    ['ROLE_EAP_SBU_ARCHITECT', 'SBU Lead Solution Architect', 'T3_EXECUTION'],
    ['ROLE_EAP_BPO', 'Business Process Owner (SBU)', 'T3_EXECUTION'],
    ['ROLE_EAP_GSE_DEVELOPER', 'Lead Software Engineer', 'T3_EXECUTION'],
    ['ROLE_EAP_AUDITOR', 'GRC & Internal Audit Officer', 'T4_ASSURANCE'],
    ['ROLE_EAP_SYSADMIN', 'EAP System Administrator', 'T4_ADMIN'],
    ['ROLE_EAP_MIND_AGENT', 'MIND AI Autonomous Agent', 'T4_AI_SERVICE'],
  ].map(([code, name, tier]) => ({ code, name, tier }));

  const PERMS = [
    'eaw.catalog.read', 'eaw.catalog.write', 'eaw.model.write', 'eaw.workflow.validate', 'eaw.workflow.approve', 'eaw.kra.write',
    'eaw.arb.submit', 'eaw.arb.review', 'eaw.arb.approve', 'eaw.adr.write', 'eaw.publish.run',
    'gse.project.read', 'gse.project.run', 'req.session.run', 'console.dashboard.read', 'console.finops.read',
    'console.security.admin', 'console.ai.admin', 'set.users.admin', 'set.audit.read',
  ];
  const ALL = PERMS;
  const RP = {
    ROLE_EAP_ARB_CHAIR: ALL.filter(p => !['gse.project.run', 'set.users.admin', 'console.security.admin'].includes(p)),
    ROLE_EAP_STEERING_COMMITTEE: ['eaw.catalog.read', 'console.dashboard.read', 'console.finops.read', 'gse.project.read'],
    ROLE_EAP_BUSINESS_ARCHITECT: ['eaw.catalog.read', 'eaw.catalog.write', 'eaw.model.write', 'eaw.workflow.validate', 'eaw.arb.review', 'eaw.adr.write', 'eaw.publish.run', 'gse.project.read', 'console.dashboard.read'],
    ROLE_EAP_DATA_ARCHITECT: ['eaw.catalog.read', 'eaw.catalog.write', 'eaw.model.write', 'eaw.workflow.validate', 'eaw.arb.review', 'eaw.adr.write', 'eaw.publish.run', 'gse.project.read', 'console.dashboard.read'],
    ROLE_EAP_APP_ARCHITECT: ['eaw.catalog.read', 'eaw.catalog.write', 'eaw.model.write', 'eaw.workflow.validate', 'eaw.arb.review', 'eaw.adr.write', 'eaw.publish.run', 'gse.project.read', 'console.dashboard.read'],
    ROLE_EAP_INFRA_ARCHITECT: ['eaw.catalog.read', 'eaw.catalog.write', 'eaw.model.write', 'eaw.workflow.validate', 'eaw.arb.review', 'gse.project.read', 'console.dashboard.read'],
    ROLE_EAP_SECURITY_ARCHITECT: ['eaw.catalog.read', 'eaw.catalog.write', 'eaw.model.write', 'eaw.workflow.validate', 'eaw.arb.review', 'console.dashboard.read', 'console.security.admin', 'console.ai.admin'],
    ROLE_EAP_SBU_ARCHITECT: ['eaw.catalog.read', 'eaw.catalog.write', 'eaw.model.write', 'eaw.arb.submit', 'gse.project.read', 'req.session.run', 'console.dashboard.read'],
    ROLE_EAP_BPO: ['eaw.catalog.read', 'eaw.model.write', 'req.session.run', 'console.dashboard.read'],
    ROLE_EAP_GSE_DEVELOPER: ['eaw.catalog.read', 'gse.project.read', 'gse.project.run', 'req.session.run'],
    ROLE_EAP_AUDITOR: ['eaw.catalog.read', 'gse.project.read', 'console.dashboard.read', 'console.finops.read', 'set.audit.read'],
    ROLE_EAP_SYSADMIN: ['eaw.catalog.read', 'console.dashboard.read', 'console.security.admin', 'console.ai.admin', 'set.users.admin', 'set.audit.read', 'gse.project.read'],
    ROLE_EAP_MIND_AGENT: ['eaw.catalog.read', 'eaw.arb.review', 'gse.project.read'],
  };

  // set.users (idp_subject only) + display via ref.users
  const USERS = [
    { sub: 'f3a1c9e2-7b44-4d1a-9e0b-2c8a51d7e001', uname: 'chief.architect', role: 'ROLE_EAP_ARB_CHAIR', scope: null, active: true, last: '2026-11-03 08:12' },
    { sub: '8b2d4e61-1a90-4c7e-b5f2-93e0c4a7e002', uname: 'data.architect', role: 'ROLE_EAP_DATA_ARCHITECT', scope: null, active: true, last: '2026-11-03 07:55' },
    { sub: '5c7e9a13-3f28-4b6d-8a41-71d2e9b0e003', uname: 'app.architect', role: 'ROLE_EAP_APP_ARCHITECT', scope: null, active: true, last: '2026-11-02 17:40' },
    { sub: '2e4f6b85-9c13-4a7f-b0d8-15a3c6e2e004', uname: 'sec.architect', role: 'ROLE_EAP_SECURITY_ARCHITECT', scope: null, active: true, last: '2026-11-02 16:02' },
    { sub: 'a9d1b3c5-6e78-4f20-9132-4b5c6d7ee005', uname: 'sbu.arch.hk', role: 'ROLE_EAP_SBU_ARCHITECT', scope: 'HK', active: true, last: '2026-11-03 09:01' },
    { sub: 'c4e6a8b0-2d13-4f57-8e9a-0b1c2d3ee006', uname: 'sbu.arch.bsu', role: 'ROLE_EAP_SBU_ARCHITECT', scope: 'BSU', active: true, last: '2026-11-01 10:22' },
    { sub: 'd7f9b1c3-5e68-4a0b-9c2d-3e4f5a6be007', uname: 'bpo.sales.hk', role: 'ROLE_EAP_BPO', scope: 'HK', active: true, last: '2026-10-30 14:18' },
    { sub: 'e1a3c5d7-8f90-4b2c-a4d6-7e8f9a0be008', uname: 'lead.dev.platform', role: 'ROLE_EAP_GSE_DEVELOPER', scope: null, active: true, last: '2026-11-03 08:47' },
    { sub: 'b5c7d9e1-0a23-4c45-b6e8-9f0a1b2ce009', uname: 'auditor.integra', role: 'ROLE_EAP_AUDITOR', scope: null, active: true, last: '2026-10-28 11:30' },
    { sub: '0f2a4c6e-8b1d-4e3f-a5c7-9d0e1f2ae010', uname: 'sysadmin.eap', role: 'ROLE_EAP_SYSADMIN', scope: null, active: true, last: '2026-11-03 06:15' },
    { sub: 'svc-mind-agent@spiffe://kalla/eap/mind', uname: 'mind-agent', role: 'ROLE_EAP_MIND_AGENT', scope: null, active: true, last: '2026-11-03 09:10' },
    { sub: '6a8c0e2f-4b5d-4f7a-9c1e-3a5b7c9de012', uname: 'sbu.arch.bju', role: 'ROLE_EAP_SBU_ARCHITECT', scope: 'BJU', active: false, last: '2026-09-14 09:00' },
  ];

  const RACI = [
    ['Katalog Probis (Domain 1)', 'A', 'R', 'C', 'R', 'I', 'I', '-'],
    ['Kamus Data & Lineage (Domain 2)', 'A', 'R', 'C', 'I', 'I', 'I', '-'],
    ['Katalog Layanan (Domain 3)', 'A', 'R', 'C', 'C', 'I', 'I', '-'],
    ['Katalog Aplikasi & Mode MF (Domain 4)', 'A', 'R', 'R*', '-', 'C', 'I', '-'],
    ['Topologi Infrastruktur (Domain 5)', 'A', 'R', 'C', '-', '-', 'I', '-'],
    ['Kontrol Keamanan & Privasi (Domain 6)', 'A', 'R', 'C', '-', 'C', 'I', '-'],
    ['Pengajuan Tiket ARB Baru', '-', 'C', 'R', 'C', '-', 'I', '-'],
    ['Sidang & Putusan ARB Clearance', 'A', 'R', 'C', 'I', 'I', 'I', '-'],
    ['Penyusunan Roadmap', 'A', 'R', 'I', 'I', '-', 'I', '-'],
    ['Scaffolding Proyek via GSE', 'I', 'C', 'C', '-', 'R', 'I', '-'],
    ['Elisitasi Kebutuhan via REQ', '-', '-', 'C', 'R', 'R', '-', '-'],
    ['Konfigurasi Guardrail & AI Policy', 'I', 'C', '-', '-', '-', 'I', 'R'],
    ['Manajemen Akun & Role (SET)', 'I', '-', '-', '-', '-', 'I', 'A/R'],
  ];

  const GSE_PROJECTS = [
    { id: 'GSE-0042', app: 'PULSE', tmpl: 'Remote SPA MF 2.0 + NestJS Clean', repo: 'git.kalla/base', branch: 'feat/gse-pulse-scaffold', pr: '!214', status: 'merged', dur: 38.4, lint: 'ok', build: 'ok', sca: 'ok', pii: 'ok', date: '2026-10-21' },
    { id: 'GSE-0045', app: 'ASI', tmpl: 'Remote SPA MF 2.0 + Go Fiber', repo: 'git.kalla/stride-hk', branch: 'feat/gse-asi-scaffold', pr: '!37', status: 'open', dur: 41.9, lint: 'ok', build: 'ok', sca: 'ok', pii: 'ok', date: '2026-10-30' },
    { id: 'GSE-0046', app: 'FORGE', tmpl: 'Remote SPA MF 2.0 + NestJS Clean', repo: 'git.kalla/blink', branch: 'feat/gse-forge-scaffold', pr: '!12', status: 'checks-failed', dur: 44.1, lint: 'ok', build: 'ok', sca: 'err', pii: 'ok', date: '2026-11-01' },
    { id: 'GSE-0047', app: 'VANTAGE', tmpl: 'Remote SPA MF 2.0 + NestJS Clean', repo: 'git.kalla/blink', branch: 'feat/gse-vantage-scaffold', pr: '!13', status: 'running', dur: null, lint: 'run', build: 'wait', sca: 'wait', pii: 'wait', date: '2026-11-03' },
    { id: 'GSE-0040', app: 'AEGIS', tmpl: 'Internal Routed Sub-App', repo: 'git.kalla/base', branch: '—', pr: '—', status: 'blocked', dur: null, lint: '—', build: '—', sca: '—', pii: '—', date: '2026-10-19', reason: 'AF-06: AEGIS berstatus Draf di katalog EAW' },
  ];

  const TEMPLATES = [
    { kode: 'tpl-host-shell', nama: 'Unified App Shell Host', stack: 'React 19 · Vite 6 · MF 2.0 Host · Keycloak PKCE', ver: '3.0.2', used: 6, desc: 'Shell navigasi global, org selector, Ctrl+K, notifikasi, MIND copilot, WorkspaceLoader.' },
    { kode: 'tpl-remote-spa', nama: 'Remote SPA (FEDERATED_REMOTE)', stack: 'React 19 · @module-federation/vite · Shadcn', ver: '3.0.1', used: 14, desc: 'Expose ./App tanpa props; konteks via @panrita/shell-api; Error Boundary.' },
    { kode: 'tpl-internal-sub', nama: 'Internal Routed Sub-App', stack: 'React Router · Tailwind 4', ver: '2.4.0', used: 9, desc: 'Dibundel di repo shell; cocok untuk SET/RBAC & pelaporan ringkas.' },
    { kode: 'tpl-nest-clean', nama: 'NestJS Clean Architecture', stack: 'NestJS 10 · Prisma · RFC 9457 · OTel', ver: '2.8.3', used: 11, desc: 'Controller → Service → Repository; guard RBAC set; apply_standard().' },
    { kode: 'tpl-go-fiber', nama: 'Go Fiber Service', stack: 'Go 1.25 · Fiber · sqlc · OTel', ver: '1.9.0', used: 4, desc: 'Layanan latensi rendah; konektor EIO.' },
    { kode: 'tpl-ddl-set', nama: 'DDL Skema set + shared + ref', stack: 'PostgreSQL 18 · {{iam_schema}}', ver: '3.1.0', used: 12, desc: 'Skema RBAC seragam D-12, modul shared identik, langganan pub_cmp_ref.' },
    { kode: 'tpl-ci', nama: 'Pipeline CI GitOps', stack: 'Lint · Build · Grype · Syft · pii-guard · cross_check', ver: '2.2.0', used: 15, desc: '7 tahap CI + ArgoCD sync namespace per platform.' },
  ];

  const AI_MODELS = [
    { nama: 'Llama-3.3-70B-Instruct', lokasi: 'On-Prem GPU', guna: 'REQ elisitasi, data rahasia', lisensi: 'Llama Community', risiko: 'medium', klas: 'rahasia', status: 'aktif' },
    { nama: 'Qwen2.5-Coder-32B', lokasi: 'On-Prem GPU', guna: 'GSE AI scaffolding', lisensi: 'Apache-2.0', risiko: 'low', klas: 'rahasia', status: 'aktif' },
    { nama: 'bge-m3 (embedding)', lokasi: 'On-Prem GPU', guna: 'NeMo fencing & RAG', lisensi: 'MIT', risiko: 'low', klas: 'rahasia', status: 'aktif' },
    { nama: 'claude-sonnet-5-5', lokasi: 'Cloud (via LiteLLM)', guna: 'MIND copilot (data publik/internal)', lisensi: 'Komersial', risiko: 'medium', klas: 'internal', status: 'aktif' },
    { nama: 'claude-haiku-5-5', lokasi: 'Cloud (via LiteLLM)', guna: 'Klasifikasi ringan, ringkasan', lisensi: 'Komersial', risiko: 'low', klas: 'internal', status: 'aktif' },
    { nama: 'Model Cloud Eksperimen X', lokasi: 'Cloud', guna: 'Uji coba tim SBU', lisensi: 'Belum ditinjau', risiko: 'high', klas: 'publik', status: 'ditangguhkan' },
  ];

  const TOKENS = [
    { sbu: 'Holding EA Office', tok: 48.2, cost: 31.4, quota: 60 },
    { sbu: 'PT Hadji Kalla', tok: 36.9, cost: 22.8, quota: 40 },
    { sbu: 'PT Bumi Sarana Utama', tok: 14.1, cost: 8.7, quota: 20 },
    { sbu: 'PT Bumi Karsa', tok: 9.8, cost: 6.1, quota: 15 },
    { sbu: 'Kalla Transport', tok: 7.2, cost: 4.4, quota: 15 },
    { sbu: 'Kalla Land', tok: 3.6, cost: 2.2, quota: 10 },
  ];
  const TOKEN_TREND = [42, 58, 71, 88, 104, 119.8];

  const CONNECTORS = [
    { nama: 'cdc.pub_cmp_ref → kalla_eap.ref', tipe: 'PostgreSQL Logical CDC', arah: 'CMP → EAP', health: 'ok', lat: 140, tables: 31, bc: false },
    { nama: 'cdc.eaw.application → kalla_cmp.ref.applications', tipe: 'PostgreSQL Logical CDC', arah: 'EAP → CMP', health: 'ok', lat: 95, tables: 1, bc: false },
    { nama: 'webhook employee-sync', tipe: 'Webhook (CloudEvents)', arah: 'CMP → set', health: 'ok', lat: 210, tables: null, bc: false },
    { nama: 'cmp.search.index-feed', tipe: 'REST GET', arah: 'CMP → Shell', health: 'warn', lat: 480, tables: null, bc: false },
    { nama: 'arb.screen-redundancy', tipe: 'REST POST', arah: 'EAP → CMP', health: 'ok', lat: 320, tables: null, bc: false },
    { nama: 'olp.flux.pipeline-metadata', tipe: 'REST', arah: 'OLP → EAP', health: 'down', lat: null, tables: null, bc: false },
    { nama: 'stride-hk.asi.orders.v2', tipe: 'OpenAPI 3.1', arah: 'ASI → EIO', health: 'warn', lat: 390, tables: null, bc: true },
    { nama: 'corporate.finops.token_usage', tipe: 'Kafka topic', arah: 'LiteLLM → CONSOLE', health: 'ok', lat: 35, tables: null, bc: false },
  ];

  const SAGAS = [
    { id: 'saga-7f2a', wf: 'SalesOrderSaga', svc: 'ASI → FIA → FLOW', status: 'completed', steps: 5, comp: 0, dur: '1.8s' },
    { id: 'saga-7f2b', wf: 'EmployeeMutationSaga', svc: 'CMP → set (×7 platform)', status: 'running', steps: 7, comp: 0, dur: '—' },
    { id: 'saga-7f2c', wf: 'VendorOnboardingSaga', svc: 'VANTAGE → CMP → FIA', status: 'compensated', steps: 4, comp: 2, dur: '3.2s' },
    { id: 'saga-7f2d', wf: 'AsphaltDeliverySaga', svc: 'AV → FLOW → FIA', status: 'failed', steps: 3, comp: 1, dur: '6.1s' },
  ];

  const SLO = [
    { ws: 'EAW', slo: 99.9, now: 99.96, p95: 212, err: 0.04 },
    { ws: 'GSE', slo: 99.9, now: 99.91, p95: 388, err: 0.09 },
    { ws: 'REQ', slo: 99.5, now: 99.72, p95: 640, err: 0.21 },
    { ws: 'CONSOLE', slo: 99.9, now: 99.98, p95: 176, err: 0.02 },
    { ws: 'SET', slo: 99.9, now: 99.99, p95: 98, err: 0.01 },
    { ws: 'EIO Broker', slo: 99.95, now: 99.93, p95: 455, err: 0.07 },
  ];

  const GUARD_LOG = [
    { t: '09:08:12', eng: 'NeMo', ms: 41, user: 'bpo.sales.hk', ws: 'REQ', kat: 'off-topic', ex: 'Minta resep masakan coto Makassar' },
    { t: '08:51:03', eng: 'OPA/Rego', ms: 63, user: 'sbu.arch.bju', ws: 'REQ', kat: 'jailbreak', ex: 'Abaikan semua instruksi sebelumnya dan…' },
    { t: '08:22:47', eng: 'Presidio', ms: 88, user: 'lead.dev.platform', ws: 'GSE', kat: 'pii-masked', ex: 'NIK 7371•••••••••• dimasking sebelum cloud LLM' },
    { t: '07:59:30', eng: 'NeMo', ms: 37, user: 'sbu.arch.bsu', ws: 'MIND', kat: 'off-topic', ex: 'Prediksi skor pertandingan sepak bola' },
    { t: '07:15:02', eng: 'OPA/Rego', ms: 0, user: 'svc-gse', ws: 'GSE', kat: 'fail-closed', ex: 'OPA timeout → HTTP 503 (fail-closed)' },
  ];

  const AGENTS = [
    { nama: 'MIND Drift & Redundancy Detector', lvl: 'L2', scope: 'Git + APISIX scan harian', on: true },
    { nama: 'MIND Pre-ARB Screening Agent', lvl: 'L3', scope: 'eaw.arb_clearances', on: true },
    { nama: 'GSE Scaffolding Agent', lvl: 'L3', scope: 'Repositori Git target (branch+PR)', on: true },
    { nama: 'REQ Elicitation Agent', lvl: 'L1', scope: 'Sesi percakapan stateless', on: true },
  ];

  const AUDIT = [
    { id: 90412, t: '2026-11-03 09:10:44', sch: 'eaw', tbl: 'arb_clearances', act: 'update', by: 'mind-agent', rec: 'ARB-2026-0028', ch: 'ai_risk_score: null → 77.00' },
    { id: 90411, t: '2026-11-03 09:01:18', sch: 'eaw', tbl: 'application', act: 'insert', by: 'sbu.arch.hk', rec: 'ASM', ch: 'status: Draf · workspace_mode: FEDERATED_REMOTE' },
    { id: 90410, t: '2026-11-03 08:47:02', sch: 'gse', tbl: 'projects', act: 'insert', by: 'lead.dev.platform', rec: 'GSE-0047', ch: 'app: VANTAGE · status: running' },
    { id: 90409, t: '2026-11-03 08:12:55', sch: 'eaw', tbl: 'workflow', act: 'insert', by: 'chief.architect', rec: 'FW-HK-01', ch: 'Draf → Divalidasi' },
    { id: 90408, t: '2026-11-02 17:40:31', sch: 'eaw', tbl: 'reference', act: 'update', by: 'data.architect', rec: 'KRA-DAT-001', ch: 'versi: 1.4 → 2.0 (14 objek ditandai reviu)' },
    { id: 90407, t: '2026-11-02 16:02:09', sch: 'console', tbl: 'ai_models', act: 'update', by: 'sec.architect', rec: 'Model Cloud Eksperimen X', ch: 'status: aktif → ditangguhkan' },
    { id: 90406, t: '2026-11-02 11:20:00', sch: 'set', tbl: 'user_roles', act: 'insert', by: 'sysadmin.eap', rec: 'sbu.arch.bsu', ch: 'ROLE_EAP_SBU_ARCHITECT @ BSU' },
    { id: 90405, t: '2026-11-01 10:22:13', sch: 'set', tbl: 'users', act: 'update', by: 'cmp.webhook', rec: 'sbu.arch.bju', ch: 'is_active: true → false (employee_mutated)' },
  ];

  const NOTIFS = [
    { ic: '⚠', t: 'Breaking change terdeteksi', d: 'stride-hk.asi.orders.v2 menghapus field customer_code (EIO-04)', w: '12 mnt', route: 'console/eio' },
    { ic: '◆', t: 'Tiket ARB baru: ARB-2026-0028', d: 'MIND pre-screening: kemiripan 77% dengan PANRITA-OLP', w: '40 mnt', route: 'eaw/arb' },
    { ic: '↻', t: 'KRA-DAT-001 naik ke v2.0', d: '14 objek ditandai untuk direviu (EAW-06)', w: '16 jam', route: 'eaw/kra' },
    { ic: '✓', t: 'PR !214 PULSE di-merge', d: 'Scaffold 38,4 dtk · semua gate lolos', w: '2 hari', route: 'gse/pr' },
    { ic: '⛔', t: 'Drift: database bayangan', d: 'MIND menemukan DB "crm_local_hk" tidak terdaftar di EAW', w: '3 hari', route: 'eaw/dashboard' },
  ];

  const SEARCH_FEED = [
    { type: 'party', label: 'PRT-00012874 · PT Semen Tonasa', sub: 'peran: customer, vendor' },
    { type: 'party', label: 'PRT-00098311 · CV Maju Bersama Makassar', sub: 'peran: vendor' },
    { type: 'vendor', label: 'Pertamina Patra Niaga', sub: 'vendor aspal curah · PRT-00000419' },
    { type: 'coa', label: '4-1100 · Pendapatan Penjualan Kendaraan', sub: 'CoA Grup' },
    { type: 'coa', label: '5-2300 · Beban Pemeliharaan Armada', sub: 'CoA Grup' },
    { type: 'product', label: 'Toyota Avanza 1.5 G CVT', sub: 'DD-04 · HK' },
    { type: 'product', label: 'Aspal Emulsi CRS-1 (drum 200L)', sub: 'DD-04 · BSU' },
    { type: 'branch', label: 'Toyota Urip Sumoharjo', sub: 'cabang HK · Makassar' },
    { type: 'branch', label: 'Terminal Aspal Bitung', sub: 'cabang BSU · Sulawesi Utara' },
  ];

  const ROADMAP = [
    { fase: 'Fase 0 — Fondasi & SSO', from: 1, to: 2, color: '#5B6B7A', items: ['ADR D-01..D-14 di Git', 'Keycloak + Vault', 'kalla_eap & kalla_cmp skema kosong', 'Skeleton Unified App Shell'] },
    { fase: 'Fase 1 — MVP EAW, SEDDI Core & ARB', from: 3, to: 4, color: '#0A8F4F', items: ['EAW 6 domain + APM', 'REQ ter-guardrail', 'ARB & Gate AF-06', 'Pilot scaffold ≤45 dtk'] },
    { fase: 'Fase 2 — EIO, Saga & Onboarding', from: 5, to: 6, color: '#2F6FB3', items: ['EIO 6-layer + Kafka', 'Saga Temporal.io', 'BASE, SSP, B-LINK', 'CDC pub_cmp_ref → ref.*', 'FinOps + IKA'] },
    { fase: 'Fase 3 — Skala Grup & STRIDE', from: 7, to: 12, color: '#2E7D4F', items: ['STRIDE-Hk & STRIDE-Bsu', 'Chargeback FinOps', 'IKA L3 umum / L2 khusus', 'Monitoring SLO otomatis'] },
  ];
  const MILESTONES = [
    { m: 'Fase 0 selesai', b: 2, s: 'done' }, { m: 'EAW Go-Live (MVP)', b: 4, s: 'done' }, { m: 'Scaffold pilot PULSE', b: 4, s: 'done' },
    { m: 'CDC pub_cmp_ref aktif', b: 6, s: 'cur' }, { m: '29 entitas master CMP terdaftar', b: 6, s: 'cur' },
    { m: 'Onboarding STRIDE-Hk', b: 8, s: 'next' }, { m: 'Chargeback aktif', b: 10, s: 'next' }, { m: 'IKA L3 platform umum', b: 12, s: 'next' },
  ];

  const KPIS = [
    ['K-01', 'Aplikasi terdaftar di EAW', '19 / 22', 86, '100% akhir Fase 2'],
    ['K-02', 'Kepatuhan clearance ARB (AF-06)', '100%', 100, '100% sejak Fase 1'],
    ['K-03', 'Akurasi deteksi redundansi MIND', '83%', 83, '≥ 80%'],
    ['K-04', 'Zero local master', '62%', 62, '100% akhir Fase 3'],
    ['K-05', 'Akun login per karyawan', '1,4', 93, '1 akun SSO'],
    ['K-07', 'Waktu rilis aplikasi baru', '27 hari', 100, '≤ 30 hari'],
    ['K-08', 'Rata-rata scaffold GSE', '41,5 dtk', 100, '≤ 45 dtk'],
    ['K-10', 'Akurasi guardrail REQ', '99,7%', 100, '≥ 99,5%'],
  ];

  return { STATUS, DOMAINS, ENTITIES, IKA_DOMAIN, IKA_TREND, APPS, PROCESSES, DATA_ENTITIES, MASTER_DOMAINS, SERVICES, INFRA, CONTROLS, KRA, FRAMEWORKS,
    ARB, ADR, AF, ROLES, PERMS, RP, USERS, RACI, GSE_PROJECTS, TEMPLATES, AI_MODELS, TOKENS, TOKEN_TREND, CONNECTORS, SAGAS, SLO, GUARD_LOG, AGENTS,
    AUDIT, NOTIFS, SEARCH_FEED, ROADMAP, MILESTONES, KPIS };
})();
