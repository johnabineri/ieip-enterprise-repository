-- =====================================================================
-- 303_notifications.sql : lonceng notifikasi per pengguna (header EAP)
--
-- set.notification : satu baris = satu pemberitahuan untuk SATU pengguna. TANPA PII (D-14): judul/isi hanya memuat label objek arsitektur
--   (nama proses/aplikasi/…); pengguna dirujuk lewat id buram. Bukan tabel berstandar (shared.apply_standard) dengan sengaja: jejak audit per
--   pemberitahuan/tanda-baca hanya menambah kebisingan — kejadian aslinya sudah tercatat di eaw.workflow (append-only) dan audit objek.
--   Diisi HANYA oleh fungsi definer/pemicu di bawah (eap_app tidak punya INSERT); pengguna hanya membaca miliknya dan mengubah read_at.
--
-- Produsen (semua di DB, sehingga berlaku walau API dilewati):
--   eaw.workflow  AFTER INSERT  : transisi status objek domain/KRA/kerangka + tiket ARB
--       Divalidasi  → pemegang eaw.baseline.approve   (menunggu penetapan ARB)         [approval]
--       Ditetapkan  → pemegang eaw.publication.approve (menunggu publikasi) + pembuat  [approval | status]
--       Dipublikasi → pembuat                                                          [status]
--       Direviu     → pembuat + pemegang eaw.validation.approve (AF-07: perlu direviu) [review]
--       Draf        → pembuat (dikembalikan, dengan catatan)                           [status]
--       ARB: SUBMITTED (kirim ulang) → gov.arb.write; IN_REVIEW → gov.arb.approve + pengaju; REVISION/APPROVED/REJECTED → pengaju [arb]
--   eaw.arb_clearance AFTER INSERT : tiket baru → pemegang gov.arb.write (kecuali pengaju)                                      [arb]
--   console.eio_connector AFTER UPDATE : status down/degraded atau breaking change baru → pemegang console.eio.write            [connector]
-- Penerima = pemegang IZIN (set.session_claims) yang aktif, berlingkup entitas objek (view_all, atau entitas ada di view_ids), dan BUKAN pelaku
-- transisi itu sendiri. Kunci dedupe (user_id, dedupe_key) berlaku untuk yang BELUM dibaca — kejadian berulang tidak menumpuk, dan setelah dibaca
-- pemberitahuan baru dapat muncul lagi.
-- =====================================================================

CREATE TABLE set.notification (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES set.users(id) ON DELETE CASCADE,
    kind        VARCHAR(20) NOT NULL CHECK (kind IN ('approval','status','review','arb','connector','info')),
    severity    VARCHAR(8)  NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','err')),
    title       VARCHAR(200) NOT NULL,
    body        VARCHAR(400),
    route       VARCHAR(200),                       -- rute SPA, mis. /eaw/proses/
    objek_type  VARCHAR(30),
    objek_id    UUID,
    dedupe_key  VARCHAR(200),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    read_at     TIMESTAMPTZ,
    CONSTRAINT ck_notification_route CHECK (route IS NULL OR route ~ '^/[A-Za-z0-9/_-]*$')
);
CREATE INDEX ix_notification_user ON set.notification (user_id, created_at DESC);
CREATE INDEX ix_notification_unread ON set.notification (user_id) WHERE read_at IS NULL;
CREATE UNIQUE INDEX ux_notification_dedupe ON set.notification (user_id, dedupe_key) WHERE read_at IS NULL AND dedupe_key IS NOT NULL;
COMMENT ON TABLE set.notification IS 'Lonceng notifikasi per pengguna (303). Diisi pemicu/definer; pengguna hanya membaca miliknya dan menandai read_at.';

-- ---------- penulis ----------
CREATE FUNCTION set.notify_user(p_user uuid, p_kind text, p_severity text, p_title text, p_body text, p_route text, p_type text, p_id uuid, p_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, set AS $$
DECLARE v_n int;
BEGIN
    IF p_user IS NULL OR NOT COALESCE((set.session_claims(p_user)->>'active')::boolean, false) THEN RETURN false; END IF;
    INSERT INTO set.notification (user_id, kind, severity, title, body, route, objek_type, objek_id, dedupe_key)
    VALUES (p_user, p_kind, p_severity, left(p_title, 200), left(p_body, 400), p_route, p_type, p_id, p_key)
    ON CONFLICT (user_id, dedupe_key) WHERE read_at IS NULL AND dedupe_key IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n > 0;
END $$;
REVOKE ALL ON FUNCTION set.notify_user(uuid, text, text, text, text, text, text, uuid, text) FROM PUBLIC;

-- kirim ke semua pemegang izin p_perm yang boleh melihat entitas p_entity (NULL = tanpa batas entitas); p_exclude (pelaku) dilewati
CREATE FUNCTION set.notify_holders(p_perm text, p_entity uuid, p_exclude uuid, p_kind text, p_severity text, p_title text, p_body text, p_route text,
                                   p_type text, p_id uuid, p_key text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, set AS $$
DECLARE v_u uuid; c jsonb; v_n int := 0;
BEGIN
    FOR v_u IN SELECT DISTINCT ur.user_id FROM set.user_roles ur WHERE ur.deleted_at IS NULL AND ur.user_id IS DISTINCT FROM p_exclude LOOP
        c := set.session_claims(v_u);
        IF COALESCE((c->>'active')::boolean, false) AND (c->'permissions') ? p_perm
           AND (p_entity IS NULL OR COALESCE((c->>'view_all')::boolean, false) OR (c->'view_ids') ? p_entity::text) THEN
            IF set.notify_user(v_u, p_kind, p_severity, p_title, p_body, p_route, p_type, p_id, p_key) THEN v_n := v_n + 1; END IF;
        END IF;
    END LOOP;
    RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION set.notify_holders(text, uuid, uuid, text, text, text, text, text, text, uuid, text) FROM PUBLIC;

-- ---------- pembantu label/pembuat/rute per jenis objek ----------
CREATE FUNCTION eaw.notif_meta(p_type text, p_id uuid, OUT label text, OUT route text, OUT jenis text, OUT creator uuid, OUT entity uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, eaw AS $$
BEGIN
    jenis := CASE p_type WHEN 'process' THEN 'Proses' WHEN 'data_entity' THEN 'Entitas data' WHEN 'service' THEN 'Layanan' WHEN 'application' THEN 'Aplikasi'
                         WHEN 'infra_asset' THEN 'Infrastruktur' WHEN 'control' THEN 'Kontrol' WHEN 'framework' THEN 'Kerangka kerja' WHEN 'reference' THEN 'KRA'
                         WHEN 'arb_clearance' THEN 'Tiket ARB' ELSE p_type END;
    route := CASE p_type WHEN 'process' THEN '/eaw/proses/' WHEN 'data_entity' THEN '/eaw/data/' WHEN 'service' THEN '/eaw/layanan/' WHEN 'application' THEN '/eaw/aplikasi/'
                         WHEN 'infra_asset' THEN '/eaw/infra/' WHEN 'control' THEN '/eaw/keamanan/' WHEN 'framework' THEN '/eaw/kerangka/' WHEN 'reference' THEN '/eaw/kra/'
                         WHEN 'arb_clearance' THEN '/eaw/arb/' ELSE '/eaw/dashboard/' END;
    IF p_type = 'process' THEN SELECT x.nama, x.created_by, x.entity_id INTO label, creator, entity FROM eaw.process x WHERE x.id = p_id;
    ELSIF p_type = 'data_entity' THEN SELECT x.nama_kanonikal, x.created_by, x.entity_id INTO label, creator, entity FROM eaw.data_entity x WHERE x.id = p_id;
    ELSIF p_type = 'service' THEN SELECT x.nama, x.created_by, x.entity_id INTO label, creator, entity FROM eaw.service x WHERE x.id = p_id;
    ELSIF p_type = 'application' THEN SELECT x.kode || ' · ' || x.nama, x.created_by, x.entity_id INTO label, creator, entity FROM eaw.application x WHERE x.id = p_id;
    ELSIF p_type = 'infra_asset' THEN SELECT x.nama, x.created_by, x.entity_id INTO label, creator, entity FROM eaw.infra_asset x WHERE x.id = p_id;
    ELSIF p_type = 'control' THEN SELECT x.aspek || COALESCE(' · ' || x.standar_rujukan, ''), x.created_by, x.entity_id INTO label, creator, entity FROM eaw.control x WHERE x.id = p_id;
    ELSIF p_type = 'framework' THEN SELECT x.layanan_utama, x.created_by, x.entity_id INTO label, creator, entity FROM eaw.framework x WHERE x.id = p_id;
    ELSIF p_type = 'reference' THEN SELECT x.kode || ' · ' || x.nama, x.created_by, NULL::uuid INTO label, creator, entity FROM eaw.reference x WHERE x.id = p_id;
    ELSIF p_type = 'arb_clearance' THEN SELECT x.ticket_number || ' · ' || x.initiative_name, x.proposed_by, x.entity_id INTO label, creator, entity FROM eaw.arb_clearance x WHERE x.id = p_id;
    END IF;
END $$;
REVOKE ALL ON FUNCTION eaw.notif_meta(text, uuid) FROM PUBLIC;

-- ---------- produsen: transisi status ----------
CREATE FUNCTION eaw.tg_workflow_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, eaw, set AS $$
DECLARE m record; v_key text := 'wf:' || NEW.id; v_note text := NULLIF(left(btrim(COALESCE(NEW.catatan, '')), 200), '');
BEGIN
    SELECT * INTO m FROM eaw.notif_meta(NEW.objek_type, NEW.objek_id);
    IF m.label IS NULL THEN RETURN NULL; END IF;

    IF NEW.objek_type = 'arb_clearance' THEN
        IF NEW.status_ke = 'SUBMITTED' THEN
            PERFORM set.notify_holders('gov.arb.write', m.entity, NEW.pelaku, 'arb', 'warn', 'Tiket ARB dikirim ulang untuk ditinjau', m.label, m.route, NEW.objek_type, NEW.objek_id, v_key);
        ELSIF NEW.status_ke = 'IN_REVIEW' THEN
            PERFORM set.notify_holders('gov.arb.approve', m.entity, NEW.pelaku, 'arb', 'warn', 'Tiket ARB menunggu putusan', m.label, m.route, NEW.objek_type, NEW.objek_id, v_key);
            IF m.creator IS DISTINCT FROM NEW.pelaku THEN PERFORM set.notify_user(m.creator, 'arb', 'info', 'Tiket ARB Anda sedang ditinjau', m.label, m.route, NEW.objek_type, NEW.objek_id, v_key); END IF;
        ELSIF NEW.status_ke = 'REVISION' AND m.creator IS DISTINCT FROM NEW.pelaku THEN
            PERFORM set.notify_user(m.creator, 'arb', 'warn', 'Tiket ARB Anda perlu direvisi', concat_ws(' — ', m.label, v_note), m.route, NEW.objek_type, NEW.objek_id, v_key);
        ELSIF NEW.status_ke = 'APPROVED' AND m.creator IS DISTINCT FROM NEW.pelaku THEN
            PERFORM set.notify_user(m.creator, 'arb', 'info', 'Tiket ARB Anda disetujui', concat_ws(' — ', m.label, v_note), m.route, NEW.objek_type, NEW.objek_id, v_key);
        ELSIF NEW.status_ke = 'REJECTED' AND m.creator IS DISTINCT FROM NEW.pelaku THEN
            PERFORM set.notify_user(m.creator, 'arb', 'err', 'Tiket ARB Anda ditolak', concat_ws(' — ', m.label, v_note), m.route, NEW.objek_type, NEW.objek_id, v_key);
        END IF;
        RETURN NULL;
    END IF;

    IF NEW.status_ke = 'Divalidasi' THEN
        PERFORM set.notify_holders('eaw.baseline.approve', m.entity, NEW.pelaku, 'approval', 'warn', m.jenis || ' menunggu penetapan ARB', m.label, m.route, NEW.objek_type, NEW.objek_id, v_key);
    ELSIF NEW.status_ke = 'Ditetapkan' THEN
        PERFORM set.notify_holders('eaw.publication.approve', m.entity, NEW.pelaku, 'approval', 'warn', m.jenis || ' menunggu publikasi', m.label, m.route, NEW.objek_type, NEW.objek_id, v_key);
        IF m.creator IS DISTINCT FROM NEW.pelaku THEN
            PERFORM set.notify_user(m.creator, 'status', 'info', m.jenis || ' Anda ditetapkan', concat_ws(' — ', m.label, v_note), m.route, NEW.objek_type, NEW.objek_id, v_key);
        END IF;
    ELSIF NEW.status_ke = 'Dipublikasi' THEN
        IF m.creator IS DISTINCT FROM NEW.pelaku THEN
            PERFORM set.notify_user(m.creator, 'status', 'info', m.jenis || ' Anda dipublikasikan', m.label, m.route, NEW.objek_type, NEW.objek_id, v_key);
        END IF;
    ELSIF NEW.status_ke = 'Direviu' THEN
        PERFORM set.notify_holders('eaw.validation.approve', m.entity, NEW.pelaku, 'review', 'warn', m.jenis || ' perlu direviu (AF-07)', concat_ws(' — ', m.label, v_note), m.route, NEW.objek_type, NEW.objek_id, v_key);
        IF m.creator IS DISTINCT FROM NEW.pelaku THEN
            PERFORM set.notify_user(m.creator, 'review', 'warn', m.jenis || ' Anda perlu direviu (AF-07)', concat_ws(' — ', m.label, v_note), m.route, NEW.objek_type, NEW.objek_id, v_key);
        END IF;
    ELSIF NEW.status_ke = 'Draf' AND NEW.status_dari <> 'Draf' THEN
        IF m.creator IS DISTINCT FROM NEW.pelaku THEN
            PERFORM set.notify_user(m.creator, 'status', 'warn', m.jenis || ' Anda dikembalikan ke Draf', concat_ws(' — ', m.label, v_note), m.route, NEW.objek_type, NEW.objek_id, v_key);
        END IF;
    END IF;
    RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION eaw.tg_workflow_notify() FROM PUBLIC;
CREATE TRIGGER trg_workflow_notify AFTER INSERT ON eaw.workflow FOR EACH ROW EXECUTE FUNCTION eaw.tg_workflow_notify();

-- ---------- produsen: tiket ARB baru ----------
CREATE FUNCTION eaw.tg_arb_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, eaw, set AS $$
BEGIN
    PERFORM set.notify_holders('gov.arb.write', NEW.entity_id, NEW.proposed_by, 'arb', 'warn', 'Tiket ARB baru menunggu peninjauan',
                               NEW.ticket_number || ' · ' || NEW.initiative_name, '/eaw/arb/', 'arb_clearance', NEW.id, 'arb-new:' || NEW.id);
    RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION eaw.tg_arb_notify() FROM PUBLIC;
CREATE TRIGGER trg_arb_notify AFTER INSERT ON eaw.arb_clearance FOR EACH ROW EXECUTE FUNCTION eaw.tg_arb_notify();

-- ---------- produsen: konektor EIO ----------
CREATE FUNCTION console.tg_connector_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, console, set AS $$
DECLARE v_n int := COALESCE(jsonb_array_length(NEW.breaking_changes), 0);
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN RETURN NULL; END IF;
    IF NEW.status IN ('down', 'degraded') AND OLD.status IS DISTINCT FROM NEW.status THEN
        PERFORM set.notify_holders('console.eio.write', NEW.entity_id, NULL, 'connector', CASE WHEN NEW.status = 'down' THEN 'err' ELSE 'warn' END,
                                   'Konektor ' || NEW.kode || ' ' || NEW.status, NEW.last_error, '/console/eio/', 'eio_connector', NEW.id, 'con:' || NEW.id || ':' || NEW.status);
    END IF;
    IF v_n > 0 AND NEW.breaking_changes IS DISTINCT FROM OLD.breaking_changes THEN
        PERFORM set.notify_holders('console.eio.write', NEW.entity_id, NULL, 'connector', 'err', 'Konektor ' || NEW.kode || ': ' || v_n || ' perubahan breaking pada kontrak',
                                   'Periksa kontrak OpenAPI terhadap baseline', '/console/eio/', 'eio_connector', NEW.id, 'con:' || NEW.id || ':brk:' || md5(NEW.breaking_changes::text));
    END IF;
    RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION console.tg_connector_notify() FROM PUBLIC;
CREATE TRIGGER trg_connector_notify AFTER UPDATE OF status, breaking_changes ON console.eio_connector FOR EACH ROW EXECUTE FUNCTION console.tg_connector_notify();

-- ---------- hak & RLS: pengguna hanya melihat miliknya dan hanya mengubah read_at ----------
ALTER TABLE set.notification ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON set.notification TO eap_app;
GRANT UPDATE (read_at) ON set.notification TO eap_app;
CREATE POLICY rls_notification_sel ON set.notification FOR SELECT TO eap_app USING (user_id = shared.current_user_id());
CREATE POLICY rls_notification_upd ON set.notification FOR UPDATE TO eap_app USING (user_id = shared.current_user_id()) WITH CHECK (user_id = shared.current_user_id());
