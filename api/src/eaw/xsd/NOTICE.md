# Skema XSD pihak ketiga (TIDAK diubah)

Dipakai `src/eaw/xsd.ts` untuk memvalidasi Open Group ArchiMate Exchange Format (EAW-09): ekspor `GET /api/v1/eaw/diagrams/:id/exchange`
dan impor `POST /api/v1/eaw/diagrams/import-xml`.

| Berkas | Sumber | sha256 |
|---|---|---|
| `archimate3_Diagram.xsd` | https://www.opengroup.org/xsd/archimate/3.1/archimate3_Diagram.xsd | `6419080f4c4bc43b4a7b8acf870146a7bae6c3487a3ce08d3c521c028ea6056e` |
| `archimate3_View.xsd` | https://www.opengroup.org/xsd/archimate/3.1/archimate3_View.xsd | `d708ce176403034b1229b892712cfd69660aefe17da4cc54acea1ac35e4a9854` |
| `archimate3_Model.xsd` | https://www.opengroup.org/xsd/archimate/3.1/archimate3_Model.xsd | `dd451abe3e3193f91dd9544b279af9bbbf17e75ff1ef86f65ad52b3f8cd29794` |
| `xml.xsd` | https://www.w3.org/2001/xml.xsd | `61960fb3131e38022caad5360e2f33a3382578ab3c80cd58bd74320ede61b20c` |

Diunduh 2026-11-05. Hak cipta pada The Open Group (ArchiMate) dan W3C (`xml.xsd`); berkas disertakan apa adanya agar validasi berjalan
TANPA akses jaringan. Satu-satunya penyesuaian dilakukan DI MEMORI saat dimuat (bukan di berkas): `schemaLocation` impor
`http://www.w3.org/2001/xml.xsd` pada `archimate3_Model.xsd` diarahkan ke salinan lokal `xml.xsd`.
Jangan sunting berkas ini; untuk versi baru, unduh ulang dan perbarui tabel sha256 (tes e2e memeriksa hash).
