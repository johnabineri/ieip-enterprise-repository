-- =====================================================================
-- 280_import.sql : jejak impor CSV (EAW-09) — hanya impor yang DI-COMMIT; append-only (sha256 isi untuk keterlacakan)
-- =====================================================================
CREATE TABLE eaw.import_log (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jenis      VARCHAR(20) NOT NULL CHECK (jenis IN ('processes','data-entities','services','infra-assets','controls','applications','relations')),
    sha256     CHAR(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    baris      INTEGER NOT NULL CHECK (baris >= 0),
    dibuat     INTEGER NOT NULL CHECK (dibuat >= 0),
    nama_berkas VARCHAR(200)
);
CALL shared.apply_standard('eaw.import_log', 'internal', 'set.users');
CREATE FUNCTION eaw.tg_import_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'eaw.import_log append-only: % ditolak', TG_OP USING ERRCODE = 'insufficient_privilege'; END $$;
CREATE TRIGGER trg_import_log_immutable BEFORE UPDATE OR DELETE ON eaw.import_log FOR EACH ROW EXECUTE FUNCTION eaw.tg_import_log_immutable();
