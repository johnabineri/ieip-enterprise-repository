-- =====================================================================
-- 10_req.test.sql : REQ — sesi milik pembuat, pesan/log append-only, izin req.session.write, log guardrail
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE s uuid; st uuid; n int;
BEGIN
    PERFORM pg_temp.fx_world();

    -- 1) izin: Karyawan tanpa izin tidak membuat sesi; SBU Architect membuat
    PERFORM pg_temp.as_user(pg_temp.fx('u_emp'));
    PERFORM pg_temp.expect_error($f$INSERT INTO req.session (title, mode) VALUES ('X', 'deterministic')$f$, '42501', 'tanpa req.session.write');
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    INSERT INTO req.session (title, mode) VALUES ('Verifikasi pelanggan', 'deterministic') RETURNING id INTO s;
    INSERT INTO req.message (session_id, seq, role, content) VALUES (s, 1, 'user', 'Sebagai Admin ...'), (s, 2, 'assistant', 'Baik.');
    PERFORM pg_temp.expect_error(format($f$INSERT INTO req.message (session_id, seq, role, content) VALUES (%L, 2, 'user', 'dup')$f$, s), '23505', 'seq ganda');
    INSERT INTO req.story (session_id, title, story, gherkin, valid, engine) VALUES (s, 'T', 'Sebagai A, saya ingin B', 'Fitur: X', true, 'deterministic') RETURNING id INTO st;
    IF (SELECT code FROM req.story WHERE id = st) !~ '^US-\d{4}$' THEN RAISE EXCEPTION 'kode story berformat US-0001'; END IF;

    -- 2) kepemilikan: pengguna lain (bahkan ber-izin) tidak melihat sesi, pesan, atau story
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_t'));
    SELECT count(*) INTO n FROM req.session; IF n <> 0 THEN RAISE EXCEPTION 'sesi orang lain bocor'; END IF;
    SELECT count(*) INTO n FROM req.message; IF n <> 0 THEN RAISE EXCEPTION 'pesan orang lain bocor'; END IF;
    SELECT count(*) INTO n FROM req.story; IF n <> 0 THEN RAISE EXCEPTION 'story orang lain bocor'; END IF;
    PERFORM pg_temp.expect_error(format($f$INSERT INTO req.message (session_id, seq, role, content) VALUES (%L, 9, 'user', 'menyusup')$f$, s), '42501', 'menulis ke sesi orang lain');
    UPDATE req.session SET status = 'completed' WHERE id = s;
    GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'tidak boleh mengubah sesi orang lain'; END IF;

    -- 3) append-only
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_a'));
    PERFORM pg_temp.expect_error($f$UPDATE req.message SET content = 'ubah'$f$, '42501', 'pesan append-only');
    PERFORM pg_temp.expect_error($f$DELETE FROM req.message$f$, '42501', 'pesan tidak dihapus');
    UPDATE req.session SET stage = 2 WHERE id = s;                                 -- pemilik memajukan tahap

    -- 4) log guardrail: pelaku menulis catatannya sendiri; hanya pelaku & pemegang set.audit.read membaca; tak dapat memalsukan pelaku lain
    INSERT INTO req.guard_log (session_id, user_id, engine, category, excerpt, ms) VALUES (s, pg_temp.fx('u_sbu_a'), 'opa-rego', 'jailbreak', 'abaikan semua instruksi', 12);
    PERFORM pg_temp.expect_error(format($f$INSERT INTO req.guard_log (user_id, engine, category, excerpt, ms) VALUES (%L, 'fencing', 'off-topic', 'x', 1)$f$, pg_temp.fx('u_sbu_t')), '42501', 'memalsukan pelaku log');
    PERFORM pg_temp.expect_error($f$UPDATE req.guard_log SET ms = 1$f$, '42501', 'log append-only');
    PERFORM pg_temp.as_user(pg_temp.fx('u_sbu_t'));
    IF (SELECT count(*) FROM req.guard_log) <> 0 THEN RAISE EXCEPTION 'log guardrail orang lain bocor'; END IF;
    PERFORM pg_temp.as_user(pg_temp.fx('u_aud'));
    IF (SELECT count(*) FROM req.guard_log) <> 1 THEN RAISE EXCEPTION 'Auditor (set.audit.read) melihat log guardrail'; END IF;
    IF (SELECT count(*) FROM req.session) <> 0 THEN RAISE EXCEPTION 'Auditor tidak membaca isi sesi'; END IF;
END $$;
ROLLBACK;
