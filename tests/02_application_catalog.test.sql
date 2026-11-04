-- =====================================================================
-- 02_application_catalog.test.sql : katalog aplikasi (APM, EAW-02) — metadata wajib, constraint, penjaga status, RLS tulis
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE a uuid; w uuid; n int; v_ver int; st text;
BEGIN
    PERFORM pg_temp.fx_world();
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));

    -- 1) platform dibentuk Enterprise Application Architect (eaw.platform.write); SBU Architect ditolak
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, entity_id)
        VALUES ('PLAT-S','S','umum','b','t','low','s',%L)$f$, pg_temp.fx('aspal')), '42501', 'SBU Architect tidak boleh membuat platform');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, entity_id)
    VALUES ('PLAT-A', 'Platform A', 'umum', 'Direktur Bisnis', 'Tim Platform', 'low', '99.5% / bulan', pg_temp.fx('aspal')) RETURNING id INTO a;
    SELECT status, row_version INTO st, v_ver FROM eaw.application WHERE id = a;
    IF st <> 'Draf' THEN RAISE EXCEPTION 'status awal harus Draf, bukan %', st; END IF;
    IF (SELECT jenis_node FROM eaw.application WHERE id = a) <> 'platform' THEN RAISE EXCEPTION 'jenis_node turunan platform NULL harus platform'; END IF;
    IF (SELECT created_by FROM eaw.application WHERE id = a) IS DISTINCT FROM pg_temp.fx('u_app') THEN RAISE EXCEPTION 'created_by harus pengguna sesi'; END IF;

    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    -- 2) di luar cakupan entitas: ditolak RLS (SBU Toyota bukan miliknya)
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, jenis_node, owner_bisnis, owner_teknis, risiko_ai, slo, entity_id)
        VALUES ('WS-X', 'X', 'umum', 'workspace', 'a', 'b', 'low', 's', %L)$f$, pg_temp.fx('toyota')), '42501', 'tulis di entitas lain');

    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    -- 3) 4 metadata wajib (Pemilik Bisnis, Tim Pengembang, Risiko AI, SLO): kosong/NULL ditolak
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, owner_teknis, risiko_ai, slo, entity_id) VALUES ('M1','M','umum','t','low','s',%L)$f$, pg_temp.fx('aspal')), '23502', 'tanpa owner_bisnis');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, risiko_ai, slo, entity_id) VALUES ('M2','M','umum','b','low','s',%L)$f$, pg_temp.fx('aspal')), '23502', 'tanpa owner_teknis (Tim Pengembang)');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, slo, entity_id) VALUES ('M3','M','umum','b','t','s',%L)$f$, pg_temp.fx('aspal')), '23502', 'tanpa risiko_ai');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, entity_id) VALUES ('M4','M','umum','b','t','low',%L)$f$, pg_temp.fx('aspal')), '23502', 'tanpa slo');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, entity_id) VALUES ('M5','M','umum','  ','t','low','s',%L)$f$, pg_temp.fx('aspal')), '23514', 'owner_bisnis hanya spasi');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, entity_id) VALUES ('M6','M','umum','b','t','tinggi-sekali','s',%L)$f$, pg_temp.fx('aspal')), '23514', 'risiko_ai tidak valid');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, entity_id) VALUES ('m7','M','umum','b','t','low','s',%L)$f$, pg_temp.fx('aspal')), '23514', 'kode harus huruf besar (business_code)');

    -- 4) mode workspace: FEDERATED_REMOTE wajib federation_scope + remote_entry_url
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, workspace_mode, entity_id)
        VALUES ('FED1','F','khusus','b','t','low','s','FEDERATED_REMOTE',%L)$f$, pg_temp.fx('aspal')), '23514', 'federated tanpa scope/url');
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    -- SBU Architect tidak dapat menempatkan workspace ke platform; Application Architect dapat
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, platform, entity_id)
        VALUES ('WS-S','W','umum','b','t','low','s','PLAT-A',%L)$f$, pg_temp.fx('aspal')), '42501', 'SBU tidak menempatkan workspace');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, workspace_mode, federation_scope, remote_entry_url, platform, workspace, entity_id)
    VALUES ('FED2', 'Federated', 'khusus', 'b', 't', 'low', 's', 'FEDERATED_REMOTE', 'fed2', 'https://eap.example/fed2/remoteEntry.js', 'PLAT-A', 'fed2', pg_temp.fx('aspal')) RETURNING id INTO w;

    -- 5) platform induk wajib terdaftar sebagai platform; tidak boleh induk dirinya sendiri; kode unik
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, platform, entity_id)
        VALUES ('WS1','W','umum','b','t','low','s','TIDAK-ADA',%L)$f$, pg_temp.fx('aspal')), '23503', 'platform induk tak terdaftar');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, platform, entity_id)
        VALUES ('WS2','W','umum','b','t','low','s','FED2',%L)$f$, pg_temp.fx('aspal')), '23503', 'induk harus platform (bukan workspace)');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, platform, entity_id)
        VALUES ('SELF','W','umum','b','t','low','s','SELF',%L)$f$, pg_temp.fx('aspal')), '23503', 'induk dirinya sendiri (belum ada sebagai platform)');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, entity_id)
        VALUES ('PLAT-A','Duplikat','umum','b','t','low','s',%L)$f$, pg_temp.fx('aspal')), '23505', 'kode ganda');

    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    -- 6) penjaga status AF-05: tidak bisa lahir bukan-Draf, tidak bisa mengubah status langsung
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis_node, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, status, entity_id)
        VALUES ('LHR','L', 'workspace', 'umum','b','t','low','s','Dipublikasi',%L)$f$, pg_temp.fx('aspal')), '23514', 'lahir sebagai Dipublikasi');
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.application SET status = 'Dipublikasi' WHERE id = %L$f$, a), '42501', 'ubah status langsung');

    -- 7) sunting objek Draf: boleh, versi baris bertambah, jejak audit tercatat
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.application SET nama = 'x' WHERE id = %L$f$, a), '42501', 'SBU tidak mengubah platform');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    UPDATE eaw.application SET nama = 'Platform A (rev)', kritikalitas = 'high' WHERE id = a;
    SELECT count(*) INTO n FROM eaw.application WHERE id = a AND nama = 'Platform A (rev)' AND row_version = v_ver + 1;
    IF n <> 1 THEN RAISE EXCEPTION 'sunting Draf harus menaikkan row_version'; END IF;

    PERFORM pg_temp.as_owner();
    SELECT count(*) INTO n FROM shared.audit_logs WHERE table_schema = 'eaw' AND table_name = 'application' AND record_id = a;
    IF n < 2 THEN RAISE EXCEPTION 'audit_logs harus mencatat insert + update aplikasi (ditemukan %)', n; END IF;
    IF NOT EXISTS (SELECT 1 FROM shared.audit_logs WHERE table_name = 'application' AND record_id = a AND action = 'insert' AND changed_by = pg_temp.fx('u_app')) THEN
        RAISE EXCEPTION 'audit harus mencatat pelaku (changed_by)';
    END IF;
END $$;
ROLLBACK;
