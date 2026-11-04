-- =====================================================================
-- 230_gse.sql : GSE — Generative Software Engineering (GSE-01..04)
--   gse.template     : blueprint kode deterministik berversi (berkas templat {{variabel}})
--   gse.project      : registri permintaan scaffolding (hasil / diblokir AF-06); 0 push ke main (CHECK branch)
--   gse.project_file : berkas hasil generate (append-only)
--   gse.flow         : definisi Saga/Agent (flow.yaml / agent.yaml) dengan validasi kompensasi idempoten (GSE-03, D-06/D-07)
--   Gerbang AF-06   : scaffolding hanya untuk aplikasi EAW berstatus >= Divalidasi — ditegakkan trigger + fungsi gse.app_gate()
-- Catatan jujur: lint/build/SCA/SBOM butuh CI runner (belum ada) — dicatat 'skipped', bukan dipalsukan 'ok'.
-- =====================================================================

CREATE TABLE gse.template (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode      VARCHAR(50) NOT NULL CHECK (kode ~ '^[a-z0-9][a-z0-9-]*$'),
    nama      VARCHAR(200) NOT NULL,
    kategori  VARCHAR(20) NOT NULL CHECK (kategori IN ('shell','frontend','backend','ddl','ci')),
    stack     VARCHAR(300),
    versi     VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    deskripsi TEXT,
    files     JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(files) = 'array')   -- [{path, content}] dengan {{variabel}}
);
CALL shared.apply_standard('gse.template', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_gse_template_kode ON gse.template (kode) WHERE deleted_at IS NULL;

CREATE TABLE gse.project (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES eaw.application(id),
    kode           VARCHAR(50) NOT NULL,                    -- salinan eaw.application.kode saat permintaan
    template_ids   UUID[] NOT NULL DEFAULT '{}',
    backend        VARCHAR(20) NOT NULL DEFAULT 'nestjs' CHECK (backend IN ('nestjs','gofiber','none')),
    repo_git       VARCHAR(255),
    branch         VARCHAR(200) NOT NULL,
    base_branch    VARCHAR(100) NOT NULL DEFAULT 'main',
    status         VARCHAR(20) NOT NULL CHECK (status IN ('generated','checks-failed','blocked')),
    reason         TEXT,
    gates          JSONB NOT NULL DEFAULT '{}',             -- {gate: {status: ok|err|skipped, detail}}
    file_count     INTEGER NOT NULL DEFAULT 0,
    bytes          INTEGER NOT NULL DEFAULT 0,
    duration_ms    INTEGER,
    prompt         TEXT,
    CONSTRAINT ck_gse_no_push_main CHECK (lower(branch) NOT IN ('main','master','develop')),     -- D-02: 0 push langsung ke main
    CONSTRAINT ck_gse_blocked_reason CHECK ((status = 'blocked') = (reason IS NOT NULL))
);
CALL shared.apply_standard('gse.project', 'internal', 'set.users');
CREATE INDEX ix_gse_project_app ON gse.project (application_id) WHERE deleted_at IS NULL;

CREATE TABLE gse.project_file (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES gse.project(id),
    path       VARCHAR(500) NOT NULL,
    content    TEXT NOT NULL,
    bytes      INTEGER NOT NULL,
    UNIQUE (project_id, path)
);

CREATE TABLE gse.flow (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama     VARCHAR(200) NOT NULL,
    kind     VARCHAR(10) NOT NULL CHECK (kind IN ('saga','agent')),
    spec     JSONB NOT NULL,
    status   VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','committed')),
    valid    BOOLEAN NOT NULL DEFAULT false,
    problems JSONB NOT NULL DEFAULT '[]'
);
CALL shared.apply_standard('gse.flow', 'internal', 'set.users');
CREATE UNIQUE INDEX ux_gse_flow_nama ON gse.flow (nama) WHERE deleted_at IS NULL;

-- ---------- gerbang AF-06 ----------
-- Pengembang (tanpa cakupan entitas) tidak melihat aplikasi Draf lewat RLS; status gerbang dibaca lewat fungsi definer minimal.
CREATE FUNCTION gse.app_status(p_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, eaw AS
$$ SELECT status::text FROM eaw.application WHERE id = p_id AND deleted_at IS NULL $$;

CREATE FUNCTION gse.app_gate(p_id uuid) RETURNS TABLE (found boolean, kode text, nama text, status text, ok boolean, reason text, repo_git text, platform text, workspace text,
                                                      workspace_mode text, federation_scope text, jenis_node text, entity_code text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, eaw, ref, set AS $$
BEGIN
    IF NOT set.has_perm('gse.project.run') THEN RAISE EXCEPTION 'izin gse.project.run diperlukan' USING ERRCODE = 'insufficient_privilege'; END IF;
    RETURN QUERY
    SELECT true, a.kode::text, a.nama::text, a.status::text, a.status IN ('Divalidasi','Ditetapkan','Dipublikasi','Direviu'),
           CASE WHEN a.status IN ('Divalidasi','Ditetapkan','Dipublikasi','Direviu') THEN NULL
                ELSE format('AF-06: %s berstatus %s di katalog EAW (minimal Divalidasi)', a.kode, a.status) END,
           a.repo_git::text, a.platform::text, a.workspace::text, a.workspace_mode::text, a.federation_scope::text, a.jenis_node::text, g.code::text
      FROM eaw.application a JOIN ref.business_groups g ON g.id = a.entity_id WHERE a.id = p_id AND a.deleted_at IS NULL;
    IF NOT FOUND THEN RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::text, false, 'AF-06: aplikasi tidak terdaftar di katalog EAW'::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text; END IF;
END $$;

-- katalog minimal untuk pemilih aplikasi di wizard (tanpa atribut sensitif)
CREATE FUNCTION gse.app_catalog() RETURNS TABLE (id uuid, kode text, nama text, status text, ok boolean, jenis_node text, platform text, workspace_mode text, entity_code text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, eaw, ref, set AS $$
BEGIN
    IF NOT (set.has_perm('gse.project.read') OR set.has_perm('gse.project.run')) THEN RAISE EXCEPTION 'izin gse.project.read diperlukan' USING ERRCODE = 'insufficient_privilege'; END IF;
    RETURN QUERY SELECT a.id, a.kode::text, a.nama::text, a.status::text, a.status IN ('Divalidasi','Ditetapkan','Dipublikasi','Direviu'), a.jenis_node::text, a.platform::text, a.workspace_mode::text, g.code::text
                   FROM eaw.application a JOIN ref.business_groups g ON g.id = a.entity_id WHERE a.deleted_at IS NULL ORDER BY a.kode;
END $$;

-- pertahanan berlapis: proyek non-blocked hanya untuk aplikasi >= Divalidasi
CREATE FUNCTION gse.tg_project_gate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_st text;
BEGIN
    IF NEW.status <> 'blocked' THEN
        v_st := gse.app_status(NEW.application_id);
        IF v_st IS NULL OR v_st NOT IN ('Divalidasi','Ditetapkan','Dipublikasi','Direviu') THEN
            RAISE EXCEPTION 'AF-06: scaffolding hanya untuk aplikasi berstatus minimal Divalidasi (status: %)', COALESCE(v_st, 'tidak terdaftar') USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_gse_project_a_gate BEFORE INSERT ON gse.project FOR EACH ROW EXECUTE FUNCTION gse.tg_project_gate();

-- proyek & berkasnya append-only
CREATE FUNCTION gse.tg_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME = 'project' AND TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN RETURN NEW; END IF;   -- hapus lunak
    RAISE EXCEPTION 'gse.% bersifat append-only: % ditolak', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER trg_gse_project_b_immutable BEFORE UPDATE OR DELETE ON gse.project FOR EACH ROW EXECUTE FUNCTION gse.tg_immutable();
CREATE TRIGGER trg_gse_file_immutable BEFORE UPDATE OR DELETE ON gse.project_file FOR EACH ROW EXECUTE FUNCTION gse.tg_immutable();

-- ---------- validasi Saga / Agent (GSE-03) ----------
-- Saga: tiap langkah bernama unik; langkah yang memutasi data (mutates != false) wajib punya compensation + idempotencyKey.
-- Agent: otonomi maksimum L3 (D-06); guardrail fail_mode wajib 'closed' (D-03).
CREATE FUNCTION gse.flow_problems(p_kind text, p_spec jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_p jsonb := '[]'; s jsonb; v_names text[] := '{}'; v_mut boolean;
BEGIN
    IF p_kind = 'saga' THEN
        IF jsonb_typeof(p_spec->'steps') IS DISTINCT FROM 'array' OR jsonb_array_length(p_spec->'steps') = 0 THEN
            RETURN jsonb_build_array('flow wajib memiliki minimal 1 langkah (spec.steps)');
        END IF;
        FOR s IN SELECT * FROM jsonb_array_elements(p_spec->'steps') LOOP
            IF COALESCE(btrim(s->>'name'), '') = '' THEN v_p := v_p || to_jsonb('langkah tanpa nama'::text); CONTINUE; END IF;
            IF (s->>'name') = ANY (v_names) THEN v_p := v_p || to_jsonb(format('nama langkah ganda: %s', s->>'name')); END IF;
            v_names := v_names || (s->>'name');
            v_mut := COALESCE((s->>'mutates')::boolean, true);
            IF v_mut AND COALESCE(btrim(s->>'compensation'), '') = '' THEN v_p := v_p || to_jsonb(format('langkah %s memutasi data tetapi tanpa kompensasi', s->>'name')); END IF;
            IF v_mut AND COALESCE(btrim(s->>'idempotencyKey'), '') = '' THEN v_p := v_p || to_jsonb(format('langkah %s tanpa idempotencyKey', s->>'name')); END IF;
            IF COALESCE(btrim(s->>'service'), '') = '' THEN v_p := v_p || to_jsonb(format('langkah %s tanpa service', s->>'name')); END IF;
        END LOOP;
    ELSE
        IF COALESCE(p_spec->>'autonomy', '') NOT IN ('L1','L2','L3') THEN v_p := v_p || to_jsonb('autonomy wajib L1, L2, atau L3 (D-06: maksimum L3)'::text); END IF;
        IF COALESCE(p_spec#>>'{guardrails,fail_mode}', '') <> 'closed' THEN v_p := v_p || to_jsonb('guardrails.fail_mode wajib "closed" (D-03)'::text); END IF;
        IF jsonb_typeof(p_spec->'tools') IS DISTINCT FROM 'array' THEN v_p := v_p || to_jsonb('tools wajib berupa daftar'::text); END IF;
    END IF;
    RETURN v_p;
END $$;

CREATE FUNCTION gse.tg_flow() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.problems := gse.flow_problems(NEW.kind, NEW.spec);
    NEW.valid := jsonb_array_length(NEW.problems) = 0;
    IF NEW.status = 'committed' AND NOT NEW.valid THEN
        RAISE EXCEPTION 'flow tidak valid, tidak dapat di-commit: %', NEW.problems USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_gse_flow_a_validate BEFORE INSERT OR UPDATE ON gse.flow FOR EACH ROW EXECUTE FUNCTION gse.tg_flow();
