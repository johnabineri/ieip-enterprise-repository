/* =====================================================================
   SAORAJA EAP — klien EAP API (REST /api/v1, RFC 9457, ETag/If-Match, Idempotency-Key).
   Aktif bila EAP_CONFIG.apiUrl terisi. Token disimpan di sessionStorage (hilang saat tab ditutup).
   ===================================================================== */
window.API = (function () {
  const base = () => String((window.EAP_CONFIG && window.EAP_CONFIG.apiUrl) || "").replace(/\/$/, "");
  const live = () => !!base();
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) {} },
  };
  const token = () => store.get("eap.token");

  class ApiError extends Error {
    constructor(status, body) {
      super((body && (body.detail || body.title)) || "HTTP " + status);
      this.status = status; this.body = body || {}; this.title = this.body.title; this.detail = this.body.detail;
    }
  }

  async function request(method, path, { query, body, headers, auth = true, quiet = false } = {}, retried = false) {
    if (auth && window.Oidc && Oidc.enabled()) await Oidc.ensureFresh();   // token hampir habis → perbarui dulu
    const url = new URL(base() + path);
    Object.entries(query || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v); });
    const h = Object.assign({ Accept: "application/json" }, headers || {});
    if (auth && token()) h.Authorization = "Bearer " + token();
    if (body !== undefined) h["Content-Type"] = "application/json";
    let res;
    try { res = await fetch(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch (e) { throw new ApiError(0, { title: "API tidak dapat dihubungi", detail: "Periksa bahwa EAP API berjalan di " + base() + " dan CORS mengizinkan asal halaman ini." }); }
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (e) { data = { detail: text }; } }
    if (!res.ok) {
      if (res.status === 401 && auth && token() && !quiet) {   // quiet: pemanggil (halaman login) menangani 401 sendiri
        // satu kali coba perbarui token (mis. dicabut/berganti di server), selain itu sesi berakhir
        if (!retried && window.Oidc && Oidc.enabled() && await Oidc.refresh()) return request(method, path, { query, body, headers, auth }, true);
        store.del("eap.token"); store.del("eap.session"); if (window.Oidc) Oidc.clear(); location.replace("index.html#expired");
      }
      throw new ApiError(res.status, data);
    }
    return { data, etag: res.headers.get("ETag"), replayed: res.headers.get("Idempotent-Replayed") === "true" };
  }

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));

  return {
    live, base, token, ApiError, uuid,
    setToken: t => store.set("eap.token", t),
    clear: () => { store.del("eap.token"); },
    async get(path, query, opts) { return (await request("GET", path, Object.assign({ query }, opts))).data; },
    /** GET dengan ETag (untuk If-Match pada PATCH berikutnya). */
    async getWithEtag(path, query) { const r = await request("GET", path, { query }); return { data: r.data, etag: r.etag }; },
    /** Mengikuti next_cursor sampai habis (maks `pages` halaman). */
    async all(path, query, pages = 20) {
      const out = []; let cursor;
      for (let i = 0; i < pages; i++) {
        const r = (await request("GET", path, { query: Object.assign({ limit: 100 }, query, cursor ? { cursor } : {}) })).data;
        out.push(...(r.data || []));
        cursor = r.nextCursor;
        if (!cursor) break;
      }
      return out;
    },
    /** POST; idem=true menambah Idempotency-Key baru (aman diulang bila klien mencoba lagi dengan kunci yang sama). */
    async post(path, body, { idem = false, key, ifMatch } = {}) {
      const headers = idem ? { "Idempotency-Key": key || uuid() } : {};
      if (ifMatch) headers["If-Match"] = ifMatch;
      return (await request("POST", path, { body: body === undefined ? {} : body, headers })).data;
    },
    async put(path, body, { ifMatch } = {}) { return (await request("PUT", path, { body, headers: ifMatch ? { "If-Match": ifMatch } : {} })).data; },
    async del(path) { return (await request("DELETE", path, {})).data; },
    async patch(path, body, ifMatch) { return (await request("PATCH", path, { body, headers: ifMatch ? { "If-Match": ifMatch } : {} })).data; },
    /** Pesan galat ramah untuk toast. */
    explain(e) {
      if (!(e instanceof ApiError)) return String(e && e.message || e);
      return [e.title, e.detail].filter(Boolean).join(" — ") || ("HTTP " + e.status);
    },
  };
})();
