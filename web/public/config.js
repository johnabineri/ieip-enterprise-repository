/* Konfigurasi runtime SPA EAP. apiUrl: URL EAP API ("" = same-origin lewat gateway; /api/v1 dirutekan per workspace). oidcIssuer mengaktifkan login Keycloak (PKCE, klien eap-spa).
   Kontainer (infra/docker/nginx/40-runtime-config.sh, CONFIG_FILE=config.js) menambahkan penimpa runtime di akhir berkas ini — jangan ganti nama variabel/berkas.
   Pengembangan lokal: ?api=<url> dan ?oidc=<issuer> disimpan di sessionStorage. EAP API tidak punya login pengembangan: OIDC wajib. */
window.EAP_CONFIG = window.EAP_CONFIG || { apiUrl: "" };
(function () {
  try {
    // ?api= / ?oidc= (dan nilainya di sessionStorage) HANYA di host pengembangan. Di produksi tautan buatan penyerang tidak boleh mengganti basis API
    // (token Bearer akan dikirim ke sana) atau issuer OIDC (halaman masuk palsu): override dibuang dan konfigurasi server (penimpa runtime) yang berlaku.
    var h = location.hostname;
    var dev = h === "localhost" || h === "127.0.0.1" || h === "[::1]" || /\.localhost$/.test(h);
    if (!dev) { sessionStorage.removeItem("eap.api"); sessionStorage.removeItem("eap.oidc.issuer"); return; }
    var p = new URLSearchParams(location.search);
    if (p.get("api") !== null) sessionStorage.setItem("eap.api", p.get("api"));
    var s = sessionStorage.getItem("eap.api");
    if (s !== null) window.EAP_CONFIG.apiUrl = s;
    if (p.get("oidc") !== null) sessionStorage.setItem("eap.oidc.issuer", p.get("oidc"));
    var oi = sessionStorage.getItem("eap.oidc.issuer");
    if (oi !== null) window.EAP_CONFIG.oidcIssuer = oi;
  } catch (e) {}
})();
