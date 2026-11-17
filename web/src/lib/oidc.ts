/* OIDC authorization code + PKCE (S256) ke Keycloak (realm keis), klien publik `cmp-spa`. Aktif bila EAP_CONFIG.oidcIssuer terisi.
   Token di sessionStorage (per tab). oidcLogin() → Keycloak → kembali ke "/" ?code&state → oidcHandleCallback() menukar kode → access_token (Bearer),
   refresh_token memperbarui sebelum kedaluwarsa, oidcLogoutUrl() mengakhiri sesi SSO. Port dari cmp/admin/assets/js/oidc.js. */
import { cfg, ss } from './config';
import { t } from '@/lib/i18n';

const issuer = () => String(cfg().oidcIssuer || '').replace(/\/$/, '');
export const oidcEnabled = () => !!issuer();
const clientId = () => cfg().oidcClientId || 'eap-spa';
const endpoint = (p: string) => `${issuer()}/protocol/openid-connect/${p}`;
// redirect_uri HARUS identik pada otorisasi dan penukaran kode, dan terdaftar di klien Keycloak
const redirectUri = () => `${location.origin}/`;

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const parseJwt = (t: string): Record<string, any> => {
  try {
    const bin = atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  } catch { return {}; }
};

export class OidcError extends Error {}

/** extra: parameter otorisasi tambahan, mis. { kc_action: 'UPDATE_PASSWORD' } (Application-Initiated Action Keycloak: ganti kata sandi
 *  dilakukan di Keycloak — CMP tidak pernah menerima kata sandi; setelah selesai pengguna kembali ke halaman yang sama). */
export async function oidcLogin(extra: Record<string, string> = {}) {
  const verifier = random(48), state = random(16), nonce = random(16);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  ss.set('eap.oidc.tx', JSON.stringify({ verifier, state, nonce, redirect: redirectUri(), back: location.pathname }));
  const q = new URLSearchParams({
    client_id: clientId(), redirect_uri: redirectUri(), response_type: 'code', scope: 'openid',
    code_challenge: challenge, code_challenge_method: 'S256', state, nonce, ...extra,
  });
  location.assign(`${endpoint('auth')}?${q}`);
}

function storeTokens(t: any, nonce?: string) {
  if (t.id_token) {
    const c = parseJwt(t.id_token), aud = ([] as string[]).concat(c.aud || []);
    if (c.iss !== issuer()) throw new OidcError(t('id_token: issuer tidak cocok'));
    if (!aud.includes(clientId()) && c.azp !== clientId()) throw new OidcError(t('id_token: audiens tidak cocok'));
    if (nonce !== undefined && c.nonce !== nonce) throw new OidcError(t('id_token: nonce tidak cocok'));
    if (c.exp * 1000 < Date.now()) throw new OidcError(t('id_token kedaluwarsa'));
    ss.set('eap.oidc.idt', t.id_token);
  }
  ss.set('eap.token', t.access_token);
  if (t.refresh_token) ss.set('eap.oidc.refresh', t.refresh_token);
  ss.set('eap.oidc.exp', String(Date.now() + (t.expires_in || 300) * 1000));
}

async function tokenRequest(params: Record<string, string>) {
  let res: Response;
  try {
    res = await fetch(endpoint('token'), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  } catch { throw new OidcError(t('Keycloak tidak dapat dihubungi di {0}', issuer())); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new OidcError(data.error_description || data.error || t('Penukaran token gagal ({0})', res.status));
  return data;
}

/** null = bukan callback OIDC; selain itu path asal untuk dikembalikan. Melempar OidcError bila gagal. */
/** Hasil aksi Keycloak terakhir (kc_action_status) pada callback ini — dibaca AuthGate untuk notifikasi. */
export let lastActionStatus: string | null = null;

export async function oidcHandleCallback(): Promise<string | null> {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return null;
  const tx = JSON.parse(ss.get('eap.oidc.tx') || 'null');
  ss.del('eap.oidc.tx');
  lastActionStatus = q.get('kc_action_status');   // Application-Initiated Action (mis. UPDATE_PASSWORD): success | cancelled | error
  history.replaceState(null, '', location.pathname); // kode sekali-pakai tidak tertinggal di riwayat
  if (q.has('error')) throw new OidcError(q.get('error_description') || q.get('error') || t('Login gagal'));
  if (!tx || q.get('state') !== tx.state) throw new OidcError(t('State tidak cocok — permintaan login kedaluwarsa atau dipalsukan. Coba masuk lagi.'));
  storeTokens(await tokenRequest({
    grant_type: 'authorization_code', client_id: clientId(), code: q.get('code')!, redirect_uri: tx.redirect, code_verifier: tx.verifier,
  }), tx.nonce);
  return tx.back || '/';
}

let inflight: Promise<boolean> | null = null;
/** refresh_token → token baru, single-flight. false = harus login ulang. */
export function oidcRefresh(): Promise<boolean> {
  const rt = ss.get('eap.oidc.refresh');
  if (!rt) return Promise.resolve(false);
  if (!inflight) {
    inflight = tokenRequest({ grant_type: 'refresh_token', client_id: clientId(), refresh_token: rt })
      .then((t) => { storeTokens(t); return true; })
      .catch(() => { oidcClear(); return false; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}
/** Perbarui token bila sisa < 30 dtk. */
export async function oidcEnsureFresh() {
  if (!oidcEnabled() || !ss.get('eap.oidc.refresh')) return;
  const exp = Number(ss.get('eap.oidc.exp') || 0);
  if (exp && exp - Date.now() < 30000) await oidcRefresh();
}
export function oidcClear() { ['eap.token', 'eap.oidc.refresh', 'eap.oidc.exp', 'eap.oidc.idt', 'eap.oidc.tx'].forEach(ss.del); }
export function oidcLogoutUrl() {
  const q = new URLSearchParams({ client_id: clientId(), post_logout_redirect_uri: `${redirectUri()}?logout=1` });
  const idt = ss.get('eap.oidc.idt'); if (idt) q.set('id_token_hint', idt);
  return `${endpoint('logout')}?${q}`;
}

/** Konsol akun Keycloak (sesi aktif, perangkat, autentikasi dua faktor). */
export const oidcAccountUrl = () => `${issuer()}/account`;
/** Klaim id_token sesi ini (surel, nama, waktu masuk) — hanya untuk tampilan profil. */
export function oidcClaims(): Record<string, any> {
  const idt = ss.get('eap.oidc.idt');
  return idt ? parseJwt(idt) : {};
}
