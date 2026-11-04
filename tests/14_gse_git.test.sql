-- =====================================================================
-- 14_gse_git.test.sql : gse.git_event (konektor Git/CI) — hak tulis hanya gse.project.run, append-only, 0 push ke cabang utama, push wajib punya commit+MR
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE kra uuid; dev uuid; a_val uuid; prj uuid; n int;
BEGIN
    PERFORM pg_temp.fx_world();
    kra := pg_temp.fx_kra('KRA-GIT');
    dev := pg_temp.fx_user('u_dev', ARRAY[['ROLE_EAP_GSE_DEVELOPER', '']]);

    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, ui_standard, tech_stack, referensi_id, entity_id)
    VALUES ('GIT-VAL', 'Aplikasi Git', 'umum', 'b', 't', 'low', 's', 'ui', 'stack', kra, pg_temp.fx('hold')) RETURNING id INTO a_val;
    PERFORM pg_temp.fx_complete(a_val);
    PERFORM eaw.transition('application', a_val, 'Divalidasi');

    PERFORM pg_temp.as_user(dev);
    INSERT INTO gse.project (application_id, kode, branch, status) VALUES (a_val, 'GIT-VAL', 'feat/gse-git-val', 'generated') RETURNING id INTO prj;

    -- 1) pengembang mencatat push + CI
    INSERT INTO gse.git_event (project_id, kind, repo_path, ref, commit_sha, mr_iid, mr_url) VALUES (prj, 'push', 'grup/proyek', 'feat/gse-git-val', 'abc123', 7, 'http://gl/mr/7');
    INSERT INTO gse.git_event (project_id, kind, repo_path, ref, pipeline_id, ci_status, ci_url) VALUES (prj, 'ci', 'grup/proyek', 'feat/gse-git-val', 99, 'running', 'http://gl/p/99');

    -- 2) aturan: tanpa commit/MR bukan push; 0 push ke cabang utama; jenis & penyedia terbatas
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.git_event (project_id, kind, repo_path, ref) VALUES (%L, 'push', 'g/p', 'feat/x')$f$, prj), '23514', 'push wajib commit + MR');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.git_event (project_id, kind, repo_path, ref, commit_sha, mr_iid) VALUES (%L, 'push', 'g/p', 'main', 'a', 1)$f$, prj), '23514', 'push ke main');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.git_event (project_id, kind, repo_path, ref) VALUES (%L, 'merge', 'g/p', 'feat/x')$f$, prj), '23514', 'jenis event tak dikenal');

    INSERT INTO gse.git_event (project_id, kind, provider, repo_path, ref, commit_sha, mr_iid, mr_url) VALUES (prj, 'push', 'github', 'johnabineri/ieip-enterprise-repository', 'feat/gse-git-val', 'def456', 5, 'https://github.com/johnabineri/ieip-enterprise-repository/pull/5');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.git_event (project_id, kind, provider, repo_path, ref, commit_sha, mr_iid) VALUES (%L, 'push', 'bitbucket', 'g/p', 'feat/x', 'a', 1)$f$, prj), '23514', 'penyedia tak dikenal');

    -- 3) append-only (trigger + REVOKE)
    PERFORM pg_temp.expect_error($f$UPDATE gse.git_event SET ci_status = 'success'$f$, '42501', 'event Git tidak diubah');
    PERFORM pg_temp.expect_error($f$DELETE FROM gse.git_event$f$, '42501', 'event Git tidak dihapus');

    -- 4) SBU (hanya baca) melihat tetapi tidak menulis; pengguna tanpa izin gse tidak melihat
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    SELECT count(*) INTO n FROM gse.git_event; IF n <> 3 THEN RAISE EXCEPTION 'SBU (gse.project.read) harus melihat 3 event, dapat %', n; END IF;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.git_event (project_id, kind, repo_path, ref, pipeline_id, ci_status) VALUES (%L, 'ci', 'g/p', 'feat/x', 1, 'success')$f$, prj), '42501', 'SBU tidak mencatat event');
    PERFORM pg_temp.as_user(pg_temp.fx('u_emp'));
    SELECT count(*) INTO n FROM gse.git_event; IF n <> 0 THEN RAISE EXCEPTION 'karyawan tanpa izin gse tidak boleh melihat event Git'; END IF;
END $$;
ROLLBACK;
