import { MODULES } from '@/modules/registry';
import { MenuView } from './menu-view';

/* Ekspor statis: satu HTML per menu (/<modul>/<menu>/index.html). */
export const dynamicParams = false;
export function generateStaticParams() {
  return MODULES.flatMap((m) => m.menus.map((x) => ({ module: m.id, menu: x.id })));
}

export default async function Page({ params }: { params: Promise<{ module: string; menu: string }> }) {
  const { module, menu } = await params;
  return <MenuView mod={module} menu={menu} />;
}
