'use client';
/* Gerbang sesi: callback OIDC → token → GET /me → aplikasi; selain itu layar masuk (SSO Keycloak, klien eap-spa).
   EAP API tidak punya login pengembangan — OIDC wajib (?oidc=<issuer> saat pengembangan lokal). Layar masuk tidak ada di mockup:
   dibuat dari token & komponen mockup (.card, .brand, .btn, .callout). */
import * as React from 'react';
import * as api from '@/lib/api';
import { lastActionStatus, oidcClear, oidcEnabled, oidcHandleCallback, oidcLogin, oidcLogoutUrl, safePath } from '@/lib/oidc';
import { queryClient } from '@/lib/query';
import { useSession } from '@/store/session';
import { toast, useUi, type Theme } from '@/store/ui';
import { ls, ss } from '@/lib/config';
import { Btn, Callout, Skel } from '@/components/ui';
import { t } from '@/lib/i18n';

async function startSession() {
  const s = useSession.getState();
  try {
    const me = await api.fetchMe(true);
    queryClient.clear();
    s.setMe(me);
  } catch (e) {
    api.clearToken();
    if (e instanceof api.ApiError && e.status === 403) return s.toLogin({ tone: 'bad', text: t('Akun Anda belum terdaftar atau belum aktif di EAP. Hubungi admin.') });
    s.toLogin(e instanceof api.ApiError && e.status === 401 ? { tone: 'warn', text: t('Sesi berakhir. Silakan masuk lagi.') } : { tone: 'bad', text: api.explain(e) });
  }
}

export function logout() {
  const url = oidcEnabled() ? oidcLogoutUrl() : null;
  api.clearToken(); oidcClear(); queryClient.clear(); useUi.getState().closeAll();
  if (url) location.assign(url);
  else useSession.getState().toLogin({ tone: 'ok', text: t('Anda telah keluar.') });
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const status = useSession((s) => s.status);
  React.useEffect(() => {
    const th = ls.get('eap.theme');
    useUi.setState({
      theme: (th === 'light' || th === 'dark' ? th : 'auto') as Theme,
      collapsed: ls.get('eap.nav.collapsed') === '1',
      entity: ls.get('eap.entity') || '',
    });
    api.onSessionExpired(() => { useUi.getState().closeAll(); useSession.getState().toLogin({ tone: 'warn', text: t('Sesi berakhir. Silakan masuk lagi.') }); });
    (async () => {
      if (oidcEnabled()) {
        try {
          const back = await oidcHandleCallback();
          // kembali ke halaman asal: "/" sendiri mengalihkan ke menu pertama, jadi cukup mengganti URL tidak memadai — muat halaman asal
          if (lastActionStatus === 'success') ss.set('eap.notice', t('Kata sandi diperbarui.'));
          else if (lastActionStatus === 'cancelled') ss.set('eap.notice', t('Ganti kata sandi dibatalkan.'));
          if (back && back !== location.pathname && back !== '/') { location.replace(safePath(back)); return; }
        } catch (e) { return useSession.getState().toLogin({ tone: 'bad', text: (e as Error).message }); }
      }
      const loggedOut = new URLSearchParams(location.search).has('logout');
      if (loggedOut) history.replaceState(null, '', location.pathname);
      const notice = ss.get('eap.notice');
      if (notice) { ss.del('eap.notice'); setTimeout(() => toast(notice), 600); }
      if (api.token()) return startSession();
      useSession.getState().toLogin(loggedOut ? { tone: 'ok', text: t('Anda telah keluar.') } : null);
    })();
  }, []);

  if (status === 'boot') return <BootSkeleton />;
  if (status === 'login') return <LoginScreen />;
  return <>{children}</>;
}

/** Skeleton kerangka (header + menu + isi) selama sesi dipulihkan. */
function BootSkeleton() {
  return (
    <div className="shell" aria-busy="true" aria-label={t('Memuat')}>
      <header className="hdr"><Skel w={30} h={30} /><Skel w={140} h={14} /><span className="hdr-sp" /><Skel w={28} h={28} /></header>
      <aside className="nav stack">{Array.from({ length: 12 }).map((_, i) => <Skel key={i} h={22} w={`${60 + ((i * 17) % 35)}%`} />)}</aside>
      <main className="main"><div className="page"><div className="card"><div className="card-bd stack">{Array.from({ length: 10 }).map((_, i) => <Skel key={i} h={18} />)}</div></div></div></main>
    </div>
  );
}

function LoginScreen() {
  const msg = useSession((s) => s.message);
  const [err, setErr] = React.useState<string | null>(null);
  const sso = oidcEnabled();
  const tone = (x: 'ok' | 'warn' | 'bad' | 'info') => (x === 'bad' ? 'err' : x);
  return (
    <main className="login">
      <div className="card">
        <div className="brand"><span className="brand-mark">S</span><span><b>SAORAJA</b><small>Enterprise Architecture Platform</small></span></div>
        {msg ? <div className="mb"><Callout tone={tone(msg.tone)}>{msg.text}</Callout></div> : null}
        {err ? <div className="mb"><Callout tone="err">{err}</Callout></div> : null}
        {sso ? (
          <div className="stack">
            <p className="small muted">{t('Masuk dengan akun KEIS. Kata sandi dan MFA dikelola Keycloak; peran dan izin EAP ditugaskan oleh admin.')}</p>
            <Btn variant="pri" style={{ justifyContent: 'center' }} onClick={() => oidcLogin().catch((e) => setErr(e.message))}>{t('Masuk dengan Kalla SSO')}</Btn>
          </div>
        ) : (
          <Callout tone="warn">{t('Login SSO belum dikonfigurasi. EAP API tidak menyediakan login pengembangan: tambahkan ?oidc=<issuer Keycloak> pada alamat halaman, mis. ?oidc=http://localhost:8180/realms/keis')}</Callout>
        )}
      </div>
    </main>
  );
}
