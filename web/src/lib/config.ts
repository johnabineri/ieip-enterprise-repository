/* Konfigurasi runtime dari /config.js (window.EAP_CONFIG) — diisi kontainer (40-runtime-config.sh) atau ?api=/?oidc= saat pengembangan. */
export interface EapConfig { apiUrl?: string; oidcIssuer?: string; oidcClientId?: string }
declare global { interface Window { EAP_CONFIG?: EapConfig } }

export const cfg = (): EapConfig => (typeof window !== 'undefined' && window.EAP_CONFIG) || {};
export const apiBase = () => String(cfg().apiUrl || (typeof location !== 'undefined' ? location.origin : '')).replace(/\/$/, '');

export const ss = {
  get(k: string) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { sessionStorage.setItem(k, v); } catch { /* abaikan */ } },
  del(k: string) { try { sessionStorage.removeItem(k); } catch { /* abaikan */ } },
};
export const ls = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* abaikan */ } },
};
