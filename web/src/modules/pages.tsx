'use client';
/* Peta workspace → berkas halaman (dimuat malas per workspace). Tiap berkas modul mengekspor default { <menuId>: Komponen }.
   Semua menu kini punya halaman; menu yang kelak belum ada di peta menampilkan halaman pengganti yang menyatakan layar belum tersedia (UI lama eap/ui sudah diarsipkan) —
   bukan data contoh. Tambahkan menu ke berkas modulnya untuk memigrasikannya. */
import * as React from 'react';
import type { ComponentType } from 'react';
import { findMenu } from './registry';
import { Callout, PageHd } from '@/components/ui';
import { t } from '@/lib/i18n';

type PageMap = Record<string, ComponentType>;
const LOADERS: Record<string, () => Promise<{ default: PageMap }>> = {
  home: () => import('./home'),
  eaw: () => import('./eaw'),
  gse: () => import('./gse'),
  req: () => import('./req'),
  console: () => import('./console'),
  set: () => import('./set'),
};

const cache = new Map<string, React.LazyExoticComponent<ComponentType>>();

function makeMissing(mod: string, menu: string): ComponentType {
  return function Missing() {
    const { menu: def } = findMenu(mod, menu);
    return (
      <>
        <PageHd title={def?.label || t('Halaman')} />
        <Callout tone="warn">{t('Layar ini belum tersedia di antarmuka EAP. API dan hak aksesnya sama.')}</Callout>
      </>
    );
  };
}

/** Komponen lazy untuk /<mod>/<menu>/. */
export function pageFor(mod: string, menu: string) {
  const key = `${mod}/${menu}`;
  let c = cache.get(key);
  if (!c) {
    c = React.lazy(async (): Promise<{ default: ComponentType }> => {
      const load = LOADERS[mod];
      if (!load) return { default: makeMissing(mod, menu) };
      const m = await load();
      return { default: m.default[menu] || makeMissing(mod, menu) };
    });
    cache.set(key, c);
  }
  return c;
}
