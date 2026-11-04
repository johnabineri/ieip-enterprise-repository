-- =====================================================================
-- 215_eaw_relations.sql : relasi antar-objek (ArchiMate 3.2) dan validasi kelengkapan relasi wajib (EAW-05, SAF Bab 7)
--   * eaw.object_ref()       : entitas + status objek berdasarkan (jenis, id) — dasar RLS relasi
--   * eaw.relation_allowed() : matriks pasangan jenis objek + tipe relasi yang sah (arah kanonik: sumber = objek "atas")
--   * trigger relasi         : jenis sah, objek ada, bukan relasi-ke-diri, sumber harus Draf (objek non-Draf terkunci)
--   * eaw.relation_check()   : aturan relasi wajib per objek (dipakai eaw.transition ke Divalidasi dan API kesiapan)
-- Aturan (SAF Bab 7): Layanan >= 1 Proses; Aplikasi >= 1 Layanan, >= 1 Proses, >= 1 Entitas Data, >= 1 Infrastruktur, >= 1 Kontrol;
--   Entitas Data punya steward + sumber otoritatif; Kerangka Kerja memuat objek di keenam domain.
-- =====================================================================

CREATE FUNCTION eaw.object_ref(p_type text, p_id uuid) RETURNS TABLE (entity_id uuid, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, eaw AS $$
    SELECT a.entity_id, a.status::text FROM eaw.application a WHERE p_type = 'application' AND a.id = p_id AND a.deleted_at IS NULL
    UNION ALL SELECT x.entity_id, x.status::text FROM eaw.process x      WHERE p_type = 'process'      AND x.id = p_id AND x.deleted_at IS NULL
    UNION ALL SELECT x.entity_id, x.status::text FROM eaw.data_entity x  WHERE p_type = 'data_entity'  AND x.id = p_id AND x.deleted_at IS NULL
    UNION ALL SELECT x.entity_id, x.status::text FROM eaw.service x      WHERE p_type = 'service'      AND x.id = p_id AND x.deleted_at IS NULL
    UNION ALL SELECT x.entity_id, x.status::text FROM eaw.infra_asset x  WHERE p_type = 'infra_asset'  AND x.id = p_id AND x.deleted_at IS NULL
    UNION ALL SELECT x.entity_id, x.status::text FROM eaw.control x      WHERE p_type = 'control'      AND x.id = p_id AND x.deleted_at IS NULL
    UNION ALL SELECT x.entity_id, x.status::text FROM eaw.framework x    WHERE p_type = 'framework'    AND x.id = p_id AND x.deleted_at IS NULL
$$;

CREATE FUNCTION eaw.relation_allowed(p_sumber text, p_target text, p_tipe text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
    SELECT EXISTS (SELECT 1 FROM (VALUES
        ('application','service','serving'), ('application','service','realization'),
        ('application','process','serving'), ('application','process','association'),
        ('application','data_entity','access'),
        ('application','infra_asset','assignment'), ('application','infra_asset','association'),
        ('application','control','association'),
        ('application','application','flow'), ('application','application','serving'), ('application','application','used-by'),
        ('service','process','realization'), ('service','process','association'), ('service','process','serving'),
        ('process','data_entity','access'),
        ('process','process','composition'), ('process','process','triggering'), ('process','process','flow')
    ) m(s, t, k) WHERE m.s = p_sumber AND m.t = p_target AND m.k = p_tipe)
$$;

-- unik per pasangan+tipe (relasi aktif)
CREATE UNIQUE INDEX ux_relation_pair ON eaw.relation (sumber_type, sumber_id, target_type, target_id, tipe) WHERE deleted_at IS NULL;
ALTER TABLE eaw.relation ADD CONSTRAINT ck_relation_types CHECK (
    sumber_type IN ('application','service','process','data_entity','infra_asset','control')
    AND target_type IN ('application','service','process','data_entity','infra_asset','control'));

CREATE FUNCTION eaw.tg_relation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_s RECORD; v_t RECORD; v_in BOOLEAN := COALESCE(current_setting('eaw.in_transition', true), 'off') = 'on';
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.sumber_type, NEW.sumber_id, NEW.target_type, NEW.target_id, NEW.tipe) IS DISTINCT FROM (OLD.sumber_type, OLD.sumber_id, OLD.target_type, OLD.target_id, OLD.tipe) THEN
        RAISE EXCEPTION 'relasi tidak dapat diubah; hapus lalu buat relasi baru' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT eaw.relation_allowed(NEW.sumber_type, NEW.target_type, NEW.tipe) THEN
        RAISE EXCEPTION 'relasi % -> % (%) tidak sah menurut matriks relasi EAW', NEW.sumber_type, NEW.target_type, NEW.tipe USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.sumber_type = NEW.target_type AND NEW.sumber_id = NEW.target_id THEN
        RAISE EXCEPTION 'objek tidak dapat berelasi dengan dirinya sendiri' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO v_s FROM eaw.object_ref(NEW.sumber_type, NEW.sumber_id);
    IF NOT FOUND THEN RAISE EXCEPTION 'objek sumber (% %) tidak ditemukan', NEW.sumber_type, NEW.sumber_id USING ERRCODE = 'foreign_key_violation'; END IF;
    IF TG_OP = 'INSERT' THEN
        SELECT * INTO v_t FROM eaw.object_ref(NEW.target_type, NEW.target_id);
        IF NOT FOUND THEN RAISE EXCEPTION 'objek target (% %) tidak ditemukan', NEW.target_type, NEW.target_id USING ERRCODE = 'foreign_key_violation'; END IF;
    END IF;
    -- objek non-Draf terkunci (AF-05): relasi sumber hanya berubah saat Draf
    IF NOT v_in AND v_s.status <> 'Draf' THEN
        RAISE EXCEPTION 'objek sumber berstatus % terkunci; kembalikan ke Draf lewat alur AF-05 untuk mengubah relasinya', v_s.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_relation_a_guard BEFORE INSERT OR UPDATE ON eaw.relation FOR EACH ROW EXECUTE FUNCTION eaw.tg_relation();

-- ---------- aturan relasi wajib ----------
CREATE FUNCTION eaw.relation_check(p_type text, p_id uuid) RETURNS TABLE (rule text, ok boolean, n integer, pesan text)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF p_type = 'application' THEN
        RETURN QUERY
        SELECT m.k, (c.n >= m.min), c.n, format('minimal %s %s (ditemukan %s)', m.min, m.label, c.n)
          FROM (VALUES ('layanan', 'Layanan', 'service', 1), ('proses', 'Proses', 'process', 1), ('data', 'Entitas Data', 'data_entity', 1),
                       ('infra', 'Infrastruktur', 'infra_asset', 1), ('kontrol', 'Kontrol Keamanan', 'control', 1)) AS m(k, label, tt, min)
          CROSS JOIN LATERAL (SELECT count(DISTINCT r.target_id)::int AS n FROM eaw.relation r
                               WHERE r.deleted_at IS NULL AND r.sumber_type = 'application' AND r.sumber_id = p_id AND r.target_type = m.tt
                                 AND EXISTS (SELECT 1 FROM eaw.object_ref(m.tt, r.target_id))) c;
    ELSIF p_type = 'service' THEN
        RETURN QUERY
        SELECT 'proses', (c.n >= 1), c.n, format('minimal 1 Proses (ditemukan %s)', c.n)
          FROM (SELECT count(DISTINCT r.target_id)::int AS n FROM eaw.relation r
                 WHERE r.deleted_at IS NULL AND r.sumber_type = 'service' AND r.sumber_id = p_id AND r.target_type = 'process'
                   AND EXISTS (SELECT 1 FROM eaw.object_ref('process', r.target_id))) c;
    ELSIF p_type = 'data_entity' THEN
        RETURN QUERY
        SELECT 'steward', (length(btrim(COALESCE(d.steward, ''))) > 0), 0, 'steward wajib terisi' FROM eaw.data_entity d WHERE d.id = p_id
        UNION ALL
        SELECT 'sumber_otoritatif', (length(btrim(COALESCE(d.sumber_otoritatif, ''))) > 0), 0, 'sumber otoritatif wajib terisi' FROM eaw.data_entity d WHERE d.id = p_id;
    ELSIF p_type = 'framework' THEN
        RETURN QUERY
        SELECT m.k, (c.n >= 1), c.n, format('minimal 1 objek di domain %s (ditemukan %s)', m.label, c.n)
          FROM (VALUES ('proses_bisnis', 'Proses Bisnis', 'process'), ('data', 'Data & Informasi', 'data_entity'), ('layanan', 'Layanan Enterprise', 'service'),
                       ('aplikasi', 'Aplikasi & Integrasi', 'application'), ('infrastruktur', 'Infrastruktur & Teknologi', 'infra_asset'),
                       ('keamanan', 'Keamanan Informasi', 'control')) AS m(k, label, ty)
          CROSS JOIN LATERAL (SELECT count(DISTINCT o.oid)::int AS n FROM (
                    SELECT r.sumber_id AS oid FROM eaw.relation r WHERE r.deleted_at IS NULL AND r.kerangka_id = p_id AND r.sumber_type = m.ty
                    UNION SELECT r.target_id FROM eaw.relation r WHERE r.deleted_at IS NULL AND r.kerangka_id = p_id AND r.target_type = m.ty) o) c;
    END IF;
END $$;
COMMENT ON FUNCTION eaw.relation_check IS 'Aturan relasi wajib (EAW-05). INVOKER: dipanggil eaw.transition (definer) dan API kesiapan; hasil mengikuti RLS pemanggil.';

-- label objek untuk tampilan relasi (INVOKER: mengikuti RLS pemanggil; objek di luar cakupan -> NULL)
CREATE FUNCTION eaw.object_label(p_type text, p_id uuid) RETURNS text LANGUAGE sql STABLE AS $$
    SELECT CASE p_type
        WHEN 'application' THEN (SELECT a.kode || ' · ' || a.nama FROM eaw.application a WHERE a.id = p_id AND a.deleted_at IS NULL)
        WHEN 'process'     THEN (SELECT x.nama FROM eaw.process x WHERE x.id = p_id AND x.deleted_at IS NULL)
        WHEN 'data_entity' THEN (SELECT x.nama_kanonikal FROM eaw.data_entity x WHERE x.id = p_id AND x.deleted_at IS NULL)
        WHEN 'service'     THEN (SELECT x.nama FROM eaw.service x WHERE x.id = p_id AND x.deleted_at IS NULL)
        WHEN 'infra_asset' THEN (SELECT x.nama FROM eaw.infra_asset x WHERE x.id = p_id AND x.deleted_at IS NULL)
        WHEN 'control'     THEN (SELECT x.aspek || COALESCE(' · ' || x.standar_rujukan, '') FROM eaw.control x WHERE x.id = p_id AND x.deleted_at IS NULL)
        WHEN 'framework'   THEN (SELECT x.layanan_utama FROM eaw.framework x WHERE x.id = p_id AND x.deleted_at IS NULL)
    END
$$;
