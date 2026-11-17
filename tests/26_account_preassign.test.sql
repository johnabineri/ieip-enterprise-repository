-- =====================================================================
-- 26_account_preassign.test.sql : pola pra-tugas akun lewat identitas CMP (304)
--   - preassign_user: hanya set.account.admin; hanya pengguna CMP aktif; idempoten; akun tertaut sejak awal (pending:<id>) dan dapat diberi peran
--   - provision_user: login pertama mengambil alih akun pending (idp_subject diganti; akun & peran sama); subjek lain ditolak sesudahnya
--   - jalur lama tetap: akun tanpa tautan ditautkan saat login; login pertama tanpa pra-tugas membuat akun baru tanpa peran
-- =====================================================================
BEGIN;
\ir _helpers.sql
CREATE FUNCTION pg_temp.fx_cmp_user(p_name text, p_active boolean DEFAULT true) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid := gen_random_uuid();
BEGIN
    PERFORM set_config('session_replication_role', 'replica', true);
    INSERT INTO ref.users (id, username, display_name, is_active, row_version) VALUES (v, p_name, p_name, p_active, 1);
    PERFORM set_config('session_replication_role', 'origin', true);
    RETURN v;
END $$;
DO $$
DECLARE cmp uuid; inact uuid; leg uuid; acc uuid; acc2 uuid; n int; r record; sub text;
BEGIN
    PERFORM pg_temp.fx_world();
    cmp := pg_temp.fx_cmp_user('pre.user');  inact := pg_temp.fx_cmp_user('pre.inactive', false);

    -- 1) izin & validasi
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM pg_temp.expect_error(format($f$SELECT set.preassign_user(%L)$f$, cmp), '42501', 'hanya set.account.admin yang boleh pra-tugas');
    PERFORM pg_temp.as_user(pg_temp.fx('u_sys'));
    PERFORM pg_temp.expect_error(format($f$SELECT set.preassign_user(%L)$f$, inact), '23514', 'pengguna CMP nonaktif ditolak');
    PERFORM pg_temp.expect_error($f$SELECT set.preassign_user(gen_random_uuid())$f$, '23514', 'pengguna CMP tidak dikenal ditolak');

    -- 2) pra-tugas: akun tertaut sejak awal, idempoten, dapat diberi peran sebelum login
    acc := set.preassign_user(cmp);
    RESET ROLE;
    SELECT * INTO r FROM set.users WHERE id = acc;
    IF r.cmp_user_id <> cmp OR r.idp_subject <> 'pending:' || cmp OR r.last_login_at IS NOT NULL OR NOT r.is_active THEN RAISE EXCEPTION 'akun pra-tugas harus tertaut + pending + aktif + belum login'; END IF;
    PERFORM pg_temp.as_user(pg_temp.fx('u_sys'));
    IF set.preassign_user(cmp) <> acc THEN RAISE EXCEPTION 'pra-tugas ulang harus mengembalikan akun yang sama (idempoten)'; END IF;
    INSERT INTO set.user_roles (user_id, role_id) SELECT acc, id FROM set.roles WHERE role_code = 'ROLE_EAP_AUDITOR';
    RESET ROLE;
    IF NOT (set.session_claims(acc)->'roles') ? 'ROLE_EAP_AUDITOR' THEN RAISE EXCEPTION 'peran pra-tugas harus berlaku walau belum login (identitas CMP aktif)'; END IF;

    -- 3) login pertama mengambil alih akun pending: subjek diganti, akun/peran sama, tidak ada akun ganda
    IF set.provision_user('sub-real-pre', 'pre.user') <> acc THEN RAISE EXCEPTION 'login pertama harus mengembalikan akun pra-tugas yang sama'; END IF;
    SELECT idp_subject INTO sub FROM set.users WHERE id = acc;
    IF sub <> 'sub-real-pre' THEN RAISE EXCEPTION 'idp_subject harus diganti subjek IdP sebenarnya, dapat %', sub; END IF;
    SELECT count(*) INTO n FROM set.users WHERE cmp_user_id = cmp AND deleted_at IS NULL; IF n <> 1 THEN RAISE EXCEPTION 'tidak boleh ada akun ganda, dapat %', n; END IF;
    IF set.provision_user('sub-real-pre', 'pre.user') <> acc THEN RAISE EXCEPTION 'login berikutnya mencari lewat idp_subject'; END IF;
    IF set.provision_user('sub-lain', 'pre.user') IS NOT NULL THEN RAISE EXCEPTION 'subjek IdP lain untuk akun CMP yang sama harus ditolak sesudah diambil alih'; END IF;
    IF (SELECT count(*) FROM set.user_roles WHERE user_id = acc AND deleted_at IS NULL) <> 1 THEN RAISE EXCEPTION 'peran tetap melekat pada akun'; END IF;

    -- 4) jalur lama: akun tanpa tautan (seed/administrator) ditautkan saat login bila username cocok
    leg := pg_temp.fx_cmp_user('legacy.user');
    INSERT INTO set.users (idp_subject) VALUES ('sub-legacy');
    IF (SELECT cmp_user_id FROM set.users WHERE idp_subject = 'sub-legacy') IS NOT NULL THEN RAISE EXCEPTION 'prasyarat: akun lama belum tertaut'; END IF;
    PERFORM set.provision_user('sub-legacy', 'legacy.user');
    IF (SELECT cmp_user_id FROM set.users WHERE idp_subject = 'sub-legacy') IS DISTINCT FROM leg THEN RAISE EXCEPTION 'akun lama harus tertaut saat login'; END IF;

    -- 5) jalur lama: login pertama tanpa pra-tugas membuat akun baru TANPA peran; username tak dikenal/nonaktif tidak membuat akun
    acc2 := set.provision_user('sub-baru', 'pre.inactive');
    IF acc2 IS NOT NULL THEN RAISE EXCEPTION 'pengguna CMP nonaktif tidak boleh dibuatkan akun'; END IF;
    PERFORM pg_temp.fx_cmp_user('fresh.user');
    acc2 := set.provision_user('sub-fresh', 'fresh.user');
    IF acc2 IS NULL OR (SELECT count(*) FROM set.user_roles WHERE user_id = acc2) <> 0 THEN RAISE EXCEPTION 'akun baru dari login pertama: tanpa peran'; END IF;
    IF set.provision_user('sub-x', 'tidak.dikenal') IS NOT NULL THEN RAISE EXCEPTION 'username tak dikenal tidak membuat akun'; END IF;
END $$;
ROLLBACK;
