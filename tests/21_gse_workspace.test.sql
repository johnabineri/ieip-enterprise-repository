-- =====================================================================
-- 21_gse_workspace.test.sql : GSE-05 — revisi ruang kerja (292_gse_workspace.sql)
--   a) keadaan ruang kerja: berkas asli → revisi put → hapus; berkas baru; berkas asli tidak berubah
--   b) hak: hanya gse.project.run menulis; read melihat; tanpa izin tidak melihat
--   c) AF-06: proyek blocked tidak dapat disunting/di-commit
--   d) path tidak aman ditolak; batas 200 KB; append-only; commit tidak pernah ke main; author & sha256 diisi DB
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE kra uuid; a_draf uuid; a_val uuid; dev uuid; p uuid; pb uuid; r1 bigint; r2 bigint; w record; n int;
BEGIN
    PERFORM pg_temp.fx_world();
    kra := pg_temp.fx_kra('KRA-GSE-WS');
    dev := pg_temp.fx_user('u_dev', ARRAY[['ROLE_EAP_GSE_DEVELOPER', '']]);
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, ui_standard, tech_stack, referensi_id, entity_id)
    VALUES ('WS-DRAF', 'Draf', 'umum', 'b', 't', 'low', 's', 'ui', 'stack', kra, pg_temp.fx('hold')) RETURNING id INTO a_draf;
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, ui_standard, tech_stack, referensi_id, entity_id)
    VALUES ('WS-VAL', 'Divalidasi', 'umum', 'b', 't', 'low', 's', 'ui', 'stack', kra, pg_temp.fx('hold')) RETURNING id INTO a_val;
    PERFORM pg_temp.fx_complete(a_val);
    PERFORM eaw.transition('application', a_val, 'Divalidasi');

    PERFORM pg_temp.as_user(dev);
    INSERT INTO gse.project (application_id, kode, branch, status) VALUES (a_val, 'WS-VAL', 'feat/ws-val', 'generated') RETURNING id INTO p;
    INSERT INTO gse.project_file (project_id, path, content, bytes, source) VALUES (p, 'src/a.ts', 'asli', 4, 'template'), (p, 'README.md', '# x', 3, 'ai');
    INSERT INTO gse.project (application_id, kode, branch, status, reason) VALUES (a_draf, 'WS-DRAF', 'feat/ws-draf', 'blocked', 'AF-06: Draf') RETURNING id INTO pb;

    -- a) keadaan ruang kerja
    INSERT INTO gse.file_revision (project_id, path, op, content) VALUES (p, 'src/a.ts', 'put', 'disunting') RETURNING id INTO r1;
    INSERT INTO gse.file_revision (project_id, path, op, content, parent_id) VALUES (p, 'src/baru.ts', 'put', 'export const x = 1;', NULL);
    INSERT INTO gse.file_revision (project_id, path, op, parent_id) VALUES (p, 'README.md', 'delete', NULL) RETURNING id INTO r2;
    SELECT * INTO w FROM gse.workspace_file WHERE project_id = p AND path = 'src/a.ts';
    IF w.content <> 'disunting' OR w.source <> 'edit' OR w.origin <> 'template' OR w.revision_id <> r1 OR w.deleted OR w.edited_by <> dev THEN RAISE EXCEPTION 'ws: berkas disunting salah: %', w; END IF;
    SELECT * INTO w FROM gse.workspace_file WHERE project_id = p AND path = 'src/baru.ts';
    IF w.origin IS NOT NULL OR w.content <> 'export const x = 1;' OR w.bytes <> 19 THEN RAISE EXCEPTION 'ws: berkas baru salah: %', w; END IF;
    SELECT * INTO w FROM gse.workspace_file WHERE project_id = p AND path = 'README.md';
    IF NOT w.deleted OR w.content IS NOT NULL OR w.origin <> 'ai' THEN RAISE EXCEPTION 'ws: berkas terhapus salah: %', w; END IF;
    IF (SELECT content FROM gse.project_file WHERE project_id = p AND path = 'src/a.ts') <> 'asli' THEN RAISE EXCEPTION 'berkas hasil generate tidak boleh berubah'; END IF;
    IF (SELECT sha256 FROM gse.file_revision WHERE id = r1) <> encode(digest('disunting', 'sha256'), 'hex') THEN RAISE EXCEPTION 'sha256 diisi DB'; END IF;

    -- b) hak
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));                              -- gse.project.read
    IF (SELECT count(*) FROM gse.workspace_file WHERE project_id = p) <> 3 THEN RAISE EXCEPTION 'read melihat ruang kerja'; END IF;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.file_revision (project_id, path, op, content) VALUES (%L, 'x.ts', 'put', 'x')$f$, p), '42501', 'read tidak menyunting');
    PERFORM pg_temp.as_user(pg_temp.fx('u_emp'));
    IF (SELECT count(*) FROM gse.file_revision) <> 0 THEN RAISE EXCEPTION 'tanpa izin tidak melihat revisi'; END IF;

    -- c) AF-06
    PERFORM pg_temp.as_user(dev);
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.file_revision (project_id, path, op, content) VALUES (%L, 'x.ts', 'put', 'x')$f$, pb), '23514', 'AF-06: sunting proyek blocked');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.workspace_commit (project_id, kind, provider, repo_path, ref, commit_sha, message) VALUES (%L, 'push', 'github', 'o/r', 'feat/ws-draf', 'abc', 'm')$f$, pb), '23514', 'AF-06: commit proyek blocked');

    -- d) path, ukuran, append-only, main
    FOR w IN SELECT unnest(ARRAY['../etc/passwd', '/abs.ts', 'a/../b.ts', 'a\b.ts', 'a//b.ts', 'dir/', '.git/config', 'x/.git/hooks/pre-commit', E'a\tb.ts']) AS pth LOOP
        PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.file_revision (project_id, path, op, content) VALUES (%L, %L, 'put', 'x')$f$, p, w.pth), '23514', 'path tidak aman: ' || w.pth);
    END LOOP;
    INSERT INTO gse.file_revision (project_id, path, op, content) VALUES (p, '.ci/pipeline.yaml', 'put', 'stages: []');   -- direktori bertitik selain .git boleh
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.file_revision (project_id, path, op, content) VALUES (%L, 'besar.txt', 'put', repeat('x', 200001))$f$, p), '23514', 'berkas > 200 KB');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.file_revision (project_id, path, op) VALUES (%L, 'x.ts', 'put')$f$, p), '23514', 'put tanpa isi');
    PERFORM pg_temp.expect_error(format($f$UPDATE gse.file_revision SET content = 'curang' WHERE id = %s$f$, r1), '42501', 'revisi append-only');
    PERFORM pg_temp.expect_error(format($f$DELETE FROM gse.file_revision WHERE id = %s$f$, r1), '42501', 'revisi append-only (hapus)');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.workspace_commit (project_id, kind, provider, repo_path, ref, commit_sha, message) VALUES (%L, 'commit', 'github', 'o/r', 'Main', 'abc', 'm')$f$, p), '23514', 'D-02: commit ke main');
    INSERT INTO gse.workspace_commit (project_id, kind, provider, repo_path, ref, commit_sha, message, revision_upto, files)
    VALUES (p, 'push', 'github', 'o/r', 'feat/ws-val', 'abc123', 'awal', r2, '[{"path":"src/a.ts","action":"create"}]');
    SELECT count(*) INTO n FROM gse.workspace_commit WHERE project_id = p AND author = dev;
    IF n <> 1 THEN RAISE EXCEPTION 'author commit diisi DB'; END IF;
    PERFORM pg_temp.expect_error(format($f$UPDATE gse.workspace_commit SET message = 'x' WHERE project_id = %L$f$, p), '42501', 'commit append-only');
END $$;
ROLLBACK;
