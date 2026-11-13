-- =====================================================================
-- 22_kra_conformance.test.sql : 296 — tautan KRA wajib se-domain (saat tulis) dan berlaku (saat naik status); data lama dilaporkan, tidak dirusak
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE k_app uuid; k_prc uuid; k_prc_draf uuid; k_svc uuid; p uuid; p2 uuid; legacy uuid; n int; msg text;
BEGIN
    PERFORM pg_temp.fx_world();
    k_app := pg_temp.fx_kra('KRA-K-APP', 'aplikasi');
    k_prc := pg_temp.fx_kra('KRA-K-PRC', 'proses_bisnis');
    k_svc := pg_temp.fx_kra('KRA-K-SVC', 'layanan');
    INSERT INTO eaw.reference (domain, kode, nama) VALUES ('proses_bisnis', 'KRA-K-PRC-DRAF', 'KRA proses (rancangan)') RETURNING id INTO k_prc_draf;

    -- 1) saat TULIS: KRA domain lain ditolak (INSERT dan UPDATE referensi_id), juga untuk SBU yang tidak melihat semua KRA
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.process (nama, level, entity_id, referensi_id) VALUES ('P salah', 1, %L, %L)$f$, pg_temp.fx('aspal'), k_app),
        '23514', 'proses menautkan KRA aplikasi');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO eaw.control (aspek, status_penerapan, entity_id, referensi_id) VALUES ('kerahasiaan', 'sebagian', %L, %L)$f$, pg_temp.fx('aspal'), k_svc),
        '23514', 'kontrol menautkan KRA layanan');
    INSERT INTO eaw.process (nama, level, entity_id, referensi_id) VALUES ('P benar', 1, pg_temp.fx('aspal'), k_prc) RETURNING id INTO p;
    PERFORM pg_temp.expect_error(format($f$UPDATE eaw.process SET referensi_id = %L WHERE id = %L$f$, k_app, p), '23514', 'UPDATE ke KRA domain lain');
    BEGIN
        UPDATE eaw.process SET referensi_id = k_svc WHERE id = p;
    EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    END;
    IF msg NOT LIKE '%KRA-K-SVC%layanan%proses bisnis%proses_bisnis%' THEN RAISE EXCEPTION 'pesan harus menyebut KRA, domainnya dan domain objek: %', msg; END IF;
    -- KRA Draf se-domain BOLEH ditautkan saat menyusun (walau SBU tidak melihatnya lewat RLS: aturan menilai KRA sebenarnya)
    PERFORM pg_temp.as_owner(); PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    INSERT INTO eaw.process (nama, level, entity_id, referensi_id) VALUES ('P KRA draf', 1, pg_temp.fx('aspal'), k_prc_draf) RETURNING id INTO p2;

    -- 2) saat NAIK STATUS: KRA wajib berlaku (Ditetapkan/Dipublikasi)
    BEGIN
        PERFORM eaw.transition('process', p2, 'Divalidasi');
        RAISE EXCEPTION 'validasi terhadap KRA Draf seharusnya ditolak';
    EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    END;
    IF msg NOT LIKE '%KRA-K-PRC-DRAF%Draf%belum berlaku%' THEN RAISE EXCEPTION 'pesan KRA belum berlaku: %', msg; END IF;
    PERFORM eaw.transition('process', p, 'Divalidasi');                                  -- KRA Dipublikasi se-domain → lolos
    -- KRA kemudian direvisi (Direviu): objek tertaut tertahan di langkah berikutnya sampai KRA terbit lagi
    PERFORM eaw.transition('reference', k_prc, 'Direviu', 'Reviu berkala KRA uji');
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('process', %L, 'Ditetapkan', 'Keputusan ARB uji')$f$, p), '23514', 'Ditetapkan saat KRA Direviu');
    PERFORM pg_temp.as_owner();
    PERFORM set_config('eaw.in_transition', 'on', true); UPDATE eaw.reference SET status = 'Dipublikasi' WHERE id = k_prc; PERFORM set_config('eaw.in_transition', 'off', true);
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    PERFORM eaw.transition('process', p, 'Ditetapkan', 'Keputusan ARB uji');

    -- 3) data LAMA tidak patuh (dibuat sebelum 296): tidak dirusak, tidak bisa naik, terlihat di eaw.kra_nonconformance
    PERFORM pg_temp.as_owner();
    ALTER TABLE eaw.service DISABLE TRIGGER trg_service_b_kra;
    INSERT INTO eaw.service (nama, tipe, kategori, entity_id, referensi_id) VALUES ('Layanan lama', 'internal', 'utama', pg_temp.fx('aspal'), k_app) RETURNING id INTO legacy;
    PERFORM set_config('eaw.in_transition', 'on', true); UPDATE eaw.service SET status = 'Divalidasi' WHERE id = legacy; PERFORM set_config('eaw.in_transition', 'off', true);
    ALTER TABLE eaw.service ENABLE TRIGGER trg_service_b_kra;
    UPDATE eaw.service SET updated_at = now() WHERE id = legacy;                          -- sentuhan lain (bukan referensi/status) tidak ditolak
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    SELECT count(*) INTO n FROM eaw.kra_nonconformance WHERE id = legacy AND alasan = 'kra-beda-domain' AND kra_kode = 'KRA-K-APP';
    IF n <> 1 THEN RAISE EXCEPTION 'view harus melaporkan layanan lama berKRA aplikasi'; END IF;
    IF EXISTS (SELECT 1 FROM eaw.kra_nonconformance WHERE id IN (p, p2)) THEN RAISE EXCEPTION 'objek Draf / patuh tidak dilaporkan'; END IF;
    PERFORM pg_temp.as_user(pg_temp.fx('u_arb'));
    PERFORM pg_temp.expect_error(format($f$SELECT eaw.transition('service', %L, 'Ditetapkan', 'Keputusan ARB uji')$f$, legacy), '23514', 'objek lama tak patuh tidak bisa naik');
    PERFORM eaw.transition('service', legacy, 'Draf', 'Perbaiki tautan KRA');           -- jalan keluar: kembali ke Draf
    PERFORM pg_temp.as_user(pg_temp.fx('u_app'));
    UPDATE eaw.service SET referensi_id = k_svc WHERE id = legacy;                       -- lalu tautkan KRA se-domain
    IF EXISTS (SELECT 1 FROM eaw.kra_nonconformance WHERE id = legacy) THEN RAISE EXCEPTION 'setelah Draf objek tidak lagi dilaporkan'; END IF;

    -- 4) fungsi trigger tidak dapat dipanggil langsung / bukan milik PUBLIC
    IF has_function_privilege('eap_app', 'eaw.tg_kra_conformance()', 'EXECUTE') THEN RAISE EXCEPTION 'eap_app tidak boleh EXECUTE fungsi trigger'; END IF;
END $$;
ROLLBACK;
