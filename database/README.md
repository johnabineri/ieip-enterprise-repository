# Database EAP (`kalla_eap`)

Terapkan berurutan (`ON_ERROR_STOP=1`): `000_init` → `010_shared` → `020_ref_cmp` → `026_ref_mirror` → `100_set` → `200_eaw` → `210_eaw_functions` → `290_rls_grants` → `295_publication` → seed `9xx` (idempoten), lalu `../migrations/*.sql`.
Uji: `PGHOST=localhost PGUSER=postgres bash ../tests/run_all.sh` (DROP/CREATE `kalla_eap_test`).

## Penyimpangan terhadap SRS (disengaja)
- **PK bernama `id`** — kontrak `shared.apply_standard()`.
- **`set.users.cmp_user_id`** — CMP tidak mempublikasikan `idp_subject`; identitas ditautkan lewat `preferred_username` → `ref.users`. Tidak ada PII di DB EAP (D-14, dijaga `scripts/pii_guard.sh`).
- **`entity_id` → `ref.business_groups(id)`** pada semua tabel `eaw` (ADR-CMP-003); `eaw.entity_org` adalah view.
- **Replika lewat tabel cermin.** Replikasi logis native mensyaratkan nama skema.tabel identik, sedangkan EAP menyimpan replika di `ref.*`. Maka `026_ref_mirror.sql` membuat `mdm.*`/`iam.users` (tabel cermin) dengan trigger `ENABLE ALWAYS` yang meng-upsert ke `ref.*`. Arah sebaliknya: CMP memiliki cermin `eaw.application_registry` → `ref.applications`.
- **`shared.*` identik dengan CMP**; fungsi izin EAP ada di `set.has_perm()` (GUC `app.eap_perms`), bukan di `shared`.
- **Status hanya lewat `eaw.transition()`** (SECURITY DEFINER); objek non-Draf tidak dapat disunting; riwayat `eaw.workflow` append-only.
- Validasi relasi wajib (EAW-05) baru berupa peringatan sampai API relasi ada; `ai_risk_score` ARB dan tautan ADR→commit Git belum otomatis.
- Zero Pre-Seed: tidak ada seed aplikasi; seed hanya peran/izin (`900_seed_set.sql`, dibangkitkan `scripts/gen_seed_set.py`).
- **Platform vs workspace** (`platform_app.md`): `jenis_node`, profil platform (`ui_standard`, `tech_stack`), `arb_clearance_id`, `adopsi`; izin baru `eaw.platform.write` dan `eaw.workspace.assign` (hanya Application Architect). Aturan di trigger `eaw.tg_application_platform` dan `eaw.transition` (lihat tes `07_platform_workspace.test.sql`).
