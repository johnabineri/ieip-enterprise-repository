-- =====================================================================
-- 304_account_preassign.sql : POLA PENUGASAN AKUN yang disarankan — pra-tugaskan lewat identitas CMP, bukan akun yatim
--
-- Masalah: akun yang dibuat lebih dulu hanya dengan idp_subject (mis. seed-dev.sql) tidak tertaut ke ref.users (cmp_user_id NULL) sampai orangnya login.
-- Selama belum tertaut: nama/username kosong di UI, dan sinkron mutasi pegawai CMP -> RBAC (291, berkunci cmp_user_id) tidak dapat mencabut perannya
-- bila orangnya keluar/nonaktif sebelum pernah login.
--
-- Pola: admin memilih ORANG dari direktori CMP (ref.users aktif) -> set.preassign_user(cmp_user_id) membuat akun yang LANGSUNG tertaut, dengan penanda
-- idp_subject = 'pending:<cmp_user_id>' (belum ada subjek Keycloak sebelum login). Peran boleh ditugaskan saat itu juga. Saat orangnya login pertama,
-- set.provision_user() — yang mencocokkan username dari token terverifikasi — mengganti penanda dengan subjek IdP sebenarnya (akun & peran yang sama).
-- Jalur lama tetap: login pertama tanpa pra-tugas membuat akun baru tanpa peran; akun lama tanpa tautan ditautkan saat login bila username cocok.
-- Catatan keamanan: pengambilalihan akun pending dilakukan oleh pemilik username (CMP/Keycloak menjamin username unik) — jangan pra-tugaskan
-- peran kepada identitas CMP yang username-nya dapat didaftarkan ulang orang lain.
-- =====================================================================

CREATE FUNCTION set.preassign_user(p_cmp_user UUID) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, set, ref AS $$
DECLARE v_id UUID;
BEGIN
    IF NOT set.has_perm('set.account.admin') THEN RAISE EXCEPTION 'izin set.account.admin diperlukan' USING ERRCODE = 'insufficient_privilege'; END IF;
    IF NOT EXISTS (SELECT 1 FROM ref.users r WHERE r.id = p_cmp_user AND r.is_active AND r.deleted_at IS NULL) THEN
        RAISE EXCEPTION 'pengguna CMP tidak ditemukan atau tidak aktif' USING ERRCODE = 'check_violation';
    END IF;
    SELECT id INTO v_id FROM set.users WHERE cmp_user_id = p_cmp_user AND deleted_at IS NULL;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;                                  -- idempoten: akun sudah ada (pending atau sudah login)
    INSERT INTO set.users (idp_subject, cmp_user_id) VALUES ('pending:' || p_cmp_user, p_cmp_user) RETURNING id INTO v_id;
    RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION set.preassign_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set.preassign_user(uuid) TO eap_app;
COMMENT ON FUNCTION set.preassign_user IS 'Pra-tugaskan akun EAP untuk orang di direktori CMP (tertaut sejak awal; idp_subject = pending:<id> sampai login pertama). Hanya set.account.admin.';

-- provision_user: ditambah cabang pengambilalihan akun pending (selebihnya IDENTIK dengan 100_set.sql; ACL fungsi dipertahankan oleh CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION set.provision_user(p_idp_subject TEXT, p_username TEXT) RETURNS UUID
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
    -- akun yang dipra-tugaskan admin (preassign_user): ambil alih dengan subjek IdP sebenarnya — akun & peran yang sama
    UPDATE set.users SET idp_subject = p_idp_subject WHERE cmp_user_id = v_cmp AND deleted_at IS NULL AND idp_subject LIKE 'pending:%' RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    IF EXISTS (SELECT 1 FROM set.users WHERE cmp_user_id = v_cmp AND deleted_at IS NULL) THEN
        RETURN NULL;                                                            -- akun CMP ini sudah terhubung ke subjek IdP lain
    END IF;
    INSERT INTO set.users (idp_subject, cmp_user_id) VALUES (p_idp_subject, v_cmp) RETURNING id INTO v_id;
    RETURN v_id;
END $$;
