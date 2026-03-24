'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PremiumSuccessPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/billing/success');
  }, [router]);
  return null;
}
