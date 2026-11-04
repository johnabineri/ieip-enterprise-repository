-- =====================================================================
-- 260_diagram_publication.sql : Kanvas ArchiMate (EAW-01) + Penerbit Dokumen Arsitektur (EAW-09, AF-08)
--   eaw.diagram     : diagram ArchiMate (JSONB nodes/edges) milik entitas; node dapat terikat ke objek EAW nyata (object_type/object_id)
--   eaw.publication : dokumen arsitektur TERBIT (Markdown/HTML), append-only, berversi per cakupan, ber-sha256
-- Validasi isi diagram (tipe elemen/relasi, referensi, pengikatan objek) dan penyusunan dokumen dilakukan API (eaw/diagrams, eaw/publisher).
-- =====================================================================
CREATE TABLE eaw.diagram (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id    UUID NOT NULL REFERENCES ref.business_groups(id),
    framework_id UUID REFERENCES eaw.framework(id),
    nama         VARCHAR(200) NOT NULL,
    content      JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
    CONSTRAINT ck_diagram_content CHECK (jsonb_typeof(content->'nodes') = 'array' AND jsonb_typeof(content->'edges') = 'array'
        AND jsonb_array_length(content->'nodes') <= 500 AND jsonb_array_length(content->'edges') <= 1000)
);
CALL shared.apply_standard('eaw.diagram', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_diagram_nama ON eaw.diagram (entity_id, nama) WHERE deleted_at IS NULL;

CREATE TABLE eaw.publication (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type   VARCHAR(10) NOT NULL CHECK (scope_type IN ('framework','entity')),
    framework_id UUID REFERENCES eaw.framework(id),
    entity_id    UUID NOT NULL REFERENCES ref.business_groups(id),
    scope_key    UUID NOT NULL,                                   -- = framework_id (kerangka) atau entity_id (entitas)
    format       VARCHAR(10) NOT NULL CHECK (format IN ('markdown','html')),
    versi        INTEGER NOT NULL,
    title        VARCHAR(300) NOT NULL,
    content      TEXT NOT NULL,
    sha256       CHAR(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    counts       JSONB NOT NULL DEFAULT '{}',
    warnings     JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT ck_publication_scope CHECK ((scope_type = 'framework') = (framework_id IS NOT NULL))
);
CALL shared.apply_standard('eaw.publication', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_publication_version ON eaw.publication (scope_key, format, versi);

-- versi berurutan per (cakupan, format); kunci penasihat mencegah balapan
CREATE FUNCTION eaw.tg_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.scope_key::text || NEW.format));
    SELECT COALESCE(max(versi), 0) + 1 INTO NEW.versi FROM eaw.publication WHERE scope_key = NEW.scope_key AND format = NEW.format;
    IF NEW.sha256 IS DISTINCT FROM encode(digest(NEW.content, 'sha256'), 'hex') THEN
        RAISE EXCEPTION 'sha256 tidak cocok dengan isi dokumen' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_publication_a_version BEFORE INSERT ON eaw.publication FOR EACH ROW EXECUTE FUNCTION eaw.tg_publication();
CREATE FUNCTION eaw.tg_publication_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'eaw.publication append-only (AF-08): % ditolak; terbitkan versi baru', TG_OP USING ERRCODE = 'insufficient_privilege'; END $$;
CREATE TRIGGER trg_publication_b_immutable BEFORE UPDATE OR DELETE ON eaw.publication FOR EACH ROW EXECUTE FUNCTION eaw.tg_publication_immutable();
