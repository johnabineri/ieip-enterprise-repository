-- 911_seed_console.sql : saklar AI kill-switch (kemampuan platform, bukan data bisnis). IDEMPOTEN. `enforced` = dicek kode mesin nyata.
INSERT INTO console.agent_switch (kode, nama, deskripsi, enforced) VALUES
  ('req-llm', 'REQ Assistant — mode LLM', 'Menghentikan pemanggilan LLM oleh sesi elisitasi REQ (503 saat nonaktif).', true),
  ('gse-ai', 'GSE AI scaffolding', 'Menghentikan pemanggilan LLM oleh scaffolding AI GSE (503 saat nonaktif; diperiksa sebelum tiap panggilan).', true),
  ('gse-saga', 'GSE eksekutor saga (mode live)', 'Menghentikan panggilan HTTP eksekutor saga ke layanan (mode live; diperiksa sebelum tiap aksi — run berjalan dikompensasi). Mode simulate tidak terpengaruh.', true),
  ('eio-mediation', 'EIO mediasi (mode live)', 'Menghentikan pemanggilan konektor/saga oleh rute mediasi EIO (503 sebelum L5; mode simulate tidak terpengaruh).', true),
  ('mind-copilot', 'MIND Copilot — perangkaian jawaban LLM', 'Menghentikan pemanggilan LLM oleh MIND Copilot (diperiksa sebelum tiap panggilan). Jawaban deterministik dari alat data EAW tetap diberikan.', true),
  ('mind-prescreen', 'MIND Pre-ARB Screening', 'Belum terhubung; pre-screening ARB saat ini heuristik lokal.', false)
ON CONFLICT (kode) WHERE deleted_at IS NULL DO UPDATE SET nama = EXCLUDED.nama, deskripsi = EXCLUDED.deskripsi, enforced = EXCLUDED.enforced;   -- `enabled` (keputusan admin) TIDAK disentuh
