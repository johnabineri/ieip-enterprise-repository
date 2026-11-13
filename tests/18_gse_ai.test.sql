-- =====================================================================
-- 18_gse_ai.test.sql : AI scaffolding GSE — gse.project.ai berbentuk objek, gse.project_file.source terbatas (template|ai), berkas append-only,
--                      saklar gse-ai ditegakkan (enforced) dan aktif secara bawaan
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE kra uuid; dev uuid; a_val uuid; prj uuid; n int; s text;
BEGIN
    PERFORM pg_temp.fx_world();
    kra := pg_temp.fx_kra('KRA-AI');
    dev := pg_temp.fx_user('u_dev', ARRAY[['ROLE_EAP_GSE_DEVELOPER', '']]);

    -- saklar: kapabilitas platform, bukan data bisnis
    IF NOT (SELECT enforced AND enabled FROM console.agent_switch WHERE kode = 'gse-ai' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'gse-ai harus enforced + enabled secara bawaan'; END IF;
    IF NOT console.agent_enabled('gse-ai') THEN RAISE EXCEPTION 'console.agent_enabled(gse-ai) harus true secara bawaan'; END IF;

    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, ui_standard, tech_stack, referensi_id, entity_id)
    VALUES ('AI-VAL', 'Aplikasi AI', 'umum', 'b', 't', 'low', 's', 'ui', 'stack', kra, pg_temp.fx('hold')) RETURNING id INTO a_val;
    PERFORM pg_temp.fx_complete(a_val);
    PERFORM eaw.transition('application', a_val, 'Divalidasi');

    PERFORM pg_temp.as_user(dev);
    -- ai harus objek JSON (atau NULL)
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.project (application_id, kode, branch, status, ai) VALUES (%L, 'AI-VAL', 'feat/ai-1', 'generated', '[1]'::jsonb)$f$, a_val), '23514', 'ai bukan objek');
    INSERT INTO gse.project (application_id, kode, branch, status, ai) VALUES (a_val, 'AI-VAL', 'feat/ai-2', 'generated', '{"engine":"llm","model":"m","accepted":[],"rejected":[]}') RETURNING id INTO prj;
    INSERT INTO gse.project (application_id, kode, branch, status) VALUES (a_val, 'AI-VAL', 'feat/ai-3', 'generated');      -- tanpa AI tetap sah (ai NULL)

    -- sumber berkas: hanya template|ai; bawaan template
    INSERT INTO gse.project_file (project_id, path, content, bytes) VALUES (prj, 'a.txt', 'x', 1);
    INSERT INTO gse.project_file (project_id, path, content, bytes, source) VALUES (prj, 'apps/ai-val/b.ts', 'x', 1, 'ai');
    SELECT source INTO s FROM gse.project_file WHERE project_id = prj AND path = 'a.txt'; IF s <> 'template' THEN RAISE EXCEPTION 'source bawaan harus template, dapat %', s; END IF;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO gse.project_file (project_id, path, content, bytes, source) VALUES (%L, 'c.ts', 'x', 1, 'manusia')$f$, prj), '23514', 'source tak dikenal');
    PERFORM pg_temp.expect_error(format($f$UPDATE gse.project_file SET source = 'template' WHERE project_id = %L AND path = 'apps/ai-val/b.ts'$f$, prj), '42501', 'berkas append-only: penanda AI tidak dapat dihapus');
    SELECT count(*) INTO n FROM gse.project_file WHERE project_id = prj AND source = 'ai'; IF n <> 1 THEN RAISE EXCEPTION 'satu berkas AI diharapkan, dapat %', n; END IF;
END $$;
ROLLBACK;
