#!/usr/bin/env python3
"""Membangkitkan eap/database/900_seed_set.sql (13 role resmi PRD 13.1, katalog izin, pemetaan peran -> izin).
Sumber kebenaran peran/izin ADA DI SINI; ubah lalu jalankan ulang:  python scripts/gen_seed_set.py
"""
import os

ROLES = [  # kode, nama, tier, can_view_all, edit_scope, deskripsi
    ("ROLE_EAP_ARB_CHAIR", "Chief Enterprise Architect / Ketua ARB", "T1_GOVERNANCE", True, "holding", "Pemegang keputusan tertinggi persetujuan arsitektur grup & sertifikat clearance."),
    ("ROLE_EAP_STEERING_COMMITTEE", "Dewan Pengarah TI (BOD / Direksi)", "T1_GOVERNANCE", False, "none", "Pengawasan strategis, alokasi anggaran investasi TI, evaluasi manfaat bisnis."),
    ("ROLE_EAP_BUSINESS_ARCHITECT", "Enterprise Business Architect", "T2_DOMAIN", True, "holding", "Domain 1 (Proses Bisnis) & Domain 3 (Layanan Enterprise)."),
    ("ROLE_EAP_DATA_ARCHITECT", "Enterprise Data Architect", "T2_DOMAIN", True, "holding", "Domain 2: kamus data, lineage, koordinasi dengan SEDDI."),
    ("ROLE_EAP_APP_ARCHITECT", "Enterprise Application Architect", "T2_DOMAIN", True, "holding", "Domain 4: katalog APM, mode workspace, standar API."),
    ("ROLE_EAP_INFRA_ARCHITECT", "Enterprise Infrastructure Architect", "T2_DOMAIN", True, "holding", "Domain 5: topologi hybrid cloud, DC, jaringan."),
    ("ROLE_EAP_SECURITY_ARCHITECT", "Enterprise Security Architect", "T2_DOMAIN", True, "holding", "Domain 6: kebijakan keamanan, kepatuhan UU PDP, guardrail AI."),
    ("ROLE_EAP_SBU_ARCHITECT", "SBU Lead Solution Architect", "T3_EXECUTION", False, "entity", "Arsitek anak perusahaan: mengajukan usulan aplikasi dan memodelkan arsitektur lokal."),
    ("ROLE_EAP_BPO", "Business Process Owner (SBU)", "T3_EXECUTION", False, "entity", "Penanggung jawab proses operasional SBU; memvalidasi kesesuaian sistem."),
    ("ROLE_EAP_GSE_DEVELOPER", "Lead Software Engineer", "T3_EXECUTION", False, "none", "Mengoperasikan GSE Engine, REQ Chatbot, menerima scaffold PR."),
    ("ROLE_EAP_AUDITOR", "GRC & Internal Audit Officer", "T4_ASSURANCE", True, "none", "Pengawas kepatuhan arsitektur, verifikasi audit trail (read-only termasuk Draf)."),
    ("ROLE_EAP_SYSADMIN", "EAP System Administrator", "T4_ASSURANCE", False, "none", "Administrator platform, pengelola skema set, konfigurasi konektor."),
    ("ROLE_EAP_MIND_AGENT", "MIND AI Autonomous Agent", "T4_ASSURANCE", False, "none", "Identitas sistem agen AI untuk scanning dan pre-screening ARB."),
]
PERMS = [  # workspace, modul, aksi, deskripsi
    ("eaw", "catalog", "read", "Membaca katalog portofolio aplikasi (Domain 4)"),
    ("eaw", "catalog", "write", "Menyusun/mengubah aplikasi (status Draf)"),
    ("eaw", "model", "read", "Membaca objek Domain 1/2/3/5/6"),
    ("eaw", "model", "write", "Menyusun objek Domain 1/2/3/5/6"),
    ("eaw", "reference", "read", "Membaca KRA"),
    ("eaw", "reference", "write", "Menyusun KRA (Holding EA Office)"),
    ("eaw", "adr", "read", "Membaca ADR"),
    ("eaw", "adr", "write", "Menyusun ADR"),
    ("eaw", "org", "read", "Membaca struktur organisasi + atribut arsitektur"),
    ("eaw", "org", "write", "Mengubah atribut arsitektur entitas (Holding EA Office)"),
    ("eaw", "validation", "approve", "Transisi Divalidasi (Holding EA Office)"),
    ("eaw", "baseline", "approve", "Transisi Ditetapkan + status ADR (ARB)"),
    ("eaw", "publication", "approve", "Transisi Dipublikasi (Holding EA Office)"),
    ("eaw", "review", "run", "Reviu berkala AF-07 (Direviu)"),
    ("eaw", "workflow", "read", "Membaca riwayat alur tata kelola"),
    ("gov", "arb", "read", "Membaca tiket ARB"),
    ("gov", "arb", "write", "Mengajukan/meninjau tiket ARB"),
    ("eaw", "platform", "write", "Membentuk/mengubah platform (profil UI/UX & tech stack) - Enterprise Application Architect"),
    ("eaw", "workspace", "assign", "Menempatkan/memindahkan workspace ke platform; menandai adopsi"),
    ("req", "session", "write", "Menjalankan sesi elisitasi kebutuhan (REQ): percakapan ter-guardrail menjadi User Story + Gherkin"),
    ("eaw", "document", "approve", "Menerbitkan dokumen arsitektur resmi (AF-08) — Holding EA Office"),
    ("console", "dashboard", "read", "Membaca dashboard IKA, FinOps ringkas, observability, dan registri CONSOLE"),
    ("console", "dashboard", "write", "Mengambil snapshot IKA (hanya peran lihat-semua)"),
    ("console", "ai", "admin", "Mengelola register model AI & dataset RAG, faktur penyedia (GOV-02, FIN-01)"),
    ("console", "finops", "read", "Membaca laporan FinOps (metering token, showback, rekonsiliasi)"),
    ("console", "eio", "write", "Mengelola konektor EIO dan menjalankan health/breaking-change check"),
    ("console", "security", "admin", "Mengoperasikan AI kill-switch dan melihat log guardrail (SEC-01)"),
    ("gse", "project", "read", "Melihat proyek scaffolding, template, dan flow GSE"),
    ("gse", "project", "run", "Menjalankan scaffolding (gerbang AF-06), mengelola template dan flow GSE"),
    ("gov", "arb", "approve", "Memutus tiket ARB (APPROVED/REJECTED)"),
    ("set", "account", "read", "Membaca akun & penugasan peran"),
    ("set", "account", "admin", "Mengelola peran, izin, penugasan (SysAdmin)"),
    ("set", "audit", "read", "Membaca log audit"),
]
DOMAIN_ARCH = ["eaw.catalog.read", "eaw.model.read", "eaw.model.write", "eaw.reference.read", "eaw.reference.write", "eaw.adr.read", "eaw.adr.write",
               "eaw.org.read", "eaw.validation.approve", "eaw.publication.approve", "eaw.review.run", "eaw.workflow.read", "gov.arb.read", "gov.arb.write"]
MAP = {
    "ROLE_EAP_ARB_CHAIR": ["eaw.catalog.read", "eaw.catalog.write", "eaw.model.read", "eaw.model.write", "eaw.reference.read", "eaw.reference.write", "eaw.adr.read", "eaw.adr.write",
                           "eaw.org.read", "eaw.org.write", "eaw.validation.approve", "eaw.baseline.approve", "eaw.publication.approve", "eaw.review.run", "eaw.workflow.read",
                           "gov.arb.read", "gov.arb.write", "gov.arb.approve"],
    "ROLE_EAP_STEERING_COMMITTEE": ["eaw.catalog.read", "eaw.model.read", "eaw.reference.read", "eaw.adr.read", "eaw.org.read", "eaw.workflow.read", "gov.arb.read"],
    "ROLE_EAP_APP_ARCHITECT": DOMAIN_ARCH + ["eaw.catalog.write", "eaw.platform.write", "eaw.workspace.assign"],
    "ROLE_EAP_SBU_ARCHITECT": ["eaw.catalog.read", "eaw.catalog.write", "eaw.model.read", "eaw.model.write", "eaw.reference.read", "eaw.adr.read", "eaw.org.read", "eaw.workflow.read",
                               "gov.arb.read", "gov.arb.write"],
    "ROLE_EAP_BPO": ["eaw.catalog.read", "eaw.model.read", "eaw.model.write", "eaw.reference.read", "eaw.adr.read", "eaw.org.read", "eaw.workflow.read"],
    "ROLE_EAP_GSE_DEVELOPER": ["eaw.catalog.read", "eaw.reference.read", "eaw.adr.read", "eaw.org.read", "gse.project.read", "gse.project.run"],
    "ROLE_EAP_AUDITOR": ["eaw.catalog.read", "eaw.model.read", "eaw.reference.read", "eaw.adr.read", "eaw.org.read", "eaw.workflow.read", "gov.arb.read", "set.account.read", "set.audit.read"],
    "ROLE_EAP_SYSADMIN": ["eaw.org.read", "set.account.read", "set.account.admin", "set.audit.read"],
    "ROLE_EAP_MIND_AGENT": ["eaw.catalog.read", "eaw.reference.read", "eaw.adr.read", "eaw.org.read", "gov.arb.read"],
}
for r in ("ROLE_EAP_BUSINESS_ARCHITECT", "ROLE_EAP_DATA_ARCHITECT", "ROLE_EAP_INFRA_ARCHITECT", "ROLE_EAP_SECURITY_ARCHITECT"):
    MAP[r] = list(DOMAIN_ARCH)

# GSE: semua peran arsitek/tata kelola/pengawas boleh MELIHAT; hanya GSE Developer menjalankan (gse.project.run)
for r in ("ROLE_EAP_ARB_CHAIR", "ROLE_EAP_STEERING_COMMITTEE", "ROLE_EAP_BUSINESS_ARCHITECT", "ROLE_EAP_DATA_ARCHITECT", "ROLE_EAP_APP_ARCHITECT", "ROLE_EAP_INFRA_ARCHITECT",
          "ROLE_EAP_SECURITY_ARCHITECT", "ROLE_EAP_SBU_ARCHITECT", "ROLE_EAP_AUDITOR", "ROLE_EAP_SYSADMIN", "ROLE_EAP_MIND_AGENT"):
    if "gse.project.read" not in MAP[r]:
        MAP[r].append("gse.project.read")

# REQ: arsitek, SBU, BPO, dan GSE Developer menjalankan sesi elisitasi (data sesi milik pengguna sendiri; audit lewat set.audit.read)
for r in ("ROLE_EAP_ARB_CHAIR", "ROLE_EAP_BUSINESS_ARCHITECT", "ROLE_EAP_DATA_ARCHITECT", "ROLE_EAP_APP_ARCHITECT", "ROLE_EAP_INFRA_ARCHITECT", "ROLE_EAP_SECURITY_ARCHITECT",
          "ROLE_EAP_SBU_ARCHITECT", "ROLE_EAP_BPO", "ROLE_EAP_GSE_DEVELOPER"):
    if "req.session.write" not in MAP[r]:
        MAP[r].append("req.session.write")

# CONSOLE
for r in ("ROLE_EAP_ARB_CHAIR", "ROLE_EAP_STEERING_COMMITTEE", "ROLE_EAP_BUSINESS_ARCHITECT", "ROLE_EAP_DATA_ARCHITECT", "ROLE_EAP_APP_ARCHITECT", "ROLE_EAP_INFRA_ARCHITECT",
          "ROLE_EAP_SECURITY_ARCHITECT", "ROLE_EAP_SBU_ARCHITECT", "ROLE_EAP_BPO", "ROLE_EAP_AUDITOR", "ROLE_EAP_SYSADMIN"):
    MAP[r].append("console.dashboard.read")
MAP["ROLE_EAP_ARB_CHAIR"].append("console.dashboard.write"); MAP["ROLE_EAP_SYSADMIN"].append("console.dashboard.write")
for r in ("ROLE_EAP_SECURITY_ARCHITECT", "ROLE_EAP_SYSADMIN"):
    MAP[r] += ["console.ai.admin", "console.security.admin"]
for r in ("ROLE_EAP_STEERING_COMMITTEE", "ROLE_EAP_AUDITOR", "ROLE_EAP_ARB_CHAIR", "ROLE_EAP_SECURITY_ARCHITECT", "ROLE_EAP_SYSADMIN"):
    MAP[r].append("console.finops.read")
for r in ("ROLE_EAP_INFRA_ARCHITECT", "ROLE_EAP_APP_ARCHITECT", "ROLE_EAP_SYSADMIN"):
    MAP[r].append("console.eio.write")

# Penerbitan dokumen arsitektur resmi: Ketua ARB dan Application Architect (EA Office)
for r in ("ROLE_EAP_ARB_CHAIR", "ROLE_EAP_APP_ARCHITECT"):
    MAP[r].append("eaw.document.approve")

codes = {f"{w}.{m}.{a}" for w, m, a, _ in PERMS}
assert all(p in codes for ps in MAP.values() for p in ps), "pemetaan memuat izin yang tidak ada di katalog"
assert {r[0] for r in ROLES} == set(MAP), "setiap peran harus punya pemetaan"

q = lambda s: "'" + s.replace("'", "''") + "'"
out = ["""-- =====================================================================
-- 900_seed_set.sql : 13 role resmi (PRD 13.1), katalog izin, pemetaan peran -> izin. IDEMPOTEN.
-- DIBANGKITKAN oleh scripts/gen_seed_set.py — ubah di sana, jangan di sini.
-- ZERO PRE-SEED: tidak ada platform/aplikasi/objek arsitektur — hanya konfigurasi otorisasi (SAF 8).
-- Dijalankan sebagai pemilik DB/superuser (trigger admin-only set.* mengizinkan eap_owner dan superuser).
-- =====================================================================
INSERT INTO set.roles (role_code, role_name, tier, can_view_all, edit_scope, description) VALUES"""]
out.append(",\n".join(f" ({q(c)}, {q(n)}, {q(t)}, {str(v).upper()}, {q(e)}, {q(d)})" for c, n, t, v, e, d in ROLES))
out.append("ON CONFLICT (role_code) WHERE deleted_at IS NULL DO NOTHING;\n")
out.append("INSERT INTO set.permissions (permission_code, workspace, module, action, description) VALUES")
out.append(",\n".join(f" ({q(w + '.' + m + '.' + a)}, {q(w)}, {q(m)}, {q(a)}, {q(d)})" for w, m, a, d in PERMS))
out.append("ON CONFLICT (permission_code) WHERE deleted_at IS NULL DO NOTHING;\n")
out.append("INSERT INTO set.role_permissions (role_id, permission_id)\nSELECT r.id, p.id FROM (VALUES")
out.append(",\n".join(f" ({q(role)}, {q(p)})" for role, ps in MAP.items() for p in ps))
out.append(") AS m(role_code, permission_code)\n  JOIN set.roles r ON r.role_code = m.role_code AND r.deleted_at IS NULL\n"
           "  JOIN set.permissions p ON p.permission_code = m.permission_code AND p.deleted_at IS NULL\n"
           "ON CONFLICT (role_id, permission_id) WHERE deleted_at IS NULL DO NOTHING;\n")
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "database", "900_seed_set.sql")
open(path, "w", encoding="utf8", newline="\n").write("\n".join(out))
print("ok:", len(ROLES), "peran,", len(PERMS), "izin,", sum(len(v) for v in MAP.values()), "pemetaan")
