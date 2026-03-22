'use client';

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#0A0D0A', color: '#fff', padding: 32, textAlign: 'center',
    }}>
      <div style={{ fontSize: 18, marginBottom: 16, letterSpacing: '.08em', fontWeight: 700 }}>ERROR</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Something went wrong</div>
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>
        Reload the app to continue.
      </div>
      <button
        onClick={reset}
        style={{
          background: '#72B895', color: '#0A0D0A', border: 'none',
          padding: '12px 28px', borderRadius: 99, fontSize: 14,
          fontWeight: 700, cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}
