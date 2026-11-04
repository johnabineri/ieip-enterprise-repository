-- D-14: DILARANG menyimpan PII di tabel ini; hanya idp_subject.
CREATE TABLE set.users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idp_subject  VARCHAR(200) NOT NULL UNIQUE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
