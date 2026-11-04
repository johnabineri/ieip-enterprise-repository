-- =====================================================================
-- 11_console.test.sql : CONSOLE — register AI (D-05), metering token, EIO, kill-switch, snapshot IKA
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE sec uuid; m_cloud uuid; m_onp uuid; n int; c numeric;
BEGIN
    PERFORM pg_temp.fx_world();
    sec := pg_temp.fx('u_sec');

    -- 1) izin: SBU hanya membaca register; Security Architect mengelola
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    PERFORM pg_temp.expect_error($f$INSERT INTO console.ai_model (kode, nama, lokasi, klasifikasi_maks) VALUES ('x', 'X', 'cloud', 'publik')$f$, '42501', 'SBU tidak mengelola register');
    PERFORM pg_temp.as_user(pg_temp.fx('u_emp'));
    SELECT count(*) INTO n FROM console.ai_model; IF n <> 0 THEN RAISE EXCEPTION 'tanpa izin tidak melihat register'; END IF;
    PERFORM pg_temp.as_user(sec);

    -- 2) D-05: cloud tidak boleh klasifikasi terbatas/rahasia; dataset sensitif wajib model on-prem
    PERFORM pg_temp.expect_error($f$INSERT INTO console.ai_model (kode, nama, lokasi, klasifikasi_maks) VALUES ('gpt-x', 'GPT X', 'cloud', 'rahasia')$f$, '23514', 'cloud memproses data rahasia');
    INSERT INTO console.ai_model (kode, nama, lokasi, klasifikasi_maks, harga_in_per_1k, harga_out_per_1k) VALUES ('cloud-llm', 'Cloud LLM', 'cloud', 'internal', 10, 30) RETURNING id INTO m_cloud;
    INSERT INTO console.ai_model (kode, nama, lokasi, klasifikasi_maks, status) VALUES ('llama-3.3-70b', 'Llama 3.3 70B', 'on-prem', 'rahasia', 'aktif') RETURNING id INTO m_onp;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.rag_dataset (nama, store, klasifikasi, model_id) VALUES ('Dokumen HR', 'pgvector', 'rahasia', %L)$f$, m_cloud), '23514', 'dataset rahasia + model cloud');
    PERFORM pg_temp.expect_error($f$INSERT INTO console.rag_dataset (nama, store, klasifikasi, pii) VALUES ('Tanpa model', 'qdrant', 'internal', true)$f$, '23514', 'dataset PII tanpa model');
    INSERT INTO console.rag_dataset (nama, store, klasifikasi, pii, model_id) VALUES ('Dokumen HR', 'pgvector', 'rahasia', true, m_onp);
    INSERT INTO console.rag_dataset (nama, store, klasifikasi, model_id) VALUES ('Katalog publik', 'qdrant', 'publik', m_cloud);
    PERFORM pg_temp.expect_error(format($f$UPDATE console.ai_model SET lokasi = 'cloud', klasifikasi_maks = 'internal' WHERE id = %L$f$, m_onp), '23514', 'memindah model ber-dataset sensitif ke cloud');
    PERFORM pg_temp.expect_error($f$INSERT INTO console.ai_model (kode, nama, lokasi, klasifikasi_maks) VALUES ('cloud-llm', 'Dup', 'cloud', 'publik')$f$, '23505', 'kode ganda');

    -- 3) metering token: biaya dihitung DB dari harga model; append-only; pengguna tak dapat memalsukan pelaku
    INSERT INTO console.token_usage (model_name, workspace, user_id, prompt_tokens, completion_tokens, cost_idr) VALUES ('cloud-llm', 'req', sec, 2000, 1000, 999999);
    SELECT cost_idr INTO c FROM console.token_usage; IF c <> 50.00 THEN RAISE EXCEPTION 'biaya = (2000*10 + 1000*30)/1000 = 50, bukan %', c; END IF;
    IF (SELECT model_id FROM console.token_usage) IS DISTINCT FROM m_cloud THEN RAISE EXCEPTION 'model_id terisi dari kode model'; END IF;
    INSERT INTO console.token_usage (model_name, workspace, user_id, prompt_tokens, completion_tokens) VALUES ('model-tak-terdaftar', 'req', sec, 10, 10);
    IF (SELECT cost_idr FROM console.token_usage WHERE model_name = 'model-tak-terdaftar') <> 0 THEN RAISE EXCEPTION 'model tak terdaftar: biaya 0'; END IF;
    PERFORM pg_temp.expect_error($f$UPDATE console.token_usage SET cost_idr = 0$f$, '42501', 'metering append-only');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.token_usage (model_name, workspace, user_id, prompt_tokens, completion_tokens) VALUES ('cloud-llm', 'req', %L, 1, 1)$f$, pg_temp.fx('u_sbu_a')), '42501', 'memalsukan pelaku');
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    SELECT count(*) INTO n FROM console.token_usage; IF n <> 0 THEN RAISE EXCEPTION 'pengguna biasa hanya melihat pemakaiannya sendiri'; END IF;
    PERFORM pg_temp.as_user(pg_temp.fx('u_aud'));
    SELECT count(*) INTO n FROM console.token_usage; IF n <> 2 THEN RAISE EXCEPTION 'Auditor (console.finops.read) melihat seluruh metering'; END IF;
    PERFORM pg_temp.expect_error($f$INSERT INTO console.provider_invoice (periode, model_name, billed_tokens, billed_idr) VALUES ('2026-11-01', 'cloud-llm', 1, 1)$f$, '42501', 'Auditor tidak menulis faktur');
    PERFORM pg_temp.as_user(sec);
    INSERT INTO console.provider_invoice (periode, model_name, billed_tokens, billed_idr) VALUES ('2026-11-01', 'cloud-llm', 3000, 50);
    PERFORM pg_temp.expect_error($f$INSERT INTO console.provider_invoice (periode, model_name, billed_tokens, billed_idr) VALUES ('2026-11-15', 'cloud-llm', 1, 1)$f$, '23514', 'periode harus awal bulan');
    PERFORM pg_temp.expect_error($f$INSERT INTO console.provider_invoice (periode, model_name, billed_tokens, billed_idr) VALUES ('2026-11-01', 'cloud-llm', 1, 1)$f$, '23505', 'faktur ganda per bulan+model');

    -- 4) EIO: hanya console.eio.write; URL wajib http(s)
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO console.eio_connector (kode, nama, sumber, target, health_url, spec_url) VALUES ('ASI-SEDDI', 'ASI -> SEDDI', 'ASI', 'SEDDI', 'http://x/health', 'http://x/openapi.json');
    PERFORM pg_temp.expect_error($f$INSERT INTO console.eio_connector (kode, nama, sumber, target, health_url) VALUES ('BAD', 'B', 'a', 'b', 'ftp://x')$f$, '23514', 'URL bukan http(s)');
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    SELECT count(*) INTO n FROM console.eio_connector; IF n <> 1 THEN RAISE EXCEPTION 'SBU (dashboard.read) melihat konektor'; END IF;
    UPDATE console.eio_connector SET status = 'up';
    GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'baris tidak terubah oleh SBU'; END IF;

    -- 5) kill-switch: hanya console.security.admin; dibaca mesin lewat console.agent_enabled
    IF NOT console.agent_enabled('req-llm') OR NOT console.agent_enabled('kode-tak-ada') THEN RAISE EXCEPTION 'saklar bawaan aktif'; END IF;
    UPDATE console.agent_switch SET enabled = false WHERE kode = 'req-llm';
    GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'SBU tidak mematikan agen'; END IF;
    PERFORM pg_temp.as_user(sec);
    UPDATE console.agent_switch SET enabled = false, reason = 'uji kill-switch' WHERE kode = 'req-llm';
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    IF console.agent_enabled('req-llm') THEN RAISE EXCEPTION 'req-llm harus nonaktif (definer, terlihat semua)'; END IF;
    PERFORM pg_temp.as_user(sec);
    PERFORM pg_temp.expect_error($f$DELETE FROM console.agent_switch$f$, '42501', 'saklar tidak dihapus via app');
    UPDATE console.agent_switch SET enabled = true WHERE kode = 'req-llm';

    -- 6) snapshot IKA: hanya console.dashboard.write
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.ika_snapshot (entity_id, level, domain_levels, objects) VALUES (%L, 2, '{}', 3)$f$, pg_temp.fx('aspal')), '42501', 'SBU tidak membuat snapshot');
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    INSERT INTO console.ika_snapshot (entity_id, level, domain_levels, objects) VALUES (pg_temp.fx('aspal'), 2, '{"aplikasi":2}', 3);
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.ika_snapshot (entity_id, level, domain_levels, objects) VALUES (%L, 2, '{}', 3)$f$, pg_temp.fx('aspal')), '23505', 'satu snapshot per entitas per hari');
END $$;
ROLLBACK;
