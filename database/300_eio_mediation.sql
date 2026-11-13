-- =====================================================================
-- 300_eio_mediation.sql : EIO-01..03 — mediasi integrasi ringan (pengganti sementara broker EIO 6-layer + Temporal)
--
-- Konsumen TIDAK memanggil sistem entitas lain secara langsung (0 akses DB lintas entitas); mereka memanggil RUTE EIO.
-- Mesin mediasi berada di API (eap/api/src/console/eio.ts + eio.controller.ts); DB menyimpan definisi + jejak dan menegakkan
-- aturan yang tidak boleh dilanggar walau API dilewati:
--   console.eio_canonical : model data kanonikal berversi (L3). Daftar field {name,type,required,maxLength?,enum?}.
--                           draft → active → retired. Model active/retired BEKU (perubahan = versi baru). Retire ditolak
--                           selama dipakai rute aktif.
--   console.eio_route     : rute mediasi. Masukan = satu model kanonikal; target = konektor (REST: method + path templat
--                           `${field}`) ATAU flow saga GSE (L5, memakai eksekutor saga 299). request_map/response_map (L3)
--                           memetakan field kanonikal ↔ field target; rules (L4) = aturan bisnis deklaratif.
--                           Aktivasi diperiksa DB: model kanonikal active, semua field yang dirujuk map/rules/path ADA di model,
--                           konektor ada dan — bila konektor punya baseline kontrak OpenAPI (EIO-04) — operasi `METHOD /path`
--                           ADA di baseline itu; flow saga committed + valid. Rute aktif BEKU (nonaktifkan dulu untuk mengubah).
--   console.eio_exchange  : log pertukaran append-only, satu baris per panggilan mediasi. TANPA payload/hasil/badan galat
--                           target (D-14: data yang lewat tidak disimpan) — hanya rute, pemanggil, identitas korporat (L2),
--                           lapisan tempat berhenti, status HTTP, durasi. route/canonical/target diisi DB dari rute; caller_id
--                           = pengguna sesi (tidak dapat dipalsukan).
-- Peristiwa (L6): pertukaran live yang sukses diterbitkan ke shared.outbox sebagai eap.console.eio_exchange_completed
-- (subjek NATS keis.eap.eio_exchange.…) — payload hanya pengenal (tanpa data, tanpa identitas pemanggil).
-- Izin baru console.eio.run (900): memanggil rute live (data plane). console.eio.write: mengelola model/rute + menjalankan simulate.
-- Rute bertarget saga: pemegang console.eio.run boleh menjalankan run saga HANYA untuk flow yang menjadi target rute aktif
-- (kebijakan RLS tambahan pada gse.flow/saga_run/saga_step lewat console.eio_routed_flow()).
-- =====================================================================

-- ---------- model kanonikal ----------
CREATE TABLE console.eio_canonical (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode         shared.business_code NOT NULL,
    versi        INTEGER      NOT NULL DEFAULT 1 CHECK (versi BETWEEN 1 AND 999),
    nama         VARCHAR(200) NOT NULL,
    deskripsi    TEXT,
    fields       JSONB        NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(fields) = 'array'),
    status       VARCHAR(10)  NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
    activated_at TIMESTAMPTZ
);
CALL shared.apply_standard('console.eio_canonical', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_eio_canonical_kode ON console.eio_canonical (kode, versi) WHERE deleted_at IS NULL;
COMMENT ON TABLE console.eio_canonical IS 'EIO L3: model data kanonikal berversi; active/retired beku (300).';

CREATE FUNCTION console.eio_fields_problems(p_fields jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE f jsonb; v_names text[] := '{}';
BEGIN
    IF jsonb_typeof(p_fields) <> 'array' OR jsonb_array_length(p_fields) = 0 THEN RETURN 'model kanonikal wajib memiliki minimal 1 field'; END IF;
    IF jsonb_array_length(p_fields) > 100 THEN RETURN 'model kanonikal maksimum 100 field'; END IF;
    FOR f IN SELECT * FROM jsonb_array_elements(p_fields) LOOP
        IF jsonb_typeof(f) <> 'object' THEN RETURN 'setiap field wajib berupa objek'; END IF;
        IF COALESCE(f->>'name', '') !~ '^[A-Za-z_][A-Za-z0-9_]{0,62}$' THEN RETURN format('nama field tidak sah: %s', COALESCE(f->>'name', '(kosong)')); END IF;
        IF (f->>'name') = ANY (v_names) THEN RETURN format('nama field ganda: %s', f->>'name'); END IF;
        v_names := v_names || (f->>'name');
        IF COALESCE(f->>'type', '') NOT IN ('string','number','integer','boolean','object','array') THEN
            RETURN format('tipe field %s tidak sah (string|number|integer|boolean|object|array)', f->>'name');
        END IF;
        IF f ? 'required' AND jsonb_typeof(f->'required') <> 'boolean' THEN RETURN format('required field %s wajib boolean', f->>'name'); END IF;
        IF f ? 'maxLength' AND (f->>'type' <> 'string' OR jsonb_typeof(f->'maxLength') <> 'number' OR (f->>'maxLength')::numeric NOT BETWEEN 1 AND 100000) THEN
            RETURN format('maxLength field %s hanya untuk string, 1..100000', f->>'name');
        END IF;
        IF f ? 'enum' AND (jsonb_typeof(f->'enum') <> 'array' OR jsonb_array_length(f->'enum') NOT BETWEEN 1 AND 100) THEN
            RETURN format('enum field %s wajib daftar 1..100 nilai', f->>'name');
        END IF;
    END LOOP;
    RETURN NULL;
END $$;

CREATE FUNCTION console.tg_eio_canonical() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, console AS $$
DECLARE v_p text;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
        IF NEW.kode IS DISTINCT FROM OLD.kode OR NEW.versi IS DISTINCT FROM OLD.versi OR NEW.fields IS DISTINCT FROM OLD.fields THEN
            RAISE EXCEPTION 'model kanonikal % v% sudah %, tidak dapat diubah — buat versi baru', OLD.kode, OLD.versi, OLD.status USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
            RAISE EXCEPTION 'hanya model kanonikal draft yang dapat dihapus' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NOT (
         (OLD.status = 'draft' AND NEW.status = 'active') OR (OLD.status = 'active' AND NEW.status = 'retired')) THEN
        RAISE EXCEPTION 'transisi model kanonikal % → % tidak sah', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'model kanonikal baru wajib draft' USING ERRCODE = 'check_violation';
    END IF;
    v_p := console.eio_fields_problems(NEW.fields);
    IF v_p IS NOT NULL THEN RAISE EXCEPTION '%', v_p USING ERRCODE = 'check_violation'; END IF;
    IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active') THEN NEW.activated_at := now(); END IF;
    IF TG_OP = 'UPDATE' AND NEW.status = 'retired' AND OLD.status = 'active'
       AND EXISTS (SELECT 1 FROM console.eio_route r WHERE r.canonical_id = OLD.id AND r.status = 'active' AND r.deleted_at IS NULL) THEN
        RAISE EXCEPTION 'model kanonikal % v% masih dipakai rute aktif', OLD.kode, OLD.versi USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION console.tg_eio_canonical() FROM PUBLIC;

-- ---------- rute mediasi ----------
CREATE TABLE console.eio_route (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode          shared.business_code NOT NULL,
    nama          VARCHAR(200) NOT NULL,
    deskripsi     TEXT,
    canonical_id  UUID         NOT NULL REFERENCES console.eio_canonical(id),
    target_kind   VARCHAR(10)  NOT NULL CHECK (target_kind IN ('connector','saga')),
    connector_id  UUID         REFERENCES console.eio_connector(id),
    method        VARCHAR(6)   CHECK (method IN ('GET','POST','PUT','PATCH','DELETE')),
    path          VARCHAR(300),
    saga_flow_id  UUID         REFERENCES gse.flow(id),
    request_map   JSONB        NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(request_map) = 'object'),
    response_map  JSONB        NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(response_map) = 'object'),
    rules         JSONB        NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(rules) = 'array'),
    status        VARCHAR(10)  NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','disabled')),
    entity_id     UUID         REFERENCES ref.business_groups(id),
    activated_at  TIMESTAMPTZ,
    CONSTRAINT ck_eio_route_target CHECK (
        (target_kind = 'connector' AND connector_id IS NOT NULL AND method IS NOT NULL AND path IS NOT NULL AND saga_flow_id IS NULL)
     OR (target_kind = 'saga' AND saga_flow_id IS NOT NULL AND connector_id IS NULL AND method IS NULL AND path IS NULL)),
    -- path relatif aman: diawali '/', tanpa '..', '//', query/fragmen, atau karakter kendali; variabel hanya ${nama}
    CONSTRAINT ck_eio_route_path CHECK (path IS NULL OR (path ~ '^/[A-Za-z0-9._~/:@!$&''()*+,;={}-]*$' AND path !~ '(^|/)\.\.(/|$)' AND path !~ '//'))
);
CALL shared.apply_standard('console.eio_route', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_eio_route_kode ON console.eio_route (kode) WHERE deleted_at IS NULL;
CREATE INDEX ix_eio_route_flow ON console.eio_route (saga_flow_id) WHERE status = 'active' AND deleted_at IS NULL;
COMMENT ON TABLE console.eio_route IS 'EIO: rute mediasi (konektor REST atau flow saga GSE); aktif = beku (300).';

-- Field kanonikal yang dirujuk: segmen pertama path bertitik (mis. "alamat.kota" → "alamat").
CREATE FUNCTION console.eio_route_problems(p_route console.eio_route, p_fields jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text; v jsonb; r jsonb; v_names text[]; v_ref text; m text[];
    v_path_re CONSTANT text := '^[A-Za-z_][A-Za-z0-9_]{0,62}(\.[A-Za-z_][A-Za-z0-9_]{0,62}){0,7}$';
BEGIN
    SELECT COALESCE(array_agg(x->>'name'), '{}') INTO v_names FROM jsonb_array_elements(COALESCE(p_fields, '[]')) x;
    -- prototype pollution: segmen __proto__/prototype/constructor ditolak di SEMUA path (map, rules, variabel path) — mediator JS juga menolaknya
    IF EXISTS (SELECT 1 FROM (
            SELECT key AS p FROM jsonb_each(p_route.request_map)
            UNION ALL SELECT value #>> '{}' FROM jsonb_each(p_route.request_map) WHERE jsonb_typeof(value) = 'string'
            UNION ALL SELECT key FROM jsonb_each(p_route.response_map)
            UNION ALL SELECT value #>> '{}' FROM jsonb_each(p_route.response_map) WHERE jsonb_typeof(value) = 'string'
            UNION ALL SELECT rl->>'field' FROM jsonb_array_elements(p_route.rules) rl WHERE jsonb_typeof(rl) = 'object'
            UNION ALL SELECT (regexp_matches(COALESCE(p_route.path, ''), '\$\{([^}]*)\}', 'g'))[1]) x
         WHERE x.p ~ '(^|\.)(__proto__|prototype|constructor)(\.|$)') THEN
        RETURN 'path __proto__/prototype/constructor tidak diizinkan';
    END IF;
    -- request_map: {"field.target": "field.kanonikal" | {"const": nilai}}
    FOR k, v IN SELECT * FROM jsonb_each(p_route.request_map) LOOP
        IF k !~ v_path_re THEN RETURN format('request_map: field target tidak sah: %s', k); END IF;
        IF jsonb_typeof(v) = 'string' THEN
            IF (v #>> '{}') !~ v_path_re THEN RETURN format('request_map: sumber tidak sah untuk %s', k); END IF;
            IF p_fields IS NOT NULL AND NOT (split_part(v #>> '{}', '.', 1) = ANY (v_names)) THEN
                RETURN format('request_map: field kanonikal %s tidak ada di model', v #>> '{}');
            END IF;
        ELSIF NOT (jsonb_typeof(v) = 'object' AND v ? 'const' AND (SELECT count(*) FROM jsonb_object_keys(v)) = 1) THEN
            RETURN format('request_map: nilai untuk %s wajib nama field kanonikal atau {"const": nilai}', k);
        END IF;
    END LOOP;
    IF (SELECT count(*) FROM jsonb_object_keys(p_route.request_map)) > 100 THEN RETURN 'request_map maksimum 100 entri'; END IF;
    -- response_map: {"field.kanonikal-keluaran": "field.respons"} — sumber = respons target (tidak divalidasi terhadap model)
    FOR k, v IN SELECT * FROM jsonb_each(p_route.response_map) LOOP
        IF k !~ v_path_re OR jsonb_typeof(v) <> 'string' OR (v #>> '{}') !~ v_path_re THEN RETURN format('response_map: entri tidak sah: %s', k); END IF;
    END LOOP;
    IF p_route.target_kind = 'saga' AND p_route.response_map <> '{}' THEN RETURN 'response_map hanya untuk target konektor'; END IF;
    -- rules: [{field, op, value?, message?}]
    IF jsonb_array_length(p_route.rules) > 50 THEN RETURN 'rules maksimum 50 aturan'; END IF;
    FOR r IN SELECT * FROM jsonb_array_elements(p_route.rules) LOOP
        IF jsonb_typeof(r) <> 'object' OR COALESCE(r->>'field', '') !~ v_path_re THEN RETURN 'rules: setiap aturan wajib {field, op}'; END IF;
        IF COALESCE(r->>'op', '') NOT IN ('required','eq','ne','in','notIn','gt','gte','lt','lte','regex','maxLength') THEN
            RETURN format('rules: operator %s tidak dikenal', COALESCE(r->>'op', '(kosong)'));
        END IF;
        IF r->>'op' <> 'required' AND NOT r ? 'value' THEN RETURN format('rules: operator %s wajib value', r->>'op'); END IF;
        IF r->>'op' IN ('in','notIn') AND jsonb_typeof(r->'value') <> 'array' THEN RETURN format('rules: %s wajib daftar', r->>'op'); END IF;
        IF r->>'op' IN ('gt','gte','lt','lte','maxLength') AND jsonb_typeof(r->'value') <> 'number' THEN RETURN format('rules: %s wajib angka', r->>'op'); END IF;
        IF r->>'op' = 'regex' AND (jsonb_typeof(r->'value') <> 'string' OR length(r->>'value') > 200) THEN RETURN 'rules: regex wajib teks ≤ 200 karakter'; END IF;
        IF r ? 'message' AND (jsonb_typeof(r->'message') <> 'string' OR length(r->>'message') > 300) THEN RETURN 'rules: message wajib teks ≤ 300 karakter'; END IF;
        IF p_fields IS NOT NULL AND NOT (split_part(r->>'field', '.', 1) = ANY (v_names)) THEN
            RETURN format('rules: field %s tidak ada di model kanonikal', r->>'field');
        END IF;
    END LOOP;
    -- variabel path ${field}
    IF p_route.path IS NOT NULL THEN
        FOR m IN SELECT regexp_matches(p_route.path, '\$\{([^}]*)\}', 'g') LOOP
            v_ref := m[1];
            IF v_ref !~ v_path_re THEN RETURN format('path: variabel tidak sah ${%s}', v_ref); END IF;
            IF p_fields IS NOT NULL AND NOT (split_part(v_ref, '.', 1) = ANY (v_names)) THEN RETURN format('path: variabel ${%s} tidak ada di model kanonikal', v_ref); END IF;
        END LOOP;
        IF regexp_replace(p_route.path, '\$\{[^}]*\}', '', 'g') ~ '[{}$]' THEN RETURN 'path: kurung kurawal/$ hanya untuk variabel ${field}'; END IF;
    END IF;
    RETURN NULL;
END $$;

-- Kunci operasi OpenAPI dari rute: "POST /orders/{order_id}" (format console.eio_connector.spec_snapshot).
CREATE FUNCTION console.eio_route_operation(p_method text, p_path text) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT p_method || ' ' || regexp_replace(p_path, '\$\{([^}]*)\}', '{\1}', 'g') $$;

CREATE FUNCTION console.tg_eio_route() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, console AS $$
DECLARE c record; con record; f record; v_p text; v_op text;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN RAISE EXCEPTION 'rute baru wajib draft' USING ERRCODE = 'check_violation'; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
        IF (to_jsonb(NEW) - '{status,activated_at,updated_at,updated_by,row_version}'::text[]) IS DISTINCT FROM (to_jsonb(OLD) - '{status,activated_at,updated_at,updated_by,row_version}'::text[]) THEN
            RAISE EXCEPTION 'rute % aktif tidak dapat diubah atau dihapus — nonaktifkan dulu', OLD.kode USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.status = 'draft' THEN RAISE EXCEPTION 'rute aktif hanya dapat dinonaktifkan (disabled)' USING ERRCODE = 'check_violation'; END IF;
    END IF;
    v_p := console.eio_route_problems(NEW, NULL);                                   -- bentuk (tanpa model)
    IF v_p IS NOT NULL THEN RAISE EXCEPTION '%', v_p USING ERRCODE = 'check_violation'; END IF;

    IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active') THEN
        SELECT kode, versi, status, fields, deleted_at INTO c FROM console.eio_canonical WHERE id = NEW.canonical_id;
        IF c.status IS DISTINCT FROM 'active' OR c.deleted_at IS NOT NULL THEN
            RAISE EXCEPTION 'aktivasi rute %: model kanonikal wajib active', NEW.kode USING ERRCODE = 'check_violation';
        END IF;
        v_p := console.eio_route_problems(NEW, c.fields);
        IF v_p IS NOT NULL THEN RAISE EXCEPTION 'aktivasi rute %: %', NEW.kode, v_p USING ERRCODE = 'check_violation'; END IF;
        IF NEW.target_kind = 'connector' THEN
            SELECT kode, spec_snapshot, deleted_at INTO con FROM console.eio_connector WHERE id = NEW.connector_id;
            IF con.kode IS NULL OR con.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'aktivasi rute %: konektor tidak ada', NEW.kode USING ERRCODE = 'check_violation'; END IF;
            v_op := console.eio_route_operation(NEW.method, NEW.path);
            IF con.spec_snapshot IS NOT NULL AND NOT con.spec_snapshot ? v_op THEN
                RAISE EXCEPTION 'aktivasi rute %: operasi "%" tidak ada di baseline kontrak konektor %', NEW.kode, v_op, con.kode USING ERRCODE = 'check_violation';
            END IF;
        ELSE
            SELECT kind, status, valid, deleted_at INTO f FROM gse.flow WHERE id = NEW.saga_flow_id;
            IF f.kind IS DISTINCT FROM 'saga' OR f.status <> 'committed' OR NOT f.valid OR f.deleted_at IS NOT NULL THEN
                RAISE EXCEPTION 'aktivasi rute %: flow target wajib saga committed & valid', NEW.kode USING ERRCODE = 'check_violation';
            END IF;
        END IF;
        NEW.activated_at := now();
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION console.tg_eio_route() FROM PUBLIC;

-- ---------- log pertukaran (append-only, tanpa payload) ----------
CREATE TABLE console.eio_exchange (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id        UUID         NOT NULL REFERENCES console.eio_route(id),
    route_kode      VARCHAR(100) NOT NULL DEFAULT '',
    canonical_kode  VARCHAR(100) NOT NULL DEFAULT '',
    canonical_versi INTEGER      NOT NULL DEFAULT 0,
    target_kind     VARCHAR(10)  NOT NULL DEFAULT '',
    mode            VARCHAR(8)   NOT NULL CHECK (mode IN ('live','simulate')),
    caller_id       UUID,
    corporate_id    UUID,                                  -- L2: ref.users.id pemanggil (pseudonim CMP), bukan nama/email
    correlation_id  VARCHAR(100),
    status          VARCHAR(8)   NOT NULL CHECK (status IN ('ok','rejected','failed')),
    layer           SMALLINT     NOT NULL CHECK (layer BETWEEN 1 AND 6),
    http_status     INTEGER,
    error           VARCHAR(500),                          -- ringkasan dari mediator (bukan badan respons target)
    duration_ms     INTEGER      NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
    saga_run_id     UUID         REFERENCES gse.saga_run(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    row_version     INTEGER      NOT NULL DEFAULT 1 CHECK (row_version = 1),   -- kontrak shared.tg_outbox; append-only → selalu 1
    data_classification VARCHAR(20) NOT NULL DEFAULT 'internal',
    CONSTRAINT ck_eio_exchange_ok CHECK ((status = 'ok') = (layer = 6)),
    CONSTRAINT ck_eio_exchange_err CHECK (status = 'ok' OR COALESCE(btrim(error), '') <> '')
);
CREATE INDEX ix_eio_exchange_route ON console.eio_exchange (route_id, created_at DESC);
CREATE INDEX ix_eio_exchange_time ON console.eio_exchange (created_at DESC);
COMMENT ON TABLE console.eio_exchange IS 'EIO: log pertukaran mediasi append-only, tanpa payload (D-14) (300).';

CREATE FUNCTION console.tg_eio_exchange() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, console AS $$
DECLARE r record;
BEGIN
    IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'console.eio_exchange bersifat append-only' USING ERRCODE = 'insufficient_privilege'; END IF;
    SELECT rt.kode, rt.status, rt.target_kind, rt.deleted_at, c.kode AS ckode, c.versi INTO r
      FROM console.eio_route rt JOIN console.eio_canonical c ON c.id = rt.canonical_id WHERE rt.id = NEW.route_id;
    IF r.kode IS NULL OR r.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'rute EIO tidak ditemukan' USING ERRCODE = 'foreign_key_violation'; END IF;
    IF NEW.mode = 'live' AND r.status <> 'active' THEN RAISE EXCEPTION 'pertukaran live hanya untuk rute aktif (status: %)', r.status USING ERRCODE = 'check_violation'; END IF;
    NEW.route_kode := r.kode; NEW.canonical_kode := r.ckode; NEW.canonical_versi := r.versi; NEW.target_kind := r.target_kind;
    NEW.caller_id := shared.current_user_id();
    NEW.created_at := now();
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION console.tg_eio_exchange() FROM PUBLIC;

-- L2: identitas korporat pemanggil (set.users → ref.users), definer agar tidak bergantung RLS replika.
CREATE FUNCTION console.eio_identity() RETURNS TABLE (corporate_id uuid, employee_id uuid, active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    SELECT ru.id, ru.employee_id, (ru.is_active AND ru.deleted_at IS NULL AND su.is_active AND su.deleted_at IS NULL)
      FROM set.users su JOIN ref.users ru ON ru.id = su.cmp_user_id
     WHERE su.id = shared.current_user_id()
$$;
REVOKE ALL ON FUNCTION console.eio_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION console.eio_identity() TO eap_app;

-- Flow saga yang menjadi target rute aktif (dipakai kebijakan RLS gse.* untuk pemegang console.eio.run).
CREATE FUNCTION console.eio_routed_flow(p_flow uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    SELECT EXISTS (SELECT 1 FROM console.eio_route WHERE saga_flow_id = p_flow AND status = 'active' AND deleted_at IS NULL)
$$;
REVOKE ALL ON FUNCTION console.eio_routed_flow(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION console.eio_routed_flow(uuid) TO eap_app, eap_ro;

CREATE TRIGGER trg_eio_canonical_guard BEFORE INSERT OR UPDATE ON console.eio_canonical FOR EACH ROW EXECUTE FUNCTION console.tg_eio_canonical();
CREATE TRIGGER trg_eio_route_guard BEFORE INSERT OR UPDATE ON console.eio_route FOR EACH ROW EXECUTE FUNCTION console.tg_eio_route();
CREATE TRIGGER trg_eio_exchange_guard BEFORE INSERT OR UPDATE OR DELETE ON console.eio_exchange FOR EACH ROW EXECUTE FUNCTION console.tg_eio_exchange();

-- ---------- L6: peristiwa pertukaran live yang sukses ----------
CREATE TRIGGER trg_eio_exchange_outbox
    AFTER INSERT ON console.eio_exchange
    FOR EACH ROW WHEN (NEW.status = 'ok' AND NEW.mode = 'live')
    EXECUTE FUNCTION shared.tg_outbox('eio_exchange', 'eap.console.eio_exchange_completed',
        '{id,route_id,route_kode,canonical_kode,canonical_versi,target_kind,saga_run_id,correlation_id,data_classification,row_version}');

-- ---------- hak & RLS ----------
GRANT SELECT, INSERT, UPDATE ON console.eio_canonical, console.eio_route TO eap_app;
GRANT SELECT, INSERT ON console.eio_exchange TO eap_app;
GRANT SELECT ON console.eio_canonical, console.eio_route, console.eio_exchange TO eap_ro;
CALL eaw.enable_rls('console.eio_canonical'::regclass);
CALL eaw.enable_rls('console.eio_route'::regclass);
CALL eaw.enable_rls('console.eio_exchange'::regclass);
CREATE POLICY rls_eio_canonical_sel ON console.eio_canonical FOR SELECT TO eap_app, eap_ro
    USING (set.has_perm('console.dashboard.read') OR set.has_perm('console.eio.write') OR set.has_perm('console.eio.run'));
CREATE POLICY rls_eio_canonical_ins ON console.eio_canonical FOR INSERT TO eap_app WITH CHECK (set.has_perm('console.eio.write'));
CREATE POLICY rls_eio_canonical_upd ON console.eio_canonical FOR UPDATE TO eap_app USING (set.has_perm('console.eio.write')) WITH CHECK (set.has_perm('console.eio.write'));
CREATE POLICY rls_eio_route_sel ON console.eio_route FOR SELECT TO eap_app, eap_ro
    USING (set.has_perm('console.dashboard.read') OR set.has_perm('console.eio.write') OR set.has_perm('console.eio.run'));
CREATE POLICY rls_eio_route_ins ON console.eio_route FOR INSERT TO eap_app WITH CHECK (set.has_perm('console.eio.write'));
CREATE POLICY rls_eio_route_upd ON console.eio_route FOR UPDATE TO eap_app USING (set.has_perm('console.eio.write')) WITH CHECK (set.has_perm('console.eio.write'));
-- log: pengelola & pembaca dashboard melihat semua; pemanggil (console.eio.run) melihat pertukarannya sendiri
CREATE POLICY rls_eio_exchange_sel ON console.eio_exchange FOR SELECT TO eap_app, eap_ro
    USING (set.has_perm('console.dashboard.read') OR set.has_perm('console.eio.write') OR (set.has_perm('console.eio.run') AND caller_id = shared.current_user_id()));
-- live hanya console.eio.run; simulate juga untuk pengelola (uji rute sebelum aktif)
CREATE POLICY rls_eio_exchange_ins ON console.eio_exchange FOR INSERT TO eap_app
    WITH CHECK (set.has_perm('console.eio.run') OR (mode = 'simulate' AND set.has_perm('console.eio.write')));
-- pemanggil rute perlu membaca konektor target (kode + breaking change)
CREATE POLICY rls_eio_connector_sel_run ON console.eio_connector FOR SELECT TO eap_app USING (set.has_perm('console.eio.run'));

-- L5: pemegang console.eio.run menjalankan saga HANYA untuk flow target rute aktif (kebijakan permisif tambahan atas 290/299)
CREATE POLICY rls_gse_flow_sel_eio ON gse.flow FOR SELECT TO eap_app USING (set.has_perm('console.eio.run') AND console.eio_routed_flow(id));
CREATE POLICY rls_saga_run_sel_eio ON gse.saga_run FOR SELECT TO eap_app USING (set.has_perm('console.eio.run') AND started_by = shared.current_user_id());
CREATE POLICY rls_saga_run_ins_eio ON gse.saga_run FOR INSERT TO eap_app WITH CHECK (set.has_perm('console.eio.run') AND console.eio_routed_flow(flow_id));
CREATE POLICY rls_saga_run_upd_eio ON gse.saga_run FOR UPDATE TO eap_app
    USING (set.has_perm('console.eio.run') AND started_by = shared.current_user_id()) WITH CHECK (set.has_perm('console.eio.run') AND started_by = shared.current_user_id());
CREATE POLICY rls_saga_step_sel_eio ON gse.saga_step FOR SELECT TO eap_app
    USING (set.has_perm('console.eio.run') AND EXISTS (SELECT 1 FROM gse.saga_run r WHERE r.id = run_id AND r.started_by = shared.current_user_id()));
CREATE POLICY rls_saga_step_ins_eio ON gse.saga_step FOR INSERT TO eap_app
    WITH CHECK (set.has_perm('console.eio.run') AND EXISTS (SELECT 1 FROM gse.saga_run r WHERE r.id = run_id AND r.started_by = shared.current_user_id()));
