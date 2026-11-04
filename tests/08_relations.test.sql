-- =====================================================================
-- 08_relations.test.sql : relasi antar-objek + validasi kelengkapan relasi wajib (EAW-05, SAF Bab 7)
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE kra uuid; a uuid; s uuid; p uuid; d uuid; i uuid; c uuid; f uuid; r uuid; msg text; n int;
BEGIN
    PERFORM pg_temp.fx_world();
    kra := pg_temp.fx_kra('KRA-REL');

    -- objek disusun SBU Aspal (cakupannya)
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    INSERT INTO eaw.service (nama, tipe, kategori, entity_id, referensi_id) VALUES ('Layanan Aspal', 'internal', 'utama', pg_temp.fx('aspal'), kra) RETURNING id INTO s;
    INSERT INTO eaw.process (nama, level, entity_id, referensi_id) VALUES ('Produksi Aspal', 1, pg_temp.fx('aspal'), kra) RETURNING id INTO p;
    INSERT INTO eaw.data_entity (nama_kanonikal, klasifikasi, entity_id, referensi_id) VALUES ('Order Aspal', 'internal', pg_temp.fx('aspal'), kra) RETURNING id INTO d;
    INSERT INTO eaw.infra_asset (nama, tipe, entity_id, referensi_id) VALUES ('K8s Aspal', 'klaster-k8s', pg_temp.fx('aspal'), kra) RETURNING id INTO i;
    INSERT INTO eaw.control (aspek, status_penerapan, entity_id, referensi_id) VALUES ('kerahasiaan', 'sebagian', pg_temp.fx('aspal'), kra) RETURNING id INTO c;
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));        -- platform dibentuk Application Architect
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, ui_standard, tech_stack, referensi_id, entity_id)
    VALUES ('REL-APP', 'Aplikasi Relasi', 'umum', 'b', 't', 'low', 's', 'ui', 'stack', kra, pg_temp.fx('aspal')) RETURNING id INTO a;
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));

    -- 1) matriks relasi: pasangan/tipe tidak sah, relasi ke diri, objek tidak ada
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) VALUES ('process', %L, 'application', %L, 'serving')$f$, p, a), '23514', 'arah terbalik tidak sah');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) VALUES ('application', %L, 'service', %L, 'access')$f$, a, s), '23514', 'tipe tidak sah untuk pasangan');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) VALUES ('application', %L, 'application', %L, 'flow')$f$, a, a), '23514', 'relasi ke diri sendiri');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) VALUES ('application', %L, 'service', gen_random_uuid(), 'serving')$f$, a), '23503', 'target tidak ada');
    PERFORM pg_temp.expect_error($f$INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) VALUES ('kereta', gen_random_uuid(), 'service', gen_random_uuid(), 'serving')$f$, '23514', 'jenis objek tidak dikenal');

    -- 2) aplikasi tanpa relasi: validasi ditolak, pesan menyebut objek dan relasi yang kurang
    PERFORM set_config('app.fx_a', a::text, false);
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    BEGIN
        PERFORM eaw.transition('application', a, 'Divalidasi');
        RAISE EXCEPTION 'validasi tanpa relasi wajib seharusnya ditolak';
    EXCEPTION WHEN check_violation THEN
        msg := SQLERRM;
        IF msg NOT LIKE '%Aplikasi Relasi%' OR msg NOT LIKE '%Layanan%' OR msg NOT LIKE '%Proses%' OR msg NOT LIKE '%Entitas Data%' OR msg NOT LIKE '%Infrastruktur%' OR msg NOT LIKE '%Kontrol%' THEN
            RAISE EXCEPTION 'pesan harus menyebut objek dan 5 relasi yang kurang: %', msg;
        END IF;
    END;

    -- 3) SBU menyusun relasi aplikasinya; terlengkapi satu per satu — kesiapan dilaporkan relation_check
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) VALUES ('application', a, 'service', s, 'serving') RETURNING id INTO r;
    INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) VALUES ('application', a, 'process', p, 'serving');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) VALUES ('application', %L, 'service', %L, 'serving')$f$, a, s), '23505', 'relasi ganda');
    SELECT count(*) INTO n FROM eaw.relation_check('application', a) WHERE ok;
    IF n <> 2 THEN RAISE EXCEPTION 'dua aturan terpenuhi (layanan, proses), ditemukan %', n; END IF;
    INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) VALUES
        ('application', a, 'data_entity', d, 'access'), ('application', a, 'infra_asset', i, 'assignment'), ('application', a, 'control', c, 'association');
    IF EXISTS (SELECT 1 FROM eaw.relation_check('application', a) WHERE NOT ok) THEN RAISE EXCEPTION 'semua aturan aplikasi harus terpenuhi'; END IF;

    -- 4) relasi di luar cakupan: SBU Toyota tidak melihat maupun menulis relasi aplikasi Aspal
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_t'));
    IF (SELECT count(*) FROM eaw.relation) <> 0 THEN RAISE EXCEPTION 'relasi entitas lain bocor'; END IF;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) VALUES ('application', %L, 'service', %L, 'realization')$f$, a, s), '42501', 'menulis relasi di luar cakupan');

    -- 5) validasi berhasil; setelah itu relasi sumber terkunci (tambah/hapus ditolak) sampai kembali ke Draf
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM eaw.transition('application', a, 'Divalidasi');
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.relation SET deleted_at = now() WHERE id = %L$f$, r), '23514', 'relasi objek Divalidasi terkunci');
    PERFORM eaw.transition('application', a, 'Draf', 'Revisi relasi');
    UPDATE eaw.relation SET deleted_at = now() WHERE id = r;                                  -- Draf lagi: boleh
    IF (SELECT ok FROM eaw.relation_check('application', a) WHERE rule = 'layanan') THEN RAISE EXCEPTION 'relasi terhapus tidak dihitung'; END IF;

    -- 6) Layanan >= 1 Proses
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    BEGIN
        PERFORM eaw.transition('service', s, 'Divalidasi');
        RAISE EXCEPTION 'layanan tanpa proses seharusnya ditolak';
    EXCEPTION WHEN check_violation THEN
        IF SQLERRM NOT LIKE '%Layanan Aspal%' OR SQLERRM NOT LIKE '%Proses%' THEN RAISE EXCEPTION 'pesan layanan: %', SQLERRM; END IF;
    END;
    INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) VALUES ('service', s, 'process', p, 'realization');
    PERFORM eaw.transition('service', s, 'Divalidasi');

    -- 7) Entitas Data: steward + sumber otoritatif wajib
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('data_entity', %L, 'Divalidasi')$f$, d), '23514', 'data tanpa steward/sumber');
    UPDATE eaw.data_entity SET steward = 'Head of Data', sumber_otoritatif = 'kalla_cmp.mdm.parties' WHERE id = d;
    PERFORM eaw.transition('data_entity', d, 'Divalidasi');

    -- 8) Kerangka Kerja: memuat objek di keenam domain (relasi bertanda kerangka_id)
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.framework (entity_id, layanan_utama, tipe) VALUES (pg_temp.fx('aspal'), 'Penjualan Aspal', 'utama') RETURNING id INTO f;
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('framework', %L, 'Divalidasi')$f$, f), '23514', 'kerangka kosong');
    UPDATE eaw.relation SET kerangka_id = f WHERE sumber_id = a AND deleted_at IS NULL;      -- aplikasi->{proses, data, infra, kontrol}
    IF (SELECT count(*) FROM eaw.relation_check('framework', f) WHERE ok) <> 5 THEN RAISE EXCEPTION 'kerangka: 5 domain terpenuhi (aplikasi, proses, data, infra, keamanan; layanan belum), ditemukan %', (SELECT count(*) FROM eaw.relation_check('framework', f) WHERE ok); END IF;
END $$;
ROLLBACK;
