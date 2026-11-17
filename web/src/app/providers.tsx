'use client';
import * as React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query';
import { AuthGate } from '@/components/auth-gate';
import { AppShell } from '@/components/app-shell';
import { LayerHost } from '@/components/overlay';
import { useUi } from '@/store/ui';
import { cx } from '@/lib/utils';

/** Akar tampilan: SEMUA gaya mockup (eap.css) dilingkup .eap-root — tema (data-theme) dan lipat menu (nav-collapsed) dipasang di elemen ini, bukan di <html>/<body>. */
export function Providers({ children }: { children: React.ReactNode }) {
  const theme = useUi((s) => s.theme);
  const collapsed = useUi((s) => s.collapsed);
  return (
    <QueryClientProvider client={queryClient}>
      <div className={cx('eap-root', collapsed && 'nav-collapsed')} data-theme={theme === 'auto' ? undefined : theme} suppressHydrationWarning>
        <AuthGate>
          <AppShell>{children}</AppShell>
        </AuthGate>
        <LayerHost />
      </div>
    </QueryClientProvider>
  );
}
