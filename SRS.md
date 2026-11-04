# SRS — SOFTWARE REQUIREMENTS SPECIFICATION
## SAORAJA — Enterprise Architecture Platform (EAP)
### Spesifikasi Teknis Rancang Bangun & Orkestrasi Lini Platform PANRITA

**Brand:** SAORAJA · **Tagline:** Satu Arsitektur, Satu Fondasi, Satu Rumah, Satu Tujuan
*(Single Source of Architecture Truth & Generative Software Engineering Engine)*

| Atribut Dokumen | Nilai Spesifikasi Teknis |
|---|---|
| **Nomor Dokumen** | `KEIS-EAP-SRS-2026-V3.0` |
| **Status Dokumen** | **Baseline Aktif / Disetujui (Approved Baseline)** |
| **Target Ekosistem** | Universal Enterprise Ecosystem (Holding, Ecosystem, SBU, Multi-Perusahaan) |
| **Klasifikasi** | Dokumen Internal Terbatas (Confidential & Proprietary) |
| **Tanggal Terbit** | 2026 |
| **Dokumen Bisnis Terkait** | [PRD.md](./PRD.md) — Product Requirements Document EAP |
| **Kerangka Kerja Arsitektur**| [SAF.md](./SAF.md) — SAORAJA Architecture Framework |
| **Peta Struktur Platform** | [Project.md](../Project.md) — SSOT Struktur Platform, Database & Organisasi |
| **Dokumen Teknis Data** | [cmp/SRS.md](../cmp/SRS.md) — Spesifikasi Basis Data SEDDI (CMP) |
| **Dokumen Database Review** | [cmp/DATABASE-REVIEW.md](../cmp/DATABASE-REVIEW.md) — Alignment EAP↔CMP |

---

## DAFTAR ISI

1. [Pendahuluan & Konvensi Teknis](#1-pendahuluan--konvensi-teknis)
   * 1.1 Tujuan Dokumen
   * 1.2 Standar Konvensi & ID Keputusan
   * 1.3 Penegakan D-14: Larangan PII di Database EAP
2. [Arsitektur Sistem Tingkat Tinggi](#2-arsitektur-sistem-tingkat-tinggi)
   * 2.1 Diagram Blok Arsitektur Global
   * 2.2 Pola Arsitektur Backend & Layanan Mikro
3. [Arsitektur Frontend: Unified App Shell & Conditional Module Federation 2.0](#3-arsitektur-frontend-unified-app-shell--conditional-module-federation-20)
   * 3.1 Struktur Shell Host & Remote SPA
   * 3.2 Spesifikasi Module Federation 2.0 Dinamis vs Internal Routed
   * 3.3 Logika Penentuan Mode Workspace Berdasarkan Spesifikasi EAP
   * 3.4 Pustaka Singleton Bersama & Isolasi Error Boundary
   * 3.5 Kontrak Antarmuka `@panrita/shell-api` (TypeScript)
   * 3.6 Alur Autentikasi OIDC PKCE via Keycloak (D-13)
4. [Technology Stack Komprehensif](#4-technology-stack-komprehensif)
   * 4.1 Frontend & Micro-Frontend
   * 4.2 Backend & Service Layer
   * 4.3 AI Engine, Guardrails & Pemrosesan Bahasa Alami
   * 4.4 Integrasi, Event Backbone & Orkestrasi Saga (EIO)
   * 4.5 Data Layer, Cache & Graph Storage
   * 4.6 Keamanan, Identitas & Secrets Management
5. [Arsitektur Database & Spesifikasi Skema](#5-arsitektur-database--spesifikasi-skema)
   * 5.1 Strategi Pemisahan Skema Database `kalla_eap`
   * 5.2 Skema Seragam `set` (D-12, D-14 Compliant - Tanpa PII)
   * 5.3 Skema `eaw` (Metadata 6 Domain Arsitektur SAORAJA)
   * 5.4 Skema `gse` & `console`
   * 5.5 Topologi Database Ekosistem (PRD §3)
6. [Arsitektur Integrasi & Kontrak API](#6-arsitektur-integrasi--kontrak-api)
   * 6.1 Integrasi EAP dengan SEDDI (CMP) & Platform PANRITA
   * 6.2 Standar Kontrak API EAP (OpenAPI 3.1 YAML)
   * 6.3 EIO — 6-Layer Mediation Engine (EIO-01)
7. [Spesifikasi Modul — 22 Requirements dengan Acceptance Criteria](#7-spesifikasi-modul--22-requirements-dengan-acceptance-criteria)
8. [Arsitektur Keamanan & Kepatuhan Regulasi](#8-arsitektur-keamanan--kepatuhan-regulasi)
   * 8.1 Verifikasi Token Asimetris JWT (D-13) & JWKS
   * 8.2 Proteksi Kolom PII & Automated CI `pii-guard`
   * 8.3 Zero Trust & mTLS via SPIFFE/SPIRE
   * 8.4 Audit Trail Immutable & Security Definer
   * 8.5 Mesin Kebijakan AI Eksternal (OPA/Rego) & Hard Fencing
9. [Strategi Deployment & DevOps Multi-Repo](#9-strategi-deployment--devops-multi-repo)
   * 9.1 GitOps Workflow (D-02)
   * 9.2 Migrasi Basis Data Idempoten
   * 9.3 Manajemen Rahasia via Vault
10. [Roadmap Teknis & Status Implementasi](#10-roadmap-teknis--status-implementasi)
11. [Matriks Keterhubungan (Traceability Matrix)](#11-matriks-keterhubungan-traceability-matrix)
12. [Glosarium & Referensi Teknis](#12-glosarium--referensi-teknis)

---

## 1. Pendahuluan & Konvensi Teknis

### 1.1 Tujuan Dokumen
Dokumen Software Requirements Specification (SRS) ini adalah **spesifikasi teknis implementasi** resmi bagi pengembang perangkat lunak, arsitek sistem, dan tim DevOps yang membangun **SAORAJA (EAP)** serta mengorkestrasi pembuatan platform operasional **PANRITA-[Kode Platform]**. Dokumen ini menerjemahkan seluruh kebutuhan bisnis dari [PRD.md](./PRD.md) menjadi rancangan arsitektur, DDL basis data, kontrak antarmuka API, dan aturan kode deterministik.

### 1.2 Standar Konvensi & ID Keputusan
* **D-xx:** Kode Keputusan Arsitektur Global (*Architecture Decisions*, lihat [PRD.md §9](./PRD.md)).
* **AF-xx:** Keputusan Terkunci Kerangka Kerja SAORAJA (*SAORAJA Architecture Framework*, lihat [SAF.md §2](./SAF.md)).
* **Database EAP:** `kalla_eap` · **Skema:** `eaw` (metadata arsitektur 6 domain), `set` (RBAC & sesi D-12/D-14), `gse` (scaffolding engine), `console` (AI & tata kelola EIO), `shared` (modul bersama KEIS: audit, documents, outbox), `ref` (replika CDC dari SEDDI).
* **Format Penamaan Objek:** `database.schema.tabel` (contoh: `kalla_eap.eaw.application`).
* **Format Izin Hak Akses:** `<workspace>.<modul>.<aksi>` (contoh: `eaw.catalog.write`, `gse.project.run`).

### 1.3 Penegakan D-14: Larangan PII di Database EAP
* **Aturan Kepatuhan D-14:** Basis data `kalla_eap` **DILARANG MENYIMPAN DATA PRIBADI (PII)** seperti nama lengkap, email, nomor HP, NIK, alamat rumah, atau tanggal lahir.
* **Pengenal Tunggal Buram:** Tabel pengguna `set.users` hanya menyimpan `idp_subject` (klaim `sub` dari token JWT Keycloak) dan status aktif `is_active`.
* **Sumber Data Pribadi:** Seluruh data profil pengguna disimpan eksklusif di basis data `kalla_cmp` — skema `mdm` (party, identitas terenkripsi) dan `iam` (`iam.users` sebagai **sumber tunggal identitas pengguna seluruh KEIS**, cmp/PRD NFR-06). Tampilan profil di antarmuka EAP diambil melalui skema replika read-only `ref.users` (yang disinkronkan via CDC dari `cmp.iam.users`) atau melalui panggilan API aman ke SEDDI.

---

## 2. Arsitektur Sistem Tingkat Tinggi

### 2.1 Diagram Blok Arsitektur Global

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         BROWSER CLIENT                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                     SAORAJA UNIFIED APP SHELL (Host Container · Port 5170)                  │  │
│  │   [Header: Org Selector | Global Search Ctrl+K | Notifikasi | User Profile | MIND Copilot]  │  │
│  │  ┌───────────────┬───────────────┬───────────────┬───────────────────┬───────────────────┐  │  │
│  │  │  EAW (p.5171) │  GSE (p.5172) │  REQ (p.5173) │  CONSOLE (p.5174) │  SET/RBAC (p.5170)│  │  │
│  │  │  Remote SPA   │  Remote SPA   │  Remote SPA   │  Remote SPA       │  Internal Routed  │  │  │
│  │  │  Loaded MF2.0 │  Loaded MF2.0 │  Loaded MF2.0 │  Loaded MF2.0     │  Sub-App Direct   │  │  │
│  │  └───────────────┴───────────────┴───────────────┴───────────────────┴───────────────────┘  │  │
│  └──────────────────────────────────────────────┬──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┼─────────────────────────────────────────────────┘
                                                  │ HTTPS / WSS / TLS 1.3
                                                  ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                API GATEWAY LAYER (Apache APISIX OSS)                              │
│   Routing Dinamis · Rate Limiting · JWKS JWT Verification (RS256/ES256) · OpenTelemetry Tracing   │
└───────┬────────────────────┬────────────────────┬────────────────────┬────────────────────┬───────┘
        │                    │                    │                    │                    │
        ▼                    ▼                    ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  EAW SERVICE  │    │  GSE ENGINE   │    │ AI/REQ COPILOT│    │  CONSOLE GOV  │    │  EIO BROKER   │
│ 6 Domain Model│    │Scaffolding Svc│    │ FastAPI (Py)  │    │ AI Model Reg. │    │Mediasi 6-Layer│
│  APM Catalog  │    │ Flow Builder  │    │ NeMo Guardrail│    │FinOps Metering│    │ Temporal Saga │
│ Lineage Neo4j │    │ Multi-Git PR  │    │OPA Policy Eng.│    │ IKA & EIO Ctrl│    │Kafka Connector│
│ NestJS p.3001 │    │ Nest+Go p.3002│    │ Python p.3003 │    │ NestJS p.3004 │    │Go Fiber p.3005│
└───────┬───────┘    └───────┬───────┘    └───────┬───────┘    └───────┬───────┘    └───────┬───────┘
        │                    │                    │                    │                    │
        ▼                    ▼                    ▼                    ▼                    ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                      SHARED PLATFORM BACKBONE                                     │
│   ┌────────────────────┐   ┌────────────────────┐   ┌───────────────────┐   ┌──────────────────┐  │
│   │ Keycloak IdP (SSO) │   │ HashiCorp Vault    │   │ Temporal.io Saga  │   │ Apache Kafka /   │  │
│   │ realm: corporate   │   │ Secrets & Tokens   │   │ State Orchestrator│   │ Redpanda Events  │  │
│   └────────────────────┘   └────────────────────┘   └───────────────────┘   └──────────────────┘  │
└─────────────────────────────────────────┬─────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         PERSISTENCE LAYER                                         │
│   ┌───────────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────────┐   │
│   │ PostgreSQL ≥16 HA         │   │ Neo4j Community 5         │   │ pgvector / Qdrant         │   │
│   │ db: kalla_eap             │   │ Graf Relasi & Lineage     │   │ RAG Embeddings Dokumen    │   │
│   │ eaw,set,gse,console,shared│   │ 6 Domain Arsitektur       │   │ Arsitektur & Kamus Data   │   │
│   └───────────────────────────┘   └───────────────────────────┘   └───────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Pola Arsitektur Backend & Layanan Mikro
Setiap layanan backend dibangun menggunakan prinsip **Modular Clean Architecture**:
```
Controller Layer (REST Endpoints / OpenAPI 3.1)
       │
       ▼
Service Layer (Logika Bisnis Arsitektur & Validasi Domain)
       │
       ├──► Validator / Guard (RBAC Permissions, Entity Scoping)
       │
       ▼
Repository Layer (Data Access — Prisma / sqlc)
       │
       ▼
Database (PostgreSQL ≥16: schema eaw, set, gse, console, shared, ref)

──── Cross-Cutting Concerns ────
• Logging & Audit Trail Immutable (append-only)
• Error Handling Standar (RFC 9457 Problem Details)
• Autentikasi Asimetris (JWT RS256/ES256 via JWKS)
• OpenTelemetry Distributed Tracing
```

---

## 3. Arsitektur Frontend: Unified App Shell & Conditional Module Federation 2.0

### 3.1 Struktur Shell Host & Remote SPA
Frontend SAORAJA (EAP) mengadopsi standar Unified App Shell yang juga menjadi acuan blueprint seluruh platform PANRITA:

| Modul Frontend | Port Dev | Mode Deployment Default | Deskripsi Fungsional |
|---|---|---|---|
| **EAP Host Shell** | 5170 | Host Container | Shell navigasi global, sesi SSO OIDC, header, dan dynamic loader. |
| **EAW Workspace** | 5171 | `FEDERATED_REMOTE` | Kanvas visual ArchiMate 3.2, katalog APM, KRA, graf lineage. |
| **GSE Workspace** | 5172 | `FEDERATED_REMOTE` | Generator proyek, template builder, Web IDE Monaco, status PR. |
| **REQ Workspace** | 5173 | `FEDERATED_REMOTE` | Asisten AI percakapan elisitasi kebutuhan sistem ter-guardrail. |
| **CONSOLE Workspace**| 5174| `FEDERATED_REMOTE` | Dashboard IKA, FinOps token metering, AI Model Register, EIO. |
| **SET Workspace** | 5170 | `INTERNAL_ROUTED` | Modul internal administrasi pengguna, peran, dan audit log. |

### 3.2 Spesifikasi Module Federation 2.0 Dinamis vs Internal Routed
* **Module Federation 2.0 (`@module-federation/vite`):** Remote workspace mengekspos entry `./App` tanpa props (mengambil konteks dari `@panrita/shell-api`).
* **Internal Routed SPA:** Modul yang dikonfigurasi sebagai internal routed dibundel langsung di repositori shell dan dimount melalui rute React Router standar tanpa pemanggilan jaringan remoteEntry.

### 3.3 Logika Penentuan Mode Workspace Berdasarkan Spesifikasi EAP
Setiap entri workspace di tabel `eaw.application` memiliki atribut penentu mode arsitektur:
* `workspace_mode`: `FEDERATED_REMOTE` vs `INTERNAL_ROUTED`.
* `federation_scope`: Nama modul federasi unik (misal: `panrita_base_pulse`).
* `remote_entry_url`: URL runtime `remoteEntry.js`.

**Komponen Loader Dinamis pada Host Shell:**
```typescript
// apps/shell/src/router/WorkspaceLoader.tsx
import React, { Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { loadRemote } from '@module-federation/enhanced/runtime';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import { WorkspaceErrorBoundary } from '@/components/WorkspaceErrorBoundary';
import { internalWorkspaceRegistry } from '@/internal-workspaces';
import { useWorkspaceMetadata } from '@/hooks/useWorkspaceMetadata';

export const WorkspaceLoader: React.FC = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { metadata, isLoading, error } = useWorkspaceMetadata(workspaceId);

  if (isLoading) return <SkeletonLoader text="Memuat konfigurasi workspace..." />;
  if (error || !metadata) return <div className="p-6 text-destructive">Gagal memuat metadata workspace.</div>;

  // Evaluasi Mode 1: Internal Routed SPA
  if (metadata.workspaceMode === 'INTERNAL_ROUTED') {
    const InternalComponent = internalWorkspaceRegistry[workspaceId];
    if (!InternalComponent) {
      return <div className="p-6">Workspace internal tidak terdaftar di shell.</div>;
    }
    return (
      <WorkspaceErrorBoundary workspaceId={workspaceId}>
        <Suspense fallback={<SkeletonLoader text="Merender modul internal..." />}>
          <InternalComponent />
        </Suspense>
      </WorkspaceErrorBoundary>
    );
  }

  // Evaluasi Mode 2: Federated Remote SPA via Module Federation 2.0
  const RemoteComponent = React.lazy(() =>
    loadRemote<React.ComponentType>(`${metadata.federationScope}/App`)
  );

  return (
    <WorkspaceErrorBoundary workspaceId={workspaceId}>
      <Suspense fallback={<SkeletonLoader text="Menghubungkan remote micro-frontend..." />}>
        <RemoteComponent />
      </Suspense>
    </WorkspaceErrorBoundary>
  );
};
```

### 3.4 Pustaka Singleton Bersama & Isolasi Error Boundary
* **Singleton Pustaka Bersama (`shared`):** Host dan remote berbagi instance pustaka yang sama:
  * `react` dan `react-dom` (singleton: true, requiredVersion: `^19.0.0`)
  * `@tanstack/react-query` (singleton: true)
  * `@panrita/shell-api` (singleton: true)
  * `zustand` (singleton: true)
* **Isolasi Error Boundary:** Crash atau unhandled exception pada salah satu remote workspace diisolasi oleh `WorkspaceErrorBoundary`, sehingga navigasi shell dan sesi kerja workspace lain tetap berjalan normal.

### 3.5 Kontrak Antarmuka `@panrita/shell-api` (TypeScript)

```typescript
// packages/shell-api/src/index.tsx
export interface UserProfile {
  sub: string;                   // idp_subject Keycloak (D-14)
  preferredUsername: string;
  roles: string[];               // klaim peran resmi dari JWT
  tenantId: string;              // Holding/SBU aktif saat ini
  companyId: string;             // UUID entitas aktif
  locale: 'id' | 'en';
}

export interface ShellContextValue {
  user: UserProfile;
  activePlatform: string;        // e.g., 'SAORAJA-EAP'
  activeWorkspace: string;       // e.g., 'EAW'
  authToken: string;             // Bearer JWT Access Token
  setTenantContext: (tenantId: string, companyId: string) => Promise<void>;
  notify: (toast: { title: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }) => void;
  openGlobalSearch: () => void;
  triggerCopilot: (initialPrompt?: string) => void;
}

export function useShell(): ShellContextValue;
export function useApi(): (path: string, init?: RequestInit) => Promise<Response>;
```

### 3.6 Alur Autentikasi OIDC PKCE via Keycloak (D-13)
* **Protokol:** Authorization Code Flow dengan **PKCE (S256)** ke Keycloak self-hosted, klien publik `eap-shell`.
* **Karakteristik Token:** JWT Asimetris algoritma **RS256 atau ES256** dengan masa berlaku **≤1 jam** (D-13). Algoritma simetris `HS*` dan mode `none` ditolak mutlak.
* **Arah Sinkronisasi Identitas (D-14):** Keycloak adalah **sumber autentikasi**; pengguna disalin **dari Keycloak ke `kalla_cmp.iam.users`** (peran `idp_sync`, cmp/PRD §7.1), kemudian EAP membacanya lewat replika CDC `ref.users`. EAP tidak pernah menyalin data pribadi ke `kalla_eap`.

---

## 4. Technology Stack Komprehensif

### 4.1 Frontend & Micro-Frontend

| Komponen | Teknologi | Versi | Justifikasi Teknis |
|---|---|---|---|
| Framework UI | **React** | 19.x | Standar konsisten antarmuka ekosistem korporasi. |
| Bahasa | **TypeScript** | 5.x | Type safety, maintainability pada basis kode besar. |
| Bundler & Dev Server| **Vite** | 6.x | Kecepatan build optimal, native ESM, HMR instan. |
| CSS & Styling | **Tailwind CSS + Shadcn UI**| 4.x + Radix | Desain konsisten, aksesibel WCAG 2.2 AA. |
| Micro-Frontend Engine| **Module Federation 2.0** | Latest | D-01; satu shell terpadu, deploy mandiri per workspace. |
| Engine Diagram Visual| **@xyflow/react (React Flow)**| 12.x | Visualisasi graf 6 domain ArchiMate 3.2 interaktif. |
| State Management | **Zustand + TanStack Query**| Latest | State lokal ringan + caching server state otomatis. |
| Editor Web IDE | **Monaco Editor** | Latest | Editor kode bawaan untuk TS, Go, Python, SQL, YAML. |

### 4.2 Backend & Service Layer

| Komponen | Teknologi | Versi | Justifikasi Teknis |
|---|---|---|---|
| Layanan API EAW/GSE | **NestJS (TypeScript)** | 10.x | Arsitektur modular enterprise, dependency injection, type-safe. |
| Layanan Mediasi EIO | **Go (Fiber)** | ≥1.25 | Kinerja konkurensi tinggi, konsumsi RAM rendah, latensi p95 ≤500ms. |
| Layanan AI Copilot | **Python (FastAPI)** | 3.12 + 0.115+ | Kompatibilitas pustaka AI (NeMo, Presidio, LangGraph). |
| Database ORM | **Prisma (TS) / sqlc (Go)** | Latest | Mencegah SQL Injection, akses basis data type-safe. |
| Scaffolding Engine | **Jinja2 + Plop.js** | Latest | Generator template kode deterministik full-stack (D-04). |
| Git Automation | **isomorphic-git** | Latest | Pembuatan branch dan PR otomatis tanpa push ke main (D-02). |

### 4.3 AI Engine, Guardrails & Pemrosesan Bahasa Alami

| Komponen | Teknologi | Versi | Justifikasi Teknis |
|---|---|---|---|
| Policy Engine | **Open Policy Agent (OPA/Rego)**| 1.1.0+ | Mesin evaluasi aturan keamanan & anti-jailbreak terpisah (fail-closed).|
| Domain Fencing | **NeMo Guardrails** | Latest | Klasifikasi intent berbasis embedding (tanpa LLM call). |
| Masking Privasi PII | **Microsoft Presidio** | Latest | Masking data sensitif otomatis sebelum keluar ke AI cloud. |
| LLM Gateway | **LiteLLM Core (OSS)** | Latest | Proxy terpusat, failover model, token metering ke Kafka. |
| Penempatan Model | **Hybrid: Cloud + On-Prem GPU** | Latest | Data sensitif wajib diproses di server on-premise GPU (D-05). |

### 4.4 Integrasi, Event Backbone & Orkestrasi Saga (EIO)

| Komponen | Teknologi | Versi | Justifikasi Teknis |
|---|---|---|---|
| API Gateway | **Apache APISIX (OSS)** | Latest | Verifikasi JWT via JWKS, rate limiting, routing terpusat. |
| Saga Orchestrator | **Temporal.io** | Latest | Orkestrasi workflow transaksi terdistribusi dengan kompensasi idempoten (D-07).|
| Event Backbone | **Apache Kafka / Redpanda** | Latest | Pengiriman event asinkron CloudEvents 1.0 (≥500 req/s), DLQ aktif. |
| Kontrak Data | **OpenAPI 3.1 / Avro Registry** | Latest | Deteksi dini breaking change skema data di CI/CD. |

### 4.5 Data Layer, Cache & Graph Storage

| Komponen | Teknologi | Versi | Justifikasi Teknis |
|---|---|---|---|
| Basis Data Relasional| **PostgreSQL HA (Patroni/CNPG)**| ≥16 (Prod 18.3)| Database relasional ACID teruji, ekstensi pgvector, pg_trgm, btree_gin. |
| Graph Database | **Neo4j Community 5 / Apache AGE**| 5.x | Analisis graf relasi silsilah arsitektur (lineage) ≤1.000 node ≤10 detik. |
| In-Memory Cache | **Valkey / Redis** | 7.x | Caching sesi pengguna, rate limit token, query accelerator. |

### 4.6 Keamanan, Identitas & Secrets Management

| Komponen | Teknologi | Versi | Justifikasi Teknis |
|---|---|---|---|
| Identity Provider (IdP)| **Keycloak Self-Hosted** | Latest | SSO terpusat, OIDC PKCE, integrasi profil ke SEDDI (D-13). |
| Secrets Management | **HashiCorp Vault / OpenBao** | Latest | Penyimpanan aman kredensial DB, kunci enkripsi, dan API keys. |
| Service Identity | **SPIFFE/SPIRE** | Latest | Identitas workload mTLS antar-layanan internal. |
| Software Supply Chain| **Grype + Syft** | Latest | Pemindaian kerentanan SCA dan penerbitan SBOM SPDX 2.3. |

---

## 5. Arsitektur Database & Spesifikasi Skema

### 5.1 Strategi Pemisahan Skema Database `kalla_eap`
Basis data `kalla_eap` menggunakan pemisahan skema berbasis domain fungsional:
* `set`: Otorisasi, RBAC, dan sesi pengguna (D-12, D-14 Compliant - Tanpa PII).
* `eaw`: Metadata arsitektur enterprise 6 domain, KRA, kerangka kerja, relasi, ADR, dan alur persetujuan ARB.
* `gse`: Registri proyek scaffolding, blueprint template, dan manifest repositori Git.
* `console`: Inventaris model AI, FinOps metering token, dan registri konektor integrasi EIO.
* `shared`: Modul bersama lintas platform KEIS — `audit_logs`, `documents`, `outbox`, dan fungsi `apply_standard()`. **Struktur tabel identik dengan `kalla_cmp.shared`** (sumber kebenaran: `010_shared.sql`). Yang berbeda hanya **parameter `p_user_table` pada `apply_standard()`** — dipanggil pada *tabel domain* (`set.users` di EAP, `iam.users` di CMP) — ADR-CMP-004.
* `ref`: Replika read-only hasil CDC `pub_cmp_ref` (31 tabel) dari SEDDI — `ref.users`, `ref.companies`, `ref.employees`, dll.

### 5.2 Skema Seragam `set` & Modul `shared` (D-12, D-14 Compliant — Tanpa PII)

```sql
-- ============================================================================
-- SKEMA: set (D-12 — Pola Seragam Otorisasi Platform Holding)
-- KEPATUHAN D-14: DILARANG MENYIMPAN DATA PRIBADI (PII) DI TABEL INI.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS set;
CREATE SCHEMA IF NOT EXISTS shared;   -- Modul bersama KEIS (identik dgn kalla_cmp.shared — ADR-CMP-004)

-- 1. Tabel Akun Pengguna (Hanya Pengenal Buram IdP)
CREATE TABLE set.users (
    user_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idp_subject    VARCHAR(200) UNIQUE NOT NULL,  -- Klaim "sub" dari JWT Keycloak (D-14)
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at  TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE set.users IS 'D-14: Hanya menyimpan idp_subject (sub) + status. Data profil nama/email dibaca dari ref.users.';
CREATE INDEX idx_users_idp_sub ON set.users(idp_subject);
CREATE INDEX idx_users_active ON set.users(is_active) WHERE is_active = TRUE;

-- 2. Tabel Peran Sistem (Roles)
CREATE TABLE set.roles (
    role_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_code   VARCHAR(50) UNIQUE NOT NULL,   -- e.g., 'ROLE_EAP_ARB_CHAIR'
    role_name   VARCHAR(100) NOT NULL,
    tier        VARCHAR(30) NOT NULL,          -- 'T1_GOVERNANCE', 'T2_DOMAIN', 'T3_EXECUTION', 'T4_ASSURANCE'
    description TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabel Penugasan Peran Berlingkup Entitas
CREATE TABLE set.user_roles (
    user_id      UUID NOT NULL REFERENCES set.users(user_id) ON DELETE CASCADE,
    role_id      UUID NOT NULL REFERENCES set.roles(role_id) ON DELETE CASCADE,
    entity_scope VARCHAR(50),                  -- ID Perusahaan / SBU (NULL = Berlaku Holding-wide)
    assigned_by  UUID REFERENCES set.users(user_id),
    assigned_at  TIMESTAMPTZ DEFAULT NOW(),
    valid_until  TIMESTAMPTZ,                  -- NULL = Tidak Berbatas Waktu
    PRIMARY KEY (user_id, role_id, entity_scope)
);

-- 4. Tabel Izin Granular (Permissions)
CREATE TABLE set.permissions (
    permission_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_code VARCHAR(80) UNIQUE NOT NULL,  -- Format: <workspace>.<modul>.<aksi>
    workspace       VARCHAR(20) NOT NULL,
    module          VARCHAR(50) NOT NULL,
    action          VARCHAR(20) NOT NULL,          -- 'read', 'write', 'delete', 'approve', 'run', 'admin'
    description     TEXT,
    CHECK (permission_code = workspace || '.' || module || '.' || action)
);

-- 5. Tabel Relasi Peran - Izin
CREATE TABLE set.role_permissions (
    role_id       UUID NOT NULL REFERENCES set.roles(role_id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES set.permissions(permission_id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 6. Tabel Log Audit Trail — modul shared, struktur identik dgn kalla_cmp.shared (010_shared.sql)
--    Append-only: UPDATE/DELETE/TRUNCATE ditolak trigger trg_audit_logs_immutable.
CREATE TABLE shared.audit_logs (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_schema   VARCHAR(63)  NOT NULL,
    table_name     VARCHAR(63)  NOT NULL,
    record_id      UUID,
    action         VARCHAR(10)  NOT NULL CHECK (action IN ('insert','update','delete')),
    changed_by     UUID,
    changed_at     TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp(),
    old_values     JSONB CHECK (old_values IS NULL OR jsonb_typeof(old_values) = 'object'),
    new_values     JSONB CHECK (new_values IS NULL OR jsonb_typeof(new_values) = 'object'),
    correlation_id UUID
);
CREATE INDEX ix_audit_logs_record  ON shared.audit_logs (table_schema, table_name, record_id);
CREATE INDEX ix_audit_logs_changed ON shared.audit_logs (changed_at);
COMMENT ON TABLE shared.audit_logs IS 'Jejak audit append-only. UPDATE/DELETE/TRUNCATE ditolak trigger dan dicabut dari semua role.';

-- 7. Modul berbagi lain (struktur identik dengan kalla_cmp.shared)
--    shared.documents : metadata berkas (object storage), bukti persetujuan PDP
--    shared.outbox    : event CDC ke integration gateway (transactional outbox)
--
-- CATATAN apply_standard() — DIPANGGILKAN PADA TABEL DOMAIN, BUKAN PADA shared.*:
--   CALL shared.apply_standard(
--        p_table      => 'eaw.application',   -- tabel domain yang dimiliki platform ini
--        p_class      => 'internal',
--        p_user_table => 'set.users',         -- IAM: 'set.users' di EAP, 'iam.users' di CMP
--        p_redact     => NULL);
--   Fungsi ini menambahkan created_by/at, updated_by/at, deleted_at, row_version,
--   classification pada tabel domain tersebut. Perbedaan semantik inilah yang
--   diecualikan dari gate cross_check_shared.sh (ADR-CMP-004 rekomendasi 1).
```

### 5.3 Skema `eaw` (Metadata 6 Domain Arsitektur SAORAJA)

```sql
-- ============================================================================
-- SKEMA: eaw (Metadata Arsitektur Enterprise SAORAJA 6 Domain - SAF §5)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS eaw;

-- Struktur Organisasi & Entitas Bisnis
-- ---------------------------------------------------------------------------
-- NOTE ADR-CMP-003 (2026): `eaw.entity_org` TIDAK lagi dibuat sebagai tabel
-- otonom. DDL asli di bawah dipertahankan sebagai referensi pola W0/W1;
-- implementasi kini adalah VIEW (eap/migrations/0001_eaw_entity_org_view.sql):
--     CREATE VIEW eaw.entity_org
-- yang membaca `ref.business_groups` (replika CDC) dan menautkan atribut
-- arsitektur milik EAP dari `eaw.entity_org_metadata`. CMP = SSOT.
-- ---------------------------------------------------------------------------
CREATE TABLE eaw.entity_org (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama       VARCHAR(200) NOT NULL,
    tingkat    VARCHAR(20) NOT NULL CHECK (tingkat IN ('holding','ecosystem','sbu','unit')),
    parent_id  UUID REFERENCES eaw.entity_org(id),
    kode       VARCHAR(30) UNIQUE NOT NULL,
    status     VARCHAR(20) NOT NULL DEFAULT 'Draf' CHECK (status IN ('Draf','Divalidasi','Ditetapkan','Dipublikasi','Direviu')),
    created_by UUID REFERENCES set.users(user_id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Referensi Arsitektur Korporat (KRA - Corporate Reference Architecture)
CREATE TABLE eaw.reference (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain     VARCHAR(30) NOT NULL CHECK (domain IN ('proses_bisnis','layanan','data','aplikasi','infrastruktur','keamanan')),
    kode       VARCHAR(50) UNIQUE NOT NULL,
    nama       VARCHAR(200) NOT NULL,
    versi      VARCHAR(20) NOT NULL DEFAULT '1.0',
    deskripsi  TEXT,
    status     VARCHAR(20) NOT NULL DEFAULT 'Draf',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kerangka Kerja per Layanan Utama (AF-02)
CREATE TABLE eaw.framework (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id     UUID NOT NULL REFERENCES eaw.entity_org(id),
    layanan_utama VARCHAR(200) NOT NULL,
    tipe          VARCHAR(20) NOT NULL CHECK (tipe IN ('utama','pendukung')),
    status        VARCHAR(20) NOT NULL DEFAULT 'Draf',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Domain 1: Proses Bisnis
CREATE TABLE eaw.process (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama            VARCHAR(200) NOT NULL,
    level           SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 3),
    parent_id       UUID REFERENCES eaw.process(id),
    pemilik_jabatan VARCHAR(100),
    input           TEXT,                        -- Input proses (bahan/informasi masukan)
    output          TEXT,                        -- Output proses (hasil/informasi keluaran)
    referensi_id    UUID REFERENCES eaw.reference(id),
    entity_id       UUID NOT NULL REFERENCES eaw.entity_org(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'Draf',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Domain 2: Data & Informasi
CREATE TABLE eaw.data_entity (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_kanonikal    VARCHAR(200) NOT NULL,
    klasifikasi       VARCHAR(20) NOT NULL CHECK (klasifikasi IN ('publik','internal','terbatas','rahasia')),
    pii               BOOLEAN NOT NULL DEFAULT FALSE,
    steward           VARCHAR(100),
    sumber_otoritatif VARCHAR(100),    -- e.g., 'kalla_cmp.mdm.parties'
    retensi_hari      INTEGER,
    referensi_id      UUID REFERENCES eaw.reference(id),
    entity_id         UUID NOT NULL REFERENCES eaw.entity_org(id),
    status            VARCHAR(20) NOT NULL DEFAULT 'Draf',
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Domain 3: Layanan Enterprise
CREATE TABLE eaw.service (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama         VARCHAR(200) NOT NULL,
    tipe         VARCHAR(20) NOT NULL CHECK (tipe IN ('internal','pelanggan-mitra')),
    kategori     VARCHAR(20) NOT NULL CHECK (kategori IN ('utama','pendukung')),
    pemilik      VARCHAR(100),                  -- Pemilik layanan (jabatan/role)
    slo          VARCHAR(200),
    kanal        VARCHAR(100),                  -- Kanal pengiriman (web, mobile, API, gerai)
    referensi_id UUID REFERENCES eaw.reference(id),
    entity_id    UUID NOT NULL REFERENCES eaw.entity_org(id),
    status       VARCHAR(20) NOT NULL DEFAULT 'Draf',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Domain 4: Aplikasi (Portofolio APM & Konfigurasi Mode Workspace)
CREATE TABLE eaw.application (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode             VARCHAR(50) UNIQUE NOT NULL,  -- e.g., 'PANRITA-BASE', 'PULSE'
    nama             VARCHAR(200) NOT NULL,
    platform         VARCHAR(50),                  -- Induk platform jika berupa workspace
    workspace        VARCHAR(50),
    jenis            VARCHAR(20) NOT NULL CHECK (jenis IN ('umum','khusus')),
    workspace_mode   VARCHAR(30) NOT NULL DEFAULT 'INTERNAL_ROUTED' CHECK (workspace_mode IN ('FEDERATED_REMOTE','INTERNAL_ROUTED')),
    federation_scope VARCHAR(100),                 -- Nama modul Module Federation (jika federated)
    remote_entry_url VARCHAR(255),                 -- URL remoteEntry.js saat runtime
    repo_git         VARCHAR(255),
    owner_bisnis     VARCHAR(100),
    owner_teknis     VARCHAR(100),
    lifecycle        VARCHAR(20) DEFAULT 'planned' CHECK (lifecycle IN ('planned','active','deprecated','retired')),
    kritikalitas     VARCHAR(20) DEFAULT 'medium' CHECK (kritikalitas IN ('low','medium','high','critical')),
    risiko_ai        VARCHAR(20) DEFAULT 'none' CHECK (risiko_ai IN ('none','low','medium','high')),
    slo              VARCHAR(200),
    referensi_id     UUID REFERENCES eaw.reference(id),
    entity_id        UUID NOT NULL REFERENCES eaw.entity_org(id),
    status           VARCHAR(20) NOT NULL DEFAULT 'Draf',
    row_version      INTEGER NOT NULL DEFAULT 1,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE eaw.application IS 'Katalog portofolio aplikasi. Atribut workspace_mode menentukan pemuatan Module Federation 2.0 vs Internal Routed.';

-- Domain 5: Infrastruktur & Teknologi
CREATE TABLE eaw.infra_asset (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama         VARCHAR(200) NOT NULL,
    tipe         VARCHAR(30) NOT NULL CHECK (tipe IN ('klaster-k8s','klaster-db','gpu','jaringan','cloud','dc-fisik')),
    lokasi       VARCHAR(100),
    kapasitas    VARCHAR(100),
    dr_tier      VARCHAR(20),
    referensi_id UUID REFERENCES eaw.reference(id),
    entity_id    UUID NOT NULL REFERENCES eaw.entity_org(id),
    status       VARCHAR(20) NOT NULL DEFAULT 'Draf',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Domain 6: Keamanan Informasi
CREATE TABLE eaw.control (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aspek            VARCHAR(30) NOT NULL CHECK (aspek IN ('kerahasiaan','keutuhan','ketersediaan','keaslian','kenirsangkalan')),
    standar_rujukan  VARCHAR(100),     -- e.g., 'ISO 27001 A.5.11', 'UU PDP Pasal 35'
    status_penerapan VARCHAR(20) NOT NULL CHECK (status_penerapan IN ('belum','sebagian','penuh')),
    referensi_id     UUID REFERENCES eaw.reference(id),
    entity_id        UUID NOT NULL REFERENCES eaw.entity_org(id),
    status           VARCHAR(20) NOT NULL DEFAULT 'Draf',
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Relasi Antar Domain ArchiMate 3.2
CREATE TABLE eaw.relation (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sumber_type VARCHAR(20) NOT NULL,
    sumber_id   UUID NOT NULL,
    target_type VARCHAR(20) NOT NULL,
    target_id   UUID NOT NULL,
    tipe        VARCHAR(50) NOT NULL,   -- 'serving','used-by','association','composition','realization','access'
    kerangka_id UUID REFERENCES eaw.framework(id),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_rel_sumber ON eaw.relation(sumber_type, sumber_id);
CREATE INDEX idx_rel_target ON eaw.relation(target_type, target_id);

-- Alur Tata Kelola Transisi Objek (Append-Only, AF-05)
CREATE TABLE eaw.workflow (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objek_type  VARCHAR(30) NOT NULL,
    objek_id    UUID NOT NULL,
    status_dari VARCHAR(20) NOT NULL,
    status_ke   VARCHAR(20) NOT NULL,
    pelaku      UUID NOT NULL REFERENCES set.users(user_id),
    catatan     TEXT,
    waktu       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Architecture Decision Records (ADR - D-01 s/d D-14)
CREATE TABLE eaw.adr (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    adr_code     VARCHAR(20) UNIQUE NOT NULL,
    title        VARCHAR(200) NOT NULL,
    context      TEXT NOT NULL,
    decision     TEXT NOT NULL,
    consequences TEXT,
    status       VARCHAR(20) NOT NULL CHECK (status IN ('Proposed','Accepted','Deprecated','Superseded')),
    git_ref      VARCHAR(255),
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ARB Clearance Register
CREATE TABLE eaw.arb_clearances (
    clearance_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number   VARCHAR(50) UNIQUE NOT NULL,
    proposed_by     UUID REFERENCES set.users(user_id),
    entity_id       UUID REFERENCES eaw.entity_org(id),
    initiative_name VARCHAR(200) NOT NULL,
    business_case   TEXT NOT NULL,
    estimated_cost  NUMERIC(15,2),
    ai_risk_score   NUMERIC(5,2),         -- Skor redundansi dari MIND AI
    status          VARCHAR(30) DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','IN_REVIEW','REVISION','APPROVED','REJECTED')),
    arb_notes       TEXT,
    certificate_id  VARCHAR(100),         -- Terbit saat APPROVED
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.4 Skema `gse` & `console`
* **`gse.projects`**: Menyimpan registri proyek scaffolding aktif, status branch Git, link PR, dan status verifikasi SCA/Linting.
* **`gse.templates`**: Menyimpan blueprint kode deterministik (Host Shell, Remote SPA, NestJS Clean, Go Fiber).
* **`console.ai_models`**: Registri inventaris model LLM, izin penggunaan, dan klasifikasi lokasi (Cloud vs On-Prem GPU).
* **`console.token_metering`**: Pencatatan agregasi konsumsi token LLM per tenant/SBU untuk pelaporan FinOps bulanan.
* **`console.eio_connectors`**: Registri konektor integrasi API dan status kesehatan deteksi breaking change.

### 5.5 Topologi Database Ekosistem (PRD §3)

| No | Platform | Basis Data Fisik | Skema Utama | Peran Skema `set` |
|---|---|---|---|---|
| 1 | **SAORAJA (EAP)** | `kalla_eap` | `eaw`, `set`, `gse`, `console`, `shared`, `ref` | D-12 (D-14 Compliant: tanpa PII) + modul `shared` identik + replika `ref.*` |
| 2 | **SEDDI (CMP)** | `kalla_cmp` | `mdm`, `iam`, `ref`, `shared` | Pengecualian D-12: Menggunakan skema `iam` (Pusat Identitas) |
| 3 | **PANRITA-OLP** | `kalla_olp` | `flux`, `set` | Mengikuti standar D-12 |
| 4 | **PANRITA-SSP** | *(Tanpa Database)* | *(Membaca `kalla_base.*`)*| Hak akses didelegasikan ke `kalla_base.set` (D-11) |
| 5 | **PANRITA-B-LINK** | `kalla_blink` | `forge`, `vantage`, `set`, `ref`| Mengikuti standar D-12 + replika CDC `ref.*` |
| 6 | **PANRITA-BASE** | `kalla_base` | `pulse`, `lea`, `apex`, `set`, `ref`, ...| Mengikuti standar D-12 + replika CDC `ref.*` |
| 7 | **PANRITA-SVP** | `kalla_svp` | `vanguard`, `accord`, `core`, `set`, `ref`| Mengikuti standar D-12 + replika CDC `ref.*` |
| 8 | **PANRITA-STRIDE-Hk**| `kalla_stride_hk`| `asi`, `asm`, `flow`, `fia`, `set`, `ref` | Mengikuti standar D-12 + replika CDC `ref.*` |
| 9 | **PANRITA-STRIDE-Bsu**| `kalla_stride_bsu`| `av`, `aeps`, `flow`, `fia`, `set`, `ref` | Mengikuti standar D-12 + replika CDC `ref.*` |

---

## 6. Arsitektur Integrasi & Kontrak API

### 6.1 Integrasi EAP dengan SEDDI (CMP) & Platform PANRITA

| Platform | Arah Pertukaran Data | Protokol / Mekanisme | Deskripsi Integrasi Teknis |
|---|---|---|---|
| **SEDDI (CMP)** | SEDDI → EAP | PostgreSQL Logical CDC | EAP menerima replika read-only `ref.users`, `ref.companies`, `ref.employees` (dan entitas lain sesuai `pub_cmp_ref` — 31 tabel) untuk konteks audit & tampilan profil. |
| **SEDDI (CMP)** | **EAP → CMP** | PostgreSQL Logical CDC | EAP mempublikasikan registry aplikasinya (`eaw.application`) ke replika `ref.applications` di CMP — **EAP pemilik registry, CMP hanya pemegang replika** (ADR-CMP-005). |
| **SEDDI (CMP)** | EAP → SEDDI | REST `POST /api/v1/arb/screen-redundancy` | MIND AI memeriksa ketersediaan master saat pre-screening ARB (anti-silo prinsip M1, cmp/SRS §8.5). |
| **SEDDI (CMP)** | SEDDI → EAP | Webhook `POST /api/v1/webhooks/employee-sync` | Mutasi pegawai (`cmp.workforce.employee_mutated`) memicu sinkronisasi role & scope RBAC di modul `set`. |
| **SEDDI (CMP)** | SEDDI → EAP | Feed `GET /api/v1/search/index-feed` | Indeks pencarian global Ctrl+K (type: `party`, `vendor`, `coa`, `product`, `branch`). |
| **SEDDI (CMP)** | EAP ↔ SEDDI | REST API Sinkron | EAP memanggil API SEDDI untuk verifikasi keunikan entitas saat sidang ARB. |
| **SEDDI (CMP)** | SEDDI → EAP | Event Bus (Kafka) | Notifikasi mutasi struktur data induk atau perubahan kamus data kanonikal. |
| **PANRITA-OLP** | OLP → EAP | REST API | EAP mengambil metadata pipeline ETL `FLUX` untuk visualisasi Data Lineage. |
| **Keycloak IdP** | EAP ↔ Keycloak | OIDC / OAuth2 PKCE | Autentikasi SSO via JWT asimetris; Keycloak disinkronkan **ke** `kalla_cmp.iam.users` (peran `idp_sync`), lalu dibaca EAP via `ref.users`. |
| **Multi-Git Repos**| EAP → Git | isomorphic-git / API | GSE Engine men-generate branch + Pull Request ke repositori platform target. |

### 6.2 Standar Kontrak API EAP (OpenAPI 3.1 YAML)

```yaml
openapi: "3.1.0"
info:
  title: "SAORAJA Enterprise Architecture Platform API"
  version: "3.0.0"
  description: "API Manajemen Arsitektur Enterprise & Konfigurasi Workspace"
servers:
  - url: "https://eap.corporate.internal/api/v1"
paths:
  /eaw/applications:
    get:
      summary: "Daftar aplikasi dalam portofolio arsitektur"
      tags: [EAW - Domain 4 Aplikasi]
      security:
        - BearerAuth: [eaw.catalog.read]
      parameters:
        - name: platform
          in: query
          schema: { type: string }
        - name: workspace_mode
          in: query
          schema: { type: string, enum: [FEDERATED_REMOTE, INTERNAL_ROUTED] }
      responses:
        "200":
          description: "Daftar aplikasi berhasil diambil"
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: "#/components/schemas/ApplicationDto"
        "401":
          description: "Token tidak valid / kedaluwarsa"
        "403":
          description: "Scope eaw.catalog.read tidak dimiliki"
    post:
      summary: "Mendaftarkan aplikasi/workspace baru ke katalog"
      tags: [EAW - Domain 4 Aplikasi]
      security:
        - BearerAuth: [eaw.catalog.write]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateApplicationDto"
      responses:
        "201":
          description: "Aplikasi berhasil didaftarkan berstatus Draf"
        "401":
          description: "Token tidak valid / kedaluwarsa"
        "403":
          description: "Scope eaw.catalog.write tidak dimiliki"
components:
  securitySchemes:
    BearerAuth:
      type: oauth2
      description: >-
        JWT asimetris RS256/ES256 yang diterbitkan Keycloak (D-13).
        Scope = izin granular <workspace>.<modul>.<aksi> yang diperiksa di API Gateway.
      flows:
        authorizationCode:
          authorizationUrl: "https://keycloak.corporate.internal/realms/corporate/protocol/openid-connect/auth"
          tokenUrl: "https://keycloak.corporate.internal/realms/corporate/protocol/openid-connect/token"
          scopes:
            eaw.catalog.read: "Membaca katalog portofolio aplikasi"
            eaw.catalog.write: "Menambah/mengubah katalog portofolio aplikasi"
  schemas:
    ApplicationDto:
      type: object
      properties:
        id: { type: string, format: uuid }
        kode: { type: string }
        nama: { type: string }
        workspaceMode: { type: string, enum: [FEDERATED_REMOTE, INTERNAL_ROUTED] }
        federationScope: { type: string }
        remoteEntryUrl: { type: string }
        status: { type: string, enum: [Draf, Divalidasi, Ditetapkan, Dipublikasi, Direviu] }
```

### 6.3 EIO — 6-Layer Mediation Engine (EIO-01)
Layer mediasi EIO bertindak sebagai penghubung layanan integrasi terpusat:
```
LAYER 1: Protocol Normalization     (REST / gRPC / GraphQL / Webhook → Internal Format)
LAYER 2: Identity Propagation       (JWT sub → Canonical Corporate ID via ref.users)
LAYER 3: Canonical Data Mapping     (10 Model Kanonikal: Party, Customer, Product, Order,
                                     Invoice, Payment, Employee, Asset, Document, Location)
LAYER 4: Business Rules Enforcement (Evaluasi kebijakan OPA / Rego Sidecar)
LAYER 5: Saga Orchestration         (Temporal.io — transaksi terdistribusi multi-layanan)
LAYER 6: Event Publishing           (CloudEvents 1.0 via Apache Kafka / Redpanda)
```

---

## 7. Spesifikasi Modul — 22 Requirements dengan Acceptance Criteria

### Req 1: EAW-01 — Visual ArchiMate 3.2 & TOGAF Modeling
* **User Story:** Sebagai Enterprise Architect, saya ingin membuat dan memvalidasi model arsitektur secara visual menggunakan standar ArchiMate 3.2.
* **Acceptance Criteria (AC):**
  1. EAW SHALL menyediakan kanvas ArchiMate 3.2 (7 layer: Motivation, Strategy, Business, Application, Technology, Physical, Implementation).
  2. WHEN elemen dibuat/diubah, EAW SHALL memvalidasi terhadap metamodel ArchiMate 3.2 secara real-time.
  3. WHEN validasi menemukan pelanggaran aturan relasi, EAW SHALL menampilkan pesan deskriptif spesifik.
  4. WHEN ekspor diminta, EAW SHALL menghasilkan format *Open Group Exchange XML*.
  5. EAW SHALL mendukung penautaan ABB/SBB ke platform pada `Project.md`.
  6. EAW SHALL menampilkan UI dalam dwibahasa (Bahasa Indonesia & Inggris) berstandar WCAG 2.2 AA.

### Req 2: EAW-02 — Application Portfolio Catalog (APM)
* **User Story:** Sebagai EA Office, saya ingin mengelola katalog portofolio aplikasi yang dimulai dari nol murni (*Zero Pre-Seed*).
* **Acceptance Criteria (AC):**
  1. EAW SHALL menyediakan form pendaftaran platform dan workspace dengan 4 metadata wajib: Pemilik Bisnis, Tim Pengembang, Risiko AI, dan SLO.
  2. EAW SHALL menyimpan status awal entri baru sebagai `Draf` (AF-05).
  3. WHEN entri disimpan tanpa metadata wajib lengkap, EAW SHALL menolak penyimpanan.
  4. EAW SHALL memungkinkan penentuan atribut `workspace_mode` (`FEDERATED_REMOTE` vs `INTERNAL_ROUTED`).

### Req 3: EAW-03 — Dependency Lineage & Impact Analysis
* **User Story:** Sebagai Enterprise Architect, saya ingin menganalisis dampak perubahan skema/API terhadap ekosistem.
* **Acceptance Criteria (AC):**
  1. EAW SHALL menampilkan graf relasi: *Proses Bisnis → Layanan → Workspace → Skema DB → Infrastruktur*.
  2. WHEN skema/endpoint berubah, EAW SHALL menyajikan daftar seluruh proses dan platform terdampak.
  3. Graf ≤1.000 node SHALL dirender dalam waktu ≤10 detik.

### Req 4: EAW-04 — ADR Manager
* **User Story:** Sebagai Chief Architect, saya ingin mengelola Architecture Decision Records berversi di Git.
* **Acceptance Criteria (AC):**
  1. EAW SHALL CRUD ADR dengan status: `Proposed`, `Accepted`, `Deprecated`, `Superseded`.
  2. WHEN ADR disimpan, EAW SHALL melakukan commit file Markdown ke repositori Git `eap`.
  3. EAW SHALL menautkan ADR D-01 s/d D-14 ke elemen model arsitektur EAW-01.

### Req 5: GSE-01/02 — Scaffolding & Multi-Git Sync
* **User Story:** Sebagai Developer, saya ingin men-generate boilerplate project full-stack dalam satu permintaan.
* **Acceptance Criteria (AC):**
  1. GSE SHALL menghasilkan full-stack project (kode sumber React 19 TS, NestJS/Go, OpenAPI 3.1, DDL DB, CI pipeline) dalam ≤45 detik.
  2. GSE SHALL membuat feature branch + PR di repositori Git target (0 push langsung ke main).
  3. Kode hasil scaffolding SHALL lolos linting, uji kompilasi, dan SCA Grype (0 copyleft viral).
  4. GSE SHALL hanya berjalan untuk Aplikasi yang terdaftar di EAW berstatus minimal *Divalidasi* (AF-06).

### Req 6: GSE-03 — Visual Agent & Flow Builder
* **Acceptance Criteria (AC):**
  1. GSE SHALL menghasilkan konfigurasi `agent.yaml` dan `flow.yaml` yang lolos validasi skema.
  2. Setiap langkah Saga yang memutasi data SHALL memiliki pasangan langkah kompensasi idempoten.

### Req 7: GSE-04 — Unified Workspace Container Shell Generator
* **Acceptance Criteria (AC):**
  1. Pindah antar-workspace dalam shell SHALL ≤300ms tanpa reload halaman penuh browser.
  2. Shell SHALL memuat remote workspace via Module Federation 2.0 dengan Error Boundary terisolasi.

### Req 8: GSE-05 — Web GSE IDE & Prompt Workbench
* **Acceptance Criteria (AC):**
  1. Editor Monaco terintegrasi SHALL aktif untuk file TypeScript, Go, Python, SQL, dan YAML.
  2. Prompt AI SHALL disimpan sebagai kode berversi di Git (*Prompt-as-Code*).

### Req 9: REQ-01 — Requirement Elicitation Chatbot
* **User Story:** Sebagai BA, saya ingin dielisitasi kebutuhan sistem melalui percakapan AI terpandu.
* **Acceptance Criteria (AC):**
  1. 1 sesi percakapan SHALL menghasilkan User Story terformat dan skenario pengujian Gherkin (Given-When-Then).
  2. Output SHALL dapat diekspor langsung ke dokumen Markdown.

### Req 10: REQ-02 — Strict Domain-Fencing Guardrail
* **Acceptance Criteria (AC):**
  1. NeMo Guardrails SHALL memblokir ≥99,5% topik di luar perancangan sistem korporat.
  2. Evaluasi guardrail SHALL ≤150ms tanpa memanggil LLM (mode embedding vektor).
  3. Guardrail TIDAK DAPAT dimatikan di tier pengguna mana pun (D-03).

### Req 11: REQ-03 — Anti-Jailbreak Protection
* **Acceptance Criteria (AC):**
  1. Proteksi indirect prompt injection dan roleplay jailbreak dievaluasi di container OPA/Rego eksternal.
  2. Bila service OPA tidak merespons, request ditolak secara aman (*fail-closed* / HTTP 503).

### Req 12: EIO-01 — 6-Layer Mediation
* **Acceptance Criteria (AC):**
  1. 0 akses basis data langsung antar entitas; seluruh integrasi dimediasi via EIO.
  2. Latensi pemrosesan p95 SHALL ≤500ms.
  3. 10 entitas kanonikal tersedia untuk pemetaan data lintas unit bisnis.

### Req 13: EIO-02 — Distributed Saga & Compensation
* **Acceptance Criteria (AC):**
  1. Transaksi terdistribusi diorkestrasi via Temporal.io (D-07).
  2. Seluruh mutasi dibatalkan secara kompensasi otomatis pada uji injeksi kegagalan (*chaos injection test*).

### Req 14: EIO-03 — Event Backbone
* **Acceptance Criteria (AC):**
  1. Throughput event bus stabil ≥500 req/detik per tenant.
  2. Seluruh event mengikuti format standar CloudEvents 1.0; Dead Letter Queue (DLQ) aktif.

### Req 15: EIO-04 — Control Center & Connector Registry
* **Acceptance Criteria (AC):**
  1. Breaking change kontrak data (OpenAPI/Avro) SHALL terdeteksi otomatis di pipeline CI.
  2. Connector Registry SHALL menampilkan status kesehatan konektor secara real-time.

### Req 16: GOV-01 — Executive Dashboard & Benefit Tracker
* **Acceptance Criteria (AC):**
  1. Dashboard KPI aktif menampilkan visualisasi metrik M-01 s/d M-05.
  2. Menampilkan tren Skor IKA per SBU dan status tiket ARB Clearance aktif.

### Req 17: GOV-02 — AI Model & Risk Register
* **Acceptance Criteria (AC):**
  1. Seluruh model LLM (cloud & on-prem) tercatat beserta status lisensi dan klasifikasi risiko AI.
  2. Model pemroses data sensitif/rahasia wajib berada di infrastruktur on-premises GPU (D-05).

### Req 18: SEC-01 — Security Center & AI Kill-Switch
* **Acceptance Criteria (AC):**
  1. Kill-switch darurat SHALL menghentikan eksekusi agen AI target dalam waktu ≤60 detik.
  2. Seluruh penolakan guardrail tercatat di log audit keamanan.

### Req 19: FIN-01 — FinOps Console
* **Acceptance Criteria (AC):**
  1. Konsumsi token LLM dicatat via Kafka topic `corporate.finops.token_usage`.
  2. Selisih metering internal terhadap invoice bulanan provider AI cloud ≤2%.

### Req 20: OPS-01 — Observability Dashboard
* **Acceptance Criteria (AC):**
  1. SLO per workspace aktif terpantau dengan peringatan otomatis jika terjadi breach.
  2. Trace OpenTelemetry tersedia untuk tiap request lintas layanan.

### Req 21: EAW-05..09 — Governance & Auto-Publisher
* **User Story:** Sebagai Holding EA Office, saya ingin seluruh objek arsitektur divalidasi, ditetapkan, dan diterbitkan menjadi dokumen resmi secara otomatis.
* **Acceptance Criteria (AC):**
  1. Framework Builder SHALL menolak transisi *Divalidasi* jika ada objek tanpa relasi wajib atau tanpa tautan KRA; pesan galat SHALL menyebut objek dan relasi yang kurang (EAW-05).
  2. KRA Manager SHALL menjamin 100% objek entitas tertaut ke referensi; perubahan versi KRA SHALL menandai objek terdampak untuk direviu (EAW-06).
  3. Transisi status SHALL hanya dilakukan peran berwenang dan tercatat append-only di `eaw.workflow`; akses di luar lingkup SHALL ditolak 403 (EAW-07).
  4. Skor IKA SHALL dihitung otomatis dan tersedia per entitas, per domain, serta tren per periode (EAW-08).
  5. Impor data SHALL 100% tervalidasi skema sebelum commit; dokumen arsitektur 6 domain SHALL diterbitkan otomatis ke PDF/Markdown beserta diagram dan matriks relasi (EAW-09, AF-08).

### Req 22: SET/RBAC — Standardized Access Enforcement
* **User Story:** Sebagai SysAdmin, saya ingin seluruh platform holding memakai modul otorisasi seragam tanpa menyimpan data pribadi.
* **Acceptance Criteria (AC):**
  1. Hierarki Holding → Ecosystem → SBU → Cabang SHALL dapat dikelola secara fleksibel (SET-01).
  2. Pengguna HANYA diidentifikasi via `idp_subject` — 0 kolom PII di database `eap` (D-14, SET-02).
  3. 13 role resmi terdefinisi dengan izin granular format `<workspace>.<modul>.<aksi>` (SET-03).
  4. Token JWT wajib menggunakan algoritma asimetris RS256/ES256 dengan masa berlaku ≤1 jam dan klaim `iss`, `aud`, `exp`, `iat`, `sub` (D-13, SET-04).
  5. Setiap mutasi SHALL tercatat append-only, immutable, dan timestamped (SET-05).

---

## 8. Arsitektur Keamanan & Kepatuhan Regulasi

### 8.1 Verifikasi Token Asimetris JWT (D-13) & JWKS
* API Gateway memverifikasi signature JWT menggunakan endpoint JWKS HTTPS Keycloak.
* Klaim wajib: `iss`, `aud`, `exp`, `iat`, `sub`.
* Algoritma simetris `HS256` dan token tanpa signature (`none`) ditolak secara default (HTTP 401).

### 8.2 Proteksi Kolom PII & Automated CI `pii-guard`
* Script pengujian `pii-guard` dijalankan otomatis pada setiap Pull Request.
* Jika PR menambahkan kolom `email`, `full_name`, `nik`, `phone`, atau `address` pada skema database `kalla_eap`, pipeline CI langsung **Gagal (Build Blocked)**.

### 8.3 Zero Trust & mTLS via SPIFFE/SPIRE
* Komunikasi antar service backend wajib menggunakan mTLS.
* Identitas workload diverifikasi menggunakan sertifikat SPIFFE SVID x509 yang diterbitkan oleh SPIRE server.

### 8.4 Audit Trail Immutable & Security Definer
* Tabel `shared.audit_logs` (jejak audit append-only, struktur identik dengan `kalla_cmp.shared`) dan `eaw.workflow` dikontrol oleh trigger berstatus `SECURITY DEFINER`.
* Struktur `shared.*` wajib identik dengan `kalla_cmp.shared` — diverifikasi gate `cross_check_shared.sh` (ADR-CMP-004).
* Tidak ada user atau aplikasi yang memiliki izin `UPDATE` atau `DELETE` pada tabel log audit.

### 8.5 Mesin Kebijakan AI Eksternal (OPA/Rego) & Hard Fencing
* Deteksi indirect prompt injection dievaluasi di container OPA independen.
* Mode pengoperasian: *Fail-closed* (jika OPA tidak merespons, request ke LLM dibatalkan).

---

## 9. Strategi Deployment & DevOps Multi-Repo

### 9.1 GitOps Workflow (D-02)

```
Developer / GSE Commit → Feature Branch → Pull Request ke Repositori Target
                               │
                               ▼
                   [ CI Pipeline Runner ]
                   1. Lint (ESLint, golangci-lint, ruff)
                   2. Build Check
                   3. SCA Security Gate (Grype & ORT)
                   4. SBOM Generation (Syft - SPDX 2.3)
                   5. pii-guard Test (Blokir Kolom PII)
                   6. Konsistensi replika ref.* (cross_check_consumers.sh)
                   7. Unit & Integration Test
                               │
                               ▼
                   Approval & Merge ke Main
                               │
                               ▼
                   ArgoCD GitOps Synchronizer
                   Namespace k8s: corporate-eap
```

### 9.2 Migrasi Basis Data Idempoten
Migrasi dieksekusi secara otomatis oleh pipeline CD:
```bash
cd eap/migrations
psql -v ON_ERROR_STOP=1 -d kalla_eap -f 0001_init_schemas.sql
psql -v ON_ERROR_STOP=1 -d kalla_eap -f 0002_set_schema.sql
psql -v ON_ERROR_STOP=1 -d kalla_eap -f 0003_eaw_schema.sql
psql -v ON_ERROR_STOP=1 -d kalla_eap -f 0004_gse_console_schema.sql
```

### 9.3 Manajemen Rahasia via Vault
* Seluruh rahasia (credential database, private key JWT, API token) disimpan di HashiCorp Vault.
* Di-inject ke pod aplikasi saat startup via *Vault Agent Sidecar Injector*.

---

## 10. Roadmap Teknis & Status Implementasi

### 10.1 Fase 0 — Fondasi (±1–2 Bulan)
* Inisialisasi repositori Git dan pipeline CI/CD.
* Deployment Keycloak Central IdP, Vault, APISIX, dan PostgreSQL HA.
* Pencatatan resmi ADR D-01 s/d D-14 di Git.

### 10.2 Fase 1 — MVP (±3–4 Bulan)
* Peluncuran EAW visual ArchiMate 3.2 (@xyflow/react) dan APM Catalog.
* Peluncuran GSE Scaffolding Engine + REQ Chatbot ter-guardrail.
* Implementasi alur ARB Clearance & Gate AF-06.

### 10.3 Fase 2 — Ekspansi (Bulan 5–6)
* Deployment EIO 6-Layer Mediation Engine & Kafka Event Backbone.
* Implementasi transaksi terdistribusi Distributed Saga via Temporal.io.
* Onboarding Platform Holding Bersama (PANRITA-BASE, PANRITA-SSP, PANRITA-B-LINK).

### 10.4 Fase 3 — Skalabilitas & Enterprise Scale (Bulan 7+)
* Onboarding platform ERP industri vertikal PANRITA-STRIDE SBU.
* Penerapan FinOps Chargeback ke seluruh unit bisnis.
* Pencapaian target Indeks Kematangan Arsitektur (IKA) Level 3 untuk platform umum dan Level 2 untuk ERP vertikal SBU (SAF §8.3).

---

## 11. Matriks Keterhubungan (Traceability Matrix)

| Req Teknis | Ref PRD | Ref Keputusan | Tabel Basis Data | Komponen Layanan |
|---|---|---|---|---|
| **EAW-01..04** | FR-02.1..02.11 | D-01, AF-01 | `eaw.application`, `eaw.process`, `eaw.adr` | EAW Service (NestJS) |
| **EAW-05..09** | FR-02.12..02.15, FR-01.1 | AF-04..AF-08 | `eaw.framework`, `eaw.reference`, `eaw.workflow` | EAW Service (NestJS) |
| **GSE-01..05** | FR-06.1..06.4 | D-02, D-04, AF-06 | `gse.projects`, Repositori Git target | GSE Engine (Nest + Go) |
| **REQ-01..03** | FR-07.1..07.3 | D-03, D-05 | Stateless (FastAPI) | REQ Assistant Service |
| **EIO-01..04** | FR-08.1..08.4 | D-07 | `console.eio_connectors`, Kafka | EIO Broker (Go Fiber) |
| **GOV / SEC / FIN / OPS**| FR-01, FR-05 | D-05, D-06, D-08 | `console.ai_models`, `console.token_metering` | Console Governance Service |
| **SET / RBAC** | FR-09.1..09.5 | D-11, D-12, D-13, D-14 | `set.users`, `set.roles`, `set.permissions` | Standard SET Module |
| **ARB Clearance** | FR-03.1..03.4 | AF-06 | `eaw.arb_clearances`, `eaw.workflow` | EAW ARB Controller |

---

## 12. Glosarium & Referensi Teknis

| Istilah | Definisi Teknis & Konseptual |
|---|---|
| **SAORAJA** | Enterprise Architecture Platform (EAP) — Meta-platform komando arsitektur, standar data, dan generator software korporat. |
| **SEDDI** | Corporate Master Platform (CMP) — Hub data induk terpusat penyedia Golden Record aktual. |
| **PANRITA** | Lini platform operasional cerdas tergenerasi yang mengimplementasikan Unified App Shell. |
| **SAF** | SAORAJA Architecture Framework — Kerangka kerja arsitektur enterprise korporat 6 domain terpadu. |
| **EAW** | Enterprise Architecture Workbench — Workspace pemodelan visual ArchiMate 3.2 dan tata kelola arsitektur. |
| **GSE** | Generative Software Engineering Engine — Mesin generator kode yang men-generate PR ke Git dalam ≤45 detik. |
| **EIO** | Enterprise Integration Orchestrator — Layer mediasi integrasi terpusat 6-layer dengan model kanonikal dan Saga. |
| **Module Federation 2.0**| Standar micro-frontend dinamis runtime untuk memuat SPA remote ke host shell tanpa reload browser. |
| **idp_subject** | Identitas buram subjek (klaim `sub` JWT Keycloak); satu-satunya pengenal pengguna di DB `eap` (D-14). |
| **ref.*** | Skema replika read-only pada platform konsumen yang menerima aliran data dari publikasi CDC SEDDI. |
| **IKA** | Indeks Kematangan Arsitektur SAORAJA — Metrik kuantitatif tingkat kelengkapan arsitektur (Level 1–5). |
| **ARB Clearance** | Sertifikat izin kelayakan arsitektur resmi sebelum inisiatif software baru diizinkan dibangun (AF-06). |
| **pii-guard** | Skrip pengujian otomatis pada pipeline CI yang memblokir penambahan kolom data pribadi di DB selain SEDDI. |
| **NeMo Guardrails** | Framework guardrail pembatasan domain topik AI berbasis vektor embedding (tanpa panggil LLM). |
| **OPA / Rego** | Open Policy Agent — Mesin evaluasi aturan keamanan eksternal deklaratif untuk proteksi anti-jailbreak. |

---

> **Dokumen Terkait:**
> * Dokumen Kebutuhan Bisnis EAP: **[PRD.md](./PRD.md)**
> * Kerangka Kerja Arsitektur: **[SAF.md](./SAF.md)**
> * Peta Arsitektur Ekosistem: **[Project.md](../Project.md)**
> * Spesifikasi Teknis Basis Data SEDDI: **[cmp/SRS.md](../cmp/SRS.md)**
