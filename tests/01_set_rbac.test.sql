-- =====================================================================
-- 01_set_rbac.test.sql : skema set — 13 role resmi, izin granular, klaim sesi berlingkup, provisioning, admin-only
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE
    n int; g_hold uuid; g_eco uuid; g_aspal uuid; g_toyota uuid; g_eco2 uuid;
    u_arb uuid; u_sbu uuid; u_aud uuid; u_sys uuid; u_emp uuid; c jsonb; v uuid;
BEGIN
    -- 1) seed: 13 role resmi, format izin <workspace>.<modul>.<aksi>, pemetaan lengkap
    SELECT count(*) INTO n FROM set.roles WHERE deleted_at IS NULL;
    IF n <> 13 THEN RAISE EXCEPTION 'harus 13 role resmi, ditemukan %', n; END IF;
    IF EXISTS (SELECT 1 FROM set.roles WHERE role_code !~ '^ROLE_EAP_[A-Z_]+$') THEN RAISE EXCEPTION 'format role_code tidak sesuai'; END IF;
    IF EXISTS (SELECT 1 FROM set.permissions WHERE permission_code <> workspace || '.' || module || '.' || action) THEN RAISE EXCEPTION 'format izin salah'; END IF;
    IF EXISTS (SELECT 1 FROM set.roles r WHERE NOT EXISTS (SELECT 1 FROM set.role_permissions rp WHERE rp.role_id = r.id)) THEN
        RAISE EXCEPTION 'ada role tanpa izin';
    END IF;
    -- hanya ARB yang menetapkan; SBU tidak boleh memvalidasi/menetapkan/mempublikasi
    SELECT count(*) INTO n FROM set.role_permissions rp JOIN set.roles r ON r.id = rp.role_id JOIN set.permissions p ON p.id = rp.permission_id
     WHERE p.permission_code = 'eaw.baseline.approve';
    IF n <> 1 THEN RAISE EXCEPTION 'eaw.baseline.approve harus hanya dimiliki ARB Chair (ditemukan % role)', n; END IF;
    IF EXISTS (SELECT 1 FROM set.role_permissions rp JOIN set.roles r ON r.id = rp.role_id JOIN set.permissions p ON p.id = rp.permission_id
                WHERE r.role_code = 'ROLE_EAP_SBU_ARCHITECT' AND p.action IN ('approve', 'run', 'admin')) THEN
        RAISE EXCEPTION 'SBU Architect tidak boleh punya izin approve/run/admin';
    END IF;
    -- Zero Pre-Seed: katalog arsitektur kosong
    IF (SELECT count(*) FROM eaw.application) + (SELECT count(*) FROM eaw.process) + (SELECT count(*) FROM eaw.service) + (SELECT count(*) FROM eaw.reference) <> 0 THEN
        RAISE EXCEPTION 'EAP harus dimulai kosong (Zero Pre-Seed)';
    END IF;

    -- 2) hierarki + pengguna
    g_hold  := pg_temp.fx_group('T-KALLA', 'Kalla', 'holding');
    g_eco   := pg_temp.fx_group('T-ECO-CON', 'Eco Konstruksi', 'ecosystem', g_hold);
    g_eco2  := pg_temp.fx_group('T-ECO-AUTO', 'Eco Otomotif', 'ecosystem', g_hold);
    g_aspal := pg_temp.fx_group('T-ASPAL', 'Kalla Aspal', 'sbu', g_eco);
    g_toyota:= pg_temp.fx_group('T-TOYOTA', 'Kalla Toyota', 'sbu', g_eco2);
    PERFORM pg_temp.fx_group('T-ASPAL-BU', 'Unit Aspal Curah', 'business_unit', g_aspal);
    u_arb := pg_temp.fx_user('arb',  ARRAY[['ROLE_EAP_ARB_CHAIR', '']]);
    u_sbu := pg_temp.fx_user('sbu',  ARRAY[['ROLE_EAP_SBU_ARCHITECT', 'T-ASPAL']]);
    u_aud := pg_temp.fx_user('aud',  ARRAY[['ROLE_EAP_AUDITOR', '']]);
    u_sys := pg_temp.fx_user('sys',  ARRAY[['ROLE_EAP_SYSADMIN', '']]);
    u_emp := pg_temp.fx_user('emp');

    -- 3) klaim sesi
    c := set.session_claims(u_arb);
    IF NOT ((c->>'view_all')::boolean AND (c->>'edit_all')::boolean) THEN RAISE EXCEPTION 'ARB Chair holding-wide harus view_all+edit_all: %', c; END IF;
    IF NOT c->'permissions' ? 'eaw.baseline.approve' THEN RAISE EXCEPTION 'ARB harus punya eaw.baseline.approve'; END IF;

    c := set.session_claims(u_sbu);
    IF (c->>'view_all')::boolean OR (c->>'edit_all')::boolean THEN RAISE EXCEPTION 'SBU Architect berlingkup entitas, bukan holding-wide: %', c; END IF;
    IF NOT c->'edit_ids' ? g_aspal::text THEN RAISE EXCEPTION 'edit_ids harus memuat entitas penugasan'; END IF;
    IF jsonb_array_length(c->'edit_ids') <> 2 THEN RAISE EXCEPTION 'edit_ids = entitas + turunannya (2), ditemukan %', c->'edit_ids'; END IF;   -- T-ASPAL + T-ASPAL-BU
    IF c->'edit_ids' ? g_toyota::text OR c->'edit_ids' ? g_eco::text THEN RAISE EXCEPTION 'edit_ids tidak boleh memuat saudara/induk'; END IF;

    c := set.session_claims(u_aud);
    IF NOT (c->>'view_all')::boolean OR (c->>'edit_all')::boolean THEN RAISE EXCEPTION 'Auditor lihat-semua tetapi read-only: %', c; END IF;

    c := set.session_claims(u_emp);
    IF jsonb_array_length(c->'permissions') <> 0 OR (c->>'view_all')::boolean THEN RAISE EXCEPTION 'pengguna tanpa peran tidak boleh punya izin: %', c; END IF;

    -- pengguna CMP dinonaktifkan (replika) -> klaim nonaktif meski set.users masih aktif
    PERFORM set_config('session_replication_role', 'replica', true);
    UPDATE ref.users SET is_active = false WHERE username = 'aud';
    PERFORM set_config('session_replication_role', 'origin', true);
    IF (set.session_claims(u_aud)->>'active')::boolean THEN RAISE EXCEPTION 'pengguna nonaktif di CMP harus nonaktif di EAP'; END IF;
    -- penugasan kedaluwarsa tidak dihitung
    UPDATE set.user_roles SET valid_from = now() - interval '2 days', valid_until = now() - interval '1 day' WHERE user_id = u_sbu;
    IF jsonb_array_length(set.session_claims(u_sbu)->'permissions') <> 0 THEN RAISE EXCEPTION 'penugasan kedaluwarsa tidak boleh memberi izin'; END IF;

    -- 4) entity_scope harus entitas yang ada
    PERFORM pg_temp.expect_error(format($f$INSERT INTO set.user_roles (user_id, role_id, entity_scope) SELECT %L, id, 'T-TIDAK-ADA' FROM set.roles WHERE role_code = 'ROLE_EAP_BPO'$f$, u_emp),
                                 '23503', 'entity_scope tak dikenal');

    -- 5) provisioning: hanya pengguna CMP aktif; satu akun CMP = satu subjek IdP
    PERFORM set_config('session_replication_role', 'replica', true);
    INSERT INTO ref.users (id, username, display_name, is_active, row_version) VALUES (gen_random_uuid(), 'baru.user', 'Baru', true, 1), (gen_random_uuid(), 'off.user', 'Off', false, 1);
    PERFORM set_config('session_replication_role', 'origin', true);
    IF set.provision_user('sub-x', 'tidak.ada') IS NOT NULL THEN RAISE EXCEPTION 'username tak dikenal CMP tidak boleh diprovisi'; END IF;
    IF set.provision_user('sub-y', 'off.user') IS NOT NULL THEN RAISE EXCEPTION 'akun nonaktif di CMP tidak boleh diprovisi'; END IF;
    IF set.provision_user('sub-z', NULL) IS NOT NULL THEN RAISE EXCEPTION 'tanpa username tidak boleh diprovisi'; END IF;
    v := set.provision_user('sub-baru', 'baru.user');
    IF v IS NULL THEN RAISE EXCEPTION 'pengguna CMP aktif harus berhasil diprovisi'; END IF;
    IF set.provision_user('sub-baru', 'siapa-saja') IS DISTINCT FROM v THEN RAISE EXCEPTION 'subjek yang sama harus mengembalikan akun yang sama (idempoten, abaikan username)'; END IF;
    IF set.provision_user('sub-lain', 'baru.user') IS NOT NULL THEN RAISE EXCEPTION 'akun CMP yang sama tidak boleh ditautkan ke subjek IdP kedua'; END IF;

    -- akun yang dibuat lebih dulu (tanpa tautan CMP) ditautkan saat login bila username cocok; tidak mengambil akun CMP yang sudah terpakai
    PERFORM set_config('session_replication_role', 'replica', true);
    INSERT INTO ref.users (id, username, display_name, is_active, row_version) VALUES (gen_random_uuid(), 'lambat.link', 'L', true, 1);
    PERFORM set_config('session_replication_role', 'origin', true);
    INSERT INTO set.users (idp_subject) VALUES ('sub-lambat') RETURNING id INTO v;
    IF (set.session_claims(v)->>'active')::boolean THEN RAISE EXCEPTION 'akun tanpa tautan CMP tidak boleh aktif'; END IF;
    IF set.provision_user('sub-lambat', 'lambat.link') IS DISTINCT FROM v THEN RAISE EXCEPTION 'login harus mengembalikan akun yang sudah ada'; END IF;
    IF (SELECT cmp_user_id FROM set.users WHERE id = v) IS NULL THEN RAISE EXCEPTION 'tautan CMP harus terisi saat login'; END IF;
    INSERT INTO set.users (idp_subject) VALUES ('sub-pencuri') RETURNING id INTO v;
    PERFORM set.provision_user('sub-pencuri', 'lambat.link');
    IF (SELECT cmp_user_id FROM set.users WHERE id = v) IS NOT NULL THEN RAISE EXCEPTION 'akun CMP yang sudah terpakai tidak boleh ditautkan ke subjek lain'; END IF;

    -- 6) administrasi role/izin/penugasan hanya untuk set.account.admin (ditegakkan di DB)
    PERFORM pg_temp.as_user(u_emp);
    PERFORM pg_temp.expect_error($f$INSERT INTO set.roles (role_code, role_name, tier) VALUES ('ROLE_X', 'X', 'T3_EXECUTION')$f$, '42501', 'tanpa set.account.admin');
    PERFORM pg_temp.expect_error($f$INSERT INTO set.users (idp_subject) VALUES ('sub-langsung')$f$, '42501', 'set.users tidak boleh ditulis langsung oleh aplikasi');
    PERFORM pg_temp.as_user(u_sys);
    INSERT INTO set.roles (role_code, role_name, tier) VALUES ('ROLE_EAP_TEST_ONLY', 'Uji', 'T3_EXECUTION');
    DELETE FROM set.roles WHERE role_code = 'ROLE_EAP_TEST_ONLY';
    -- pengguna biasa hanya melihat akunnya sendiri; admin melihat semua
    IF (SELECT count(*) FROM set.users) < 5 THEN RAISE EXCEPTION 'sysadmin (set.account.read) harus melihat semua akun'; END IF;
    -- aktivasi akun hanya lewat fungsi definer + set.account.admin; tidak dapat menonaktifkan diri sendiri
    PERFORM set.set_user_active(u_emp, false);
    IF (SELECT is_active FROM set.users WHERE id = u_emp) THEN RAISE EXCEPTION 'akun harus nonaktif'; END IF;
    PERFORM set.set_user_active(u_emp, true);
    PERFORM pg_temp.expect_error(format($f$SELECT set.set_user_active(%L, false)$f$, u_sys), '23514', 'menonaktifkan akun sendiri');
    PERFORM pg_temp.expect_error($f$SELECT set.set_user_active(gen_random_uuid(), true)$f$, 'P0002', 'akun tidak ada');
    PERFORM pg_temp.as_user(u_emp);
    PERFORM pg_temp.expect_error(format($f$SELECT set.set_user_active(%L, false)$f$, u_sys), '42501', 'tanpa set.account.admin');
    IF (SELECT count(*) FROM set.users) <> 1 THEN RAISE EXCEPTION 'pengguna biasa hanya melihat akunnya sendiri'; END IF;
    PERFORM pg_temp.as_owner();
END $$;
ROLLBACK;
