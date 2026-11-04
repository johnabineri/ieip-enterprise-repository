-- =====================================================================
-- 295_publication.sql : publikasi CDC EAP -> CMP (ref.applications)
-- EAP = pemilik registry aplikasi; CMP hanya membaca replika (cmp/database/020_ref.sql). Hanya aplikasi Dipublikasi.
-- Langganan di sisi CMP dibuat oleh docker/postgres/initdb/20-eap.sh (atau DBA di produksi).
-- =====================================================================
CREATE PUBLICATION pub_eap_ref FOR TABLE eaw.application_registry
    (id, parent_id, code, qualified_code, name, application_kind, lifecycle_status, deleted_at, row_version);
COMMENT ON PUBLICATION pub_eap_ref IS 'Registry aplikasi Dipublikasi -> kalla_cmp.ref.applications. Daftar kolom eksplisit; tanpa PII.';
