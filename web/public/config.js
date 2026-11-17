/* Konfigurasi runtime SPA EAP. apiUrl: URL EAP API ("" = same-origin lewat gateway; /api/v1 dirutekan per workspace). oidcIssuer mengaktifkan login Keycloak (PKCE, klien eap-spa).
   Kontainer (infra/docker/nginx/40-runtime-config.sh, CONFIG_FILE=config.js) menambahkan penimpa runtime di akhir berkas ini — jangan ganti nama variabel/berkas.
   Pengembangan lokal: ?api=<url> dan ?oidc=<issuer> disimpan di sessionStorage. EAP API tidak punya login pengembangan: OIDC wajib. */
window.EAP_CONFIG = window.EAP_CONFIG || { apiUrl: "" };
(function () {
  try {
    var p = new URLSearchParams(location.search);
    if (p.get("api") !== null) sessionStorage.setItem("eap.api", p.get("api"));
    var s = sessionStorage.getItem("eap.api");
    if (s !== null) window.EAP_CONFIG.apiUrl = s;
    if (p.get("oidc") !== null) sessionStorage.setItem("eap.oidc.issuer", p.get("oidc"));
    var oi = sessionStorage.getItem("eap.oidc.issuer");
    if (oi !== null) window.EAP_CONFIG.oidcIssuer = oi;
  } catch (e) {}
})();
