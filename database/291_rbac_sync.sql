-- =====================================================================
-- 291_rbac_sync.sql : sinkronisasi hak akses EAP dari mutasi pegawai CMP (CMP SRS §8.3, K-9, D-14)
--
-- Konsumen: worker infra/services/rbac-sync membaca event cmp.workforce.employee_mutated / employment_mutated dari NATS
-- JetStream (subjek keis.cmp.employee.> / keis.cmp.employment.>, diterbitkan relay outbox CMP) dan memanggil
-- set.apply_employee_mutation() sebagai login anggota eap_rbac_sync — peran itu HANYA punya EXECUTE pada fungsi ini.
-- Transport menyimpang dari §8.3 (webhook /api/v1/webhooks/employee-sync): kontrak payload sama, pengiriman lewat broker.
--
-- KEBIJAKAN (diputuskan 2026-11-05): cabut, admin menugaskan ulang — TIDAK ADA pemberian/pemindahan hak otomatis.
--   * Pegawai berhenti (status 'terminated', is_active=false, atau deleted_at terisi) → akun EAP dinonaktifkan +
--     SEMUA penugasan peran dicabut (soft delete).
--   * Pindah perusahaan (employment ditutup: status 'ended'/deleted_at, atau changes.company_id pada employee) →
--     hanya penugasan yang entity_scope-nya grup is_entity milik perusahaan LAMA (+ turunannya, berhenti di grup yang
--     is_entity ke perusahaan lain) dicabut, KECUALI pegawai masih punya employment aktif di perusahaan itu.
--     Penugasan holding-wide (entity_scope NULL) dan lingkup ecosystem (relasi 'includes') TIDAK disentuh.
--   * Mutasi lain (unit/jabatan/cabang dalam satu perusahaan, employment baru, on_leave) → tidak ada perubahan peran.
-- Pemetaan pegawai → akun: set.users.cmp_user_id = ref.users.id dan ref.users.employee_id (replika CDC, §4.10).
-- Idempotensi: id event (Nats-Msg-Id "cmp-<outbox id>") unik + (aggregate_id, row_version) — versi usang diabaikan.
-- D-14: payload §8.3 memuat full_name/work_email; worker membuangnya sebelum memanggil fungsi, dan fungsi/log hanya
-- membaca & menyimpan pengenal (id, kode peran, kode entitas). Batas jujur: bila replika ref.employments tertinggal dari
-- event, "masih aktif di perusahaan itu" bisa terlewat → hak dicabut (gagal-aman; admin menugaskan ulang).
-- Idempoten (IF NOT EXISTS / OR REPLACE) agar dapat diterapkan ke basis data yang sudah berjalan.
-- =====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eap_rbac_sync') THEN CREATE ROLE eap_rbac_sync NOLOGIN; END IF;
END $$;

CREATE TABLE IF NOT EXISTS set.rbac_sync_event (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_event_id VARCHAR(120) NOT NULL,
    event_type      VARCHAR(100) NOT NULL,
    aggregate_type  VARCHAR(60)  NOT NULL,
    aggregate_id    UUID         NOT NULL,
    row_version     INT,
    employee_id     UUID,
    company_id      UUID,
    action          VARCHAR(20)  NOT NULL CHECK (action IN ('none','no_account','deactivated','revoked_scope','stale','ignored')),
    users_affected  INT          NOT NULL DEFAULT 0,
    roles_revoked   INT          NOT NULL DEFAULT 0,
    detail          JSONB        NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object'),
    received_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_rbac_sync_event_source ON set.rbac_sync_event (source_event_id);
CREATE INDEX IF NOT EXISTS ix_rbac_sync_event_agg ON set.rbac_sync_event (aggregate_type, aggregate_id, row_version);
CREATE INDEX IF NOT EXISTS ix_rbac_sync_event_time ON set.rbac_sync_event (received_at DESC);
COMMENT ON TABLE set.rbac_sync_event IS 'CMP SRS §8.3: jejak append-only setiap event mutasi pegawai yang diproses (hanya pengenal; tanpa nama/surel — D-14).';

CREATE OR REPLACE FUNCTION set.tg_rbac_sync_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'set.rbac_sync_event bersifat append-only' USING ERRCODE = 'insufficient_privilege';
END $$;
DROP TRIGGER IF EXISTS trg_rbac_sync_event_immutable ON set.rbac_sync_event;
CREATE TRIGGER trg_rbac_sync_event_immutable BEFORE UPDATE OR DELETE ON set.rbac_sync_event
    FOR EACH ROW EXECUTE FUNCTION set.tg_rbac_sync_event_immutable();

-- kode grup is_entity milik perusahaan + turunannya; berhenti di grup yang is_entity ke perusahaan LAIN (badan hukum lain)
CREATE OR REPLACE FUNCTION set.company_entity_codes(p_companies UUID[]) RETURNS SETOF TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, ref AS $$
    WITH RECURSIVE g AS (
        SELECT bg.id, bg.code, bgc.company_id AS owner
          FROM ref.business_group_companies bgc
          JOIN ref.business_groups bg ON bg.id = bgc.business_group_id AND bg.deleted_at IS NULL
         WHERE bgc.company_id = ANY (p_companies) AND bgc.relation_type = 'is_entity' AND bgc.deleted_at IS NULL
           AND (bgc.valid_to IS NULL OR bgc.valid_to >= current_date)
        UNION
        SELECT c.id, c.code, g.owner
          FROM ref.business_groups c JOIN g ON c.parent_id = g.id
         WHERE c.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM ref.business_group_companies o
                            WHERE o.business_group_id = c.id AND o.relation_type = 'is_entity' AND o.deleted_at IS NULL
                              AND o.company_id <> g.owner))
    SELECT DISTINCT code FROM g
$$;

CREATE OR REPLACE FUNCTION set.apply_employee_mutation(p_event_id TEXT, p_event_type TEXT, p_aggregate_type TEXT,
                                                       p_aggregate_id UUID, p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, set, ref, shared AS $$
DECLARE
    v_rv        INT  := NULLIF(p_payload ->> 'row_version', '')::int;
    v_emp       UUID;
    v_company   UUID := NULLIF(p_payload ->> 'company_id', '')::uuid;
    v_old       UUID;                -- perusahaan yang ditinggalkan
    v_terminate BOOLEAN := false;
    v_users     UUID[];
    v_keep      UUID[];
    v_action    TEXT := 'none';
    v_revoked   JSONB := '[]'::jsonb;
    v_n         INT := 0;
    v_deact     INT := 0;
    v_reason    TEXT;
BEGIN
    IF p_event_id IS NULL OR btrim(p_event_id) = '' OR p_aggregate_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
        RAISE EXCEPTION 'apply_employee_mutation: event_id, aggregate_id, dan payload objek wajib' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    -- satu event diproses sekali; event untuk agregat yang sama diserialkan
    PERFORM pg_advisory_xact_lock(hashtextextended('rbac-sync:' || p_aggregate_id::text, 0));
    IF EXISTS (SELECT 1 FROM set.rbac_sync_event WHERE source_event_id = p_event_id) THEN
        RETURN jsonb_build_object('duplicate', true);
    END IF;

    IF p_event_type = 'cmp.workforce.employee_mutated' AND p_aggregate_type = 'employee' THEN
        v_emp := p_aggregate_id;
        v_terminate := (p_payload ->> 'status') = 'terminated' OR (p_payload ->> 'is_active') = 'false' OR (p_payload ->> 'deleted_at') IS NOT NULL;
        v_old := NULLIF(p_payload #>> '{changes,company_id,from}', '')::uuid;
        IF v_old IS NOT NULL AND v_old = v_company THEN v_old := NULL; END IF;
        v_reason := CASE WHEN v_terminate THEN 'pegawai berhenti/nonaktif' WHEN v_old IS NOT NULL THEN 'pemberi kerja primer berganti' END;
    ELSIF p_event_type = 'cmp.workforce.employment_mutated' AND p_aggregate_type = 'employment' THEN
        v_emp := NULLIF(p_payload ->> 'employee_id', '')::uuid;
        IF (p_payload ->> 'status') = 'ended' OR (p_payload ->> 'deleted_at') IS NOT NULL THEN
            v_old := v_company;
            v_reason := CASE WHEN v_company IS NULL THEN 'employment ditutup tanpa company_id di payload (tidak ada yang dapat dicabut)'
                             ELSE 'employment ditutup' END;
        END IF;
    ELSE
        v_action := 'ignored';
        v_reason := 'jenis event tidak ditangani';
    END IF;

    -- versi usang (pengiriman at-least-once / tidak berurutan) tidak boleh mengubah apa pun
    IF v_action <> 'ignored' AND v_rv IS NOT NULL AND EXISTS (
        SELECT 1 FROM set.rbac_sync_event e
         WHERE e.aggregate_type = p_aggregate_type AND e.aggregate_id = p_aggregate_id AND e.row_version >= v_rv AND e.action <> 'ignored') THEN
        v_action := 'stale';
        v_reason := 'row_version tidak lebih baru dari event yang sudah diproses';
    END IF;

    IF v_action = 'none' AND (v_terminate OR v_old IS NOT NULL) THEN
        SELECT COALESCE(array_agg(u.id), '{}') INTO v_users
          FROM set.users u JOIN ref.users r ON r.id = u.cmp_user_id
         WHERE r.employee_id = v_emp AND u.deleted_at IS NULL;
        IF cardinality(v_users) = 0 THEN
            v_action := 'no_account';
        ELSIF v_terminate THEN
            UPDATE set.users SET is_active = false WHERE id = ANY (v_users) AND is_active;
            GET DIAGNOSTICS v_deact = ROW_COUNT;
            WITH x AS (
                UPDATE set.user_roles ur SET deleted_at = now()
                  FROM set.roles ro
                 WHERE ro.id = ur.role_id AND ur.user_id = ANY (v_users) AND ur.deleted_at IS NULL
                RETURNING ur.user_id, ro.role_code, ur.entity_scope)
            SELECT count(*), COALESCE(jsonb_agg(jsonb_build_object('user_id', user_id, 'role_code', role_code, 'entity_scope', entity_scope)), '[]')
              INTO v_n, v_revoked FROM x;
            v_action := 'deactivated';
        ELSE
            -- perusahaan yang tetap: employment aktif lain (replika) + pemberi kerja baru pada event employee
            SELECT COALESCE(array_agg(DISTINCT e.company_id), '{}') INTO v_keep
              FROM ref.employments e
             WHERE e.employee_id = v_emp AND e.status = 'active' AND e.deleted_at IS NULL
               AND NOT (p_aggregate_type = 'employment' AND e.id = p_aggregate_id);
            IF p_aggregate_type = 'employee' AND v_company IS NOT NULL THEN v_keep := array_append(v_keep, v_company); END IF;
            IF v_old = ANY (v_keep) THEN
                v_reason := v_reason || '; masih aktif di perusahaan yang sama';
            ELSE
                WITH codes AS (
                    SELECT c FROM set.company_entity_codes(ARRAY[v_old]) c
                    EXCEPT SELECT k FROM set.company_entity_codes(v_keep) k),
                x AS (
                    UPDATE set.user_roles ur SET deleted_at = now()
                      FROM set.roles ro
                     WHERE ro.id = ur.role_id AND ur.user_id = ANY (v_users) AND ur.deleted_at IS NULL
                       AND ur.entity_scope IN (SELECT c FROM codes)
                    RETURNING ur.user_id, ro.role_code, ur.entity_scope)
                SELECT count(*), COALESCE(jsonb_agg(jsonb_build_object('user_id', user_id, 'role_code', role_code, 'entity_scope', entity_scope)), '[]')
                  INTO v_n, v_revoked FROM x;
            END IF;
            IF v_n > 0 THEN v_action := 'revoked_scope'; END IF;
        END IF;
    END IF;

    INSERT INTO set.rbac_sync_event (source_event_id, event_type, aggregate_type, aggregate_id, row_version, employee_id, company_id,
                                     action, users_affected, roles_revoked, detail)
    VALUES (p_event_id, COALESCE(p_event_type, '?'), COALESCE(p_aggregate_type, '?'), p_aggregate_id, v_rv, v_emp, v_company, v_action,
            CASE WHEN v_action IN ('deactivated','revoked_scope') THEN GREATEST(cardinality(v_users), v_deact) ELSE 0 END, v_n,
            jsonb_strip_nulls(jsonb_build_object('reason', v_reason, 'old_company_id', v_old, 'revoked', CASE WHEN v_n > 0 THEN v_revoked END,
                                                 'deactivated_users', CASE WHEN v_deact > 0 THEN v_deact END)));
    RETURN jsonb_build_object('duplicate', false, 'action', v_action, 'usersAffected', COALESCE(cardinality(v_users), 0), 'rolesRevoked', v_n);
END $$;
COMMENT ON FUNCTION set.apply_employee_mutation IS 'CMP SRS §8.3: terapkan event mutasi pegawai ke RBAC EAP (cabut saja, tanpa pemberian otomatis). Hanya eap_rbac_sync.';

REVOKE ALL ON FUNCTION set.apply_employee_mutation(TEXT, TEXT, TEXT, UUID, JSONB), set.company_entity_codes(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION set.apply_employee_mutation(TEXT, TEXT, TEXT, UUID, JSONB) FROM eap_app, eap_ro;
REVOKE ALL ON FUNCTION set.company_entity_codes(UUID[]) FROM eap_app, eap_ro;
REVOKE ALL ON FUNCTION set.tg_rbac_sync_event_immutable() FROM PUBLIC;
GRANT USAGE ON SCHEMA set TO eap_rbac_sync;
GRANT EXECUTE ON FUNCTION set.apply_employee_mutation(TEXT, TEXT, TEXT, UUID, JSONB) TO eap_rbac_sync;
REVOKE ALL ON set.rbac_sync_event FROM PUBLIC;
GRANT SELECT ON set.rbac_sync_event TO eap_app, eap_ro;      -- API membatasi ke set.account.admin / set.audit.read
