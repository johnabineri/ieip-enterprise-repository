-- =====================================================================
-- 13_lineage.test.sql : eaw.dependency_edge — arah ketergantungan turunan dari relasi, simetri association, RLS invoker
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE kra uuid; a uuid; s uuid; d uuid; i uuid; pr uuid; n int;
BEGIN
    PERFORM pg_temp.fx_world();
    kra := pg_temp.fx_kra('KRA-LIN');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, ui_standard, tech_stack, entity_id) VALUES ('LIN-APP','A','umum','b','t','low','s','ui','st', pg_temp.fx('aspal')) RETURNING id INTO a;
    INSERT INTO eaw.service (nama, tipe, kategori, entity_id) VALUES ('S','internal','utama', pg_temp.fx('aspal')) RETURNING id INTO s;
    INSERT INTO eaw.data_entity (nama_kanonikal, klasifikasi, entity_id) VALUES ('D','internal', pg_temp.fx('aspal')) RETURNING id INTO d;
    INSERT INTO eaw.infra_asset (nama, tipe, entity_id) VALUES ('I','klaster-k8s', pg_temp.fx('aspal')) RETURNING id INTO i;
    INSERT INTO eaw.process (nama, level, entity_id) VALUES ('P', 1, pg_temp.fx('aspal')) RETURNING id INTO pr;
    INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) VALUES
        ('application', a, 'service', s, 'serving'), ('application', a, 'data_entity', d, 'access'), ('application', a, 'infra_asset', i, 'assignment'), ('service', s, 'process', pr, 'association');

    -- serving: penyedia = aplikasi, yang bergantung = layanan
    IF NOT EXISTS (SELECT 1 FROM eaw.dependency_edge WHERE provider_id = a AND dependent_id = s AND tipe = 'serving') THEN RAISE EXCEPTION 'serving: layanan bergantung pada aplikasi'; END IF;
    -- access & assignment: aplikasi bergantung pada data / infrastruktur
    IF NOT EXISTS (SELECT 1 FROM eaw.dependency_edge WHERE provider_id = d AND dependent_id = a AND tipe = 'access') THEN RAISE EXCEPTION 'access: aplikasi bergantung pada data'; END IF;
    IF NOT EXISTS (SELECT 1 FROM eaw.dependency_edge WHERE provider_id = i AND dependent_id = a AND tipe = 'assignment') THEN RAISE EXCEPTION 'assignment: aplikasi bergantung pada infrastruktur'; END IF;
    -- association: simetris (dua baris)
    SELECT count(*) INTO n FROM eaw.dependency_edge WHERE tipe = 'association';
    IF n <> 2 THEN RAISE EXCEPTION 'association harus dua arah, ditemukan %', n; END IF;
    -- hapus lunak relasi menghilangkannya dari view
    UPDATE eaw.relation SET deleted_at = now() WHERE tipe = 'association';
    SELECT count(*) INTO n FROM eaw.dependency_edge WHERE tipe = 'association'; IF n <> 0 THEN RAISE EXCEPTION 'relasi terhapus tidak dihitung'; END IF;
    -- RLS invoker: entitas lain tidak melihat ketergantungan Aspal; Auditor (lihat-semua) melihat
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_t'));
    SELECT count(*) INTO n FROM eaw.dependency_edge; IF n <> 0 THEN RAISE EXCEPTION 'ketergantungan entitas lain bocor'; END IF;
    PERFORM pg_temp.as_user(pg_temp.fx('u_aud'));
    SELECT count(*) INTO n FROM eaw.dependency_edge; IF n <> 3 THEN RAISE EXCEPTION 'Auditor melihat 3 ketergantungan, ditemukan %', n; END IF;
END $$;
ROLLBACK;
