-- =====================================================================
-- 06_pii_guard.test.sql : D-14 — tidak ada kolom PII di skema milik EAP (SRS 8.2, gate `pii-guard` pada CI)
-- Skema `ref` (replika CMP) dikecualikan: isinya dibatasi publikasi pub_cmp_ref di sumbernya (CMP).
-- =====================================================================
DO $$
DECLARE bad text; users_cols text;
BEGIN
    SELECT string_agg(table_schema || '.' || table_name || '.' || column_name, ', ') INTO bad
      FROM information_schema.columns
     WHERE table_schema IN ('set', 'eaw', 'gse', 'console', 'shared')
       AND column_name ~* '^(e_?mail|full_?name|nama_lengkap|nik|ktp|phone|telp|telepon|no_?hp|handphone|address|alamat|birth|tgl_lahir|tanggal_lahir|npwp)';
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'kolom PII terlarang di database EAP (D-14): %', bad; END IF;

    -- set.users hanya boleh memuat pengenal buram + kolom standar
    SELECT string_agg(column_name, ',' ORDER BY column_name) INTO users_cols FROM information_schema.columns WHERE table_schema = 'set' AND table_name = 'users';
    IF users_cols <> 'cmp_user_id,created_at,created_by,data_classification,deleted_at,id,idp_subject,is_active,last_login_at,row_version,updated_at,updated_by' THEN
        RAISE EXCEPTION 'set.users harus hanya pengenal buram + status + kolom standar; ditemukan: %', users_cols;
    END IF;
    -- hasil audit tidak boleh menyimpan nama/surel pengguna: tidak ada kolom itu di set.* sehingga tidak ada yang tersamarkan
END $$;
