-- =====================================================================
-- 12_diagram_publication.test.sql : diagram (RLS entitas) dan publikasi dokumen (append-only, berversi, sha256)
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE d uuid; n int; p1 uuid; p2 uuid; v int;
BEGIN
    PERFORM pg_temp.fx_world();

    -- 1) diagram: SBU menyusun di entitasnya; tidak di entitas lain; entitas lain tidak melihat; Auditor read-only
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    INSERT INTO eaw.diagram (entity_id, nama, content) VALUES (pg_temp.fx('aspal'), 'Penjualan', '{"nodes":[{"id":"n1"}],"edges":[]}') RETURNING id INTO d;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.diagram (entity_id, nama) VALUES (%L, 'X')$f$, pg_temp.fx('toyota')), '42501', 'diagram di entitas lain');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.diagram (entity_id, nama, content) VALUES (%L, 'Salah', '{"nodes":{},"edges":[]}')$f$, pg_temp.fx('aspal')), '23514', 'content harus array');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.diagram (entity_id, nama) VALUES (%L, 'Penjualan')$f$, pg_temp.fx('aspal')), '23505', 'nama unik per entitas');
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_t'));
    IF (SELECT count(*) FROM eaw.diagram) <> 0 THEN RAISE EXCEPTION 'diagram entitas lain bocor'; END IF;
    PERFORM pg_temp.as_user(pg_temp.fx('u_aud'));
    IF (SELECT count(*) FROM eaw.diagram) <> 1 THEN RAISE EXCEPTION 'Auditor (lihat-semua) melihat diagram'; END IF;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.diagram (entity_id, nama) VALUES (%L, 'Aud')$f$, pg_temp.fx('aspal')), '42501', 'Auditor tidak menyusun');
    UPDATE eaw.diagram SET nama = 'diubah'; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'Auditor tidak mengubah diagram'; END IF;

    -- 2) publikasi: hanya eaw.document.approve; versi otomatis per cakupan+format; sha256 diverifikasi; append-only
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.publication (scope_type, entity_id, scope_key, format, versi, title, content, sha256) VALUES ('entity', %L, %L, 'markdown', 1, 'T', 'isi', %L)$f$,
        pg_temp.fx('aspal'), pg_temp.fx('aspal'), encode(digest('isi', 'sha256'), 'hex')), '42501', 'SBU tidak menerbitkan');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.publication (scope_type, entity_id, scope_key, format, versi, title, content, sha256) VALUES ('entity', pg_temp.fx('aspal'), pg_temp.fx('aspal'), 'markdown', 99, 'Dokumen A', 'isi 1', encode(digest('isi 1', 'sha256'), 'hex')) RETURNING id, versi INTO p1, v;
    IF v <> 1 THEN RAISE EXCEPTION 'versi pertama harus 1 (diisi trigger), bukan %', v; END IF;
    INSERT INTO eaw.publication (scope_type, entity_id, scope_key, format, versi, title, content, sha256) VALUES ('entity', pg_temp.fx('aspal'), pg_temp.fx('aspal'), 'markdown', 1, 'Dokumen A', 'isi 2', encode(digest('isi 2', 'sha256'), 'hex')) RETURNING id, versi INTO p2, v;
    IF v <> 2 THEN RAISE EXCEPTION 'versi kedua harus 2, bukan %', v; END IF;
    INSERT INTO eaw.publication (scope_type, entity_id, scope_key, format, versi, title, content, sha256) VALUES ('entity', pg_temp.fx('aspal'), pg_temp.fx('aspal'), 'html', 1, 'Dokumen A', '<p>x</p>', encode(digest('<p>x</p>', 'sha256'), 'hex')) RETURNING versi INTO v;
    IF v <> 1 THEN RAISE EXCEPTION 'format berbeda memiliki penomoran sendiri'; END IF;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.publication (scope_type, entity_id, scope_key, format, versi, title, content, sha256) VALUES ('entity', %L, %L, 'markdown', 1, 'T', 'isi', %L)$f$,
        pg_temp.fx('aspal'), pg_temp.fx('aspal'), repeat('0', 64)), '23514', 'sha256 tidak cocok');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.publication (scope_type, entity_id, scope_key, format, versi, title, content, sha256) VALUES ('framework', %L, %L, 'markdown', 1, 'T', 'isi', %L)$f$,
        pg_temp.fx('aspal'), pg_temp.fx('aspal'), encode(digest('isi', 'sha256'), 'hex')), '23514', 'cakupan kerangka wajib framework_id');
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.publication SET title = 'ubah' WHERE id = %L$f$, p1), '42501', 'dokumen terbit tidak diubah');
    PERFORM pg_temp.expect_error(format($f$DELETE FROM eaw.publication WHERE id = %L$f$, p1), '42501', 'dokumen terbit tidak dihapus');
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_t'));
    IF (SELECT count(*) FROM eaw.publication) <> 3 THEN RAISE EXCEPTION 'dokumen resmi terbaca semua pengguna ber-izin'; END IF;
END $$;
ROLLBACK;
