/* =====================================================================
   SAORAJA EAP — OIDC authorization code + PKCE (S256) ke Keycloak (realm keis), klien publik `eap-spa`.
   Aktif bila EAP_CONFIG.oidcIssuer terisi (atau ?oidc=<issuer>). Tanpa rahasia klien; token disimpan di sessionStorage (per tab).
   Alur: login() → redirect ke Keycloak → kembali ke index.html?code=…&state=… → handleCallback() menukar kode (code_verifier)
   → access_token dipakai API (Bearer), refresh_token memperbarui sebelum kedaluwarsa, logoutUrl() mengakhiri sesi SSO.
   ===================================================================== */
window.Oidc = (function () {
  const cfg = () => window.EAP_CONFIG || {};
  const issuer = () => String(cfg().oidcIssuer || "").replace(/\/$/, "");
  const enabled = () => !!issuer();
  const clientId = () => cfg().oidcClientId || "eap-spa";
  const endpoint = p => issuer() + "/protocol/openid-connect/" + p;
  // redirect_uri HARUS identik pada permintaan otorisasi dan penukaran kode, dan terdaftar di klien Keycloak
  const redirectUri = () => location.origin + location.pathname.replace(/[^/]*$/, "") + "index.html";

  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) {} },
  };
  const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const random = n => b64url(crypto.getRandomValues(new Uint8Array(n)));
  const parseJwt = t => { try { return JSON.parse(decodeURIComponent(escape(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))))); } catch (e) { return {}; } };

  class OidcError extends Error {}

  /** Mengalihkan ke halaman login Keycloak. */
  async function login() {
    const verifier = random(48), state = random(16), nonce = random(16);
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    ss.set("eap.oidc.tx", JSON.stringify({ verifier, state, nonce, redirect: redirectUri() }));
    const q = new URLSearchParams({ client_id: clientId(), redirect_uri: redirectUri(), response_type: "code", scope: "openid",
      code_challenge: challenge, code_challenge_method: "S256", state, nonce });
    location.assign(endpoint("auth") + "?" + q);
  }

  function storeTokens(t, nonce) {
    if (t.id_token) {
      const c = parseJwt(t.id_token), aud = [].concat(c.aud || []);
      if (c.iss !== issuer()) throw new OidcError("id_token: issuer tidak cocok");
      if (!aud.includes(clientId()) && c.azp !== clientId()) throw new OidcError("id_token: audiens tidak cocok");
      if (nonce !== undefined && c.nonce !== nonce) throw new OidcError("id_token: nonce tidak cocok");
      if (c.exp * 1000 < Date.now()) throw new OidcError("id_token kedaluwarsa");
      ss.set("eap.oidc.idt", t.id_token);
    }
    ss.set("eap.token", t.access_token);
    if (t.refresh_token) ss.set("eap.oidc.refresh", t.refresh_token);
    ss.set("eap.oidc.exp", String(Date.now() + (t.expires_in || 300) * 1000));
  }

  async function tokenRequest(params) {
    let res;
    try { res = await fetch(endpoint("token"), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) }); }
    catch (e) { throw new OidcError("Keycloak tidak dapat dihubungi di " + issuer()); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new OidcError(data.error_description || data.error || "Penukaran token gagal (" + res.status + ")");
    return data;
  }

  /**
   * Dipanggil di index.html. null = bukan callback OIDC. Selain itu: menukar kode dengan token (atau melempar OidcError),
   * lalu membersihkan parameter dari URL agar kode sekali-pakai tidak tertinggal di riwayat peramban.
   */
  async function handleCallback() {
    const q = new URLSearchParams(location.search);
    if (!q.has("code") && !q.has("error")) return null;
    const tx = JSON.parse(ss.get("eap.oidc.tx") || "null");
    ss.del("eap.oidc.tx");
    history.replaceState(null, "", location.pathname + location.hash);
    if (q.has("error")) throw new OidcError(q.get("error_description") || q.get("error"));
    if (!tx || q.get("state") !== tx.state) throw new OidcError("State tidak cocok — permintaan login kedaluwarsa atau dipalsukan. Coba masuk lagi.");
    storeTokens(await tokenRequest({ grant_type: "authorization_code", client_id: clientId(), code: q.get("code"), redirect_uri: tx.redirect, code_verifier: tx.verifier }), tx.nonce);
    return true;
  }

  let inflight = null;
  /** Menukar refresh_token → token baru. Satu permintaan bersamaan (single-flight). false bila gagal (sesi harus login ulang). */
  function refresh() {
    const rt = ss.get("eap.oidc.refresh");
    if (!rt) return Promise.resolve(false);
    if (!inflight) {
      inflight = tokenRequest({ grant_type: "refresh_token", client_id: clientId(), refresh_token: rt })
        .then(t => { storeTokens(t); return true; })
        .catch(() => { clear(); return false; })
        .finally(() => { inflight = null; });
    }
    return inflight;
  }
  /** Perbarui token bila hampir habis (< 30 dtk). */
  async function ensureFresh() {
    if (!enabled() || !ss.get("eap.oidc.refresh")) return;
    const exp = Number(ss.get("eap.oidc.exp") || 0);
    if (exp && exp - Date.now() < 30000) await refresh();
  }
  function clear() { ["eap.token", "eap.oidc.refresh", "eap.oidc.exp", "eap.oidc.idt", "eap.oidc.tx"].forEach(ss.del); }
  /** URL logout RP-initiated: mengakhiri sesi Keycloak (SSO), lalu kembali ke halaman login. */
  function logoutUrl() {
    const q = new URLSearchParams({ client_id: clientId(), post_logout_redirect_uri: redirectUri() + "#logout" });
    const idt = ss.get("eap.oidc.idt"); if (idt) q.set("id_token_hint", idt);
    return endpoint("logout") + "?" + q;
  }

  return { enabled, login, handleCallback, refresh, ensureFresh, clear, logoutUrl, OidcError, issuer };
})();
