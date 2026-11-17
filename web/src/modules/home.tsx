'use client';
/* Ringkasan akun: peran, izin dan cakupan entitas + pintasan ke menu yang boleh dibuka. Akun baru TANPA peran sampai admin menugaskannya
   (POST /api/v1/set/user-roles) — halaman ini menjelaskan keadaan itu alih-alih menampilkan menu kosong. */
import * as React from 'react';
import Link from 'next/link';
import { useSession } from '@/store/session';
import { Callout, Card, DL, PageHd, Tag } from '@/components/ui';
import { MODULES, visibleMenus } from './registry';
import { t } from '@/lib/i18n';

function Overview() {
  const me = useSession((s) => s.me);
  if (!me) return null;
  const mods = MODULES.filter((m) => !m.hidden && visibleMenus(m).length);
  return (
    <>
      <PageHd title={t('Ringkasan akun')} sub={t('Peran dan cakupan akses Anda di EAP.')} />
      {!me.roles.length ? (
        <div className="mb"><Callout tone="warn">{t('Akun Anda belum memiliki peran EAP, sehingga belum ada menu yang dapat dibuka. Minta admin EAP menugaskan peran di Settings › Akun Pengguna.')}</Callout></div>
      ) : null}
      <div className="grid g2">
        <Card title={t('Akun')}>
          <DL pairs={[
            [t('Nama tampilan'), me.displayName || '—'],
            [t('Nama pengguna'), <span key="u" className="mono">{me.username}</span>],
            [t('Peran'), me.roles.length ? <span key="r" className="row" style={{ gap: 4 }}>{me.roles.map((r) => <Tag key={r}>{r}</Tag>)}</span> : t('tanpa peran')],
            [t('Izin'), me.permissions.length],
            [t('Lihat entitas'), me.scope.viewAll ? t('semua entitas') : t('hanya entitas yang ditugaskan')],
            [t('Ubah entitas'), me.scope.editAll ? t('semua entitas') : me.scope.editEntityCodes.length ? <span key="e" className="row" style={{ gap: 4 }}>{me.scope.editEntityCodes.map((c) => <Tag key={c}>{c}</Tag>)}</span> : '—'],
          ]} />
        </Card>
        {mods.length ? (
          <Card title={t('Menu yang dapat dibuka')}>
            <div className="stack">
              {mods.map((m) => (
                <div key={m.id}>
                  <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, marginBottom: 4 }}>{m.code} · {m.title}</div>
                  <div className="chips">{visibleMenus(m).map((x) => <Link key={x.id} href={`/${m.id}/${x.id}/`} className="chip">{x.label}</Link>)}</div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}

export default { overview: Overview };
