-- =====================================================================
-- 07_platform_workspace.test.sql : pembentukan platform (BASE) dan penempatan workspace (AEGIS)
--   eaw.platform.write (hanya Application Architect), eaw.workspace.assign, profil platform (UI/UX + tech stack),
--   tiket ARB sebagai dasar workspace baru, adopsi, status anak <= induk, pemindahan platform.
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE base uuid; base2 uuid; ws uuid; legacy uuid; t uuid; t2 uuid; kra uuid; r jsonb;
BEGIN
    PERFORM pg_temp.fx_world();
    kra := pg_temp.fx_kra('KRA-PLAT');

    -- 1) hanya Application Architect membentuk platform; SBU Architect ditolak
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, entity_id)
        VALUES ('BASE','BASE','umum','b','t','low','s',%L)$f$, pg_temp.fx('hold')), '42501', 'SBU membuat platform');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, referensi_id, entity_id)
    VALUES ('BASE', 'Business Automation & Shared Ecosystem', 'umum', 'Chief Digital', 'Tim Platform', 'medium', '99.9%', kra, pg_temp.fx('hold')) RETURNING id INTO base;
    IF (SELECT jenis_node FROM eaw.application WHERE id = base) <> 'platform' THEN RAISE EXCEPTION 'tanpa platform induk = platform'; END IF;

    -- 2) workspace yang sudah ada didaftarkan lebih dulu (belum ditempatkan), lalu ditempatkan; platform wajib platform
    legacy := NULL;
    INSERT INTO eaw.application (kode, nama, jenis, jenis_node, owner_bisnis, owner_teknis, risiko_ai, slo, adopsi, referensi_id, entity_id)
    VALUES ('PULSE', 'PULSE', 'umum', 'workspace', 'HR', 'Tim HR', 'low', '99%', true, kra, pg_temp.fx('hold')) RETURNING id INTO legacy;
    IF (SELECT platform FROM eaw.application WHERE id = legacy) IS NOT NULL THEN RAISE EXCEPTION 'workspace baru belum ditempatkan'; END IF;
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('application', %L, 'Divalidasi')$f$, legacy), '23514', 'workspace belum ditempatkan tidak dapat divalidasi');
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.application SET platform = 'PULSE' WHERE id = %L$f$, legacy), '23503', 'induk harus platform');
    UPDATE eaw.application SET platform = 'BASE' WHERE id = legacy;
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.application SET jenis_node = 'platform' WHERE id = %L$f$, legacy), '23514', 'jenis node tidak berubah');

    -- 3) profil platform wajib sebelum Divalidasi (UI/UX + tech stack)
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('application', %L, 'Divalidasi')$f$, base), '23514', 'platform tanpa profil');
    UPDATE eaw.application SET ui_standard = 'Shell MF 2.0 + design system Kalla', tech_stack = 'NestJS 11, React 18, PostgreSQL 18, Keycloak' WHERE id = base;
    PERFORM pg_temp.fx_complete(base);
    PERFORM eaw.transition('application', base, 'Divalidasi');

    -- 4) workspace tidak boleh melampaui platform induknya
    PERFORM pg_temp.fx_complete(legacy);
    PERFORM eaw.transition('application', legacy, 'Divalidasi');                       -- adopsi: bebas tiket ARB
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('application', %L, 'Ditetapkan', 'Keputusan ARB PULSE')$f$, legacy), '23514', 'anak melampaui induk (Divalidasi)');
    PERFORM eaw.transition('application', base, 'Ditetapkan', 'Keputusan ARB: standar platform BASE');
    PERFORM eaw.transition('application', legacy, 'Ditetapkan', 'Keputusan ARB PULSE adopsi');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('application', %L, 'Dipublikasi')$f$, legacy), '23514', 'anak Dipublikasi sebelum induk Dipublikasi');
    PERFORM eaw.transition('application', base, 'Dipublikasi');
    PERFORM eaw.transition('application', legacy, 'Dipublikasi');
    PERFORM pg_temp.as_owner();
    IF (SELECT parent_id FROM eaw.application_registry WHERE id = legacy) IS DISTINCT FROM base THEN RAISE EXCEPTION 'registry: parent_id workspace = platform'; END IF;

    -- 5) AEGIS: diajukan Risk Holding lewat tiket ARB; workspace baru wajib tertaut tiket APPROVED di entitas yang sama
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    INSERT INTO eaw.arb_clearance (proposed_by, entity_id, initiative_name, business_case, estimated_cost)
    VALUES (pg_temp.fx('u_sbu_a'), pg_temp.fx('aspal'), 'AEGIS', 'Enterprise Risk Management', 1000) RETURNING id INTO t;
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, jenis_node, owner_bisnis, owner_teknis, risiko_ai, slo, arb_clearance_id, entity_id)
        VALUES ('AEGIS','AEGIS','umum','workspace','b','t','low','s',%L,%L)$f$, t, pg_temp.fx('aspal')), '23514', 'tiket belum APPROVED');
    PERFORM eaw.arb_transition(t, 'IN_REVIEW', NULL);
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    PERFORM eaw.arb_transition(t, 'APPROVED', 'Disetujui: AEGIS masuk BASE');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis, jenis_node, owner_bisnis, owner_teknis, risiko_ai, slo, arb_clearance_id, entity_id)
        VALUES ('AEGIS','AEGIS','umum','workspace','b','t','low','s',%L,%L)$f$, t, pg_temp.fx('toyota')), '23514', 'entitas berbeda dengan pengaju tiket');
    INSERT INTO eaw.application (kode, nama, jenis, jenis_node, owner_bisnis, owner_teknis, risiko_ai, slo, arb_clearance_id, referensi_id, entity_id)
    VALUES ('AEGIS', 'AEGIS', 'umum', 'workspace', 'Risk', 'Tim Risk', 'low', '99%', t, kra, pg_temp.fx('aspal')) RETURNING id INTO ws;
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.application SET platform = 'BASE' WHERE id = %L$f$, ws), '42501', 'pemilik tidak menempatkan workspacenya');
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.application SET adopsi = true WHERE id = %L$f$, ws), '42501', 'pemilik tidak menandai adopsi');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    UPDATE eaw.application SET platform = 'BASE' WHERE id = ws;                          -- Application Architect memasukkan AEGIS ke BASE
    PERFORM pg_temp.fx_complete(ws);
    PERFORM eaw.transition('application', ws, 'Divalidasi');

    -- 6) workspace tanpa tiket ARB dan bukan adopsi ditolak saat validasi
    INSERT INTO eaw.application (kode, nama, jenis, jenis_node, owner_bisnis, owner_teknis, risiko_ai, slo, platform, referensi_id, entity_id)
    VALUES ('TANPA-ARB', 'T', 'umum', 'workspace', 'b', 't', 'low', 's', 'BASE', kra, pg_temp.fx('hold')) RETURNING id INTO t2;
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('application', %L, 'Divalidasi')$f$, t2), '23514', 'tanpa tiket ARB / adopsi');

    -- 7) memindahkan ke platform lain: workspace Draf; platform kedua dibentuk Application Architect
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, entity_id)
    VALUES ('PANRITA-X', 'Platform X', 'khusus', 'b', 't', 'low', 's', pg_temp.fx('hold')) RETURNING id INTO base2;
    PERFORM eaw.transition('application', ws, 'Draf', 'Dipindah ke platform lain');
    UPDATE eaw.application SET platform = 'PANRITA-X' WHERE id = ws;
    IF (SELECT platform FROM eaw.application WHERE id = ws) <> 'PANRITA-X' THEN RAISE EXCEPTION 'workspace harus pindah platform'; END IF;
    UPDATE eaw.application SET platform = NULL WHERE id = ws;                            -- Draf boleh belum ditempatkan
    PERFORM pg_temp.as_owner();
    IF NOT EXISTS (SELECT 1 FROM shared.audit_logs WHERE table_name = 'application' AND record_id = ws AND action = 'update') THEN RAISE EXCEPTION 'pemindahan harus tercatat di audit'; END IF;
END $$;
ROLLBACK;
