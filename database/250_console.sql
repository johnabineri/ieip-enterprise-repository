-- =====================================================================
-- 250_console.sql : CONSOLE — Enterprise Control Console (GOV-02, SEC-01, FIN-01, EIO-04, EAW-08)
--   console.ai_model / rag_dataset : register model & dataset (D-05: data sensitif hanya model on-premises)
--   console.token_usage / provider_invoice : metering token (append-only) + rekonsiliasi tagihan (selisih <= 2%)
--   console.eio_connector : registri konektor + hasil health check + deteksi breaking change kontrak OpenAPI
--   console.agent_switch  : AI kill-switch (diperiksa mesin yang ditandai `enforced`)
--   console.ika_snapshot  : snapshot skor IKA terhitung (tren per periode)
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS console;

CREATE TABLE console.ai_model (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode           VARCHAR(100) NOT NULL CHECK (kode ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'),
    nama           VARCHAR(200) NOT NULL,
    penyedia       VARCHAR(100),
    lokasi         VARCHAR(10) NOT NULL CHECK (lokasi IN ('cloud','on-prem')),
    lisensi        VARCHAR(100),
    guna           VARCHAR(300),
    klasifikasi_maks VARCHAR(10) NOT NULL CHECK (klasifikasi_maks IN ('publik','internal','terbatas','rahasia')),   -- data terberat yang boleh diproses
    risiko         VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (risiko IN ('low','medium','high')),
    status         VARCHAR(10) NOT NULL DEFAULT 'evaluasi' CHECK (status IN ('aktif','evaluasi','nonaktif')),
    harga_in_per_1k  NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (harga_in_per_1k >= 0),        -- IDR per 1000 token masukan
    harga_out_per_1k NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (harga_out_per_1k >= 0),
    -- D-05: model cloud tidak boleh memproses data terbatas/rahasia/PII
    CONSTRAINT ck_ai_model_d05 CHECK (lokasi = 'on-prem' OR klasifikasi_maks IN ('publik','internal'))
);
CALL shared.apply_standard('console.ai_model', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_ai_model_kode ON console.ai_model (kode) WHERE deleted_at IS NULL;

CREATE TABLE console.rag_dataset (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama        VARCHAR(200) NOT NULL,
    store       VARCHAR(30) NOT NULL CHECK (store IN ('pgvector','qdrant','lainnya')),
    klasifikasi VARCHAR(10) NOT NULL CHECK (klasifikasi IN ('publik','internal','terbatas','rahasia')),
    pii         BOOLEAN NOT NULL DEFAULT false,
    model_id    UUID REFERENCES console.ai_model(id)             -- model embedding/generasi yang memprosesnya
);
CALL shared.apply_standard('console.rag_dataset', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_rag_dataset_nama ON console.rag_dataset (nama) WHERE deleted_at IS NULL;

CREATE FUNCTION console.tg_rag_d05() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_loc text;
BEGIN
    IF NEW.pii OR NEW.klasifikasi IN ('terbatas','rahasia') THEN
        SELECT lokasi INTO v_loc FROM console.ai_model WHERE id = NEW.model_id AND deleted_at IS NULL;
        IF v_loc IS DISTINCT FROM 'on-prem' THEN
            RAISE EXCEPTION 'D-05: dataset % (klasifikasi %, pii %) wajib diproses model on-premises yang terdaftar', NEW.nama, NEW.klasifikasi, NEW.pii USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_rag_dataset_a_d05 BEFORE INSERT OR UPDATE ON console.rag_dataset FOR EACH ROW EXECUTE FUNCTION console.tg_rag_d05();
-- model yang diturunkan ke cloud / klasifikasi diturunkan tidak boleh memutus aturan dataset yang memakainya
CREATE FUNCTION console.tg_model_vs_rag() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.lokasi <> 'on-prem' AND EXISTS (SELECT 1 FROM console.rag_dataset d WHERE d.model_id = NEW.id AND d.deleted_at IS NULL AND (d.pii OR d.klasifikasi IN ('terbatas','rahasia'))) THEN
        RAISE EXCEPTION 'D-05: model % dipakai dataset sensitif; tidak boleh dipindah ke cloud', NEW.kode USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_ai_model_b_rag BEFORE UPDATE ON console.ai_model FOR EACH ROW EXECUTE FUNCTION console.tg_model_vs_rag();

CREATE TABLE console.token_usage (
    id                BIGSERIAL PRIMARY KEY,
    occurred_at       TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    model_id          UUID REFERENCES console.ai_model(id),
    model_name        VARCHAR(100) NOT NULL,
    workspace         VARCHAR(10) NOT NULL CHECK (workspace IN ('req','gse','mind','other')),
    entity_id         UUID REFERENCES ref.business_groups(id),       -- tenant/SBU penanggung biaya (NULL = tidak teralokasi)
    user_id           UUID REFERENCES set.users(id),
    prompt_tokens     INTEGER NOT NULL CHECK (prompt_tokens >= 0),
    completion_tokens INTEGER NOT NULL CHECK (completion_tokens >= 0),
    cost_idr          NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (cost_idr >= 0)
);
CREATE INDEX ix_token_usage_time ON console.token_usage (occurred_at);
CREATE FUNCTION console.tg_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'console.% bersifat append-only: % ditolak', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege'; END $$;
CREATE TRIGGER trg_token_usage_immutable BEFORE UPDATE OR DELETE ON console.token_usage FOR EACH ROW EXECUTE FUNCTION console.tg_immutable();
-- biaya dihitung DB dari harga model terdaftar (klien tidak dapat menentukan)
CREATE FUNCTION console.tg_token_cost() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m record;
BEGIN
    SELECT id, harga_in_per_1k, harga_out_per_1k INTO m FROM console.ai_model WHERE kode = NEW.model_name AND deleted_at IS NULL;
    IF FOUND THEN
        NEW.model_id := m.id;
        NEW.cost_idr := round((NEW.prompt_tokens * m.harga_in_per_1k + NEW.completion_tokens * m.harga_out_per_1k) / 1000.0, 2);
    ELSE NEW.cost_idr := 0; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_token_usage_a_cost BEFORE INSERT ON console.token_usage FOR EACH ROW EXECUTE FUNCTION console.tg_token_cost();

CREATE TABLE console.provider_invoice (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periode       DATE NOT NULL CHECK (periode = date_trunc('month', periode)::date),    -- awal bulan
    model_name    VARCHAR(100) NOT NULL,
    billed_tokens BIGINT NOT NULL CHECK (billed_tokens >= 0),
    billed_idr    NUMERIC(15,2) NOT NULL CHECK (billed_idr >= 0)
);
CALL shared.apply_standard('console.provider_invoice', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_provider_invoice ON console.provider_invoice (periode, model_name) WHERE deleted_at IS NULL;

CREATE TABLE console.eio_connector (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode             shared.business_code NOT NULL,
    nama             VARCHAR(200) NOT NULL,
    tipe             VARCHAR(10) NOT NULL DEFAULT 'openapi' CHECK (tipe IN ('openapi','event')),
    sumber           VARCHAR(100) NOT NULL,                          -- sistem produsen
    target           VARCHAR(100) NOT NULL,                          -- sistem konsumen
    health_url       VARCHAR(500),
    spec_url         VARCHAR(500),                                   -- dokumen OpenAPI (JSON) untuk deteksi breaking change
    entity_id        UUID REFERENCES ref.business_groups(id),
    status           VARCHAR(10) NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown','up','degraded','down')),
    last_check_at    TIMESTAMPTZ,
    last_latency_ms  INTEGER,
    last_error       TEXT,
    spec_hash        VARCHAR(64),
    spec_snapshot    JSONB,                                          -- {"GET /path": ["requiredParam", ...]} baseline kontrak
    breaking_changes JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT ck_eio_url CHECK ((health_url IS NULL OR health_url ~ '^https?://') AND (spec_url IS NULL OR spec_url ~ '^https?://'))
);
CALL shared.apply_standard('console.eio_connector', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_eio_connector_kode ON console.eio_connector (kode) WHERE deleted_at IS NULL;

CREATE TABLE console.agent_switch (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode      VARCHAR(50) NOT NULL,
    nama      VARCHAR(200) NOT NULL,
    deskripsi VARCHAR(300),
    enforced  BOOLEAN NOT NULL DEFAULT false,                        -- true = dicek kode mesin nyata (bukan sekadar bendera)
    enabled   BOOLEAN NOT NULL DEFAULT true,
    reason    TEXT
);
CALL shared.apply_standard('console.agent_switch', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_agent_switch_kode ON console.agent_switch (kode) WHERE deleted_at IS NULL;
-- dibaca mesin tanpa melihat tabel (fail-closed di sisi pemanggil bila tidak ada baris: dianggap AKTIF hanya untuk kode tak terdaftar)
CREATE FUNCTION console.agent_enabled(p_kode text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, console AS
$$ SELECT COALESCE((SELECT enabled FROM console.agent_switch WHERE kode = p_kode AND deleted_at IS NULL), true) $$;

CREATE TABLE console.ika_snapshot (
    id            BIGSERIAL PRIMARY KEY,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entity_id     UUID NOT NULL REFERENCES ref.business_groups(id),
    level         SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 5),
    domain_levels JSONB NOT NULL,
    objects       INTEGER NOT NULL,
    taken_by      UUID REFERENCES set.users(id),
    taken_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (snapshot_date, entity_id)
);

-- Skor IKA terhitung (SAF 6.3) dihitung di API (console/ika.ts) dari data eaw yang terlihat pemanggil (RLS) — rumus terdokumentasi di sana; snapshot disimpan di console.ika_snapshot.
