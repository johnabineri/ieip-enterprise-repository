'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { findMenu, firstRoute } from '@/modules/registry';
import { pageFor } from '@/modules/pages';
import { Btn, Callout, PageSkeleton } from '@/components/ui';
import { t } from '@/lib/i18n';

class Boundary extends React.Component<{ children: React.ReactNode; k: string }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidUpdate(p: { k: string }) { if (p.k !== this.props.k && this.state.err) this.setState({ err: null }); }
  render() {
    if (this.state.err) return <Callout tone="err">{t('Halaman gagal ditampilkan:')}{' '}{this.state.err.message} <Btn sm onClick={() => this.setState({ err: null })}>{t('Coba lagi')}</Btn></Callout>;
    return this.props.children;
  }
}

/** Menampilkan halaman menu bila pengguna berhak; selain itu dialihkan ke menu pertama yang boleh. */
export function MenuView({ mod, menu }: { mod: string; menu: string }) {
  const router = useRouter();
  const { menu: def } = findMenu(mod, menu);
  const allowed = !!def && (!def.show || def.show());
  React.useEffect(() => { if (!allowed) router.replace(firstRoute()); }, [allowed, router]);
  if (!allowed) return <PageSkeleton />;
  const Page = pageFor(mod, menu);
  return (
    <Boundary k={`${mod}/${menu}`}>
      <React.Suspense fallback={<PageSkeleton />}><Page /></React.Suspense>
    </Boundary>
  );
}
