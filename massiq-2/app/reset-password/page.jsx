'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { updatePassword, requestPasswordReset } from '../../lib/supabase/client';

const C = {
  bg:     '#0A0D0A',
  card:   '#131713',
  green:  '#72B895',
  white:  '#F2F7F2',
  muted:  'rgba(242,247,242,0.52)',
  dimmed: 'rgba(242,247,242,0.28)',
  border: 'rgba(255,255,255,0.08)',
  red:    '#E57373',
  yellow: '#FFB74D',
};

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        border: `2px solid ${C.green}`, borderTopColor: 'transparent',
        animation: 'rp-spin .9s linear infinite', margin: '0 auto 20px',
      }} />
      <style>{`@keyframes rp-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ── Card shell ────────────────────────────────────────────────────────────────
function Card({ children }) {
  return (
    <div style={{
      minHeight: '100dvh', background: C.bg, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }}>
      <div style={{ maxWidth: 400, width: '100%' }}>
        {/* Brand mark */}
        <div style={{
          fontSize: 18, fontWeight: 900, color: C.green,
          letterSpacing: '-0.01em', marginBottom: 32, textAlign: 'center',
        }}>
          MASSIQ
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
function Input({ label, id, value, onChange, placeholder, autoComplete, hasError }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 13, color: C.muted }}>
        {label}
      </label>
      <input
        id={id}
        type="password"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{
          padding: '12px 14px', borderRadius: 10,
          background: 'rgba(255,255,255,0.05)',
          border: `1.5px solid ${hasError ? C.red : C.border}`,
          color: C.white, fontSize: 15, outline: 'none',
          width: '100%', boxSizing: 'border-box',
          transition: 'border-color .15s',
        }}
      />
      <style>{`input::placeholder { color: rgba(242,247,242,0.28); }`}</style>
    </div>
  );
}

// ── Primary button ────────────────────────────────────────────────────────────
function PrimaryButton({ children, onClick, disabled, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? 'rgba(114,184,149,0.4)' : C.green,
        color: '#0A0D0A', border: 'none', padding: '14px 32px',
        borderRadius: 99, fontSize: 15, fontWeight: 800,
        cursor: disabled ? 'default' : 'pointer', width: '100%',
        transition: 'background .15s',
      }}
    >
      {children}
    </button>
  );
}

// ── Error / notice banners ────────────────────────────────────────────────────
function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div style={{
      fontSize: 13, color: C.red,
      background: 'rgba(229,115,115,0.08)',
      border: `1px solid rgba(229,115,115,0.2)`,
      borderRadius: 8, padding: '10px 14px', lineHeight: 1.5,
    }}>
      {message}
    </div>
  );
}

function NoticeBanner({ message }) {
  if (!message) return null;
  return (
    <div style={{
      fontSize: 13, color: C.green,
      background: 'rgba(114,184,149,0.08)',
      border: `1px solid rgba(114,184,149,0.2)`,
      borderRadius: 8, padding: '10px 14px', lineHeight: 1.5,
    }}>
      {message}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────────────────────
export default function ResetPasswordPage() {
  const router = useRouter();

  // 'loading' | 'form' | 'success' | 'invalid'
  const [state, setState]             = useState('loading');
  const [accessToken, setAccessToken] = useState(null);

  // Form state
  const [password, setPassword]   = useState('');
  const [confirm,  setConfirm]    = useState('');
  const [touched,  setTouched]    = useState({ password: false, confirm: false });
  const [error,    setError]      = useState('');
  const [busy,     setBusy]       = useState(false);

  // Re-request state (shown on 'invalid' screen)
  const [reqEmail,   setReqEmail]   = useState('');
  const [reqBusy,    setReqBusy]    = useState(false);
  const [reqError,   setReqError]   = useState('');
  const [reqNotice,  setReqNotice]  = useState('');

  // ── Extract recovery token from URL on mount ──────────────────────────────
  useEffect(() => {
    try {
      // Supabase sends recovery URLs in two formats depending on PKCE / implicit flow:
      //   Implicit:  https://app.com/reset-password#access_token=TOKEN&type=recovery
      //   PKCE:      https://app.com/reset-password?token_hash=HASH&type=recovery
      const hash   = window.location.hash.replace(/^#/, '');
      const search = window.location.search.replace(/^\?/, '');

      const fromHash  = new URLSearchParams(hash);
      const fromQuery = new URLSearchParams(search);

      const type  = fromHash.get('type')  || fromQuery.get('type');
      const token = fromHash.get('access_token') || fromQuery.get('access_token');

      console.info('[reset-password] URL parse', { type, hasToken: !!token });

      if (type === 'recovery' && token) {
        setAccessToken(token);
        setState('form');
      } else {
        console.warn('[reset-password] No recovery token found in URL');
        setState('invalid');
      }
    } catch (e) {
      console.error('[reset-password] Token extraction error:', e);
      setState('invalid');
    }
  }, []);

  // ── Field-level validation ────────────────────────────────────────────────
  const passwordError = touched.password && password.length > 0 && password.length < 8
    ? 'Must be at least 8 characters'
    : null;

  const confirmError = touched.confirm && confirm.length > 0 && confirm !== password
    ? 'Passwords do not match'
    : null;

  const canSubmit = password.length >= 8 && confirm === password && !busy;

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setTouched({ password: true, confirm: true });

    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm)  { setError('Passwords do not match.'); return; }

    setBusy(true);
    setError('');
    try {
      await updatePassword(accessToken, password);
      setState('success');
      // Give the user 2.5 s to read the success message then forward to app
      setTimeout(() => router.replace('/app'), 2500);
    } catch (err) {
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('expired') || msg.includes('invalid') || msg.includes('not found')) {
        setError('This reset link has expired. Request a new one below.');
        setState('invalid');
      } else if (msg.includes('password') && msg.includes('short')) {
        setError('Password is too short — choose at least 8 characters.');
      } else if (msg.includes('same password')) {
        setError('New password must be different from your current password.');
      } else {
        setError(err?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }, [accessToken, password, confirm, router]);

  // ── Re-request a new reset email ──────────────────────────────────────────
  const handleReRequest = useCallback(async (e) => {
    e.preventDefault();
    if (!reqEmail.trim()) { setReqError('Enter your email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reqEmail.trim())) {
      setReqError('Enter a valid email address.');
      return;
    }
    setReqBusy(true);
    setReqError('');
    setReqNotice('');
    try {
      await requestPasswordReset(reqEmail.trim().toLowerCase());
      setReqNotice(`Check your inbox — we sent a new reset link to ${reqEmail.trim()}.`);
    } catch (err) {
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('rate') || msg.includes('too many')) {
        setReqError('Too many requests — wait a few minutes and try again.');
      } else if (msg.includes('not found') || msg.includes('invalid email')) {
        // Don't reveal whether the account exists
        setReqNotice(`If an account exists for ${reqEmail.trim()}, we sent a reset link.`);
      } else {
        setReqError(err?.message || 'Could not send reset email. Please try again.');
      }
    } finally {
      setReqBusy(false);
    }
  }, [reqEmail]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (state === 'loading') {
    return (
      <Card>
        <div style={{ textAlign: 'center' }}>
          <Spinner />
          <div style={{ color: C.muted, fontSize: 15 }}>Verifying link…</div>
        </div>
      </Card>
    );
  }

  if (state === 'success') {
    return (
      <Card>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(114,184,149,0.12)',
            border: `2px solid ${C.green}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px', fontSize: 30, color: C.green,
          }}>
            ✓
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 8 }}>
            Password updated
          </div>
          <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
            Your password has been changed. Taking you to the app…
          </div>
        </div>
      </Card>
    );
  }

  if (state === 'invalid') {
    return (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header */}
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 8 }}>
              Link expired or invalid
            </div>
            <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
              Password reset links expire after 1 hour and can only be used once.
              Request a new one below.
            </div>
          </div>

          {/* Re-request form */}
          <form onSubmit={handleReRequest} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="req-email" style={{ fontSize: 13, color: C.muted }}>
                Email address
              </label>
              <input
                id="req-email"
                type="email"
                value={reqEmail}
                onChange={e => { setReqEmail(e.target.value); setReqError(''); }}
                placeholder="you@example.com"
                autoComplete="email"
                style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  border: `1.5px solid ${reqError ? C.red : C.border}`,
                  color: C.white, fontSize: 15, outline: 'none',
                  width: '100%', boxSizing: 'border-box',
                }}
              />
            </div>

            <ErrorBanner message={reqError} />
            <NoticeBanner message={reqNotice} />

            <PrimaryButton type="submit" disabled={reqBusy}>
              {reqBusy ? 'Sending…' : 'Send new reset link'}
            </PrimaryButton>
          </form>

          <button
            onClick={() => router.push('/app')}
            style={{
              background: 'none', border: 'none', color: C.muted,
              fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
              padding: 0,
            }}
          >
            Back to login
          </button>
        </div>
      </Card>
    );
  }

  // state === 'form'
  return (
    <Card>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Header */}
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 6 }}>
            Set new password
          </div>
          <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>
            Choose a strong password for your MassIQ account.
          </div>
        </div>

        <Input
          id="rp-password"
          label="New password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError(''); }}
          onBlur={() => setTouched(t => ({ ...t, password: true }))}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          hasError={!!passwordError}
        />
        {passwordError && (
          <div style={{ fontSize: 12, color: C.red, marginTop: -10 }}>{passwordError}</div>
        )}

        <Input
          id="rp-confirm"
          label="Confirm password"
          value={confirm}
          onChange={e => { setConfirm(e.target.value); setError(''); }}
          onBlur={() => setTouched(t => ({ ...t, confirm: true }))}
          placeholder="Repeat your new password"
          autoComplete="new-password"
          hasError={!!confirmError}
        />
        {confirmError && (
          <div style={{ fontSize: 12, color: C.red, marginTop: -10 }}>{confirmError}</div>
        )}

        <ErrorBanner message={error} />

        <PrimaryButton type="submit" disabled={!canSubmit}>
          {busy ? 'Updating…' : 'Update password'}
        </PrimaryButton>
      </form>
    </Card>
  );
}
