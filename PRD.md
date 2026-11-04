# PRD — PRODUCT REQUIREMENTS DOCUMENT
## SAORAJA — Enterprise Architecture Platform (EAP)
### Meta-Platform Komando Arsitektur, Tata Kelola & Generator Lini Platform PANRITA

**Brand:** SAORAJA · **Tagline:** Satu Arsitektur, Satu Fondasi, Satu Rumah, Satu Tujuan
*(Single Source of Architecture Truth & Generative Software Engineering Engine)*

| Atribut Dokumen | Nilai Spesifikasi |
|---|---|
| **Nomor Dokumen** | `KEIS-EAP-PRD-2026-V3.0` |
| **Status Dokumen** | **Baseline Aktif / Disetujui (Approved Baseline)** |
| **Target Ekosistem** | Universal Enterprise Ecosystem (Dapat diadopsi Holding, Ecosystem, SBU, maupun Multi-Perusahaan) |
| **Klasifikasi** | Dokumen Internal Terbatas (Confidential & Proprietary) |
| **Tanggal Terbit** | 2026 |
| **Dokumen Teknis Terkait** | [SRS.md](./SRS.md) — Software Requirements Specification EAP |
| **Kerangka Kerja Arsitektur**| [SAF.md](./SAF.md) — SAORAJA Architecture Framework |
| **Peta Struktur Platform** | [Project.md](../Project.md) — SSOT Struktur Platform, Database & Organisasi |
| **Dokumen Pendamping Data** | [cmp/PRD.md](../cmp/PRD.md) — SEDDI Corporate Master Platform (CMP) |

---

## DAFTAR ISI

1. [Identitas Platform, Filosofi & Paradigma Arsitektur](#1-identitas-platform-filosofi--paradigma-arsitektur)
   * 1.1 Brand: SAORAJA
   * 1.2 Tiga Peran Pokok EAP
   * 1.3 Posisi Dual-Core terhadap SEDDI (CMP)
   * 1.4 Melahirkan Lini Platform PANRITA-[Platform]
   * 1.5 Paradigma Frontend: Unified App Shell & Kondisional Module Federation 2.0
2. [Pendahuluan, Latar Belakang & Masalah Bisnis](#2-pendahuluan-latar-belakang--masalah-bisnis)
   * 2.1 Visi & Tujuan Strategis EAP
   * 2.2 Masalah Bisnis Utama (10 Enterprise Pain Points)
   * 2.3 Solusi Fundamental terhadap Beban "1 Karyawan 10 Aplikasi"
   * 2.4 Prinsip Bootstrap: EAP Dimulai Kosong sebagai Pengatur Aktif
   * 2.5 Struktur Stakeholder Utama
3. [Ruang Lingkup Produk & Peta Platform PANRITA](#3-ruang-lingkup-produk--peta-platform-panrita)
   * 3.1 Peta Lengkap Platform Ekosistem
   * 3.2 Lima Workspace Utama EAP (EAW, GSE, REQ, CONSOLE, SET)
   * 3.3 Hierarki Menu Navigasi EAP
   * 3.4 Batasan Ruang Lingkup (Out of Scope)
4. [Kerangka Kerja Arsitektur SAORAJA (SAF) & Prinsip Satu Data Korporasi](#4-kerangka-kerja-arsitektur-saoraja-saf--prinsip-satu-data-korporasi)
   * 4.1 Transformasi Konseptual: Adopsi Standar Arsitektur Enterprise Korporat
   * 4.2 Matriks 6 Domain Arsitektur SAORAJA
   * 4.3 Prinsip "Satu Data Korporasi" — Adopsi Bersama SEDDI
   * 4.4 Peran Penyelenggara Data Korporasi
5. [Cetak Biru 6 Domain Arsitektur SAORAJA](#5-cetak-biru-6-domain-arsitektur-saoraja)
   * 5.1 Domain 1: Proses Bisnis (Business Architecture)
   * 5.2 Domain 2: Data & Informasi (Data Architecture)
   * 5.3 Domain 3: Layanan Enterprise (Service Architecture)
   * 5.4 Domain 4: Aplikasi & Integrasi (Application Architecture)
   * 5.5 Domain 5: Infrastruktur & Teknologi (Infrastructure Architecture)
   * 5.6 Domain 6: Keamanan Informasi (Security Architecture)
6. [Tata Kelola, Architecture Review Board (ARB) & MIND AI Copilot](#6-tata-kelola-architecture-review-board-arb--mind-ai-copilot)
   * 6.1 Tujuan ARB Clearance (Anti-Redundansi)
   * 6.2 Alur Kerja ARB Clearance Terintegrasi
   * 6.3 Gate AF-06: Penegakan Scaffolding GSE
   * 6.4 Validasi Kepatuhan Satu Data pada Pengajuan Baru
   * 6.5 Tiga Kapabilitas Kunci MIND AI Architecture Copilot
7. [Pembagian Peran: SAORAJA (EAP) vs SEDDI (CMP)](#7-pembagian-peran-saoraja-eap-vs-seddi-cmp)
   * 7.1 Matriks Peran: Design & Governance vs Golden Record
   * 7.2 Tujuh Domain Data Master di SEDDI
   * 7.3 Aturan Konsumen & Larangan Duplikasi Data Lokal
8. [Acceptance Criteria Modul (Kriteria Penerimaan Fitur)](#8-acceptance-criteria-modul-kriteria-penerimaan-fitur)
   * 8.1 EAW (Enterprise Architecture Workbench)
   * 8.2 GSE (Generative Software Engineering Engine)
   * 8.3 REQ (Requirement Elicitation Chatbot)
   * 8.4 EIO (Enterprise Integration Orchestrator)
   * 8.5 Tata Kelola, Keamanan & FinOps (GOV, SEC, FIN, OPS)
   * 8.6 SET/RBAC Module
9. [Architecture Decisions (D-01 s/d D-14)](#9-architecture-decisions-d-01-sd-d-14)
10. [Keputusan Terkunci Kerangka Kerja SAORAJA (AF-01 s/d AF-08)](#10-keputusan-terkunci-kerangka-kerja-saoraja-af-01-sd-af-08)
11. [Kebutuhan Fungsional (Functional Requirements)](#11-kebutuhan-fungsional-functional-requirements)
12. [Kebutuhan Non-Fungsional (Non-Functional Requirements)](#12-kebutuhan-non-fungsional-non-functional-requirements)
13. [Struktur Roles, RACI Matrix & Organisasi](#13-struktur-roles-raci-matrix--organisasi)
    * 13.1 Taksonomi 13 Role Resmi
    * 13.2 Matriks Hak Akses & RACI Komprehensif
14. [Roadmap Pengembangan & Tahapan Sprint](#14-roadmap-pengembangan--tahapan-sprint)
15. [Kriteria Keberhasilan & KPI Ekosistem](#15-kriteria-keberhasilan--kpi-ekosistem)

---

## 1. Identitas Platform, Filosofi & Paradigma Arsitektur

### 1.1 Brand: SAORAJA
**SAORAJA** (dalam falsafah Bugis/Makassar berarti "rumah besar" atau "istana para pemangku kebijakan") adalah nama brand resmi platform EAP (*Enterprise Architecture Platform*). SAORAJA melambangkan "Istana Arsitektur Enterprise" — fondasi kokoh dan agung tempat seluruh rancang bangun proses bisnis, data, aplikasi, dan infrastruktur korporasi bertumpu dan diselaraskan secara transparan, tertib, dan harmonis.

| Huruf | Kepanjangan Strategis | Makna dalam Tata Kelola Enterprise |
|---|---|---|
| **S** | **Strategic Alignment** | EA sebagai instrumen penyelarasan visi strategis bisnis korporasi dengan kapabilitas TI. |
| **A** | **Architecture Blueprint** | Cetak biru digital terpadu kondisi saat ini (*Current State*) menuju masa depan (*Target State*). |
| **O** | **Operational Optimization** | Merampingkan rantai nilai, mengeliminasi proses ganda, dan memangkas inefisiensi capex/opex. |
| **R** | **Resource Integration** | Menghubungkan SDM, data induk, aplikasi, dan komputasi tanpa silo antar entitas. |
| **A** | **Agile Adaptation** | Kelincahan beradaptasi secara presisi terhadap disrupsi pasar dan regulasi pemerintah. |
| **J** | **Joint Governance** | Kepatuhan terpusat, standar bersama, audit trail mutlak, dan pengawasan terpadu. |
| **A** | **Analytical Insight & Value** | Pengambilan keputusan investasi TI berbasis data nyata arsitektur untuk penciptaan nilai berlanjut. |

### 1.2 Tiga Peran Pokok EAP
SAORAJA adalah **meta-platform enterprise** yang menjalankan tiga peran fundamental sekaligus:

1. **EA Repository (Repositori Arsitektur Enterprise Terpadu):**
   Repositori digital arsitektur enterprise grup berbasis standar **TOGAF ADM 10 & ArchiMate 3.2** melalui workspace **EAW** (*Enterprise Architecture Workbench*). Mengelola secara dinamis 6 domain arsitektur, peta kapabilitas bisnis (*Business Capability Map*), inventaris portofolio aplikasi (*Application Portfolio Management - APM*), kamus data kanonikal, silsilah data (*data lineage*), dan ketergantungan lintas entitas.

2. **Web-Based GSE & Agentic Builder (Engine Rekayasa Software Generatif):**
   Lingkungan rekayasa perangkat lunak berbasis web yang memanfaatkan agen cerdas (*Agentic AI*) untuk merancang, mengonfigurasi, men-scaffold boilerplate kode full-stack, dan mengorkestrasi rilis workspace baru di seluruh ekosistem melalui workspace **GSE** (*Generative Software Engineering*).

3. **Git-Centric Multi-Repository Orchestrator (Orkestrator Git Terpusat):**
   Setiap platform dan workspace diatur dalam repositori Git mandiri (D-02). SAORAJA bertindak sebagai orkestrator yang menghasilkan kode sumber (React 19 TS, NestJS/Go), spesifikasi kontrak OpenAPI 3.1, skema DDL PostgreSQL, pipeline CI/CD, dan manifest konfigurasi (*Everything-as-Code*) langsung ke repositori Git target via feature branch & Pull Request (PR).

### 1.3 Posisi Dual-Core terhadap SEDDI (CMP)
Di dalam arsitektur sistem informasi enterprise, SAORAJA (EAP) dan SEDDI (CMP) membentuk **Dua Pilar Fondasi Utama (Dual-Core)**:

```
+------------------------------------------------------------------------------------+
|                         DUAL-CORE ENTERPRISE FOUNDATION                            |
+------------------------------------------------------------------------------------+
|                                                                                    |
|   +------------------------------------+   +------------------------------------+  |
|   |         SAORAJA — EAP              |   |            SEDDI — CMP             |  |
|   |  (Enterprise Architecture Platform)|   |    (Corporate Master Platform)     |  |
|   |                                    |   |                                    |  |
|   |  - Single Source of Arch Truth     |   |  - Single Source of Data Truth     |  |
|   |  - 6 Domain Arsitektur SAORAJA     |   |  - 4 Pilar Satu Data Korporasi     |  |
|   |  - Tata Kelola ARB Clearance       |   |  - Master Data Hub (Golden Record) |  |
|   |  - Generative Engineering Engine   |   |  - Logical CDC Publication         |  |
|   +-----------------+------------------+   +-----------------+------------------+  |
|                     |                                        |                     |
|                     | Menetapkan Metadata,                   | Menyediakan Master   |
|                     | Blueprint & Standar API                | Data & Validasi FK   |
|                     +-------------------+--------------------+                     |
|                                         |                                          |
|                                         v                                          |
|         +---------------------------------------------------------------+          |
|         |                     GENERATIVE PIPELINE                       |          |
|         |        Melahirkan Dokumen, Blueprint, dan Platform            |          |
|         +-------------------------------+-------------------------------+          |
|                                         |                                          |
|                                         v                                          |
|         +---------------------------------------------------------------+          |
|         |                  LINI PLATFORM PANRITA                        |          |
|         |   PANRITA-BASE  ·  PANRITA-SSP  ·  PANRITA-B-LINK             |          |
|         |   PANRITA-OLP   ·  PANRITA-SVP  ·  PANRITA-STRIDE-[SBU]       |          |
|         |                                                               |          |
|         |   Karakteristik:                                              |          |
|         |   1. Seluruh Platform = Unified App Shell                     |          |
|         |   2. Workspace di Dalamnya = SPA Mandiri via Module           |          |
|         |      Federation 2.0 ATAU Internal Routed (Ditentukan EAP)     |          |
|         +---------------------------------------------------------------+          |
+------------------------------------------------------------------------------------+
```

### 1.4 Melahirkan Lini Platform PANRITA-[Platform]
Dari perpaduan SAORAJA (sebagai perancang & generator) dan SEDDI (sebagai penyedia data master), **lahirlah dokumen arsitektur dan sistem-sistem aplikasi operasional perusahaan yang disebut Platform dengan Brand payung PANRITA-[Singkatan Platform]**.

* **Makna Brand PANRITA:**
  Dalam bahasa Bugis/Makassar, **Panrita** bermakna *"Cendekiawan, Pakar, Empu, atau Ahli Maestro"*. Ini menegaskan bahwa platform operasional yang dilahirkan bukan sekadar software biasa, melainkan platform yang memiliki kecerdasan logika tingkat tinggi, dirancang secara presisi oleh arsitek ahli (Panrita), dan mengeksekusi proses bisnis unit usaha dengan standar keunggulan operasional terbaik.

* **Format Penamaan Platform:**
  Seluruh platform operasional mengadopsi format resmi `PANRITA-[Kode Platform]`:
  * **PANRITA-OLP** *(Omni Load Platform)*: Data Warehouse & ETL Engine FLUX.
  * **PANRITA-SSP** *(Self Services Platform)*: Employee Self Services & Productivity Portal.
  * **PANRITA-B-LINK** *(Business Linkage & Integration Network)*: CRM FORGE & Vendor Management VANTAGE.
  * **PANRITA-BASE** *(Business Automation & Shared Ecosystem)*: HRMS PULSE, Talent APEX, Risk AEGIS, Mutu/GRC FORTRESS, Improvement PACE, Audit INTEGRA, Arsip ARCHI, Asset OPTIMA.
  * **PANRITA-SVP** *(Strategic Vantage Platform)*: Dashboard VANGUARD, Costing ACCORD, Financial Consolidation CORE.
  * **PANRITA-STRIDE-[SBU]** *(Strategic Resource Integration & Data Enterprise)*: ERP Vertikal Industri (STRIDE-Hk untuk Otomotif, STRIDE-Bsu untuk Aspal & Kimia, Konstruksi, Properti, Logistik, dll.).

### 1.5 Paradigma Frontend: Unified App Shell & Kondisional Module Federation 2.0
Seluruh platform PANRITA yang dihasilkan oleh SAORAJA mengimplementasikan arsitektur frontend standar:

1. **Prinsip Unified App Shell:**
   Setiap platform memiliki satu shell host pembungkus yang menyediakan:
   * Sesi Single Sign-On (SSO) terpusat via Keycloak (OIDC/PKCE).
   * Bilah navigasi global terpadu, selector entitas/organisasi, breadcrumb, dan pencarian cepat universal (Ctrl + K).
   * Tata letak terintegrasi, manajemen notifikasi lintas modul, dan pemicu Floating Copilot MIND AI.

2. **Kondisional Pemuatan Workspace (Berdasarkan Kebutuhan di SAORAJA-EAP):**
   Di dalam sebuah platform PANRITA, terdapat satu atau lebih Workspace. EAP (melalui konfigurasi di Domain 4 Aplikasi dan manifest GSE) menetapkan apakah suatu workspace dijalankan sebagai:
   * **Opsi A: SPA Mandiri via Module Federation 2.0 (`FEDERATED_REMOTE`)**
     * Dipilih jika workspace dikembangkan oleh tim independen, memerlukan siklus CI/CD terpisah, atau memiliki ukuran kode masif (misal: workspace `PULSE HRMS` di dalam `PANRITA-BASE` atau `ASI Dealer Management` di `PANRITA-STRIDE-Hk`).
     * Host memuat remote workspace secara dinamis pada saat runtime (`@module-federation/vite`).
     * Berbagi pustaka *singleton* (`react`, `react-dom`, `@tanstack/react-query`, `zustand`, `@panrita/shell-api`).
     * Dilengkapi *Error Boundary* terisolasi: crash pada remote workspace tidak merusak shell platform.
   * **Opsi B: Internal Routed SPA Sub-Application (`INTERNAL_ROUTED`)**
     * Dipilih jika workspace berukuran ringan, memiliki ketergantungan internal yang ketat dengan shell, atau dikelola oleh tim yang sama (misal: modul pelaporan ringkas atau administrasi `SET/RBAC` lokal).
     * Dibundel langsung ke dalam build monolith/monorepo platform menggunakan sub-rute standar (React Router).
     * **Keputusan arsitektur ini tercatat secara deklaratif di SAORAJA-EAP (`eaw.application.workspace_mode`), menghilangkan ambiguitas saat tim rekayasa membangun software.**

---

## 2. Pendahuluan, Latar Belakang & Masalah Bisnis

### 2.1 Visi & Tujuan Strategis EAP
SAORAJA (EAP) adalah **sistem komando arsitektur terpusat** yang dirancang untuk mengorkestrasi, mendokumentasikan, dan mengontrol seluruh aset proses bisnis, data, aplikasi, dan infrastruktur di lingkungan Holding serta seluruh Ecosystem / Strategic Business Unit (SBU).

**Tujuan Strategis:**

| No | Sasaran Strategis | Keterangan |
|---|---|---|
| **T-01** | **Single Source of Architecture Truth** | Satu referensi arsitektur TI hidup (*live sync*) bagi seluruh ekosistem grup, mengadopsi standar Kerangka Kerja SAORAJA (SAF). |
| **T-02** | **Unified Workspace & SSO** | Mengintegrasikan pengalaman pengguna dari kondisi terfragmentasi menuju Unified App Shell berbasis SSO Keycloak. |
| **T-03** | **Eliminasi Pemborosan TI (Anti-Redundancy)**| Mencegah duplikasi belanja TI (capex/opex) melalui mekanisme ARB Clearance dan gerbang validasi GSE (AF-06). |
| **T-04** | **Satu Data Korporasi** | Mengadopsi prinsip tata kelola data induk terpadu ke lingkungan korporasi melalui integrasi SEDDI sebagai MDM Hub. |
| **T-05** | **Akselerasi SDLC melalui Generative AI** | Mempersingkat waktu rilis platform/workspace baru dari 4–6 bulan menjadi ≤30 hari melalui GSE Scaffolding Engine. |
| **T-06** | **AI Governance & Kedaulatan Data** | LLM Gateway terpusat dengan guardrail wajib OPA/NeMo, pembatasan domain ketat, dan pemrosesan on-premise untuk data rahasia. |
| **T-07** | **Kepatuhan Privasi Data (UU PDP)** | Penegakan isolasi data pribadi (D-14): data pribadi hanya di `kalla_cmp` (skema `mdm` & `iam`); database EAP dan konsumen bebas PII. |

### 2.2 Masalah Bisnis Utama (10 Enterprise Pain Points)

| ID | Masalah Nyata di Lapangan | Dampak Operasional & Finansial | Solusi SAORAJA & SEDDI |
|---|---|---|---|
| **M-01** | **Application Fatigue & Tab Overload** | Karyawan membuka 10–25 tab aplikasi terpisah dengan kredensial berbeda; kelelahan operasional. | **Unified App Shell** dengan SSO Keycloak; seluruh workspace diakses dalam satu jendela terpadu. |
| **M-02** | **Duplikasi Data Master 3–5×** | Pelanggan dan vendor tercatat berulang kali dengan format berbeda di tiap anak usaha. | **SEDDI Golden Record**; 1 Corporate Customer ID & Master Vendor unik dengan dedup HMAC. |
| **M-03** | **Redundansi Belanja TI (Duplikasi Aplikasi)**| Tiap SBU membeli/membangun aplikasi serupa (CRM, HR, Inventory) secara mandiri; pemborosan anggaran. | **ARB Clearance & MIND AI**; deteksi kemiripan modul ≥75%, penolakan inisiatif duplikatif. |
| **M-04** | **Integrasi Titik-ke-Titik (P2P Spaghetti)** | Integrasi langsung antar platform dan DB tanpa standar; perubahan satu skema merusak sistem lain. | **EIO (Enterprise Integration Orchestrator)**; 6-layer mediation, 0 direct DB access. |
| **M-05** | **SDLC Tradisional Sangat Lambat (4–6 Bulan)**| Pengembangan aplikasi baru dimulai dari nol berulang kali; lambat merespons kebutuhan pasar. | **GSE Scaffolding Engine**; pembuatan template kode terstandarisasi ≤45 detik, go-live ≤30 hari. |
| **M-06** | **Dokumen Arsitektur Usang & Terfragmentasi**| Cetak biru arsitektur statis di Visio/PDF tidak mencerminkan kode aktual di Git. | **Live Architecture di EAW**; metamodel arsitektur ArchiMate 3.2 tertaut langsung ke repositori Git. |
| **M-07** | **Shadow AI & Kebocoran Data Rahasia** | Penggunaan AI publik tanpa guardrail, pemborosan biaya token, risiko pelanggaran rahasia dagang. | **LiteLLM Gateway + NeMo/OPA**; domain fencing ketat dan pemrosesan on-premise untuk data sensitif. |
| **M-08** | **Inkonsistensi Akuntansi & Chart of Accounts**| Kode akun akuntansi berbeda di tiap anak usaha, menyulitkan konsolidasi laporan grup. | **Master CoA Terpusat** di SEDDI; sinkronisasi otomatis ke modul finansial di seluruh platform. |
| **M-09** | **Data Karyawan Silo & Mutasi Terhambat** | Data kepegawaian tersimpan parsial; mutasi karyawan membutuhkan pembuatan akun manual di tiap unit. | **Master Employee Tunggal** di SEDDI; pembaruan mutasi otomatis memicu sinkronisasi RBAC via webhook. |
| **M-10** | **Tidak Adanya Visibilitas Kematangan TI** | Manajemen tidak memiliki tolok ukur kuantitatif terhadap kelengkapan dan kesehatan arsitektur grup. | **Dashboard Skor IKA** (*Indeks Kematangan Arsitektur SAORAJA Level 1–5*) yang dihitung otomatis. |

### 2.3 Solusi Fundamental terhadap Beban "1 Karyawan 10 Aplikasi"
Integrasi antara SEDDI (Master Data) dan SAORAJA (Arsitektur Shell) secara instan menghapus beban kerja ganda:
1. **Zero Duplicate Entry:** Karyawan tidak perlu lagi menginput profil vendor atau pelanggan di 3 aplikasi berbeda. Input 1 kali di portal master, data langsung terdistribusi via CDC ke seluruh platform PANRITA.
2. **Sinkronisasi Hak Akses Instan:** Saat terjadi mutasi/promosi di Master Employee SEDDI, event `cmp.workforce.employee_mutated` dikirim ke **`/api/v1/webhooks/employee-sync`** pada modul `set` di tiap platform PANRITA. Karyawan langsung memiliki hak akses di unit baru tanpa meminta akun baru ke admin masing-masing aplikasi.
3. **Pencarian Global Terpadu (Ctrl + K):** Di dalam Unified App Shell, fitur pencarian universal memanfaatkan feed **`GET /api/v1/search/index-feed`** dari SEDDI (type: `party`, `vendor`, `coa`, `product`, `branch`). Cukup mengetikkan nama customer atau vendor, sistem menyajikan seluruh transaksi terkait lintas platform secara instan.

### 2.4 Prinsip Bootstrap: EAP Dimulai Kosong sebagai Pengatur Aktif
SAORAJA-EAP adalah **platform pertama yang dibangun** dalam ekosistem enterprise.
* Pada saat EAP pertama kali di-deploy, database `kalla_eap` diinisialisasi dengan **skema kosong** (tabel ada, data bisnis tidak ada).
* EAP bukan konsumer pasif yang menunggu daftar aplikasi yang sudah ada — **EAP adalah tempat seluruh platform, workspace, proses bisnis, entitas data, dan kerangka kerja didaftarkan, divalidasi, dan ditetapkan oleh Enterprise Architect**.
* Platform seperti SEDDI, PANRITA-BASE, PANRITA-STRIDE, dll., didaftarkan secara terencana melalui EAW oleh arsitek sebelum kode mereka di-scaffold via GSE.

### 2.5 Struktur Stakeholder Utama

| Kelompok Stakeholder | Peran Utama | Kepentingan & Sasaran |
|---|---|---|
| **Board of Directors (BOD) / Direksi** | *Steering Committee* | Visibilitas investasi TI grup, kepatuhan regulasi, percepatan ROI, dan mitigasi risiko. |
| **Chief Enterprise Architect** | *ARB Chair / Pemilik SAORAJA* | Mengawal standar arsitektur enterprise grup, memimpin sidang persetujuan aplikasi baru. |
| **Chief Data Officer (CDO)** | *Data Governance Lead / Pemilik SEDDI*| Menjamin standar kualitas data master (*Data Quality*), memutus sengketa kepemilikan data. |
| **Domain Architects (6 Domain)** | *Perancang Arsitektur* | Menyusun model proses, data, aplikasi, layanan, infrastruktur, dan keamanan di EAW. |
| **SBU IT Leads & Solution Architects**| *Pelaksana SBU* | Mengajukan usulan inisiatif aplikasi baru, memodelkan arsitektur lokal SBU di EAW. |
| **Business Process Owners (BPO)** | *Pemilik Kebutuhan Bisnis* | Memastikan platform operasional mendukung proses bisnis dan target kinerja unit. |
| **Software Engineers & BA** | *Pengembang Platform* | Menggunakan REQ Chatbot dan GSE Engine untuk scaffolding dan pengembangan kode. |
| **GRC & Internal Audit** | *Pengawas Independen* | Memantau kepatuhan arsitektur, verifikasi audit trail, dan kepatuhan UU PDP & ISO 27001. |

---

## 3. Ruang Lingkup Produk & Peta Platform PANRITA

### 3.1 Peta Lengkap Platform Ekosistem
Sesuai rancangan pada [Project.md](../Project.md), setiap platform adalah **Unified App Shell** yang menaungi satu atau beberapa workspace SPA:

```
Platform Meta & Fondasi
├── 1. SAORAJA (EAP) → EAW, GSE, REQ, CONSOLE, SET/RBAC      (db: kalla_eap · schema: eaw, set, gse, console, shared, ref)
└── 2. SEDDI (CMP)   → MDM, IAM, SET/RBAC                    (db: kalla_cmp · schema: mdm, iam, ref, shared)

Platform Holding Bersama (Lini PANRITA)
├── 3. PANRITA - OLP    → FLUX (ETL), SET/RBAC               (db: kalla_olp · schema: flux, set)
├── 4. PANRITA - SSP    → ESS, AGILE, MIND, SET/RBAC         (tanpa DB lokal; baca base.* via SSO)
├── 5. PANRITA - B-LINK → FORGE (CRM), VANTAGE (Vendor), SET (db: kalla_blink · schema: forge, vantage, set)
├── 6. PANRITA - BASE   → PULSE, APEX, AEGIS, FORTRESS, PACE,
│                         INTEGRA, ARCHI, OPTIMA, MIND, SET  (db: kalla_base · schema: pulse, lea, ...)
└── 7. PANRITA - SVP    → VANGUARD, ACCORD, CORE, SET        (db: kalla_svp · schema: vanguard, accord, core, set)

Platform ERP Vertikal SBU (Lini PANRITA)
├── 8. PANRITA - STRIDE-Hk  → ASI, ASM, FLOW, CORTEX, CSC, FIA, ALM, HRE, SET  (db: kalla_stride_hk)
├── 9. PANRITA - STRIDE-Bsu → AV, AEPS, FLOW, CORTEX, CSC, FIA, ALM, HRE, SET  (db: kalla_stride_bsu)
└── N. PANRITA - STRIDE-[Future] (Konstruksi, Properti, Logistik, Tambang, dll.)
```

### 3.2 Lima Workspace Utama EAP (EAW, GSE, REQ, CONSOLE, SET)

| Workspace | Kode | Fungsi Utama | Schema DB |
|---|---|---|---|
| **Enterprise Architecture Workbench** | **EAW** | Pemodelan visual ArchiMate 3.2, katalog APM, KRA, lineage relasi, ADR, sidang ARB Clearance. | `eaw` |
| **Generative Software Engineering** | **GSE** | Hybrid scaffold boilerplate full-stack → branch + Pull Request otomatis ke repositori Git target. | `gse` |
| **Requirement Elicitation Assistant** | **REQ** | Elisitasi kebutuhan via AI ter-guardrail → User Story + skenario Gherkin. | *(stateless — tanpa DB lokal)* |
| **Enterprise Control Console** | **CONSOLE** | Dashboard Skor IKA, inventaris model AI, FinOps token metering, kontrol EIO, dan observabilitas. | `console` |
| **Settings / RBAC** | **SET** | Pengelolaan pengguna (`idp_subject` only, D-14), penugasan 13 role resmi, pemetaan lingkup entitas. | `set` |

### 3.3 Hierarki Menu Navigasi EAP

```
SAORAJA — Enterprise Architecture Platform (Shell)
├─ 00. Shell Header (Global Search Ctrl+K, Entity Selector, Notifikasi, Floating MIND AI)
├─ 01. EAW (Enterprise Architecture Workbench)
│  ├─ 1.1 Dashboard Arsitektur ── Executive Scorecard (Skor IKA), Peta Topologi Makro, Redundancy Monitor
│  ├─ 1.2 Domain 1: Proses Bisnis ── Value Chain Holding (L0), Core Industry (L1), Rincian SOP (L2-L3)
│  ├─ 1.3 Domain 2: Data & Informasi ── Kamus Data Kanonikal, Mapping Master SEDDI, Data Lineage & Pipeline
│  ├─ 1.4 Domain 3: Layanan Enterprise ── Service Catalog (Internal, Inter-SBU, Eksternal), SLO Tracker
│  ├─ 1.5 Domain 4: Aplikasi & Integrasi ── Katalog Portofolio APM, Mode Workspace (MF 2.0 vs Internal), API Registry
│  ├─ 1.6 Domain 5: Infrastruktur & Teknologi ── Topologi Hybrid Cloud, SD-WAN Network Map, Hardware Assets
│  ├─ 1.7 Domain 6: Keamanan Informasi ── Matriks Kepatuhan UU PDP & ISO 27001, Profil Risiko Sistem
│  ├─ 1.8 Tata Kelola & ARB Clearance ── Pengajuan Baru, Meja Sidang Review, Register Sertifikat Clearance
│  ├─ 1.9 Peta Rencana & Roadmap ── Master IT Roadmap Digital 5 Tahun, Pelacak Milestone
│  └─ 1.10 Architecture Decision Records (ADR) ── D-01 s/d D-14, Register Keputusan Berversi Git
├─ 02. GSE (Generative Software Engineering)
│  ├─ 2.1 Manajemen Proyek Scaffolding
│  ├─ 2.2 Template & Blueprint Generator (Unified App Shell & Micro-Frontend MF 2.0)
│  ├─ 2.3 Visual Agent & Distributed Saga Flow Builder
│  ├─ 2.4 Web IDE Monaco & Prompt Workbench
│  └─ 2.5 Multi-Git PR Sync & Pipeline Status
├─ 03. REQ (Requirement Assistant Chatbot)
│  ├─ 3.1 Sesi Elisitasi Kebutuhan Interaktif
│  ├─ 3.2 Generator User Story & Skenario Gherkin
│  └─ 3.3 Ekspor Dokumen Spesifikasi Kebutuhan
├─ 04. CONSOLE (Enterprise Control & Governance)
│  ├─ 4.1 Dashboard Skor Kematangan IKA (Level 1–5)
│  ├─ 4.2 AI Model & Risk Register (Inventaris LLM Cloud/On-Prem & Lisensi)
│  ├─ 4.3 FinOps Console (Token Metering, Kuota SBU, Showback/Chargeback)
│  ├─ 4.4 EIO Control Center (Status Konektor, Pemantau Saga Temporal, Deteksi Breaking Change)
│  ├─ 4.5 Observability & Traceability (OpenTelemetry APISIX, Latensi p95, SLO Monitor)
│  └─ 4.6 Security Center (Kill-Switch Agen, Log Penolakan Guardrail)
└─ 05. SET (Settings & Role-Based Access Control)
   ├─ 5.1 Struktur Organisasi (Holding, Ecosystem, SBU, Unit Kerja)
   ├─ 5.2 Manajemen Akun Pengguna (idp_subject, D-14 Compliant - Tanpa PII)
   ├─ 5.3 Matriks Roles & Permissions (13 Role Resmi)
   ├─ 5.4 API Client, Secrets & Service Tokens
   └─ 5.5 Audit Trail & Versioning Logs (Append-Only)
```

### 3.4 Batasan Ruang Lingkup (Out of Scope)
* **Pengembangan Core SEDDI:** EAP hanya **mengkonsumsi metadata** dari SEDDI; implementasi transaksional master data dikelola terpisah di [cmp/PRD.md](../cmp/PRD.md).
* **ERP Transaksional SBU:** Modul STRIDE hanya **dipetakan, dikatalogkan, dan di-scaffold template-nya** di EAP; logika bisnis spesifik dikembangkan di repositori SBU masing-masing.
* **Pengadaan Fisik Hardware:** Pengadaan server fisik data center, jaringan fiber, dan perangkat SD-WAN berada di luar lingkup perangkat lunak EAP.

---

## 4. Kerangka Kerja Arsitektur SAORAJA (SAF) & Prinsip Satu Data Korporasi

### 4.1 Transformasi Konseptual: Adopsi Standar Arsitektur Enterprise Korporat
Kerangka Kerja Arsitektur SAORAJA (SAF) mengadopsi standar **TOGAF ADM 10** dan **ArchiMate 3.2** yang disesuaikan untuk sektor korporasi holding:

| Konsep Konvensional | Standar SAORAJA Architecture Framework (SAF) | Makna dalam Tata Kelola Korporasi |
|---|---|---|
| Arsitektur Enterprise Holding | **Corporate Enterprise Architecture** (Holding) | Cetak biru arsitektur terpusat holding yang wajib dipatuhi seluruh grup. |
| Arsitektur Entitas / Anak Perusahaan | **Arsitektur SBU** / Business Unit | Arsitektur spesifik per anak perusahaan / Strategic Business Unit. |
| Referensi Arsitektur Acuan | **KRA (Corporate Reference Architecture)** | Katalog referensi baku domain proses, data, aplikasi, infra, dan keamanan. |
| Layanan Internal Korporat | **Layanan Internal Korporat** (Shared Services) | Layanan SDM, Keuangan, Pengadaan, Audit, Mutu, dan Aset ICT. |
| Layanan Pelanggan & Rekanan | **Layanan Pelanggan & Mitra** (B2B/B2C Services)| Layanan showroom mobil, booking servis bengkel, portal rekanan pengadaan. |
| Workbench Arsitektur | **SAORAJA EAW (Enterprise Architecture Workbench)**| Workspace digital terpadu pemodelan dan tata kelola arsitektur. |
| Penghubung Layanan Integrasi | **EIO (Enterprise Integration Orchestrator)** | Layer mediasi integrasi terdistribusi (6-layer, API hub, saga Temporal). |
| Satu Data Korporasi | **Satu Data Korporasi via SEDDI (CMP)** | Master Data Hub terdeduplikasi dengan Golden Record dan CDC terpusat. |
| Evaluasi Kematangan Arsitektur | **IKA (Indeks Kematangan Arsitektur Level 1–5)** | Pengukuran otomatis kelengkapan dan kepatuhan arsitektur per unit. |

### 4.2 Matriks 6 Domain Arsitektur SAORAJA
Arsitektur enterprise korporat di SAORAJA mencakup 6 domain terintegrasi:

```
+------------------------------------------------------------------------------------+
|                         6 DOMAIN ARSITEKTUR SAORAJA                                |
+------------------------------------------------------------------------------------+
|                                                                                    |
|   1. PROSES BISNIS        2. DATA & INFORMASI         3. LAYANAN ENTERPRISE        |
|   - Value Chain L0-L3     - Kamus Data Kanonikal      - Layanan Internal Korporat  |
|   - SOP & Alur Kerja      - Master Data SEDDI         - Layanan Antar-Entitas      |
|   - Pemilik Proses (BPO)  - Klasifikasi Privasi PDP   - Layanan Pelanggan/Mitra    |
|                                                                                    |
|   4. APLIKASI & INTEGRASI 5. INFRASTRUKTUR & TEKNO    6. KEAMANAN INFORMASI        |
|   - Portofolio APM        - Topologi Hybrid Multi-Cloud- Zero Trust Architecture   |
|   - MF 2.0 vs Internal    - SD-WAN Inter-Branch       - Isolasi PII & Kepatuhan PDP|
|   - EIO & Kontrak OpenAPI - Central IdP (Keycloak)    - Immutable Audit Logs       |
|                                                                                    |
+------------------------------------------------------------------------------------+
```

### 4.3 Prinsip "Satu Data Korporasi" — Adopsi Bersama SEDDI
Empat pilar Satu Data Korporasi yang dikelola SEDDI dijadikan referensi baku oleh SAORAJA EAP:

```
+----------------------------------------------------------------------------------------------------+
|                                 4 PILAR "SATU DATA KORPORASI" (SEDDI)                              |
+----------------------------------------------------------------------------------------------------+
| 1. STANDAR DATA         | Struktur, tipe, dan format data seragam di seluruh sistem (dq_rules)     |
| 2. METADATA             | Penjelasan semantik konteks data (definisi, pemilik data, masa retensi)  |
| 3. INTEROPERABILITAS    | Kemampuan data dibagikan via API & CDC Outbox (pub_cmp_ref 31 tabel)     |
| 4. KODE REFERENSI/INDUK | Master ID Tunggal (Golden Record): Party ID PRT-########, NIK, CoA Grup  |
+----------------------------------------------------------------------------------------------------+
                                                  │
                                  Menjadi Referensi Baku bagi
                                                  ▼
+----------------------------------------------------------------------------------------------------+
|                           SAORAJA (DOMAIN 2: DATA & INFORMASI)                                     |
|  - Memetakan proses bisnis penghasil data (Producer)                                               |
|  - Memetakan aplikasi konsumen data dari SEDDI (Consumer)                                          |
|  - Mengatur klasifikasi privasi data sesuai UU PDP No. 27/2022                                     |
+----------------------------------------------------------------------------------------------------+
```

**Rincian 4 Pilar (selaras [cmp/PRD.md](../cmp/PRD.md) §2.1):**

| Pilar SDI | Implementasi di SEDDI (CMP) | Rujukan di EAP (Domain 2) |
|---|---|---|
| **1. Standar Data** | `dq_rules` deklaratif; `product_spec_templates` bertipe kuat; format kode `shared.business_code`; kosakata izin `<domain>.<resource>.<action>` | Kamus Data Kanonikal; klasifikasi privasi UU PDP |
| **2. Metadata** | `data_stewards` per domain; `survivorship_rules` per atribut; klasifikasi data pada setiap tabel | Pemilik data, steward, masa retensi per entitas |
| **3. Interoperabilitas** | Publikasi CDC `pub_cmp_ref` (31 tabel, daftar kolom eksplisit); API REST/OIDC; `shared.outbox`; `generate_ref_ddl()` | Data Lineage & Pipeline (FR-02.4), API Registry (FR-02.8) |
| **4. Kode Referensi/Induk** | Golden Record Party (HMAC dedup) dengan ID `PRT-########`; kode Kemendagri tervalidasi; `source_records` xref ke **21 sistem legacy** | Larangan master lokal (§7.3), Master Data Mapping (FR-02.3) |

### 4.4 Peran Penyelenggara Data Korporasi

| Peran Tata Kelola Data | Pejabat Bertanggung Jawab | Tanggung Jawab Operasional |
|---|---|---|
| **Wali Data Korporat** | **Chief Data Officer (CDO) Holding** | Harmonisasi standar data grup, penyelesaian sengketa data lintas unit bisnis. |
| **Produsen Data** | **SBU / Business Process Owner** | Menghasilkan dan memvalidasi data operasional transaksional di unit masing-masing. |
| **Penyelenggara Data Master** | **Tim Platform SEDDI (CMP Team)** | Mengelola Golden Record data induk, mempublikasikan API master data, audit kebersihan data. |
| **Dewan Tata Kelola Data** | **Data Governance Council (DGO)** | Forum lintas-SBU dipimpin CDO untuk menetapkan kebijakan interoperabilitas. |
| **Data Owner (per domain)** | Pemilik proses per domain data | Menetapkan aturan, klasifikasi, retensi, dan tingkat kualitas (cmp PRD §9.1). |
| **Data Steward (per domain)** | Penjaga kualitas harian | Meninjau *change request* (maker-checker), menyelesaikan duplikat & temuan DQ. *Satu steward tidak boleh meninjau permintaannya sendiri.* |
| **Data Custodian (ICT)** | Operator platform | Menjalankan DB, replikasi, dan cadangan — **tidak** mengubah isi master. |
| **Petugas PDP (`pii_officer`)** | Pelindung data pribadi | Membuka PII terenkripsi (tujuan wajib, tercatat) dan anonimisasi sesuai UU PDP. |
| **Admin IAM (`iam_admin`)** | Pengelola akses | Peran, izin, penugasan, kunci API — terpisah dari data steward. |

---

## 5. Cetak Biru 6 Domain Arsitektur SAORAJA

### 5.1 Domain 1: Proses Bisnis (Business Architecture)
* **Level 0 (Value Chain Holding):** Manajemen Permodalan & Portofolio Bisnis, Pengawasan GRC & Audit Internal, Corporate Shared Services (SDM, Legal, IT, Finance), Pengembangan Usaha Baru.
* **Level 1 (Core Industry Value Chain):**
  * *Otomotif (Hadji Kalla):* Penjualan Mobil Baru → Servis & Suku Cadang → Body & Paint → Layanan Purna Jual & Trade-In.
  * *Konstruksi (Bumi Karsa):* Bidding & Tender → Engineering Design → Procurement → Project Execution → Commissioning & Handover.
  * *Manufaktur Aspal (BSU):* Impor Aspal Curah → Pemrosesan Emulsi → Pengujian Laboratorium Mutu → Distribusi & Terminal Tangki.
  * *Properti & Commercial (Kalla Land):* Akuisisi Lahan → Pembangunan Kawasan → Tenant Leasing → Facility Management & Mall.
  * *Transport & Logistik (BLT/BJU):* Manajemen Armada → Layanan Kargo Laut/Darat → Pergudangan Terpadu.
* **Level 2 & 3:** Rincian sub-proses fungsional, SOP operasional, serta matriks RACI spesifik per unit usaha.

### 5.2 Domain 2: Data & Informasi (Data Architecture)
* **Master Data Terpusat (Koneksi ke SEDDI) — 7 Domain Data Master (cmp/PRD §4):**
  * **DD-01 Party (Golden Record):** Satu party `PRT-########` per orang/badan usaha; peran *customer*, *vendor*, *employee*, dan *distributor* menempel pada part yang sama — pelanggan showroom, mall, dan perumahan serta rekanan kontraktor/supplier kini satu profil.
  * **DD-02 Organization:** `companies` (badan hukum) ⊥ `business_groups` (struktur manajemen) plus `org_units`, `branches`, `cost_centers`; hierarki Holding → Ecosystem → SBU → Cabang → Departemen.
  * **DD-03 Geography:** Negara → kelurahan dengan kode Kemendagri tervalidasi trigger.
  * **DD-04 Product:** Katalog produk dan jasa seluruh SBU, spesifikasi bertipe kuat, daftar harga berlaku-waktu.
  * **DD-06 Financial (master):** Chart of Accounts (CoA) Grup untuk konsolidasi otomatis di `PANRITA-SVP (CORE)`, kurs, pajak, bank, dan termin pembayaran.
  * **DD-07 Workforce:** Master Employee (Corporate NIK tunggal) untuk mobilitas talenta, payroll, dan sinkronisasi RBAC.
  * **DD-13 Identity:** `iam.users` sebagai sumber tunggal identitas pengguna seluruh KEIS (D-14).
  * *Catatan:* **DD-05 Asset TIK dipindahkan ke `kalla_base.optima`** (ADR-022) — bukan bagian SEDDI.
* **Arsitektur Aliran Data (Koneksi ke PANRITA-OLP):** Metadata pemindahan data transaksional ke data warehouse via engine ETL `FLUX`.
* **Klasifikasi Privasi Data:** Pengelompokan sesuai UU PDP No. 27/2022 (Data Terbuka, Data Internal, Data Terbatas, Data Spesifik/Sensitif PII).

### 5.3 Domain 3: Layanan Enterprise (Service Architecture)
* **Layanan Internal Korporat (H2E):** Pengajuan cuti, klaim kesehatan, slip gaji, pelatihan karyawan via `PANRITA-SSP (ESS)` dan `PANRITA-BASE (PULSE)`.
* **Layanan Antar-Entitas (Inter-SBU Services):** Penyewaan kendaraan korporat, jasa pengiriman kargo antar unit bisnis, shared procurement.
* **Layanan Pelanggan & Mitra (B2B & B2C):** Booking servis mobil via aplikasi mobile, portal pendaftaran rekanan via `PANRITA-B-LINK (VANTAGE)`.

### 5.4 Domain 4: Aplikasi & Integrasi (Application Architecture)
* **Aplikasi Umum (Holding Shared Platforms):** EAP, CMP, OLP, SSP, BASE, B-LINK, SVP — masing-masing mengimplementasikan Unified App Shell.
* **Aplikasi Khusus (Vertical Industry ERP):** STRIDE-Hk (Otomotif), STRIDE-Bsu (Aspal), STRIDE-Konstruksi, STRIDE-Properti.
* **Katalog API & Mediasi EIO:** Pendaftaran seluruh kontrak antarmuka REST (OpenAPI 3.1), AsyncAPI, format payload JSON, dan orkestrasi transaksi Saga via Temporal.io.

### 5.5 Domain 5: Infrastruktur & Teknologi (Infrastructure Architecture)
* **Topologi Komputasi:** Hybrid Multi-Cloud (Data Center On-Premises Makassar untuk core transaksi latensi rendah + Cloud Provider untuk aplikasi publik & komputasi AI).
* **Jaringan Komunikasi Korporat:** SD-WAN terenkripsi menghubungkan Head Office, cabang-cabang wilayah, pabrik, terminal timbun, site proyek, dan perwakilan nasional.
* **Identitas & Akses Terpadu:** Central Identity Provider (Keycloak self-hosted, D-13) berbasis OIDC/OAuth2 untuk Single Sign-On (SSO).

### 5.6 Domain 6: Keamanan Informasi (Security Architecture)
* **Penyelarasan Regulasi:** Kepatuhan penuh UU No. 27/2022 (UU PDP), PP No. 71/2019, dan ISO/IEC 27001 (ISMS).
* **Zero Trust & Least Privilege:** Penegakan RBAC ketat, audit trail immutable, enkripsi TLS 1.3 minimum, JWT asimetris RS256/ES256 (D-13), dan isolasi data pribadi hanya di `kalla_cmp` — skema `mdm` (`party_identifiers`, terenkripsi AES-256 + HMAC) dan `iam` (`iam.users`) (D-14).

---

## 6. Tata Kelola, Architecture Review Board (ARB) & MIND AI Copilot

### 6.1 Tujuan ARB Clearance (Anti-Redundansi)
ARB Clearance mencegah pemborosan belanja TI dan menjamin standar integrasi. Setiap pengadaan atau pembuatan aplikasi baru di unit bisnis **wajib** memperoleh persetujuan arsitektur dari ARB sebelum proses pengembangan diizinkan berjalan.

### 6.2 Alur Kerja ARB Clearance Terintegrasi

```
[ Unit Usaha / SBU Mengajukan Usulan Aplikasi Baru ]
(Form digital di EAW: Kebutuhan Bisnis, Rencana Software, Estimasi Anggaran)
                         │
                         ▼
[ Pre-Screening Otomatis oleh MIND AI Copilot ]
(MIND AI mencocokkan kata kunci & kapabilitas dengan portofolio aplikasi eksisting)
                         │
                         ├──> Ditemukan Duplikasi Fungsional ≥75%:
                         │    AI menerbitkan rekomendasi pemanfaatan platform bersama eksisting
                         ▼
[ Evaluasi Teknis oleh Domain Architects (Holding EA Office) ]
(Review komprehensif 6 Domain: Probis, Data SEDDI, API EIO, Infra, Keamanan)
                         │
                         ▼
[ Sidang Evaluasi & Putusan ARB Chair (Chief Architect) ]
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
  [ DISETUJUI ]    [ BUTUH REVISI ]   [ DITOLAK ]
  Terbit Sertifikat Dikembalikan     SBU diarahkan memakai
  Resmi "ARB        ke SBU dengan    platform bersama eksisting
  Clearance"        catatan teknis   (zero capex baru)
        │
        ▼
[ Gate AF-06 Terbuka ] ──> Scaffolding via GSE Engine Diizinkan
```

### 6.3 Gate AF-06: Penegakan Scaffolding GSE
Sesuai keputusan terkunci **AF-06**: **GSE Engine hanya dapat dijalankan untuk Aplikasi yang sudah terdaftar di katalog EAW dengan status minimal *Divalidasi*.** Ini menjamin setiap baris kode yang di-scaffold telah melalui telaah arsitektur resmi.

### 6.4 Validasi Kepatuhan Satu Data pada Pengajuan Baru
Saat pengusul mengajukan arsitektur aplikasi baru di EAW:
1. Sistem menganalisis entitas data yang akan disimpan oleh aplikasi.
2. MIND AI Copilot memanggil **`POST /api/v1/arb/screen-redundancy`** di SEDDI untuk mengecek apakah entitas tersebut sudah dikelola kanonikal (cmp/SRS §8.5).
   *Contoh respons:* `{ "violations": [{ "entity": "customer", "rule": "M1", "message": "Master Customer sudah dikelola kanonikal di SEDDI. Dilarang membuat tabel lokal." }] }`
3. Jika terdeteksi adanya pembuatan tabel penyimpanan lokal untuk data master (seperti Customer, Vendor, Employee lokal), **usulan otomatis ditolak oleh sistem**.
4. Sistem menerbitkan arahan wajib: *"Melanggar Prinsip Satu Data Korporasi. Aplikasi wajib mengintegrasikan Master Customer/Vendor dari SEDDI via API."*

### 6.5 Tiga Kapabilitas Kunci MIND AI Architecture Copilot
Workspace EAW dilengkapi asisten cerdas MIND Copilot:
1. **Autonomous Architecture Drift & Redundancy Detector:** Pemindaian harian terhadap repositori Git dan API gateway untuk mendeteksi database atau endpoint bayangan (*shadow IT*) yang tidak terdaftar di EAW.
2. **Pre-ARB Screening:** Menghitung skor kemiripan fitur proposal baru terhadap aplikasi eksisting untuk mencegah pembelian aplikasi yang fungsinya serupa.
3. **Natural Language Architecture Query:** Memungkinkan pimpinan menanyakan dependensi teknis: *"Aplikasi apa saja yang terdampak jika server On-Prem Makassar mengalami downtime?"* AI menampilkan graf dependensi dalam hitungan detik.

---

## 7. Pembagian Peran: SAORAJA (EAP) vs SEDDI (CMP)

### 7.1 Matriks Peran: Design & Governance vs Golden Record

| Dimensi Evaluasi | SAORAJA (Enterprise Architecture Platform) | SEDDI (Corporate Master Platform) |
|---|---|---|
| **Peran Arsitektur** | Perancang, Pengatur & Pemeta *(Design & Governance)* | Penyimpan & Penyedia Data Induk Riil *(Golden Record)* |
| **Sifat Platform** | Design & Governance | Golden Record & API Hub |
| **Database** | `kalla_eap` — skema `eaw`, `set`, `gse`, `console`, `shared`, `ref` | `kalla_cmp` — skema `mdm`, `iam`, `ref`, `shared` |
| **Isi Basis Data** | Metadata arsitektur, kamus data konseptual, data lineage, peta relasi 6 domain | Data aktual/operasional master (Daftar nama pelanggan, NIK pegawai, NPWP vendor, Kode Akun CoA) |
| **Fungsi Utama** | Mengatur aturan: *"Platform STRIDE-Hk wajib mengambil data vendor dari SEDDI via API `/api/v1/parties?role=vendor`"* | Menyediakan endpoint API Master Vendor yang bersih dari duplikasi dan valid |
| **Pengguna Utama** | Enterprise Architect, Domain Architects, Auditor GRC, BOD | Data Stewards, Master Data Officers, dan Sistem Transaksional ERP/CRM |
| **Penyimpanan PII**| **TIDAK** — Hanya menyimpan `idp_subject` (D-14) | **YA** — `iam.users` + `mdm.party_identifiers` (terenkripsi AES-256-GCM) |

### 7.2 Tujuh Domain Data Master di SEDDI

| # | Domain (cmp/PRD §4) | Isi Utama | Konsumen Utama |
|---|---|---|---|
| 1 | **DD-01 Party** | Golden Record `PRT-########` + peran customer/vendor/employee; `party_identifiers` (NIK, NPWP, NIB) terenkripsi AES-256 + HMAC | STRIDE-*, FORGE, VANTAGE |
| 2 | **DD-02 Organization** | `companies`, `business_groups`, `org_units`, `branches`, `cost_centers` | Semua platform |
| 3 | **DD-03 Geography** | Negara → kelurahan (kode Kemendagri) | Semua platform |
| 4 | **DD-04 Product** | `products`, spesifikasi bertipe kuat, `price_lists` berlaku-waktu | ASI, ASM, AV, AEPS, CSC, FLOW |
| 5 | **DD-06 Financial** | COA Grup + `account_mappings`, kurs, pajak, bank, termin | FIA, SVP/CORE, ACCORD |
| 6 | **DD-07 Workforce** | `employees`, `positions`, `employments` (Corporate NIK tunggal) — **ditulis PULSE** via CMP API (`hris_sync`, K-9 CMP); proses mutasi di PULSE | ESS, APEX, HRE, modul `set` semua platform |
| 7 | **DD-13 Identity** | `iam.users`, roles, permissions, sessions | Semua platform (lewat `ref.users`) |

**Koreksi terhadap pemetaan lama:** pelanggan dan vendor **bukan** master terpisah — keduanya adalah *peran* pada satu **Party** yang sama (prinsip M2: satu orang/badan usaha = satu *party*). **DD-05 Asset TIK** dipindahkan ke `kalla_base.optima` (ADR-022), sehingga bukan domain SEDDI.

### 7.3 Aturan Konsumen & Larangan Duplikasi Data Lokal
* **Dilarang:** Membuat tabel master lokal; membaca langsung `kalla_cmp`; menyimpan salinan PII mentah.
* **Wajib:** Menggunakan replika read-only `ref.*` (CDC Logical Replication) untuk integritas Foreign Key lokal.
* **Wajib:** Memanggil API SEDDI untuk operasi yang butuh kesegaran data (submit transaksi, validasi).
* **Penegakan:** Gerbang ARB + metrik `MASTER_ENTITY_SOR_NOT_CMP` pada pipeline CI konsumen + **audit kepatuhan EAP pada Fase 3** (W3 SEDDI).
* **Arah berbalik:** EAP **mempublikasikan** registry aplikasinya (`eaw.application`) ke CMP sebagai replika `ref.applications` — **EAP pemilik registry aplikasi, CMP hanya memegang replikanya** (cmp/SRS §10 butir 1; DATABASE-REVIEW ADR-CMP-005).
* **Gate CI EAP:** `cross_check_consumers.sh` memastikan nama & tipe kolom `ref.*` di EAP identik dengan `pub_cmp_ref` (NFR-17, ADR-CMP-005).

---

## 8. Acceptance Criteria Modul (Kriteria Penerimaan Fitur)

### 8.1 EAW (Enterprise Architecture Workbench)

| ID | Fitur | Acceptance Criteria |
|---|---|---|
| **EAW-01** | Visual ArchiMate 3.2 Modeling | Kanvas diagram mendukung 7 layer ArchiMate; validasi metamodel real-time; ekspor Open Group Exchange XML; ABB/SBB tertaut ke platform pada `Project.md`. |
| **EAW-02** | Application Portfolio Catalog | Form pendaftaran platform dan workspace yang dimulai kosong; wajib memiliki 4 metadata (owner bisnis, tim dev, risiko AI, SLO); status awal `Draf`. |
| **EAW-03** | Dependency Lineage & Impact Analysis | Graf relasi: Proses → Layanan → Aplikasi → DB; perubahan endpoint/skema menampilkan daftar dampak untuk graf ≤1.000 node dalam ≤10 detik. |
| **EAW-04** | ADR Manager | CRUD ADR berversi Git dengan status: *Proposed, Accepted, Deprecated, Superseded*; ADR D-01..D-14 tersedia sejak Fase 0. |
| **EAW-05** | Framework Builder | Status *Divalidasi* ditolak bila ada objek tanpa relasi wajib atau tanpa tautan KRA; pesan galat deskriptif. |
| **EAW-06** | KRA Manager | 100% objek entitas tertaut ke referensi baku; perubahan versi KRA menandai objek terdampak untuk reviu. |
| **EAW-07** | Governance Workflow | Transisi status hanya oleh peran berwenang; setiap mutasi tercatat di `eaw.workflow` (append-only); akses di luar lingkup → 403. |
| **EAW-08** | Dashboard IKA & Kelengkapan | Skor IKA dihitung otomatis; tersedia per entitas, per domain, dan grafik tren berkala. |
| **EAW-09** | Auto-Generated Document Publisher | Impor 100% tervalidasi skema sebelum commit; ekspor dokumen formal PDF/Markdown 6 domain otomatis (AF-08). |

### 8.2 GSE (Generative Software Engineering Engine)

| ID | Fitur | Acceptance Criteria |
|---|---|---|
| **GSE-01/02**| Scaffolding Full-Stack & Multi-Git | 1 request → branch + PR berisi kode (React 19 TS, NestJS/Go, OpenAPI 3.1, DDL DB, CI manifest) dalam ≤45 detik; lolos lint, SCA (Grype), dan build; 0 push langsung ke main. |
| **GSE-03** | Visual Agent & Flow Builder | Menghasilkan konfigurasi `agent.yaml` dan `flow.yaml` valid; setiap mutasi Saga wajib mendefinisikan langkah kompensasi idempoten. |
| **GSE-04** | Unified Workspace Shell Generator | Pindah antar-workspace ≤300ms tanpa reload; 1 workspace dapat di-deploy tanpa merusak shell host (Error Boundary). |
| **GSE-05** | Web GSE IDE & Prompt Workbench | Editor Monaco aktif untuk TypeScript, Go, Python, SQL, YAML; prompt-as-code berversi di Git. |

### 8.3 REQ (Requirement Elicitation Chatbot)

| ID | Fitur | Acceptance Criteria |
|---|---|---|
| **REQ-01** | Requirement Elicitation via AI | 1 sesi menghasilkan User Story terformat dan skenario pengujian Gherkin (Given-When-Then) tervalidasi. |
| **REQ-02** | Strict Domain-Fencing | NeMo Guardrails memblokir ≥99,5% topik non-enterprise; evaluasi guardrail ≤150ms; tidak dapat dimatikan di tier mana pun (D-03). |
| **REQ-03** | Anti-Jailbreak Protection | Proteksi indirect prompt injection dan roleplay dievaluasi di container OPA/Rego eksternal; jika OPA down → fail-closed (503). |

### 8.4 EIO (Enterprise Integration Orchestrator)

| ID | Fitur | Acceptance Criteria |
|---|---|---|
| **EIO-01** | 6-Layer Mediation | 0 akses DB langsung lintas entitas; p95 ≤500ms; 10 model kanonikal (Party, Customer, Product, Order, Invoice, Payment, Employee, Asset, Document, Location). |
| **EIO-02** | Distributed Saga & Compensation | Orkestrasi Saga via Temporal.io (D-07); kompensasi teruji sukses pada uji injeksi kegagalan (chaos test). |
| **EIO-03** | Event Backbone | Throughput stabil ≥500 req/detik per tenant; format CloudEvents 1.0; DLQ aktif. |
| **EIO-04** | Control Center & Connector Registry | Breaking change kontrak (OpenAPI/Avro) terdeteksi otomatis di pipeline CI. |

### 8.5 Tata Kelola, Keamanan & FinOps (GOV, SEC, FIN, OPS)

| ID | Fitur | Acceptance Criteria |
|---|---|---|
| **GOV-01** | Executive Dashboard & Benefit Tracker | Dashboard KPI aktif dengan visualisasi metrik M-01 s/d M-05. |
| **GOV-02** | AI Model & Risk Register | Seluruh model LLM dan dataset RAG tercatat; model pemroses data sensitif wajib on-premises (D-05). |
| **SEC-01** | Security Center & AI Kill-Switch | Kill-switch menghentikan agen AI target dalam ≤60 detik; seluruh penolakan guardrail tercatat. |
| **FIN-01** | FinOps Console | Selisih metering konsumsi token terhadap tagihan provider ≤2% per bulan; pelaporan showback/chargeback. |
| **OPS-01** | Observability Dashboard | SLO per workspace aktif; trace OpenTelemetry tersedia untuk tiap request lintas layanan. |

### 8.6 SET/RBAC Module

| ID | Fitur | Acceptance Criteria |
|---|---|---|
| **SET-01** | Struktur Organisasi | Hierarki Holding → Ecosystem → SBU → Cabang dapat dikelola secara fleksibel. |
| **SET-02** | Kepatuhan D-14 PII Isolation | Pengguna hanya diidentifikasi via `idp_subject` (sub JWT Keycloak); dilarang ada data pribadi di DB `eap`. |
| **SET-03** | Roles & Permissions Matrix | 13 peran resmi terdefinisi; izin granular format `<workspace>.<modul>.<aksi>`. |
| **SET-04** | Verifikasi Token Asimetris (D-13) | JWT RS256/ES256; klaim `iss`, `aud`, `exp`, `iat`, `sub` wajib; masa berlaku ≤1 jam. |
| **SET-05** | Audit Trail Immutable | Setiap mutasi tercatat secara append-only, immutable, dan timestamped. |

---

## 9. Architecture Decisions (D-01 s/d D-14)

| ID | Aspek Keputusan | Pilihan yang Ditetapkan | Alasan Strategis (Rationale) | Status |
|---|---|---|---|---|
| **D-01** | Arsitektur Frontend | Micro-Frontend via **Module Federation 2.0** | Satu shell navigasi, deploy mandiri per workspace tanpa merusak modul lain. | **Ditetapkan** |
| **D-02** | Pengelolaan Git Repo | **1 Repositori Git per Platform** | Isolasi otonomi tim unit bisnis; membatasi *blast radius*; least privilege. | **Ditetapkan** |
| **D-03** | Guardrail Chatbot AI | **Hard Fencing NeMo + OPA/Rego Eksternal** | Mencegah pembengkakan biaya token dan kebocoran rahasia bisnis; evaluasi di luar LLM. | **Ditetapkan** |
| **D-04** | Metode Scaffolding GSE | **Hybrid Template Deterministik + AI Scaffolding** | Menjamin 100% kode scaffolding lolos uji kompilasi, linter, dan SCA security gate. | **Ditetapkan** |
| **D-05** | Strategi Penempatan LLM | **Hybrid Multi-Cloud + Model On-Premises GPU** | Data umum dapat memakai cloud LLM; data rahasia & PII wajib model on-premise (UU PDP). | **Ditetapkan** |
| **D-06** | Tingkat Otonomi Agen AI | **Maksimum Otonomi L3 (Batas Nominal Transaksi)** | Mempercepat approval rutin tanpa risiko bahaya terhadap neraca keuangan. | **Ditetapkan** |
| **D-07** | Konsistensi Transaksi | **Distributed Saga via Temporal.io** | Two-Phase Commit (2PC) tidak cocok untuk cloud-native; Saga mendukung kompensasi async. | **Ditetapkan** |
| **D-08** | Kebijakan FinOps Token | **Showback Tahun 1 → Chargeback Tahun 2** | Transparansi biaya pemakaian AI per SBU sebelum pembebanan anggaran riil. | **Ditetapkan** |
| **D-09** | Standar Lisensi Software | **Free & Open-Source Software (FOSS) First** | ~75% komponen menggunakan OSS berkualitas; investasi difokuskan pada infrastruktur AI. | **Ditetapkan** |
| **D-10** | Tingkatan Produk EAP | **Core (Free) / Pro (Chargeback) / Enterprise** | Memaksimalkan adopsi sistem secara menyeluruh dengan jalur cost recovery internal yang jelas. | **Ditetapkan** |
| **D-11** | Skema RBAC PANRITA-SSP | **Menggunakan `base.set` pada database BASE** | Platform SSP tidak memiliki basis data sendiri; membaca skema otorisasi terpusat di BASE. | **Ditetapkan** |
| **D-12** | Standar Skema RBAC | **Skema `set` seragam di seluruh platform holding** | Otorisasi konsisten di seluruh platform; template GSE memakai variabel `{{iam_schema}}` (default `set`). ***Pengecualian: CMP memakai `iam`** — disengaja (ADR-003 CMP) agar schema IAM dapat diekstrak menjadi Platform IAM Mandiri; tercatat di `DATABASE-REVIEW.md` ADR-CMP-001.* | **Ditetapkan** |
| **D-13** | Autentikasi & Verifikasi | **Keycloak Self-Hosted; JWT Asimetris RS256/ES256** | Hanya IdP terpercaya yang menerbitkan kredensial; rotasi kunci asimetris via JWKS tanpa redeploy. | **Ditetapkan** |
| **D-14** | Kedaulatan & Lokasi PII | **Data Pribadi HANYA di `kalla_cmp`** — `mdm` (party, identitas terenkripsi) & `iam` (identitas pengguna: `iam.users`) | Basis data platform lain (termasuk `eap`) hanya menyimpan `idp_subject`; perlindungan mutlak privasi (UU PDP). Sumber tunggal identitas pengguna seluruh KEIS = `iam.users` (cmp PRD NFR-06). | **Ditetapkan** |

---

## 10. Keputusan Terkunci Kerangka Kerja SAORAJA (AF-01 s/d AF-08)

| ID | Ketetapan Arsitektur Terkunci | Implikasi Operasional |
|---|---|---|
| **AF-01** | Arsitektur Korporat Wajib Memakai **6 Domain** (Proses Bisnis, Data & Informasi, Layanan, Aplikasi, Infrastruktur, Keamanan) | Notasi baku ArchiMate 3.2; seluruh pemodelan wajib mencakup keterhubungan keenam domain. |
| **AF-02** | **Satu Kerangka Kerja per Layanan Utama** Unit Bisnis | Setiap unit bisnis wajib memiliki dokumen kerangka kerja terpadu untuk layanan intinya. |
| **AF-03** | Hierarki Kepemilikan Sistem **4 Tingkat** | Holding → Ecosystem → SBU/PT → Unit Usaha/Cabang. Hak edit terbatas pada entitas sendiri. *Ecosystem* hanya pengelompokan manajemen — bukan badan hukum, tanpa laporan keuangan konsolidasi pada tingkat ini. |
| **AF-04** | **KRA (Referensi Arsitektur)** Ditetapkan oleh Holding EA Office | Objek arsitektur anak usaha wajib tertaut ke KRA; tanpa tautan referensi, validasi ditolak. |
| **AF-05** | Siklus Status Objek: **Draf → Divalidasi → Ditetapkan → Dipublikasi → Direviu** | Hanya objek berstatus *Ditetapkan* yang diakui sebagai baseline resmi arsitektur enterprise. |
| **AF-06** | **GSE Gate Mutlak:** Hanya Berjalan untuk Aplikasi Terdaftar di EAW Minimal Status *Divalidasi* | Tidak ada tim yang dapat men-generate atau merilis kode aplikasi tanpa clearance arsitektur ARB. |
| **AF-07** | Peninjauan Ulang Arsitektur Minimal **1× per Tahun** | Ditinjau berkala dan setiap kali terjadi penambahan platform atau integrasi baru. |
| **AF-08** | Dokumen Arsitektur Resmi **Dihasilkan Otomatis dari EAW** | Menghapus kebiasaan menulis dokumen arsitektur Word/PDF manual yang tidak sinkron dengan sistem. |

---

## 11. Kebutuhan Fungsional (Functional Requirements)

| Kode Kebutuhan | Nama Kebutuhan Fungsional | Prioritas |
|---|---|---|
| **FR-01.1** | Dashboard Skor IKA (Indeks Kematangan Arsitektur per SBU & Domain) | Must |
| **FR-01.2** | Topology Map Interaktif (Visualisasi Makro Ekosistem Enterprise) | Must |
| **FR-01.3** | Redundancy Alert Monitor (Deteksi otomatis duplikasi aplikasi via MIND AI) | Must |
| **FR-01.4** | Ringkasan Status & Pelacak Tiket Sidang ARB Clearance | Should |
| **FR-02.1** | CRUD Pemodelan Peta Proses Bisnis (Level 0 s/d Level 3) | Must |
| **FR-02.2** | CRUD Kamus Data Terpadu (Enterprise Data Dictionary Kanonikal) | Must |
| **FR-02.3** | CRUD Master Data Mapping — Pemetaan kandidat entitas ke SEDDI | Must |
| **FR-02.4** | CRUD Data Pipeline & Lineage (Pelacakan aliran data transaksional ke OLP/FLUX) | Should |
| **FR-02.5** | CRUD Service Catalog (Katalog layanan internal korporat & layanan pelanggan/mitra) | Must |
| **FR-02.6** | CRUD Katalog Aplikasi Portofolio APM (Umum Holding vs Khusus Vertikal SBU) | Must |
| **FR-02.7** | CRUD Konfigurasi Mode Workspace (Module Federation 2.0 vs Internal Routed) | Must |
| **FR-02.8** | CRUD API & Service Registry (Swagger/OpenAPI 3.1 Hub) | Must |
| **FR-02.9** | CRUD EIO Integration Matrix (Matriks kontrak integrasi antar platform) | Must |
| **FR-02.10**| Visualisasi Graf Interaktif Relasi Antar-Domain (@xyflow/react) | Must |
| **FR-02.11**| CRUD Architecture Decision Records (ADR) berversi Git: D-01 s/d D-14, status Proposed/Accepted/Deprecated/Superseded (EAW-04) | Must |
| **FR-02.12**| Framework Builder: Kerangka Kerja per layanan utama + validasi kelengkapan relasi wajib 6 domain (AF-02, EAW-05) | Must |
| **FR-02.13**| KRA Manager: referensi arsitektur per domain berversi, hanya Holding EA Office yang mengubah (AF-04, EAW-06) | Must |
| **FR-02.14**| Workflow Status Objek & Hak Akses Berjenjang: Draf → Divalidasi → Ditetapkan → Dipublikasi → Direviu (AF-05, EAW-07) | Must |
| **FR-02.15**| Impor/Ekspor & Penerbit Dokumen Arsitektur Otomatis dari data EAW (AF-08, EAW-09) | Must |
| **FR-03.1** | Form Pengajuan Tiket ARB Clearance Baru oleh SBU Architect | Must |
| **FR-03.2** | Pre-Screening Otomatis Usulan Aplikasi oleh MIND AI Copilot | Must |
| **FR-03.3** | Meja Sidang Review Multi-Tahap Domain Architects & Penetapan ARB Chair | Must |
| **FR-03.4** | Penerbitan Sertifikat Digital "Architecture Clearance" & Register Keputusan | Must |
| **FR-04.1** | Roadmap Transformasi Digital 5 Tahun Digital Interaktif | Must |
| **FR-05.1** | Architecture Drift Detector (Pemindaian harian repositori Git & API Gateway) | Must |
| **FR-05.2** | Natural Language Architecture Query via MIND AI | Should |
| **FR-05.3** | Pengecekan Kepatuhan Satu Data (Penolakan otomatis pembuatan master lokal) | Must |
| **FR-06.1** | GSE: Scaffolding Boilerplate Proyek Full-Stack ke Repositori Git target (≤45s) | Must |
| **FR-06.2** | GSE: Generator Blueprint Unified App Shell & Remote Module Federation 2.0 | Must |
| **FR-06.3** | GSE: Visual Agent & Saga Flow Builder (Temporal.io) | Should |
| **FR-06.4** | GSE: Web IDE Monaco & Prompt Workbench | Should |
| **FR-07.1** | REQ Chatbot: Elisitasi kebutuhan sistem terpandu AI → User Story + Gherkin | Must |
| **FR-07.2** | REQ Chatbot: Strict Domain Fencing Guardrail (Pemblokiran topik non-enterprise) | Must |
| **FR-07.3** | REQ Chatbot: Evaluasi Anti-Jailbreak di External Policy Engine (OPA/Rego) | Must |
| **FR-08.1** | EIO: Mediasi Protokol 6-Layer dengan 10 Model Data Kanonikal | Must |
| **FR-08.2** | EIO: Orkestrasi Transaksi Terdistribusi Distributed Saga via Temporal.io | Must |
| **FR-08.3** | EIO: Event Backbone Berkinerja Tinggi CloudEvents 1.0 (Kafka/Redpanda) | Should |
| **FR-08.4**| EIO: Control Center & Connector Registry dengan Deteksi Breaking Change | Should |
| **FR-09.1**| SET: Struktur Organisasi hierarkis Holding → Ecosystem → SBU → Cabang (SET-01) | Must |
| **FR-09.2**| SET: Manajemen Akun Pengguna tanpa PII — hanya `idp_subject` di DB EAP (D-14, SET-02) | Must |
| **FR-09.3**| SET: Matriks 13 Role Resmi & izin granular `<workspace>.<modul>.<aksi>` (SET-03) | Must |
| **FR-09.4**| SET: Verifikasi JWT asimetris RS256/ES256 dengan klaim wajib (D-13, SET-04) | Must |
| **FR-09.5**| SET: Audit Trail immutable append-only untuk seluruh mutasi (SET-05) | Must |

---

## 12. Kebutuhan Non-Fungsional (Non-Functional Requirements)

| ID | Parameter | Target Batasan Kinerja | Metode Pengukuran |
|---|---|---|---|
| **NFR-01** | Time-to-First-Token (TTFT) AI | ≤800ms | OpenTelemetry Tracing |
| **NFR-02** | Evaluasi Guardrail Input | ≤150ms | Benchmark NeMo / OPA sidecar |
| **NFR-03** | Waktu Scaffolding GSE | ≤45 detik (hingga pembuatan branch + PR Git) | CI/CD Runner Execution Log |
| **NFR-04** | Kompatibilitas GitOps | 100% artefak kompatibel dengan Git standar | Lint YAML & DDL Parser |
| **NFR-05** | Transisi Antar-Workspace Shell| ≤300ms tanpa reload halaman penuh | Browser DevTools Performance |
| **NFR-06** | Latensi Mediasi Pesan EIO | p95 ≤500ms pada beban normal | Metrik Gateway APISIX |
| **NFR-07** | Throughput Event Bus | ≥500 request/detik per tenant | Stress-test k6 / Locust |
| **NFR-08** | Akurasi Filtrasi Topik AI | ≥99,5% pemblokiran topik di luar arsitektur | Red-team Prompt Injection Test |
| **NFR-09** | Kepatuhan Privasi UU PDP | 0 insiden kebocoran PII; 0 kolom PII di DB `eap`| Audit DPO & Script `pii-guard` |
| **NFR-10** | SLA Ketersediaan Data Plane EIO| 99,95% uptime bulanan | SRE Monthly Availability Report |
| **NFR-11** | SLA Ketersediaan SAORAJA (EAP) | 99,90% uptime bulanan | SRE Monthly Availability Report |
| **NFR-12** | Validasi Token Keamanan JWT | RS256/ES256 only; HS* dan `none` ditolak mutlak; exp ≤1 jam | Test Suite APISIX & Security Audit |
| **NFR-13** | RPO / RTO Bencana Sistem | RPO ≤15 menit, RTO ≤4 jam (EAP); RTO ≤1 jam (EIO) | Uji Disaster Recovery Berkala |
| **NFR-14** | Standar Aksesibilitas UI | Standar internasional WCAG 2.2 Level AA | Audit Otomatis `axe-core` di CI |
| **NFR-15** | Software Supply Chain (SCA) | 100% dependency terpindai; 0 copyleft viral (GPLv3)| Pemindaian Grype & ORT di CI |
| **NFR-16** | Software Bill of Materials (SBOM)| 100% container release menyertakan SBOM SPDX 2.3 | Syft Generator di Pipeline CI |
| **NFR-17** | Konsistensi Replika `ref.*` EAP↔CMP | Nama & tipe kolom `ref.*` di EAP identik dengan `pub_cmp_ref` (31 tabel); 0 ketidakcocokan | Gate `cross_check_consumers.sh` di CI EAP (ADR-CMP-005) |
| **NFR-18** | Modul `shared` KEIS Identik | Nama kolom, tipe, & nullability `shared.audit_logs/documents/outbox` identik dengan `kalla_cmp.shared`; `apply_standard(p_user_table='set.users')` dipanggil pada tabel domain | Gate `cross_check_shared.sh` (ADR-CMP-004) |

---

## 13. Struktur Roles, RACI Matrix & Organisasi

### 13.1 Taksonomi 13 Role Resmi

| Kode Role (`set.roles`) | Nama Jabatan Resmi | Tingkatan (Tier) | Lingkup Wewenang |
|---|---|---|---|
| `ROLE_EAP_ARB_CHAIR` | Chief Enterprise Architect / Ketua ARB | Tier 1: Governance | Pemegang keputusan tertinggi persetujuan arsitektur grup & sertifikat clearance. |
| `ROLE_EAP_STEERING_COMMITTEE`| Dewan Pengarah TI (BOD / Direksi) | Tier 1: Governance | Pengawasan strategis, alokasi anggaran investasi TI, dan evaluasi manfaat bisnis. |
| `ROLE_EAP_BUSINESS_ARCHITECT`| Enterprise Business Architect | Tier 2: Domain Architect | Pengelola Domain 1 (Proses Bisnis) & Domain 3 (Layanan Enterprise), pemetaan rantai nilai holding & SBU. |
| `ROLE_EAP_DATA_ARCHITECT` | Enterprise Data Architect | Tier 2: Domain Architect | Pengelola Domain 2: Kamus Data, lineage, dan koordinasi dengan SEDDI Master Data. |
| `ROLE_EAP_APP_ARCHITECT` | Enterprise Application Architect | Tier 2: Domain Architect | Pengelola Domain 4: Katalog APM, mode workspace (MF 2.0 vs internal), dan standar API. |
| `ROLE_EAP_INFRA_ARCHITECT` | Enterprise Infrastructure Architect| Tier 2: Domain Architect | Pengelola Domain 5: Topologi hybrid cloud, server DC, dan jaringan SD-WAN. |
| `ROLE_EAP_SECURITY_ARCHITECT`| Enterprise Security Architect | Tier 2: Domain Architect | Pengelola Domain 6: Kebijakan keamanan, kepatuhan UU PDP, dan guardrail AI. |
| `ROLE_EAP_SBU_ARCHITECT` | SBU Lead Solution Architect | Tier 3: SBU Execution | Arsitek anak perusahaan yang mengajukan usulan aplikasi dan memodelkan arsitektur lokal. |
| `ROLE_EAP_BPO` | Business Process Owner (SBU) | Tier 3: SBU Execution | Penanggung jawab proses operasional SBU yang memvalidasi kesesuaian sistem. |
| `ROLE_EAP_GSE_DEVELOPER` | Lead Software Engineer | Tier 3: SBU Execution | Pengembang yang mengoperasikan GSE Engine, REQ Chatbot, dan menerima scaffold PR. |
| `ROLE_EAP_AUDITOR` | GRC & Internal Audit Officer | Tier 4: Assurance | Pengawas kepatuhan arsitektur, verifikasi audit trail, dan pelacak tindak lanjut audit. |
| `ROLE_EAP_SYSADMIN` | EAP System Administrator | Tier 4: Admin | Administrator platform EAP/CMP, pengelola skema `set`, dan konfigurasi konektor. |
| `ROLE_EAP_MIND_AGENT` | MIND AI Autonomous Agent | Tier 4: AI Service Role | Identitas sistem untuk agen cerdas yang mengeksekusi scanning dan pre-screening ARB. |

### 13.2 Matriks Hak Akses & RACI Komprehensif

| Fitur / Modul SAORAJA-EAP | ARB Chair | Domain Arch. | SBU Arch. | SBU BPO | GSE Dev. | Auditor | SysAdmin |
|---|---|---|---|---|---|---|---|
| **Katalog Probis (Domain 1)** | A | R | C | R | I | I | - |
| **Kamus Data & Lineage (Domain 2)** | A | R | C | I | I | I | - |
| **Katalog Layanan (Domain 3)** | A | R | C | C | I | I | - |
| **Katalog Aplikasi & Mode MF (Domain 4)**| A | R | R (SBU Scope)| - | C | I | - |
| **Topologi Infrastruktur (Domain 5)** | A | R | C | - | - | I | - |
| **Kontrol Keamanan & Privasi (Domain 6)**| A | R | C | - | C | I | - |
| **Pengajuan Tiket ARB Baru** | - | C | R (Submit) | C | - | I | - |
| **Sidang & Putusan ARB Clearance** | **A (Final)**| R (Review) | C | I | I | I | - |
| **Penyusunan Peta Rencana (Roadmap)** | A | R | I | I | - | I | - |
| **Scaffolding Proyek via GSE Engine** | I | C | C | - | **R (Run)** | I | - |
| **Elisitasi Kebutuhan via REQ Chatbot** | - | - | C | R | R | - | - |
| **Konfigurasi Guardrail & AI Policy** | I | C (Sec. Arch)| - | - | - | I | **R (CISO)** |
| **Manajemen Akun & Role (SET/RBAC)** | I | - | - | - | - | I | **A / R** |

---

## 14. Roadmap Pengembangan & Tahapan Sprint

```
+-----------------------------------------------------------------------------------+
| FASE 0: FONDASI, KEPUTUSAN ARSITEKTUR & SSO TERPUSAT (BULAN 1–2)                  |
| - Finalisasi dokumen PRD & SRS; pencatatan resmi ADR D-01 s/d D-14 di Git.        |
| - Deployment Keycloak Central IdP (OIDC/PKCE) & HashiCorp Vault.                  |
| - Inisialisasi basis data PostgreSQL (kalla_eap & kalla_cmp) dengan skema kosong. |
| - Pembuatan skeleton repositori Unified App Shell (Host & Remote Template).       |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
| FASE 1: MVP SAORAJA EAW, SEDDI CORE & ARB GATEWAY (BULAN 3–4)                     |
| - Peluncuran EAW Core: Pemodelan 6 Domain ArchiMate (@xyflow/react) & APM Catalog.|
| - Peluncuran SEDDI Core: Master Customer, Vendor, Employee, CoA + Validasi HMAC.  |
| - Implementasi REQ Chatbot dengan domain fencing ketat (NeMo/OPA) & anti-jailbreak.|
| - Implementasi alur ARB Clearance & Gate AF-06 (Scaffolding perdana GSE Engine).  |
| - Uji coba 1 pilot project: Scaffolding 1 workspace operasional (≤45 detik).      |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
| FASE 2: ORKESTRASI EIO, SAGA & INTEGRASI PLATFORM PANRITA (BULAN 5–6)             |
| - Deployment EIO 6-Layer Mediation & Event Backbone Kafka (CloudEvents 1.0).      |
| - Implementasi transaksi terdistribusi Distributed Saga via Temporal.io.         |
| - Onboarding Platform Holding Bersama: PANRITA-BASE, PANRITA-SSP, PANRITA-B-LINK. |
| - Replikasi data master SEDDI via Logical CDC (`pub_cmp_ref`) ke skema `ref.*`.   |
| - Sinkron `eaw.entity_org` dari `ref.business_groups` (ADR-CMP-003: CMP → EAP).   |
| - Pendaftaran 29 entitas master CMP ke Domain 2 EAW oleh Data Architect (cmp/SRS §8.2). |
| - Pengaktifan FinOps Token Metering & Dashboard Skor Kematangan IKA di CONSOLE.  |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
| FASE 3: SKALABILITAS GRUP, STRIDE ERP SBU & ENTERPRISE SCALE (BULAN 7+)           |
| - Onboarding platform ERP industri vertikal: PANRITA-STRIDE-Hk & STRIDE-Bsu.     |
| - Penerapan FinOps Chargeback ke seluruh unit bisnis.                             |
| - Target pencapaian Indeks Kematangan Arsitektur (IKA) Level 3 untuk platform umum dan Level 2 untuk ERP vertikal SBU (SAF §8.3). |
| - Otomatisasi monitoring SLO, deteksi breaking change kontrak API, dan audit berkala.|
+-----------------------------------------------------------------------------------+
```

---

## 15. Kriteria Keberhasilan & KPI Ekosistem

| No | Key Performance Indicator (KPI) | Target Kinerja | Periode Evaluasi |
|---|---|---|---|
| **K-01** | **Pendaftaran Aplikasi ke SAORAJA EAW** | 100% platform holding dan SBU terdaftar resmi di katalog EAW oleh arsitek | Akhir Fase 2 |
| **K-02** | **Kepatuhan Clearance ARB (AF-06)** | 100% aplikasi baru yang dibangun/di-scaffold wajib memiliki sertifikat ARB | Sejak Fase 1 |
| **K-03** | **Akurasi Deteksi Redundansi MIND AI** | Akurasi skor kemiripan Pre-ARB ≥80% (ambang rekomendasi duplikasi ≥75%) | Akhir Fase 2 |
| **K-04** | **Pemberantasan Silo Data (Zero Local Master)**| 100% platform konsumen mengonsumsi data Customer, Vendor, Pegawai dari SEDDI | Akhir Fase 3 |
| **K-05** | **Reduksi Akun / Kredensial Karyawan** | Penurunan dari rata-rata ~10 akun login menjadi **1 Akun Tunggal (SSO)** | Akhir Fase 1 |
| **K-06** | **Reduksi Aplikasi/Tab yang Dibuka Karyawan** | Penurunan dari 10–25 tab terpisah menjadi **≤2 jendela Unified App Shell** | Akhir Fase 1 |
| **K-07** | **Akselerasi SDLC Rilis Aplikasi Baru** | Pemangkasan waktu rilis dari 4–6 bulan menjadi **≤30 hari** via GSE | Akhir Fase 1 |
| **K-08** | **Kecepatan Scaffolding GSE** | Penyelesaian PR kode lengkap ke Git dalam waktu **≤45 detik** | Sejak Fase 1 |
| **K-09** | **Kecepatan Pindah Antar-Workspace** | Waktu perpindahan antar-workspace dalam shell **≤300ms** tanpa reload | Sejak Fase 1 |
| **K-10** | **Ketepatan Guardrail AI REQ Chatbot** | Pemblokiran topik di luar arsitektur korporasi **≥99,5% akurasi** | Sejak Fase 1 |
| **K-11** | **Kepatuhan Privasi Data Pribadi (UU PDP)** | **0 Insiden kebocoran PII**; 100% lolos pengujian `pii-guard` otomatis | Berkelanjutan |
| **K-12** | **Ketersediaan Layanan Integrasi (SLA EIO)** | Uptime data plane mediasi integrasi mencapai minimal **99,95%** | Fase 2 s/d 3 |

---

> **Dokumen Terkait:**
> * Spesifikasi Teknis Perangkat Lunak EAP: **[SRS.md](./SRS.md)**
> * Kerangka Kerja Arsitektur: **[SAF.md](./SAF.md)**
> * Spesifikasi Kebutuhan Data Master: **[cmp/PRD.md](../cmp/PRD.md)** & **[cmp/SRS.md](../cmp/SRS.md)**
> * Peta Arsitektur Ekosistem: **[Project.md](../Project.md)**
