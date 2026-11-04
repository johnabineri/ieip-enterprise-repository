# EAP API (NestJS)

API SAORAJA EAP: katalog aplikasi (Zero Pre-Seed), struktur entitas (view atas replika CMP), referensi KRA, ADR, alur AF-05
(Draf → Divalidasi → Ditetapkan → Dipublikasi → Direviu), ARB clearance, administrasi otorisasi (`set`) dan audit.

## Menjalankan
```bash
cd eap/api && npm install
cp .env.example .env        # lalu atur DATABASE_URL / OIDC_*
npm run build && npm run start
npm test                    # e2e; DROP/CREATE kalla_eap_api_test (nama wajib berakhiran _test)
```
Uji membutuhkan `psql` di PATH dan login Postgres yang dapat CREATE DATABASE dan `SET ROLE eap_app` (superuser lokal cukup).

## Prinsip
- Semua akses data lewat `DbService.tx()`: transaksi, `SET LOCAL ROLE eap_app`, GUC `app.user_id`, `app.eap_perms`, `app.eap_view_*`, `app.eap_edit_*`. RLS dan trigger di DB tetap sumber kebenaran; API menambah guard izin (`@RequirePermission`).
- Identitas: JWT terverifikasi (RS256/ES256 via JWKS; HS256 hanya dev/uji) → klaim `preferred_username` ditautkan ke `ref.users` (replika CMP) lewat `set.provision_user`. Pengguna baru **tanpa peran** — admin menugaskan lewat `POST /api/v1/set/user-roles`.
- Tidak ada PII di DB EAP (D-14): nama tampilan dibaca dari `ref.users`.
- Kesalahan RFC 9457 (`application/problem+json`), ETag = `row_version` + `If-Match`, kursor keyset, `Cache-Control: no-store`.
- Perubahan status hanya lewat `eaw.transition()`; riwayat append-only di `eaw.workflow`.
