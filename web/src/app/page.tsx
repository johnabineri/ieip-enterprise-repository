'use client';
/* "/" — arahkan ke menu pertama yang boleh dibuka (juga titik kembali OIDC). */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { firstRoute } from '@/modules/registry';
import { PageSkeleton } from '@/components/ui';

export default function Index() {
  const router = useRouter();
  React.useEffect(() => { router.replace(firstRoute()); }, [router]);
  return <PageSkeleton />;
}
