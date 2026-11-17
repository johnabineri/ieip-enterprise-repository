# Arsip: mockup UI EAP (`eap/ui`)

Prototipe UI statis (HTML/JS vanilla, tanpa build) yang menjadi acuan visual dan perilaku EAP. **Diarsipkan 2026-11-17**; UI aktif = `eap/web` (Next.js).
Tag git titik pemulihan: `eap-ui-mockup-final` (`git checkout eap-ui-mockup-final -- ui`).

- `assets/styles.css` **TIDAK ada di sini** — dipindah ke `eap/web/design/styles.css` karena `eap/web/src/styles/eap.css` diturunkan darinya (`npm run styles`).
  Perubahan gaya mockup dilakukan di berkas itu. Rujukan font: tag `<link>` di `index.html` arsip ini.
- `assets/*.js` — mockup (`app.js`, `pages-*.js`, `data.js` = data contoh) dan modul mode live (`live*.js`, `oidc.js`) yang dulu menimpa data contoh dengan EAP API.
- `scripts/check_ui_handlers.py` — pemeriksa XSS handler inline untuk UI lama (dulu langkah CI); tidak lagi dijalankan di CI. Jalankan manual: `python scripts/check_ui_handlers.py`.
- Menjalankan mockup: `cd eap/docs/archive/eap-ui-mockup && python -m http.server 8766` lalu buka `index.html` (mode live: `?api=http://localhost:3100&oidc=http://localhost:8180/realms/keis`).
  Tanpa `assets/styles.css` tampilan polos — salin dari `eap/web/design/styles.css` ke `assets/` untuk melihat mockup utuh.
- Fitur mockup yang tidak diteruskan sebagai data contoh: lihat `eap/CLAUDE.md` (lonceng notifikasi dan MIND Copilot kini ada dengan backend nyata di `eap/web`).
