/* Unduh berkas biner/teks dari EAP API dengan token Bearer (anchor biasa tidak dapat mengirim Authorization). */
import * as api from './api';
import { apiBase } from './config';
import { oidcEnabled, oidcEnsureFresh } from './oidc';
import { toast } from '@/store/ui';
import { t } from './i18n';

export async function downloadApi(path: string, name: string) {
  try {
    if (oidcEnabled()) await oidcEnsureFresh();
    const r = await fetch(apiBase() + path, { headers: { Authorization: `Bearer ${api.token()}` } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  } catch (e) { toast(t('Gagal'), api.explain(e), 'error'); }
}
