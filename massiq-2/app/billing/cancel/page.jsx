'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BillingCancelPage() {
  const router = useRouter();

  useEffect(() => {
    try { sessionStorage.removeItem('massiq:billing-return'); } catch {}
    const t = setTimeout(() => router.replace('/app'), 300);
    return () => clearTimeout(t);
  }, [router]);

  return null;
}
