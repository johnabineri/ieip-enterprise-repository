'use client';
import { oidcEnabled, oidcLogin } from '@/lib/oidc';

/** Ganti kata sandi lewat Keycloak (Application-Initiated Action UPDATE_PASSWORD); kembali ke halaman ini setelah selesai. EAP tidak pernah menerima kata sandi. */
export function changePassword() {
  if (!oidcEnabled()) return false;
  void oidcLogin({ kc_action: 'UPDATE_PASSWORD' });
  return true;
}
