-- =====================================================================
-- 15_roadmap.test.sql : Master IT Roadmap (FR-04.1) — hak tulis hanya eaw.roadmap.write, rentang fase, selesai_pada otomatis, terhambat beralasan,
--                       fase berbutir tidak dapat dihapus, bukti objek harus ada & terlihat
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE f1 uuid; f2 uuid; i1 uuid; i2 uuid; n int; d date; kra uuid; a uuid;
BEGIN
    PERFORM pg_temp.fx_world();
    kra := pg_temp.fx_kra('KRA-RM');

    -- 1) hak tulis: Application Architect (EA Office) menyusun; SBU Architect hanya membaca; tanpa izin eaw tidak melihat
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    PERFORM pg_temp.expect_error($f$INSERT INTO eaw.roadmap_phase (nama, mulai, selesai) VALUES ('Fase X', '2026-01-01', '2026-03-31')$f$, '42501', 'SBU tidak menyusun roadmap');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.roadmap_phase (nama, urutan, mulai, selesai) VALUES ('Fase 1 Fondasi', 1, '2026-01-01', '2026-03-31') RETURNING id INTO f1;
    INSERT INTO eaw.roadmap_phase (nama, urutan, mulai, selesai) VALUES ('Fase 2 Ekspansi', 2, '2026-04-01', '2026-06-30') RETURNING id INTO f2;
    PERFORM pg_temp.expect_error($f$INSERT INTO eaw.roadmap_phase (nama, mulai, selesai) VALUES ('fase 1 fondasi', '2026-07-01', '2026-09-30')$f$, '23505', 'nama fase unik (tanpa peduli huruf)');
    PERFORM pg_temp.expect_error($f$INSERT INTO eaw.roadmap_phase (nama, mulai, selesai) VALUES ('Terbalik', '2026-05-01', '2026-04-01')$f$, '23514', 'selesai >= mulai');

    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    SELECT count(*) INTO n FROM eaw.roadmap_phase; IF n <> 2 THEN RAISE EXCEPTION 'pembaca (catalog.read) melihat 2 fase, dapat %', n; END IF;
    PERFORM pg_temp.as_user(pg_temp.fx('u_emp'));
    SELECT count(*) INTO n FROM eaw.roadmap_phase; IF n <> 0 THEN RAISE EXCEPTION 'tanpa izin eaw tidak melihat roadmap'; END IF;

    -- 2) butir: target di dalam rentang fase; selesai_pada otomatis; terhambat wajib alasan
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.roadmap_item (phase_id, jenis, judul, target) VALUES (f1, 'deliverable', 'Katalog APM awal', '2026-02-15') RETURNING id INTO i1;
    INSERT INTO eaw.roadmap_item (phase_id, jenis, judul, target) VALUES (f1, 'milestone', 'Platform BASE ditetapkan', '2026-03-31') RETURNING id INTO i2;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.roadmap_item (phase_id, jenis, judul, target) VALUES (%L, 'milestone', 'Di luar rentang', '2026-04-01')$f$, f1), '23514', 'target di luar rentang fase');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.roadmap_item (phase_id, jenis, judul, target) VALUES (%L, 'sprint', 'Jenis salah', '2026-02-01')$f$, f1), '23514', 'jenis hanya deliverable|milestone');
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.roadmap_item SET status = 'terhambat' WHERE id = %L$f$, i1), '23514', 'terhambat wajib catatan');
    UPDATE eaw.roadmap_item SET status = 'terhambat', catatan = 'Menunggu data entitas' WHERE id = i1;
    UPDATE eaw.roadmap_item SET status = 'selesai' WHERE id = i1;
    SELECT selesai_pada INTO d FROM eaw.roadmap_item WHERE id = i1;
    IF d IS DISTINCT FROM current_date THEN RAISE EXCEPTION 'selesai_pada harus otomatis hari ini, dapat %', d; END IF;
    UPDATE eaw.roadmap_item SET status = 'berjalan' WHERE id = i1;
    SELECT selesai_pada INTO d FROM eaw.roadmap_item WHERE id = i1;
    IF d IS NOT NULL THEN RAISE EXCEPTION 'selesai_pada harus dikosongkan saat status keluar dari selesai'; END IF;

    -- 3) rentang fase: tidak boleh mengeluarkan butir aktif; memindahkan butir ke fase lain memeriksa rentang baru
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.roadmap_phase SET selesai = '2026-03-01' WHERE id = %L$f$, f1), '23514', 'penyempitan fase mengeluarkan butir');
    UPDATE eaw.roadmap_phase SET selesai = '2026-04-15' WHERE id = f1;
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.roadmap_item SET phase_id = %L WHERE id = %L$f$, f2, i1), '23514', 'butir (15 Feb) tidak muat di fase 2');
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.roadmap_phase SET deleted_at = now() WHERE id = %L$f$, f1), '23503', 'fase berbutir tidak dapat dihapus');
    UPDATE eaw.roadmap_item SET deleted_at = now() WHERE phase_id = f1;
    UPDATE eaw.roadmap_phase SET deleted_at = now() WHERE id = f1; GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'fase kosong dapat dihapus lunak'; END IF;

    -- 4) bukti objek EAW: harus ada dan terlihat; pasangan type/id lengkap
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, ui_standard, tech_stack, referensi_id, entity_id)
    VALUES ('RM-APP', 'Aplikasi Roadmap', 'umum', 'b', 't', 'low', 's', 'ui', 'stack', kra, pg_temp.fx('hold')) RETURNING id INTO a;
    INSERT INTO eaw.roadmap_item (phase_id, jenis, judul, target, object_type, object_id) VALUES (f2, 'milestone', 'RM-APP divalidasi', '2026-05-10', 'application', a);
    IF eaw.object_status('application', a) <> 'Draf' THEN RAISE EXCEPTION 'object_status harus Draf'; END IF;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.roadmap_item (phase_id, jenis, judul, target, object_type, object_id) VALUES (%L, 'milestone', 'Objek hantu', '2026-05-11', 'application', gen_random_uuid())$f$, f2), '23503', 'objek bukti tidak ada');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.roadmap_item (phase_id, jenis, judul, target, object_type) VALUES (%L, 'milestone', 'Setengah tautan', '2026-05-12', 'application')$f$, f2), '23514', 'type tanpa id');
END $$;
ROLLBACK;
