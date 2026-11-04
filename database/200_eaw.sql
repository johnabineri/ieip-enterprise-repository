-- =====================================================================
-- 200_eaw.sql : skema `eaw` — metadata arsitektur enterprise 6 domain (SAF §5, SRS §5.3)
--
-- Prinsip:
--   * EAP DIMULAI KOSONG (Zero Pre-Seed, SAF §8): tidak ada seed aplikasi/platform; isi lewat EAW + alur AF-05.
--   * `eaw.entity_org` adalah VIEW atas ref.business_groups (migrations/0001, ADR-CMP-003) — CMP = SSOT struktur organisasi.
--     Karena itu entity_id di sini mengarah ke replika ref.business_groups(id) (kontrak #4 migrasi itu).
--   * Status AF-05 (Draf → Divalidasi → Ditetapkan → Dipublikasi → Direviu) HANYA berubah lewat eaw.transition()
--     (210_eaw_functions.sql) dan tercatat append-only di eaw.workflow.
--   * Penyimpangan dari draf SRS: PK bernama `id` (syarat shared.apply_standard); kolom created_at/updated_at/row_version/
--     created_by/updated_by/deleted_at/data_classification ditambahkan apply_standard (bukan ditulis ulang di sini).
-- =====================================================================

-- ---------- atribut arsitektur milik EAP atas entitas (dipakai view eaw.entity_org) ----------
CREATE TABLE eaw.entity_org_metadata (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id   UUID NOT NULL REFERENCES ref.business_groups(id),
    kaf_level   VARCHAR(20) CHECK (kaf_level IN ('holding','ecosystem','sbu','unit')),   -- tingkat arsitektur (menimpa pemetaan bawaan group_kind)
    ika_level   SMALLINT CHECK (ika_level BETWEEN 1 AND 5),                              -- Indeks Kematangan Arsitektur (SAF §6.3)
    reference_id UUID,                                                                   -- tautan KRA (FK ditambahkan setelah eaw.reference)
    notes       TEXT
);
CALL shared.apply_standard('eaw.entity_org_metadata', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_entity_org_metadata_entity ON eaw.entity_org_metadata (entity_id) WHERE deleted_at IS NULL;

-- ---------- Referensi Arsitektur Korporat (KRA) — hanya Holding EA Office yang mengubah ----------
CREATE TABLE eaw.reference (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain     VARCHAR(30) NOT NULL CHECK (domain IN ('proses_bisnis','layanan','data','aplikasi','infrastruktur','keamanan')),
    kode       shared.business_code NOT NULL,
    nama       VARCHAR(200) NOT NULL,
    versi      VARCHAR(20) NOT NULL DEFAULT '1.0',
    deskripsi  TEXT,
    status     VARCHAR(20) NOT NULL DEFAULT 'Draf' CHECK (status IN ('Draf','Divalidasi','Ditetapkan','Dipublikasi','Direviu'))
);
CALL shared.apply_standard('eaw.reference', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_reference_kode ON eaw.reference (kode) WHERE deleted_at IS NULL;
ALTER TABLE eaw.entity_org_metadata ADD CONSTRAINT fk_entity_org_metadata_ref FOREIGN KEY (reference_id) REFERENCES eaw.reference(id);

-- ---------- Kerangka Kerja per Layanan Utama (AF-02) ----------
CREATE TABLE eaw.framework (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id     UUID NOT NULL REFERENCES ref.business_groups(id),
    layanan_utama VARCHAR(200) NOT NULL,
    tipe          VARCHAR(20) NOT NULL CHECK (tipe IN ('utama','pendukung')),
    status        VARCHAR(20) NOT NULL DEFAULT 'Draf' CHECK (status IN ('Draf','Divalidasi','Ditetapkan','Dipublikasi','Direviu'))
);
CALL shared.apply_standard('eaw.framework', 'internal', 'set.users');

-- ---------- Domain 1: Proses Bisnis ----------
CREATE TABLE eaw.process (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama            VARCHAR(200) NOT NULL,
    level           SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 3),
    parent_id       UUID REFERENCES eaw.process(id),
    pemilik_jabatan VARCHAR(100),
    input           TEXT,
    output          TEXT,
    referensi_id    UUID REFERENCES eaw.reference(id),
    entity_id       UUID NOT NULL REFERENCES ref.business_groups(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'Draf' CHECK (status IN ('Draf','Divalidasi','Ditetapkan','Dipublikasi','Direviu'))
);
CALL shared.apply_standard('eaw.process', 'internal', 'set.users');

-- ---------- Domain 2: Data & Informasi ----------
CREATE TABLE eaw.data_entity (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_kanonikal    VARCHAR(200) NOT NULL,
    klasifikasi       VARCHAR(20) NOT NULL CHECK (klasifikasi IN ('publik','internal','terbatas','rahasia')),
    pii               BOOLEAN NOT NULL DEFAULT FALSE,           -- penanda: entitas data BERISI PII di sumbernya (bukan menyimpan PII di EAP)
    steward           VARCHAR(100),
    sumber_otoritatif VARCHAR(100),                             -- mis. 'kalla_cmp.mdm.parties'
    retensi_hari      INTEGER CHECK (retensi_hari IS NULL OR retensi_hari >= 0),
    referensi_id      UUID REFERENCES eaw.reference(id),
    entity_id         UUID NOT NULL REFERENCES ref.business_groups(id),
    status            VARCHAR(20) NOT NULL DEFAULT 'Draf' CHECK (status IN ('Draf','Divalidasi','Ditetapkan','Dipublikasi','Direviu'))
);
CALL shared.apply_standard('eaw.data_entity', 'internal', 'set.users');

-- ---------- Domain 3: Layanan Enterprise ----------
CREATE TABLE eaw.service (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama         VARCHAR(200) NOT NULL,
    tipe         VARCHAR(20) NOT NULL CHECK (tipe IN ('internal','pelanggan-mitra')),
    kategori     VARCHAR(20) NOT NULL CHECK (kategori IN ('utama','pendukung')),
    pemilik      VARCHAR(100),
    slo          VARCHAR(200),
    kanal        VARCHAR(100),
    referensi_id UUID REFERENCES eaw.reference(id),
    entity_id    UUID NOT NULL REFERENCES ref.business_groups(id),
    status       VARCHAR(20) NOT NULL DEFAULT 'Draf' CHECK (status IN ('Draf','Divalidasi','Ditetapkan','Dipublikasi','Direviu'))
);
CALL shared.apply_standard('eaw.service', 'internal', 'set.users');

-- ---------- Domain 4: Aplikasi (APM) ----------
CREATE TABLE eaw.application (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode             shared.business_code NOT NULL,          -- mis. PANRITA-BASE (platform), PULSE (workspace)
    nama             VARCHAR(200) NOT NULL,
    platform         shared.business_code,                   -- kode platform induk bila berupa workspace (NULL = ini platform)
    workspace        VARCHAR(50),
    jenis            VARCHAR(20) NOT NULL CHECK (jenis IN ('umum','khusus')),
    workspace_mode   VARCHAR(30) NOT NULL DEFAULT 'INTERNAL_ROUTED' CHECK (workspace_mode IN ('FEDERATED_REMOTE','INTERNAL_ROUTED')),
    federation_scope VARCHAR(100),
    remote_entry_url VARCHAR(255),
    repo_git         VARCHAR(255),
    -- 4 metadata WAJIB (EAW-02 AC1/AC3): Pemilik Bisnis, Tim Pengembang, Risiko AI, SLO — tanpa itu penyimpanan ditolak
    owner_bisnis     VARCHAR(100) NOT NULL CHECK (btrim(owner_bisnis) <> ''),
    owner_teknis     VARCHAR(100) NOT NULL CHECK (btrim(owner_teknis) <> ''),   -- = Tim Pengembang
    risiko_ai        VARCHAR(20)  NOT NULL CHECK (risiko_ai IN ('none','low','medium','high')),
    slo              VARCHAR(200) NOT NULL CHECK (btrim(slo) <> ''),
    lifecycle        VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (lifecycle IN ('planned','active','deprecated','retired')),
    kritikalitas     VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (kritikalitas IN ('low','medium','high','critical')),
    referensi_id     UUID REFERENCES eaw.reference(id),
    entity_id        UUID NOT NULL REFERENCES ref.business_groups(id),
    status           VARCHAR(20) NOT NULL DEFAULT 'Draf' CHECK (status IN ('Draf','Divalidasi','Ditetapkan','Dipublikasi','Direviu')),
    -- jenis node: platform (mis. BASE; membawa profil UI/UX + tech stack) atau workspace (mis. AEGIS; di bawah platform).
    -- Diisi trigger dari `platform` bila tidak dinyatakan. Workspace Draf boleh belum ditempatkan (platform NULL); wajib terisi sebelum Divalidasi.
    jenis_node       VARCHAR(20) NOT NULL CHECK (jenis_node IN ('platform','workspace')),
    ui_standard      VARCHAR(300),                           -- profil platform: standar UI/UX shell (wajib sebelum platform Divalidasi)
    tech_stack       TEXT,                                   -- profil platform: tech stack (wajib sebelum platform Divalidasi)
    adopsi           BOOLEAN NOT NULL DEFAULT false,         -- workspace yang sudah ada sebelum EAP (bebas tiket ARB); hanya pemegang eaw.workspace.assign
    CONSTRAINT ck_application_node_platform CHECK (jenis_node = 'workspace' OR platform IS NULL),
    CONSTRAINT ck_application_node_workspace CHECK (jenis_node = 'platform' OR platform IS NOT NULL OR status = 'Draf'),
    CONSTRAINT ck_application_federated CHECK (workspace_mode <> 'FEDERATED_REMOTE' OR (federation_scope IS NOT NULL AND remote_entry_url IS NOT NULL)),
    CONSTRAINT ck_application_platform_self CHECK (platform IS NULL OR platform <> kode)
);
CALL shared.apply_standard('eaw.application', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_application_kode ON eaw.application (kode) WHERE deleted_at IS NULL;
CREATE INDEX ix_application_entity ON eaw.application (entity_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_application_status ON eaw.application (status) WHERE deleted_at IS NULL;
CREATE INDEX ix_application_platform ON eaw.application (platform) WHERE platform IS NOT NULL AND deleted_at IS NULL;
COMMENT ON TABLE eaw.application IS 'Katalog portofolio aplikasi (APM). Zero Pre-Seed. workspace_mode menentukan Module Federation 2.0 vs Internal Routed.';

-- ---------- Domain 5: Infrastruktur & Teknologi ----------
CREATE TABLE eaw.infra_asset (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama         VARCHAR(200) NOT NULL,
    tipe         VARCHAR(30) NOT NULL CHECK (tipe IN ('klaster-k8s','klaster-db','gpu','jaringan','cloud','dc-fisik')),
    lokasi       VARCHAR(100),
    kapasitas    VARCHAR(100),
    dr_tier      VARCHAR(20),
    referensi_id UUID REFERENCES eaw.reference(id),
    entity_id    UUID NOT NULL REFERENCES ref.business_groups(id),
    status       VARCHAR(20) NOT NULL DEFAULT 'Draf' CHECK (status IN ('Draf','Divalidasi','Ditetapkan','Dipublikasi','Direviu'))
);
CALL shared.apply_standard('eaw.infra_asset', 'internal', 'set.users');

-- ---------- Domain 6: Keamanan Informasi ----------
CREATE TABLE eaw.control (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aspek            VARCHAR(30) NOT NULL CHECK (aspek IN ('kerahasiaan','keutuhan','ketersediaan','keaslian','kenirsangkalan')),
    standar_rujukan  VARCHAR(100),
    status_penerapan VARCHAR(20) NOT NULL CHECK (status_penerapan IN ('belum','sebagian','penuh')),
    referensi_id     UUID REFERENCES eaw.reference(id),
    entity_id        UUID NOT NULL REFERENCES ref.business_groups(id),
    status           VARCHAR(20) NOT NULL DEFAULT 'Draf' CHECK (status IN ('Draf','Divalidasi','Ditetapkan','Dipublikasi','Direviu'))
);
CALL shared.apply_standard('eaw.control', 'internal', 'set.users');

-- ---------- Relasi antar objek (ArchiMate 3.2) ----------
CREATE TABLE eaw.relation (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sumber_type VARCHAR(20) NOT NULL,
    sumber_id   UUID NOT NULL,
    target_type VARCHAR(20) NOT NULL,
    target_id   UUID NOT NULL,
    tipe        VARCHAR(50) NOT NULL CHECK (tipe IN ('serving','used-by','association','composition','realization','access','assignment','flow','triggering')),
    kerangka_id UUID REFERENCES eaw.framework(id)
);
CALL shared.apply_standard('eaw.relation', 'internal', 'set.users');
CREATE INDEX ix_relation_sumber ON eaw.relation (sumber_type, sumber_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_relation_target ON eaw.relation (target_type, target_id) WHERE deleted_at IS NULL;

-- ---------- Alur tata kelola (AF-05): APPEND-ONLY ----------
CREATE TABLE eaw.workflow (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objek_type  VARCHAR(30) NOT NULL CHECK (objek_type IN ('application','reference','framework','process','data_entity','service','infra_asset','control','arb_clearance')),
    objek_id    UUID NOT NULL,
    status_dari VARCHAR(20) NOT NULL,
    status_ke   VARCHAR(20) NOT NULL,
    pelaku      UUID NOT NULL REFERENCES set.users(id),
    catatan     TEXT,
    waktu       TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ix_workflow_objek ON eaw.workflow (objek_type, objek_id, waktu);
COMMENT ON TABLE eaw.workflow IS 'Append-only (trigger menolak UPDATE/DELETE/TRUNCATE). Ditulis HANYA oleh eaw.transition() (SECURITY DEFINER).';

-- ---------- ADR (D-01 s/d D-14) ----------
CREATE TABLE eaw.adr (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    adr_code      VARCHAR(20) NOT NULL CHECK (adr_code ~ '^[A-Z0-9][A-Z0-9._-]*$'),
    title         VARCHAR(200) NOT NULL,
    context       TEXT NOT NULL,
    decision      TEXT NOT NULL,
    consequences  TEXT,
    status        VARCHAR(20) NOT NULL DEFAULT 'Proposed' CHECK (status IN ('Proposed','Accepted','Deprecated','Superseded')),
    superseded_by UUID REFERENCES eaw.adr(id),
    git_ref       VARCHAR(255),                               -- commit file Markdown di repositori `eap` (belum otomatis)
    CONSTRAINT ck_adr_superseded CHECK ((status = 'Superseded') = (superseded_by IS NOT NULL))
);
CALL shared.apply_standard('eaw.adr', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_adr_code ON eaw.adr (adr_code) WHERE deleted_at IS NULL;

-- tautan ADR → elemen model (EAW-04 AC3)
CREATE TABLE eaw.adr_link (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    adr_id     UUID NOT NULL REFERENCES eaw.adr(id) ON DELETE CASCADE,
    objek_type VARCHAR(30) NOT NULL CHECK (objek_type IN ('application','reference','framework','process','data_entity','service','infra_asset','control','arb_clearance')),
    objek_id   UUID NOT NULL
);
CALL shared.apply_standard('eaw.adr_link', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_adr_link ON eaw.adr_link (adr_id, objek_type, objek_id) WHERE deleted_at IS NULL;

-- ---------- Register ARB Clearance ----------
CREATE SEQUENCE eaw.arb_ticket_seq;
CREATE SEQUENCE eaw.arb_certificate_seq;
CREATE TABLE eaw.arb_clearance (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number   VARCHAR(50) NOT NULL DEFAULT ('ARB-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('eaw.arb_ticket_seq')::text, 4, '0')),
    proposed_by     UUID NOT NULL REFERENCES set.users(id),
    entity_id       UUID NOT NULL REFERENCES ref.business_groups(id),
    initiative_name VARCHAR(200) NOT NULL,
    business_case   TEXT NOT NULL,
    estimated_cost  NUMERIC(15,2) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
    ai_risk_score   NUMERIC(5,2) CHECK (ai_risk_score IS NULL OR ai_risk_score BETWEEN 0 AND 100),   -- skor redundansi MIND AI (belum otomatis)
    status          VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','IN_REVIEW','REVISION','APPROVED','REJECTED')),
    arb_notes       TEXT,
    decided_by      UUID REFERENCES set.users(id),
    decided_at      TIMESTAMPTZ,
    certificate_id  VARCHAR(100),
    CONSTRAINT ck_arb_decision CHECK ((status IN ('APPROVED','REJECTED')) = (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
    CONSTRAINT ck_arb_certificate CHECK ((status = 'APPROVED') = (certificate_id IS NOT NULL)),
    CONSTRAINT ck_arb_four_eyes CHECK (decided_by IS NULL OR decided_by <> proposed_by)
);
CALL shared.apply_standard('eaw.arb_clearance', 'internal', 'set.users');
-- tiket ARB yang menjadi dasar pendaftaran aplikasi (FK maju: arb_clearance dibuat setelah application)
ALTER TABLE eaw.application ADD COLUMN arb_clearance_id UUID REFERENCES eaw.arb_clearance(id);
CREATE UNIQUE INDEX ux_arb_ticket ON eaw.arb_clearance (ticket_number) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_arb_certificate ON eaw.arb_clearance (certificate_id) WHERE certificate_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_arb_status ON eaw.arb_clearance (status) WHERE deleted_at IS NULL;
CREATE INDEX ix_arb_entity ON eaw.arb_clearance (entity_id) WHERE deleted_at IS NULL;

-- ---------- Registry aplikasi yang DIPUBLIKASIKAN ke CMP (ref.applications) ----------
-- Hanya aplikasi berstatus Dipublikasi yang tampak di CMP; nama kolom = kolom ref.applications di kalla_cmp (cmp/database/020_ref.sql).
-- Dipelihara trigger (210). Publikasi logis pub_eap_ref membacanya (295).
CREATE TABLE eaw.application_registry (
    id               UUID PRIMARY KEY,                -- = eaw.application.id
    parent_id        UUID,
    code             VARCHAR(50)  NOT NULL,
    qualified_code   VARCHAR(120) NOT NULL,
    name             VARCHAR(200) NOT NULL,
    application_kind VARCHAR(20)  NOT NULL CHECK (application_kind IN ('platform','workspace')),
    lifecycle_status VARCHAR(20)  NOT NULL,
    deleted_at       TIMESTAMPTZ,
    row_version      INTEGER NOT NULL DEFAULT 1
);
COMMENT ON TABLE eaw.application_registry IS 'Proyeksi eaw.application (Dipublikasi saja) untuk replika ref.applications di CMP. JANGAN ditulis langsung.';
