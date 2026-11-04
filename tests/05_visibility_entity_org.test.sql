-- =====================================================================
-- 05_visibility_entity_org.test.sql : visibilitas berjenjang (SAF 6.1) dan view eaw.entity_org (ADR-CMP-003)
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE kra uuid; d_asp uuid; d_toy uuid; d_unit uuid; p_toy uuid; n int; lvl text; cf boolean; ika smallint;
BEGIN
    PERFORM pg_temp.fx_world();
    kra := pg_temp.fx_kra('KRA-VIS');
    -- data disiapkan sebagai pemilik: Draf di Aspal, Draf di unit Aspal (turunan), Draf di Toyota, dan satu Dipublikasi di Toyota
    INSERT INTO eaw.application (kode, nama, jenis_node, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, entity_id) VALUES ('V-ASP', 'Asp', 'workspace', 'umum', 'b', 't', 'none', 's', pg_temp.fx('aspal')) RETURNING id INTO d_asp;
    INSERT INTO eaw.application (kode, nama, jenis_node, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, entity_id) VALUES ('V-UNIT', 'Unit', 'workspace', 'umum', 'b', 't', 'none', 's', pg_temp.fx('unit_aspal')) RETURNING id INTO d_unit;
    INSERT INTO eaw.application (kode, nama, jenis_node, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, entity_id) VALUES ('V-TOY', 'Toy', 'workspace', 'umum', 'b', 't', 'none', 's', pg_temp.fx('toyota')) RETURNING id INTO d_toy;
    INSERT INTO eaw.application (kode, nama, jenis_node, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, entity_id) VALUES ('V-PUB', 'Pub', 'platform', 'umum', 'b', 't', 'none', 's', pg_temp.fx('toyota')) RETURNING id INTO p_toy;
    PERFORM set_config('eaw.in_transition', 'on', true);
    UPDATE eaw.application SET status = 'Dipublikasi' WHERE id = p_toy;
    PERFORM set_config('eaw.in_transition', 'off', true);
    WITH s AS (INSERT INTO eaw.service (nama, tipe, kategori, entity_id) VALUES ('S', 'internal', 'utama', pg_temp.fx('aspal')) RETURNING id) INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) SELECT 'application', d_asp, 'service', s.id, 'serving' FROM s;

    -- tanpa konteks sesi sama sekali: default-deny, hanya yang Dipublikasi
    PERFORM pg_temp.as_owner();
    SET LOCAL ROLE eap_app;
    SELECT count(*) INTO n FROM eaw.application;
    IF n <> 1 THEN RAISE EXCEPTION 'tanpa konteks hanya yang Dipublikasi terlihat (1), ditemukan %', n; END IF;
    RESET ROLE;

    -- Karyawan (tanpa peran): hanya Dipublikasi
    PERFORM pg_temp.as_user(pg_temp.fx('u_emp'));
    SELECT count(*) INTO n FROM eaw.application;
    IF n <> 1 OR NOT EXISTS (SELECT 1 FROM eaw.application WHERE kode = 'V-PUB') THEN RAISE EXCEPTION 'Karyawan hanya melihat yang Dipublikasi'; END IF;

    -- SBU Aspal: draf entitasnya + turunan (unit) + yang Dipublikasi; bukan Draf Toyota
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    SELECT count(*) INTO n FROM eaw.application;
    IF n <> 3 THEN RAISE EXCEPTION 'SBU Aspal melihat 3 (Asp, Unit, Pub), ditemukan %', n; END IF;
    IF EXISTS (SELECT 1 FROM eaw.application WHERE kode = 'V-TOY') THEN RAISE EXCEPTION 'Draf entitas lain bocor'; END IF;
    -- boleh menyusun di turunan, bukan di entitas lain
    INSERT INTO eaw.application (kode, nama, jenis_node, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, entity_id) VALUES ('V-UNIT2', 'U2', 'workspace', 'umum', 'b', 't', 'none', 's', pg_temp.fx('unit_aspal'));
    IF (SELECT nama FROM (SELECT nama FROM eaw.application WHERE kode = 'V-PUB') s) <> 'Pub' THEN RAISE EXCEPTION 'baris Dipublikasi tetap terbaca'; END IF;
    -- UPDATE di luar cakupan: RLS menyaring baris (0 terpengaruh), bukan galat
    UPDATE eaw.application SET nama = 'diserang' WHERE kode IN ('V-TOY', 'V-PUB');
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'SBU tidak boleh mengubah baris di luar cakupan (terpengaruh %)', n; END IF;
    -- relasi & KRA draf tertutup bagi SBU
    IF (SELECT count(*) FROM eaw.relation) <> 1 THEN RAISE EXCEPTION 'SBU melihat relasi aplikasinya sendiri (1), bukan milik entitas lain'; END IF;
    PERFORM pg_temp.expect_error($f$INSERT INTO eaw.reference (domain, kode, nama) VALUES ('aplikasi', 'KRA-SBU', 'x')$f$, '42501', 'SBU menyusun KRA');

    -- Auditor: lihat semua, read-only
    PERFORM pg_temp.as_user(pg_temp.fx('u_aud'));
    SELECT count(*) INTO n FROM eaw.application;
    IF n <> 5 THEN RAISE EXCEPTION 'Auditor melihat semua (5), ditemukan %', n; END IF;
    IF (SELECT count(*) FROM eaw.relation) <> 1 THEN RAISE EXCEPTION 'Auditor melihat relasi'; END IF;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.application (kode, nama, jenis_node, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, entity_id) VALUES ('AUD','A', 'workspace', 'umum','b','t','none','s',%L)$f$, pg_temp.fx('aspal')), '42501', 'Auditor menulis');
    PERFORM pg_temp.expect_error($f$SELECT count(*) FROM shared.audit_logs$f$, '42501', 'aplikasi membaca audit_logs langsung');

    -- Domain Architect (holding): lihat semua + susun di mana saja; menyusun KRA
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    IF (SELECT count(*) FROM eaw.application) <> 5 THEN RAISE EXCEPTION 'EA Office melihat semua'; END IF;
    INSERT INTO eaw.reference (domain, kode, nama) VALUES ('aplikasi', 'KRA-DRAFT', 'KRA draf');
    PERFORM pg_temp.as_user(pg_temp.fx('u_emp'));
    IF (SELECT count(*) FROM eaw.reference WHERE kode = 'KRA-DRAFT') <> 0 THEN RAISE EXCEPTION 'KRA Draf tidak terlihat pengguna biasa'; END IF;

    -- ---------- view eaw.entity_org (hanya bila migrasi 0001 sudah diterapkan) ----------
    PERFORM pg_temp.as_owner();
    IF to_regclass('eaw.entity_org') IS NULL THEN RAISE NOTICE 'eaw.entity_org belum ada (migrasi 0001 belum diterapkan) — bagian view dilewati'; RETURN; END IF;
    SELECT kaf_level, kaf_level_confirmed INTO lvl, cf FROM eaw.entity_org WHERE code = 'T-ECO-CON';
    IF lvl <> 'ecosystem' OR cf THEN RAISE EXCEPTION 'ecosystem -> kaf_level ecosystem (belum dikonfirmasi): % %', lvl, cf; END IF;
    IF (SELECT kaf_level FROM eaw.entity_org WHERE code = 'T-ASPAL') <> 'sbu' THEN RAISE EXCEPTION 'sbu -> sbu'; END IF;
    IF (SELECT kaf_level FROM eaw.entity_org WHERE code = 'T-ASPAL-BU') <> 'unit' THEN RAISE EXCEPTION 'business_unit -> unit'; END IF;
    IF (SELECT kaf_level FROM eaw.entity_org WHERE code = 'T-KALLA') <> 'holding' THEN RAISE EXCEPTION 'holding -> holding'; END IF;
    -- atribut arsitektur milik EAP: hanya peran holding-wide yang mengubah
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.entity_org_metadata (entity_id, ika_level) VALUES (%L, 3)$f$, pg_temp.fx('aspal')), '42501', 'SBU mengubah metadata entitas');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.entity_org_metadata (entity_id, kaf_level, ika_level) VALUES (pg_temp.fx('aspal'), 'sbu', 3);
    PERFORM pg_temp.as_user(pg_temp.fx('u_emp'));
    SELECT ika_level, kaf_level_confirmed INTO ika, cf FROM eaw.entity_org WHERE code = 'T-ASPAL';
    IF ika <> 3 OR NOT cf THEN RAISE EXCEPTION 'metadata EAP harus tampak di view: % %', ika, cf; END IF;
    -- view bersifat baca-saja (replika ref tidak dapat ditulis; view bukan tabel)
    PERFORM pg_temp.expect_error($f$INSERT INTO eaw.entity_org (id, code, name, group_kind) VALUES (gen_random_uuid(), 'X', 'x', 'sbu')$f$, NULL, 'menulis ke view entity_org');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM pg_temp.expect_error($f$UPDATE ref.business_groups SET name = 'dipalsukan'$f$, '42501', 'menulis replika ref');
    PERFORM pg_temp.as_owner();

    -- ---------- jembatan replikasi: perubahan di tabel cermin (penerima langganan) tampil di ref.* ----------
    INSERT INTO mdm.business_groups (id, code, name, group_kind, is_active, row_version) VALUES ('00000000-0000-4000-8000-0000000000aa', 'T-MIRROR', 'Cermin', 'sbu', true, 1);
    IF (SELECT name FROM ref.business_groups WHERE code = 'T-MIRROR') <> 'Cermin' THEN RAISE EXCEPTION 'insert cermin harus tampil di ref'; END IF;
    UPDATE mdm.business_groups SET name = 'Cermin 2', row_version = 2 WHERE code = 'T-MIRROR';
    IF (SELECT name || row_version FROM ref.business_groups WHERE code = 'T-MIRROR') <> 'Cermin 22' THEN RAISE EXCEPTION 'update cermin harus tampil di ref'; END IF;
    INSERT INTO iam.users (id, username, display_name, is_active, row_version) VALUES (gen_random_uuid(), 'cermin.user', 'C', true, 1);
    IF NOT EXISTS (SELECT 1 FROM ref.users WHERE username = 'cermin.user') THEN RAISE EXCEPTION 'iam.users cermin -> ref.users'; END IF;
    DELETE FROM mdm.business_groups WHERE code = 'T-MIRROR';
    IF EXISTS (SELECT 1 FROM ref.business_groups WHERE code = 'T-MIRROR') THEN RAISE EXCEPTION 'delete cermin harus menghapus di ref'; END IF;
    -- ref tetap tidak dapat ditulis oleh aplikasi/sesi biasa
    PERFORM pg_temp.expect_error($f$UPDATE ref.business_groups SET name = 'x'$f$, '42501', 'tulis langsung ke ref (sesi biasa)');
END $$;
ROLLBACK;
