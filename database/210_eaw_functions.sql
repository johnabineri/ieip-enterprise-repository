-- =====================================================================
-- 210_eaw_functions.sql : penegakan tata kelola di DATABASE (bukan hanya di API)
--   * pembantu cakupan (dibaca dari GUC app.eap_* yang diisi API dari set.session_claims)
--   * penjaga status AF-05 (status hanya berubah lewat eaw.transition; objek non-Draf tidak dapat disunting)
--   * eaw.transition()  : transisi AF-05 + validasi (EAW-05) + jejak append-only eaw.workflow (EAW-07)
--   * eaw.arb_transition(): alur ARB Clearance (empat mata + sertifikat)
--   * proyeksi registry aplikasi -> CMP, validasi platform induk, kekekalan ADR & workflow
-- =====================================================================

-- ---------- pembantu cakupan ----------
CREATE FUNCTION eaw.flag(p_guc text) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT COALESCE(current_setting(p_guc, true) = '1', false) $$;

CREATE FUNCTION eaw.in_ids(p_id uuid, p_guc text) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT p_id IS NOT NULL AND COALESCE(p_id::text = ANY (string_to_array(NULLIF(current_setting(p_guc, true), ''), ',')), false) $$;

-- boleh LIHAT: Dipublikasi (semua pengguna terautentikasi), atau pemegang peran lihat-semua, atau entitas dalam cakupannya
CREATE FUNCTION eaw.can_view(p_entity uuid, p_status text) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT p_status = 'Dipublikasi' OR eaw.flag('app.eap_view_all') OR eaw.flag('app.eap_edit_all')
        OR eaw.in_ids(p_entity, 'app.eap_view_ids') OR eaw.in_ids(p_entity, 'app.eap_edit_ids')
$$;
-- boleh SUSUN: seluruh hierarki (peran holding) atau entitas penugasannya beserta turunan
CREATE FUNCTION eaw.can_edit(p_entity uuid) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT eaw.flag('app.eap_edit_all') OR eaw.in_ids(p_entity, 'app.eap_edit_ids') $$;

-- ---------- penjaga status AF-05 (semua tabel domain bersatus) ----------
CREATE FUNCTION eaw.tg_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_in boolean := COALESCE(current_setting('eaw.in_transition', true), 'off') = 'on';
        v_noise text[] := ARRAY['updated_at','updated_by','row_version','status'];
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'Draf' THEN
            RAISE EXCEPTION 'objek baru wajib berstatus Draf (AF-05); status berubah lewat eaw.transition()' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT v_in THEN
        RAISE EXCEPTION 'status hanya dapat diubah lewat eaw.transition() (AF-05, EAW-07)' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- objek yang sudah divalidasi/ditetapkan/dipublikasi tidak disunting di tempat (jejak versi ada di audit_logs); kembalikan ke Draf dulu
    IF OLD.status <> 'Draf' AND NOT v_in AND (to_jsonb(NEW) - v_noise) IS DISTINCT FROM (to_jsonb(OLD) - v_noise) THEN
        RAISE EXCEPTION 'objek berstatus % tidak dapat diubah; kembalikan ke Draf lewat alur tata kelola', OLD.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['reference','framework','process','data_entity','service','application','infra_asset','control'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_a_status BEFORE INSERT OR UPDATE ON eaw.%1$I FOR EACH ROW EXECUTE FUNCTION eaw.tg_status_guard()', t);
  END LOOP;
END $$;

-- platform induk harus berupa aplikasi platform (platform IS NULL) yang ada
CREATE FUNCTION eaw.tg_application_platform() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_su BOOLEAN := COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false);
    v_in BOOLEAN := COALESCE(current_setting('eaw.in_transition', true), 'off') = 'on';
    v_t RECORD;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.jenis_node IS NULL THEN NEW.jenis_node := CASE WHEN NEW.platform IS NULL THEN 'platform' ELSE 'workspace' END; END IF;
    ELSIF NEW.jenis_node IS DISTINCT FROM OLD.jenis_node THEN
        RAISE EXCEPTION 'jenis node (platform/workspace) tidak dapat diubah' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT v_in AND NOT v_su THEN
        -- hanya Enterprise Application Architect (eaw.platform.write) yang membentuk/mengubah platform
        IF NEW.jenis_node = 'platform' AND NOT set.has_perm('eaw.platform.write') THEN
            RAISE EXCEPTION 'membuat/mengubah platform memerlukan izin eaw.platform.write (Enterprise Application Architect)' USING ERRCODE = 'insufficient_privilege';
        END IF;
        -- hanya eaw.workspace.assign yang menempatkan/memindahkan workspace ke platform dan menandai adopsi
        IF ((TG_OP = 'INSERT' AND NEW.platform IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.platform IS DISTINCT FROM OLD.platform))
           AND NOT set.has_perm('eaw.workspace.assign') THEN
            RAISE EXCEPTION 'menempatkan/memindahkan workspace ke platform memerlukan izin eaw.workspace.assign' USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF NEW.adopsi AND (TG_OP = 'INSERT' OR NOT OLD.adopsi) AND NOT set.has_perm('eaw.workspace.assign') THEN
            RAISE EXCEPTION 'penandaan adopsi workspace memerlukan izin eaw.workspace.assign' USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;
    IF NEW.platform IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM eaw.application p WHERE p.kode = NEW.platform AND p.jenis_node = 'platform' AND p.deleted_at IS NULL) THEN
        RAISE EXCEPTION 'platform induk % belum terdaftar sebagai platform di katalog (daftarkan platform dulu)', NEW.platform USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NEW.arb_clearance_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.arb_clearance_id IS DISTINCT FROM OLD.arb_clearance_id) THEN
        SELECT c.status, c.entity_id INTO v_t FROM eaw.arb_clearance c WHERE c.id = NEW.arb_clearance_id AND c.deleted_at IS NULL;
        IF NOT FOUND THEN RAISE EXCEPTION 'tiket ARB tidak ditemukan atau di luar cakupan' USING ERRCODE = 'foreign_key_violation'; END IF;
        IF v_t.status <> 'APPROVED' THEN RAISE EXCEPTION 'tiket ARB belum APPROVED (status %)', v_t.status USING ERRCODE = 'check_violation'; END IF;
        IF v_t.entity_id <> NEW.entity_id THEN RAISE EXCEPTION 'entitas aplikasi harus sama dengan entitas pengaju tiket ARB' USING ERRCODE = 'check_violation'; END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_application_a_platform BEFORE INSERT OR UPDATE ON eaw.application
    FOR EACH ROW EXECUTE FUNCTION eaw.tg_application_platform();

-- ---------- eaw.workflow & ADR: kekekalan ----------
CREATE FUNCTION eaw.tg_workflow_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'eaw.workflow append-only: % ditolak', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER trg_workflow_immutable BEFORE UPDATE OR DELETE ON eaw.workflow FOR EACH ROW EXECUTE FUNCTION eaw.tg_workflow_immutable();
CREATE TRIGGER trg_workflow_no_truncate BEFORE TRUNCATE ON eaw.workflow FOR EACH STATEMENT EXECUTE FUNCTION eaw.tg_workflow_immutable();

-- ADR: status hanya oleh pemegang eaw.baseline.approve (keputusan ARB); isi keputusan terkunci setelah Proposed
CREATE FUNCTION eaw.tg_adr_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_noise text[] := ARRAY['updated_at','updated_by','row_version','status','superseded_by','git_ref'];
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'Proposed' THEN RAISE EXCEPTION 'ADR baru wajib berstatus Proposed' USING ERRCODE = 'check_violation'; END IF;
        RETURN NEW;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (set.has_perm('eaw.baseline.approve') OR (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)) THEN
        RAISE EXCEPTION 'perubahan status ADR hanya oleh pemegang izin eaw.baseline.approve (keputusan ARB)' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.status <> 'Proposed' AND (to_jsonb(NEW) - v_noise) IS DISTINCT FROM (to_jsonb(OLD) - v_noise) THEN
        RAISE EXCEPTION 'isi ADR berstatus % terkunci; buat ADR baru yang menggantikan (Superseded)', OLD.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_adr_a_guard BEFORE INSERT OR UPDATE ON eaw.adr FOR EACH ROW EXECUTE FUNCTION eaw.tg_adr_guard();

-- ---------- eaw.transition : alur AF-05 ----------
-- Draf -> Divalidasi (Holding EA Office) -> Ditetapkan (ARB) -> Dipublikasi (EA Office) -> Direviu (reviu AF-07) -> Divalidasi | Draf
-- SECURITY DEFINER: satu-satunya jalan mengubah status + satu-satunya penulis eaw.workflow. Izin & cakupan diperiksa DI SINI.
CREATE FUNCTION eaw.transition(p_type TEXT, p_id UUID, p_to TEXT, p_note TEXT DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, eaw, set, ref, shared AS $$
DECLARE
    v_tbl TEXT; v_from TEXT; v_entity UUID; v_creator UUID; v_nama TEXT; v_ref UUID; v_perm TEXT;
    v_user UUID := shared.current_user_id();
    v_warn JSONB := '[]'::jsonb; v_has_ref BOOLEAN; v_has_entity BOOLEAN; v_app RECORD; v_pstat TEXT; v_missing TEXT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'sesi tanpa pengguna' USING ERRCODE = 'insufficient_privilege'; END IF;
    v_tbl := CASE p_type
        WHEN 'application' THEN 'eaw.application' WHEN 'reference' THEN 'eaw.reference' WHEN 'framework' THEN 'eaw.framework'
        WHEN 'process' THEN 'eaw.process' WHEN 'data_entity' THEN 'eaw.data_entity' WHEN 'service' THEN 'eaw.service'
        WHEN 'infra_asset' THEN 'eaw.infra_asset' WHEN 'control' THEN 'eaw.control' END;
    IF v_tbl IS NULL THEN RAISE EXCEPTION 'jenis objek tidak dikenal: %', p_type USING ERRCODE = 'invalid_parameter_value'; END IF;
    v_has_entity := p_type <> 'reference';
    v_has_ref := p_type NOT IN ('reference', 'framework');

    EXECUTE format('SELECT status, %s, created_by, %s, %s FROM %s WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
                   CASE WHEN v_has_entity THEN 'entity_id' ELSE 'NULL::uuid' END,
                   CASE p_type WHEN 'application' THEN 'nama' WHEN 'reference' THEN 'nama' WHEN 'data_entity' THEN 'nama_kanonikal'
                               WHEN 'framework' THEN 'layanan_utama' WHEN 'control' THEN 'standar_rujukan' ELSE 'nama' END,
                   CASE WHEN v_has_ref THEN 'referensi_id' ELSE 'NULL::uuid' END, v_tbl)
       INTO v_from, v_entity, v_creator, v_nama, v_ref USING p_id;
    IF v_from IS NULL THEN RAISE EXCEPTION 'objek % tidak ditemukan', p_id USING ERRCODE = 'no_data_found'; END IF;

    -- cakupan: objek harus terlihat oleh pelaku (KRA tanpa entitas: hanya peran holding-wide)
    IF v_has_entity THEN
        IF NOT eaw.can_view(v_entity, v_from) THEN RAISE EXCEPTION 'di luar cakupan akses (403)' USING ERRCODE = 'insufficient_privilege'; END IF;
    ELSIF NOT (eaw.flag('app.eap_view_all') OR eaw.flag('app.eap_edit_all')) THEN
        RAISE EXCEPTION 'KRA hanya dapat ditransisikan oleh peran holding-wide (403)' USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_perm := CASE
        WHEN v_from = 'Draf'        AND p_to = 'Divalidasi'  THEN 'eaw.validation.approve'
        WHEN v_from = 'Divalidasi'  AND p_to = 'Draf'        THEN 'eaw.validation.approve'
        WHEN v_from = 'Divalidasi'  AND p_to = 'Ditetapkan'  THEN 'eaw.baseline.approve'
        WHEN v_from = 'Ditetapkan'  AND p_to = 'Dipublikasi' THEN 'eaw.publication.approve'
        WHEN v_from = 'Dipublikasi' AND p_to = 'Direviu'     THEN 'eaw.review.run'
        WHEN v_from = 'Direviu'     AND p_to = 'Divalidasi'  THEN 'eaw.validation.approve'
        WHEN v_from = 'Direviu'     AND p_to = 'Draf'        THEN 'eaw.review.run'
    END;
    IF v_perm IS NULL THEN
        RAISE EXCEPTION 'transisi % -> % tidak diizinkan (alur AF-05: Draf > Divalidasi > Ditetapkan > Dipublikasi > Direviu)', v_from, p_to USING ERRCODE = 'check_violation';
    END IF;
    IF NOT set.has_perm(v_perm) THEN
        RAISE EXCEPTION 'izin % diperlukan untuk transisi % -> % (403)', v_perm, v_from, p_to USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF (p_to IN ('Ditetapkan', 'Direviu') OR p_to = 'Draf') AND length(btrim(COALESCE(p_note, ''))) < 5 THEN
        RAISE EXCEPTION 'catatan (min. 5 karakter) wajib untuk transisi ke % (rujuk keputusan ARB/ADR atau alasan revisi)', p_to USING ERRCODE = 'check_violation';
    END IF;
    -- empat mata: penyusun tidak menetapkan objeknya sendiri
    IF p_to = 'Ditetapkan' AND v_creator = v_user THEN
        RAISE EXCEPTION 'penyusun objek tidak boleh menetapkan objeknya sendiri (maker-checker)' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- EAW-05: validasi menolak objek tanpa tautan KRA; pesan menyebut objek & yang kurang
    IF p_to = 'Divalidasi' AND v_has_ref THEN
        IF v_ref IS NULL THEN
            RAISE EXCEPTION 'validasi ditolak: % "%" belum tertaut ke referensi KRA (referensi_id kosong)', p_type, v_nama USING ERRCODE = 'check_violation';
        ELSIF NOT EXISTS (SELECT 1 FROM eaw.reference r WHERE r.id = v_ref AND r.deleted_at IS NULL) THEN
            RAISE EXCEPTION 'validasi ditolak: % "%" menautkan KRA yang tidak ada', p_type, v_nama USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    -- EAW-05: relasi wajib (SAF Bab 7) menolak Divalidasi; pesan menyebut objek dan relasi yang kurang
    IF p_to = 'Divalidasi' AND p_type IN ('application', 'service', 'data_entity', 'framework') THEN
        SELECT string_agg(c.pesan, '; ') INTO v_missing FROM eaw.relation_check(p_type, p_id) c WHERE NOT c.ok;
        IF v_missing IS NOT NULL THEN
            RAISE EXCEPTION 'validasi ditolak: % "%" kekurangan relasi/atribut wajib: %', p_type, v_nama, v_missing USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- profil platform, penempatan workspace, dasar ARB, dan urutan status anak <= induk
    IF p_type = 'application' AND p_to IN ('Divalidasi', 'Ditetapkan', 'Dipublikasi') THEN
        SELECT a.jenis_node, a.platform, a.ui_standard, a.tech_stack, a.arb_clearance_id, a.adopsi INTO v_app FROM eaw.application a WHERE a.id = p_id;
        IF p_to = 'Divalidasi' AND v_app.jenis_node = 'platform' AND (length(btrim(COALESCE(v_app.ui_standard, ''))) = 0 OR length(btrim(COALESCE(v_app.tech_stack, ''))) = 0) THEN
            RAISE EXCEPTION 'validasi ditolak: platform "%" wajib memiliki profil standar UI/UX dan tech stack', v_nama USING ERRCODE = 'check_violation';
        END IF;
        IF v_app.jenis_node = 'workspace' THEN
            IF p_to = 'Divalidasi' AND v_app.platform IS NULL THEN
                RAISE EXCEPTION 'validasi ditolak: workspace "%" belum ditempatkan di platform (eaw.workspace.assign)', v_nama USING ERRCODE = 'check_violation';
            END IF;
            IF p_to = 'Divalidasi' AND v_app.arb_clearance_id IS NULL AND NOT v_app.adopsi THEN
                RAISE EXCEPTION 'validasi ditolak: workspace "%" wajib tertaut tiket ARB APPROVED (atau ditandai adopsi)', v_nama USING ERRCODE = 'check_violation';
            END IF;
            IF p_to IN ('Ditetapkan', 'Dipublikasi') THEN
                SELECT p.status INTO v_pstat FROM eaw.application p WHERE p.kode = v_app.platform AND p.jenis_node = 'platform' AND p.deleted_at IS NULL;
                IF v_pstat IS NULL OR (p_to = 'Ditetapkan' AND v_pstat NOT IN ('Ditetapkan', 'Dipublikasi', 'Direviu')) OR (p_to = 'Dipublikasi' AND v_pstat <> 'Dipublikasi') THEN
                    RAISE EXCEPTION 'workspace "%" tidak boleh melampaui platform induk % (status induk: %; syarat: %)', v_nama, v_app.platform, COALESCE(v_pstat, 'tidak ada'),
                        CASE p_to WHEN 'Ditetapkan' THEN 'minimal Ditetapkan' ELSE 'Dipublikasi' END USING ERRCODE = 'check_violation';
                END IF;
            END IF;
        END IF;
    END IF;

    PERFORM set_config('eaw.in_transition', 'on', true);
    EXECUTE format('UPDATE %s SET status = $2 WHERE id = $1', v_tbl) USING p_id, p_to;
    PERFORM set_config('eaw.in_transition', 'off', true);

    INSERT INTO eaw.workflow (objek_type, objek_id, status_dari, status_ke, pelaku, catatan) VALUES (p_type, p_id, v_from, p_to, v_user, p_note);
    RETURN jsonb_build_object('type', p_type, 'id', p_id, 'from', v_from, 'to', p_to, 'warnings', v_warn);
END $$;
COMMENT ON FUNCTION eaw.transition IS 'Satu-satunya jalan mengubah status AF-05 dan menulis eaw.workflow. Izin eaw.*.approve/run dibaca dari GUC app.eap_perms.';

-- ---------- ARB Clearance ----------
CREATE FUNCTION eaw.tg_arb_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_in boolean := COALESCE(current_setting('eaw.in_transition', true), 'off') = 'on';
        v_noise text[] := ARRAY['updated_at','updated_by','row_version'];
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'SUBMITTED' THEN RAISE EXCEPTION 'tiket ARB baru wajib SUBMITTED' USING ERRCODE = 'check_violation'; END IF;
        RETURN NEW;
    END IF;
    IF NOT v_in AND (to_jsonb(NEW) - v_noise) IS DISTINCT FROM (to_jsonb(OLD) - v_noise) THEN
        IF NEW.status IS DISTINCT FROM OLD.status OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id OR NEW.decided_by IS DISTINCT FROM OLD.decided_by
           OR NEW.arb_notes IS DISTINCT FROM OLD.arb_notes THEN
            RAISE EXCEPTION 'status/putusan ARB hanya berubah lewat eaw.arb_transition()' USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF OLD.status NOT IN ('SUBMITTED', 'REVISION') THEN
            RAISE EXCEPTION 'tiket berstatus % tidak dapat disunting', OLD.status USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_arb_clearance_a_guard BEFORE INSERT OR UPDATE ON eaw.arb_clearance FOR EACH ROW EXECUTE FUNCTION eaw.tg_arb_guard();

-- SUBMITTED -> IN_REVIEW -> (REVISION -> SUBMITTED) | APPROVED | REJECTED
CREATE FUNCTION eaw.arb_transition(p_id UUID, p_to TEXT, p_notes TEXT DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, eaw, set, ref, shared AS $$
DECLARE
    v_user UUID := shared.current_user_id(); v_from TEXT; v_entity UUID; v_proposer UUID; v_cert TEXT; v_perm TEXT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'sesi tanpa pengguna' USING ERRCODE = 'insufficient_privilege'; END IF;
    SELECT status, entity_id, proposed_by INTO v_from, v_entity, v_proposer FROM eaw.arb_clearance WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
    IF v_from IS NULL THEN RAISE EXCEPTION 'tiket ARB tidak ditemukan' USING ERRCODE = 'no_data_found'; END IF;
    IF NOT (v_proposer = v_user OR eaw.can_view(v_entity, 'x')) THEN
        RAISE EXCEPTION 'di luar cakupan akses (403)' USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_perm := CASE
        WHEN v_from = 'SUBMITTED' AND p_to = 'IN_REVIEW' THEN 'gov.arb.write'
        WHEN v_from = 'IN_REVIEW' AND p_to = 'REVISION'  THEN 'gov.arb.write'
        WHEN v_from = 'REVISION'  AND p_to = 'SUBMITTED' THEN 'gov.arb.write'
        WHEN v_from = 'IN_REVIEW' AND p_to IN ('APPROVED', 'REJECTED') THEN 'gov.arb.approve'
    END;
    IF v_perm IS NULL THEN RAISE EXCEPTION 'transisi ARB % -> % tidak diizinkan', v_from, p_to USING ERRCODE = 'check_violation'; END IF;
    IF NOT set.has_perm(v_perm) THEN RAISE EXCEPTION 'izin % diperlukan (403)', v_perm USING ERRCODE = 'insufficient_privilege'; END IF;
    -- pengaju mengirim ulang tiketnya sendiri; peninjauan/putusan oleh orang lain
    IF p_to = 'SUBMITTED' AND v_proposer <> v_user THEN RAISE EXCEPTION 'hanya pengaju yang dapat mengirim ulang tiket' USING ERRCODE = 'insufficient_privilege'; END IF;
    IF p_to IN ('IN_REVIEW', 'REVISION', 'APPROVED', 'REJECTED') AND v_proposer = v_user THEN
        RAISE EXCEPTION 'pengaju tidak boleh meninjau/memutus tiketnya sendiri (empat mata)' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_to IN ('REVISION', 'REJECTED') AND length(btrim(COALESCE(p_notes, ''))) < 10 THEN
        RAISE EXCEPTION 'catatan ARB (min. 10 karakter) wajib untuk % ', p_to USING ERRCODE = 'check_violation';
    END IF;

    v_cert := CASE WHEN p_to = 'APPROVED' THEN 'CERT-ARB-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('eaw.arb_certificate_seq')::text, 4, '0') END;
    PERFORM set_config('eaw.in_transition', 'on', true);
    UPDATE eaw.arb_clearance
       SET status = p_to, arb_notes = COALESCE(NULLIF(btrim(p_notes), ''), arb_notes), certificate_id = v_cert,
           decided_by = CASE WHEN p_to IN ('APPROVED', 'REJECTED') THEN v_user END,
           decided_at = CASE WHEN p_to IN ('APPROVED', 'REJECTED') THEN now() END
     WHERE id = p_id;
    PERFORM set_config('eaw.in_transition', 'off', true);
    INSERT INTO eaw.workflow (objek_type, objek_id, status_dari, status_ke, pelaku, catatan) VALUES ('arb_clearance', p_id, v_from, p_to, v_user, p_notes);
    RETURN jsonb_build_object('id', p_id, 'from', v_from, 'to', p_to, 'certificate_id', v_cert);
END $$;

-- ---------- proyeksi registry aplikasi -> CMP ----------
CREATE FUNCTION eaw.tg_application_registry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, eaw AS $$
BEGIN
    IF NEW.status = 'Dipublikasi' AND NEW.deleted_at IS NULL THEN
        INSERT INTO eaw.application_registry (id, parent_id, code, qualified_code, name, application_kind, lifecycle_status, deleted_at)
        VALUES (NEW.id, (SELECT p.id FROM eaw.application p WHERE p.kode = NEW.platform AND p.deleted_at IS NULL),
                NEW.kode, COALESCE(NEW.platform || '/', '') || NEW.kode, NEW.nama,
                NEW.jenis_node, NEW.lifecycle, NULL)
        ON CONFLICT (id) DO UPDATE SET parent_id = EXCLUDED.parent_id, code = EXCLUDED.code, qualified_code = EXCLUDED.qualified_code, name = EXCLUDED.name,
              application_kind = EXCLUDED.application_kind, lifecycle_status = EXCLUDED.lifecycle_status, deleted_at = NULL,
              row_version = eaw.application_registry.row_version + 1;
    ELSE
        UPDATE eaw.application_registry SET deleted_at = COALESCE(deleted_at, now()), lifecycle_status = NEW.lifecycle, row_version = row_version + 1
         WHERE id = NEW.id AND deleted_at IS NULL;
    END IF;
    RETURN NULL;
END $$;
CREATE TRIGGER trg_application_z_registry AFTER INSERT OR UPDATE ON eaw.application FOR EACH ROW EXECUTE FUNCTION eaw.tg_application_registry();
