-- =====================================================================
-- 240_req.sql : REQ — Requirement Elicitation Assistant (REQ-01..03)
--   req.session   : sesi elisitasi milik pengguna (RLS: hanya pemilik)
--   req.message   : percakapan (append-only); pesan ditolak guardrail tetap tercatat sebagai 'system'
--   req.story     : User Story + skenario Gherkin tervalidasi (hasil sesi)
--   req.guard_log : penolakan guardrail (append-only); kutipan sudah DIMASKING (PII tidak pernah disimpan)
-- Guardrail dievaluasi di API (aturan deterministik lokal, fail-closed); DB menjaga kepemilikan dan kekekalan.
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS req;

CREATE SEQUENCE req.story_seq;

CREATE TABLE req.session (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title          VARCHAR(200) NOT NULL DEFAULT 'Sesi elisitasi',
    application_id UUID REFERENCES eaw.application(id),      -- opsional: kebutuhan untuk aplikasi di katalog EAW
    mode           VARCHAR(20) NOT NULL CHECK (mode IN ('deterministic','llm')),
    stage          SMALLINT NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 9),
    status         VARCHAR(12) NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed'))
);
CALL shared.apply_standard('req.session', 'internal', 'set.users');

CREATE TABLE req.message (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES req.session(id),
    seq        INTEGER NOT NULL,
    role       VARCHAR(10) NOT NULL CHECK (role IN ('user','assistant','system')),
    content    TEXT NOT NULL,
    meta       JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (session_id, seq)
);

CREATE TABLE req.story (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES req.session(id),
    code        VARCHAR(20) NOT NULL DEFAULT ('US-' || lpad(nextval('req.story_seq')::text, 4, '0')),
    title       VARCHAR(200) NOT NULL,
    story       TEXT NOT NULL,
    acceptance  JSONB NOT NULL DEFAULT '[]',
    gherkin     TEXT NOT NULL,
    priority    VARCHAR(10) NOT NULL DEFAULT 'Must' CHECK (priority IN ('Must','Should','Could')),
    valid       BOOLEAN NOT NULL,                              -- hasil validator Gherkin saat dibuat
    validation  JSONB NOT NULL DEFAULT '{}',
    engine      VARCHAR(100) NOT NULL
);
CALL shared.apply_standard('req.story', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_req_story_code ON req.story (code) WHERE deleted_at IS NULL;

CREATE TABLE req.guard_log (
    id         BIGSERIAL PRIMARY KEY,
    session_id UUID REFERENCES req.session(id),
    user_id    UUID REFERENCES set.users(id),
    engine     VARCHAR(20) NOT NULL CHECK (engine IN ('opa-rego','fencing','pii')),
    category   VARCHAR(30) NOT NULL,
    excerpt    VARCHAR(120) NOT NULL,
    ms         INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- append-only: pesan dan log guardrail
CREATE FUNCTION req.tg_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'req.% bersifat append-only: % ditolak', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege'; END $$;
CREATE TRIGGER trg_req_message_immutable BEFORE UPDATE OR DELETE ON req.message FOR EACH ROW EXECUTE FUNCTION req.tg_immutable();
CREATE TRIGGER trg_req_guard_immutable BEFORE UPDATE OR DELETE ON req.guard_log FOR EACH ROW EXECUTE FUNCTION req.tg_immutable();

CREATE INDEX ix_req_message_session ON req.message (session_id, seq);
CREATE INDEX ix_req_guard_created ON req.guard_log (created_at);
