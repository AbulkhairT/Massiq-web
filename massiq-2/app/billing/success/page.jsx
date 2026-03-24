'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function BillingSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const target = sessionId ? `/app?checkout_success=1&session_id=${encodeURIComponent(sessionId)}` : '/app';
    router.replace(target);
  }, [router, searchParams]);

  return (
    <div style={{
      minHeight: '100dvh', background: '#0A0D0A', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', border: '2px solid #72B895', borderTopColor: 'transparent', animation: 'spin .9s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/**
 * Legacy /billing/success — redirects to /app with checkout params.
 * New checkouts go directly to /app?checkout_success=1&session_id=...
 */
export default function BillingSuccessPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100dvh', background: '#0A0D0A', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', border: '2px solid #72B895', borderTopColor: 'transparent', animation: 'spin .9s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <BillingSuccessContent />
    </Suspense>
  );
}
