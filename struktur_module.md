# Struktur Modul — SAORAJA EAP

Enterprise Architecture Platform — consumer data CMP (skema `set/eaw/gse/req/console/shared/ref`).

> Dihasilkan otomatis dari `eap/ui/assets/app.js` (registri `WS`; kini diarsipkan di `docs/archive/eap-ui-mockup/assets/app.js`, tag `eap-ui-mockup-final`) pada 2026-11-16. Sumber menu saat ini = `web/src/modules/registry.ts`; berkas ini SNAPSHOT historis dan tidak dibangkitkan ulang. (Teks asli: bila menu/layar berubah, hasilkan ulang; jangan sunting tangan agar tidak menyimpang dari registri).

## 1. Ringkasan hirarki

Total **5 workspace/modul**, **34 layar/menu**.

```text
EAP (platform)
├── EAW — Enterprise Architecture Workbench (15 layar)
│   ├── Ringkasan
│   │   └── 1.1 Dashboard Arsitektur
│   ├── 6 Domain SAORAJA
│   │   ├── 1.2 D1 · Proses Bisnis
│   │   ├── 1.3 D2 · Data & Informasi
│   │   ├── 1.4 D3 · Layanan Enterprise
│   │   ├── 1.5 D4 · Aplikasi & Integrasi
│   │   ├── 1.6 D5 · Infrastruktur
│   │   └── 1.7 D6 · Keamanan Informasi
│   ├── Pemodelan
│   │   ├── EAW-01 Kanvas ArchiMate 3.2
│   │   ├── EAW-03 Lineage & Impact
│   │   ├── EAW-05 Framework Builder
│   │   └── EAW-06 KRA Manager
│   └── Tata Kelola
│       ├── 1.8 ARB Clearance
│       ├── 1.9 Peta Rencana & Roadmap
│       ├── 1.10 Architecture Decisions
│       └── EAW-09 Penerbit Dokumen
├── GSE — Generative Software Engineering (5 layar)
│   └── Engine
│       ├── 2.1 Proyek Scaffolding
│       ├── 2.2 Template & Blueprint
│       ├── 2.3 Agent & Saga Flow Builder
│       ├── 2.4 Web IDE & Prompt
│       └── 2.5 Multi-Git PR & Pipeline
├── REQ — Requirement Elicitation Assistant (3 layar)
│   └── Asisten
│       ├── 3.1 Sesi Elisitasi
│       ├── 3.2 User Story & Gherkin
│       └── 3.3 Ekspor Spesifikasi
├── CONSOLE — Enterprise Control Console (6 layar)
│   ├── Governance
│   │   ├── 4.1 Skor Kematangan IKA
│   │   ├── 4.2 AI Model & Risk Register
│   │   └── 4.3 FinOps Console
│   └── Operasi
│       ├── 4.4 EIO Control Center
│       ├── 4.5 Observability & SLO
│       └── 4.6 Security Center
└── SET — Settings & RBAC (5 layar)
    └── Administrasi
        ├── 5.1 Struktur Organisasi
        ├── 5.2 Akun Pengguna
        ├── 5.3 Roles & Permissions
        ├── 5.4 API Client & Secrets
        └── 5.5 Audit Trail
```

## 2. Rincian per workspace

### 2.1 EAW — Enterprise Architecture Workbench

Pemodelan 6 domain, APM, KRA, ARB & ADR

- mode MF 2.0 · port 5171

**Ringkasan**

| No | Layar / menu | ID rute | Tipe / akses |
|---|---|---|---|
| 1.1 | Dashboard Arsitektur | `eaw/dashboard` |  |

**6 Domain SAORAJA**

| No | Layar / menu | ID rute | Tipe / akses |
|---|---|---|---|
| 1.2 | D1 · Proses Bisnis | `eaw/proses` |  |
| 1.3 | D2 · Data & Informasi | `eaw/data` |  |
| 1.4 | D3 · Layanan Enterprise | `eaw/layanan` |  |
| 1.5 | D4 · Aplikasi & Integrasi | `eaw/aplikasi` |  |
| 1.6 | D5 · Infrastruktur | `eaw/infra` |  |
| 1.7 | D6 · Keamanan Informasi | `eaw/keamanan` |  |

**Pemodelan**

| No | Layar / menu | ID rute | Tipe / akses |
|---|---|---|---|
| EAW-01 | Kanvas ArchiMate 3.2 | `eaw/kanvas` |  |
| EAW-03 | Lineage & Impact | `eaw/lineage` |  |
| EAW-05 | Framework Builder | `eaw/kerangka` |  |
| EAW-06 | KRA Manager | `eaw/kra` |  |

**Tata Kelola**

| No | Layar / menu | ID rute | Tipe / akses |
|---|---|---|---|
| 1.8 | ARB Clearance | `eaw/arb` |  |
| 1.9 | Peta Rencana & Roadmap | `eaw/roadmap` |  |
| 1.10 | Architecture Decisions | `eaw/adr` |  |
| EAW-09 | Penerbit Dokumen | `eaw/publisher` |  |


### 2.2 GSE — Generative Software Engineering

Scaffold full-stack → branch + PR (≤ 45 dtk)

- mode MF 2.0 · port 5172

**Engine**

| No | Layar / menu | ID rute | Tipe / akses |
|---|---|---|---|
| 2.1 | Proyek Scaffolding | `gse/proyek` |  |
| 2.2 | Template & Blueprint | `gse/template` |  |
| 2.3 | Agent & Saga Flow Builder | `gse/flow` |  |
| 2.4 | Web IDE & Prompt | `gse/ide` |  |
| 2.5 | Multi-Git PR & Pipeline | `gse/pr` |  |


### 2.3 REQ — Requirement Elicitation Assistant

Elisitasi AI ter-guardrail → User Story + Gherkin

- mode MF 2.0 · port 5173

**Asisten**

| No | Layar / menu | ID rute | Tipe / akses |
|---|---|---|---|
| 3.1 | Sesi Elisitasi | `req/sesi` |  |
| 3.2 | User Story & Gherkin | `req/story` |  |
| 3.3 | Ekspor Spesifikasi | `req/ekspor` |  |


### 2.4 CONSOLE — Enterprise Control Console

IKA, AI register, FinOps, EIO, observability

- mode MF 2.0 · port 5174

**Governance**

| No | Layar / menu | ID rute | Tipe / akses |
|---|---|---|---|
| 4.1 | Skor Kematangan IKA | `console/ika` |  |
| 4.2 | AI Model & Risk Register | `console/ai` |  |
| 4.3 | FinOps Console | `console/finops` |  |

**Operasi**

| No | Layar / menu | ID rute | Tipe / akses |
|---|---|---|---|
| 4.4 | EIO Control Center | `console/eio` |  |
| 4.5 | Observability & SLO | `console/obs` |  |
| 4.6 | Security Center | `console/security` |  |


### 2.5 SET — Settings & RBAC

Organisasi, akun (idp_subject), 13 role, audit

- mode INTERNAL · port 5170

**Administrasi**

| No | Layar / menu | ID rute | Tipe / akses |
|---|---|---|---|
| 5.1 | Struktur Organisasi | `set/org` |  |
| 5.2 | Akun Pengguna | `set/users` |  |
| 5.3 | Roles & Permissions | `set/roles` |  |
| 5.4 | API Client & Secrets | `set/api` |  |
| 5.5 | Audit Trail | `set/audit` |  |


## 3. Struktur folder kode

- `eap/.git/`
- `eap/.github/`
- `eap/.playwright-mcp/`
- `eap/api/` — API NestJS
- `eap/database/` — DDL PostgreSQL, seed, uji SQL
- `eap/docs/` — dokumentasi
- `eap/migrations/` — migrasi
- `eap/scripts/` — skrip
- `eap/tests/` — uji
- `docs/archive/eap-ui-mockup/` — prototipe UI statis (mockup), DIARSIPKAN 2026-11-17 (dulu `eap/ui/`; tag `eap-ui-mockup-final`)

Modul API NestJS (`eap/api/src`): `audit`, `auth`, `common`, `console`, `db`, `eaw`, `gov`, `gse`, `health`, `me`, `req`, `set`.
