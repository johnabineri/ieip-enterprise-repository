-- =====================================================================
-- 09_gse.test.sql : GSE — gerbang AF-06, hak akses, append-only, 0 push ke main, validasi Saga/Agent (GSE-01..03)
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE kra uuid; a_draf uuid; a_val uuid; dev uuid; tpl uuid; p uuid; f uuid; g record; n int;
BEGIN
    PERFORM pg_temp.fx_world();
    kra := pg_temp.fx_kra('KRA-GSE');
    dev := pg_temp.fx_user('u_dev', ARRAY[['ROLE_EAP_GSE_DEVELOPER', '']]);
    SELECT id INTO tpl FROM gse.template WHERE kode = 'tpl-remote-spa';
    IF tpl IS NULL THEN RAISE EXCEPTION 'seed template GSE harus ada'; END IF;

    -- dua aplikasi: satu Draf, satu Divalidasi
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, ui_standard, tech_stack, referensi_id, entity_id)
    VALUES ('GSE-DRAF', 'Aplikasi Draf', 'umum', 'b', 't', 'low', 's', 'ui', 'stack', kra, pg_temp.fx('hold')) RETURNING id INTO a_draf;
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, ui_standard, tech_stack, referensi_id, entity_id)
    VALUES ('GSE-VAL', 'Aplikasi Divalidasi', 'umum', 'b', 't', 'low', 's', 'ui', 'stack', kra, pg_temp.fx('hold')) RETURNING id INTO a_val;
    PERFORM pg_temp.fx_complete(a_val);
    PERFORM eaw.transition('application', a_val, 'Divalidasi');

    -- 1) hak akses: SBU hanya membaca; tidak menjalankan; pengembang (tanpa cakupan entitas) tidak melihat Draf lewat RLS tetapi gerbang membacanya
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    SELECT count(*) INTO n FROM gse.template; IF n < 7 THEN RAISE EXCEPTION 'SBU (gse.project.read) melihat template'; END IF;
    PERFORM pg_temp.expect_error($f$SELECT * FROM gse.app_gate(gen_random_uuid())$f$, '42501', 'SBU tidak menjalankan scaffolding');
    PERFORM pg_temp.expect_error($f$INSERT INTO gse.template (kode, nama, kategori) VALUES ('tpl-x', 'X', 'ci')$f$, '42501', 'SBU tidak menulis template');
    PERFORM pg_temp.as_user(pg_temp.fx('u_emp'));
    SELECT count(*) INTO n FROM gse.template; IF n <> 0 THEN RAISE EXCEPTION 'tanpa izin gse tidak melihat template'; END IF;
    PERFORM pg_temp.expect_error($f$SELECT * FROM gse.app_catalog()$f$, '42501', 'katalog aplikasi GSE tanpa izin');

    -- 2) gerbang AF-06
    PERFORM pg_temp.as_user(dev);
    IF (SELECT count(*) FROM eaw.application) <> 0 THEN RAISE EXCEPTION 'pengembang tanpa cakupan tidak melihat aplikasi non-Dipublikasi via RLS'; END IF;
    SELECT * INTO g FROM gse.app_gate(a_draf);
    IF g.ok OR g.reason NOT LIKE 'AF-06:%Draf%' THEN RAISE EXCEPTION 'aplikasi Draf harus diblokir AF-06: %', g; END IF;
    SELECT * INTO g FROM gse.app_gate(a_val);
    IF NOT g.ok OR g.kode <> 'GSE-VAL' THEN RAISE EXCEPTION 'aplikasi Divalidasi lolos gerbang: %', g; END IF;
    SELECT * INTO g FROM gse.app_gate(gen_random_uuid());
    IF g.found OR g.ok THEN RAISE EXCEPTION 'aplikasi tidak terdaftar ditolak'; END IF;
    IF (SELECT count(*) FROM gse.app_catalog()) <> 2 OR (SELECT count(*) FROM gse.app_catalog() WHERE ok) <> 1 THEN RAISE EXCEPTION 'app_catalog: 2 aplikasi, 1 lolos gerbang'; END IF;

    -- 3) proyek: Draf tidak dapat dibuat (trigger); blocked tercatat dengan alasan; main ditolak; append-only
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.project (application_id, kode, branch, status) VALUES (%L, 'GSE-DRAF', 'feat/x', 'generated')$f$, a_draf), '23514', 'AF-06 trigger: generate untuk Draf');
    INSERT INTO gse.project (application_id, kode, branch, status, reason) VALUES (a_draf, 'GSE-DRAF', 'feat/gse-gse-draf-scaffold', 'blocked', 'AF-06: GSE-DRAF berstatus Draf');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.project (application_id, kode, branch, status) VALUES (%L, 'GSE-VAL', 'main', 'generated')$f$, a_val), '23514', 'push langsung ke main');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.project (application_id, kode, branch, status) VALUES (%L, 'GSE-VAL', 'feat/y', 'blocked')$f$, a_val), '23514', 'blocked wajib beralasan');
    INSERT INTO gse.project (application_id, kode, template_ids, backend, branch, status, gates, file_count, bytes, duration_ms)
    VALUES (a_val, 'GSE-VAL', ARRAY[tpl], 'nestjs', 'feat/gse-gse-val-scaffold', 'generated', '{"pii-guard":{"status":"ok"}}', 1, 10, 120) RETURNING id INTO p;
    INSERT INTO gse.project_file (project_id, path, content, bytes) VALUES (p, 'a.txt', 'isi', 3);
    PERFORM pg_temp.expect_error(format($f$UPDATE gse.project SET status = 'checks-failed' WHERE id = %L$f$, p), '42501', 'proyek append-only');
    PERFORM pg_temp.expect_error(format($f$DELETE FROM gse.project_file WHERE project_id = %L$f$, p), '42501', 'berkas append-only');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.project_file (project_id, path, content, bytes) VALUES (%L, 'a.txt', 'dup', 3)$f$, p), '23505', 'path ganda');
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    IF (SELECT count(*) FROM gse.project) <> 2 THEN RAISE EXCEPTION 'SBU (read) melihat 2 proyek'; END IF;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.project (application_id, kode, branch, status) VALUES (%L, 'GSE-VAL', 'feat/z', 'generated')$f$, a_val), '42501', 'SBU tidak membuat proyek');

    -- 4) Saga: langkah pemutasi wajib kompensasi + idempotencyKey; notify (mutates=false) bebas
    PERFORM pg_temp.as_user(dev);
    PERFORM pg_temp.expect_error($f$INSERT INTO gse.flow (nama, kind, spec, status) VALUES ('Bad', 'saga', '{"steps":[{"name":"chargePayment","service":"FIA","idempotencyKey":"${order_id}"}]}', 'committed')$f$, '23514', 'langkah tanpa kompensasi tidak dapat di-commit');
    INSERT INTO gse.flow (nama, kind, spec) VALUES ('SalesOrderSaga', 'saga', '{"steps":[
        {"name":"reserveStock","service":"FLOW","compensation":"releaseStock","idempotencyKey":"${order_id}"},
        {"name":"chargePayment","service":"FIA","idempotencyKey":"${order_id}"},
        {"name":"notifyCustomer","service":"CORTEX","mutates":false}]}') RETURNING id INTO f;
    IF (SELECT valid FROM gse.flow WHERE id = f) THEN RAISE EXCEPTION 'draft tidak valid harus valid=false'; END IF;
    IF (SELECT problems::text FROM gse.flow WHERE id = f) NOT LIKE '%chargePayment%kompensasi%' THEN RAISE EXCEPTION 'problems menyebut langkah'; END IF;
    UPDATE gse.flow SET spec = jsonb_set(spec, '{steps,1,compensation}', '"refundPayment"') WHERE id = f;
    IF NOT (SELECT valid FROM gse.flow WHERE id = f) THEN RAISE EXCEPTION 'setelah dilengkapi harus valid'; END IF;
    UPDATE gse.flow SET status = 'committed' WHERE id = f;
    -- 5) Agent: otonomi maksimum L3, guardrail fail-closed
    PERFORM pg_temp.expect_error($f$INSERT INTO gse.flow (nama, kind, spec, status) VALUES ('Agen L4', 'agent', '{"autonomy":"L4","tools":[],"guardrails":{"fail_mode":"closed"}}', 'committed')$f$, '23514', 'otonomi > L3');
    PERFORM pg_temp.expect_error($f$INSERT INTO gse.flow (nama, kind, spec, status) VALUES ('Agen open', 'agent', '{"autonomy":"L2","tools":[],"guardrails":{"fail_mode":"open"}}', 'committed')$f$, '23514', 'fail-open ditolak');
    INSERT INTO gse.flow (nama, kind, spec, status) VALUES ('Agen ok', 'agent', '{"autonomy":"L3","tools":["eaw.read"],"guardrails":{"fail_mode":"closed"}}', 'committed');
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    PERFORM pg_temp.expect_error($f$INSERT INTO gse.flow (nama, kind, spec) VALUES ('X', 'saga', '{}')$f$, '42501', 'SBU tidak menulis flow');
END $$;
ROLLBACK;
