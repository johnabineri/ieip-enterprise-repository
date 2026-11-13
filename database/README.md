# Database EAP (`kalla_eap`)

Terapkan semua `0xx`–`8xx` urut nomor nama berkas (`000_init` … `302_ref_parties_merged_into`), lalu seed `9xx` (idempoten — runner menjalankannya dua kali), lalu `../migrations/*.sql`; tiap berkas dengan `ON_ERROR_STOP=1`. Berkas `286`+ juga ditulis agar dapat diterapkan ke DB yang sudah berjalan.
Uji: `PGHOST=localhost PGUSER=postgres bash ../tests/run_all.sh` (DROP/CREATE `kalla_eap_test`).

## Penyimpangan terhadap SRS (disengaja)
- **PK bernama `id`** — kontrak `shared.apply_standard()`.
- **`set.users.cmp_user_id`** — CMP tidak mempublikasikan `idp_subject`; identitas ditautkan lewat `preferred_username` → `ref.users`. Tidak ada PII di DB EAP (D-14, dijaga `scripts/pii_guard.sh`).
- **`entity_id` → `ref.business_groups(id)`** pada semua tabel `eaw` (ADR-CMP-003); `eaw.entity_org` adalah view.
- **Replika lewat tabel cermin.** Replikasi logis native mensyaratkan nama skema.tabel identik, sedangkan EAP menyimpan replika di `ref.*`. Maka `026_ref_mirror.sql` membuat `mdm.*`/`iam.users` (tabel cermin) dengan trigger `ENABLE ALWAYS` yang meng-upsert ke `ref.*`. Arah sebaliknya: CMP memiliki cermin `eaw.application_registry` → `ref.applications`.
- **`shared.*` identik dengan CMP**; fungsi izin EAP ada di `set.has_perm()` (GUC `app.eap_perms`), bukan di `shared`.
- **Status hanya lewat `eaw.transition()`** (SECURITY DEFINER); objek non-Draf tidak dapat disunting; riwayat `eaw.workflow` append-only.
- Validasi relasi wajib (EAW-05) **memblokir** Divalidasi lewat `eaw.relation_check()` di `eaw.transition` (`215_eaw_relations.sql`). `ai_risk_score` ARB dihitung API saat tiket dibuat, tetapi masih heuristik leksikal (pg_trgm), bukan model AI MIND. ADR → Git otomatis lewat PR/MR (`288_adr_git.sql`, `eaw.adr_git` append-only).
- Zero Pre-Seed: tidak ada seed aplikasi; seed hanya peran/izin (`900_seed_set.sql`, dibangkitkan `scripts/gen_seed_set.py`).
- **Platform vs workspace** (`platform_app.md`): `jenis_node`, profil platform (`ui_standard`, `tech_stack`), `arb_clearance_id`, `adopsi`; izin baru `eaw.platform.write` dan `eaw.workspace.assign` (hanya Application Architect). Aturan di trigger `eaw.tg_application_platform` dan `eaw.transition` (lihat tes `07_platform_workspace.test.sql`).
