-- =====================================================================
-- 23_gse_saga.test.sql : GSE-03 — jejak eksekutor saga ringan (299_gse_saga.sql)
--   a) run hanya untuk flow saga committed & valid; snapshot spec/nama/versi + started_by diisi DB; perubahan flow tidak mengubah run
--   b) aksi berurutan; kompensasi hanya saat compensating, hanya untuk langkah pemutasi yang aksinya sukses; satu 'ok' per (langkah, fase)
--   c) mesin status: completed wajib semua langkah ok; compensated wajib kompensasi lengkap; failed wajib error; terminal tak dapat diubah
--   d) snapshot tidak dapat diubah; run tidak dapat dihapus; langkah append-only; run_key unik per flow
--   e) hak: read melihat, tidak menulis; tanpa izin tidak melihat
--   f) outbox: perubahan status terbit (tanpa input), perpanjangan lease tidak
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE dev uuid; f uuid; fd uuid; fa uuid; r1 uuid; r2 uuid; r3 uuid; n int; v record; ev jsonb;
BEGIN
    PERFORM pg_temp.fx_world();
    dev := pg_temp.fx_user('u_dev', ARRAY[['ROLE_EAP_GSE_DEVELOPER', '']]);
    PERFORM pg_temp.as_user(dev);
    INSERT INTO gse.flow (nama, kind, spec, status) VALUES ('SagaUji', 'saga', '{"steps":[
        {"name":"reserveStock","service":"FLOW","compensation":"releaseStock","idempotencyKey":"${order_id}"},
        {"name":"notifyCustomer","service":"CORTEX","mutates":false},
        {"name":"chargePayment","service":"FIA","compensation":"refundPayment","idempotencyKey":"${order_id}"}]}', 'committed') RETURNING id INTO f;
    INSERT INTO gse.flow (nama, kind, spec) VALUES ('SagaDraf', 'saga', '{"steps":[{"name":"x","service":"S","mutates":false}]}') RETURNING id INTO fd;
    INSERT INTO gse.flow (nama, kind, spec, status) VALUES ('AgenUji', 'agent', '{"autonomy":"L2","tools":[],"guardrails":{"fail_mode":"closed"}}', 'committed') RETURNING id INTO fa;

    -- a) hanya saga committed
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.saga_run (flow_id, mode) VALUES (%L, 'simulate')$f$, fd), '23514', 'flow draft tidak dapat dijalankan');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.saga_run (flow_id, mode) VALUES (%L, 'simulate')$f$, fa), '23514', 'flow agent tidak dapat dijalankan');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.saga_run (flow_id, mode, status) VALUES (%L, 'simulate', 'completed')$f$, f), '23514', 'run baru wajib running');
    INSERT INTO gse.saga_run (flow_id, mode, input, run_key, spec, flow_nama) VALUES (f, 'simulate', '{"order_id":"SO-1"}', 'k-1', '{"palsu":true}', 'palsu') RETURNING id INTO r1;
    SELECT * INTO v FROM gse.saga_run WHERE id = r1;
    IF v.flow_nama <> 'SagaUji' OR jsonb_array_length(v.spec->'steps') <> 3 OR v.started_by <> dev OR v.flow_version < 1 THEN
        RAISE EXCEPTION 'snapshot run diisi DB dari flow (nama/spec/versi/started_by), bukan dari klien: %', row_to_json(v);
    END IF;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.saga_run (flow_id, mode, run_key) VALUES (%L, 'simulate', 'k-1')$f$, f), '23505', 'run_key unik per flow');
    UPDATE gse.flow SET spec = '{"steps":[{"name":"lain","service":"S","mutates":false}]}' , status = 'draft' WHERE id = f;    -- (seperti PATCH API) flow kembali draft; run tetap memakai snapshot
    IF (SELECT spec->'steps'->0->>'name' FROM gse.saga_run WHERE id = r1) <> 'reserveStock' THEN RAISE EXCEPTION 'perubahan flow tidak boleh mengubah run'; END IF;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.saga_run (flow_id, mode) VALUES (%L, 'simulate')$f$, f), '23514', 'flow yang kembali draft tidak dapat dijalankan');

    -- b) urutan aksi
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.saga_step (run_id, seq, step, phase, action, service, status) VALUES (%L, 1, 'notifyCustomer', 'action', '', '', 'ok')$f$, r1), '23514', 'langkah 1 sebelum langkah 0');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.saga_step (run_id, seq, step, phase, action, service, status) VALUES (%L, 0, 'salah', 'action', '', '', 'ok')$f$, r1), '23514', 'nama langkah harus sesuai spec');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.saga_step (run_id, seq, step, phase, action, service, status) VALUES (%L, 0, 'reserveStock', 'compensation', '', '', 'ok')$f$, r1), '23514', 'kompensasi saat running');
    INSERT INTO gse.saga_step (run_id, seq, step, phase, action, service, status, attempt) VALUES (r1, 0, 'reserveStock', 'action', 'dipalsukan', 'X', 'failed', 1);
    INSERT INTO gse.saga_step (run_id, seq, step, phase, action, service, status, attempt) VALUES (r1, 0, 'reserveStock', 'action', '', '', 'ok', 2);
    IF (SELECT action || '/' || service FROM gse.saga_step WHERE run_id = r1 AND attempt = 1) <> 'reserveStock/FLOW' THEN RAISE EXCEPTION 'action/service diisi dari snapshot'; END IF;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.saga_step (run_id, seq, step, phase, action, service, status, attempt) VALUES (%L, 0, 'reserveStock', 'action', '', '', 'ok', 3)$f$, r1), '23505', 'satu ok per langkah');
    -- c) completed belum boleh (1 dari 3)
    PERFORM pg_temp.expect_error(format($f$UPDATE gse.saga_run SET status = 'completed' WHERE id = %L$f$, r1), '23514', 'completed sebelum semua langkah sukses');
    PERFORM pg_temp.expect_error(format($f$UPDATE gse.saga_run SET status = 'compensated' WHERE id = %L$f$, r1), '23514', 'running → compensated tidak sah');
    INSERT INTO gse.saga_step (run_id, seq, step, phase, action, service, status) VALUES (r1, 1, 'notifyCustomer', 'action', '', '', 'ok');
    INSERT INTO gse.saga_step (run_id, seq, step, phase, action, service, status) VALUES (r1, 2, 'chargePayment', 'action', '', '', 'failed');
    -- langkah 2 gagal → kompensasi
    UPDATE gse.saga_run SET status = 'compensating', failed_step = 'chargePayment', error = 'HTTP 500' WHERE id = r1;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.saga_step (run_id, seq, step, phase, action, service, status) VALUES (%L, 2, 'chargePayment', 'action', '', '', 'ok')$f$, r1), '23514', 'aksi setelah compensating');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.saga_step (run_id, seq, step, phase, action, service, status) VALUES (%L, 2, 'chargePayment', 'compensation', '', '', 'ok')$f$, r1), '23514', 'kompensasi langkah yang tidak sukses');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.saga_step (run_id, seq, step, phase, action, service, status) VALUES (%L, 1, 'notifyCustomer', 'compensation', '', '', 'ok')$f$, r1), '23514', 'kompensasi langkah non-pemutasi');
    PERFORM pg_temp.expect_error(format($f$UPDATE gse.saga_run SET status = 'compensated' WHERE id = %L$f$, r1), '23514', 'compensated sebelum kompensasi lengkap');
    PERFORM pg_temp.expect_error(format($f$UPDATE gse.saga_run SET status = 'failed', error = NULL WHERE id = %L$f$, r1), '23514', 'failed tanpa error');
    INSERT INTO gse.saga_step (run_id, seq, step, phase, action, service, status) VALUES (r1, 0, 'reserveStock', 'compensation', '', '', 'ok');
    IF (SELECT action FROM gse.saga_step WHERE run_id = r1 AND phase = 'compensation') <> 'releaseStock' THEN RAISE EXCEPTION 'aksi kompensasi dari spec'; END IF;
    UPDATE gse.saga_run SET status = 'compensated' WHERE id = r1;
    IF (SELECT finished_at FROM gse.saga_run WHERE id = r1) IS NULL THEN RAISE EXCEPTION 'finished_at diisi saat terminal'; END IF;
    PERFORM pg_temp.expect_error(format($f$UPDATE gse.saga_run SET lease_until = now() WHERE id = %L$f$, r1), '23514', 'run terminal tidak dapat diubah');

    -- run yang sukses
    UPDATE gse.flow SET spec = '{"steps":[{"name":"a","service":"S","compensation":"undoA","idempotencyKey":"${k}"},{"name":"b","service":"S","mutates":false}]}', status = 'committed' WHERE id = f;
    INSERT INTO gse.saga_run (flow_id, mode, input) VALUES (f, 'live', '{"k":"1"}') RETURNING id INTO r2;
    -- d) snapshot tak dapat diubah
    PERFORM pg_temp.expect_error(format($f$UPDATE gse.saga_run SET input = '{"k":"2"}' WHERE id = %L$f$, r2), '23514', 'input tak dapat diubah');
    PERFORM pg_temp.expect_error(format($f$UPDATE gse.saga_run SET spec = '{}' WHERE id = %L$f$, r2), '23514', 'spec tak dapat diubah');
    PERFORM pg_temp.expect_error(format($f$UPDATE gse.saga_run SET mode = 'simulate' WHERE id = %L$f$, r2), '23514', 'mode tak dapat diubah');
    INSERT INTO gse.saga_step (run_id, seq, step, phase, action, service, status) VALUES (r2, 0, 'a', 'action', '', '', 'ok'), (r2, 1, 'b', 'action', '', '', 'ok');
    UPDATE gse.saga_run SET status = 'completed' WHERE id = r2;
    PERFORM pg_temp.expect_error(format($f$UPDATE gse.saga_step SET status = 'failed' WHERE run_id = %L$f$, r2), '42501', 'langkah append-only (update)');
    PERFORM pg_temp.expect_error(format($f$DELETE FROM gse.saga_step WHERE run_id = %L$f$, r2), '42501', 'langkah append-only (delete)');
    PERFORM pg_temp.expect_error(format($f$DELETE FROM gse.saga_run WHERE id = %L$f$, r2), '42501', 'run tidak dapat dihapus');

    -- run gagal kompensasi → failed (wajib error)
    INSERT INTO gse.saga_run (flow_id, mode, input) VALUES (f, 'simulate', '{"k":"3"}') RETURNING id INTO r3;
    INSERT INTO gse.saga_step (run_id, seq, step, phase, action, service, status) VALUES (r3, 0, 'a', 'action', '', '', 'ok'), (r3, 1, 'b', 'action', '', '', 'failed');
    UPDATE gse.saga_run SET status = 'compensating', failed_step = 'b', error = 'x' WHERE id = r3;
    UPDATE gse.saga_run SET lease_until = now() + interval '1 hour' WHERE id = r3;                  -- perpanjangan lease
    INSERT INTO gse.saga_step (run_id, seq, step, phase, action, service, status) VALUES (r3, 0, 'a', 'compensation', '', '', 'failed');
    UPDATE gse.saga_run SET status = 'failed', error = 'kompensasi undoA gagal' WHERE id = r3;
    PERFORM pg_temp.expect_error(format($f$UPDATE gse.saga_run SET status = 'compensated' WHERE id = %L$f$, r3), '23514', 'failed terminal');

    -- f) outbox: r3 = insert + compensating + failed (lease tidak terbit); payload tanpa input/error
    PERFORM pg_temp.as_owner();
    SELECT count(*) INTO n FROM shared.outbox WHERE aggregate_type = 'saga_run' AND aggregate_id = r3;
    IF n <> 3 THEN RAISE EXCEPTION 'outbox saga_run: diharapkan 3 peristiwa (insert, compensating, failed), ditemukan %', n; END IF;
    SELECT payload INTO ev FROM shared.outbox WHERE aggregate_type = 'saga_run' AND aggregate_id = r3 ORDER BY id DESC LIMIT 1;
    IF ev::text LIKE '%"input"%' OR ev::text LIKE '%kompensasi undoA%' THEN RAISE EXCEPTION 'payload outbox tidak memuat input/error: %', ev; END IF;
    IF ev #>> '{changes,status,to}' IS DISTINCT FROM 'failed' AND ev->>'status' IS DISTINCT FROM 'failed' THEN RAISE EXCEPTION 'payload memuat status: %', ev; END IF;

    -- e) hak
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    SELECT count(*) INTO n FROM gse.saga_run; IF n < 3 THEN RAISE EXCEPTION 'pemegang gse.project.read melihat run (%)', n; END IF;
    SELECT count(*) INTO n FROM gse.saga_step; IF n = 0 THEN RAISE EXCEPTION 'pemegang read melihat langkah'; END IF;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.saga_run (flow_id, mode) VALUES (%L, 'simulate')$f$, f), '42501', 'read tidak menjalankan saga');
    UPDATE gse.saga_run SET lease_until = now() WHERE id = r2;                                       -- RLS: 0 baris, tanpa galat
    PERFORM pg_temp.as_owner();
    PERFORM pg_temp.as_user(pg_temp.fx_user('u_nobody'));
    SELECT count(*) INTO n FROM gse.saga_run; IF n <> 0 THEN RAISE EXCEPTION 'tanpa izin tidak melihat run'; END IF;
END $$;
ROLLBACK;
