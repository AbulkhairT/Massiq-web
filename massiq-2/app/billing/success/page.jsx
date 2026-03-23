'use client';

/**
 * /billing/success — dedicated return page after Stripe Checkout.
 *
 * This page is the ONLY place that handles the post-checkout return.
 * It does NOT dump the user to /app and hope the boot logic handles it.
 * It explicitly:
 *  1. Restores the auth session (with retry on transient errors)
 *  2. Polls for subscription activation (webhook may be delayed)
 *  3. Navigates to /app ONLY after confirming state is ready
 *  4. Shows a graceful fallback if session is truly gone (mobile Safari ITP)
 */

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
  red:    '#ef4444',
};

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const AUTH_KEY          = 'massiq:auth:session';

/* ── Auth helpers ──────────────────────────────────────────────────────────── */

function getStoredSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch { return null; }
}

function storeSession(s) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(s)); } catch {}
}

/**
 * Attempt to refresh the Supabase JWT.
 * Returns the refreshed session on success, null if the refresh token is invalid,
 * or throws for transient network errors (caller should fall back to stored session).
 */
async function tryRefreshSession(refreshToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method:  'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = String(data?.error_description || data?.message || '').toLowerCase();
    const isAuthFailure = /invalid|not found|refresh token|expired/i.test(msg);
    if (isAuthFailure) return null; // Token is genuinely bad — user must log in
    throw new Error(`refresh_failed:${res.status}`); // Transient — caller falls back
  }
  if (data?.access_token) storeSession(data);
  return data;
}

/**
 * Restore a valid session:
 * 1. Try stored session
 * 2. If expiring soon, refresh it
 * 3. If refresh fails transiently, use the stored session anyway
 * 4. If refresh token is definitively bad, return null
 */
async function resolveSession() {
  const stored = getStoredSession();
  if (!stored?.access_token) return null;

  const expiresAt = Number(stored.expires_at || 0);
  const now       = Math.floor(Date.now() / 1000);
  const needsRefresh = expiresAt && (expiresAt - now) < 300; // refresh if <5 min left

  if (needsRefresh && stored.refresh_token) {
    try {
      const refreshed = await tryRefreshSession(stored.refresh_token);
      // null = definitively invalid token; use null so caller shows login
      if (refreshed === null) return null;
      return refreshed;
    } catch {
      // Transient network/server error — fall back to stored session.
      // The app will re-try the refresh on its own boot cycle.
      console.warn('[billing/success] token refresh failed transiently — using cached session');
      return stored;
    }
  }

  return stored;
}

/* ── Subscription check helpers ───────────────────────────────────────────── */

async function checkSubscriptionWithToken(token, userId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=status&order=updated_at.desc&limit=5`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
    );
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) return false;
    const best = rows.find(r => r.status === 'active' || r.status === 'trialing') || rows[0];
    return ['active', 'trialing'].includes(best.status);
  } catch { return false; }
}

async function checkSubscriptionWithStripeSession(stripeSessionId) {
  try {
    const res = await fetch(`/api/stripe/verify?session_id=${encodeURIComponent(stripeSessionId)}`);
    if (!res.ok) return { isPremium: false };
    return await res.json();
  } catch { return { isPremium: false }; }
}

/* ── UI atoms ──────────────────────────────────────────────────────────────── */

function Spinner() {
  return (
    <div style={{
      width: 52, height: 52, borderRadius: '50%',
      border: `2px solid ${C.green}`, borderTopColor: 'transparent',
      animation: 'spin .9s linear infinite', margin: '0 auto 24px',
    }} />
  );
}

function CheckCircle() {
  return (
    <div style={{
      width: 64, height: 64, borderRadius: '50%', background: '#1A2E1F',
      border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center',
      justifyContent: 'center', margin: '0 auto 24px',
    }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
        stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  );
}

/* ── State machine ─────────────────────────────────────────────────────────
 * boot        — loading auth session
 * polling     — session found, waiting for webhook to confirm subscription
 * activated   — subscription is active, navigating to app
 * delayed     — payment confirmed but webhook delayed (>20s)
 * no_session  — no valid session found; show login CTA
 * ──────────────────────────────────────────────────────────────────────── */

function BillingSuccessInner() {
  const router          = useRouter();
  const searchParams    = useSearchParams();
  const stripeSessionId = searchParams.get('session_id');
  const [phase, setPhase] = useState('boot');
  const cancelRef       = useRef(false);
  const sessionRef      = useRef(null); // holds resolved session for manual retry

  useEffect(() => {
    cancelRef.current = false;

    const run = async () => {
      // ── Step 1: Restore auth session ─────────────────────────────────────
      let session = null;
      try { session = await resolveSession(); } catch { /* ignore */ }

      if (!session?.access_token) {
        // No local session — verify payment server-side then ask user to log in
        if (stripeSessionId) {
          const { isPremium } = await checkSubscriptionWithStripeSession(stripeSessionId);
          if (isPremium && !cancelRef.current) { setPhase('no_session'); return; }
        }
        if (!cancelRef.current) setPhase('no_session');
        return;
      }

      sessionRef.current = session;
      const userId = session.user?.id || session.user_id;
      if (!cancelRef.current) setPhase('polling');

      // ── Step 2: Poll for subscription (up to ~20s) ───────────────────────
      for (let i = 0; i < 10 && !cancelRef.current; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 2000));
        const active = await checkSubscriptionWithToken(session.access_token, userId);
        if (active) {
          if (!cancelRef.current) {
            setPhase('activated');
            // Give the user a moment to read the success state
            setTimeout(() => {
              try { sessionStorage.setItem('massiq:premium-return', '1'); } catch {}
              router.push('/app');
            }, 1800);
          }
          return;
        }
      }

      // Timed out — payment went through but webhook hasn't synced yet
      if (!cancelRef.current) setPhase('delayed');
    };

    run();
    return () => { cancelRef.current = true; };
  }, [stripeSessionId, router]);

  const goToApp = () => {
    try { sessionStorage.setItem('massiq:premium-return', '1'); } catch {}
    router.push('/app');
  };

  // Manual "Check again" — re-runs polling with current session
  const checkAgain = async () => {
    const session = sessionRef.current || getStoredSession();
    if (!session?.access_token) { setPhase('no_session'); return; }
    setPhase('polling');
    cancelRef.current = false;
    const userId = session.user?.id || session.user_id;
    for (let i = 0; i < 5 && !cancelRef.current; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 2000));
      const active = await checkSubscriptionWithToken(session.access_token, userId);
      if (active) {
        setPhase('activated');
        setTimeout(() => {
          try { sessionStorage.setItem('massiq:premium-return', '1'); } catch {}
          router.push('/app');
        }, 1500);
        return;
      }
    }
    setPhase('delayed');
  };

  const btnPrimary = {
    background: C.green, color: '#0A0D0A', border: 'none',
    padding: '14px 32px', borderRadius: 99, fontSize: 15, fontWeight: 800,
    cursor: 'pointer', width: '100%',
  };
  const btnSecondary = {
    background: 'rgba(255,255,255,0.06)', color: C.muted, border: `1px solid ${C.border}`,
    padding: '12px 24px', borderRadius: 99, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', marginTop: 10, width: '100%',
  };

  return (
    <div style={{
      minHeight: '100dvh', background: C.bg, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 24,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>

        {/* boot / polling ─────────────────────────────────────────────── */}
        {(phase === 'boot' || phase === 'polling') && (
          <>
            <Spinner />
            <div style={{ fontSize: 18, fontWeight: 700, color: C.white }}>
              {phase === 'boot' ? 'Restoring your session…' : 'Activating premium…'}
            </div>
            <div style={{ fontSize: 14, color: C.muted, marginTop: 8 }}>
              {phase === 'boot' ? 'Just a moment.' : 'Confirming your subscription. This usually takes a few seconds.'}
            </div>
          </>
        )}

        {/* activated ──────────────────────────────────────────────────── */}
        {phase === 'activated' && (
          <>
            <CheckCircle />
            <div style={{ fontSize: 24, fontWeight: 800, color: C.white, marginBottom: 10 }}>
              Premium is active.
            </div>
            <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.6 }}>
              Taking you back to the app…
            </div>
          </>
        )}

        {/* delayed ────────────────────────────────────────────────────── */}
        {phase === 'delayed' && (
          <>
            <CheckCircle />
            <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 10 }}>
              Payment received.
            </div>
            <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 28 }}>
              Your subscription is syncing and will be active within a minute. You can open the app now — premium will reflect shortly.
            </div>
            <button onClick={checkAgain} style={btnPrimary}>Check again</button>
            <button onClick={goToApp} style={btnSecondary}>Open app</button>
          </>
        )}

        {/* no_session ─────────────────────────────────────────────────── */}
        {phase === 'no_session' && (
          <>
            <CheckCircle />
            <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 10 }}>
              Payment complete.
            </div>
            <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 28 }}>
              Log back in to activate your premium — your subscription is ready and waiting.
            </div>
            <button onClick={goToApp} style={btnPrimary}>Log in to MassIQ</button>
          </>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100dvh', background: '#0A0D0A', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          border: '2px solid #72B895', borderTopColor: 'transparent',
          animation: 'spin .9s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <BillingSuccessInner />
    </Suspense>
  );
}
