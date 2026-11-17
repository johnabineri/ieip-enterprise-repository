# SAORAJA EAP — Web (Next.js)

SPA EAP: **Next.js (App Router) + TypeScript** mode SPA (ekspor statis), **AG Grid Community**, **TanStack Query + Zustand**, tampilan **pixel-accurate terhadap mockup** (`web/design/styles.css`; mockup HTML diarsipkan di `docs/archive/eap-ui-mockup`, tag git `eap-ui-mockup-final`) (UI Rule 2026-11-16). Tersambung ke **EAP API** (`/api/v1`, dirutekan gateway per workspace). Menggantikan UI lama `eap/ui` (vanilla JS), yang sudah diarsipkan.

## Menjalankan

Di stack Compose, layanan `eap-ui` menyajikan hasil build ini (`infra/docker/next-ui.Dockerfile`, `APP_DIR=eap/web`) di `http://keis.localhost:8088/`; perbarui dengan `bash infra/scripts/stack.sh balla_kalla up -d --build --no-deps eap-ui`. Login OIDC memakai klien `eap-spa` yang sudah terdaftar untuk host gateway itu.

```bash
cd eap/web && npm install
npm run dev                          # http://localhost:8778
npm run typecheck && npm run i18n:check && npm run build   # out/ + flatten-rsc
npm run serve                        # sajikan out/ di :8778
npm run styles                       # bangkitkan ulang src/styles/eap.css dari web/design/styles.css
```

Parameter URL (disimpan di sessionStorage; HANYA berlaku di host pengembangan `localhost`, `127.0.0.1`, `[::1]`, `*.localhost` — di host lain dibuang): `?api=<url EAP API>` (kosong = same-origin lewat gateway) dan `?oidc=<issuer Keycloak>`, mis. `http://localhost:8778/?oidc=http://localhost:8180/realms/keis`. **OIDC wajib** — EAP API tidak punya login pengembangan (beda dengan CMP). Klien Keycloak `eap-spa`: daftarkan `http://localhost:8778/*` sebagai redirect URI untuk pengembangan lokal (di stack Compose, gateway `keis.localhost:8088` sudah terdaftar); API harus mengizinkan `CORS_ORIGINS=http://localhost:8778`. Akun baru **tanpa peran** sampai admin menugaskannya (Beranda menjelaskannya).

## Tampilan = mockup (UI Rule)

- `src/styles/eap.css` **DITURUNKAN OTOMATIS** dari `web/design/styles.css` oleh `scripts/scope-css.mjs` (pola sama dengan `platform/base/web`): seluruh aturan dibungkus `.eap-root { … }` dengan CSS nesting, token tema (terang/gelap/sistem) di elemen itu. **Jangan disunting tangan** — ubah `web/design/styles.css` lalu `npm run styles`.
- Tidak ada reset global dan **tidak ada Tailwind/shadcn** (preflight Tailwind adalah reset global yang akan merusak Host). Markup & nama kelas = mockup (`.shell/.hdr/.nav/.page/.card/.kpi/.onb/.hbar/.tbl/.badge/.tag/.drawer/.modal/.pop/.cmdk/.toast`). Hanya `src/styles/standalone.css` (margin `html/body`) menyentuh elemen di luar `.eap-root`, dan hanya diimpor entri mandiri (`layout.tsx`); bila EAP dimuat sebagai remote di bawah Host, berkas itu tidak diimpor.
- `src/styles/app.css` = tambahan khusus aplikasi (skeleton, kulit AG Grid yang menyamai `table.tbl`, layar masuk), juga di bawah `.eap-root`.
- Terang/gelap dan lipat menu dipasang di `.eap-root` (`data-theme`, `nav-collapsed`), bukan di `<html>/<body>`. Font = Plus Jakarta Sans + JetBrains Mono (tag `<link>` sama dengan mockup).
- Terukur identik dengan mockup di 1360 px: header 56 px, menu 248 px, tab workspace 107×55, tautan menu 34 px, H1 22/28 px, warna/font sama; `<body>` tidak terpengaruh (latar transparan, font bawaan).
- **Penyimpangan dari mockup (disengaja):** lonceng notifikasi dan MIND Copilot ADA tetapi memakai backend nyata (bukan data contoh mockup); topologi, redundansi/drift, dan KPI di dashboard memakai data nyata; tab "Mode Workspace"/"API Registry" di D4 tidak ada (tanpa data nyata); tombol ↻ dan ⇩ CSV tambahan (ghost) di toolbar daftar; kolom "Aplikasi" di Layanan butuh relasi (belum); selector entitas di header memakai `?entityId=` pada daftar yang mendukungnya (aplikasi, objek domain, ARB).

## Cakupan saat ini

| Workspace | Tersedia di eap/web |
|---|---|
| EAW | Dashboard; **Framework Builder (`eaw-framework.tsx`) + Penerbit & Impor (`eaw-publisher.tsx`)**; **Roadmap (`eaw-roadmap.tsx`): KPI, Gantt, fase/butir buat-ubah-hapus + pelacak milestone**; **Lineage & Impact (`eaw-lineage.tsx`): graf + analisis dampak/dependensi, filter entitas & kedalaman**; **Kanvas ArchiMate (`eaw-canvas.tsx`): seret/hubungkan/ikat ke objek EAW, impor dari model, sinkron relasi, ekspor SVG & Exchange XML — SVG sendiri bergaya mockup, tanpa pustaka diagram**; **D1–D6 + aplikasi: daftar, buat/ubah/hapus Draf (+ pemilih KRA sedomain), relasi, transisi AF-05**; **KRA: buat/ubah/hapus Draf + pratinjau dampak AF-07 + transisi; ADR: buat/ubah (Proposed) + keputusan Accepted/Deprecated/Superseded; ARB: pra-screening, ajukan, ubah, tinjau/revisi/setujui/tolak (empat mata)** (tiga terakhir BARU 2026-11-16, belum diuji dengan data nyata); Penerbit (daftar) |
| SET | **Struktur organisasi (+ atribut KAF/IKA/KRA), Akun (beri/cabut peran, aktif/nonaktif, sinkron RBAC), Roles & Permissions, API Client & Secrets, Audit Trail** |
| GSE | **Proyek (wizard scaffold AF-06, drawer, bundel, push/CI), Template (buat/ubah/hapus), Flow Builder + eksekusi saga, Web IDE (Monaco + gabung 3-arah + commit)**; Status PR & pipeline (gerbang + CI Git) |
| REQ | **Sesi Elisitasi (obrolan ter-guardrail), User Story & Gherkin, Ekspor Markdown + kirim ke GSE** |
| CONSOLE | **IKA, AI register (admin), FinOps (+faktur), Observability, Security Center (kill-switch), EIO Control Center (konektor, model kanonikal, rute, uji mediasi, jejak)** |

Seluruh 34 menu sudah punya halaman di eap/web; menu yang kelak belum ada di peta menampilkan halaman pengganti, bukan data contoh. Tombol tulis tanpa izin tampil terkunci 🔒 (seperti `lockBtn` mockup) dan menolak dengan toast 403. Aturan sebenarnya di server/DB: izin, cakupan entitas (RLS + `eaw.can_edit`), hanya Draf, `If-Match` (412/428), constraint DB (422) — galat server tampil di modal tanpa menutupnya.

## Struktur

| Berkas | Isi |
|---|---|
| `public/config.js` | `window.EAP_CONFIG` (nama tetap; ditimpa saat runtime oleh `infra/docker/nginx/40-runtime-config.sh`). |
| `src/modules/registry.ts` | 5 workspace → 34 menu (kode, mode, port, nomor layar = mockup) + izin (`show`). |
| `src/modules/{home,eaw,set}.tsx`, `eaw-forms.tsx` | Halaman; `export default { <menuId>: Komponen }`; formulir tulis EAW. |
| `src/components/ui.tsx`, `overlay.tsx` | Primitif bermarkup mockup (Btn, Badge, Card, Kpi, Hbar, DL, MiniTable…), Drawer/Modal/formDialog/toast. |
| `src/components/app-shell.tsx`, `auth-gate.tsx` | Header + tab workspace + menu + palet perintah (Ctrl K) + popover pengguna; gerbang sesi/OIDC. |
| `src/components/grid/` | `GridPage` (page-hd + kartu toolbar + AG Grid), `DataGrid` (tema = `.tbl`), `col.*`. Klik baris = Detail. |
| `src/lib/api.ts` | Klien REST: problem+json, ETag/If-Match, kursor (`next_cursor` **dan** `nextCursor`). |
| `src/lib/i18n-en.ts` | Kamus EN (bawaan English; `npm run i18n:check` gagal bila ada teks tanpa terjemahan; `--prune` membuang entri tak terpakai). |

## Layout & ikon menu

Header 48px penuh lebar: sel brand selebar panel menu (248px / 60px dilipat) + tombol ◧ + tab workspace + pencarian, entitas, EN/ID, avatar. Menu = ikon (`src/components/menu-icons.tsx`, lucide-react) + label; nomor layar mockup tetap di `registry.ts` tetapi tidak ditampilkan. Penyimpangan dari mockup hanya di `src/styles/app.css` (`.eap-root`). Spesifikasi: `../CLAUDE.md`.

## Uji otomatis (Playwright)

`e2e/` (`@playwright/test` 1.58): 13 uji BACA-SAJA + 9 uji TULIS (opt-in `E2E_WRITE=1`) terhadap stack Compose yang sudah hidup (tidak menjalankan server sendiri).

```bash
cd eap/web && npm install
E2E_USERNAME=<akun uji> E2E_PASSWORD=<sandi> npm run test:e2e        # laporan: npm run test:e2e:report
```
Env: `E2E_USERNAME`/`E2E_PASSWORD` (tanpa itu uji ber-login dilewati), `E2E_BASE_URL` (bawaan `http://keis.localhost:8088`), `E2E_TOKEN_URL` (bawaan Keycloak dev `:8180`), `E2E_CLIENT_ID` (bawaan `cmp-dev-cli`, klien dev), `E2E_CHANNEL` (bawaan `chrome`; `msedge` bila tidak ada Chrome — memakai peramban sistem, tanpa unduh Chromium).

| Berkas | Mencakup |
|---|---|
| `auth.spec.ts` | tanpa token/token rusak → tidak ada menu; dengan token → kerangka + `/me` |
| `layout.spec.ts` | header 48px, brand 248/60px, ◧ melipat (tersimpan), ikon + label tanpa `span.num`, laci seluler 600px, kontrol header |
| `navigation.spec.ts` | SETIAP menu yang terlihat oleh akun terbuka tanpa galat JS/5xx dan bukan halaman pengganti |
| `shell.spec.ts` | palet Ctrl+K (tanpa nomor layar), tema gelap, gaya tidak bocor ke Host, tombol EN/ID |

Login uji = password grant ke Keycloak lalu token disuntik ke `sessionStorage` (alur PKCE tidak diotomatiskan). Cakupan menu mengikuti peran akun uji: akun tanpa peran hanya menjalankan 9 uji (4 dilewati); akun `ROLE_EAP_AUDITOR` menjalankan 13 uji dan 31 halaman. Uji TULIS (buat/ubah/hapus, transisi, kanvas, IDE) belum diotomatiskan — masih lewat verifikasi manual yang dicatat di `eap/CLAUDE.md`.

**Uji TULIS** (`write-eaw.spec.ts`, `write-gse-console.spec.ts`; `E2E_WRITE=1`): 9 alur CRUD yang membuktikan aturan SERVER/DB lewat UI — Layanan (buat→ubah If-Match→hapus), KRA, Framework Builder (validasi ditolak: kekurangan relasi 6 domain), Roadmap (butir di luar rentang fase ditolak; Terhambat butuh alasan ≥5), Kanvas (simpan persisten di server), GSE Template (JSON salah ditolak), GSE Flow (saga tanpa kompensasi tidak valid → valid → commit), AI register (D-05 + hapus model yang dipakai → 409), EIO (konektor + model kanonikal draft). Mengikuti PERAN akun: izin kurang → dilewati (`needPerms`). Akun uji lengkap = `ROLE_EAP_ARB_CHAIR` + `ROLE_EAP_APP_ARCHITECT` + `ROLE_EAP_GSE_DEVELOPER` + `ROLE_EAP_SYSADMIN`. Data uji bernama `E2E-<run>…` dan DIBERSIHKAN lewat API (hapus lunak) di akhir tiap uji, juga saat gagal (fixture `cleanup`); yang tersisa hanya `shared.audit_logs`. Sengaja TIDAK diotomatiskan karena meninggalkan jejak permanen: scaffold proyek, run saga, revisi Web IDE, pertukaran EIO, faktur, dokumen terbit, impor commit, sesi/tiket REQ/ARB/ADR. Panggilan API uji dari dalam halaman (Node tidak me-resolve `*.localhost`).

## CI

- `eap/.github/workflows/ci.yml` → job `web`: `npm ci` → `typecheck` (src + `e2e/`) → `i18n:check` → `build` (ekspor statis) pada setiap push/PR.
- `infra/.github/workflows/images.yml` → job `smoke` (hanya push ke main/tag/dispatch, bukan PR): setelah smoke stack penuh, langkah **Uji web (Playwright)** menjalankan `bash infra/scripts/web-e2e.sh` dengan `E2E_WRITE=1` (13 baca-saja + 9 tulis) memakai Chrome bawaan runner; laporan + jejak diunggah sebagai artefak `playwright-eap-web`. Stack CI sekali pakai → skrip menugaskan keempat peran uji ke akun realm demo `andi.pratama` lewat SQL (`E2E_ASSIGN_ROLES=1`, hanya bila `E2E_EPHEMERAL=1`; di stack dev ditolak, exit 2). Lokal: `E2E_USERNAME=… E2E_PASSWORD=… bash infra/scripts/web-e2e.sh [args playwright]`.
- Catatan jujur: workflow BELUM pernah dijalankan di runner GitHub; skrip + SQL penugasan diverifikasi lokal (guard, mode tanpa peran 9 lulus, SQL dalam transaksi yang dibatalkan, shellcheck bersih).

## Belum dibangun

uji otomatis, dan verifikasi di kind (manifest K8s sudah disesuaikan, belum dijalankan). Diverifikasi di peramban (Playwright) dengan data nyata lewat gateway: semua halaman 200, buat→ubah (If-Match)→hapus layanan Draf; siklus penuh Draf→Divalidasi→Ditetapkan→Dipublikasi→Direviu→Draf lewat UI dengan dua akun (penyusun APP_ARCHITECT + penetap ARB_CHAIR, keduanya ber-lingkup satu entitas); empat mata ditolak server (403).
