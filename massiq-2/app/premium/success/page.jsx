'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const C = {
  bg:     '#0A0D0A',
  card:   '#131713',
  green:  '#72B895',
  white:  '#F2F7F2',
  muted:  'rgba(242,247,242,0.52)',
  dimmed: 'rgba(242,247,242,0.28)',
  border: 'rgba(255,255,255,0.08)',
};

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function checkSubscription(token, userId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=status&order=updated_at.desc&limit=5`,
      {
        headers: {
          apikey:        SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) return false;
    const best = rows.find(r => r.status === 'active' || r.status === 'trialing') || rows[0];
    return ['active', 'trialing'].includes(best.status);
  } catch {
    return false;
  }
}

function getStoredSession() {
  try {
    return JSON.parse(localStorage.getItem('massiq:auth:session') || 'null');
  } catch {
    return null;
  }
}

export default function PremiumSuccessPage() {
  const router = useRouter();
  const [state, setState] = useState('checking'); // checking | active | syncing | error

  useEffect(() => {
    let cancelled = false;
    let attempts  = 0;

    const poll = async () => {
      const session = getStoredSession();
      const token   = session?.access_token;
      const userId  = session?.user?.id || session?.user_id;

      if (!token || !userId) {
        // Session was lost during Stripe redirect (common on mobile browsers
        // or when cross-origin isolation clears localStorage).
        // Show a friendly message that redirects to the app where they can
        // log in. The app will detect the subscription on next hydration.
        console.warn('[premium-success] No session found — user will need to log back in');
        if (!cancelled) setState('syncing');
        return;
      }

      while (attempts < 12 && !cancelled) {
        attempts++;
        const isPremium = await checkSubscription(token, userId);
        if (isPremium) {
          if (!cancelled) setState('active');
          return;
        }
        if (attempts < 12) await new Promise(r => setTimeout(r, 2500));
      }

      if (!cancelled) setState('syncing');
    };

    poll();
    return () => { cancelled = true; };
  }, []);

  const goToApp = () => router.push('/app?premium_activated=1');

  return (
    <div style={{
      minHeight: '100dvh', background: C.bg, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>

        {state === 'checking' && (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', border: `2px solid ${C.green}`,
              borderTopColor: 'transparent', animation: 'spin .9s linear infinite',
              margin: '0 auto 24px',
            }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: C.white }}>Confirming your subscription…</div>
            <div style={{ fontSize: 14, color: C.muted, marginTop: 8 }}>This only takes a moment.</div>
          </>
        )}

        {state === 'active' && (
          <>
            <div style={{
              width: 60, height: 60, borderRadius: '50%', background: '#1A2E1F',
              border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 24px', fontSize: 28,
            }}>✓</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.white, marginBottom: 10 }}>
              Premium is active.
            </div>
            <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.6, marginBottom: 32 }}>
              Your account is now upgraded. Every scan now powers a real body recomposition plan — adaptive macros, trend analysis, and goal projections.
            </div>
            <button
              onClick={goToApp}
              style={{
                background: C.green, color: '#0A0D0A', border: 'none',
                padding: '14px 32px', borderRadius: 99, fontSize: 15, fontWeight: 800,
                cursor: 'pointer', width: '100%',
              }}
            >
              Go to MassIQ →
            </button>
          </>
        )}

        {state === 'syncing' && (
          <>
            <div style={{
              width: 60, height: 60, borderRadius: '50%', background: '#1A2E1F',
              border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 24px', fontSize: 28,
            }}>✓</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 10 }}>
              Payment successful
            </div>
            <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 32 }}>
              Your premium access is activating. Open the app to continue — it may take up to a minute for your subscription to sync.
            </div>
            <button
              onClick={goToApp}
              style={{
                background: C.green, color: '#0A0D0A', border: 'none',
                padding: '14px 32px', borderRadius: 99, fontSize: 15, fontWeight: 800,
                cursor: 'pointer', width: '100%',
              }}
            >
              Open MassIQ →
            </button>
          </>
        )}

        {state === 'error' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 10 }}>
              Payment received
            </div>
            <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 32 }}>
              Your payment was successful. Log back in and your premium access will be ready.
            </div>
            <button
              onClick={goToApp}
              style={{
                background: C.green, color: '#0A0D0A', border: 'none',
                padding: '14px 32px', borderRadius: 99, fontSize: 15, fontWeight: 800,
                cursor: 'pointer', width: '100%',
              }}
            >
              Open MassIQ →
            </button>
          </>
        )}

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  );
}
