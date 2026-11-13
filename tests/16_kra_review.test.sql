-- =====================================================================
-- 16_kra_review.test.sql : AF-07 — KRA naik versi => objek tertaut berstatus Dipublikasi menjadi Direviu (di seluruh entitas), tercatat di eaw.workflow
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE kra uuid; kra2 uuid; kra_p uuid; a1 uuid; a2 uuid; a3 uuid; p1 uuid; p2 uuid; n int; r record; m jsonb;
BEGIN
    PERFORM pg_temp.fx_world();
    kra  := pg_temp.fx_kra('KRA-REVIEW-1');
    kra2 := pg_temp.fx_kra('KRA-REVIEW-2');
    kra_p := pg_temp.fx_kra('KRA-REVIEW-P', 'proses_bisnis');            -- 296: proses wajib KRA berdomain proses_bisnis

    -- a1 (entitas Aspal) tertaut KRA-1 dan dipublikasikan; a2 hanya Ditetapkan; a3 (KRA-2) dipublikasikan; p1 (Holding, KRA-P) dipublikasikan, p2 (KRA-P) masih Draf
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, ui_standard, tech_stack, referensi_id, entity_id)
    VALUES ('RV-1', 'App Terbit', 'umum', 'b', 't', 'low', 's', 'ui', 'stack', kra, pg_temp.fx('aspal')) RETURNING id INTO a1;
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, ui_standard, tech_stack, referensi_id, entity_id)
    VALUES ('RV-2', 'App Ditetapkan', 'umum', 'b', 't', 'low', 's', 'ui', 'stack', kra, pg_temp.fx('toyota')) RETURNING id INTO a2;
    INSERT INTO eaw.application (kode, nama, jenis, owner_bisnis, owner_teknis, risiko_ai, slo, ui_standard, tech_stack, referensi_id, entity_id)
    VALUES ('RV-3', 'App KRA Lain', 'umum', 'b', 't', 'low', 's', 'ui', 'stack', kra2, pg_temp.fx('aspal')) RETURNING id INTO a3;
    INSERT INTO eaw.process (nama, level, entity_id, referensi_id) VALUES ('Proses Terbit', 1, pg_temp.fx('hold'), kra_p) RETURNING id INTO p1;
    INSERT INTO eaw.process (nama, level, entity_id, referensi_id) VALUES ('Proses Draf', 1, pg_temp.fx('hold'), kra_p) RETURNING id INTO p2;
    PERFORM pg_temp.fx_complete(a1); PERFORM pg_temp.fx_complete(a2); PERFORM pg_temp.fx_complete(a3);
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM eaw.transition('application', a1, 'Divalidasi'); PERFORM eaw.transition('application', a2, 'Divalidasi'); PERFORM eaw.transition('application', a3, 'Divalidasi');
    PERFORM eaw.transition('process', p1, 'Divalidasi');
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    PERFORM eaw.transition('application', a1, 'Ditetapkan', 'Keputusan ARB uji 1');  PERFORM eaw.transition('application', a2, 'Ditetapkan', 'Keputusan ARB uji 2');
    PERFORM eaw.transition('application', a3, 'Ditetapkan', 'Keputusan ARB uji 3');  PERFORM eaw.transition('process', p1, 'Ditetapkan', 'Keputusan ARB uji 4');
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM eaw.transition('application', a1, 'Dipublikasi'); PERFORM eaw.transition('application', a3, 'Dipublikasi'); PERFORM eaw.transition('process', p1, 'Dipublikasi');

    -- 1) pratinjau dampak: hanya lintas-holding; SBU ditolak
    SELECT sum(jumlah) INTO n FROM eaw.kra_impact(kra); IF n <> 2 THEN RAISE EXCEPTION 'dampak KRA-1: 2 objek tertaut (a1,a2), dapat %', n; END IF;
    SELECT sum(jumlah) INTO n FROM eaw.kra_impact(kra_p); IF n <> 2 THEN RAISE EXCEPTION 'dampak KRA-P: 2 objek tertaut (p1,p2), dapat %', n; END IF;
    SELECT jumlah INTO n FROM eaw.kra_impact(kra) WHERE objek_type = 'application' AND status = 'Dipublikasi'; IF n <> 1 THEN RAISE EXCEPTION 'pratinjau: 1 aplikasi Dipublikasi'; END IF;
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    PERFORM pg_temp.expect_error(format($f$SELECT * FROM eaw.kra_impact(%L)$f$, kra), '42501', 'SBU tidak melihat dampak lintas-grup');

    -- 2) KRA Dipublikasi tidak disunting di tempat (AF-05): alur Dipublikasi -> Direviu -> Draf lebih dulu; lalu perubahan non-versi TIDAK memicu reviu objek
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.reference SET versi = '1.5' WHERE id = %L$f$, kra), '23514', 'KRA Dipublikasi tak dapat disunting di tempat');
    PERFORM eaw.transition('reference', kra, 'Direviu', 'Reviu berkala KRA uji'); PERFORM eaw.transition('reference', kra, 'Draf', 'Revisi KRA ke versi baru');
    PERFORM eaw.transition('reference', kra_p, 'Direviu', 'Reviu berkala KRA-P uji'); PERFORM eaw.transition('reference', kra_p, 'Draf', 'Revisi KRA-P ke versi baru');
    PERFORM eaw.transition('reference', kra2, 'Direviu', 'Reviu berkala KRA-2 uji'); PERFORM eaw.transition('reference', kra2, 'Draf', 'Revisi KRA-2 uji');
    UPDATE eaw.reference SET nama = 'Nama baru', deskripsi = 'x' WHERE id = kra;
    IF (SELECT status FROM eaw.application WHERE id = a1) <> 'Dipublikasi' THEN RAISE EXCEPTION 'perubahan non-versi tidak boleh memicu reviu'; END IF;
    UPDATE eaw.reference SET versi = versi WHERE id = kra;
    IF (SELECT status FROM eaw.application WHERE id = a1) <> 'Dipublikasi' THEN RAISE EXCEPTION 'versi tidak berubah => tidak ada reviu'; END IF;

    -- 3) naik versi: a1 (Aspal) dan p1 (Holding) menjadi Direviu; a2 (Ditetapkan), p2 (Draf), a3 (KRA lain) tidak berubah
    UPDATE eaw.reference SET versi = '2.0' WHERE id = kra;
    m := current_setting('eaw.af07_marked', true)::jsonb;
    IF (m->>'total')::int <> 1 OR (m->'byType'->>'application')::int <> 1 OR m->>'from' <> '1.0' OR m->>'to' <> '2.0' THEN RAISE EXCEPTION 'ringkasan kaskade KRA-1 salah: %', m; END IF;
    UPDATE eaw.reference SET versi = '2.0' WHERE id = kra_p;
    m := current_setting('eaw.af07_marked', true)::jsonb;
    IF (m->>'total')::int <> 1 OR (m->'byType'->>'process')::int <> 1 THEN RAISE EXCEPTION 'ringkasan kaskade KRA-P salah: %', m; END IF;
    PERFORM pg_temp.as_owner();
    IF (SELECT status FROM eaw.application WHERE id = a1) <> 'Direviu' THEN RAISE EXCEPTION 'a1 harus Direviu'; END IF;
    IF (SELECT status FROM eaw.process WHERE id = p1) <> 'Direviu' THEN RAISE EXCEPTION 'p1 harus Direviu'; END IF;
    IF (SELECT status FROM eaw.application WHERE id = a2) <> 'Ditetapkan' THEN RAISE EXCEPTION 'a2 (Ditetapkan) tidak berubah'; END IF;
    IF (SELECT status FROM eaw.process WHERE id = p2) <> 'Draf' THEN RAISE EXCEPTION 'p2 (Draf) tidak berubah'; END IF;
    IF (SELECT status FROM eaw.application WHERE id = a3) <> 'Dipublikasi' THEN RAISE EXCEPTION 'a3 (KRA lain) tidak berubah'; END IF;

    -- 4) jejak: eaw.workflow memuat Dipublikasi -> Direviu, pelaku = pengubah KRA, catatan menyebut KRA dan versi
    SELECT * INTO r FROM eaw.workflow WHERE objek_type = 'application' AND objek_id = a1 AND status_ke = 'Direviu';
    IF r.status_dari <> 'Dipublikasi' OR r.pelaku <> pg_temp.fx('u_app') OR r.catatan NOT LIKE '%KRA-REVIEW-1%1.0%2.0%' THEN RAISE EXCEPTION 'jejak workflow AF-07 salah: %', r; END IF;
    SELECT count(*) INTO n FROM eaw.workflow WHERE status_ke = 'Direviu' AND catatan LIKE 'AF-07:%'; IF n <> 2 THEN RAISE EXCEPTION 'dua jejak AF-07 diharapkan, dapat %', n; END IF;

    -- 5) objek Direviu mengikuti alur biasa: kembali ke Divalidasi oleh EA Office; kenaikan versi berikutnya tidak menyentuh yang bukan Dipublikasi
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    -- 296: selama KRA masih direvisi (Draf), objek tertaut tidak dapat divalidasi ulang
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('application', %L, 'Divalidasi')$f$, a1), '23514', 'validasi ulang saat KRA belum terbit lagi');
    PERFORM pg_temp.as_owner();
    PERFORM set_config('eaw.in_transition', 'on', true); UPDATE eaw.reference SET status = 'Dipublikasi' WHERE id = kra; PERFORM set_config('eaw.in_transition', 'off', true);
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    PERFORM eaw.transition('application', a1, 'Divalidasi');                 -- KRA v2.0 terbit → boleh
    PERFORM pg_temp.as_owner();
    PERFORM set_config('eaw.in_transition', 'on', true); UPDATE eaw.reference SET status = 'Draf' WHERE id = kra; PERFORM set_config('eaw.in_transition', 'off', true);
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    UPDATE eaw.reference SET versi = '2.1' WHERE id = kra;
    m := current_setting('eaw.af07_marked', true)::jsonb;
    IF (m->>'total')::int <> 0 THEN RAISE EXCEPTION 'p1 sudah Direviu & a1 Divalidasi: tidak ada yang berpindah, dapat %', m; END IF;

    -- 6) tanpa sesi pengguna perubahan versi ditolak (jejak reviu wajib)
    PERFORM pg_temp.as_owner();
    PERFORM set_config('app.user_id', '', true);
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.reference SET versi = '9.9' WHERE id = %L$f$, kra2), '42501', 'versi diubah tanpa pengguna');
END $$;
ROLLBACK;
