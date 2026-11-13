-- =====================================================================
-- 20_rbac_sync.test.sql : sinkron mutasi pegawai CMP → RBAC EAP (291_rbac_sync.sql, CMP SRS §8.3)
--   a) hak: hanya eap_rbac_sync yang dapat memanggil; ia tidak dapat membaca set.* langsung
--   b) mutasi dalam satu perusahaan → tidak ada perubahan peran
--   c) employment ditutup (pindah ke perusahaan lain) → hanya lingkup is_entity perusahaan lama (+ unit turunan) dicabut;
--      lingkup perusahaan baru dan holding-wide tetap
--   d) event duplikat dan row_version usang tidak mengubah apa pun
--   e) masih punya employment aktif di perusahaan yang sama → tidak dicabut
--   f) pegawai tanpa akun EAP → no_account; jenis event lain → ignored
--   g) pegawai berhenti → akun nonaktif + semua peran dicabut + session_claims kosong
--   h) log append-only dan tanpa nama/surel dari payload (D-14)
-- =====================================================================
BEGIN;
\ir _helpers.sql
DO $$
DECLARE u uuid; cmp_u uuid; emp uuid := gen_random_uuid(); co_a uuid := gen_random_uuid(); co_b uuid := gen_random_uuid();
        em_a uuid := gen_random_uuid(); em_b uuid := gen_random_uuid(); em_b2 uuid := gen_random_uuid(); r jsonb; n int; denied boolean;
        pii jsonb := jsonb_build_object('full_name', 'Nama Rahasia Pegawai', 'work_email', 'rahasia@kalla.co.id');
BEGIN
    PERFORM pg_temp.fx_world();
    -- perusahaan A (Aspal: grup T-ASPAL is_entity, unit T-ASPAL-BU turunannya; ecosystem 'includes'), perusahaan B (Toyota)
    PERFORM set_config('session_replication_role', 'replica', true);
    INSERT INTO ref.companies (id, code, legal_name, company_type, is_active, row_version) VALUES
        (co_a, 'T-PT-ASPAL', 'PT Uji Aspal', 'subsidiary', true, 1), (co_b, 'T-PT-TOYOTA', 'PT Uji Toyota', 'subsidiary', true, 1);
    INSERT INTO ref.business_group_companies (id, business_group_id, company_id, relation_type, valid_from, row_version) VALUES
        (gen_random_uuid(), pg_temp.fx('aspal'),   co_a, 'is_entity', '2020-01-01', 1),
        (gen_random_uuid(), pg_temp.fx('toyota'),  co_b, 'is_entity', '2020-01-01', 1),
        (gen_random_uuid(), pg_temp.fx('eco_con'), co_a, 'includes',  '2020-01-01', 1);
    PERFORM set_config('session_replication_role', 'origin', true);

    -- akun EAP pegawai: SBU Aspal, SBU unit Aspal, SBU Toyota, SBU ecosystem, Auditor holding-wide
    u := pg_temp.fx_user('u_mut', ARRAY[['ROLE_EAP_SBU_ARCHITECT', 'T-ASPAL'], ['ROLE_EAP_SBU_ARCHITECT', 'T-ASPAL-BU'],
                                        ['ROLE_EAP_SBU_ARCHITECT', 'T-TOYOTA'], ['ROLE_EAP_SBU_ARCHITECT', 'T-ECO-CON'], ['ROLE_EAP_AUDITOR', '']]);
    SELECT cmp_user_id INTO cmp_u FROM set.users WHERE id = u;
    PERFORM set_config('session_replication_role', 'replica', true);
    UPDATE ref.users SET employee_id = emp WHERE id = cmp_u;
    -- keadaan replika SESUDAH mutasi: employment A sudah ditutup, employment B aktif
    INSERT INTO ref.employments (id, employee_id, company_id, local_employee_no, employment_type, is_primary, start_date, end_date, status, row_version) VALUES
        (em_a, emp, co_a, 'A-001', 'permanent', false, '2020-01-01', '2026-10-31', 'ended', 3),
        (em_b, emp, co_b, 'B-001', 'permanent', true,  '2026-11-01', NULL, 'active', 1);
    PERFORM set_config('session_replication_role', 'origin', true);
    SELECT count(*) INTO n FROM set.user_roles WHERE user_id = u AND deleted_at IS NULL;
    IF n <> 5 THEN RAISE EXCEPTION 'prasyarat: 5 penugasan, ada %', n; END IF;

    -- a) hak
    IF has_function_privilege('eap_app', 'set.apply_employee_mutation(text,text,text,uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('eap_ro', 'set.apply_employee_mutation(text,text,text,uuid,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('eap_rbac_sync', 'set.apply_employee_mutation(text,text,text,uuid,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'rbac-sync: hak EXECUTE tidak sesuai (hanya eap_rbac_sync)';
    END IF;
    EXECUTE 'SET ROLE eap_rbac_sync';
    denied := false;
    BEGIN EXECUTE 'SELECT count(*) FROM set.user_roles'; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
    IF NOT denied THEN RAISE EXCEPTION 'rbac-sync: eap_rbac_sync tidak boleh membaca set.user_roles'; END IF;

    -- b) mutasi dalam satu perusahaan (unit/jabatan)
    r := set.apply_employee_mutation('cmp-1', 'cmp.workforce.employment_mutated', 'employment', em_a,
         jsonb_build_object('id', em_a, 'employee_id', emp, 'company_id', co_a, 'status', 'active', 'row_version', 2,
                            'changes', jsonb_build_object('org_unit_id', jsonb_build_object('from', gen_random_uuid(), 'to', gen_random_uuid()))));
    IF r->>'action' <> 'none' THEN RAISE EXCEPTION 'rbac-sync: mutasi dalam perusahaan harus none: %', r; END IF;

    -- c) employment A ditutup → lingkup Aspal + unit Aspal dicabut
    r := set.apply_employee_mutation('cmp-2', 'cmp.workforce.employment_mutated', 'employment', em_a,
         jsonb_build_object('id', em_a, 'employee_id', emp, 'company_id', co_a, 'status', 'ended', 'end_date', '2026-10-31', 'row_version', 3,
                            'changes', jsonb_build_object('status', jsonb_build_object('from', 'active', 'to', 'ended'))) || pii);
    IF r->>'action' <> 'revoked_scope' OR (r->>'rolesRevoked')::int <> 2 THEN RAISE EXCEPTION 'rbac-sync: penutupan employment: %', r; END IF;

    -- d) duplikat dan versi usang
    r := set.apply_employee_mutation('cmp-2', 'cmp.workforce.employment_mutated', 'employment', em_a, jsonb_build_object('employee_id', emp, 'status', 'ended', 'row_version', 3));
    IF NOT (r->>'duplicate')::boolean THEN RAISE EXCEPTION 'rbac-sync: event duplikat harus diabaikan: %', r; END IF;
    r := set.apply_employee_mutation('cmp-0', 'cmp.workforce.employment_mutated', 'employment', em_a,
         jsonb_build_object('id', em_a, 'employee_id', emp, 'company_id', co_a, 'status', 'ended', 'row_version', 1));
    IF r->>'action' <> 'stale' THEN RAISE EXCEPTION 'rbac-sync: versi usang harus stale: %', r; END IF;

    -- f) tanpa akun dan jenis lain
    r := set.apply_employee_mutation('cmp-3', 'cmp.workforce.employee_mutated', 'employee', gen_random_uuid(),
         jsonb_build_object('status', 'terminated', 'is_active', false, 'row_version', 2));
    IF r->>'action' <> 'no_account' THEN RAISE EXCEPTION 'rbac-sync: pegawai tanpa akun: %', r; END IF;
    r := set.apply_employee_mutation('cmp-4', 'cmp.organization.company_changed', 'company', co_a, jsonb_build_object('row_version', 9));
    IF r->>'action' <> 'ignored' THEN RAISE EXCEPTION 'rbac-sync: jenis event lain harus ignored: %', r; END IF;
    RESET ROLE;

    SELECT count(*) INTO n FROM set.user_roles WHERE user_id = u AND deleted_at IS NULL;
    IF n <> 3 THEN RAISE EXCEPTION 'rbac-sync: setelah penutupan A harus tersisa 3 penugasan, ada %', n; END IF;
    IF EXISTS (SELECT 1 FROM set.user_roles WHERE user_id = u AND deleted_at IS NULL AND entity_scope IN ('T-ASPAL','T-ASPAL-BU'))
       OR NOT EXISTS (SELECT 1 FROM set.user_roles WHERE user_id = u AND deleted_at IS NULL AND entity_scope = 'T-TOYOTA')
       OR NOT EXISTS (SELECT 1 FROM set.user_roles WHERE user_id = u AND deleted_at IS NULL AND entity_scope = 'T-ECO-CON')
       OR NOT EXISTS (SELECT 1 FROM set.user_roles WHERE user_id = u AND deleted_at IS NULL AND entity_scope IS NULL) THEN
        RAISE EXCEPTION 'rbac-sync: penugasan yang dicabut/dipertahankan salah';
    END IF;

    -- e) employment kedua di B ditutup, tetapi em_b masih aktif di B → tidak dicabut
    EXECUTE 'SET ROLE eap_rbac_sync';
    r := set.apply_employee_mutation('cmp-5', 'cmp.workforce.employment_mutated', 'employment', em_b2,
         jsonb_build_object('id', em_b2, 'employee_id', emp, 'company_id', co_b, 'status', 'ended', 'row_version', 2));
    IF r->>'action' <> 'none' THEN RAISE EXCEPTION 'rbac-sync: masih aktif di perusahaan yang sama harus none: %', r; END IF;

    -- g) berhenti
    r := set.apply_employee_mutation('cmp-6', 'cmp.workforce.employee_mutated', 'employee', emp,
         jsonb_build_object('id', emp, 'company_id', co_b, 'status', 'terminated', 'is_active', false, 'row_version', 7,
                            'changes', jsonb_build_object('status', jsonb_build_object('from', 'active', 'to', 'terminated'))) || pii);
    IF r->>'action' <> 'deactivated' OR (r->>'rolesRevoked')::int <> 3 THEN RAISE EXCEPTION 'rbac-sync: berhenti: %', r; END IF;
    RESET ROLE;
    IF (SELECT is_active FROM set.users WHERE id = u) THEN RAISE EXCEPTION 'rbac-sync: akun harus nonaktif'; END IF;
    IF EXISTS (SELECT 1 FROM set.user_roles WHERE user_id = u AND deleted_at IS NULL) THEN RAISE EXCEPTION 'rbac-sync: masih ada penugasan aktif'; END IF;
    IF (set.session_claims(u)->>'active')::boolean THEN RAISE EXCEPTION 'rbac-sync: session_claims harus tidak aktif'; END IF;

    -- h) log
    SELECT count(*) INTO n FROM set.rbac_sync_event;
    IF n <> 7 THEN RAISE EXCEPTION 'rbac-sync: diharapkan 7 baris log, ada %', n; END IF;
    IF EXISTS (SELECT 1 FROM set.rbac_sync_event e WHERE e::text ILIKE '%rahasia%') THEN RAISE EXCEPTION 'rbac-sync: nama/surel bocor ke log'; END IF;
    IF NOT EXISTS (SELECT 1 FROM set.rbac_sync_event WHERE source_event_id = 'cmp-2' AND detail->'revoked' @> '[{"entity_scope":"T-ASPAL-BU"}]') THEN
        RAISE EXCEPTION 'rbac-sync: log tidak mencatat penugasan yang dicabut';
    END IF;
    PERFORM pg_temp.expect_error($q$UPDATE set.rbac_sync_event SET action = 'none'$q$, '42501', 'log append-only (UPDATE)');
    PERFORM pg_temp.expect_error($q$DELETE FROM set.rbac_sync_event$q$, '42501', 'log append-only (DELETE)');
END $$;
ROLLBACK;
