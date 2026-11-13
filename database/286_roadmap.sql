-- =====================================================================
-- 286_roadmap.sql : Master IT Roadmap (FR-04.1) — fase + butir (deliverable / milestone) bertanggal nyata.
--   eaw.roadmap_phase : fase program (rentang tanggal); level GRUP (bukan per entitas)
--   eaw.roadmap_item  : deliverable / milestone dengan target, status, bukti (objek EAW opsional)
-- Zero Pre-Seed: tidak ada fase/butir contoh; roadmap diisi oleh Holding EA Office (izin eaw.roadmap.write).
-- Status "terlambat" TIDAK disimpan: dihitung dari target < hari ini dan status bukan selesai (API).
-- =====================================================================
CREATE TABLE eaw.roadmap_phase (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama      VARCHAR(120) NOT NULL,
    deskripsi TEXT,
    urutan    SMALLINT NOT NULL DEFAULT 0,
    mulai     DATE NOT NULL,
    selesai   DATE NOT NULL,
    CONSTRAINT ck_roadmap_phase_range CHECK (selesai >= mulai)
);
CALL shared.apply_standard('eaw.roadmap_phase', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_roadmap_phase_nama ON eaw.roadmap_phase (lower(nama)) WHERE deleted_at IS NULL;

CREATE TABLE eaw.roadmap_item (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id    UUID NOT NULL REFERENCES eaw.roadmap_phase(id),
    jenis       VARCHAR(12) NOT NULL CHECK (jenis IN ('deliverable','milestone')),
    judul       VARCHAR(300) NOT NULL,
    catatan     TEXT,
    target      DATE NOT NULL,
    status      VARCHAR(12) NOT NULL DEFAULT 'direncanakan' CHECK (status IN ('direncanakan','berjalan','selesai','terhambat')),
    selesai_pada DATE,
    object_type VARCHAR(20) CHECK (object_type IN ('application','process','data_entity','service','infra_asset','control','framework')),
    object_id   UUID,
    CONSTRAINT ck_roadmap_item_done CHECK ((status = 'selesai') = (selesai_pada IS NOT NULL)),
    CONSTRAINT ck_roadmap_item_blocked CHECK (status <> 'terhambat' OR length(btrim(coalesce(catatan, ''))) >= 5),     -- terhambat wajib beralasan
    CONSTRAINT ck_roadmap_item_link CHECK ((object_type IS NULL) = (object_id IS NULL))
);
CALL shared.apply_standard('eaw.roadmap_item', 'internal', 'set.users');
CREATE INDEX ix_roadmap_item_phase ON eaw.roadmap_item (phase_id, target) WHERE deleted_at IS NULL;

-- Butir: target harus berada dalam rentang fasenya; selesai_pada diisi/dikosongkan otomatis; bukti objek harus ada & terlihat pemanggil.
CREATE FUNCTION eaw.tg_roadmap_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p eaw.roadmap_phase%ROWTYPE;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
    SELECT * INTO p FROM eaw.roadmap_phase WHERE id = NEW.phase_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Roadmap: fase tidak ditemukan' USING ERRCODE = '23503'; END IF;
    IF NEW.target < p.mulai OR NEW.target > p.selesai THEN
        RAISE EXCEPTION 'Roadmap: target % di luar rentang fase "%" (% s/d %)', NEW.target, p.nama, p.mulai, p.selesai USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'selesai' THEN NEW.selesai_pada := COALESCE(NEW.selesai_pada, current_date); ELSE NEW.selesai_pada := NULL; END IF;
    IF (NEW.object_type IS NULL) <> (NEW.object_id IS NULL) THEN RAISE EXCEPTION 'Roadmap: object_type dan object_id harus diisi bersamaan' USING ERRCODE = '23514'; END IF;
    IF NEW.object_id IS NOT NULL AND eaw.object_label(NEW.object_type, NEW.object_id) IS NULL THEN
        RAISE EXCEPTION 'Roadmap: objek bukti % % tidak ditemukan atau di luar cakupan akses', NEW.object_type, NEW.object_id USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_roadmap_item BEFORE INSERT OR UPDATE ON eaw.roadmap_item FOR EACH ROW EXECUTE FUNCTION eaw.tg_roadmap_item();

-- Fase: mengubah rentang tidak boleh mengeluarkan butir aktif dari rentang; fase berbutir tidak dapat dihapus.
CREATE FUNCTION eaw.tg_roadmap_phase() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        SELECT count(*) INTO n FROM eaw.roadmap_item WHERE phase_id = NEW.id AND deleted_at IS NULL;
        IF n > 0 THEN RAISE EXCEPTION 'Roadmap: fase "%" masih memiliki % butir aktif; hapus/pindahkan dulu', OLD.nama, n USING ERRCODE = '23503'; END IF;
    ELSIF NEW.deleted_at IS NULL AND (NEW.mulai <> OLD.mulai OR NEW.selesai <> OLD.selesai) THEN
        SELECT count(*) INTO n FROM eaw.roadmap_item WHERE phase_id = NEW.id AND deleted_at IS NULL AND (target < NEW.mulai OR target > NEW.selesai);
        IF n > 0 THEN RAISE EXCEPTION 'Roadmap: % butir akan berada di luar rentang baru fase "%"', n, OLD.nama USING ERRCODE = '23514'; END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_roadmap_phase BEFORE UPDATE ON eaw.roadmap_phase FOR EACH ROW EXECUTE FUNCTION eaw.tg_roadmap_phase();

-- Status objek bukti (mengikuti RLS pemanggil: objek di luar cakupan => NULL)
CREATE FUNCTION eaw.object_status(p_type text, p_id uuid) RETURNS text LANGUAGE sql STABLE AS $$
    SELECT CASE p_type
        WHEN 'application' THEN (SELECT x.status FROM eaw.application x WHERE x.id = p_id AND x.deleted_at IS NULL)
        WHEN 'process'     THEN (SELECT x.status FROM eaw.process x WHERE x.id = p_id AND x.deleted_at IS NULL)
        WHEN 'data_entity' THEN (SELECT x.status FROM eaw.data_entity x WHERE x.id = p_id AND x.deleted_at IS NULL)
        WHEN 'service'     THEN (SELECT x.status FROM eaw.service x WHERE x.id = p_id AND x.deleted_at IS NULL)
        WHEN 'infra_asset' THEN (SELECT x.status FROM eaw.infra_asset x WHERE x.id = p_id AND x.deleted_at IS NULL)
        WHEN 'control'     THEN (SELECT x.status FROM eaw.control x WHERE x.id = p_id AND x.deleted_at IS NULL)
        WHEN 'framework'   THEN (SELECT x.status FROM eaw.framework x WHERE x.id = p_id AND x.deleted_at IS NULL)
    END
$$;
