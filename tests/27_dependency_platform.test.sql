-- =====================================================================
-- 27_dependency_platform.test.sql : graf ketergantungan memuat platform -> workspace (305)
--   - edge 'hosting': provider = platform, dependent = workspace (arah: workspace terdampak bila platform gagal)
--   - workspace belum ditempatkan tidak punya edge; objek dihapus-lunak tidak ikut; platform bukan 'workspace'
--   - RLS: edge hanya terlihat bila platform DAN workspace terlihat bagi pemanggil (Draf entitas lain tersembunyi)
--   - dampak BERANTAI: yang bergantung pada workspace (proses yang dilayaninya) ikut terdampak dari platform
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE plat uuid; ws uuid; ws2 uuid; loose uuid; prc uuid; kra uuid; n int;
BEGIN
    PERFORM pg_temp.fx_world();
    kra := pg_temp.fx_kra('KRA-DEP-PLAT');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, referensi_id, entity_id)
    VALUES ('DP-PLAT', 'Platform Dependensi', 'umum', 'Chief', 'Tim', 'low', '99%', kra, pg_temp.fx('hold')) RETURNING id INTO plat;
    INSERT INTO eaw.application (kode, nama, jenis, jenis_node, platform, owner_bisnis, owner_teknis, risiko_ai, slo, adopsi, referensi_id, entity_id)
    VALUES ('DP-WS1', 'Workspace Satu', 'umum', 'workspace', 'DP-PLAT', 'b', 't', 'low', '99%', true, kra, pg_temp.fx('hold')) RETURNING id INTO ws;
    INSERT INTO eaw.application (kode, nama, jenis, jenis_node, platform, owner_bisnis, owner_teknis, risiko_ai, slo, adopsi, referensi_id, entity_id)
    VALUES ('DP-WS2', 'Workspace Dua', 'umum', 'workspace', 'DP-PLAT', 'b', 't', 'low', '99%', true, kra, pg_temp.fx('hold')) RETURNING id INTO ws2;
    INSERT INTO eaw.application (kode, nama, jenis, jenis_node, owner_bisnis, owner_teknis, risiko_ai, slo, adopsi, referensi_id, entity_id)
    VALUES ('DP-LOOSE', 'Workspace Lepas', 'umum', 'workspace', 'b', 't', 'low', '99%', true, kra, pg_temp.fx('hold')) RETURNING id INTO loose;
    INSERT INTO eaw.process (nama, level, entity_id) VALUES ('Proses Dilayani DP-WS1', 1, pg_temp.fx('hold')) RETURNING id INTO prc;
    INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) VALUES ('application', ws, 'process', prc, 'serving');

    -- 1) arah & tipe: platform = provider, workspace = dependent; tidak ada arah sebaliknya
    SELECT count(*) INTO n FROM eaw.dependency_edge WHERE tipe = 'hosting' AND provider_id = plat AND dependent_id IN (ws, ws2)
        AND provider_type = 'application' AND dependent_type = 'application';
    IF n <> 2 THEN RAISE EXCEPTION 'platform harus menjadi provider 2 workspace-nya, dapat %', n; END IF;
    SELECT count(*) INTO n FROM eaw.dependency_edge WHERE provider_id IN (ws, ws2) AND dependent_id = plat; IF n <> 0 THEN RAISE EXCEPTION 'tidak boleh ada edge terbalik workspace -> platform'; END IF;
    SELECT count(*) INTO n FROM eaw.dependency_edge WHERE tipe = 'hosting' AND (provider_id = loose OR dependent_id = loose); IF n <> 0 THEN RAISE EXCEPTION 'workspace yang belum ditempatkan tidak punya edge hosting'; END IF;
    SELECT count(DISTINCT relation_id) INTO n FROM eaw.dependency_edge WHERE tipe = 'hosting' AND provider_id = plat; IF n <> 2 THEN RAISE EXCEPTION 'relation_id edge sintetis harus unik per workspace (dan tidak NULL)'; END IF;

    -- 2) dampak berantai: dari platform -> workspace -> proses yang dilayani workspace (BFS seperti API /eaw/impact)
    SELECT count(*) INTO n FROM (
        WITH RECURSIVE walk(t, i, d) AS (
            SELECT 'application'::text, plat, 0 UNION
            SELECT e.dependent_type::text, e.dependent_id, w.d + 1 FROM walk w JOIN eaw.dependency_edge e ON e.provider_type = w.t AND e.provider_id = w.i WHERE w.d < 5)
        SELECT 1 FROM walk WHERE (t = 'process' AND i = prc) OR (t = 'application' AND i IN (ws, ws2))) x;
    IF n <> 3 THEN RAISE EXCEPTION 'dari platform harus terdampak 2 workspace + 1 proses yang dilayani workspace, dapat %', n; END IF;

    -- 3) RLS: SBU Toyota tidak melihat Draf entitas Holding => tidak melihat edge (security_invoker)
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_t'));
    SELECT count(*) INTO n FROM eaw.dependency_edge WHERE tipe = 'hosting' AND provider_id = plat; IF n <> 0 THEN RAISE EXCEPTION 'RLS: edge hosting tidak boleh terlihat bila platform/workspace tersembunyi, dapat %', n; END IF;

    -- 4) hapus-lunak workspace => edge hilang
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    UPDATE eaw.application SET deleted_at = now() WHERE id = ws2;
    SELECT count(*) INTO n FROM eaw.dependency_edge WHERE tipe = 'hosting' AND provider_id = plat; IF n <> 1 THEN RAISE EXCEPTION 'workspace terhapus tidak boleh punya edge, dapat %', n; END IF;
END $$;
ROLLBACK;
