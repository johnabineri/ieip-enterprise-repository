-- =====================================================================
-- 19_outbox.test.sql : EAP sebagai produsen peristiwa (289_outbox.sql, ADR-CMP-004)
--   a) 14 pemicu outbox terpasang (12 di 289 + gse.saga_run di 299 + console.eio_exchange di 300)
--   b) daftar kolom payload SEMUA pemicu bebas kolom teks bebas/nama orang/pengguna/biaya (D-14)
--   c) INSERT oleh eap_app (lewat RLS) = satu peristiwa atomik dengan kontrak event_type & payload whitelist
--   d) UPDATE kolom di luar payload tidak menerbitkan peristiwa
--   e) transisi AF-05 terlihat di payload.changes.status {from,to}; correlation_id ikut dari app.correlation_id
--   f) soft delete terkirim (deleted_at); publikasi dokumen = eap.eaw.document_published tanpa isi
--   g) eap_app tidak dapat menulis shared.outbox / outbox_claim; eap_outbox hanya claim/done (tanpa baca tabel)
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE kra uuid; a uuid; d uuid; n int; ev text; p jsonb; bad text; denied boolean; corr uuid := gen_random_uuid();
BEGIN
    -- a) pemicu terpasang
    SELECT count(*) INTO n FROM pg_trigger t
     WHERE NOT t.tgisinternal AND t.tgfoid = 'shared.tg_outbox'::regproc;
    IF n <> 14 THEN RAISE EXCEPTION 'outbox: diharapkan 14 pemicu shared.tg_outbox (12 + gse.saga_run 299 + console.eio_exchange 300), ditemukan %', n; END IF;

    -- b) tidak ada kolom terlarang di argumen kolom pemicu mana pun
    SELECT string_agg(t.tgrelid::regclass || ':' || x.col, ', ') INTO bad
      FROM pg_trigger t
      CROSS JOIN LATERAL (SELECT (string_to_array(encode(t.tgargs, 'escape'), '\000'))[3] AS cols) a
      CROSS JOIN LATERAL unnest(string_to_array(trim(both '{}' from a.cols), ',')) AS x(col)
     WHERE NOT t.tgisinternal AND t.tgfoid = 'shared.tg_outbox'::regproc
       AND x.col IN ('owner_bisnis','owner_teknis','steward','pemilik','pemilik_jabatan','proposed_by','decided_by','created_by','updated_by',
                     'business_case','estimated_cost','arb_notes','catatan','context','decision','consequences','prompt','content','repo_git',
                     'remote_entry_url','input','output','deskripsi','gates','ai','reason');
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'outbox: kolom terlarang di payload pemicu: %', bad; END IF;
    -- shared.tg_outbox melewati kolom yang tidak ada tanpa galat -> salah ketik harus tertangkap di sini
    SELECT string_agg(t.tgrelid::regclass || ':' || x.col, ', ') INTO bad
      FROM pg_trigger t
      CROSS JOIN LATERAL (SELECT (string_to_array(encode(t.tgargs, 'escape'), '\000'))[3] AS cols) a
      CROSS JOIN LATERAL unnest(string_to_array(trim(both '{}' from a.cols), ',')) AS x(col)
     WHERE NOT t.tgisinternal AND t.tgfoid = 'shared.tg_outbox'::regproc
       AND NOT EXISTS (SELECT 1 FROM pg_attribute at WHERE at.attrelid = t.tgrelid AND at.attname = x.col AND at.attnum > 0 AND NOT at.attisdropped);
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'outbox: kolom payload tidak ada di tabel: %', bad; END IF;

    PERFORM pg_temp.fx_world();
    kra := pg_temp.fx_kra('KRA-OBX-1');

    -- c) INSERT lewat peran aplikasi + RLS
    PERFORM set_config('app.correlation_id', corr::text, false);
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, ui_standard, tech_stack, referensi_id, entity_id)
    VALUES ('PLAT-OBX', 'Platform Outbox', 'umum', 'Budi Pemilik', 'Tim Teknis', 'none', '99%', 'Shell MF 2.0', 'NestJS', kra, pg_temp.fx('aspal')) RETURNING id INTO a;
    PERFORM pg_temp.as_owner();
    SELECT count(*) INTO n FROM shared.outbox WHERE aggregate_type = 'application' AND aggregate_id = a;
    IF n <> 1 THEN RAISE EXCEPTION 'outbox: INSERT aplikasi menghasilkan % peristiwa (diharapkan 1)', n; END IF;
    SELECT event_type, payload INTO ev, p FROM shared.outbox WHERE aggregate_id = a ORDER BY id DESC LIMIT 1;
    IF ev <> 'eap.eaw.application_changed' THEN RAISE EXCEPTION 'outbox: event_type tidak sesuai kontrak: %', ev; END IF;
    IF p->>'kode' <> 'PLAT-OBX' OR p->>'status' <> 'Draf' OR p->>'entity_id' <> pg_temp.fx('aspal')::text OR NOT p ? 'data_classification' OR NOT p ? 'row_version' THEN
        RAISE EXCEPTION 'outbox: payload aplikasi tidak lengkap: %', p;
    END IF;
    IF p ? 'owner_bisnis' OR p ? 'owner_teknis' OR p::text LIKE '%Budi Pemilik%' THEN RAISE EXCEPTION 'outbox: nama pemilik bocor ke payload: %', p; END IF;
    IF (SELECT correlation_id FROM shared.outbox WHERE aggregate_id = a ORDER BY id DESC LIMIT 1) IS DISTINCT FROM corr THEN
        RAISE EXCEPTION 'outbox: correlation_id dari app.correlation_id tidak ikut';
    END IF;
    PERFORM set_config('app.correlation_id', '', false);

    -- d) UPDATE kolom di luar payload -> tidak ada peristiwa
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    UPDATE eaw.application SET owner_teknis = 'Tim Lain' WHERE id = a;
    PERFORM pg_temp.as_owner();
    SELECT count(*) INTO n FROM shared.outbox WHERE aggregate_id = a;
    IF n <> 1 THEN RAISE EXCEPTION 'outbox: UPDATE di luar payload menerbitkan peristiwa (total %)', n; END IF;

    -- e) transisi AF-05 -> changes.status
    PERFORM pg_temp.fx_complete(a);
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM eaw.transition('application', a, 'Divalidasi');
    PERFORM pg_temp.as_owner();
    SELECT payload INTO p FROM shared.outbox WHERE aggregate_id = a ORDER BY id DESC LIMIT 1;
    IF p #>> '{changes,status,from}' <> 'Draf' OR p #>> '{changes,status,to}' <> 'Divalidasi' THEN
        RAISE EXCEPTION 'outbox: transisi tidak terlihat di changes.status: %', p;
    END IF;
    -- objek domain dari fx_complete juga menerbitkan peristiwa (kontrak per jenis)
    SELECT count(DISTINCT event_type) INTO n FROM shared.outbox
     WHERE event_type IN ('eap.eaw.service_changed','eap.eaw.process_changed','eap.eaw.data_entity_changed','eap.eaw.infra_asset_changed','eap.eaw.control_changed');
    IF n <> 5 THEN RAISE EXCEPTION 'outbox: diharapkan peristiwa 5 jenis objek domain, ditemukan %', n; END IF;
    IF EXISTS (SELECT 1 FROM shared.outbox WHERE event_type = 'eap.eaw.data_entity_changed' AND payload ? 'steward') THEN
        RAISE EXCEPTION 'outbox: steward entitas data bocor ke payload';
    END IF;

    -- f) soft delete Draf -> deleted_at terkirim
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, entity_id)
    VALUES ('APP-OBX-DEL', 'Dihapus', 'umum', 'b', 't', 'none', 's', pg_temp.fx('aspal')) RETURNING id INTO d;
    UPDATE eaw.application SET deleted_at = now() WHERE id = d;
    PERFORM pg_temp.as_owner();
    SELECT payload INTO p FROM shared.outbox WHERE aggregate_id = d ORDER BY id DESC LIMIT 1;
    IF p->>'deleted_at' IS NULL OR NOT (p->'changes') ? 'deleted_at' THEN RAISE EXCEPTION 'outbox: soft delete tidak terkirim: %', p; END IF;

    -- KRA berubah -> reference_changed (fixture fx_kra = INSERT + UPDATE status)
    SELECT count(*) INTO n FROM shared.outbox WHERE aggregate_type = 'reference' AND aggregate_id = kra AND event_type = 'eap.eaw.reference_changed';
    IF n <> 2 THEN RAISE EXCEPTION 'outbox: KRA diharapkan 2 peristiwa (buat + terbit), ditemukan %', n; END IF;

    -- g) hak: eap_app tidak dapat memalsukan peristiwa atau mengambil antrean
    denied := false;
    BEGIN
        EXECUTE 'SET LOCAL ROLE eap_app';
        EXECUTE $q$INSERT INTO shared.outbox (aggregate_type, aggregate_id, event_type, payload) VALUES ('uji', gen_random_uuid(), 'uji.palsu', '{}')$q$;
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    RESET ROLE;
    IF NOT denied THEN RAISE EXCEPTION 'outbox: eap_app dapat menulis shared.outbox langsung'; END IF;
    IF has_function_privilege('eap_app', 'shared.outbox_claim(text, integer, integer)', 'EXECUTE')
       OR has_function_privilege('eap_ro', 'shared.outbox_claim(text, integer, integer)', 'EXECUTE')
       OR NOT has_function_privilege('eap_outbox', 'shared.outbox_claim(text, integer, integer)', 'EXECUTE')
       OR NOT has_function_privilege('eap_outbox', 'shared.outbox_done(bigint, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'outbox: hak EXECUTE outbox_claim/outbox_done tidak sesuai (hanya eap_outbox)';
    END IF;
    EXECUTE 'SET LOCAL ROLE eap_outbox';
    SELECT count(*) INTO n FROM shared.outbox_claim('uji-eap-worker', 1);
    IF n <> 1 THEN RAISE EXCEPTION 'outbox: eap_outbox tidak dapat mengambil peristiwa (%)', n; END IF;
    denied := false;
    BEGIN
        EXECUTE 'SELECT count(*) FROM shared.outbox';
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    RESET ROLE;
    IF NOT denied THEN RAISE EXCEPTION 'outbox: eap_outbox seharusnya tidak dapat membaca shared.outbox'; END IF;
END $$;

-- regresi outbox_claim (010_shared.sql): klaim TIDAK BOLEH melebihi p_batch, juga pada rencana Nested Loop Semi Join yang
-- mengevaluasi ulang subquery per baris (bentuk lama `IN (SELECT … LIMIT n FOR UPDATE SKIP LOCKED)` mengklaim seluruh antrean).
-- Dijalankan di sub-transaksi yang SELALU dibatalkan → tidak ada klaim/baris uji yang tertinggal.
DO $$
DECLARE n int; v_old int;
BEGIN
    BEGIN
        INSERT INTO shared.outbox (aggregate_type, aggregate_id, event_type, payload)
        SELECT 'uji', gen_random_uuid(), 'uji.regresi_claim', '{}' FROM generate_series(1, 6);
        PERFORM set_config('enable_hashjoin', 'off', true); PERFORM set_config('enable_mergejoin', 'off', true);
        PERFORM set_config('enable_hashagg', 'off', true);  PERFORM set_config('enable_material', 'off', true);
        PERFORM set_config('enable_sort', 'off', true);
        SELECT count(*) INTO n FROM shared.outbox_claim('uji-regresi', 1);
        IF n <> 1 THEN RAISE EXCEPTION 'outbox_claim(…, 1) mengklaim % baris pada rencana Nested Loop Semi Join (regresi bug LIMIT/SKIP LOCKED)', n; END IF;
        SELECT count(*) INTO n FROM shared.outbox_claim('uji-regresi', 3);
        IF n <> 3 THEN RAISE EXCEPTION 'outbox_claim(…, 3) mengklaim % baris (diharapkan 3)', n; END IF;
        -- kontrol: pastikan pengaturan di atas memang memaksa rencana bermasalah (bentuk lama mengklaim > 1); bila PostgreSQL
        -- berubah, uji ini menjadi hampa → beri tahu, jangan gagal
        WITH u AS (UPDATE shared.outbox o SET locked_by = 'uji-kontrol'
                    WHERE o.id IN (SELECT id FROM shared.outbox WHERE processed_at IS NULL AND locked_by IS NULL ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
                    RETURNING 1)
        SELECT count(*) INTO v_old FROM u;
        IF v_old <= 1 THEN RAISE NOTICE 'outbox_claim: rencana bermasalah tidak lagi terpaksa (bentuk lama klaim %); periksa pengaturan planner uji ini', v_old; END IF;
        RAISE EXCEPTION 'uji-regresi-claim-selesai';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'uji-regresi-claim-selesai' THEN RAISE; END IF;
    END;
END $$;
ROLLBACK;
