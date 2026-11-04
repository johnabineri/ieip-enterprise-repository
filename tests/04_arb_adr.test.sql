-- =====================================================================
-- 04_arb_adr.test.sql : ARB Clearance (empat mata, sertifikat) dan ADR (status hanya oleh ARB, isi terkunci)
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE t uuid; t2 uuid; r jsonb; adr1 uuid; adr2 uuid; n int;
BEGIN
    PERFORM pg_temp.fx_world();

    -- ---------- ARB ----------
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    INSERT INTO eaw.arb_clearance (proposed_by, entity_id, initiative_name, business_case, estimated_cost)
    VALUES (pg_temp.fx('u_sbu_a'), pg_temp.fx('aspal'), 'Sistem Penjadwalan Armada', 'Mengurangi idle time 12%', 150000000) RETURNING id INTO t;
    IF (SELECT status FROM eaw.arb_clearance WHERE id = t) <> 'SUBMITTED' THEN RAISE EXCEPTION 'tiket baru harus SUBMITTED'; END IF;
    IF (SELECT ticket_number FROM eaw.arb_clearance WHERE id = t) !~ '^ARB-[0-9]{4}-[0-9]{4}$' THEN RAISE EXCEPTION 'format nomor tiket'; END IF;

    -- pengaju tidak dapat memalsukan pengaju lain atau mengajukan di entitas lain
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.arb_clearance (proposed_by, entity_id, initiative_name, business_case) VALUES (%L, %L, 'x', 'y')$f$, pg_temp.fx('u_arb'), pg_temp.fx('aspal')), '42501', 'memalsukan pengaju');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.arb_clearance (proposed_by, entity_id, initiative_name, business_case) VALUES (%L, %L, 'x', 'y')$f$, pg_temp.fx('u_sbu_a'), pg_temp.fx('toyota')), '42501', 'entitas di luar cakupan');
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.arb_clearance SET status = 'APPROVED', certificate_id = 'CERT-PALSU' WHERE id = %L$f$, t), '42501', 'ubah status langsung');
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.arb_transition(%L, 'IN_REVIEW')$f$, t), '42501', 'pengaju meninjau tiketnya sendiri / tanpa izin');

    -- pengaju masih boleh menyunting tiket SUBMITTED
    UPDATE eaw.arb_clearance SET business_case = 'Mengurangi idle time 15%' WHERE id = t;

    -- peninjau (Domain Architect, gov.arb.write): SUBMITTED -> IN_REVIEW; tidak boleh memutus (tanpa gov.arb.approve)
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM eaw.arb_transition(t, 'IN_REVIEW', NULL);
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.arb_transition(%L, 'APPROVED')$f$, t), '42501', 'Domain Architect memutus');
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.arb_transition(%L, 'REVISION', 'perlu')$f$, t), '23514', 'catatan revisi terlalu pendek');
    PERFORM eaw.arb_transition(t, 'REVISION', 'Lengkapi analisis redundansi dengan SEDDI');

    -- pengaju mengirim ulang; hanya pengaju
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.arb_transition(%L, 'SUBMITTED')$f$, t), '42501', 'selain pengaju mengirim ulang');
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    PERFORM eaw.arb_transition(t, 'SUBMITTED');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM eaw.arb_transition(t, 'IN_REVIEW');

    -- Ketua ARB memutus: tolak butuh catatan; setuju menerbitkan sertifikat
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.arb_transition(%L, 'REJECTED', 'tidak')$f$, t), '23514', 'tolak tanpa alasan memadai');
    r := eaw.arb_transition(t, 'APPROVED', 'Disetujui dengan syarat integrasi SEDDI');
    IF r->>'certificate_id' !~ '^CERT-ARB-[0-9]{4}-[0-9]{4}$' THEN RAISE EXCEPTION 'sertifikat clearance tidak terbit: %', r; END IF;
    IF (SELECT decided_by FROM eaw.arb_clearance WHERE id = t) <> pg_temp.fx('u_arb') THEN RAISE EXCEPTION 'decided_by harus Ketua ARB'; END IF;
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.arb_transition(%L, 'REJECTED', 'sudah diputus, tidak boleh')$f$, t), '23514', 'putusan tidak dapat dibalik');
    -- tiket yang sudah diputus tidak dapat disunting pengaju
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.arb_clearance SET initiative_name = 'diubah' WHERE id = %L$f$, t), '23514', 'sunting tiket APPROVED');

    -- empat mata: Ketua ARB mengajukan tiket sendiri -> tidak dapat memutusnya
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    INSERT INTO eaw.arb_clearance (proposed_by, entity_id, initiative_name, business_case) VALUES (pg_temp.fx('u_arb'), pg_temp.fx('hold'), 'Inisiatif ARB', 'kasus') RETURNING id INTO t2;
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.arb_transition(%L, 'IN_REVIEW')$f$, t2), '42501', 'pengaju meninjau tiketnya sendiri');
    -- visibilitas: SBU Toyota tidak melihat tiket Aspal
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_t'));
    IF (SELECT count(*) FROM eaw.arb_clearance) <> 0 THEN RAISE EXCEPTION 'tiket entitas lain tidak boleh terlihat'; END IF;
    PERFORM pg_temp.as_owner();
    SELECT count(*) INTO n FROM eaw.workflow WHERE objek_type = 'arb_clearance' AND objek_id = t;
    IF n <> 5 THEN RAISE EXCEPTION 'workflow ARB harus mencatat 5 transisi, ditemukan %', n; END IF;

    -- ---------- ADR ----------
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    PERFORM pg_temp.expect_error($f$INSERT INTO eaw.adr (adr_code, title, context, decision) VALUES ('D-20', 't', 'c', 'd')$f$, '42501', 'SBU tanpa eaw.adr.write');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.adr (adr_code, title, context, decision) VALUES ('D-20', 'Gunakan Keycloak', 'SSO terpusat', 'OIDC PKCE') RETURNING id INTO adr1;
    PERFORM pg_temp.expect_error($f$INSERT INTO eaw.adr (adr_code, title, context, decision, status) VALUES ('D-21', 't', 'c', 'd', 'Accepted')$f$, '23514', 'lahir sebagai Accepted');
    PERFORM pg_temp.expect_error($f$INSERT INTO eaw.adr (adr_code, title, context, decision) VALUES ('d 20', 't', 'c', 'd')$f$, '23514', 'format kode');
    PERFORM pg_temp.expect_error($f$INSERT INTO eaw.adr (adr_code, title, context, decision) VALUES ('D-20', 't', 'c', 'd')$f$, '23505', 'kode ganda');
    UPDATE eaw.adr SET consequences = 'Ketergantungan pada Keycloak' WHERE id = adr1;                      -- Proposed: boleh disunting
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.adr SET status = 'Accepted' WHERE id = %L$f$, adr1), '42501', 'Domain Architect menerima ADR');
    -- Proposed hanya terlihat penyusun/lihat-semua; pengguna biasa tidak melihat
    PERFORM pg_temp.as_user(pg_temp.fx('u_emp'));
    IF (SELECT count(*) FROM eaw.adr) <> 0 THEN RAISE EXCEPTION 'ADR Proposed tidak boleh terlihat pengguna biasa'; END IF;
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    UPDATE eaw.adr SET status = 'Accepted' WHERE id = adr1;
    PERFORM pg_temp.as_user(pg_temp.fx('u_emp'));
    IF (SELECT count(*) FROM eaw.adr) <> 1 THEN RAISE EXCEPTION 'ADR Accepted terlihat semua pengguna'; END IF;
    -- isi terkunci setelah Accepted; penggantian lewat ADR baru (Superseded)
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.adr SET decision = 'diubah' WHERE id = %L$f$, adr1), '23514', 'sunting isi ADR Accepted');
    INSERT INTO eaw.adr (adr_code, title, context, decision) VALUES ('D-22', 'Ganti IdP', 'c', 'd') RETURNING id INTO adr2;
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.adr SET status = 'Superseded' WHERE id = %L$f$, adr1), '23514', 'Superseded tanpa superseded_by');
    UPDATE eaw.adr SET status = 'Superseded', superseded_by = adr2 WHERE id = adr1;
    -- tautan ADR -> elemen model
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.adr_link (adr_id, objek_type, objek_id) VALUES (adr2, 'application', gen_random_uuid());
    PERFORM pg_temp.as_owner();
END $$;
ROLLBACK;
