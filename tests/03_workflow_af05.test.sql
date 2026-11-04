-- =====================================================================
-- 03_workflow_af05.test.sql : alur Draf > Divalidasi > Ditetapkan > Dipublikasi > Direviu (AF-05, EAW-05/07)
--   izin per transisi, cakupan, empat mata, validasi KRA, jejak append-only, proyeksi registry ke CMP
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE kra uuid; a uuid; own uuid; r jsonb; n int; reg record;
BEGIN
    PERFORM pg_temp.fx_world();
    kra := pg_temp.fx_kra('KRA-APP-1');

    -- aplikasi disusun SBU Architect Aspal
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, ui_standard, tech_stack, entity_id)
    VALUES ('PLAT-WF', 'Platform WF', 'umum', 'Biz', 'Tim', 'none', '99%', 'Shell MF 2.0 + design system Kalla', 'NestJS, React 18, PostgreSQL 18', pg_temp.fx('aspal')) RETURNING id INTO a;
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));

    -- 1) tanpa izin eaw.validation.approve (SBU) -> 403
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('application', %L, 'Divalidasi')$f$, a), '42501', 'SBU memvalidasi');

    -- 2) EA Office memvalidasi: ditolak bila belum tertaut KRA; pesan menyebut objek dan yang kurang (EAW-05)
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    BEGIN
        PERFORM eaw.transition('application', a, 'Divalidasi');
        RAISE EXCEPTION 'validasi tanpa KRA seharusnya ditolak';
    EXCEPTION WHEN check_violation THEN
        IF SQLERRM NOT LIKE '%Platform WF%' OR SQLERRM NOT LIKE '%KRA%' THEN RAISE EXCEPTION 'pesan harus menyebut objek dan KRA: %', SQLERRM; END IF;
    END;
    -- penyusun menautkan KRA (objek masih Draf)
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    UPDATE eaw.application SET referensi_id = kra WHERE id = a;
    -- EAW-05: relasi wajib kurang -> ditolak (pesan menyebut relasi), lalu dilengkapi
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('application', %L, 'Divalidasi')$f$, a), '23514', 'relasi wajib belum lengkap');
    PERFORM pg_temp.fx_complete(a);

    -- 3) transisi tak valid / tanpa catatan
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('application', %L, 'Dipublikasi')$f$, a), '23514', 'Draf -> Dipublikasi melompat');
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('application', %L, 'Divalidasi')$f$, gen_random_uuid()), 'P0002', 'objek tidak ada');
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('tidak_dikenal', %L, 'Divalidasi')$f$, a), '22023', 'jenis objek tidak dikenal');

    -- 4) validasi berhasil setelah relasi wajib dilengkapi (EAW-05 memblokir)
    r := eaw.transition('application', a, 'Divalidasi', NULL);
    IF r->>'to' <> 'Divalidasi' OR jsonb_array_length(r->'warnings') <> 0 THEN RAISE EXCEPTION 'validasi harus berhasil tanpa peringatan: %', r; END IF;

    -- 5) objek Divalidasi tidak dapat disunting di tempat (oleh penyusun sekalipun)
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.application SET nama = 'diubah diam-diam' WHERE id = %L$f$, a), '23514', 'sunting objek Divalidasi');

    -- 6) Ditetapkan: hanya ARB (eaw.baseline.approve), butuh catatan, dan bukan oleh penyusunnya sendiri
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('application', %L, 'Ditetapkan', 'Keputusan ARB 2026-01')$f$, a), '42501', 'EA Office tidak menetapkan');
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('application', %L, 'Ditetapkan', 'ok')$f$, a), '23514', 'catatan terlalu pendek');
    r := eaw.transition('application', a, 'Ditetapkan', 'Keputusan ARB No. 12/2026 (ADR D-15)');
    IF r->>'to' <> 'Ditetapkan' THEN RAISE EXCEPTION 'penetapan ARB gagal: %', r; END IF;

    -- 7) empat mata: ARB tidak menetapkan objek yang ia susun sendiri
    RESET ROLE;
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, ui_standard, tech_stack, referensi_id, entity_id)
    VALUES ('PLAT-OWN', 'Milik ARB', 'umum', 'b', 't', 'none', 's', 'ui', 'stack', kra, pg_temp.fx('hold')) RETURNING id INTO own;
    PERFORM pg_temp.fx_complete(own);
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM eaw.transition('application', own, 'Divalidasi');
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('application', %L, 'Ditetapkan', 'menetapkan milik sendiri')$f$, own), '42501', 'ARB menetapkan objeknya sendiri');

    -- 8) Dipublikasi oleh EA Office -> proyeksi registry untuk CMP
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM eaw.transition('application', a, 'Dipublikasi');
    PERFORM pg_temp.as_owner();
    SELECT * INTO reg FROM eaw.application_registry WHERE id = a;
    IF reg.code <> 'PLAT-WF' OR reg.application_kind <> 'platform' OR reg.qualified_code <> 'PLAT-WF' OR reg.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'registry harus memuat aplikasi Dipublikasi: %', reg;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'pub_eap_ref' AND tablename = 'application_registry') THEN RAISE EXCEPTION 'pub_eap_ref harus memuat registry'; END IF;

    -- workspace di bawah platform: registry mengisi parent_id + qualified_code
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, platform, workspace, adopsi, referensi_id, entity_id)
    VALUES ('WS-ONE', 'Workspace Satu', 'khusus', 'b', 't', 'none', 's', 'PLAT-WF', 'one', true, kra, pg_temp.fx('aspal')) RETURNING id INTO own;
    PERFORM pg_temp.fx_complete(own);
    PERFORM eaw.transition('application', own, 'Divalidasi');
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));  PERFORM eaw.transition('application', own, 'Ditetapkan', 'Keputusan ARB workspace');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));  PERFORM eaw.transition('application', own, 'Dipublikasi');
    PERFORM pg_temp.as_owner();
    SELECT * INTO reg FROM eaw.application_registry WHERE id = own;
    IF reg.parent_id IS DISTINCT FROM a OR reg.qualified_code <> 'PLAT-WF/WS-ONE' OR reg.application_kind <> 'workspace' THEN RAISE EXCEPTION 'registry workspace salah: %', reg; END IF;

    -- 9) reviu (AF-07): Direviu menarik aplikasi dari registry CMP; revisi kembali ke Draf
    PERFORM pg_temp.as_user(pg_temp.fx('u_aud'));
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('application', %L, 'Direviu', 'reviu berkala')$f$, a), '42501', 'Auditor tidak mereviu');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM eaw.transition('application', a, 'Direviu', 'Reviu berkala AF-07 Q1');
    PERFORM pg_temp.as_owner();
    IF (SELECT deleted_at FROM eaw.application_registry WHERE id = a) IS NULL THEN RAISE EXCEPTION 'Direviu harus menandai registry terhapus'; END IF;
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('application', %L, 'Draf')$f$, a), '23514', 'kembali ke Draf butuh catatan');
    PERFORM eaw.transition('application', a, 'Draf', 'Revisi: perbarui SLO');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    UPDATE eaw.application SET slo = '99.9%' WHERE id = a;                       -- Draf lagi: boleh disunting

    -- 10) jejak append-only: berurutan, lengkap dengan pelaku & catatan
    PERFORM pg_temp.as_owner();
    SELECT count(*) INTO n FROM eaw.workflow WHERE objek_type = 'application' AND objek_id = a;
    IF n <> 5 THEN RAISE EXCEPTION 'harus 5 baris workflow (valid, tetap, publikasi, reviu, draf); ditemukan %', n; END IF;
    IF (SELECT string_agg(status_ke, '>' ORDER BY waktu) FROM eaw.workflow WHERE objek_id = a) <> 'Divalidasi>Ditetapkan>Dipublikasi>Direviu>Draf' THEN
        RAISE EXCEPTION 'urutan workflow salah';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM eaw.workflow WHERE objek_id = a AND status_ke = 'Ditetapkan' AND pelaku = pg_temp.fx('u_arb') AND catatan LIKE '%ADR D-15%') THEN
        RAISE EXCEPTION 'workflow harus mencatat pelaku dan catatan';
    END IF;
    PERFORM pg_temp.expect_error($f$UPDATE eaw.workflow SET catatan = 'dipalsukan'$f$, '42501', 'UPDATE workflow');
    PERFORM pg_temp.expect_error($f$DELETE FROM eaw.workflow$f$, '42501', 'DELETE workflow');
    PERFORM pg_temp.expect_error($f$TRUNCATE eaw.workflow$f$, '42501', 'TRUNCATE workflow');
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    PERFORM pg_temp.expect_error($f$INSERT INTO eaw.workflow (objek_type, objek_id, status_dari, status_ke, pelaku) VALUES ('application', gen_random_uuid(), 'Draf', 'Dipublikasi', gen_random_uuid())$f$, '42501', 'aplikasi menulis workflow langsung');

    -- 11) di luar cakupan: SBU Toyota tidak melihat/menyentuh Draf milik Aspal
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_t'));
    IF (SELECT count(*) FROM eaw.application WHERE id = a) <> 0 THEN RAISE EXCEPTION 'Draf entitas lain tidak boleh terlihat'; END IF;
    PERFORM pg_temp.as_owner();
END $$;
ROLLBACK;
