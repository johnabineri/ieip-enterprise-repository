# SAF — SAORAJA Architecture Framework (Kerangka Kerja Arsitektur Enterprise Korporat)
### Kerangka Kerja Arsitektur Enterprise Korporat untuk SAORAJA (EAP)

| Atribut Dokumen | Nilai Spesifikasi |
|---|---|
| **Nomor Dokumen** | `KEIS-EAP-SAF-2026-V3.0` |
| **Status Dokumen** | **Baseline Aktif / Disetujui (Approved Baseline)** |
| **Cakupan** | Kerangka arsitektur enterprise korporat yang dikelola di SAORAJA (EAP/EAW) |
| **Dasar** | Standar TOGAF ADM 10, ArchiMate 3.2, dan best-practice tata kelola enterprise holding terpadu |
| **Klasifikasi** | Dokumen Internal Terbatas (Confidential & Proprietary) |
| **Tanggal Terbit** | 2026 |
| **Dokumen Induk** | [PRD.md](./PRD.md) — Product Requirements Document EAP |
| **Spesifikasi Teknis** | [SRS.md](./SRS.md) — Software Requirements Specification EAP |
| **Peta Struktur Platform** | [Project.md](../Project.md) — SSOT Struktur Platform, Database & Organisasi |

Yang diadopsi: 6 domain arsitektur SAORAJA, Referensi Arsitektur Korporat (KRA), satu kerangka kerja per layanan utama, metadata per domain, alur Susun → Validasi → Tetapkan → Reviu, dan hak akses berjenjang per entitas.

---

## DAFTAR ISI

1. [Pemetaan Istilah](#1-pemetaan-istilah)
2. [Keputusan Terkunci (AF-01 s/d AF-08)](#2-keputusan-terkunci)
3. [Domain → Referensi Arsitektur Korporat → KEIS](#3-domain--referensi-arsitektur-korporat--keis)
4. [Kerangka Kerja per Layanan Utama](#4-kerangka-kerja-per-layanan-utama)
5. [Model Metadata EAW](#5-model-metadata-eaw)
6. [Tata Kelola](#6-tata-kelola)
   * 6.1 Peran dan Hak Akses
   * 6.2 Alur Tata Kelola
   * 6.3 Indeks Kematangan Arsitektur SAORAJA (IKA)
7. [Fitur & Acceptance Criteria](#7-fitur--acceptance-criteria)
8. [Prinsip Bootstrap — EAP Dimulai Kosong](#8-prinsip-bootstrap--eap-dimulai-kosong)

---

## 1. Pemetaan Istilah

| Konsep Konvensional | Standar SAORAJA (SAF) |
|---|---|
| Arsitektur Enterprise Holding | Arsitektur Holding Korporat + Referensi Arsitektur Korporat (KRA) |
| Arsitektur Entitas / Anak Perusahaan | Arsitektur Ecosystem / SBU / Unit Usaha |
| Referensi Arsitektur Acuan | **KRA** — ditetapkan Holding EA Office; wajib dirujuk semua entitas |
| Layanan Internal Korporat | **Layanan Internal Korporat** (SDM, keuangan, risiko, mutu, arsip, aset ICT) |
| Layanan Pelanggan & Rekanan | **Layanan Pelanggan & Mitra** (dealer, fleet rent, aspal, beton, konstruksi, properti, transportasi) |
| Aplikasi Umum / Aplikasi Khusus | **Aplikasi Umum** = platform holding (EAP, CMP, OLP, SSP, B-LINK, BASE, SVP) · **Aplikasi Khusus** = workspace STRIDE per SBU |
| Penghubung Layanan Integrasi | **EIO (Enterprise Integration Orchestrator)** |
| Unit Tata Laksana | Pemilik proses (PACE) |
| Unit TIK | Holding EA Office / ICT |
| Keputusan Pimpinan Instansi | Keputusan Direksi / ARB |
| Workbench Arsitektur | **EAW (Enterprise Architecture Workbench)** |
| Indikator Kematangan Arsitektur (level 1–5) | **IKA** — Indeks Kematangan Arsitektur SAORAJA (Bab 6) |
| Satu Data Korporasi | **Satu Data Korporasi via SEDDI (CMP)** — Golden Record & publikasi CDC (`pub_cmp_ref`) |

---

## 2. Keputusan Terkunci

| ID | Keputusan |
|---|---|
| AF-01 | Arsitektur SAORAJA memakai **6 domain**: Proses Bisnis, Data & Informasi, Layanan, Aplikasi, Infrastruktur, Keamanan. Notasi ArchiMate 3.2: Proses/Layanan → Business Layer, Data → Business & Application Layer (*data object*), Aplikasi → Application Layer, Infrastruktur → Technology Layer, Keamanan → *cross-cutting* |
| AF-02 | **Satu Kerangka Kerja per Layanan Utama** unit usaha, beserta layanan pendukungnya; setiap Kerangka Kerja wajib mengisi keenam domain |
| AF-03 | Hierarki kepemilikan 4 tingkat: **Holding → Ecosystem → SBU/PT → Unit Usaha**. **Ecosystem** hanya tingkat pengelompokan manajemen (bukan badan hukum; tidak ada laporan keuangan konsolidasi pada tingkat ini). Hak edit pada entitas sendiri dan turunannya; hak lihat pada objek berstatus *Dipublikasi* |
| AF-04 | **KRA** hanya dapat diubah Holding EA Office; objek entitas wajib tertaut ke objek KRA, jika tidak validasi ditolak |
| AF-05 | Status objek: **Draf → Divalidasi → Ditetapkan → Dipublikasi → Direviu**. Hanya *Ditetapkan* yang menjadi baseline |
| AF-06 | **GSE-01 hanya berjalan untuk Aplikasi yang sudah terdaftar di EAW dengan status minimal *Divalidasi*** |
| AF-07 | Arsitektur direviu minimal **1× per tahun** dan setiap ada platform/workspace/integrasi EIO baru |
| AF-08 | Dokumen Arsitektur untuk Keputusan Direksi **dihasilkan otomatis** dari data EAW, bukan ditulis manual |

---

## 3. Domain → Referensi Arsitektur Korporat → KEIS

| Domain | Isi KRA | Sumber di KEIS |
|---|---|---|
| **Proses Bisnis** | Peta proses 3 level: L1 rantai nilai unit usaha, L2 proses, L3 sub-proses | PACE (pemilik proses), model di EAW |
| **Layanan** | Katalog layanan Internal Korporat dan Pelanggan & Mitra, dengan SLO | EAW; layanan internal dari BASE/SSP, layanan pelanggan & mitra dari B-LINK (FORGE/VANTAGE) dan STRIDE |
| **Data & Informasi** | Kamus data kanonikal (Party, Customer, Product, Order, Invoice, Payment, Employee, Asset, Document, Location), klasifikasi, pemilik data | EIO-01 (model kanonikal), CMP/MDM (master data), OLP (warehouse) |
| **Aplikasi** | Registri platform & workspace dari `Project.md`, jenis Umum/Khusus | EAW-02 |
| **Infrastruktur** | Klaster Kubernetes, klaster PostgreSQL, GPU on-prem, jaringan | OPTIMA (aset ICT), PRD §3 & §5 |
| **Keamanan** | Kontrol per aspek: kerahasiaan, keutuhan, ketersediaan, keaslian, kenirsangkalan | SEC-01 (lihat pemetaan kontrol di bawah) |

**Kontrol keamanan per aspek:**

| Aspek | Kontrol baseline |
|---|---|
| Kerahasiaan | Masking PII otomatis; data sensitif hanya model on-prem; enkripsi *at-rest* dan TLS 1.3 |
| Keutuhan | *Audit trail* append-only; ADR dan status Ditetapkan tidak dapat diubah, hanya direvisi dengan versi baru |
| Ketersediaan | HA Patroni/CloudNativePG; RPO/RTO sesuai PRD §12 (NFR-13) |
| Keaslian | SSO, RBAC (`set`), identitas non-manusia via SPIFFE |
| Kenirsangkalan | Setiap transisi status dan penetapan tercatat dengan identitas pelaku dan waktu |

---

## 4. Kerangka Kerja per Layanan Utama

| Entitas | Layanan Utama | Aplikasi Khusus (STRIDE) |
|---|---|---|
| PT. Hadji Kalla — Dealer Toyota | Penjualan kendaraan | STRIDE-Hk: ASI |
| PT. Hadji Kalla — Service & Parts | Servis dan suku cadang | STRIDE-Hk: ASM |
| PT. Bumi Lintas Tama | Distribusi material tambang | STRIDE-Future |
| PT. Bumi Jasa Utama | Fleet rent (rental mobil) | STRIDE-Future |
| PT. Bumi Logistik Utama | Pengiriman, pergudangan, truk, penyimpanan kendaraan | STRIDE-Future |
| Cahaya Bone PO | Perjalanan antar kota/provinsi di Sulawesi, bus pariwisata, kirim barang kapasitas kecil | STRIDE-Future |
| PT. Bumi Sarana Utama — Aspal Curah | Agen aspal curah Pertamina | STRIDE-Bsu: AV |
| PT. Bumi Sarana Utama — Aspal Emulsi | Produksi aspal emulsi CSS-1 dan CRS-1 | STRIDE-Bsu: AEPS |
| PT. Bumi Sarana Beton | Produksi dan pemasaran beton pracetak | STRIDE-Future |
| PT. Bumi Karsa | Kontraktor PU dan NON-PU | STRIDE-Future |
| PT. Baruga Asrinusa Development | Pengembangan real estate | STRIDE-Future |

**Layanan pendukung bersama (dipakai semua Kerangka Kerja):** SDM (PULSE, APEX, ESS, LEA/AGILE) · Risiko (AEGIS) · Mutu & GRC (FORTRESS) · Improvement (PACE) · Audit internal (INTEGRA) · Arsip (ARCHI) · Aset ICT (OPTIMA) · Keuangan (FIA, CORE) · Analitik (VANGUARD, ACCORD) · Pelanggan (CORTEX) · Rantai pasok & gudang (CSC, FLOW).

---

## 5. Model Metadata EAW

Disimpan di database `eap`, skema `eaw`.

| Domain | Tabel | Atribut wajib | Relasi wajib |
|---|---|---|---|
| Struktur | `eaw.entity_org` | id, kode, nama, tingkat (holding/ecosystem/sbu/unit), parent_id | — |
| Referensi | `eaw.reference` | id, domain, kode, nama, versi, status | — |
| Kerangka | `eaw.framework` | id, entity_id, layanan_utama, tipe (utama/pendukung), status | memuat objek 6 domain |
| Proses Bisnis | `eaw.process` | id, nama, level (1–3), parent_id, pemilik_jabatan, input, output, referensi_id | menghasilkan Layanan; memakai Entitas Data; dilayani Aplikasi |
| Layanan | `eaw.service` | id, nama, tipe (internal/pelanggan-mitra), kategori (utama/pendukung), pemilik, SLO, kanal, referensi_id | ≥ 1 Proses; ≥ 1 Aplikasi |
| Data & Informasi | `eaw.data_entity` | id, nama_kanonikal, klasifikasi (publik/internal/terbatas/rahasia), pii (Y/N), steward, sumber_otoritatif (db.schema), retensi_hari, referensi_id | dipakai ≥ 1 Proses; disimpan di ≥ 1 Aplikasi |
| Aplikasi | `eaw.application` | id, kode, platform, workspace, jenis (umum/khusus), workspace_mode (FEDERATED_REMOTE/INTERNAL_ROUTED), repo_git, owner_bisnis, owner_teknis, lifecycle, kritikalitas, risiko_ai, SLO, referensi_id | ≥ 1 Layanan; ≥ 1 Proses; ≥ 1 Entitas Data; 1 Infrastruktur; ≥ 1 Kontrol |
| Infrastruktur | `eaw.infra_asset` | id, nama, tipe (klaster-k8s/klaster-db/gpu/jaringan/cloud/dc-fisik), lokasi, kapasitas, dr_tier, referensi_id | menjalankan ≥ 1 Aplikasi |
| Keamanan | `eaw.control` | id, aspek, standar_rujukan, status_penerapan, referensi_id | menjaga Aplikasi/Data/Infrastruktur |
| Relasi | `eaw.relation` | id, sumber, target, tipe (ArchiMate), kerangka_id | — |
| Alur | `eaw.workflow` | id, objek, status_dari, status_ke, pelaku, waktu, catatan | append-only |

**Catatan sinkronisasi (ADR-CMP-003):** setelah CMP W0 produksi, `eaw.entity_org` tidak lagi otonom — EAP membaca struktur organisasi dari replika `ref.business_groups` / `ref.companies` (CDC dari `kalla_cmp.mdm`), dan `eaw.entity_org` menjadi view/tabel tersinkron. Atribut arsitektur tambahan (status IKA, tier, tautan KRA) tetap disimpan EAP pada `eaw.entity_org_metadata` (FK ke `ref.business_groups.id`).

**Modul `shared` (ADR-CMP-004):** tabel `shared.audit_logs`, `shared.documents`, `shared.outbox` berstruktur identik dengan `kalla_cmp.shared` (sumber kebenaran `010_shared.sql`). Yang berbeda hanya parameter **`shared.apply_standard(p_user_table)`** saat dipanggil pada *tabel domain*: `set.users` di EAP, `iam.users` di CMP.

Semua tabel domain (`eaw.process`, `eaw.service`, `eaw.data_entity`, `eaw.application`, `eaw.infra_asset`, `eaw.control`) beserta `eaw.framework` memuat `entity_id` (pemilik), `status` (AF-05), dan `created_at`. `eaw.entity_org` dan `eaw.reference` memuat `status`; `eaw.relation` dan `eaw.adr` bersifat referensial/append-only; `eaw.workflow` menyimpan `pelaku` dan `waktu` setiap transisi. Atribut pelaku pada seluruh mutasi dicatat di `kalla_eap.shared.audit_logs` (append-only, struktur identik lintas platform KEIS — lihat SRS §5.2 & §8.4).

---

## 6. Tata Kelola

### 6.1 Peran dan Hak Akses (V = lihat, E = edit)

| Peran | Padanan Role PRD §13.1 | Lingkup | Hak |
|---|---|---|---|
| Holding EA Office | `ROLE_EAP_ARB_CHAIR` + Domain Architects (Tier 2) | Seluruh hierarki | E semua objek dan KRA; validasi akhir; publikasi |
| ARB | `ROLE_EAP_ARB_CHAIR` | Seluruh hierarki | V semua; **menetapkan** |
| Architect Ecosystem / SBU | `ROLE_EAP_SBU_ARCHITECT` | Entitas sendiri dan turunan | E objek sendiri; V objek *Dipublikasi* entitas lain |
| Pemilik proses (PACE) | `ROLE_EAP_BPO` | Entitas sendiri | E domain Proses Bisnis dan Layanan |
| Owner Data / Infrastruktur / Keamanan | `ROLE_EAP_DATA_ARCHITECT`, `ROLE_EAP_INFRA_ARCHITECT`, `ROLE_EAP_SECURITY_ARCHITECT` | Entitas sendiri | E domain masing-masing |
| Auditor (INTEGRA) dan Risiko (AEGIS) | `ROLE_EAP_AUDITOR` | Seluruh hierarki | V semua termasuk Draf (read-only) |
| Karyawan | Seluruh pengguna terautentikasi | Seluruh hierarki | V objek *Dipublikasi* |

Hak ditegakkan lewat skema `kalla_eap.set`. Akses di luar lingkup ditolak (403) dan dicatat.

### 6.2 Alur Tata Kelola

1. Architect entitas menyusun objek (**Draf**); pemilik proses dan owner domain melengkapi.
2. Holding EA Office memeriksa tautan ke KRA dan kelengkapan relasi (**Divalidasi**).
3. ARB menetapkan lewat Keputusan Direksi/ARB (**Ditetapkan**); ADR terbit (EAW-04).
4. Objek **Dipublikasi** dan menjadi baseline GSE, lineage, dan dashboard.
5. **Direviu** sesuai AF-07; revisi membuat versi baru, versi lama tetap tersimpan.

### 6.3 Indeks Kematangan Arsitektur SAORAJA (IKA)

| Level | Kriteria |
|---|---|
| 1 | Belum ada arsitektur terdokumentasi di EAW |
| 2 | Terisi sebagian domain/referensi; belum Ditetapkan |
| 3 | Keenam domain terisi untuk seluruh referensi; **Ditetapkan** dan termuat di EAW |
| 4 | Relasi antar-domain lengkap (aturan relasi §7); lineage aktif; tertaut ke Git dan katalog EIO |
| 5 | Penyimpangan model vs repo/EIO terdeteksi otomatis; reviu rutin berjalan; menjadi *gate* GSE (AF-06) |

---

## 7. Fitur & Acceptance Criteria

| ID | Fitur | Acceptance Criteria |
|---|---|---|
| EAW-05 | **Framework Builder:** buat Kerangka Kerja per layanan utama, isi 6 domain, validasi kelengkapan relasi (Bab 5) | Status *Divalidasi* ditolak bila ada objek tanpa relasi wajib atau tanpa tautan KRA; pesan galat menyebut objek dan relasi yang kurang |
| EAW-06 | **KRA Manager:** referensi arsitektur per domain, berversi; hanya Holding EA Office yang dapat mengubah | 100% objek entitas tertaut ke referensi; perubahan KRA menandai objek terdampak untuk reviu |
| EAW-07 | **Workflow & Akses Berjenjang:** status AF-05, matriks hak 6.1 | Transisi hanya oleh peran berwenang; setiap transisi tercatat di `eaw.workflow` (append-only); akses di luar lingkup → 403 dan tercatat |
| EAW-08 | **Dashboard IKA & Kelengkapan** per entitas dan domain (perluasan GOV-01) | Skor IKA dihitung otomatis dari data; tersedia per entitas, per domain, dan tren per periode |
| EAW-09 | **Impor/Ekspor & Dokumen Arsitektur:** impor CSV/Open Group Exchange dengan validasi; ekspor dokumen Arsitektur (PDF/Markdown) per Kerangka Kerja (AF-08) | Impor 100% tervalidasi skema sebelum commit; dokumen terbit otomatis memuat 6 domain, diagram, dan matriks relasi |
| GSE-01 *(ubah)* | Gerbang registri (AF-06) | Permintaan scaffolding untuk Aplikasi yang tidak terdaftar atau berstatus Draf ditolak dengan alasan |

**Aturan relasi (dasar validasi EAW-05):** setiap Layanan punya ≥ 1 Proses; setiap Aplikasi punya ≥ 1 Layanan, ≥ 1 Proses, ≥ 1 Entitas Data, 1 Infrastruktur, ≥ 1 Kontrol; setiap Entitas Data punya steward dan sumber otoritatif; setiap Kerangka Kerja memuat objek di keenam domain.

---

## 8. Prinsip Bootstrap — EAP Dimulai Kosong

EAP adalah **platform pertama yang dibangun** dalam ekosistem KEIS. Pada saat EAP pertama kali berjalan, tidak ada satu pun platform lain (CMP, OLP, BASE, STRIDE, dll.) yang sudah terdaftar di dalamnya. Seluruh isi katalog arsitektur — platform, workspace, proses bisnis, entitas data, infrastruktur, kerangka kerja — **diisi oleh Architect melalui EAW**, bukan di-seed otomatis dari kode.

Ini adalah keputusan desain yang fundamental:

| Pendekatan | Konsekuensi |
|---|---|
| ❌ Pre-seed dari kode | EAP bergantung pada kode yang mencerminkan dunia nyata → stale, tidak bisa diaudit, tidak mencerminkan realitas aktual organisasi |
| ✅ Diisi melalui EAW | Setiap entri adalah keputusan sadar Architect yang divalidasi dan ditetapkan melalui alur AF-05 → dapat diaudit, berversi, dan mencerminkan kondisi nyata |

### 8.1 Apa yang Ada Sejak Awal (Bootstrap Minimal)

Satu-satunya hal yang ada sejak EAP pertama berjalan adalah **skema database dan konfigurasi sistem**:

- Schema `set`: role, permission, dan akun admin pertama (via IdP Keycloak)
- Schema `eaw`: tabel kosong, siap diisi
- Schema `gse`, `console`, `shared`: tabel kosong (`shared` mengikuti modul bersama KEIS — ADR-CMP-004)
- Schema `ref`: kosong sampai langganan CDC `pub_cmp_ref` dari SEDDI diaktifkan (Fase 2)
- Referensi teknis minimal: tipe domain (6 domain), status objek (Draf/Divalidasi/...) — ini adalah constraint database, bukan data bisnis

**Tidak ada** entitas `eaw.entity_org`, `eaw.application`, `eaw.framework`, `eaw.process`, atau data apapun yang di-hardcode dari `Project.md` atau struktur organisasi.

### 8.2 Urutan Pengisian oleh Architect

Setelah EAP live, Holding EA Office mengisi katalog secara berurutan melalui EAW:

```
Langkah 1: Daftarkan Struktur Entitas (eaw.entity_org)
  → Holding PT Kalla Group
  → Ecosystem: Kalla Automotive, Kalla Construction, Kalla Transport, Kalla Land
  → SBU: PT Hadji Kalla, PT Bumi Sarana Utama, PT Bumi Karsa, dst.

Langkah 2: Daftarkan Referensi Arsitektur / KRA (eaw.reference)
  → KRA per 6 domain: Proses Bisnis, Layanan, Data, Aplikasi, Infrastruktur, Keamanan

Langkah 3: Daftarkan Platform & Workspace sebagai Aplikasi (eaw.application)
  → EAP sendiri (sebagai platform pertama yang terdaftar)
  → CMP, OLP, BASE, SSP, B-LINK, SVP (saat masing-masing mulai dibangun)
  → STRIDE-Hk, STRIDE-Bsu (saat direncanakan/dibangun)

Langkah 4: Daftarkan Kerangka Kerja per SBU (eaw.framework)
  → 11 Kerangka Kerja sesuai SAF §4

Langkah 5: Isi 6 Domain per Kerangka Kerja
  → Proses Bisnis, Data & Informasi, Layanan, Aplikasi, Infrastruktur, Keamanan
  (entitas: eaw.process, eaw.data_entity, eaw.service, eaw.application, eaw.infra_asset, eaw.control)
  → Domain 2: daftarkan 29 entitas master CMP (DD-01 Party s/d DD-13 Identity) sebagai SoR
    `kalla_cmp.mdm` / `kalla_cmp.iam` — pendaftaran manual via EAW, bukan seed otomatis (cmp/SRS §8.2)

Langkah 6: Tetapkan Relasi antar Domain (eaw.relation)
Langkah 7: Lalui alur validasi → penetapan → publikasi (AF-05)
```

### 8.3 Target IKA Awal (Setelah Pengisian Oleh Architect)

Setelah Holding EA Office menyelesaikan pengisian tahap awal:

| Jenis Platform | Target IKA |
|---|---|
| Aplikasi Umum (platform holding: EAP, CMP, OLP, BASE, SSP, B-LINK, SVP) | Level 3 |
| Aplikasi Khusus (STRIDE-Hk, STRIDE-Bsu) | Level 2 |

Target ini **bukan kondisi saat deployment EAP**, melainkan **sasaran setelah periode onboarding** yang dilakukan oleh tim Architect (estimasi: 1–3 bulan setelah EAP live, sesuai Fase 1 roadmap).
