-- =====================================================================
-- _helpers.sql : fixture & pembantu uji (dimuat tiap berkas uji lewat \ir; fungsi bersifat per-sesi di pg_temp)
-- Setiap berkas uji berjalan di sesi psql sendiri sebagai superuser; uji RLS memakai SET ROLE eap_app.
-- =====================================================================
-- data replika CMP (ref.*) ditulis dengan trigger replika dinonaktifkan — seperti worker langganan logis
CREATE FUNCTION pg_temp.fx_group(p_code text, p_name text, p_kind text, p_parent uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
    PERFORM set_config('session_replication_role', 'replica', true);
    INSERT INTO ref.business_groups (id, code, name, group_kind, parent_id, is_active, row_version) VALUES (v_id, p_code, p_name, p_kind, p_parent, true, 1);
    PERFORM set_config('session_replication_role', 'origin', true);
    RETURN v_id;
END $$;

-- pengguna: akun CMP (ref.users) + akun EAP (set.users) + penugasan peran [role_code, entity_scope]
CREATE FUNCTION pg_temp.fx_user(p_name text, p_roles text[][] DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_cmp uuid := gen_random_uuid(); v_id uuid; i int;
BEGIN
    PERFORM set_config('session_replication_role', 'replica', true);
    INSERT INTO ref.users (id, username, display_name, is_active, row_version) VALUES (v_cmp, p_name, p_name, true, 1);
    PERFORM set_config('session_replication_role', 'origin', true);
    INSERT INTO set.users (idp_subject, cmp_user_id) VALUES ('sub-' || p_name, v_cmp) RETURNING id INTO v_id;
    IF p_roles IS NOT NULL THEN
        FOR i IN 1 .. array_length(p_roles, 1) LOOP
            INSERT INTO set.user_roles (user_id, role_id, entity_scope)
            SELECT v_id, r.id, NULLIF(p_roles[i][2], '') FROM set.roles r WHERE r.role_code = p_roles[i][1];
        END LOOP;
    END IF;
    RETURN v_id;
END $$;

-- masuk sebagai pengguna: peran DB eap_app + GUC dari set.session_claims (persis yang dilakukan API)
CREATE FUNCTION pg_temp.as_user(p_user uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c jsonb;
BEGIN
    RESET ROLE;
    c := set.session_claims(p_user);
    PERFORM set_config('app.user_id', p_user::text, false);
    PERFORM set_config('app.eap_perms', COALESCE((SELECT string_agg(x, ',') FROM jsonb_array_elements_text(c->'permissions') x), ''), false);
    PERFORM set_config('app.eap_view_all', CASE WHEN (c->>'view_all')::boolean THEN '1' ELSE '0' END, false);
    PERFORM set_config('app.eap_edit_all', CASE WHEN (c->>'edit_all')::boolean THEN '1' ELSE '0' END, false);
    PERFORM set_config('app.eap_view_ids', COALESCE((SELECT string_agg(x, ',') FROM jsonb_array_elements_text(c->'view_ids') x), ''), false);
    PERFORM set_config('app.eap_edit_ids', COALESCE((SELECT string_agg(x, ',') FROM jsonb_array_elements_text(c->'edit_ids') x), ''), false);
    EXECUTE 'SET ROLE eap_app';
    RETURN c;
END $$;

-- kembali ke superuser (untuk menyiapkan fixture) dan bersihkan konteks
CREATE FUNCTION pg_temp.as_owner() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    RESET ROLE;
    PERFORM set_config('app.user_id', '', false);
    PERFORM set_config('app.eap_perms', '', false);
    PERFORM set_config('app.eap_view_all', '0', false);
    PERFORM set_config('app.eap_edit_all', '0', false);
    PERFORM set_config('app.eap_view_ids', '', false);
    PERFORM set_config('app.eap_edit_ids', '', false);
END $$;

-- pernyataan: blok harus GAGAL dengan SQLSTATE tertentu (nilai null = sembarang galat)
CREATE FUNCTION pg_temp.expect_error(p_sql text, p_state text DEFAULT NULL, p_label text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        IF p_state IS NOT NULL AND SQLSTATE <> p_state THEN
            RAISE EXCEPTION '% — SQLSTATE % (diharapkan %): %', COALESCE(p_label, p_sql), SQLSTATE, p_state, SQLERRM;
        END IF;
        RETURN;
    END;
    RAISE EXCEPTION '% — seharusnya GAGAL tetapi berhasil', COALESCE(p_label, p_sql);
END $$;

-- id fixture disimpan di GUC (terbaca siapa pun, juga setelah SET ROLE): pg_temp.fx('aspal')
CREATE FUNCTION pg_temp.fx(p_name text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('fx.' || p_name)::uuid $$;

-- KRA terbit (status Dipublikasi) lewat jalur fixture: bendera transisi menyalakan penjaga status
CREATE FUNCTION pg_temp.fx_kra(p_kode text, p_domain text DEFAULT 'aplikasi') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
    INSERT INTO eaw.reference (domain, kode, nama) VALUES (p_domain, p_kode, 'KRA ' || p_kode) RETURNING id INTO v;
    PERFORM set_config('eaw.in_transition', 'on', true);
    UPDATE eaw.reference SET status = 'Dipublikasi' WHERE id = v;
    PERFORM set_config('eaw.in_transition', 'off', true);
    RETURN v;
END $$;

-- dunia uji standar: holding > 2 ecosystem > SBU, dan pengguna per peran
--   aspal (sbu di eco_con), toyota (sbu di eco_auto), unit_aspal (unit di bawah aspal)
CREATE FUNCTION pg_temp.fx_world() RETURNS void LANGUAGE plpgsql AS $$
DECLARE h uuid; ec uuid; ea uuid; a uuid; t uuid;
BEGIN
    h  := pg_temp.fx_group('T-KALLA', 'Kalla', 'holding');
    ec := pg_temp.fx_group('T-ECO-CON', 'Eco Konstruksi', 'ecosystem', h);
    ea := pg_temp.fx_group('T-ECO-AUTO', 'Eco Otomotif', 'ecosystem', h);
    a  := pg_temp.fx_group('T-ASPAL', 'Kalla Aspal', 'sbu', ec);
    t  := pg_temp.fx_group('T-TOYOTA', 'Kalla Toyota', 'sbu', ea);
    PERFORM set_config('fx.hold', h::text, false);   PERFORM set_config('fx.eco_con', ec::text, false);
    PERFORM set_config('fx.eco_auto', ea::text, false); PERFORM set_config('fx.aspal', a::text, false); PERFORM set_config('fx.toyota', t::text, false);
    PERFORM set_config('fx.unit_aspal', pg_temp.fx_group('T-ASPAL-BU', 'Unit Aspal Curah', 'business_unit', a)::text, false);
    PERFORM set_config('fx.u_arb',   pg_temp.fx_user('u_arb',   ARRAY[['ROLE_EAP_ARB_CHAIR', '']])::text, false);
    PERFORM set_config('fx.u_app',   pg_temp.fx_user('u_app',   ARRAY[['ROLE_EAP_APP_ARCHITECT', '']])::text, false);
    PERFORM set_config('fx.u_sbu_a', pg_temp.fx_user('u_sbu_a', ARRAY[['ROLE_EAP_SBU_ARCHITECT', 'T-ASPAL']])::text, false);
    PERFORM set_config('fx.u_sbu_t', pg_temp.fx_user('u_sbu_t', ARRAY[['ROLE_EAP_SBU_ARCHITECT', 'T-TOYOTA']])::text, false);
    PERFORM set_config('fx.u_aud',   pg_temp.fx_user('u_aud',   ARRAY[['ROLE_EAP_AUDITOR', '']])::text, false);
    PERFORM set_config('fx.u_sys',   pg_temp.fx_user('u_sys',   ARRAY[['ROLE_EAP_SYSADMIN', '']])::text, false);
    PERFORM set_config('fx.u_emp',   pg_temp.fx_user('u_emp')::text, false);
    PERFORM set_config('fx.u_sec',   pg_temp.fx_user('u_sec',   ARRAY[['ROLE_EAP_SECURITY_ARCHITECT', '']])::text, false);
END $$;

-- melengkapi relasi wajib sebuah aplikasi Draf (layanan, proses, entitas data, infrastruktur, kontrol) — fixture sebagai superuser, peran sesi dipulihkan
CREATE FUNCTION pg_temp.fx_complete(p_app uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_role text := current_user; v_ent uuid; s uuid; p uuid; d uuid; i uuid; c uuid;
BEGIN
    RESET ROLE;
    SELECT entity_id INTO v_ent FROM eaw.application WHERE id = p_app;
    INSERT INTO eaw.service (nama, tipe, kategori, entity_id) VALUES ('Layanan fx', 'internal', 'utama', v_ent) RETURNING id INTO s;
    INSERT INTO eaw.process (nama, level, entity_id) VALUES ('Proses fx', 1, v_ent) RETURNING id INTO p;
    INSERT INTO eaw.data_entity (nama_kanonikal, klasifikasi, steward, sumber_otoritatif, entity_id) VALUES ('Data fx', 'internal', 'Steward', 'kalla_cmp.mdm.x', v_ent) RETURNING id INTO d;
    INSERT INTO eaw.infra_asset (nama, tipe, entity_id) VALUES ('Infra fx', 'klaster-k8s', v_ent) RETURNING id INTO i;
    INSERT INTO eaw.control (aspek, status_penerapan, entity_id) VALUES ('kerahasiaan', 'sebagian', v_ent) RETURNING id INTO c;
    INSERT INTO eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) VALUES
        ('application', p_app, 'service', s, 'serving'), ('application', p_app, 'process', p, 'serving'), ('application', p_app, 'data_entity', d, 'access'),
        ('application', p_app, 'infra_asset', i, 'assignment'), ('application', p_app, 'control', c, 'association');
    IF v_role <> session_user THEN EXECUTE format('SET ROLE %I', v_role); END IF;
END $$;
