-- =====================================================================
-- 288_adr_git.sql : ADR → Git (EAW-04) — jejak publikasi berkas Markdown ADR ke repositori lewat branch + PR/MR. Append-only.
-- Satu baris = satu PR. Isi berkas dirender deterministik dari eaw.adr (sha256 isi disimpan); eaw.adr.git_ref diisi referensi PR terbaru.
-- Token penyedia Git TIDAK disimpan di DB (env API). Tidak ada push/merge ke cabang utama (CHECK + guard API).
-- =====================================================================
CREATE TABLE eaw.adr_git (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    adr_id         UUID NOT NULL REFERENCES eaw.adr(id),
    adr_code       VARCHAR(20) NOT NULL,
    adr_status     VARCHAR(20) NOT NULL CHECK (adr_status IN ('Proposed','Accepted','Deprecated','Superseded')),
    provider       VARCHAR(20) NOT NULL CHECK (provider IN ('gitlab','github')),
    repo_path      VARCHAR(255) NOT NULL,
    ref            VARCHAR(200) NOT NULL,
    base_branch    VARCHAR(100) NOT NULL,
    file_path      VARCHAR(300) NOT NULL,
    content_sha256 CHAR(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
    commit_sha     VARCHAR(64) NOT NULL,
    pr_number      INTEGER NOT NULL,
    pr_url         VARCHAR(500) NOT NULL,
    CONSTRAINT ck_adr_git_no_main CHECK (lower(ref) NOT IN ('main','master','develop') AND ref <> base_branch)
);
CALL shared.apply_standard('eaw.adr_git', 'internal', 'set.users');
CREATE INDEX ix_adr_git_adr ON eaw.adr_git (adr_id, created_at DESC);
CREATE FUNCTION eaw.tg_adr_git_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'eaw.adr_git append-only: % ditolak', TG_OP USING ERRCODE = 'insufficient_privilege'; END $$;
CREATE TRIGGER trg_adr_git_immutable BEFORE UPDATE OR DELETE ON eaw.adr_git FOR EACH ROW EXECUTE FUNCTION eaw.tg_adr_git_immutable();
