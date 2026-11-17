'use client';
/* Kerangka aplikasi = mockup eap/ui (index.html + renderHeader/renderNav di app.js), markup & kelas SAMA:
   .shell > header.hdr (menu-toggle, brand, ws-tabs, pencarian, entity-sel, avatar) + aside.nav (nav-ws, nav-group, a>num+lbl, nav-foot) + main.main > .page > .crumb.
   Lonceng notifikasi (notifications.tsx → set.notification) dan MIND Copilot (copilot.tsx → /console/mind) memakai data/backend NYATA, bukan data contoh. */
import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LANGS, lang, setLang, t } from '@/lib/i18n';
import { apiBase } from '@/lib/config';
import { oidcAccountUrl, oidcEnabled } from '@/lib/oidc';
import { useLookup } from '@/lib/query';
import { useSession } from '@/store/session';
import { useUi, type Theme } from '@/store/ui';
import { DL, Tag } from '@/components/ui';
import { PanelLeft, Search } from 'lucide-react';
import { MenuIcon } from './menu-icons';
import { cx } from '@/lib/utils';
import { MODULES, visibleMenus, visibleModules } from '@/modules/registry';
import { logout } from './auth-gate';
import { BellButton, NotifPop } from './notifications';
import { changePassword } from './auth-actions';

const parse = (path: string) => { const [mod, menu] = path.replace(/^\/+/, '').split('/'); return { mod, menu }; };
const initials = (s: string) => s.split(/[\s.]+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { mod, menu } = parse(pathname);
  const m = MODULES.find((x) => x.id === mod);
  const mn = m?.menus.find((x) => x.id === menu);
  const { mobileNav, setMobileNav, toggleNav, setCmdk, collapsed } = useUi();
  const me = useSession((s) => s.me);

  React.useEffect(() => { setMobileNav(false); useUi.setState({ pop: null }); }, [pathname, setMobileNav]);
  React.useEffect(() => { document.title = `${mn ? mn.label : m?.code || 'EAP'} · SAORAJA EAP`; }, [m, mn]);
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdk(true); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [setCmdk]);

  return (
    <>
      <div className="shell">
        <a className="sr" href="#main">{t('Lewati ke konten')}</a>
        <Header />
        <aside className={cx('nav', mobileNav && 'on')} id="nav" aria-label={t('Navigasi workspace')}>{me ? <NavPanel mod={mod} menu={menu} /> : null}</aside>
        <main className="main" id="main" tabIndex={-1} data-collapsed={collapsed || undefined}>
          <div className="page">
            <div className="crumb"><span>SAORAJA</span>{m && !m.hidden ? <span>{m.code}</span> : null}{mn ? <span>{mn.label}</span> : null}</div>
            {children}
          </div>
        </main>
      </div>
      <UserPop />
      <NotifPop />
      <Cmdk />
    </>
  );
}

function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { mod } = parse(pathname);
  const me = useSession((s) => s.me);
  const { toggleNav, setCmdk, setPop, entity, setEntity, collapsed, mobileNav } = useUi();
  const mods = React.useMemo(() => (me ? visibleModules().filter((x) => !x.hidden) : []), [me]);
  const ents = useLookup('entities');
  const name = me?.displayName || me?.username || '';
  return (
    <header className="hdr">
      <Link className="brand" href="/eaw/dashboard/" aria-label={t('SAORAJA beranda')}>
        <span className="brand-mark">S</span>
        <span className="brand-txt"><b>SAORAJA</b><small>Enterprise Architecture Platform</small></span>
      </Link>
      <button type="button" className="hdr-btn menu-toggle" aria-label={t('Lipat atau buka menu samping')} title={t('Lipat atau buka menu samping')} aria-expanded={!collapsed || mobileNav} onClick={toggleNav}><PanelLeft size={18} strokeWidth={1.9} aria-hidden="true" /></button>
      <nav className="ws-tabs" aria-label="Workspace">
        {mods.map((x) => (
          <button key={x.id} type="button" className={cx('ws-tab', x.id === mod && 'on')} onClick={() => router.push(`/${x.id}/${visibleMenus(x)[0].id}/`)}>
            {x.code}<span className="mode">{x.mode}</span>
          </button>
        ))}
      </nav>
      <span className="hdr-sp" />
      <button type="button" className="hdr-btn search-btn" onClick={() => setCmdk(true)} aria-label={t('Pencarian global')}><Search size={15} strokeWidth={2} aria-hidden="true" /> <span>{t('Cari menu…')}</span><kbd>Ctrl K</kbd></button>
      <select className="entity-sel" aria-label={t('Konteks entitas')} value={entity} title={t('Saring daftar menurut entitas (aplikasi, objek domain, ARB)')} onChange={(e) => setEntity(e.target.value)}>
        <option value="">{t('Semua entitas')}</option>
        {ents.rows.filter((e) => e.groupKind !== 'business_unit').map((e) => <option key={e.id} value={e.id}>{e.groupKind === 'holding' ? '' : e.groupKind === 'ecosystem' ? '— ' : '—— '}{e.name}</option>)}
      </select>
      <BellButton />
      <button type="button" className="hdr-btn lang-btn" aria-label={t('Bahasa')} title={t('Bahasa')} onClick={() => setLang(lang === 'en' ? 'id' : 'en')}><b className={lang === 'en' ? 'on' : ''}>EN</b>/<b className={lang === 'id' ? 'on' : ''}>ID</b></button>
      <button type="button" className="hdr-btn" aria-label={t('Profil pengguna')} onClick={() => setPop('user')} style={{ padding: '0 4px' }}><span className="avatar">{initials(name)}</span></button>
    </header>
  );
}

function NavPanel({ mod, menu }: { mod: string; menu: string }) {
  const m = MODULES.find((x) => x.id === mod && !x.hidden) || null;
  const me = useSession((s) => s.me);
  if (!m) return <div className="nav-foot"><b>{t('Peran aktif')}</b><br />{(me?.roles || []).join(', ') || t('tanpa peran')}</div>;
  const menus = visibleMenus(m);
  let last: string | undefined;
  return (
    <>
      <div className="nav-ws">
        <span className="code">{m.code} · {m.mode === 'MF 2.0' ? 'FEDERATED_REMOTE' : 'INTERNAL_ROUTED'} · :{m.port}</span>
        <h2>{m.title}</h2><p>{m.desc}</p>
      </div>
      {menus.map((x) => {
        const head = x.group && x.group !== last ? x.group : null; last = x.group;
        return (
          <React.Fragment key={x.id}>
            {head ? <div className="nav-group">{head}</div> : null}
            <Link href={`/${m.id}/${x.id}/`} className={x.id === menu ? 'on' : ''} title={x.label} aria-current={x.id === menu ? 'page' : undefined}>
              <span className="ic"><MenuIcon mod={m.id} menu={x.id} /></span><span className="lbl">{x.label}</span>
            </Link>
          </React.Fragment>
        );
      })}
      <div className="nav-foot"><b>{t('Peran aktif')}</b><br />{(me?.roles || []).join(', ') || t('tanpa peran')}<br /><span className="tiny mono">{me?.username}</span></div>
    </>
  );
}

function UserPop() {
  const { pop, theme, setTheme, closeAll } = useUi();
  const me = useSession((s) => s.me);
  if (!me) return null;
  const name = me.displayName || me.username;
  const sso = oidcEnabled();
  const TH: [Theme, string][] = [['auto', t('Sistem')], ['light', t('Terang')], ['dark', t('Gelap')]];
  return (
    <div className={cx('pop', pop === 'user' && 'on')} role="dialog" aria-label={t('Profil pengguna')}>
      <div className="card-bd">
        <div className="row"><span className="avatar" style={{ width: 40, height: 40 }}>{initials(name)}</span><div><b>{name}</b><div className="tiny muted mono">{me.username}</div></div></div>
        <DL className="mt" pairs={[
          [t('Peran'), me.roles.length ? <span key="r" className="row" style={{ gap: 4 }}>{me.roles.map((r) => <Tag key={r}>{r}</Tag>)}</span> : t('tanpa peran')],
          [t('Izin'), me.permissions.length],
          [t('Lihat'), me.scope.viewAll ? t('semua entitas') : t('entitas yang ditugaskan')],
          [t('Ubah'), me.scope.editAll ? t('semua entitas') : me.scope.editEntityCodes.length ? me.scope.editEntityCodes.join(', ') : '—'],
          ['API', <span key="a" className="mono tiny">{apiBase()}</span>],
        ]} />
        <div className="field mt"><label>{t('Tema')}</label><div className="chips">{TH.map(([k, l]) => <button key={k} type="button" className={cx('chip', theme === k && 'on')} onClick={() => setTheme(k)}>{l}</button>)}</div></div>
        <div className="field mt"><label>{t('Bahasa')}</label><div className="chips">{LANGS.map(([k, l]) => <button key={k} type="button" className={cx('chip', lang === k && 'on')} onClick={() => k !== lang && setLang(k)}>{l}</button>)}</div></div>
        <div className="row mt">
          <Link className="btn sm" href="/home/overview/" onClick={closeAll}>{t('Ringkasan akun')}</Link>
          {sso ? <button type="button" className="btn sm" onClick={() => changePassword()}>{t('Ganti kata sandi')}</button> : null}
          {sso ? <a className="btn sm" href={oidcAccountUrl()} target="_blank" rel="noreferrer">{t('Konsol akun')}</a> : null}
          <button type="button" className="btn sm right" onClick={logout}>{t('Keluar')}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- palet perintah (Ctrl K) — mockup: .cmdk; sumber = menu yang boleh dibuka ---------- */
function Cmdk() {
  const router = useRouter();
  const { cmdk, setCmdk } = useUi();
  const me = useSession((s) => s.me);
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const items = React.useMemo(() => {
    if (!me) return [];
    const all = visibleModules().filter((x) => !x.hidden).flatMap((x) => visibleMenus(x).map((y) => ({ ty: x.code, label: y.label, sub: y.group || '', go: `/${x.id}/${y.id}/` })));
    const s = q.trim().toLowerCase();
    return (s ? all.filter((i) => `${i.label} ${i.ty} ${i.sub}`.toLowerCase().includes(s)) : all.slice(0, 10)).slice(0, 40);
  }, [q, me, cmdk]);
  React.useEffect(() => { if (cmdk) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [cmdk]);
  React.useEffect(() => { setSel(0); }, [q]);
  const go = (i: number) => { const it = items[i]; if (it) { setCmdk(false); router.push(it.go); } };
  if (!cmdk) return null;
  return (
    <>
      <div className="overlay on" onClick={() => setCmdk(false)} />
      <div className="cmdk on" role="dialog" aria-label={t('Pencarian global')}>
        <input ref={inputRef} value={q} placeholder={t('Cari menu…')} autoComplete="off" onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
            else if (e.key === 'Enter') go(sel); else if (e.key === 'Escape') setCmdk(false);
          }} />
        <div className="cmdk-list">
          <div className="cmdk-sec">{t('Navigasi')}</div>
          {items.length ? items.map((i, k) => (
            <div key={i.go} className={cx('cmdk-item', k === sel && 'sel')} onMouseEnter={() => setSel(k)} onClick={() => go(k)}>
              <span className="ty">{i.ty}</span><span>{i.label}</span><span className="muted small" style={{ marginLeft: 'auto' }}>{i.sub}</span>
            </div>
          )) : <div className="empty">{t('Tidak ada hasil.')}</div>}
        </div>
        <div className="cmdk-ft"><span>{t('↑↓ navigasi')}</span><span>{t('↵ buka')}</span><span>{t('esc tutup')}</span></div>
      </div>
    </>
  );
}
