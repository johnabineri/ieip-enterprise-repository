-- =====================================================================
-- 100_set.sql : skema `set` — otorisasi seragam (D-12), TANPA PII (D-14)
--
-- Penyimpangan dari draf DDL di SRS §5.2 (disengaja, dicatat di eap/database/README.md):
--   * PK tiap tabel bernama `id` (bukan user_id/role_id/...): shared.apply_standard() dan shared.audit_row()
--     mensyaratkan kolom `id`; tabel relasi diberi `id` + UNIQUE agar ikut audit.
--   * set.users.cmp_user_id (UUID buram) menautkan akun ke ref.users (CMP) — idp_subject TIDAK dipublikasi CMP.
-- Identitas manusia (nama/surel) TIDAK disimpan di sini: dibaca dari ref.users (replika CDC dari CMP).
-- =====================================================================

-- ---------- pengguna ----------
CREATE TABLE set.users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idp_subject   VARCHAR(200) NOT NULL,            -- klaim `sub` JWT Keycloak (pengenal buram)
    cmp_user_id   UUID,                             -- = ref.users.id (iam.users di CMP); tanpa FK karena replika dapat tertinggal
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ
);
CALL shared.apply_standard('set.users', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_set_users_idp ON set.users (idp_subject) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_set_users_cmp ON set.users (cmp_user_id) WHERE cmp_user_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_set_users_active ON set.users (is_active) WHERE is_active AND deleted_at IS NULL;
COMMENT ON TABLE set.users IS 'D-14: hanya idp_subject + status. Nama/surel dibaca dari ref.users (CMP). Dibuat saat login pertama lewat set.provision_user().';

-- shared.documents mendapat kolom standar di sini (butuh set.users sebagai tabel FK audit) — sama seperti kalla_cmp
-- (di sana dipanggil di 100_iam_core.sql). Wajib agar struktur shared.* IDENTIK (gate cross_check_shared.sh, ADR-CMP-004).
CALL shared.apply_standard('shared.documents', 'confidential', 'set.users'::regclass);

-- ---------- peran ----------
CREATE TABLE set.roles (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_code     VARCHAR(50)  NOT NULL,            -- mis. ROLE_EAP_ARB_CHAIR
    role_name     VARCHAR(100) NOT NULL,
    tier          VARCHAR(30)  NOT NULL CHECK (tier IN ('T1_GOVERNANCE','T2_DOMAIN','T3_EXECUTION','T4_ASSURANCE')),
    description   TEXT,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    -- kebijakan lingkup (SAF §6.1): siapa boleh MELIHAT objek non-Dipublikasi dan siapa boleh MENYUSUN
    can_view_all  BOOLEAN NOT NULL DEFAULT FALSE,   -- lihat semua objek termasuk Draf (ARB, Domain Architect, Auditor)
    edit_scope    VARCHAR(10) NOT NULL DEFAULT 'none' CHECK (edit_scope IN ('none','entity','holding'))
                  -- none: tidak menyusun; entity: hanya entitas penugasan + turunannya; holding: seluruh hierarki bila penugasan holding-wide
);
CALL shared.apply_standard('set.roles', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_set_roles_code ON set.roles (role_code) WHERE deleted_at IS NULL;

-- ---------- izin granular: <workspace>.<modul>.<aksi> ----------
CREATE TABLE set.permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_code VARCHAR(80) NOT NULL,
    workspace       VARCHAR(20) NOT NULL,
    module          VARCHAR(50) NOT NULL,
    action          VARCHAR(20) NOT NULL CHECK (action IN ('read','write','delete','approve','run','admin','assign')),
    description     TEXT,
    CONSTRAINT ck_permission_code CHECK (permission_code = workspace || '.' || module || '.' || action)
);
CALL shared.apply_standard('set.permissions', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_set_permissions_code ON set.permissions (permission_code) WHERE deleted_at IS NULL;

CREATE TABLE set.role_permissions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id       UUID NOT NULL REFERENCES set.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES set.permissions(id) ON DELETE CASCADE
);
CALL shared.apply_standard('set.role_permissions', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_set_role_permissions ON set.role_permissions (role_id, permission_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_set_role_permissions_perm ON set.role_permissions (permission_id);

-- ---------- penugasan peran berlingkup entitas ----------
CREATE TABLE set.user_roles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES set.users(id) ON DELETE CASCADE,
    role_id      UUID NOT NULL REFERENCES set.roles(id) ON DELETE CASCADE,
    entity_scope shared.business_code,               -- kode ref.business_groups; NULL = berlaku holding-wide
    assigned_by  UUID REFERENCES set.users(id),
    valid_from   TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until  TIMESTAMPTZ,                        -- NULL = tanpa batas waktu
    CONSTRAINT ck_user_roles_validity CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CALL shared.apply_standard('set.user_roles', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_set_user_roles ON set.user_roles (user_id, role_id, entity_scope) NULLS NOT DISTINCT WHERE deleted_at IS NULL;
CREATE INDEX ix_set_user_roles_role ON set.user_roles (role_id);

-- entity_scope harus kode entitas yang ada (aktif) di replika ref.business_groups
CREATE FUNCTION set.tg_user_roles_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.entity_scope IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM ref.business_groups g WHERE g.code = NEW.entity_scope AND g.deleted_at IS NULL AND g.is_active) THEN
        RAISE EXCEPTION 'entity_scope % tidak ditemukan di ref.business_groups (replika CMP) atau tidak aktif', NEW.entity_scope
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_user_roles_scope BEFORE INSERT OR UPDATE OF entity_scope ON set.user_roles
    FOR EACH ROW EXECUTE FUNCTION set.tg_user_roles_scope();

-- ---------- administrasi hanya oleh set.account.admin ----------
-- Penegakan di DB (bukan hanya di API): GUC app.eap_perms diisi API dari izin efektif pengguna.
CREATE FUNCTION set.has_perm(p_code text) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT COALESCE(p_code = ANY (string_to_array(current_setting('app.eap_perms', true), ',')), false)
$$;
CREATE FUNCTION set.tg_admin_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT (set.has_perm('set.account.admin') OR current_user = 'eap_owner'
            OR (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)) THEN
        RAISE EXCEPTION 'perubahan set.% hanya untuk pemegang izin set.account.admin', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN COALESCE(NEW, OLD);
END $$;
-- set.users TIDAK termasuk (dibuat/diubah lewat fungsi definer di bawah); role/izin/penugasan: admin-only
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['roles','permissions','role_permissions','user_roles'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_adminonly BEFORE INSERT OR UPDATE OR DELETE ON set.%1$I FOR EACH ROW EXECUTE FUNCTION set.tg_admin_only()', t);
  END LOOP;
END $$;

-- ---------- provisioning pengguna (SECURITY DEFINER) ----------
-- Login pertama: pengguna HARUS dikenal CMP (ref.users aktif) — CMP = sumber identitas. Username berasal dari klaim
-- preferred_username yang sudah diverifikasi tanda tangannya oleh API. Mengembalikan baris set.users atau NULL.
CREATE FUNCTION set.provision_user(p_idp_subject TEXT, p_username TEXT) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, set, ref, shared AS $$
DECLARE v_id UUID; v_cmp UUID;
BEGIN
    SELECT id INTO v_id FROM set.users WHERE idp_subject = p_idp_subject AND deleted_at IS NULL;
    IF v_id IS NOT NULL THEN
        -- akun dibuat lebih dulu (mis. seed/administrator) tanpa tautan CMP: tautkan saat login bila username cocok & belum dipakai akun lain
        IF p_username IS NOT NULL THEN
            UPDATE set.users u SET cmp_user_id = r.id
              FROM ref.users r
             WHERE u.id = v_id AND u.cmp_user_id IS NULL AND r.username = p_username::citext AND r.is_active AND r.deleted_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM set.users o WHERE o.cmp_user_id = r.id AND o.deleted_at IS NULL);
        END IF;
        RETURN v_id;
    END IF;
    IF p_username IS NULL OR btrim(p_username) = '' THEN RETURN NULL; END IF;
    SELECT id INTO v_cmp FROM ref.users WHERE username = p_username::citext AND is_active AND deleted_at IS NULL;
    IF v_cmp IS NULL THEN RETURN NULL; END IF;                                  -- tidak dikenal/aktif di CMP
    IF EXISTS (SELECT 1 FROM set.users WHERE cmp_user_id = v_cmp AND deleted_at IS NULL) THEN
        RETURN NULL;                                                            -- akun CMP ini sudah terhubung ke subjek IdP lain
    END IF;
    INSERT INTO set.users (idp_subject, cmp_user_id) VALUES (p_idp_subject, v_cmp) RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- pencatatan login terakhir (satu-satunya UPDATE set.users oleh aplikasi)
CREATE FUNCTION set.touch_login(p_user UUID) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, set AS $$
    UPDATE set.users SET last_login_at = now() WHERE id = p_user AND (last_login_at IS NULL OR last_login_at < now() - interval '1 minute')
$$;

-- aktivasi/nonaktivasi akun EAP oleh administrator (set.users tidak boleh ditulis langsung oleh aplikasi)
CREATE FUNCTION set.set_user_active(p_user UUID, p_active BOOLEAN) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, set, shared AS $$
BEGIN
    IF NOT set.has_perm('set.account.admin') THEN RAISE EXCEPTION 'izin set.account.admin diperlukan' USING ERRCODE = 'insufficient_privilege'; END IF;
    IF NOT p_active AND p_user = shared.current_user_id() THEN RAISE EXCEPTION 'tidak dapat menonaktifkan akun sendiri' USING ERRCODE = 'check_violation'; END IF;
    UPDATE set.users SET is_active = p_active WHERE id = p_user AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'akun tidak ditemukan' USING ERRCODE = 'no_data_found'; END IF;
END $$;

-- ---------- klaim sesi: izin efektif + cakupan entitas (dasar RLS eaw.*) ----------
-- Mengembalikan: roles, permissions, view_all, edit_all, view_ids (entitas turunan yang boleh dilihat),
-- edit_ids (entitas turunan yang boleh disusun). Penugasan kedaluwarsa/nonaktif tidak dihitung.
CREATE FUNCTION set.session_claims(p_user UUID) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, set, ref AS $$
DECLARE v_active BOOLEAN; v_cmp_active BOOLEAN;
BEGIN
    SELECT u.is_active AND u.deleted_at IS NULL,
           COALESCE((SELECT ru.is_active AND ru.deleted_at IS NULL FROM ref.users ru WHERE ru.id = u.cmp_user_id), FALSE)
      INTO v_active, v_cmp_active FROM set.users u WHERE u.id = p_user;
    IF NOT COALESCE(v_active, FALSE) OR NOT v_cmp_active THEN
        RETURN jsonb_build_object('active', false, 'roles', '[]'::jsonb, 'permissions', '[]'::jsonb, 'view_all', false, 'edit_all', false,
                                  'view_ids', '[]'::jsonb, 'edit_ids', '[]'::jsonb);
    END IF;

    RETURN (
        WITH RECURSIVE a AS (
            SELECT r.id AS role_id, r.role_code, r.can_view_all, r.edit_scope, g.id AS root_id, ur.entity_scope IS NOT NULL AS scoped
              FROM set.user_roles ur
              JOIN set.roles r ON r.id = ur.role_id AND r.is_active AND r.deleted_at IS NULL
              LEFT JOIN ref.business_groups g ON g.code = ur.entity_scope AND g.deleted_at IS NULL
             WHERE ur.user_id = p_user AND ur.deleted_at IS NULL AND ur.valid_from <= now() AND (ur.valid_until IS NULL OR ur.valid_until > now())
               AND (ur.entity_scope IS NULL OR g.id IS NOT NULL)),
        perms AS (
            SELECT DISTINCT p.permission_code FROM set.role_permissions rp
              JOIN set.permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
             WHERE rp.deleted_at IS NULL AND rp.role_id IN (SELECT role_id FROM a)),
        -- entitas turunan: akar penugasan + semua keturunannya di hierarki manajemen ref.business_groups
        t AS (
            SELECT a.root_id AS id, a.can_view_all, (a.edit_scope IN ('entity','holding')) AS can_edit FROM a WHERE a.scoped AND a.root_id IS NOT NULL
            UNION
            SELECT g.id, t.can_view_all, t.can_edit FROM ref.business_groups g JOIN t ON g.parent_id = t.id WHERE g.deleted_at IS NULL)
        SELECT jsonb_build_object(
            'active', true,
            'roles', COALESCE((SELECT jsonb_agg(DISTINCT role_code) FROM a), '[]'::jsonb),
            'permissions', COALESCE((SELECT jsonb_agg(permission_code ORDER BY permission_code) FROM perms), '[]'::jsonb),
            'view_all', COALESCE((SELECT bool_or(can_view_all AND NOT scoped) FROM a), false),
            'edit_all', COALESCE((SELECT bool_or(edit_scope = 'holding' AND NOT scoped) FROM a), false),
            'view_ids', COALESCE((SELECT jsonb_agg(DISTINCT id) FROM t WHERE can_view_all OR can_edit), '[]'::jsonb),
            'edit_ids', COALESCE((SELECT jsonb_agg(DISTINCT id) FROM t WHERE can_edit), '[]'::jsonb)));
END $$;
COMMENT ON FUNCTION set.session_claims IS 'Izin efektif + cakupan entitas. API memuatnya ke GUC app.eap_* (SET LOCAL) per transaksi; RLS eaw.* membacanya.';
