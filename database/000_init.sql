-- =====================================================================
-- SAORAJA EAP — database `kalla_eap`
-- 000_init.sql : ekstensi, schema, role database
-- Spesifikasi: eap/SRS.md §5 (skema), D-12 (set seragam), D-14 (TANPA PII di database EAP)
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;      -- dipakai replika ref.users.username
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS set;       -- otorisasi/RBAC seragam (D-12); hanya pengenal buram IdP (D-14)
CREATE SCHEMA IF NOT EXISTS eaw;       -- metadata arsitektur enterprise 6 domain + ARB + ADR + alur AF-05
CREATE SCHEMA IF NOT EXISTS gse;       -- (dicadangkan) registri scaffolding — belum dibangun
CREATE SCHEMA IF NOT EXISTS console;   -- (dicadangkan) inventaris AI/FinOps/konektor — belum dibangun
CREATE SCHEMA IF NOT EXISTS shared;    -- layanan bersama; struktur IDENTIK dengan kalla_cmp.shared (ADR-CMP-004)
CREATE SCHEMA IF NOT EXISTS ref;       -- replika read-only dari SEDDI (CDC pub_cmp_ref)
COMMENT ON SCHEMA set  IS 'D-12/D-14: otorisasi seragam. DILARANG menyimpan data pribadi; pengguna hanya idp_subject (+ cmp_user_id buram).';
COMMENT ON SCHEMA eaw  IS 'Arsitektur enterprise SAORAJA: 6 domain, KRA, ADR, ARB, alur tata kelola AF-05 (append-only).';
COMMENT ON SCHEMA ref  IS 'Replika READ-ONLY dari kalla_cmp. EAP tidak pernah menulis ke sini.';

-- Peran DB (NOLOGIN; login aplikasi menjadi anggota eap_app). eap_cdc = pembaca publikasi pub_eap_ref (ke CMP).
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['eap_owner','eap_app','eap_ro','eap_audit','eap_cdc'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END $$;
