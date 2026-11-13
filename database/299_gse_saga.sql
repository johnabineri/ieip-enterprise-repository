-- =====================================================================
-- 299_gse_saga.sql : GSE-03 — eksekutor saga ringan (pengganti sementara runtime Temporal yang belum dibangun)
--
-- Flow saga yang sudah di-COMMIT (gse.flow, valid) dapat dijalankan. Eksekutor berada di API (eap/api/src/gse/saga.ts); DB menyimpan
-- jejaknya dan menegakkan aturan yang tidak boleh dilanggar walau API dilewati:
--   gse.saga_run  : satu eksekusi. Spesifikasi flow DISALIN (snapshot) saat mulai — perubahan flow setelahnya tidak memengaruhi run berjalan.
--                   Mesin status: running → completed | compensating; compensating → compensated | failed. Terminal tidak dapat diubah.
--                   completed  hanya bila SETIAP langkah punya aksi 'ok';
--                   compensated hanya bila setiap langkah pemutasi yang aksinya 'ok' juga punya kompensasi 'ok' (urutan terbalik);
--                   failed     = kompensasi gagal setelah retry → butuh tindakan manusia (error wajib diisi).
--                   run_key    = Idempotency-Key klien: unik per flow (pengulangan permintaan tidak menjalankan saga dua kali).
--                   lease_until: eksekutor memperpanjangnya tiap langkah; run yang lease-nya kedaluwarsa (API mati di tengah jalan)
--                   dipulihkan lewat POST /saga-runs/:id/recover = kompensasi langkah yang sudah sukses (aman karena idempoten).
--   gse.saga_step : log langkah append-only (aksi & kompensasi, setiap percobaan). Aksi hanya saat running dan berurutan
--                   (langkah ke-n 'ok' hanya bila langkah 0..n-1 'ok'); kompensasi hanya saat compensating, hanya untuk langkah
--                   pemutasi yang aksinya 'ok'; tiap (run, langkah, fase) paling banyak satu 'ok'.
-- Peristiwa: perubahan status run diterbitkan ke shared.outbox (eap.gse.saga_run_changed) — payload tanpa input/hasil (D-14).
-- Idempoten (IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS) agar dapat diterapkan ke basis data yang sudah berjalan.
-- =====================================================================

CREATE TABLE IF NOT EXISTS gse.saga_run (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id      UUID         NOT NULL REFERENCES gse.flow(id),
    flow_nama    VARCHAR(200) NOT NULL DEFAULT '',
    flow_version INTEGER      NOT NULL DEFAULT 0,
    spec         JSONB        NOT NULL DEFAULT '{}',
    mode         VARCHAR(10)  NOT NULL CHECK (mode IN ('simulate','live')),
    input        JSONB        NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(input) = 'object'),
    run_key      VARCHAR(200),
    status       VARCHAR(12)  NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','compensating','compensated','failed')),
    failed_step  VARCHAR(200),
    error        TEXT,
    lease_until  TIMESTAMPTZ  NOT NULL DEFAULT now() + interval '2 minutes',
    started_by   UUID,
    started_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    row_version  INTEGER      NOT NULL DEFAULT 1,
    data_classification VARCHAR(20) NOT NULL DEFAULT 'internal',
    CONSTRAINT ck_saga_run_terminal CHECK ((status IN ('completed','compensated','failed')) = (finished_at IS NOT NULL)),
    CONSTRAINT ck_saga_run_failed CHECK (status <> 'failed' OR COALESCE(btrim(error), '') <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_saga_run_key ON gse.saga_run (flow_id, run_key) WHERE run_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_saga_run_flow ON gse.saga_run (flow_id, started_at DESC);
COMMENT ON TABLE gse.saga_run IS 'GSE-03: eksekusi saga (eksekutor ringan di API). Spec = snapshot flow committed saat mulai (299).';

CREATE TABLE IF NOT EXISTS gse.saga_step (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id          UUID         NOT NULL REFERENCES gse.saga_run(id),
    seq             INTEGER      NOT NULL CHECK (seq >= 0),
    step            VARCHAR(200) NOT NULL,
    phase           VARCHAR(12)  NOT NULL CHECK (phase IN ('action','compensation')),
    action          VARCHAR(200) NOT NULL,
    service         VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(500),
    attempt         INTEGER      NOT NULL DEFAULT 1 CHECK (attempt >= 1),
    status          VARCHAR(8)   NOT NULL CHECK (status IN ('ok','failed')),
    http_status     INTEGER,
    detail          JSONB        NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(detail) = 'object'),
    duration_ms     INTEGER      NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_saga_step_ok ON gse.saga_step (run_id, seq, phase) WHERE status = 'ok';
CREATE INDEX IF NOT EXISTS ix_saga_step_run ON gse.saga_step (run_id, id);
COMMENT ON TABLE gse.saga_step IS 'GSE-03: log langkah saga append-only (aksi/kompensasi per percobaan) (299).';

-- ---------- run: snapshot saat mulai + mesin status ----------
CREATE OR REPLACE FUNCTION gse.tg_saga_run() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, gse AS $$
DECLARE f record; v_n int; v_ok int; v_need int; v_done int;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'gse.saga_run tidak dapat dihapus (jejak eksekusi)' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF TG_OP = 'INSERT' THEN
        SELECT nama, kind, spec, status, valid, row_version, deleted_at INTO f FROM gse.flow WHERE id = NEW.flow_id;
        IF f.nama IS NULL OR f.deleted_at IS NOT NULL THEN
            RAISE EXCEPTION 'flow tidak ditemukan atau sudah dihapus' USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF f.kind <> 'saga' THEN RAISE EXCEPTION 'hanya flow saga yang dapat dijalankan (kind: %)', f.kind USING ERRCODE = 'check_violation'; END IF;
        IF f.status <> 'committed' OR NOT f.valid THEN
            RAISE EXCEPTION 'flow % belum di-commit / tidak valid — tidak dapat dijalankan', f.nama USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.status <> 'running' THEN RAISE EXCEPTION 'run baru wajib berstatus running' USING ERRCODE = 'check_violation'; END IF;
        NEW.flow_nama := f.nama; NEW.flow_version := f.row_version; NEW.spec := f.spec;
        NEW.started_by := NULLIF(current_setting('app.user_id', true), '')::uuid;
        NEW.started_at := now(); NEW.updated_at := now(); NEW.row_version := 1; NEW.finished_at := NULL;
        NEW.failed_step := NULL; NEW.error := NULL;
        RETURN NEW;
    END IF;
    -- UPDATE
    IF OLD.status IN ('completed','compensated','failed') THEN
        RAISE EXCEPTION 'run saga % sudah selesai (%) dan tidak dapat diubah', OLD.id, OLD.status USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.flow_id IS DISTINCT FROM OLD.flow_id OR NEW.flow_nama IS DISTINCT FROM OLD.flow_nama OR NEW.flow_version IS DISTINCT FROM OLD.flow_version
       OR NEW.spec IS DISTINCT FROM OLD.spec OR NEW.mode IS DISTINCT FROM OLD.mode OR NEW.input IS DISTINCT FROM OLD.input
       OR NEW.run_key IS DISTINCT FROM OLD.run_key OR NEW.started_by IS DISTINCT FROM OLD.started_by OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
        RAISE EXCEPTION 'snapshot run saga (flow/spec/mode/input/run_key/pemulai) tidak dapat diubah' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status <> OLD.status AND NOT (
         (OLD.status = 'running' AND NEW.status IN ('completed','compensating'))
      OR (OLD.status = 'compensating' AND NEW.status IN ('compensated','failed'))) THEN
        RAISE EXCEPTION 'transisi run saga % → % tidak sah', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
    v_n := jsonb_array_length(OLD.spec->'steps');
    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
        SELECT count(*) INTO v_ok FROM gse.saga_step WHERE run_id = OLD.id AND phase = 'action' AND status = 'ok';
        IF v_ok <> v_n THEN RAISE EXCEPTION 'run saga belum selesai: % dari % langkah sukses', v_ok, v_n USING ERRCODE = 'check_violation'; END IF;
    END IF;
    IF NEW.status = 'compensated' AND OLD.status <> 'compensated' THEN
        -- setiap langkah pemutasi yang aksinya sukses wajib terkompensasi
        SELECT count(*) INTO v_need FROM gse.saga_step s
         WHERE s.run_id = OLD.id AND s.phase = 'action' AND s.status = 'ok'
           AND COALESCE((OLD.spec->'steps'->s.seq->>'mutates')::boolean, true);
        SELECT count(*) INTO v_done FROM gse.saga_step WHERE run_id = OLD.id AND phase = 'compensation' AND status = 'ok';
        IF v_done < v_need THEN RAISE EXCEPTION 'kompensasi belum lengkap: % dari % langkah', v_done, v_need USING ERRCODE = 'check_violation'; END IF;
    END IF;
    IF NEW.status IN ('completed','compensated','failed') THEN NEW.finished_at := COALESCE(NEW.finished_at, now()); END IF;
    NEW.updated_at := now();
    NEW.row_version := OLD.row_version + 1;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION gse.tg_saga_run() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_saga_run_guard ON gse.saga_run;
CREATE TRIGGER trg_saga_run_guard BEFORE INSERT OR UPDATE OR DELETE ON gse.saga_run FOR EACH ROW EXECUTE FUNCTION gse.tg_saga_run();

-- ---------- langkah: append-only, berurutan, kompensasi hanya untuk aksi sukses ----------
CREATE OR REPLACE FUNCTION gse.tg_saga_step() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, gse AS $$
DECLARE r record; s jsonb; v_prev int;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'gse.saga_step bersifat append-only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT status, spec INTO r FROM gse.saga_run WHERE id = NEW.run_id FOR UPDATE;
    IF r.status IS NULL THEN RAISE EXCEPTION 'run saga tidak ditemukan' USING ERRCODE = 'foreign_key_violation'; END IF;
    s := r.spec->'steps'->NEW.seq;
    IF s IS NULL OR (s->>'name') IS DISTINCT FROM NEW.step THEN
        RAISE EXCEPTION 'langkah #% (%) tidak ada di spesifikasi run', NEW.seq, NEW.step USING ERRCODE = 'check_violation';
    END IF;
    NEW.service := s->>'service';
    IF NEW.phase = 'action' THEN
        IF r.status <> 'running' THEN RAISE EXCEPTION 'aksi saga hanya saat run berjalan (status: %)', r.status USING ERRCODE = 'check_violation'; END IF;
        NEW.action := s->>'name';
        IF NEW.status = 'ok' THEN
            SELECT count(DISTINCT seq) INTO v_prev FROM gse.saga_step WHERE run_id = NEW.run_id AND phase = 'action' AND status = 'ok' AND seq < NEW.seq;
            IF v_prev <> NEW.seq THEN RAISE EXCEPTION 'langkah % dijalankan sebelum langkah sebelumnya sukses', NEW.step USING ERRCODE = 'check_violation'; END IF;
        END IF;
    ELSE
        IF r.status <> 'compensating' THEN RAISE EXCEPTION 'kompensasi hanya saat run berstatus compensating (status: %)', r.status USING ERRCODE = 'check_violation'; END IF;
        IF NOT COALESCE((s->>'mutates')::boolean, true) THEN RAISE EXCEPTION 'langkah % tidak memutasi data — tidak ada kompensasi', NEW.step USING ERRCODE = 'check_violation'; END IF;
        IF NOT EXISTS (SELECT 1 FROM gse.saga_step WHERE run_id = NEW.run_id AND seq = NEW.seq AND phase = 'action' AND status = 'ok') THEN
            RAISE EXCEPTION 'langkah % belum sukses — tidak ada yang dikompensasi', NEW.step USING ERRCODE = 'check_violation';
        END IF;
        NEW.action := s->>'compensation';
    END IF;
    NEW.created_at := now();
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION gse.tg_saga_step() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_saga_step_guard ON gse.saga_step;
CREATE TRIGGER trg_saga_step_guard BEFORE INSERT OR UPDATE OR DELETE ON gse.saga_step FOR EACH ROW EXECUTE FUNCTION gse.tg_saga_step();

-- ---------- peristiwa (hanya perubahan status; tanpa input/hasil/error) ----------
DROP TRIGGER IF EXISTS trg_saga_run_outbox ON gse.saga_run;
CREATE TRIGGER trg_saga_run_outbox
    AFTER INSERT OR UPDATE ON gse.saga_run
    FOR EACH ROW EXECUTE FUNCTION shared.tg_outbox('saga_run', 'eap.gse.saga_run_changed', '{id,flow_id,flow_nama,flow_version,mode,status,failed_step,data_classification,row_version}');

-- ---------- hak & RLS: baca read|run, tulis run ----------
GRANT SELECT, INSERT, UPDATE ON gse.saga_run TO eap_app;
GRANT SELECT, INSERT ON gse.saga_step TO eap_app;
GRANT SELECT ON gse.saga_run, gse.saga_step TO eap_ro;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA gse TO eap_app;
DROP POLICY IF EXISTS rls_saga_run_owner ON gse.saga_run;
DROP POLICY IF EXISTS rls_saga_step_owner ON gse.saga_step;
CALL eaw.enable_rls('gse.saga_run'::regclass);
CALL eaw.enable_rls('gse.saga_step'::regclass);
DROP POLICY IF EXISTS rls_saga_run_sel ON gse.saga_run;
DROP POLICY IF EXISTS rls_saga_run_ins ON gse.saga_run;
DROP POLICY IF EXISTS rls_saga_run_upd ON gse.saga_run;
DROP POLICY IF EXISTS rls_saga_step_sel ON gse.saga_step;
DROP POLICY IF EXISTS rls_saga_step_ins ON gse.saga_step;
CREATE POLICY rls_saga_run_sel  ON gse.saga_run  FOR SELECT TO eap_app, eap_ro USING (set.has_perm('gse.project.read') OR set.has_perm('gse.project.run'));
CREATE POLICY rls_saga_run_ins  ON gse.saga_run  FOR INSERT TO eap_app WITH CHECK (set.has_perm('gse.project.run'));
CREATE POLICY rls_saga_run_upd  ON gse.saga_run  FOR UPDATE TO eap_app USING (set.has_perm('gse.project.run')) WITH CHECK (set.has_perm('gse.project.run'));
CREATE POLICY rls_saga_step_sel ON gse.saga_step FOR SELECT TO eap_app, eap_ro USING (set.has_perm('gse.project.read') OR set.has_perm('gse.project.run'));
CREATE POLICY rls_saga_step_ins ON gse.saga_step FOR INSERT TO eap_app WITH CHECK (set.has_perm('gse.project.run'));
