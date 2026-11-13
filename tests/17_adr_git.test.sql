-- =====================================================================
-- 17_adr_git.test.sql : ADR -> Git (EAW-04) — eaw.adr_git append-only, 0 push ke cabang utama, hak tulis eaw.adr.write, baca eaw.adr.read;
--                       git_ref ADR tetap dapat diisi walau ADR sudah Accepted (isi ADR terkunci)
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE a uuid; n int;
BEGIN
    PERFORM pg_temp.fx_world();

    -- ADR disusun Application Architect (eaw.adr.write); ARB menerima
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.adr (adr_code, title, context, decision) VALUES ('ADR-GT-1', 'Uji', 'konteks', 'keputusan') RETURNING id INTO a;
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    UPDATE eaw.adr SET status = 'Accepted' WHERE id = a;
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.adr SET decision = 'diubah' WHERE id = %L$f$, a), '23514', 'isi ADR Accepted terkunci');
    UPDATE eaw.adr SET git_ref = 'o/r:docs/adr/ADR-GT-1.md @ abc (PR #1)' WHERE id = a;            -- git_ref boleh diperbarui

    -- 1) jejak penerbitan
    INSERT INTO eaw.adr_git (adr_id, adr_code, adr_status, provider, repo_path, ref, base_branch, file_path, content_sha256, commit_sha, pr_number, pr_url)
    VALUES (a, 'ADR-GT-1', 'Accepted', 'github', 'o/r', 'adr/adr-gt-1-accepted-deadbeef', 'main', 'docs/adr/ADR-GT-1.md', repeat('a', 64), 'abc123', 1, 'https://github.com/o/r/pull/1');
    INSERT INTO eaw.adr_git (adr_id, adr_code, adr_status, provider, repo_path, ref, base_branch, file_path, content_sha256, commit_sha, pr_number, pr_url)
    VALUES (a, 'ADR-GT-1', 'Accepted', 'gitlab', 'g/p', 'adr/x', 'develop-x', 'docs/adr/ADR-GT-1.md', repeat('b', 64), 'def456', 2, 'http://gl/mr/2');

    -- 2) aturan: tidak ke cabang utama / cabang dasar; hash sah; penyedia dikenal; status ADR sah
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.adr_git (adr_id, adr_code, adr_status, provider, repo_path, ref, base_branch, file_path, content_sha256, commit_sha, pr_number, pr_url) VALUES (%L,'X','Accepted','github','o/r','main','main','f',repeat('a',64),'c',1,'u')$f$, a), '23514', 'push ke main');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.adr_git (adr_id, adr_code, adr_status, provider, repo_path, ref, base_branch, file_path, content_sha256, commit_sha, pr_number, pr_url) VALUES (%L,'X','Accepted','github','o/r','develop-x','develop-x','f',repeat('a',64),'c',1,'u')$f$, a), '23514', 'cabang = cabang dasar');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.adr_git (adr_id, adr_code, adr_status, provider, repo_path, ref, base_branch, file_path, content_sha256, commit_sha, pr_number, pr_url) VALUES (%L,'X','Accepted','github','o/r','adr/y','main','f','bukan-hash','c',1,'u')$f$, a), '23514', 'sha256 tidak sah');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.adr_git (adr_id, adr_code, adr_status, provider, repo_path, ref, base_branch, file_path, content_sha256, commit_sha, pr_number, pr_url) VALUES (%L,'X','Accepted','bitbucket','o/r','adr/y','main','f',repeat('a',64),'c',1,'u')$f$, a), '23514', 'penyedia tak dikenal');

    -- 3) append-only
    PERFORM pg_temp.expect_error($f$UPDATE eaw.adr_git SET pr_number = 9$f$, '42501', 'jejak tidak diubah');
    PERFORM pg_temp.expect_error($f$DELETE FROM eaw.adr_git$f$, '42501', 'jejak tidak dihapus');

    -- 4) hak: pembaca (SBU: eaw.adr.read) melihat tetapi tidak menulis; tanpa izin eaw tidak melihat
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    SELECT count(*) INTO n FROM eaw.adr_git; IF n <> 2 THEN RAISE EXCEPTION 'pembaca ADR melihat 2 jejak, dapat %', n; END IF;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.adr_git (adr_id, adr_code, adr_status, provider, repo_path, ref, base_branch, file_path, content_sha256, commit_sha, pr_number, pr_url) VALUES (%L,'X','Accepted','github','o/r','adr/z','main','f',repeat('a',64),'c',3,'u')$f$, a), '42501', 'SBU tidak mencatat');
    PERFORM pg_temp.as_user(pg_temp.fx('u_emp'));
    SELECT count(*) INTO n FROM eaw.adr_git; IF n <> 0 THEN RAISE EXCEPTION 'tanpa izin eaw tidak melihat jejak ADR-Git'; END IF;
END $$;
ROLLBACK;
