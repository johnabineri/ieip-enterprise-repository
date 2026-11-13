-- =====================================================================
-- 24_eio_mediation.test.sql : EIO-01..03 — definisi & jejak mediasi (300_eio_mediation.sql)
--   a) model kanonikal: validasi field; draft → active → retired; active beku; retire ditolak bila dipakai rute aktif
--   b) rute: validasi bentuk map/rules/path; aktivasi wajib model active + field yang dirujuk ada + operasi ada di baseline
--      kontrak konektor; target saga wajib committed; rute aktif beku (nonaktifkan dulu)
--   c) pertukaran: append-only; route/canonical/caller diisi DB; live hanya rute aktif & pemegang console.eio.run;
--      simulate boleh pengelola; ok ⇔ layer 6
--   d) L6 outbox: hanya live+ok terbit, payload tanpa identitas pemanggil
--   e) RLS: pemegang run tanpa dashboard melihat pertukarannya sendiri; run saga lewat rute hanya untuk flow target rute aktif
--   f) L2: console.eio_identity() = ref.users pemanggil
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE app uuid; infra uuid; dev uuid; cm uuid; cm2 uuid; con uuid; con2 uuid; rt uuid; rs uuid; fl uuid; fl2 uuid; fd uuid;
        x1 uuid; x2 uuid; n int; ev jsonb; v record; sr uuid;
BEGIN
    PERFORM pg_temp.fx_world();
    app   := pg_temp.fx('u_app');                                                       -- eio.write + eio.run + dashboard.read
    infra := pg_temp.fx_user('u_infra', ARRAY[['ROLE_EAP_INFRA_ARCHITECT', '']]);        -- eio.run tanpa gse.project.run
    dev   := pg_temp.fx_user('u_dev', ARRAY[['ROLE_EAP_GSE_DEVELOPER', '']]);           -- eio.run tanpa dashboard

    -- fixture: konektor dengan baseline kontrak, konektor tanpa baseline, flow saga committed/draft
    INSERT INTO console.eio_connector (kode, nama, sumber, target, spec_snapshot) VALUES ('FIA-AR', 'FIA AR', 'EIO', 'FIA', '{"POST /orders/{order_id}/invoice": ["body"], "GET /health": []}') RETURNING id INTO con;
    INSERT INTO console.eio_connector (kode, nama, sumber, target) VALUES ('FLOW-WMS', 'FLOW WMS', 'EIO', 'FLOW') RETURNING id INTO con2;
    PERFORM pg_temp.as_user(dev);
    INSERT INTO gse.flow (nama, kind, spec, status) VALUES ('EioSaga', 'saga', '{"steps":[{"name":"reserve","service":"FLOW","compensation":"release","idempotencyKey":"${order_id}"}]}', 'committed') RETURNING id INTO fl;
    INSERT INTO gse.flow (nama, kind, spec, status) VALUES ('EioSagaLain', 'saga', '{"steps":[{"name":"x","service":"S","mutates":false}]}', 'committed') RETURNING id INTO fl2;
    INSERT INTO gse.flow (nama, kind, spec) VALUES ('EioSagaDraf', 'saga', '{"steps":[{"name":"x","service":"S","mutates":false}]}') RETURNING id INTO fd;

    -- a) model kanonikal
    PERFORM pg_temp.as_user(app);
    PERFORM pg_temp.expect_error($f$INSERT INTO console.eio_canonical (kode, nama, fields) VALUES ('X', 'X', '[]')$f$, '23514', 'model tanpa field');
    PERFORM pg_temp.expect_error($f$INSERT INTO console.eio_canonical (kode, nama, fields) VALUES ('X', 'X', '[{"name":"a b","type":"string"}]')$f$, '23514', 'nama field tidak sah');
    PERFORM pg_temp.expect_error($f$INSERT INTO console.eio_canonical (kode, nama, fields) VALUES ('X', 'X', '[{"name":"a","type":"date"}]')$f$, '23514', 'tipe tidak sah');
    PERFORM pg_temp.expect_error($f$INSERT INTO console.eio_canonical (kode, nama, fields) VALUES ('X', 'X', '[{"name":"a","type":"string"},{"name":"a","type":"number"}]')$f$, '23514', 'field ganda');
    PERFORM pg_temp.expect_error($f$INSERT INTO console.eio_canonical (kode, nama, fields) VALUES ('X', 'X', '[{"name":"a","type":"number","maxLength":3}]')$f$, '23514', 'maxLength hanya string');
    PERFORM pg_temp.expect_error($f$INSERT INTO console.eio_canonical (kode, nama, fields, status) VALUES ('X', 'X', '[{"name":"a","type":"string"}]', 'active')$f$, '23514', 'model baru wajib draft');
    INSERT INTO console.eio_canonical (kode, nama, fields) VALUES ('SALES-ORDER', 'Sales Order',
        '[{"name":"order_id","type":"string","required":true,"maxLength":40},{"name":"amount","type":"number","required":true},{"name":"currency","type":"string","enum":["IDR","USD"]},{"name":"customer","type":"object"}]') RETURNING id INTO cm;
    UPDATE console.eio_canonical SET nama = 'Sales Order (draft diubah)' WHERE id = cm;              -- draft bebas diubah

    -- b) rute: bentuk
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.eio_route (kode, nama, canonical_id, target_kind, connector_id, method, path) VALUES ('R', 'R', %L, 'connector', %L, 'POST', '/a/../b')$f$, cm, con), '23514', 'path dengan ..');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.eio_route (kode, nama, canonical_id, target_kind, connector_id, method, path) VALUES ('R', 'R', %L, 'connector', %L, 'POST', '/a?x=1')$f$, cm, con), '23514', 'path dengan query');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.eio_route (kode, nama, canonical_id, target_kind, connector_id) VALUES ('R', 'R', %L, 'connector', %L)$f$, cm, con), '23514', 'konektor tanpa method/path');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.eio_route (kode, nama, canonical_id, target_kind, saga_flow_id, method, path) VALUES ('R', 'R', %L, 'saga', %L, 'POST', '/x')$f$, cm, fl), '23514', 'saga dengan method/path');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.eio_route (kode, nama, canonical_id, target_kind, connector_id, method, path, request_map) VALUES ('R', 'R', %L, 'connector', %L, 'POST', '/x', '{"a": 5}')$f$, cm, con), '23514', 'nilai map tidak sah');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.eio_route (kode, nama, canonical_id, target_kind, connector_id, method, path, rules) VALUES ('R', 'R', %L, 'connector', %L, 'POST', '/x', '[{"field":"amount","op":"between","value":1}]')$f$, cm, con), '23514', 'operator tak dikenal');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.eio_route (kode, nama, canonical_id, target_kind, connector_id, method, path, rules) VALUES ('R', 'R', %L, 'connector', %L, 'POST', '/x', '[{"field":"amount","op":"gt","value":"1"}]')$f$, cm, con), '23514', 'gt wajib angka');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.eio_route (kode, nama, canonical_id, target_kind, connector_id, method, path) VALUES ('R', 'R', %L, 'connector', %L, 'POST', '/x/{y}')$f$, cm, con), '23514', 'kurung kurawal tanpa $');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.eio_route (kode, nama, canonical_id, target_kind, connector_id, method, path, request_map) VALUES ('R', 'R', %L, 'connector', %L, 'POST', '/x', '{"__proto__.polluted": "order_id"}')$f$, cm, con), '23514', 'prototype pollution (kunci map)');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.eio_route (kode, nama, canonical_id, target_kind, connector_id, method, path, response_map) VALUES ('R', 'R', %L, 'connector', %L, 'POST', '/x', '{"a": "constructor.prototype"}')$f$, cm, con), '23514', 'prototype pollution (sumber response_map)');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.eio_route (kode, nama, canonical_id, target_kind, connector_id, method, path, rules) VALUES ('R', 'R', %L, 'connector', %L, 'POST', '/x', '[{"field":"__proto__","op":"required"}]')$f$, cm, con), '23514', 'prototype pollution (field aturan)');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.eio_route (kode, nama, canonical_id, target_kind, connector_id, method, path, status) VALUES ('R', 'R', %L, 'connector', %L, 'POST', '/x', 'active')$f$, cm, con), '23514', 'rute baru wajib draft');
    INSERT INTO console.eio_route (kode, nama, canonical_id, target_kind, connector_id, method, path, request_map, response_map, rules)
    VALUES ('SO-INVOICE', 'Faktur Sales Order', cm, 'connector', con, 'POST', '/orders/${order_id}/invoice',
            '{"invoice.ref": "order_id", "invoice.total": "amount", "invoice.currency": "currency", "source": {"const": "EIO"}}', '{"invoiceNo": "data.number"}',
            '[{"field":"amount","op":"gt","value":0,"message":"amount harus positif"},{"field":"currency","op":"in","value":["IDR"]}]') RETURNING id INTO rt;

    -- aktivasi: model masih draft
    PERFORM pg_temp.expect_error(format($f$UPDATE console.eio_route SET status = 'active' WHERE id = %L$f$, rt), '23514', 'aktivasi dengan model draft');
    UPDATE console.eio_canonical SET status = 'active' WHERE id = cm;
    IF (SELECT activated_at FROM console.eio_canonical WHERE id = cm) IS NULL THEN RAISE EXCEPTION 'activated_at model diisi'; END IF;
    PERFORM pg_temp.expect_error(format($f$UPDATE console.eio_canonical SET fields = '[{"name":"a","type":"string"}]' WHERE id = %L$f$, cm), '23514', 'model active beku');
    PERFORM pg_temp.expect_error(format($f$UPDATE console.eio_canonical SET status = 'draft' WHERE id = %L$f$, cm), '23514', 'active tidak kembali draft');
    PERFORM pg_temp.expect_error(format($f$UPDATE console.eio_canonical SET deleted_at = now() WHERE id = %L$f$, cm), '23514', 'model active tidak dihapus');
    -- field yang dirujuk harus ada di model
    UPDATE console.eio_route SET request_map = request_map || '{"x": "tidak_ada"}' WHERE id = rt;
    PERFORM pg_temp.expect_error(format($f$UPDATE console.eio_route SET status = 'active' WHERE id = %L$f$, rt), '23514', 'map merujuk field yang tidak ada');
    UPDATE console.eio_route SET request_map = request_map - 'x', path = '/orders/${nomor}/invoice' WHERE id = rt;
    PERFORM pg_temp.expect_error(format($f$UPDATE console.eio_route SET status = 'active' WHERE id = %L$f$, rt), '23514', 'variabel path tidak ada di model');
    -- operasi harus ada di baseline kontrak konektor (EIO-04)
    UPDATE console.eio_route SET path = '/orders/${order_id}/faktur' WHERE id = rt;
    PERFORM pg_temp.expect_error(format($f$UPDATE console.eio_route SET status = 'active' WHERE id = %L$f$, rt), '23514', 'operasi tidak ada di baseline kontrak');
    UPDATE console.eio_route SET path = '/orders/${order_id}/invoice' WHERE id = rt;
    UPDATE console.eio_route SET status = 'active' WHERE id = rt;
    IF (SELECT activated_at FROM console.eio_route WHERE id = rt) IS NULL THEN RAISE EXCEPTION 'activated_at rute diisi'; END IF;
    PERFORM pg_temp.expect_error(format($f$UPDATE console.eio_route SET path = '/x' WHERE id = %L$f$, rt), '23514', 'rute aktif beku');
    PERFORM pg_temp.expect_error(format($f$UPDATE console.eio_route SET deleted_at = now() WHERE id = %L$f$, rt), '23514', 'rute aktif tidak dihapus');
    PERFORM pg_temp.expect_error(format($f$UPDATE console.eio_route SET status = 'draft' WHERE id = %L$f$, rt), '23514', 'aktif → draft ditolak');
    PERFORM pg_temp.expect_error(format($f$UPDATE console.eio_canonical SET status = 'retired' WHERE id = %L$f$, cm), '23514', 'retire model yang dipakai rute aktif');
    -- konektor tanpa baseline: operasi apa pun boleh
    INSERT INTO console.eio_route (kode, nama, canonical_id, target_kind, connector_id, method, path) VALUES ('SO-WMS', 'WMS', cm, 'connector', con2, 'PUT', '/stock/${order_id}') RETURNING id INTO x1;
    UPDATE console.eio_route SET status = 'active' WHERE id = x1;
    UPDATE console.eio_route SET status = 'disabled' WHERE id = x1;
    UPDATE console.eio_route SET path = '/stock/v2/${order_id}' WHERE id = x1;                         -- disabled boleh diubah
    -- saga: flow draft ditolak, committed boleh
    INSERT INTO console.eio_route (kode, nama, canonical_id, target_kind, saga_flow_id) VALUES ('SO-SAGA-D', 'Saga draf', cm, 'saga', fd) RETURNING id INTO x2;
    PERFORM pg_temp.expect_error(format($f$UPDATE console.eio_route SET status = 'active' WHERE id = %L$f$, x2), '23514', 'saga draft tidak diaktifkan');
    PERFORM pg_temp.expect_error(format($f$UPDATE console.eio_route SET response_map = '{"a":"b"}' WHERE id = %L$f$, x2), '23514', 'response_map hanya konektor');
    INSERT INTO console.eio_route (kode, nama, canonical_id, target_kind, saga_flow_id) VALUES ('SO-SAGA', 'Saga order', cm, 'saga', fl) RETURNING id INTO rs;
    UPDATE console.eio_route SET status = 'active' WHERE id = rs;
    -- versi baru model
    INSERT INTO console.eio_canonical (kode, versi, nama, fields) VALUES ('SALES-ORDER', 2, 'Sales Order v2', '[{"name":"order_id","type":"string"}]') RETURNING id INTO cm2;
    PERFORM pg_temp.expect_error($f$INSERT INTO console.eio_canonical (kode, versi, nama, fields) VALUES ('SALES-ORDER', 2, 'dup', '[{"name":"a","type":"string"}]')$f$, '23505', 'kode+versi unik');

    -- c) pertukaran
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));                                                  -- tanpa eio.run/eio.write
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.eio_exchange (route_id, mode, status, layer) VALUES (%L, 'simulate', 'ok', 6)$f$, rt), '42501', 'tanpa izin tidak mencatat pertukaran');
    PERFORM pg_temp.as_user(app);
    INSERT INTO console.eio_exchange (route_id, mode, status, layer, route_kode, caller_id, canonical_kode, duration_ms) VALUES (rt, 'live', 'ok', 6, 'palsu', dev, 'palsu', 12) RETURNING id INTO x1;
    SELECT * INTO v FROM console.eio_exchange WHERE id = x1;
    IF v.route_kode <> 'SO-INVOICE' OR v.canonical_kode <> 'SALES-ORDER' OR v.canonical_versi <> 1 OR v.target_kind <> 'connector' OR v.caller_id <> app THEN
        RAISE EXCEPTION 'pertukaran: rute/kanonikal/pemanggil diisi DB, bukan klien: %', row_to_json(v);
    END IF;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.eio_exchange (route_id, mode, status, layer) VALUES (%L, 'live', 'ok', 5)$f$, rt), '23514', 'ok wajib layer 6');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.eio_exchange (route_id, mode, status, layer) VALUES (%L, 'live', 'failed', 5)$f$, rt), '23514', 'gagal wajib error');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.eio_exchange (route_id, mode, status, layer) VALUES (%L, 'live', 'ok', 6)$f$, x2), '23514', 'live hanya rute aktif');
    INSERT INTO console.eio_exchange (route_id, mode, status, layer) VALUES (x2, 'simulate', 'ok', 6);                  -- simulate boleh rute draft
    INSERT INTO console.eio_exchange (route_id, mode, status, layer, error, http_status) VALUES (rt, 'live', 'rejected', 4, 'aturan amount', 422);
    PERFORM pg_temp.expect_error(format($f$UPDATE console.eio_exchange SET status = 'failed' WHERE id = %L$f$, x1), '42501', 'pertukaran append-only (update)');
    PERFORM pg_temp.expect_error(format($f$DELETE FROM console.eio_exchange WHERE id = %L$f$, x1), '42501', 'pertukaran append-only (delete)');

    -- pengelola tanpa eio.run hanya simulate (pakai peran khusus agar tidak bergantung pemetaan peran lain)
    PERFORM pg_temp.as_owner();
    INSERT INTO set.roles (role_code, role_name, tier) VALUES ('ROLE_T_EIO_WRITER', 'Uji EIO writer', 'T4_ASSURANCE');
    INSERT INTO set.role_permissions (role_id, permission_id) SELECT r.id, p.id FROM set.roles r, set.permissions p WHERE r.role_code = 'ROLE_T_EIO_WRITER' AND p.permission_code = 'console.eio.write';
    PERFORM pg_temp.as_user(pg_temp.fx_user('u_eio_writer', ARRAY[['ROLE_T_EIO_WRITER', '']]));
    INSERT INTO console.eio_exchange (route_id, mode, status, layer) VALUES (rt, 'simulate', 'ok', 6);
    PERFORM pg_temp.expect_error(format($f$INSERT INTO console.eio_exchange (route_id, mode, status, layer) VALUES (%L, 'live', 'ok', 6)$f$, rt), '42501', 'live wajib console.eio.run');

    -- d) outbox: hanya live + ok
    PERFORM pg_temp.as_owner();
    SELECT count(*) INTO n FROM shared.outbox WHERE aggregate_type = 'eio_exchange';
    IF n <> 1 THEN RAISE EXCEPTION 'outbox eio_exchange: diharapkan 1 peristiwa (live ok), ditemukan %', n; END IF;
    SELECT payload, (SELECT event_type FROM shared.outbox WHERE aggregate_type = 'eio_exchange') AS et INTO v FROM shared.outbox WHERE aggregate_type = 'eio_exchange';
    IF v.et <> 'eap.console.eio_exchange_completed' OR v.payload->>'route_kode' <> 'SO-INVOICE' OR v.payload ? 'caller_id' OR v.payload ? 'corporate_id' THEN
        RAISE EXCEPTION 'payload L6 tidak sesuai kontrak: % %', v.et, v.payload;
    END IF;

    -- e) RLS pertukaran: pemegang run tanpa dashboard hanya melihat miliknya
    PERFORM pg_temp.as_user(dev);
    INSERT INTO console.eio_exchange (route_id, mode, status, layer, error) VALUES (rt, 'live', 'failed', 5, 'HTTP 503');
    SELECT count(*) INTO n FROM console.eio_exchange; IF n <> 1 THEN RAISE EXCEPTION 'pemegang run melihat pertukarannya sendiri saja (%)', n; END IF;
    SELECT count(*) INTO n FROM console.eio_route; IF n < 4 THEN RAISE EXCEPTION 'pemegang run membaca rute'; END IF;
    PERFORM pg_temp.as_user(pg_temp.fx('u_emp'));
    SELECT count(*) INTO n FROM console.eio_exchange; IF n <> 0 THEN RAISE EXCEPTION 'tanpa izin tidak melihat pertukaran (%)', n; END IF;
    SELECT count(*) INTO n FROM console.eio_route; IF n <> 0 THEN RAISE EXCEPTION 'tanpa izin tidak melihat rute (%)', n; END IF;
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    SELECT count(*) INTO n FROM console.eio_exchange; IF n < 5 THEN RAISE EXCEPTION 'pembaca dashboard melihat semua pertukaran (%)', n; END IF;
    UPDATE console.eio_route SET nama = 'x' WHERE id = x2;
    GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'pembaca dashboard tidak mengubah rute (RLS)'; END IF;

    -- e) saga lewat rute: infra (eio.run, tanpa gse.project.run) boleh run flow target rute aktif, tidak untuk flow lain
    PERFORM pg_temp.as_user(infra);
    INSERT INTO gse.saga_run (flow_id, mode, input) VALUES (fl, 'simulate', '{"order_id":"SO-1"}') RETURNING id INTO sr;
    INSERT INTO gse.saga_step (run_id, seq, step, phase, action, service, status) VALUES (sr, 0, 'reserve', 'action', '', '', 'ok');
    UPDATE gse.saga_run SET status = 'completed' WHERE id = sr;
    SELECT count(*) INTO n FROM gse.saga_step WHERE run_id = sr; IF n <> 1 THEN RAISE EXCEPTION 'pemanggil rute membaca langkah run miliknya'; END IF;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.saga_run (flow_id, mode) VALUES (%L, 'simulate')$f$, fl2), '42501', 'flow bukan target rute aktif');
    PERFORM pg_temp.as_owner();
    UPDATE console.eio_route SET status = 'disabled' WHERE id = rs;
    PERFORM pg_temp.as_user(infra);
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.saga_run (flow_id, mode) VALUES (%L, 'simulate')$f$, fl), '42501', 'rute dinonaktifkan → run ditolak');

    -- f) L2 identitas
    SELECT * INTO v FROM console.eio_identity();
    IF v.corporate_id IS DISTINCT FROM (SELECT cmp_user_id FROM set.users WHERE id = infra) OR NOT v.active THEN RAISE EXCEPTION 'identitas korporat pemanggil: %', row_to_json(v); END IF;
END $$;
ROLLBACK;
