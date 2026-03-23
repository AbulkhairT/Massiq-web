'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { initializeSession, getProfile, getSubscription } from '../../../lib/supabase/client';

const C = {
  bg:     '#0A0D0A',
  green:  '#72B895',
  white:  '#F2F7F2',
  muted:  'rgba(242,247,242,0.52)',
};

function isPremium(sub) {
  return Boolean(sub && ['active', 'trialing'].includes(sub.status));
}

export default function BillingSuccessPage() {
  const router = useRouter();
  const [stage, setStage] = useState('auth-loading'); // auth-loading | unauthenticated | profile-loading | activating | active | delayed

  useEffect(() => {
    let cancelled = false;

    const waitForSession = async () => {
      let session = await initializeSession().catch(() => null);
      if (session?.access_token) return session;
      for (let i = 0; i < 24; i++) {
        await new Promise(r => setTimeout(r, 500));
        session = await initializeSession().catch(() => null);
        if (session?.access_token) return session;
      }
      return null;
    };

    const run = async () => {
      setStage('auth-loading');
      const session = await waitForSession();
      const token = session?.access_token;
      const userId = session?.user?.id || session?.user_id;

      if (!token || !userId) {
        if (!cancelled) {
          setStage('unauthenticated');
          try {
            sessionStorage.setItem('massiq:premium-return', '1');
            sessionStorage.removeItem('massiq:billing-return');
          } catch {}
        }
        return;
      }

      if (!cancelled) setStage('profile-loading');
      await getProfile(token, userId).catch(() => null);

      if (!cancelled) setStage('activating');
      for (let i = 0; i < 12 && !cancelled; i++) {
        const sub = await getSubscription(token, userId).catch(() => null);
        if (isPremium(sub)) {
          if (!cancelled) {
            try {
              sessionStorage.setItem('massiq:premium-return', '1');
              sessionStorage.removeItem('massiq:billing-return');
            } catch {}
            setStage('active');
            setTimeout(() => router.replace('/app?premium_activated=1'), 250);
          }
          return;
        }
        if (i < 11) await new Promise(r => setTimeout(r, 2500));
      }

      if (!cancelled) setStage('delayed');
    };

    run();
    return () => { cancelled = true; };
  }, [router]);

  const goToApp = () => {
    try {
      sessionStorage.setItem('massiq:premium-return', '1');
      sessionStorage.removeItem('massiq:billing-return');
    } catch {}
    router.replace('/app?premium_activated=1');
  };

  return (
    <div style={{
      minHeight: '100dvh', background: C.bg, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        {(stage === 'auth-loading' || stage === 'profile-loading' || stage === 'activating') && (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', border: `2px solid ${C.green}`,
              borderTopColor: 'transparent', animation: 'spin .9s linear infinite',
              margin: '0 auto 24px',
            }} />
            <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 8 }}>
              Activating premium...
            </div>
            <div style={{ fontSize: 14, color: C.muted }}>
              Confirming your session and subscription.
            </div>
          </>
        )}

        {stage === 'active' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 8 }}>
              Premium is active.
            </div>
            <div style={{ fontSize: 14, color: C.muted }}>
              Redirecting back to your app...
            </div>
          </>
        )}

        {stage === 'delayed' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 10 }}>
              Payment successful
            </div>
            <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 28 }}>
              Premium activation is still syncing. Open the app and it will continue checking.
            </div>
            <button
              onClick={goToApp}
              style={{
                background: C.green, color: '#0A0D0A', border: 'none',
                padding: '14px 32px', borderRadius: 99, fontSize: 15, fontWeight: 800,
                cursor: 'pointer', width: '100%',
              }}
            >
              Open MassIQ
            </button>
          </>
        )}

        {stage === 'unauthenticated' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 10 }}>
              Payment successful
            </div>
            <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 28 }}>
              Sign in with the same account you used to purchase. Premium will activate once you&apos;re back in the app.
            </div>
            <button
              onClick={() => router.replace('/app?premium_activated=1')}
              style={{
                background: C.green, color: '#0A0D0A', border: 'none',
                padding: '14px 32px', borderRadius: 99, fontSize: 15, fontWeight: 800,
                cursor: 'pointer', width: '100%',
              }}
            >
              Continue to sign in
            </button>
          </>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
