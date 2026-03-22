'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const C = {
  bg:     '#0A0D0A',
  card:   '#131713',
  green:  '#72B895',
  white:  '#F2F7F2',
  muted:  'rgba(242,247,242,0.52)',
  dimmed: 'rgba(242,247,242,0.28)',
  border: 'rgba(255,255,255,0.08)',
};

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Check subscription using the user's own token (fast path). */
async function checkWithToken(token, userId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=status&order=updated_at.desc&limit=5`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
    );
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) return false;
    const best = rows.find(r => r.status === 'active' || r.status === 'trialing') || rows[0];
    return ['active', 'trialing'].includes(best.status);
  } catch {
    return false;
  }
}

/** Check subscription server-side using the Stripe session_id — no user token needed. */
async function checkWithStripeSession(stripeSessionId) {
  try {
    const res = await fetch(`/api/stripe/verify?session_id=${encodeURIComponent(stripeSessionId)}`);
    if (!res.ok) return { isPremium: false };
    return await res.json();
  } catch {
    return { isPremium: false };
  }
}

function getStoredSession() {
  try {
    return JSON.parse(localStorage.getItem('massiq:auth:session') || 'null');
  } catch {
    return null;
  }
}

function CheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
      stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PremiumSuccessInner() {
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const stripeSession = searchParams.get('session_id');
  const [state, setState] = useState('checking');
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const poll = async () => {
      // ── Fast path: localStorage has a valid session ──────────────────────
      const stored = getStoredSession();
      const token  = stored?.access_token;
      const userId = stored?.user?.id || stored?.user_id;

      if (token && userId) {
        for (let attempt = 0; attempt < 8 && !cancelledRef.current; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
          const isPremium = await checkWithToken(token, userId);
          if (isPremium) { if (!cancelledRef.current) setState('active'); return; }
        }
        // Timed out — webhook may still be in-flight
        if (!cancelledRef.current) setState('syncing');
        return;
      }

      // ── Fallback: no localStorage session (mobile Safari ITP, incognito, etc.) ─
      // Use the Stripe checkout session_id that Stripe puts in the return URL.
      if (stripeSession) {
        for (let attempt = 0; attempt < 8 && !cancelledRef.current; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
          const { isPremium } = await checkWithStripeSession(stripeSession);
          if (isPremium) { if (!cancelledRef.current) setState('active'); return; }
        }
        // Payment went through but webhook is still syncing — show soft state
        if (!cancelledRef.current) setState('syncing');
        return;
      }

      // No session at all and no Stripe session_id in URL — log in required
      if (!cancelledRef.current) setState('noSession');
    };

    poll();
    return () => { cancelledRef.current = true; };
  }, [stripeSession]);

  const goToApp = () => {
    try { sessionStorage.setItem('massiq:premium-return', '1'); } catch {}
    router.push('/app');
  };

  const btnStyle = {
    background: C.green, color: '#0A0D0A', border: 'none',
    padding: '14px 32px', borderRadius: 99, fontSize: 15, fontWeight: 800,
    cursor: 'pointer', width: '100%',
  };

  return (
    <div style={{
      minHeight: '100dvh', background: C.bg, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 24,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>

        {state === 'checking' && (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              border: `2px solid ${C.green}`, borderTopColor: 'transparent',
              animation: 'spin .9s linear infinite', margin: '0 auto 24px',
            }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: C.white }}>Confirming your subscription…</div>
            <div style={{ fontSize: 14, color: C.muted, marginTop: 8 }}>This only takes a moment.</div>
          </>
        )}

        {state === 'active' && (
          <>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: '#1A2E1F',
              border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 24px',
            }}>
              <CheckIcon />
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.white, marginBottom: 10 }}>
              Premium is active.
            </div>
            <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.6, marginBottom: 32 }}>
              Your account is now upgraded. Every scan powers a real body recomposition plan — adaptive macros, trend analysis, and goal projections.
            </div>
            <button onClick={goToApp} style={btnStyle}>Go to MassIQ →</button>
          </>
        )}

        {state === 'syncing' && (
          <>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: '#1A2E1F',
              border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 24px',
            }}>
              <CheckIcon />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 10 }}>
              Payment received.
            </div>
            <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 32 }}>
              Premium access is syncing and will be active within a minute. You can open the app now — it will reflect shortly.
            </div>
            <button onClick={goToApp} style={btnStyle}>Open app</button>
          </>
        )}

        {state === 'noSession' && (
          <>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: '#1A2E1F',
              border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 24px',
            }}>
              <CheckIcon />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 10 }}>
              Payment complete.
            </div>
            <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 32 }}>
              Log back in to activate your premium access — your subscription is ready.
            </div>
            <button onClick={goToApp} style={btnStyle}>Log in to MassIQ</button>
          </>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

export default function PremiumSuccessPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100dvh', background: '#0A0D0A', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          border: '2px solid #72B895', borderTopColor: 'transparent',
          animation: 'spin .9s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <PremiumSuccessInner />
    </Suspense>
  );
}
