-- =====================================================================
-- 25_notifications.test.sql : lonceng notifikasi per pengguna (303)
--   - produsen: transisi status → penerima yang benar (pemegang izin + pembuat), pelaku tidak dinotifikasi
--   - tiket ARB baru/IN_REVIEW/REVISION, konektor EIO down/breaking
--   - dedupe hanya untuk yang belum dibaca; pengguna nonaktif tidak menerima
--   - RLS: hanya miliknya; hanya read_at yang dapat diubah; tidak dapat INSERT/DELETE
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE a1 uuid; t uuid; con uuid; kra uuid; n int; r record; ok boolean;
BEGIN
    PERFORM pg_temp.fx_world();
    kra := pg_temp.fx_kra('KRA-NOTIF');                                                -- Divalidasi wajib tertaut KRA berlaku sedomain

    -- 1) aplikasi Draf oleh u_app → Divalidasi: HANYA pemegang eaw.baseline.approve (u_arb) yang diminta menetapkan; pelaku & non-pemegang tidak
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, ui_standard, tech_stack, referensi_id, entity_id)
    VALUES ('NT-1', 'Aplikasi Notif', 'umum', 'b', 't', 'low', 's', 'ui', 'stack', kra, pg_temp.fx('aspal')) RETURNING id INTO a1;
    PERFORM pg_temp.fx_complete(a1);
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM eaw.transition('application', a1, 'Divalidasi');
    RESET ROLE;
    SELECT count(*) INTO n FROM set.notification WHERE objek_id = a1 AND user_id = pg_temp.fx('u_arb') AND kind = 'approval' AND severity = 'warn';
    IF n <> 1 THEN RAISE EXCEPTION 'ARB Chair harus menerima 1 notifikasi approval, dapat %', n; END IF;
    SELECT * INTO r FROM set.notification WHERE objek_id = a1 AND user_id = pg_temp.fx('u_arb');
    IF r.title <> 'Aplikasi menunggu penetapan ARB' OR r.body <> 'NT-1 · Aplikasi Notif' OR r.route <> '/eaw/aplikasi/' OR r.read_at IS NOT NULL THEN
        RAISE EXCEPTION 'isi notifikasi tidak sesuai: % | % | %', r.title, r.body, r.route; END IF;
    SELECT count(*) INTO n FROM set.notification WHERE objek_id = a1 AND user_id IN (pg_temp.fx('u_app'), pg_temp.fx('u_aud'), pg_temp.fx('u_sbu_a'), pg_temp.fx('u_sbu_t'), pg_temp.fx('u_emp'));
    IF n <> 0 THEN RAISE EXCEPTION 'pelaku & non-pemegang izin tidak boleh dinotifikasi, dapat %', n; END IF;

    -- 2) Ditetapkan oleh u_arb → u_app (pembuat + pemegang eaw.publication.approve) menerima TEPAT satu (dedupe per kejadian); pelaku u_arb tidak
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    PERFORM eaw.transition('application', a1, 'Ditetapkan', 'Keputusan ARB uji notifikasi');
    RESET ROLE;
    SELECT count(*) INTO n FROM set.notification WHERE objek_id = a1 AND user_id = pg_temp.fx('u_app'); IF n <> 1 THEN RAISE EXCEPTION 'u_app: 1 notifikasi untuk Ditetapkan, dapat %', n; END IF;
    SELECT count(*) INTO n FROM set.notification WHERE objek_id = a1 AND user_id = pg_temp.fx('u_arb'); IF n <> 1 THEN RAISE EXCEPTION 'pelaku penetapan (u_arb) tidak boleh dinotifikasi tindakannya sendiri: tetap 1 (dari Divalidasi), dapat %', n; END IF;

    -- 3) Dikembalikan ke Draf dari Divalidasi: pembuat dinotifikasi dengan catatan (kasus lain dibuat di aplikasi kedua)
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, ui_standard, tech_stack, referensi_id, entity_id)
    VALUES ('NT-2', 'Aplikasi Kembali', 'umum', 'b', 't', 'low', 's', 'ui', 'stack', kra, pg_temp.fx('aspal')) RETURNING id INTO t;
    PERFORM pg_temp.fx_complete(t);
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    PERFORM eaw.transition('application', t, 'Divalidasi');                       -- ARB Chair juga boleh memvalidasi
    PERFORM eaw.transition('application', t, 'Draf', 'Lengkapi metadata SLO terlebih dahulu');
    RESET ROLE;
    SELECT * INTO r FROM set.notification WHERE objek_id = t AND user_id = pg_temp.fx('u_app') AND kind = 'status';
    IF r.id IS NULL OR r.severity <> 'warn' OR r.body NOT LIKE '%Lengkapi metadata SLO%' THEN RAISE EXCEPTION 'pembuat harus dinotifikasi saat dikembalikan ke Draf beserta catatan'; END IF;

    -- 4) tiket ARB: baru → pemegang gov.arb.write (u_arb) kecuali pengaju; IN_REVIEW → pengaju tahu; REVISION → pengaju diminta merevisi
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    INSERT INTO eaw.arb_clearance (proposed_by, entity_id, initiative_name, business_case) VALUES (pg_temp.fx('u_sbu_a'), pg_temp.fx('aspal'), 'Inisiatif Notif', 'Kasus bisnis uji') RETURNING id INTO t;
    RESET ROLE;
    SELECT count(*) INTO n FROM set.notification WHERE objek_id = t AND user_id = pg_temp.fx('u_arb') AND kind = 'arb' AND title = 'Tiket ARB baru menunggu peninjauan';
    IF n <> 1 THEN RAISE EXCEPTION 'tiket ARB baru: ARB Chair harus dinotifikasi, dapat %', n; END IF;
    SELECT count(*) INTO n FROM set.notification WHERE objek_id = t AND user_id = pg_temp.fx('u_sbu_a'); IF n <> 0 THEN RAISE EXCEPTION 'pengaju tidak dinotifikasi tiket barunya sendiri'; END IF;
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    PERFORM eaw.arb_transition(t, 'IN_REVIEW');
    PERFORM eaw.arb_transition(t, 'REVISION', 'Lengkapi analisis duplikasi aplikasi');
    RESET ROLE;
    SELECT count(*) INTO n FROM set.notification WHERE objek_id = t AND user_id = pg_temp.fx('u_sbu_a') AND kind = 'arb'; IF n <> 2 THEN RAISE EXCEPTION 'pengaju: IN_REVIEW + REVISION = 2 notifikasi, dapat %', n; END IF;
    SELECT * INTO r FROM set.notification WHERE objek_id = t AND user_id = pg_temp.fx('u_sbu_a') AND title = 'Tiket ARB Anda perlu direvisi';
    IF r.id IS NULL OR r.body NOT LIKE '%Lengkapi analisis duplikasi%' OR r.severity <> 'warn' THEN RAISE EXCEPTION 'notifikasi REVISION harus memuat catatan'; END IF;

    -- 5) konektor EIO: down → pemegang console.eio.write (u_app, u_sys); sama lagi → tidak ganda; breaking change baru → notifikasi lain
    INSERT INTO console.eio_connector (kode, nama, sumber, target) VALUES ('NT-CON', 'Konektor Notif', 'A', 'B') RETURNING id INTO con;
    UPDATE console.eio_connector SET status = 'down', last_error = 'timeout' WHERE id = con;
    SELECT count(*) INTO n FROM set.notification WHERE objek_id = con AND kind = 'connector' AND severity = 'err'; IF n < 2 THEN RAISE EXCEPTION 'down: minimal 2 pemegang console.eio.write dinotifikasi, dapat %', n; END IF;
    UPDATE console.eio_connector SET status = 'up' WHERE id = con;
    UPDATE console.eio_connector SET status = 'down' WHERE id = con;                -- masih belum dibaca → dedupe
    SELECT count(*) INTO n FROM set.notification WHERE objek_id = con AND user_id = pg_temp.fx('u_sys'); IF n <> 1 THEN RAISE EXCEPTION 'dedupe notifikasi belum dibaca, dapat %', n; END IF;
    UPDATE console.eio_connector SET breaking_changes = '["operasi dihapus: GET /x"]'::jsonb WHERE id = con;
    SELECT count(*) INTO n FROM set.notification WHERE objek_id = con AND user_id = pg_temp.fx('u_sys') AND title LIKE '%1 perubahan breaking%'; IF n <> 1 THEN RAISE EXCEPTION 'breaking change harus memicu notifikasi, dapat %', n; END IF;
    -- konektor tanpa izin: auditor/emp tidak menerima
    SELECT count(*) INTO n FROM set.notification WHERE objek_id = con AND user_id IN (pg_temp.fx('u_aud'), pg_temp.fx('u_emp')); IF n <> 0 THEN RAISE EXCEPTION 'non-pemegang izin tidak boleh dinotifikasi'; END IF;

    -- 6) dedupe hanya untuk yang belum dibaca: tandai dibaca → kejadian sama boleh muncul lagi
    ok := set.notify_user(pg_temp.fx('u_app'), 'info', 'info', 'Uji dedupe', NULL, '/eaw/dashboard/', NULL, NULL, 'uji:dedupe');
    IF NOT ok THEN RAISE EXCEPTION 'penyisipan pertama harus berhasil'; END IF;
    ok := set.notify_user(pg_temp.fx('u_app'), 'info', 'info', 'Uji dedupe', NULL, '/eaw/dashboard/', NULL, NULL, 'uji:dedupe');
    IF ok THEN RAISE EXCEPTION 'duplikat belum dibaca harus diabaikan'; END IF;
    UPDATE set.notification SET read_at = now() WHERE user_id = pg_temp.fx('u_app') AND dedupe_key = 'uji:dedupe';
    ok := set.notify_user(pg_temp.fx('u_app'), 'info', 'info', 'Uji dedupe', NULL, '/eaw/dashboard/', NULL, NULL, 'uji:dedupe');
    IF NOT ok THEN RAISE EXCEPTION 'setelah dibaca, kejadian yang sama boleh muncul lagi'; END IF;

    -- 7) pengguna nonaktif tidak menerima; rute harus path SPA (CHECK)
    UPDATE set.users SET is_active = false WHERE id = pg_temp.fx('u_emp');
    ok := set.notify_user(pg_temp.fx('u_emp'), 'info', 'info', 'Tidak boleh', NULL, '/x/', NULL, NULL, NULL);
    IF ok THEN RAISE EXCEPTION 'pengguna nonaktif tidak boleh menerima notifikasi'; END IF;
    PERFORM pg_temp.expect_error($f$INSERT INTO set.notification (user_id, kind, title, route) SELECT id, 'info', 'x', 'https://evil.example' FROM set.users LIMIT 1$f$, '23514', 'rute harus path SPA');

    -- 8) RLS & hak kolom: pengguna hanya melihat miliknya, hanya read_at yang boleh diubah, tanpa INSERT/DELETE
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    SELECT count(*) INTO n FROM set.notification WHERE user_id <> pg_temp.fx('u_app'); IF n <> 0 THEN RAISE EXCEPTION 'RLS: u_app tidak boleh melihat notifikasi orang lain, dapat %', n; END IF;
    SELECT count(*) INTO n FROM set.notification; IF n < 1 THEN RAISE EXCEPTION 'u_app harus melihat notifikasi miliknya'; END IF;
    PERFORM pg_temp.expect_error($f$UPDATE set.notification SET title = 'diubah'$f$, '42501', 'hanya read_at yang dapat diubah');
    PERFORM pg_temp.expect_error($f$INSERT INTO set.notification (user_id, kind, title) VALUES (gen_random_uuid(), 'info', 'palsu')$f$, '42501', 'pengguna tidak dapat INSERT');
    PERFORM pg_temp.expect_error($f$DELETE FROM set.notification$f$, '42501', 'pengguna tidak dapat DELETE');
    UPDATE set.notification SET read_at = now() WHERE read_at IS NULL;                -- menandai dibaca milik sendiri
    SELECT count(*) INTO n FROM set.notification WHERE read_at IS NULL; IF n <> 0 THEN RAISE EXCEPTION 'tanda baca milik sendiri harus berhasil'; END IF;
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    SELECT count(*) INTO n FROM set.notification WHERE read_at IS NULL; IF n < 1 THEN RAISE EXCEPTION 'tanda baca u_app tidak boleh memengaruhi u_arb (RLS UPDATE)'; END IF;
    PERFORM pg_temp.as_user(pg_temp.fx('u_emp'));
    SELECT count(*) INTO n FROM set.notification; IF n <> 0 THEN RAISE EXCEPTION 'pengguna tanpa notifikasi melihat 0'; END IF;
    RESET ROLE;
    -- fungsi penulis tidak dapat dipanggil pengguna aplikasi
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM pg_temp.expect_error($f$SELECT set.notify_user(gen_random_uuid(), 'info', 'info', 'x', NULL, NULL, NULL, NULL, NULL)$f$, '42501', 'notify_user tertutup untuk eap_app');
END $$;
ROLLBACK;
