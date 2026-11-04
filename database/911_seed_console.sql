-- 911_seed_console.sql : saklar AI kill-switch (kemampuan platform, bukan data bisnis). IDEMPOTEN. `enforced` = dicek kode mesin nyata.
INSERT INTO console.agent_switch (kode, nama, deskripsi, enforced) VALUES
  ('req-llm', 'REQ Assistant — mode LLM', 'Menghentikan pemanggilan LLM oleh sesi elisitasi REQ (503 saat nonaktif).', true),
  ('gse-ai', 'GSE AI scaffolding', 'Belum terhubung ke model; saklar disiapkan untuk integrasi D-04.', false),
  ('mind-prescreen', 'MIND Pre-ARB Screening', 'Belum terhubung; pre-screening ARB saat ini heuristik lokal.', false)
ON CONFLICT (kode) WHERE deleted_at IS NULL DO NOTHING;
