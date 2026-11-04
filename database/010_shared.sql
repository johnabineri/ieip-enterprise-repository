-- =====================================================================
-- 010_shared.sql : fungsi & tabel layanan bersama (schema shared)
-- Definisi ini WAJIB identik di semua database KEIP (docs/06 §8, S-1).
-- =====================================================================

-- Kode bisnis: huruf besar, angka, titik, minus, underscore (I-5: format kode).
CREATE DOMAIN shared.business_code AS VARCHAR(50)
    CHECK (VALUE ~ '^[A-Z0-9][A-Z0-9_.-]*$');

-- ---------------------------------------------------------------------
-- audit_logs : append-only (S-2, S-5)
-- ---------------------------------------------------------------------
CREATE TABLE shared.audit_logs (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_schema   VARCHAR(63)  NOT NULL,
    table_name     VARCHAR(63)  NOT NULL,
    record_id      UUID,
    action         VARCHAR(10)  NOT NULL CHECK (action IN ('insert','update','delete')),
    changed_by     UUID,
    changed_at     TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp(),
    old_values     JSONB CHECK (old_values IS NULL OR jsonb_typeof(old_values) = 'object'),
    new_values     JSONB CHECK (new_values IS NULL OR jsonb_typeof(new_values) = 'object'),
    correlation_id UUID
);
CREATE INDEX ix_audit_logs_record  ON shared.audit_logs (table_schema, table_name, record_id);
CREATE INDEX ix_audit_logs_changed ON shared.audit_logs (changed_at);
COMMENT ON TABLE shared.audit_logs IS 'Jejak audit append-only. UPDATE/DELETE/TRUNCATE ditolak trigger dan dicabut dari semua role.';

CREATE FUNCTION shared.tg_audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'shared.audit_logs bersifat append-only (% ditolak)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER trg_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON shared.audit_logs
    FOR EACH ROW EXECUTE FUNCTION shared.tg_audit_logs_immutable();
CREATE TRIGGER trg_audit_logs_no_truncate
    BEFORE TRUNCATE ON shared.audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION shared.tg_audit_logs_immutable();

-- Konteks sesi aplikasi: SET app.user_id / app.company_id / app.user_role / app.correlation_id
CREATE FUNCTION shared.current_user_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION shared.current_user_role() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.user_role', true), '') $$;

-- ---------------------------------------------------------------------
-- trigger standar: updated_at + row_version (optimistic locking)
-- Aplikasi memakai: UPDATE ... WHERE id = ? AND row_version = ? (0 baris = konflik)
-- ---------------------------------------------------------------------
CREATE FUNCTION shared.touch_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at  := now();
    NEW.row_version := OLD.row_version + 1;
    IF NEW.updated_by IS NOT DISTINCT FROM OLD.updated_by THEN
        NEW.updated_by := COALESCE(shared.current_user_id(), NEW.updated_by);
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION shared.stamp_created() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.created_by := COALESCE(NEW.created_by, shared.current_user_id());
    NEW.updated_by := COALESCE(NEW.updated_by, NEW.created_by);
    RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
-- trigger audit generik: pada UPDATE hanya kolom yang berubah dicatat
-- ---------------------------------------------------------------------
-- Menyamarkan kolom PII pada payload audit (UU PDP: jejak audit tidak boleh jadi salinan data pribadi).
CREATE FUNCTION shared.redact_jsonb(j JSONB, p_keys TEXT[]) RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k TEXT;
BEGIN
    IF j IS NULL OR p_keys IS NULL THEN RETURN j; END IF;
    FOREACH k IN ARRAY p_keys LOOP
        IF j ? k AND j -> k <> 'null'::jsonb THEN j := jsonb_set(j, ARRAY[k], '"[REDACTED]"'::jsonb); END IF;
    END LOOP;
    RETURN j;
END $$;

-- SECURITY DEFINER: aplikasi runtime tidak punya hak apa pun pada shared.audit_logs
-- (tidak bisa membaca/memalsukan jejak audit); trigger menulis atas nama pemilik fungsi.
CREATE FUNCTION shared.audit_row() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, shared AS $$
DECLARE
    v_old JSONB; v_new JSONB;
    v_noise TEXT[] := ARRAY['updated_at','row_version','updated_by'];
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_new := to_jsonb(NEW);
        INSERT INTO shared.audit_logs(table_schema, table_name, record_id, action, changed_by, new_values, correlation_id)
        VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, (v_new->>'id')::uuid, 'insert', shared.current_user_id(), shared.redact_jsonb(v_new, TG_ARGV),
                NULLIF(current_setting('app.correlation_id', true), '')::uuid);
    ELSIF TG_OP = 'UPDATE' THEN
        SELECT jsonb_object_agg(o.key, o.value), jsonb_object_agg(n.key, n.value)
          INTO v_old, v_new
          FROM jsonb_each(to_jsonb(OLD)) o
          JOIN jsonb_each(to_jsonb(NEW)) n USING (key)
         WHERE o.value IS DISTINCT FROM n.value AND NOT (o.key = ANY (v_noise));
        IF v_new IS NULL THEN RETURN NEW; END IF;          -- tidak ada perubahan bermakna
        INSERT INTO shared.audit_logs(table_schema, table_name, record_id, action, changed_by, old_values, new_values, correlation_id)
        VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, (to_jsonb(NEW)->>'id')::uuid, 'update', shared.current_user_id(), shared.redact_jsonb(v_old, TG_ARGV), shared.redact_jsonb(v_new, TG_ARGV),
                NULLIF(current_setting('app.correlation_id', true), '')::uuid);
    ELSE
        v_old := to_jsonb(OLD);
        INSERT INTO shared.audit_logs(table_schema, table_name, record_id, action, changed_by, old_values, correlation_id)
        VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, (v_old->>'id')::uuid, 'delete', shared.current_user_id(), shared.redact_jsonb(v_old, TG_ARGV),
                NULLIF(current_setting('app.correlation_id', true), '')::uuid);
        RETURN OLD;
    END IF;
    RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
-- hierarki (parent_id): cegah siklus, hitung level otomatis
-- ---------------------------------------------------------------------
CREATE FUNCTION shared.tg_hierarchy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_cycle BOOLEAN; v_level INT;
BEGIN
    IF NEW.parent_id IS NULL THEN
        NEW.level := 1;
        RETURN NEW;
    END IF;
    IF NEW.parent_id = NEW.id THEN
        RAISE EXCEPTION '%.%: parent_id tidak boleh menunjuk dirinya sendiri', TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
    EXECUTE format(
        'WITH RECURSIVE up AS (
             SELECT id, parent_id FROM %1$I.%2$I WHERE id = $1
             UNION ALL
             SELECT t.id, t.parent_id FROM %1$I.%2$I t JOIN up ON t.id = up.parent_id)
         SELECT EXISTS (SELECT 1 FROM up WHERE id = $2)', TG_TABLE_SCHEMA, TG_TABLE_NAME)
      INTO v_cycle USING NEW.parent_id, NEW.id;
    IF v_cycle THEN
        RAISE EXCEPTION '%.%: perubahan parent_id membentuk siklus hierarki', TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
    EXECUTE format('SELECT level FROM %I.%I WHERE id = $1', TG_TABLE_SCHEMA, TG_TABLE_NAME) INTO v_level USING NEW.parent_id;
    NEW.level := v_level + 1;
    RETURN NEW;
END $$;

-- Setelah induk dipindah, level seluruh keturunan dihitung ulang.
CREATE FUNCTION shared.tg_hierarchy_cascade() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format(
        'WITH RECURSIVE d AS (
             SELECT id, $2 + 1 AS lvl FROM %1$I.%2$I WHERE parent_id = $1
             UNION ALL
             SELECT c.id, d.lvl + 1 FROM %1$I.%2$I c JOIN d ON c.parent_id = d.id)
         UPDATE %1$I.%2$I t SET level = d.lvl FROM d WHERE t.id = d.id AND t.level <> d.lvl',
        TG_TABLE_SCHEMA, TG_TABLE_NAME) USING NEW.id, NEW.level;
    RETURN NULL;
END $$;

-- Pasang pada tabel hierarkis: CALL shared.attach_hierarchy('eaw.business_capabilities');
CREATE PROCEDURE shared.attach_hierarchy(p_table regclass)
LANGUAGE plpgsql AS $$
DECLARE v_name TEXT := (SELECT relname FROM pg_class WHERE oid = p_table);
BEGIN
    EXECUTE format('CREATE TRIGGER trg_%s_hierarchy BEFORE INSERT OR UPDATE OF parent_id ON %s
                    FOR EACH ROW EXECUTE FUNCTION shared.tg_hierarchy()', v_name, p_table);
    EXECUTE format('CREATE TRIGGER trg_%s_hierarchy_cascade AFTER UPDATE OF parent_id ON %s
                    FOR EACH ROW WHEN (OLD.parent_id IS DISTINCT FROM NEW.parent_id)
                    EXECUTE FUNCTION shared.tg_hierarchy_cascade()', v_name, p_table);
END $$;

-- ---------------------------------------------------------------------
-- apply_standard : kolom standar WAJIB + trigger stamp/touch/audit
--   p_class : klasifikasi default baris (public|internal|confidential|restricted)
--   p_user_table : tabel pengguna untuk FK audit (default ref.users)
--   p_audit_redact : kolom PII yang disamarkan pada audit_logs
--   Bila tabel sudah punya kolom data_classification, kolom itu dipakai apa adanya.
-- Dipakai agar definisi kolom standar tidak diulang di tiap tabel (DB_CONVENTIONS §2).
-- Catatan: FK created_by/updated_by ke ref.users sengaja TIDAK diindex (jarang
-- dipakai sebagai filter; pengecualian P-1 untuk kolom audit).
-- ---------------------------------------------------------------------
CREATE PROCEDURE shared.apply_standard(p_table regclass, p_class TEXT DEFAULT 'internal', p_user_table regclass DEFAULT NULL,
                                       p_audit_redact TEXT[] DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
    v_name TEXT := (SELECT relname FROM pg_class WHERE oid = p_table);
    -- tabel pengguna untuk FK created_by/updated_by: replika ref.users di database konsumen;
    -- di kalla_cmp sendiri iam.users (docs/06 R-4)
    v_users TEXT := COALESCE(p_user_table::text, 'ref.users');
    v_args  TEXT := COALESCE((SELECT string_agg(quote_literal(x), ',') FROM unnest(p_audit_redact) AS x), '');
BEGIN
    IF p_class NOT IN ('public','internal','confidential','restricted') THEN
        RAISE EXCEPTION 'klasifikasi tidak valid: %', p_class;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = p_table AND attname = 'data_classification' AND NOT attisdropped) THEN
        EXECUTE format('ALTER TABLE %s ADD COLUMN data_classification VARCHAR(20) NOT NULL DEFAULT %L', p_table, p_class);
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT ck_%s_classification CHECK (data_classification IN (''public'',''internal'',''confidential'',''restricted''))', p_table, v_name);
    END IF;
    EXECUTE format('ALTER TABLE %s
        ADD COLUMN created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        ADD COLUMN created_by  UUID,
        ADD COLUMN updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        ADD COLUMN updated_by  UUID,
        ADD COLUMN deleted_at  TIMESTAMPTZ,
        ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1', p_table);
    EXECUTE format('ALTER TABLE %s
        ADD CONSTRAINT fk_%s_created_by FOREIGN KEY (created_by) REFERENCES %s(id),
        ADD CONSTRAINT fk_%s_updated_by FOREIGN KEY (updated_by) REFERENCES %s(id)', p_table, v_name, v_users, v_name, v_users);
    EXECUTE format('CREATE TRIGGER trg_%s_stamp BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION shared.stamp_created()', v_name, p_table);
    EXECUTE format('CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION shared.touch_row()', v_name, p_table);
    EXECUTE format('CREATE TRIGGER trg_%s_audit AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION shared.audit_row(%s)', v_name, p_table, v_args);
END $$;

-- ---------------------------------------------------------------------
-- documents : metadata berkas (biner di object storage, bukan di DB — docs/06 §4.3)
-- ---------------------------------------------------------------------
CREATE TABLE shared.documents (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title          VARCHAR(255) NOT NULL,
    document_type  VARCHAR(40)  NOT NULL DEFAULT 'general',
    storage_uri    TEXT         NOT NULL,
    mime_type      VARCHAR(100),
    size_bytes     BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
    sha256         CHAR(64) CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
    version_label  VARCHAR(30),
    description    TEXT
);
-- apply_standard untuk shared.documents dipanggil di 100_iam_core.sql (butuh iam.users sebagai
-- tabel FK audit; sesi 020_ref.sql masih terlalu dini karena iam.users belum ada).

-- ---------------------------------------------------------------------
-- outbox : pola transactional outbox (docs/06 §8) — peristiwa ditulis atomik bersama
-- perubahan datanya, lalu diambil worker (FOR UPDATE SKIP LOCKED). Bukan tabel standar
-- (bukan master): append + status pemrosesan, tanpa soft delete.
-- ---------------------------------------------------------------------
CREATE TABLE shared.outbox (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    aggregate_type VARCHAR(60)  NOT NULL,
    aggregate_id   UUID         NOT NULL,
    event_type     VARCHAR(100) NOT NULL,
    payload        JSONB        NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    correlation_id UUID,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    available_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    locked_by      VARCHAR(100),
    locked_until   TIMESTAMPTZ,
    attempts       SMALLINT     NOT NULL DEFAULT 0,
    processed_at   TIMESTAMPTZ,
    last_error     TEXT
);
CREATE INDEX ix_outbox_pending ON shared.outbox (available_at) WHERE processed_at IS NULL;
CREATE INDEX ix_outbox_aggregate ON shared.outbox (aggregate_type, aggregate_id);

-- Ambil batch peristiwa; kunci sementara agar tidak diproses worker lain.
CREATE FUNCTION shared.outbox_claim(p_worker TEXT, p_batch INT DEFAULT 20, p_lock_seconds INT DEFAULT 60)
RETURNS SETOF shared.outbox LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, shared AS $$
    UPDATE shared.outbox o
       SET locked_by = p_worker, locked_until = now() + make_interval(secs => p_lock_seconds), attempts = o.attempts + 1
     WHERE o.id IN (SELECT id FROM shared.outbox
                     WHERE processed_at IS NULL AND available_at <= now() AND (locked_until IS NULL OR locked_until < now())
                     ORDER BY id LIMIT p_batch FOR UPDATE SKIP LOCKED)
    RETURNING o.*
$$;
CREATE FUNCTION shared.outbox_done(p_id BIGINT, p_error TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, shared AS $$
    UPDATE shared.outbox
       SET processed_at = CASE WHEN p_error IS NULL THEN now() END,
           last_error = p_error,
           locked_until = NULL,
           available_at = CASE WHEN p_error IS NULL THEN available_at ELSE now() + make_interval(secs => 30 * attempts) END
     WHERE id = p_id
$$;

-- Pemicu transactional outbox (dipasang di 205_outbox.sql): peristiwa ditulis ATOMIK dalam
-- transaksi yang sama dengan perubahan datanya, ATAS NAMA PEMILIK FUNGSI — peran aplikasi tidak
-- perlu (dan tidak memiliki) hak INSERT pada shared.outbox.
-- Payload WAJIB whitelist kolom non-PII (p_columns): jangan pernah memakai to_jsonb(NEW) utuh.
-- Pengambilan peristiwa (outbox_claim/outbox_done) hanya untuk peran worker `cmp_outbox` (195).
-- Tabel master memakai soft delete (R-7); bila terjadi DELETE fisik, payload berisi keadaan terakhir.
-- Argumen pemicu (PostgreSQL: fungsi trigger tidak boleh berparameter; argumen dibaca via TG_ARGV,
-- dan di CREATE TRIGGER harus berupa literal):
--   TG_ARGV[0] = aggregate_type, TG_ARGV[1] = event_type, TG_ARGV[2] = literal array kolom '{id,code,...}'
CREATE FUNCTION shared.tg_outbox()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, shared AS $$
DECLARE
    p_aggregate TEXT   := TG_ARGV[0];
    p_event     TEXT   := TG_ARGV[1];
    p_columns   TEXT[] := CASE WHEN TG_NARGS >= 3 THEN TG_ARGV[2]::text[] END;
    v_row     JSONB;
    v_payload JSONB := '{}'::jsonb;
    v_old_row     JSONB;
    v_old_payload JSONB;
    v_changes     JSONB;
    v_id      UUID;
    v_col     TEXT;
BEGIN
    IF p_aggregate IS NULL OR p_event IS NULL THEN
        RAISE EXCEPTION 'shared.tg_outbox: argumen pemicu wajib (aggregate_type, event_type, kolom)';
    END IF;
    IF TG_OP = 'DELETE' THEN v_row := to_jsonb(OLD); ELSE v_row := to_jsonb(NEW); END IF;
    v_id := NULLIF(v_row ->> 'id', '')::uuid;
    IF v_id IS NULL THEN
        RETURN NULL;                                    -- tabel tanpa kolom id: tidak dipublikasikan
    END IF;
    -- UPDATE yang tidak menaikkan row_version = tidak ada perubahan data
    IF TG_OP = 'UPDATE' AND OLD.row_version IS NOT DISTINCT FROM NEW.row_version THEN
        RETURN NULL;
    END IF;
    FOREACH v_col IN ARRAY COALESCE(p_columns, ARRAY['id']) LOOP
        IF v_row ? v_col THEN
            v_payload := v_payload || jsonb_build_object(v_col, v_row -> v_col);
        END IF;
    END LOOP;
    -- UPDATE yang tidak mengubah satu pun kolom payload (selain row_version) tidak relevan bagi
    -- konsumen — mis. rotasi kunci PII (tax_id_encrypted), updated_by/at — jadi tidak diterbitkan.
    -- UPDATE yang menerbitkan peristiwa membawa "changes": {kolom: {"from": lama, "to": baru}} —
    -- HANYA kolom whitelist yang berubah (tanpa row_version). Contoh: mutasi antar departemen/divisi
    -- dalam satu perusahaan = satu peristiwa dengan changes.org_unit_id/position_id from→to.
    IF TG_OP = 'UPDATE' THEN
        v_old_payload := '{}'::jsonb;
        v_changes     := '{}'::jsonb;
        v_old_row := to_jsonb(OLD);
        FOREACH v_col IN ARRAY COALESCE(p_columns, ARRAY['id']) LOOP
            IF v_old_row ? v_col THEN
                v_old_payload := v_old_payload || jsonb_build_object(v_col, v_old_row -> v_col);
                IF v_col <> 'row_version' AND (v_old_row -> v_col) IS DISTINCT FROM (v_row -> v_col) THEN
                    v_changes := v_changes || jsonb_build_object(v_col,
                                     jsonb_build_object('from', v_old_row -> v_col, 'to', v_row -> v_col));
                END IF;
            END IF;
        END LOOP;
        IF v_changes = '{}'::jsonb THEN
            RETURN NULL;
        END IF;
        v_payload := v_payload || jsonb_build_object('changes', v_changes);
    END IF;
    INSERT INTO shared.outbox (aggregate_type, aggregate_id, event_type, payload, correlation_id)
    VALUES (p_aggregate, v_id, p_event, v_payload,
            NULLIF(current_setting('app.correlation_id', true), '')::uuid);
    RETURN NULL;
END $$;
