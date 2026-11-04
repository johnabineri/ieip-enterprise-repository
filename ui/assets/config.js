/* Konfigurasi runtime SPA. apiUrl kosong = mode prototipe (data MOCK di data.js).
   Isi, mis. "http://localhost:3000", untuk memakai EAP API (eap/api), mis. "http://localhost:3100"; oidcIssuer (opsional) mengaktifkan login Keycloak. Bisa ditimpa lewat ?api=<url> (tersimpan di sessionStorage). */
window.EAP_CONFIG = window.EAP_CONFIG || { apiUrl: "" };
(function () {
  try {
    var q = new URLSearchParams(location.search).get("api");
    if (q !== null) { sessionStorage.setItem("eap.api", q); }
    var s = sessionStorage.getItem("eap.api");
    if (s !== null) window.EAP_CONFIG.apiUrl = s;
    // ?oidc=<issuer Keycloak>, mis. http://localhost:8180/realms/keis ; ?oidc= (kosong) menonaktifkan
    var o = new URLSearchParams(location.search).get("oidc");
    if (o !== null) { sessionStorage.setItem("eap.oidc.issuer", o); }
    var oi = sessionStorage.getItem("eap.oidc.issuer");
    if (oi) window.EAP_CONFIG.oidcIssuer = oi;
  } catch (e) {}
})();
